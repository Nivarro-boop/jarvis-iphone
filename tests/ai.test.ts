import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickModel, runTurn } from '../src/ai/agent'
import { gemini, toGemini } from '../src/ai/gemini'
import { openai } from '../src/ai/openai'
import { readSse } from '../src/ai/sse'
import type { Message, Provider, StreamEvent } from '../src/ai/types'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iterable) out.push(item)
  return out
}

afterEach(() => vi.unstubAllGlobals())

describe('readSse', () => {
  it('setzt Ereignisse über Blockgrenzen hinweg zusammen', async () => {
    const events = await collect(readSse(streamOf('data: {"a"', ':1}\n\nda', 'ta: zwei\r\n\r\ndata: [DONE]')))
    expect(events).toEqual(['{"a":1}', 'zwei', '[DONE]'])
  })
})

describe('OpenAI', () => {
  it('streamt Text und setzt Werkzeugaufrufe aus Bruchstücken zusammen', async () => {
    const sse = [
      { choices: [{ delta: { content: 'Moment' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'wet', arguments: '{"ort":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'ter', arguments: '"Wien"}' } }] } }] }
    ].map(c => `data: ${JSON.stringify(c)}\n\n`)
    const fetchMock = vi.fn(async () => new Response(streamOf(...sse, 'data: [DONE]\n\n')))
    vi.stubGlobal('fetch', fetchMock)
    const events = await collect(openai.stream({ system: 's', messages: [{ role: 'user', text: 'hi' }], tools: [], model: 'm', apiKey: 'k' }))
    expect(events).toEqual([
      { type: 'text', text: 'Moment' },
      { type: 'tool', call: { id: 'c1', name: 'wetter', args: { ort: 'Wien' } } },
      { type: 'done' }
    ])
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: 's' })
    expect(body.tools).toBeUndefined()
  })

  it('übersetzt HTTP-Fehler in verständliche Sätze', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    await expect(collect(openai.stream({ system: '', messages: [], tools: [], model: 'm', apiKey: 'x' }))).rejects.toThrow(/Schlüssel/)
  })
})

describe('Gemini', () => {
  it('gibt Teile samt Signatur unverändert für die nächste Runde zurück', async () => {
    const parts = [{ text: 'Denke', thought: true }, { functionCall: { name: 'wetter', args: {} }, thoughtSignature: 'sig' }]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamOf(`data: ${JSON.stringify({ candidates: [{ content: { parts } }] })}\n\n`))))
    const events = await collect(gemini.stream({ system: '', messages: [], tools: [], model: 'g', apiKey: 'k' }))
    expect(events[0]).toMatchObject({ type: 'tool', call: { name: 'wetter', args: {} } })
    expect(events.at(-1)).toEqual({ type: 'done', raw: parts })
  })

  it('fasst Werkzeugantworten zu einem Beitrag zusammen', () => {
    const history: Message[] = [
      { role: 'user', text: 'Wetter?' },
      { role: 'assistant', text: '', toolCalls: [{ id: '1', name: 'a', args: {} }, { id: '2', name: 'b', args: {} }] },
      { role: 'tool', callId: '1', name: 'a', result: 1 },
      { role: 'tool', callId: '2', name: 'b', result: 2 }
    ]
    const contents = toGemini(history)
    expect(contents).toHaveLength(3)
    expect(contents[1]).toEqual({ role: 'model', parts: [{ functionCall: { name: 'a', args: {} } }, { functionCall: { name: 'b', args: {} } }] })
    expect(contents[2].parts.map(p => p.functionResponse?.name)).toEqual(['a', 'b'])
  })
})

describe('runTurn', () => {
  it('führt Werkzeuge aus und fragt dann erneut', async () => {
    const rounds: StreamEvent[][] = [
      [{ type: 'tool', call: { id: 't', name: 'wetter', args: { ort: 'Graz' } } }, { type: 'done' }],
      [{ type: 'text', text: 'Sonnig, ' }, { type: 'text', text: '20 Grad.' }, { type: 'done' }]
    ]
    const seen: Message[][] = []
    const provider: Provider = {
      id: 'gemini',
      label: 'Test',
      async *stream(request) {
        seen.push(structuredClone(request.messages))
        yield* rounds.shift() ?? []
      },
      listModels: async () => []
    }
    const texts: string[] = []
    const runTool = vi.fn(async () => ({ temperatur: 20 }))
    const result = await runTurn({
      provider, apiKey: 'k', model: 'm', system: 's', history: [], userText: 'Wetter in Graz?', tools: [],
      runTool, onText: t => texts.push(t), onTool: () => undefined
    })
    expect(runTool).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Sonnig, 20 Grad.')
    expect(texts.join('')).toBe('Sonnig, 20 Grad.')
    expect(seen[1].at(-1)).toEqual({ role: 'tool', callId: 't', name: 'wetter', result: { temperatur: 20 } })
    expect(result.history.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })
})

describe('pickModel', () => {
  it('behält ein verfügbares Modell', () => {
    expect(pickModel('gemini', ['gemini-2.5-flash', 'gemini-3-flash'], 'gemini-2.5-flash')).toBe('gemini-2.5-flash')
  })
  it('nimmt sonst das neueste schnelle Modell, ohne Vorschau', () => {
    expect(pickModel('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-flash', 'gemini-3.5-flash-preview'], 'weg')).toBe('gemini-3-flash')
    expect(pickModel('openai', ['gpt-4o', 'gpt-5-mini', 'gpt-6-mini', 'o3'], 'weg')).toBe('gpt-6-mini')
  })
})
