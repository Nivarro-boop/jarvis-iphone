import { afterEach, describe, expect, it, vi } from 'vitest'
import { pcmToWav, synthesize } from '../src/speech/cloudVoice'

afterEach(() => vi.unstubAllGlobals())

describe('KI-Stimme', () => {
  it('verpackt PCM als gültige WAV-Datei', async () => {
    const wav = pcmToWav(new Uint8Array([1, 0, 2, 0]), 24_000)
    const bytes = new Uint8Array(await wav.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint32(40, true)).toBe(4)
    expect(bytes.byteLength).toBe(48)
    expect(wav.type).toBe('audio/wav')
  })

  it('fordert bei Gemini Audio an und liest die Abtastrate aus dem Typ', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url)
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3-flash-tts' }, { name: 'models/gemini-3-flash' }] }))
      const body = JSON.parse(init!.body as string)
      expect(body.generationConfig.responseModalities).toEqual(['AUDIO'])
      expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=16000', data: 'AQACAA==' } }] } }] }))
    }))
    const wav = await synthesize('Hallo', { provider: 'gemini', apiKey: 'k', voice: 'Kore' }, new AbortController().signal)
    expect(calls[1]).toContain('gemini-3-flash-tts:generateContent')
    const view = new DataView(await wav.arrayBuffer())
    expect(view.getUint32(24, true)).toBe(16_000)
  })
})
