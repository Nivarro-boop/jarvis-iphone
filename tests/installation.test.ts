import { describe, expect, it } from 'vitest'
import { APP_HOME, appRootFor, installationTarget } from '../src/market/installation'

describe('Installationsziele', () => {
  it('richtet App und Store getrennt auf die passende Startseite', () => {
    const base = 'https://example.invalid/jarvis-iphone/'
    const app = installationTarget(base, '')
    const store = installationTarget(base, '?target=store')
    expect(app.url).toBe(base)
    expect(store.url).toBe(`${base}store/`)
    expect(store.guide).toBe(`${base}installieren/?target=store`)
    expect(store.profile).toMatch(/\/store.mobileconfig$/)
    expect(app.profile).toMatch(/\/james.mobileconfig$/)
  })
  it('übernimmt keine fremden Ziele oder Zugangsdaten in Installationslinks', () => {
    const target = installationTarget('https://example.invalid/', '?target=https://evil.invalid/&token=secret')
    expect(target.url).toBe('https://example.invalid/')
    expect(target.guide).not.toContain('secret')
    expect(target.guide).not.toContain('evil')
  })
})

describe('Adresse der App', () => {
  it('nimmt auf Netlify die GitHub-Pages-Adresse, sonst die eigene', () => {
    expect(appRootFor({ origin: 'https://james-marktplatz.netlify.app', hostname: 'james-marktplatz.netlify.app' }, '/jarvis-iphone/')).toBe(APP_HOME)
    expect(appRootFor({ origin: 'http://localhost:5173', hostname: 'localhost' }, '/')).toBe('http://localhost:5173/')
  })
})
