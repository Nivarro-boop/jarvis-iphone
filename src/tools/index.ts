import type { ToolSpec } from '../ai/types'
import { forget, remember } from '../store'
import { currentPosition, geocode, weather } from './weather'
import { wikipedia } from './wikipedia'

/**
 * Was James auf dem iPhone selbst tun kann. Alles ohne eigenen Server und
 * ohne weitere Schlüssel — offene Daten und das, was der Browser darf.
 */

export interface ToolContext {
  signal?: AbortSignal
  /** Kurzer Wecker, solange die App offen ist. */
  startTimer(seconds: number, label: string): void
}

interface Tool {
  spec: ToolSpec
  /** Satz für die Anzeige, solange das Werkzeug läuft. */
  busy: string
  run(args: Record<string, unknown>, context: ToolContext): Promise<unknown>
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const TOOLS: Tool[] = [
  {
    spec: {
      name: 'wetter',
      description: 'Aktuelles Wetter und Vorhersage für heute bis übermorgen. Ohne Ort: Standort des iPhones.',
      parameters: { type: 'object', properties: { ort: { type: 'string', description: 'Stadt oder Ort, optional' } } }
    },
    busy: 'schaut aufs Wetter',
    async run(args, { signal }) {
      const name = text(args.ort)
      const place = name ? await geocode(name, signal) : await currentPosition()
      if (!place) return { fehler: `Ich finde keinen Ort namens ${name}.` }
      return weather(place, signal)
    }
  },
  {
    spec: {
      name: 'wikipedia',
      description: 'Schlägt einen Begriff, eine Person, einen Ort oder ein Ereignis in der deutschen Wikipedia nach. Für Fakten, bei denen du unsicher bist.',
      parameters: { type: 'object', properties: { begriff: { type: 'string' } }, required: ['begriff'] }
    },
    busy: 'schlägt nach',
    run: (args, { signal }) => wikipedia(text(args.begriff), signal)
  },
  {
    spec: {
      name: 'merken',
      description: 'Speichert eine dauerhafte Info über den Nutzer (Vorlieben, Namen, Termine-Gewohnheiten), wenn er darum bittet oder es offensichtlich nützlich ist.',
      parameters: { type: 'object', properties: { fakt: { type: 'string', description: 'Ein kurzer Satz' } }, required: ['fakt'] }
    },
    busy: 'merkt sich das',
    async run(args) {
      const fact = text(args.fakt)
      if (!fact) return { fehler: 'Nichts zum Merken.' }
      remember(fact)
      return { ok: true }
    }
  },
  {
    spec: {
      name: 'vergessen',
      description: 'Löscht gemerkte Infos, die das Stichwort enthalten.',
      parameters: { type: 'object', properties: { stichwort: { type: 'string' } }, required: ['stichwort'] }
    },
    busy: 'vergisst das',
    async run(args) {
      const { removed } = forget(text(args.stichwort))
      return removed.length ? { geloescht: removed } : { hinweis: 'Dazu war nichts gemerkt.' }
    }
  },
  {
    spec: {
      name: 'timer',
      description: 'Stellt einen Timer. Klingelt nur, solange die App geöffnet ist.',
      parameters: {
        type: 'object',
        properties: { sekunden: { type: 'number' }, bezeichnung: { type: 'string', description: 'z. B. Nudeln' } },
        required: ['sekunden']
      }
    },
    busy: 'stellt den Timer',
    async run(args, { startTimer }) {
      const seconds = Math.round(Number(args.sekunden))
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 24 * 3600) return { fehler: 'Ungültige Dauer.' }
      startTimer(seconds, text(args.bezeichnung) || 'Timer')
      return { ok: true, hinweis: 'Läuft nur, solange die App offen bleibt.' }
    }
  }
]

export const toolSpecs: ToolSpec[] = TOOLS.map(t => t.spec)

export function busyLabel(name: string): string {
  return TOOLS.find(t => t.spec.name === name)?.busy ?? 'arbeitet'
}

export async function runTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
  const tool = TOOLS.find(t => t.spec.name === name)
  if (!tool) return { fehler: `Unbekanntes Werkzeug ${name}.` }
  try {
    return await tool.run(args, context)
  } catch (error) {
    if (context.signal?.aborted) throw error
    return { fehler: error instanceof Error ? error.message : String(error) }
  }
}
