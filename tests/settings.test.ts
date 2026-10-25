import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Speaker } from '../src/speech/speak'
import { DEFAULT_SETTINGS, type Settings } from '../src/store'
import { setupSettings } from '../src/ui/settings'

describe('Einstellungen', () => {
  let settings: Settings
  let openStore: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = readFileSync('index.html', 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/)![1]
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
    settings = structuredClone(DEFAULT_SETTINGS)
    openStore = vi.fn<() => void>()
  })

  function open(page?: Parameters<ReturnType<typeof setupSettings>['open']>[0]) {
    const ui = setupSettings({
      get: () => settings,
      set: next => (settings = next),
      speaker: { voices: () => [], unlock() {}, stop() {}, say() {} } as unknown as Speaker,
      onClearHistory() {},
      summaries: { google: () => ({ text: 'Aus' }), pc: () => ({ text: '192.168.1.20:8788' }), store: () => ({ text: '2 aktiv' }), version: '0.2.9' },
      onOpenStore: openStore
    })
    ui.open(page)
  }
  const visible = () => [...document.querySelectorAll<HTMLElement>('.set-page')].filter(p => !p.hidden).map(p => p.dataset.page)
  const text = (id: string) => document.getElementById(id)!.textContent

  it('ohne Schlüssel geht es gleich auf die KI-Seite, die Übersicht nennt, was fehlt', () => {
    open()
    expect(visible()).toEqual(['ki'])
    expect(text('settings-title')).toBe('KI & Schlüssel')
    document.getElementById('settings-back')!.click()
    expect(visible()).toEqual(['home'])
    expect(text('sum-ki')).toBe('Schlüssel fehlt')
    expect(text('set-status')).toContain('KI-Schlüssel')
  })

  it('mit Schlüssel zeigt die Übersicht iPhone und PC auf einen Blick', () => {
    settings.keys.gemini = 'AIza-test-schluessel'
    open()
    expect(visible()).toEqual(['home'])
    expect(text('set-status')).toBe('James ist bereit.')
    expect(text('sum-ki')).toBe('Gemini · gemini-2.5-flash')
    expect(text('sum-stimme')).toBe('KI-Diktat · 1,05×')
    expect(text('sum-pc')).toBe('192.168.1.20:8788')
    expect(text('sum-store')).toBe('2 aktiv')
    expect(text('sum-version')).toBe('0.2.9')
  })

  it('Zeilen öffnen ihre Seite, Escape führt zurück, der Store schließt die Einstellungen', () => {
    settings.keys.gemini = 'AIza-test-schluessel'
    open()
    document.querySelector<HTMLButtonElement>('button.set-row[data-page="pc"]')!.click()
    expect(visible()).toEqual(['pc'])
    const cancel = new Event('cancel', { cancelable: true })
    document.getElementById('settings')!.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(visible()).toEqual(['home'])
    document.getElementById('settings-store')!.click()
    expect(openStore).toHaveBeenCalled()
    expect(document.getElementById('settings')!.hasAttribute('open')).toBe(false)
  })
})
