import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const releases = vi.hoisted(() => ({ pending: [] as Array<(value: unknown) => void> }))
vi.mock('../src/market/catalog', () => ({ fetchCatalog: async () => ({ updated: '', skills: [], apps: [
  { id: 'iphone', name: 'iPhone App', platform: 'iPhone', description: 'Web-App', kind: 'self' },
  { id: 'pc', name: 'Windows', platform: 'Windows', description: 'PC', kind: 'github-release', repo: 'test/pc' },
  { id: 'watch', name: 'Watch', platform: 'Apple Watch', description: 'Kurzbefehl', kind: 'guide', url: 'uhr/' }
] }) }))
vi.mock('../src/market/releases', () => ({ latestRelease: () => new Promise(resolve => releases.pending.push(resolve)) }))
vi.mock('../src/update', () => ({ fetchRemote: async () => null }))

describe('Store', () => {
  beforeEach(async () => {
    vi.resetModules(); releases.pending = []; localStorage.clear()
    document.body.innerHTML = readFileSync('store/index.html', 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/)![1]
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('scrollTo', () => {})
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
    await import('../src/storefront/main')
    await vi.waitFor(() => expect(document.querySelectorAll('.tile')).toHaveLength(3))
  })
  it('zeigt den Web-App-Weg und einen QR-Code für den Store-Eintrag', () => {
    ;(document.querySelector('.tile') as HTMLElement).click()
    const dialog = document.querySelector('#detail')!
    expect(dialog.textContent).toContain('Web-App')
    expect(dialog.querySelector<HTMLAnchorElement>('.detail-actions .get')!.href).toBe('https://james-marktplatz.netlify.app/jarvis-iphone/james.mobileconfig')
    expect(dialog.querySelector('#app-qr svg')).not.toBeNull()
  })
  it('lässt eine verspätete Windows-Antwort keine andere App überschreiben', async () => {
    const tiles = document.querySelectorAll<HTMLElement>('.tile')
    tiles[1].click()
    tiles[0].click()
    releases.pending[0]({ version: '9.0.0', url: 'https://downloads.invalid/setup.exe', date: '2026-10-24', sizeMb: 5 })
    await Promise.resolve()
    expect(document.querySelector<HTMLAnchorElement>('#detail-actions .get')!.href).toBe('https://james-marktplatz.netlify.app/jarvis-iphone/james.mobileconfig')
    expect(document.querySelector('#detail-name')!.textContent).toBe('iPhone App')
    expect(document.querySelector('#detail-facts')!.textContent).not.toContain('9.0.0')
  })
  it('zeigt leere Suchergebnisse und korrekte Tab-Markierung', () => {
    ;(document.querySelector('[data-view="search"]') as HTMLElement).click()
    const input = document.querySelector<HTMLInputElement>('#search')!
    input.value = 'gibt-es-nicht'; input.dispatchEvent(new Event('input'))
    expect(document.querySelector('#search-results')!.textContent).toContain('Nichts gefunden')
    expect(document.querySelector('[data-view="search"]')!.getAttribute('aria-current')).toBe('page')
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1)
  })
})
