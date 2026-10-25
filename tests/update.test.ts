import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanUrl, isNewer, reloadUrl, type BuildInfo } from '../src/update'

const local: BuildInfo = { version: '0.2.18', sha: '48d020a', date: '', notes: [] }

describe('Selbst-Update', () => {
  it('erkennt eine neue Fassung nur an einem anderen Stand', () => {
    expect(isNewer({ ...local, sha: 'abc1234' }, local)).toBe(true)
    expect(isNewer(local, local)).toBe(false)
    expect(isNewer(null, local)).toBe(false)
    expect(isNewer({ ...local, sha: 'abc1234' }, { ...local, sha: 'lokal' })).toBe(false)
  })

  it('lädt unter einer neuen Adresse neu, damit kein Zwischenspeicher die alte Seite liefert', () => {
    expect(reloadUrl('https://nivarro-boop.github.io/jarvis-iphone/#chat', 'abc1234')).toBe(
      'https://nivarro-boop.github.io/jarvis-iphone/?v=abc1234#chat'
    )
    expect(reloadUrl('https://nivarro-boop.github.io/jarvis-iphone/?v=old&pair=1', 'new')).toBe(
      'https://nivarro-boop.github.io/jarvis-iphone/?v=new&pair=1'
    )
  })

  it('räumt die Adresse danach wieder auf und lässt andere Parameter stehen', () => {
    expect(cleanUrl('https://x.test/app/?v=abc&pair=1#a')).toBe('https://x.test/app/?pair=1#a')
    expect(cleanUrl('https://x.test/app/?pair=1')).toBeNull()
  })

  it('Service Worker fragt Seiten am Server nach statt aus dem Browser-Zwischenspeicher', () => {
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).toMatch(/cache: 'no-cache'/)
    expect(sw).toMatch(/searchParams\.delete\('v'\)/)
  })
})
