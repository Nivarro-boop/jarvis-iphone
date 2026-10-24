/**
 * Der Marktplatz: ein Katalog im GitHub-Repo (`public/marketplace.json`),
 * mit jeder neuen Fassung der App veröffentlicht. Wer eine Fähigkeit
 * hinzufügen will, ändert diese Datei per Pull Request — nach dem Merge steht
 * sie bei allen im Marktplatz, installierte Fähigkeiten aktualisieren sich
 * selbst.
 *
 * Fähigkeiten sind bewusst nur Text: Anweisungen für James und Beispielsätze.
 * Kein fremder Code läuft im iPhone.
 */

export interface Skill {
  id: string
  name: string
  version: string
  category: string
  description: string
  /** Wird dem Systemprompt angehängt, solange die Fähigkeit aktiv ist. */
  instructions: string
  /** Sätze, die man zu James sagen kann. */
  examples: string[]
  author: string
}

export interface AppEntry {
  id: string
  name: string
  platform: string
  description: string
  /** `self`: diese App. `github-release`: neueste Fassung aus einem Repo. `guide`: Anleitung unter `url`. */
  kind: 'self' | 'github-release' | 'guide'
  repo?: string
  /** Regulärer Ausdruck für die Datei im Release, z. B. `Setup.*\\.exe$`. */
  asset?: string
  /** Bei `guide`: Pfad relativ zur App, z. B. `uhr/`. */
  url?: string
  /** Für den Store: kurzer Werbesatz, Akzentfarbe, Symbol, Installationsprofil, Watch-Anleitung. */
  tagline?: string
  accent?: string
  icon?: string
  profile?: string
  watch?: string
}

export interface Catalog {
  updated: string
  skills: Skill[]
  apps: AppEntry[]
}

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const VERSION = /^\d+(\.\d+){0,2}$/

const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** Prüft jeden Eintrag einzeln; Kaputtes fällt heraus, statt alles zu kippen. */
export function parseCatalog(data: unknown): Catalog {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const skills: Skill[] = []
  for (const item of Array.isArray(raw.skills) ? raw.skills : []) {
    const s = (item ?? {}) as Record<string, unknown>
    const skill: Skill = {
      id: str(s.id, 41),
      name: str(s.name, 60),
      version: str(s.version, 20),
      category: str(s.category, 30) || 'Allgemein',
      description: str(s.description, 300),
      instructions: str(s.instructions, 2000),
      examples: (Array.isArray(s.examples) ? s.examples : []).map(e => str(e, 120)).filter(Boolean).slice(0, 5),
      author: str(s.author, 60) || 'unbekannt'
    }
    if (ID.test(skill.id) && skill.name && VERSION.test(skill.version) && skill.instructions && !skills.some(k => k.id === skill.id)) {
      skills.push(skill)
    }
  }
  const apps: AppEntry[] = []
  for (const item of Array.isArray(raw.apps) ? raw.apps : []) {
    const a = (item ?? {}) as Record<string, unknown>
    const kind = a.kind === 'self' || a.kind === 'github-release' || a.kind === 'guide' ? a.kind : null
    const url = str(a.url, 100)
    const repo = str(a.repo, 100)
    const entry: AppEntry = {
      id: str(a.id, 41),
      name: str(a.name, 60),
      platform: str(a.platform, 30),
      description: str(a.description, 300),
      kind: kind ?? 'self',
      ...(repo ? { repo } : {}),
      ...(str(a.asset, 100) ? { asset: str(a.asset, 100) } : {}),
      ...(url ? { url } : {}),
      ...(str(a.tagline, 80) ? { tagline: str(a.tagline, 80) } : {}),
      ...(/^#[0-9a-f]{6}$/i.test(str(a.accent, 7)) ? { accent: str(a.accent, 7) } : {}),
      ...(/^icons\/[\w.-]+\.png$/.test(str(a.icon, 60)) ? { icon: str(a.icon, 60) } : {}),
      ...(/^[a-z0-9-]+\.mobileconfig$/.test(str(a.profile, 60)) ? { profile: str(a.profile, 60) } : {}),
      ...(/^[a-z0-9-]+\/$/.test(str(a.watch, 40)) ? { watch: str(a.watch, 40) } : {})
    }
    if (!kind || !ID.test(entry.id) || !entry.name) continue
    if (kind === 'github-release' && !/^[\w.-]+\/[\w.-]+$/.test(repo)) continue
    // Nur Pfade innerhalb der App, keine fremden Adressen aus dem Katalog.
    if (kind === 'guide' && !/^[a-z0-9-]+\/$/.test(url)) continue
    apps.push(entry)
  }
  return { updated: str(raw.updated, 40), skills, apps }
}

export async function fetchCatalog(base = import.meta.env.BASE_URL, signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(`${base}marketplace.json?t=${Date.now()}`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`Marktplatz nicht erreichbar (${response.status}).`)
  return parseCatalog(await response.json())
}

/** 1.10.0 > 1.9.3. Fehlende Stellen zählen als 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff) return Math.sign(diff)
  }
  return 0
}
