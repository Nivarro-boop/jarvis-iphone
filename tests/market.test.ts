import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { compareVersions, parseCatalog, type Skill } from '../src/market/catalog'
import { findSkill, install, loadInstalled, MAX_ACTIVE, skillsPrompt, syncWithCatalog, uninstall } from '../src/market/installed'
import { isNewer } from '../src/update'

const skill = (id: string, version = '1.0.0'): Skill => ({
  id, name: id, version, category: 'Test', description: '', instructions: `Anweisung ${id} ${version}`, examples: [], author: 't'
})

describe('Katalog', () => {
  it('der veröffentlichte Katalog ist gültig und vollständig', () => {
    const raw = JSON.parse(readFileSync(resolve('public/marketplace.json'), 'utf8'))
    const catalog = parseCatalog(raw)
    expect(catalog.skills).toHaveLength(raw.skills.length)
    expect(catalog.apps).toHaveLength(raw.apps.length)
    expect(catalog.apps.find(a => a.kind === 'github-release')?.repo).toBe('Nivarro-boop/James-Jarvis')
  })

  it('lässt kaputte Einträge weg, statt alles zu verwerfen', () => {
    const catalog = parseCatalog({
      skills: [skill('gut'), { id: 'Böse ID', name: 'x', version: '1', instructions: 'y' }, { ...skill('ohne'), instructions: '' }, skill('gut', '2.0.0')],
      apps: [{ id: 'x', name: 'X', kind: 'github-release', repo: 'kein repo' }, { id: 'eigen', name: 'Y', kind: 'self' }]
    })
    expect(catalog.skills.map(s => s.id)).toEqual(['gut'])
    expect(catalog.apps.map(a => a.id)).toEqual(['eigen'])
    expect(parseCatalog(null)).toEqual({ updated: '', skills: [], apps: [] })
    // Anleitungen nur als Pfad innerhalb der App, nie als fremde Adresse.
    const guides = parseCatalog({ apps: [{ id: 'uhr', name: 'Uhr', kind: 'guide', url: 'uhr/' }, { id: 'boese', name: 'B', kind: 'guide', url: 'https://evil.example/' }] })
    expect(guides.apps.map(a => a.id)).toEqual(['uhr'])
  })

  it('vergleicht Versionen numerisch', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9', '1')).toBe(-1)
  })
})

describe('Installierte Fähigkeiten', () => {
  beforeEach(() => localStorage.clear())

  it('installiert, begrenzt und entfernt', () => {
    for (let i = 0; i < MAX_ACTIVE; i++) expect(install(skill(`s${i}`)).ok).toBe(true)
    expect(install(skill('zuviel')).ok).toBe(false)
    uninstall('s0')
    expect(loadInstalled()).toHaveLength(MAX_ACTIVE - 1)
  })

  it('zieht installierte Fähigkeiten auf die neuere Fassung und behält verschwundene', () => {
    install(skill('koch', '1.0.0'))
    install(skill('alt', '1.0.0'))
    const { updated } = syncWithCatalog({ updated: '', apps: [], skills: [skill('koch', '1.1.0')] })
    expect(updated.map(s => s.version)).toEqual(['1.1.0'])
    expect(loadInstalled().map(s => `${s.id}@${s.version}`)).toEqual(['koch@1.1.0', 'alt@1.0.0'])
    expect(skillsPrompt()).toContain('Anweisung koch 1.1.0')
  })

  it('stuft nie herunter', () => {
    install(skill('koch', '2.0.0'))
    expect(syncWithCatalog({ updated: '', apps: [], skills: [skill('koch', '1.0.0')] }).updated).toEqual([])
  })
})

describe('Selbst-Update', () => {
  const local = { version: '0.2.5', sha: 'aaaaaaa', date: '', notes: [] }
  it('erkennt eine andere Fassung auf GitHub', () => {
    expect(isNewer({ ...local, sha: 'bbbbbbb', version: '0.2.6' }, local)).toBe(true)
    expect(isNewer(local, local)).toBe(false)
    expect(isNewer(null, local)).toBe(false)
  })
  it('aktualisiert lokale Entwicklungsfassungen nicht', () => {
    expect(isNewer({ ...local, sha: 'bbbbbbb' }, { ...local, sha: 'lokal' })).toBe(false)
  })
})

describe('Fähigkeit per Sprache finden', () => {
  const raw = JSON.parse(readFileSync(resolve('public/marketplace.json'), 'utf8'))
  const { skills } = parseCatalog(raw)

  it('versteht gebeugte und kurze Namen', () => {
    expect(findSkill(skills, 'den Kochassistenten')?.id).toBe('koch')
    expect(findSkill(skills, 'Englisch')?.id).toBe('englisch')
    expect(findSkill(skills, 'quizmaster')?.id).toBe('quiz')
    expect(findSkill(skills, 'Gute-Nacht-Geschichte')?.id).toBe('geschichten')
    expect(findSkill(skills, 'Fokus Coach')?.id).toBe('fokus')
  })

  it('erfindet keine Treffer', () => {
    expect(findSkill(skills, 'Steuerberater')).toBeUndefined()
    expect(findSkill(skills, '')).toBeUndefined()
  })
})
