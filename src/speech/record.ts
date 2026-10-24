import type { ListenHandlers } from './listen'

/**
 * KI-Diktat: Aufnahme mit dem Mikrofon, Abschrift durch die gewählte KI.
 *
 * Warum neben der Web-Speech-Erkennung: Die Diktierfunktion von iOS ist in
 * einer Web-App auf dem Home-Bildschirm unzuverlässig (bricht ab, liefert
 * nichts, fragt ständig nach dem Mikrofon), und in Firefox fehlt sie ganz.
 * Aufnehmen kann dagegen jeder Browser, und Gemini bzw. OpenAI schreiben
 * deutsche Sprache sehr genau ab — auch Namen und Fachwörter.
 *
 * Ende der Aufnahme: Tippen, oder automatisch nach kurzer Stille, sobald
 * etwas gesagt wurde. Höchstens 45 Sekunden.
 */

export type Transcribe = (audio: Blob, signal: AbortSignal) => Promise<string>

const SILENCE_MS = 1300
const MAX_MS = 45_000
/** Unter diesem Pegel (RMS) gilt es als Stille; wird an die Raumruhe angepasst. */
const MIN_THRESHOLD = 0.015

export interface RecordHandlers extends ListenHandlers {
  /** Lautstärke 0…1, etwa 30-mal pro Sekunde — für die Kugel. */
  onLevel?(level: number): void
  /** Aufnahme fertig, jetzt wird abgeschrieben. */
  onTranscribing?(): void
  /** Keine Pegelmessung möglich: Ende nur per Tippen. */
  onNoLevel?(): void
}

function pickMime(): string {
  const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return options.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) ?? ''
}

export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private context: AudioContext | null = null
  private frame = 0
  private timer: number | undefined
  private abortController: AbortController | null = null
  private cancelled = false

  constructor(private transcribe: Transcribe) {}

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  get listening(): boolean {
    return this.recorder?.state === 'recording'
  }

  async start(handlers: RecordHandlers): Promise<void> {
    this.abort()
    this.cancelled = false
    // Noch innerhalb der Berührung anlegen: Nach dem Warten aufs Mikrofon gibt
    // iOS einen neuen Audiokontext nicht mehr frei, und ohne Pegel keine Stilleerkennung.
    let context: AudioContext | null = null
    try {
      context = new AudioContext()
      void context.resume().catch(() => undefined)
    } catch {
      context = null
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      })
    } catch (error) {
      void context?.close().catch(() => undefined)
      const name = (error as DOMException)?.name
      handlers.onError(
        name === 'NotAllowedError'
          ? 'Mikrofon nicht erlaubt. iPhone: Einstellungen → Safari → Mikrofon → Erlauben. PC: Schloss-Symbol in der Adresszeile.'
          : 'Kein Mikrofon gefunden.'
      )
      return
    }
    const mime = pickMime()
    const recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.recorder = recorder
    const chunks: Blob[] = []
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data)
    }

    let spoke = false
    recorder.onstop = async () => {
      this.release()
      if (this.cancelled) return
      if (!spoke || !chunks.length) return handlers.onFinal('')
      handlers.onTranscribing?.()
      const controller = new AbortController()
      this.abortController = controller
      try {
        const text = await this.transcribe(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' }), controller.signal)
        if (!controller.signal.aborted) handlers.onFinal(cleanTranscript(text))
      } catch (error) {
        if (!controller.signal.aborted) handlers.onError(error instanceof Error ? error.message : String(error))
      }
    }
    recorder.start(250)

    // Pegel messen: für die Kugel und um Stille zu erkennen.
    try {
      if (!context) throw new Error('kein Audiokontext')
      this.context = context
      if (context.state !== 'running') await Promise.race([context.resume(), new Promise(r => setTimeout(r, 300))])
      if (context.state !== 'running') throw new Error('Audiokontext schläft')
      const analyser = this.context.createAnalyser()
      analyser.fftSize = 1024
      this.context.createMediaStreamSource(this.stream).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      let floor = 0.01
      let lastLoud = performance.now()
      const started = performance.now()
      const tick = () => {
        if (recorder.state !== 'recording') return
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += v * v
        const rms = Math.sqrt(sum / data.length)
        // Raumruhe langsam nachführen, damit ein Lüfter nicht als Sprache zählt.
        if (rms < floor * 1.5) floor = floor * 0.95 + rms * 0.05
        const threshold = Math.max(MIN_THRESHOLD, floor * 2.5)
        const now = performance.now()
        if (rms > threshold) {
          spoke = true
          lastLoud = now
        }
        handlers.onLevel?.(Math.min(1, rms * 12))
        if ((spoke && now - lastLoud > SILENCE_MS) || now - started > MAX_MS) {
          this.stop()
          return
        }
        // Nach acht Sekunden ohne ein Wort: aufgeben statt ewig zu lauschen.
        if (!spoke && now - started > 8000) {
          this.stop()
          return
        }
        this.frame = requestAnimationFrame(tick)
      }
      this.frame = requestAnimationFrame(tick)
    } catch {
      // Ohne Pegel: Wer spricht, tippt zum Beenden. Sicherheitshalber gilt es als gesprochen.
      handlers.onNoLevel?.()
      spoke = true
      this.timer = window.setTimeout(() => this.stop(), MAX_MS)
    }
  }

  /** Aufnahme beenden und abschreiben. */
  stop(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop()
  }

  /** Alles verwerfen, auch eine laufende Abschrift. */
  abort(): void {
    this.cancelled = true
    this.abortController?.abort()
    this.abortController = null
    if (this.recorder?.state === 'recording') this.recorder.stop()
    else this.release()
  }

  private release(): void {
    cancelAnimationFrame(this.frame)
    clearTimeout(this.timer)
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = null
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }
}

/** Was Modelle gern zusätzlich schreiben: Anführungszeichen, „Transkript:“, Platzhalter für Stille. */
export function cleanTranscript(text: string): string {
  const clean = text
    .trim()
    .replace(/^(transkript|transcript|abschrift)\s*:\s*/i, '')
    .replace(/^["„“'»«]+|["„“'»«]+$/g, '')
    .trim()
  return /^\(?(stille|keine sprache|no speech|\[.*\])\)?\.?$/i.test(clean) ? '' : clean
}
