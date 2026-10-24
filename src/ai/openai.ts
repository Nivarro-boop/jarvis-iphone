import { readSse } from './sse'
import { failedFetch, friendlyHttpError, type ChatRequest, type Message, type Provider, type StreamEvent, type ToolCall } from './types'

const BASE = 'https://api.openai.com/v1'

/** Chat Completions mit Streaming und Werkzeugen. Läuft direkt aus dem Browser. */
export const openai: Provider = {
  id: 'openai',
  label: 'OpenAI',

  async *stream({ system, messages, tools, model, apiKey, signal }: ChatRequest): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages.map(toOpenAi)],
        ...(tools.length
          ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
          : {})
      })
    }).catch(failedFetch('OpenAI', signal))
    if (!response.ok || !response.body) throw friendlyHttpError('OpenAI', response.status, await response.text().catch(() => ''))

    // Werkzeugaufrufe kommen in Bruchstücken, nach `index` sortiert.
    const pending = new Map<number, { id: string; name: string; args: string }>()
    for await (const data of readSse(response.body, signal)) {
      if (data === '[DONE]') break
      let chunk: OpenAiChunk
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      const delta = chunk.choices?.[0]?.delta
      if (delta?.content) yield { type: 'text', text: delta.content }
      for (const part of delta?.tool_calls ?? []) {
        const entry = pending.get(part.index) ?? { id: '', name: '', args: '' }
        if (part.id) entry.id = part.id
        if (part.function?.name) entry.name += part.function.name
        if (part.function?.arguments) entry.args += part.function.arguments
        pending.set(part.index, entry)
      }
    }
    for (const [, entry] of [...pending].sort(([a], [b]) => a - b)) {
      yield { type: 'tool', call: { id: entry.id || crypto.randomUUID(), name: entry.name, args: parseArgs(entry.args) } }
    }
    yield { type: 'done' }
  },

  async listModels(apiKey, signal) {
    const response = await fetch(`${BASE}/models`, { signal, headers: { Authorization: `Bearer ${apiKey}` } }).catch(failedFetch('OpenAI', signal))
    if (!response.ok) throw friendlyHttpError('OpenAI', response.status, await response.text().catch(() => ''))
    const json = (await response.json()) as { data?: { id: string }[] }
    return (json.data ?? [])
      .map(m => m.id)
      .filter(id => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|image|tts|transcribe|search|embedding|instruct)/.test(id))
      .sort()
  }
}

interface OpenAiChunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
    }
  }[]
}

function toOpenAi(message: Message): Record<string, unknown> {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.text }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.text || null,
        ...(message.toolCalls?.length
          ? { tool_calls: message.toolCalls.map(toolCallToOpenAi) }
          : {})
      }
    case 'tool':
      return { role: 'tool', tool_call_id: message.callId, content: JSON.stringify(message.result) }
  }
}

function toolCallToOpenAi(call: ToolCall) {
  return { id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }
}

export function parseArgs(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}
