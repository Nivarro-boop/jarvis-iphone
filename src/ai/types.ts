/**
 * Ein neutrales Gesprächsformat. Jeder Anbieter übersetzt es in sein eigenes
 * und zurück; der Rest der App kennt nur dieses hier.
 */

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export type Message =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text: string
      toolCalls?: ToolCall[]
      /**
       * Die Antwort genau so, wie der Anbieter sie geschickt hat. Gemini will
       * seine eigenen Teile samt Signaturen zurück, sonst lehnt es den
       * nächsten Werkzeugschritt ab.
       */
      raw?: unknown
    }
  | { role: 'tool'; callId: string; name: string; result: unknown }

export interface ToolSpec {
  name: string
  description: string
  /** JSON-Schema der Argumente (Untermenge, die beide Anbieter verstehen). */
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; call: ToolCall }
  | { type: 'done'; raw?: unknown }

export interface ChatRequest {
  system: string
  messages: Message[]
  tools: ToolSpec[]
  model: string
  apiKey: string
  signal?: AbortSignal
}

export interface Provider {
  id: ProviderId
  label: string
  stream(request: ChatRequest): AsyncGenerator<StreamEvent>
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>
}

export type ProviderId = 'gemini' | 'openai'

/** Fehler, den man dem Nutzer so vorlesen kann. */
export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Für `fetch(...).catch(...)`: Abbruch bleibt Abbruch, alles andere heißt offline. */
export function failedFetch(provider: string, signal?: AbortSignal) {
  return (error: unknown): never => {
    if (signal?.aborted) throw error
    throw new ProviderError(`Keine Verbindung zu ${provider}. Ist das iPhone online?`)
  }
}

export function friendlyHttpError(provider: string, status: number, body: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(`${provider} lehnt den Schlüssel ab. Bitte in den Einstellungen prüfen.`, status)
  }
  if (status === 429) {
    return new ProviderError(`${provider} sagt: zu viele Anfragen oder Guthaben aufgebraucht. Kurz warten.`, status)
  }
  if (status === 404) {
    return new ProviderError(`${provider} kennt dieses Modell nicht. In den Einstellungen ein anderes wählen.`, status)
  }
  const detail = body.slice(0, 160).replace(/\s+/g, ' ').trim()
  return new ProviderError(`${provider} meldet Fehler ${status}${detail ? `: ${detail}` : ''}`, status)
}
