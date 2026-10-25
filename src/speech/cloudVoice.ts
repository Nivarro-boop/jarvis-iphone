import type { ProviderId } from '../ai/types'
import { speakable } from './sentences'

/**
 * KI-Stimme: Sätze werden von Gemini oder OpenAI gesprochen und über ein
 * <audio>-Element abgespielt.
 *
 * Warum nicht nur die iPhone-Stimme (speechSynthesis): Die ist am iPhone im
 * Lautlos-Modus stumm, hängt in Home-Bildschirm-Apps gern, und klingt
 * blechern. Ein <audio>-Element gilt dagegen als Medienwiedergabe — es ist
 * auch bei Lautlos-Schalter zu hören, wie Musik oder ein Video.
 *
 * Damit iOS später ohne Berührung abspielen darf, wird dasselbe Element bei
 * der ersten Berührung einmal mit Stille gestartet (`unlock`) und danach nur
 * noch mit neuen Quellen bespielt.
 */

export interface VoiceSource {
  provider: ProviderId
  apiKey: string
  /** Stimme des Anbieters, z. B. „Charon“ (Gemini) oder „onyx“ (OpenAI). */
  voice: string
}


export const GEMINI_VOICES = ['Charon', 'Kore', 'Puck', 'Fenrir', 'Aoede', 'Orus']
export const OPENAI_VOICES = ['onyx', 'ash', 'sage', 'coral', 'alloy', 'echo']

const STYLE = 'Sprich ruhig, freundlich und klar auf Deutsch, wie ein britischer Butler mit trockenem Humor.'

let geminiModel: string | null = null

/** Das TTS-Modell aus dem Konto suchen; Namen ändern sich bei Google häufig. */
async function findGeminiTtsModel(apiKey: string, signal: AbortSignal): Promise<string> {
  if (geminiModel) return geminiModel
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { signal, headers: { 'x-goog-api-key': apiKey } })
    if (response.ok) {
      const json = (await response.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      const names = (json.models ?? []).map(m => m.name.replace(/^models\//, '')).filter(n => /tts/.test(n))
      geminiModel = names.find(n => /flash/.test(n)) ?? names[0] ?? null
    }
  } catch (error) {
    if (signal.aborted) throw error
  }
  geminiModel ??= 'gemini-2.5-flash-preview-tts'
  return geminiModel
}

/** Rohes 16-bit-PCM in eine abspielbare WAV-Datei verpacken. */
export function pcmToWav(pcm: Uint8Array<ArrayBuffer>, sampleRate = 24_000): Blob {
  const header = new DataView(new ArrayBuffer(44))
  const write = (offset: number, text: string) => [...text].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  header.setUint32(4, 36 + pcm.byteLength, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, 1, true)
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  write(36, 'data')
  header.setUint32(40, pcm.byteLength, true)
  return new Blob([header.buffer, pcm], { type: 'audio/wav' })
}

function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function synthesize(text: string, source: VoiceSource, signal: AbortSignal): Promise<Blob> {
  if (source.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${source.apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: source.voice || 'onyx', input: text, instructions: STYLE, response_format: 'mp3' })
    })
    if (!response.ok) throw new Error(`OpenAI-Stimme: Fehler ${response.status}`)
    return response.blob()
  }
  const model = await findGeminiTtsModel(source.apiKey, signal)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': source.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE} Sag: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: source.voice || 'Charon' } } }
      }
    })
  })
  if (!response.ok) {
    if (response.status === 404) geminiModel = null
    throw new Error(`Gemini-Stimme: Fehler ${response.status}`)
  }
  const json = (await response.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }
  const inline = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!inline?.data) throw new Error('Gemini-Stimme: keine Audiodaten')
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? '')?.[1] ?? 24_000)
  return pcmToWav(fromBase64(inline.data), rate)
}

/**
 * Spricht eine Antwort mit möglichst wenigen Anfragen: Der erste Satz geht
 * sofort raus (schneller Beginn), alles, was währenddessen nachkommt, wird
 * gesammelt und als ein Stück erzeugt — vorab, sobald die Antwort komplett
 * ist (`flush`), sonst spätestens wenn der erste Satz zu Ende ist.
 */
