import type { Message, ProviderId } from './ai/types'

/**
 * Alles bleibt auf dem iPhone, im Speicher dieser Web-App. Kein eigener
 * Server: Der Schlüssel geht nur an den gewählten KI-Anbieter.
 *
 * localStorage kann im privaten Modus fehlen oder werfen. Dann läuft die App
 * trotzdem, vergisst aber beim Schließen alles.
 */

export interface Settings {
  provider: ProviderId
  keys: Record<ProviderId, string>
  models: Record<ProviderId, string>
  userName: string
  /** `voiceURI` der Systemstimme; leer heißt: beste deutsche automatisch. */
  voice: string
  rate: number
  speak: boolean
  /** Nach der Antwort gleich wieder zuhören — wie ein Gespräch. */
  conversation: boolean
  /** `ki`: Aufnahme, Abschrift durch die KI (verlässlich). `ios`: Diktierfunktion des Browsers (live mitlesen). */
  dictation: 'ki' | 'ios'
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5-mini'
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  keys: { gemini: '', openai: '' },
  models: { ...DEFAULT_MODELS },
  userName: 'Hans',
  voice: '',
  rate: 1.05,
  speak: true,
  conversation: false,
  dictation: 'ki'
}

const KEYS = { settings: 'james.settings.v1', history: 'james.history.v1', memory: 'james.memory.v1' }
const MAX_HISTORY = 40
const MAX_MEMORY = 60

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Voll oder gesperrt: dann eben nur bis zum Schließen.
  }
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(KEYS.settings) ?? {}
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    provider: saved.provider === 'openai' ? 'openai' : 'gemini',
    keys: { ...DEFAULT_SETTINGS.keys, ...saved.keys },
    models: { ...DEFAULT_SETTINGS.models, ...saved.models },
    dictation: saved.dictation === 'ios' ? 'ios' : 'ki',
    rate: clamp(Number(saved.rate ?? DEFAULT_SETTINGS.rate), 0.7, 1.5)
  }
}

export function saveSettings(settings: Settings): void {
  write(KEYS.settings, settings)
}

export function loadHistory(): Message[] {
  const saved = read<Message[]>(KEYS.history)
  return Array.isArray(saved) ? saved : []
}

export function saveHistory(messages: Message[]): void {
  write(KEYS.history, trimHistory(messages))
}

/**
 * Kürzt auf die letzten Beiträge, beginnt aber immer bei einer Nutzerfrage —
 * ein Werkzeugergebnis ohne seinen Aufruf davor lehnen beide Anbieter ab.
 */
export function trimHistory(messages: Message[], max = MAX_HISTORY): Message[] {
  if (messages.length <= max) return messages
  let start = messages.length - max
  while (start < messages.length && messages[start].role !== 'user') start++
  return messages.slice(start)
}

export function loadMemory(): string[] {
  const saved = read<string[]>(KEYS.memory)
  return Array.isArray(saved) ? saved.filter(f => typeof f === 'string') : []
}

export function remember(fact: string): string[] {
  const clean = fact.trim().slice(0, 300)
  const memory = loadMemory().filter(f => f.toLowerCase() !== clean.toLowerCase())
  if (clean) memory.push(clean)
  const next = memory.slice(-MAX_MEMORY)
  write(KEYS.memory, next)
  return next
}

export function forget(keyword: string): { removed: string[]; memory: string[] } {
  const needle = keyword.trim().toLowerCase()
  const memory = loadMemory()
  const removed = needle ? memory.filter(f => f.toLowerCase().includes(needle)) : []
  const next = memory.filter(f => !removed.includes(f))
  write(KEYS.memory, next)
  return { removed, memory: next }
}

export function clearAll(): void {
  try {
    localStorage.removeItem(KEYS.history)
    localStorage.removeItem(KEYS.memory)
  } catch {
    // nichts zu tun
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
}
