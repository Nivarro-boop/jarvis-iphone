import { readSse } from './sse'
import { failedFetch, friendlyHttpError, ProviderError, type ChatRequest, type Message, type Provider, type StreamEvent } from './types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/** Gemini über die öffentliche REST-Schnittstelle. Der kostenlose Schlüssel reicht. */
export const gemini: Provider = {
  id: 'gemini',
  label: 'Google Gemini',

  async *stream({ system, messages, tools, model, apiKey, signal }: ChatRequest): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: toGemini(messages),
        ...(tools.length
          ? { tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }] }
          : {})
      })
    }).catch(failedFetch('Gemini', signal))
    if (!response.ok || !response.body) throw friendlyHttpError('Gemini', response.status, await response.text().catch(() => ''))

    const raw: GeminiPart[] = []
    let blocked: string | undefined
    for await (const data of readSse(response.body, signal)) {
      let chunk: GeminiChunk
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      blocked ??= chunk.promptFeedback?.blockReason
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        raw.push(part)
        if (part.text && !part.thought) yield { type: 'text', text: part.text }
        if (part.functionCall) {
          yield {
            type: 'tool',
            call: { id: part.functionCall.id ?? crypto.randomUUID(), name: part.functionCall.name, args: part.functionCall.args ?? {} }
          }
        }
      }
    }
    if (!raw.length && blocked) throw new ProviderError('Gemini hat die Anfrage abgelehnt. Bitte anders formulieren.')
    yield { type: 'done', raw }
  },

  async listModels(apiKey, signal) {
    const response = await fetch(`${BASE}/models?pageSize=200`, { signal, headers: { 'x-goog-api-key': apiKey } }).catch(
      failedFetch('Gemini', signal)
    )
    if (!response.ok) throw friendlyHttpError('Gemini', response.status, await response.text().catch(() => ''))
    const json = (await response.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    return (json.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(id => id.startsWith('gemini') && !/(embedding|tts|image|live|audio|aqa)/.test(id))
      .sort()
  }
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
  promptFeedback?: { blockReason?: string }
}

export function toGemini(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.text }] })
    } else if (message.role === 'assistant') {
      const parts = Array.isArray(message.raw) && message.raw.length
        ? (message.raw as GeminiPart[])
        : [
            ...(message.text ? [{ text: message.text }] : []),
            ...(message.toolCalls ?? []).map(call => ({ functionCall: { name: call.name, args: call.args } }))
          ]
      if (parts.length) contents.push({ role: 'model', parts })
    } else {
      // Alle Antworten auf einen Werkzeugschritt gehören in einen Beitrag.
      const part: GeminiPart = { functionResponse: { name: message.name, response: { result: message.result } } }
      const last = contents[contents.length - 1]
      if (last?.role === 'user' && last.parts.every(p => p.functionResponse)) last.parts.push(part)
      else contents.push({ role: 'user', parts: [part] })
    }
  }
  return contents
}