export class CloudVoice {
  private audio: HTMLAudioElement
  private playing = false
  private pending = ''
  private prepared: { text: string; clip: Promise<Blob | null> } | null = null
  private controller = new AbortController()
  private onIdle: (() => void) | null = null
  private url: string | null = null
  private unlocked = false

  constructor(
    private source: () => VoiceSource | null,
    /** Wenn die KI-Stimme scheitert: Text anders sprechen (iPhone-Stimme). */
    private fallback: (text: string) => void,
    private onError: (message: string) => void
  ) {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.setAttribute('playsinline', '')
    this.audio.addEventListener('ended', () => {
      if (this.playing) void this.next()
    })
    this.audio.addEventListener('error', () => {
      if (this.playing) void this.next()
    })
  }

  /** In jeder Berührung aufrufen; schaltet das Element für spätere Wiedergaben frei. */
  unlock(): void {
    if (this.unlocked || this.playing) return
    this.unlocked = true
    // Eine Zehntelsekunde echte Stille: Eine leere Datei zählt für iOS nicht als Wiedergabe.
    this.release()
    this.url = URL.createObjectURL(pcmToWav(new Uint8Array(1600), 8000))
    this.audio.src = this.url
    void this.audio.play().catch(() => {
      this.unlocked = false
    })
  }

  get available(): boolean {
    return this.source() !== null
  }

  get speaking(): boolean {
    return this.playing || this.pending.length > 0 || this.prepared !== null
  }

  say(text: string): void {
    const clean = speakable(text)
    if (!clean) return
    if (!this.source()) {
      this.fallback(clean)
      return
    }
    if (!this.playing) {
      this.playing = true
      void this.play({ text: clean, clip: this.make(clean) })
    } else {
      this.pending = this.pending ? `${this.pending} ${clean}` : clean
    }
  }

  /** Die Antwort ist komplett: den Rest jetzt schon erzeugen, damit keine Pause entsteht. */
  flush(): void {
    if (!this.pending) return
    if (!this.playing) {
      this.playing = true
      const text = this.pending
      this.pending = ''
      void this.play({ text, clip: this.make(text) })
      return
    }
    if (!this.prepared) {
      this.prepared = { text: this.pending, clip: this.make(this.pending) }
      this.pending = ''
    }
  }

  whenIdle(callback: () => void): void {
    this.onIdle = callback
    if (!this.speaking) this.idle()
  }

  stop(): void {
    this.controller.abort()
    this.controller = new AbortController()
    this.pending = ''
    this.prepared = null
    this.playing = false
    this.onIdle = null
    this.audio.pause()
    this.release()
  }

  private make(text: string): Promise<Blob | null> {
    const source = this.source()
    const signal = this.controller.signal
    if (!source) return Promise.resolve(null)
    return synthesize(text, source, signal).catch(error => {
      if (!signal.aborted) this.onError(error instanceof Error ? error.message : String(error))
      return null
    })
  }

  private async next(): Promise<void> {
    this.release()
    let item = this.prepared
    this.prepared = null
    if (!item && this.pending) {
      item = { text: this.pending, clip: this.make(this.pending) }
      this.pending = ''
    }
    if (!item) {
      this.playing = false
      this.idle()
      return
    }
    await this.play(item)
  }

  private async play(item: { text: string; clip: Promise<Blob | null> }): Promise<void> {
    const signal = this.controller.signal
    const blob = await item.clip
    if (signal.aborted) return
    if (!blob) {
      // Erzeugen ging schief: diesen Teil mit der iPhone-Stimme, dann weiter.
      this.fallback(item.text)
      await this.next()
      return
    }
    this.release()
    this.url = URL.createObjectURL(blob)
    this.audio.src = this.url
    try {
      await this.audio.play()
    } catch {
      if (signal.aborted) return
      // Ohne Freigabe durch eine Berührung spielt iOS nicht ab.
      this.fallback(item.text)
      await this.next()
    }
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }

  private idle(): void {
    const callback = this.onIdle
    this.onIdle = null
    callback?.()
  }
}
