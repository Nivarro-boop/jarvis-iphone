import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeGemini, transcribeOpenAi } from '../src/ai/transcribe'
import { cleanTranscript } from '../src/speech/record'

afterEach(() => vi.unstubAllGlobals())

describe('KI-Diktat', () => {
  it('räumt typische Zusätze der Modelle weg', () => {
    expect(cleanTranscript('Transkript: „Wie wird das Wetter morgen?“')).toBe('Wie wird das Wetter morgen?')
    expect(cleanTranscript('  (Stille)  ')).toBe('')
    expect(cleanTranscript('[no speech]')).toBe('')
    expect(cleanTranscript('Stell einen Timer')).toBe('Stell einen Timer')
  })

  it('schickt die Aufnahme als Inline-Audio an Gemini und liest nur den Text', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'denke', thought: true }, { text: 'Hallo James' }] } }] }))
    )
    vi.stubGlobal('fetch', fetchMock)
    const text = await transcribeGemini(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm;codecs=opus' }), 'k', 'gemini-2.5-flash', new AbortController().signal)
    expect(text).toBe('Hallo James')
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'audio/webm', data: 'AQID' })
  })

  it('nutzt bei OpenAI die Transkriptions-Schnittstelle mit Deutsch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'Guten Morgen' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await transcribeOpenAi(new Blob(['x'], { type: 'audio/mp4' }), 'k', new AbortController().signal)).toBe('Guten Morgen')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/audio/transcriptions')
    expect((init.body as FormData).get('language')).toBe('de')
    expect(((init.body as FormData).get('file') as File).name).toBe('diktat.m4a')
  })
})
