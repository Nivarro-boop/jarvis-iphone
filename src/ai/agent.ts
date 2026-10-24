import { gemini } from './gemini'
import { openai } from './openai'
import type { Message, Provider, ProviderId, ToolCall, ToolSpec } from './types'

export const PROVIDERS: Record<ProviderId, Provider> = { gemini, openai }

/** Wie oft James hintereinander Werkzeuge benutzen darf, bevor er antworten muss. */
const MAX_ROUNDS = 5

export interface TurnOptions {
  provider: Provider
  apiKey: string
  model: string
  system: string
  history: Message[]
  userText: string
  tools: ToolSpec[]
  runTool(call: ToolCall): Promise<unknown>
  onText(delta: string): void
  onTool(call: ToolCall): void
  signal?: AbortSignal
}

/**
 * Ein Gesprächszug: Frage rein, Antwort streamen, Werkzeuge ausführen, bis
 * eine Antwort ohne Werkzeugwunsch kommt. Gibt den neuen Verlauf zurück — auch
 * bei Abbruch das, was bis dahin stand, damit nichts halb Verlorenes bleibt.
 */
export async function runTurn(options: TurnOptions): Promise<{ history: Message[]; answer: string }> {
  const { provider, apiKey, model, system, tools, signal } = options
  const history: Message[] = [...options.history, { role: 'user', text: options.userText }]
  let answer = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let text = ''
    const calls: ToolCall[] = []
    let raw: unknown
    // In der letzten Runde keine Werkzeuge mehr anbieten: dann muss er antworten.
    const offered = round === MAX_ROUNDS - 1 ? [] : tools
    for await (const event of provider.stream({ system, messages: history, tools: offered, model, apiKey, signal })) {
      if (event.type === 'text') {
        text += event.text
        options.onText(event.text)
      } else if (event.type === 'tool') {
        calls.push(event.call)
      } else {
        raw = event.raw
      }
    }
    history.push({ role: 'assistant', text, ...(calls.length ? { toolCalls: calls } : {}), ...(raw !== undefined ? { raw } : {}) })
    answer += text
    if (!calls.length) break

    for (const call of calls) {
      options.onTool(call)
      const result = await options.runTool(call)
      history.push({ role: 'tool', callId: call.id, name: call.name, result })
    }
  }
  return { history, answer }
}

/** Sucht aus der Modellliste eines Kontos ein schnelles, passendes Modell. */
export function pickModel(provider: ProviderId, available: string[], current: string): string {
  if (available.includes(current)) return current
  const prefer = provider === 'gemini'
    ? [/^gemini-[\d.]+-flash$/, /^gemini-.*flash(?!.*lite)/, /^gemini-.*flash/, /^gemini/]
    : [/^gpt-[\d.]+-mini$/, /^gpt-.*mini/, /^gpt-[\d.]+$/, /^gpt-/]
  for (const pattern of prefer) {
    // Neueste Fassung zuerst: Versionsnummern sortieren absteigend.
    const hits = available.filter(id => pattern.test(id) && !/preview|exp/.test(id)).sort(byVersionDesc)
    if (hits.length) return hits[0]
  }
  return available[0] ?? current
}

function byVersionDesc(a: string, b: string): number {
  const va = Number(/(\d+(?:\.\d+)?)/.exec(a)?.[1] ?? 0)
  const vb = Number(/(\d+(?:\.\d+)?)/.exec(b)?.[1] ?? 0)
  return vb - va || a.localeCompare(b)
}
