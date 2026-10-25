import { compareVersions, type Catalog, type Skill } from './catalog'

/**
 * Installierte Fähigkeiten. Eine Kopie liegt lokal, damit James sie auch
 * offline kennt; beim nächsten Blick in den Katalog wird sie auf die neueste
 * Fassung gezogen.
 */

const KEY = 'james.skills.v1'
/** Mehr aktive Anweisungen verwässern den Systemprompt. */
export const MAX_ACTIVE = 6

export function loadInstalled(): Skill[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Skill[]
    return Array.isArray(raw) ? raw.filter(s => s && typeof s.id === 'string' && typeof s.instructions === 'string') : []
  } catch {
    return []
  }
}

function save(skills: Skill[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(skills))
  } catch {
    // voll oder gesperrt
  }
}

export function install(skill: Skill): { ok: boolean; error?: string } {
  const installed = loadInstalled()
  if (installed.some(s => s.id === skill.id)) return { ok: true }
  if (installed.length >= MAX_ACTIVE) return { ok: false, error: `Höchstens ${MAX_ACTIVE} Fähigkeiten gleichzeitig. Erst eine entfernen.` }
  save([...installed, skill])
  return { ok: true }
}

export function uninstall(id: string): void {
  save(loadInstalled().filter(s => s.id !== id))
}

/**
 * Zieht installierte Fähigkeiten auf die Fassung im Katalog. Fähigkeiten, die
 * aus dem Katalog verschwunden sind, bleiben installiert — wer etwas nutzt,
 * soll es nicht still verlieren.
 */
export function syncWithCatalog(catalog: Catalog): { updated: Skill[] } {
  const updated: Skill[] = []
  const next = loadInstalled().map(local => {
    const remote = catalog.skills.find(s => s.id === local.id)
    if (remote && compareVersions(remote.version, local.version) > 0) {
      updated.push(remote)
      return remote
    }
    return local
  })
  if (updated.length) save(next)
  return { updated }
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** „Kochassistenten“ und „Kochassistent“ sind dieselbe Fähigkeit. */
const stem = (text: string) => text.replace(/(en|n)$/, '')

/**
 * Findet eine Fähigkeit nach dem, was jemand sagt: „den Kochassistenten“,
 * „Englisch“, „quiz“. Genauer Treffer vor Teiltreffer.
 */
export function findSkill(skills: Skill[], spoken: string): Skill | undefined {
  const wanted = stem(plain(spoken).replace(/^(den|die|das|der|dem|ein|eine|einen)\s+/, ''))
  if (!wanted) return undefined
  const keys = (s: Skill) => [plain(s.name), plain(s.id), plain(s.name.split(/[-\s]/)[0] ?? '')].map(stem)
  return (
    skills.find(s => keys(s).includes(wanted)) ??
    skills.find(s => keys(s).some(k => k.length > 2 && (k.includes(wanted) || wanted.includes(k))))
  )
}

/** Teil des Systemprompts für die aktiven Fähigkeiten. */
export function skillsPrompt(skills: Skill[] = loadInstalled()): string {
  if (!skills.length) return ''
  return [
    'Zusätzliche Fähigkeiten, die der Nutzer im Marktplatz installiert hat. Nutze sie, wenn die Anfrage passt:',
    ...skills.map(s => `## ${s.name}\n${s.instructions}`)
  ].join('\n\n')
}
