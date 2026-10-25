import { PROVIDERS, pickModel } from '../ai/agent'
import type { ProviderId } from '../ai/types'
import type { Speaker } from '../speech/speak'
import { clearAll, loadMemory, saveSettings, type Settings } from '../store'

/** Eine Zeile der Übersicht: kurzer Stand, `bad` färbt sie als offen. */
export interface Summary {
  text: string
  bad?: boolean
}

export type SettingsPage = 'home' | 'ki' | 'stimme' | 'google' | 'du' | 'pc'

interface Options {
  get(): Settings
  set(next: Settings): void
  speaker: Speaker
  onClearHistory(): void
  /** Stand der Teile, die nicht in diesem Modul leben. */
  summaries: { google(): Summary; pc(): Summary; store(): Summary; version: string }
  onOpenStore(): void
}

const PROVIDER_NAMES: Record<ProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI' }

const KEY_HELP: Record<ProviderId, string> = {
  gemini:
    'Kostenlos: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → „API-Schlüssel erstellen“. Im Gratis-Kontingent darf Google Eingaben zur Verbesserung nutzen.',
  openai:
    'Von <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>. Kostet pro Nutzung und braucht Guthaben; ein ChatGPT-Abo zählt dafür nicht.'
}

export function setupSettings({ get, set, speaker, onClearHistory, summaries, onOpenStore }: Options): { open(page?: SettingsPage): void } {
  const dialog = document.getElementById('settings') as HTMLDialogElement
  const form = document.getElementById('settings-form') as HTMLFormElement
  const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const key = field<HTMLInputElement>('key')
  const keyHelp = field('key-help')
  const model = field<HTMLSelectElement>('model')
  const modelStatus = field('model-status')
  const loadModels = field<HTMLButtonElement>('load-models')
  const userName = field<HTMLInputElement>('user-name')
  const voice = field<HTMLSelectElement>('voice')
  const rate = field<HTMLInputElement>('rate')
  const rateOut = field('rate-out')
  const speak = field<HTMLInputElement>('speak')
  const conversation = field<HTMLInputElement>('conversation')
  const dictation = field<HTMLSelectElement>('dictation')
  const memory = field('memory')
  const known: Partial<Record<ProviderId, string[]>> = {}
  let checking: AbortController | null = null

  const update = (change: (s: Settings) => Settings) => {
    const next = change(structuredClone(get()))
    saveSettings(next)
    set(next)
  }
  const provider = (): ProviderId => get().provider

  function fillModels(): void {
    const current = get().models[provider()]
    const list = known[provider()] ?? []
    const options = list.includes(current) ? list : [current, ...list]
    model.replaceChildren(...options.map(id => new Option(id, id, false, id === current)))
  }

  function fillVoices(): void {
    const voices = speaker.voices()
    const chosen = get().voice
    voice.replaceChildren(
      new Option('Automatisch (beste deutsche)', '', false, !chosen),
      ...voices.map(v => new Option(`${v.name}${v.lang !== 'de-DE' ? ` (${v.lang})` : ''}`, v.voiceURI, false, v.voiceURI === chosen))
    )
  }

  function fillMemory(): void {
    const facts = loadMemory()
    memory.replaceChildren(...facts.map(fact => Object.assign(document.createElement('li'), { textContent: fact })))
    field('memory-empty').hidden = facts.length > 0
  }

  // ── Übersicht und Seiten ──────────────────────────────────────
  // Wie die iOS-Einstellungen: oben der Stand, darunter iPhone und PC als
  // Gruppen; jede Zeile öffnet ihre Seite, „Zurück“ führt zur Übersicht.

  const pages = [...form.querySelectorAll<HTMLElement>('.set-page')]
  const back = field<HTMLButtonElement>('settings-back')
  const title = field('settings-title')
  const needsKey = () => !get().keys[get().provider].trim()
  let page: SettingsPage = 'home'

  function summary(name: Exclude<SettingsPage, 'home'>): Summary {
    const s = get()
    switch (name) {
      case 'ki':
        return needsKey() ? { text: 'Schlüssel fehlt', bad: true } : { text: `${PROVIDER_NAMES[s.provider]} · ${s.models[s.provider]}` }
      case 'stimme':
        return { text: `${s.dictation === 'ki' ? 'KI-Diktat' : 'Browser-Diktat'} · ${s.speak ? `${s.rate.toFixed(2).replace('.', ',')}×` : 'stumm'}` }
      case 'du': {
        const count = loadMemory().length
        return { text: `${s.userName || 'Hans'} · ${count ? `${count} gemerkt` : 'nichts gemerkt'}` }
      }
      case 'google':
        return summaries.google()
      case 'pc':
        return summaries.pc()
    }
  }

  function renderHome(): void {
    for (const name of ['ki', 'stimme', 'google', 'du', 'pc'] as const) {
      const value = field(`sum-${name}`)
      const result = summary(name)
      value.textContent = result.text
      value.classList.toggle('bad', Boolean(result.bad))
    }
    field('sum-store').textContent = summaries.store().text
    field('sum-version').textContent = summaries.version
    const status = field('set-status')
    status.className = needsKey() ? 'set-status bad' : 'set-status ok'
    status.textContent = needsKey() ? 'Noch zu tun: KI-Schlüssel einfügen. Danach kann James antworten.' : 'James ist bereit.'
  }

  function show(next: SettingsPage): void {
    page = next
    for (const section of pages) section.hidden = section.dataset.page !== next
    back.hidden = next === 'home'
    title.textContent = next === 'home' ? 'Einstellungen' : (pages.find(p => p.dataset.page === next)?.dataset.title ?? '')
    if (next === 'home') renderHome()
    dialog.scrollTop = 0
  }

  form.addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLButtonElement>('button.set-row[data-page]')
    if (row) show(row.dataset.page as SettingsPage)
  })
  back.addEventListener('click', () => show('home'))
  field('settings-store').addEventListener('click', () => {
    dialog.close()
    onOpenStore()
  })
  // Escape führt von einer Seite erst zur Übersicht.
  dialog.addEventListener('cancel', event => {
    if (page === 'home') return
    event.preventDefault()
    show('home')
  })

  field('key-show').addEventListener('click', () => {
    const visible = key.type === 'text'
    key.type = visible ? 'password' : 'text'
    field('key-show').textContent = visible ? 'Anzeigen' : 'Verbergen'
  })
  field('key-paste').addEventListener('click', async () => {
    try {
      key.value = (await navigator.clipboard.readText()).trim()
      key.dispatchEvent(new Event('change'))
    } catch {
      key.focus()
      modelStatus.className = 'note'
      modelStatus.textContent = 'Einfügen ging nicht automatisch – ins Feld tippen und „Einsetzen“ wählen.'
    }
  })

  function showProvider(): void {
    const s = get()
    for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="provider"]')) radio.checked = radio.value === s.provider
    key.value = s.keys[s.provider]
    keyHelp.innerHTML = KEY_HELP[s.provider]
    modelStatus.textContent = ''
    modelStatus.className = 'note'
    fillModels()
  }

  async function check(): Promise<void> {
    const id = provider()
    const apiKey = get().keys[id].trim()
    checking?.abort()
    if (!apiKey) {
      modelStatus.textContent = ''
      return
    }
    const controller = new AbortController()
    checking = controller
    loadModels.disabled = true
    modelStatus.className = 'note'
    modelStatus.textContent = 'Prüfe Schlüssel …'
    try {
      const list = await PROVIDERS[id].listModels(apiKey, controller.signal)
      known[id] = list
      const chosen = pickModel(id, list, get().models[id])
      update(s => ({ ...s, models: { ...s.models, [id]: chosen } }))
      if (provider() === id) fillModels()
      modelStatus.className = 'note ok'
      modelStatus.textContent = `Schlüssel funktioniert. ${list.length} Modelle verfügbar.`
    } catch (error) {
      if (controller.signal.aborted) return
      modelStatus.className = 'note bad'
      modelStatus.textContent = error instanceof Error ? error.message : String(error)
    } finally {
      if (checking === controller) {
        checking = null
        loadModels.disabled = false
      }
    }
  }

  form.addEventListener('change', event => {
    const target = event.target as HTMLInputElement
    if (target.name === 'provider') {
      update(s => ({ ...s, provider: target.value === 'openai' ? 'openai' : 'gemini' }))
      showProvider()
      void check()
    }
  })
  key.addEventListener('change', () => {
    const value = key.value.trim()
    update(s => ({ ...s, keys: { ...s.keys, [s.provider]: value } }))
    void check()
  })
  // Einfügen aus der Zwischenablage löst auf iOS nicht immer `change` aus.
  key.addEventListener('paste', () => setTimeout(() => key.dispatchEvent(new Event('change')), 0))
  loadModels.addEventListener('click', () => void check())
  model.addEventListener('change', () => update(s => ({ ...s, models: { ...s.models, [s.provider]: model.value } })))
  userName.addEventListener('change', () => update(s => ({ ...s, userName: userName.value.trim() || 'Hans' })))
  voice.addEventListener('change', () => update(s => ({ ...s, voice: voice.value })))
  rate.addEventListener('input', () => {
    rateOut.textContent = `${Number(rate.value).toFixed(2)}×`
    update(s => ({ ...s, rate: Number(rate.value) }))
  })
  speak.addEventListener('change', () => update(s => ({ ...s, speak: speak.checked })))
  conversation.addEventListener('change', () => update(s => ({ ...s, conversation: conversation.checked })))
  dictation.addEventListener('change', () => update(s => ({ ...s, dictation: dictation.value === 'ios' ? 'ios' : 'ki' })))
  field('test-voice').addEventListener('click', () => {
    speaker.unlock()
    speaker.stop()
    speaker.say(`Hallo ${get().userName || 'Hans'}. So klinge ich. Sag Bescheid, wenn es dir zu schnell ist.`)
  })
  field('clear-history').addEventListener('click', () => {
    if (confirm('Den Gesprächsverlauf löschen?')) onClearHistory()
  })
  field('clear-memory').addEventListener('click', () => {
    if (!confirm('Alles Gemerkte und den Verlauf löschen?')) return
    clearAll()
    onClearHistory()
    fillMemory()
  })
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', fillVoices)

  return {
    open(start?: SettingsPage) {
      const s = get()
      show(start ?? (needsKey() ? 'ki' : 'home'))
      showProvider()
      userName.value = s.userName
      rate.value = String(s.rate)
      rateOut.textContent = `${s.rate.toFixed(2)}×`
      speak.checked = s.speak
      conversation.checked = s.conversation
      dictation.value = s.dictation
      fillVoices()
      fillMemory()
      if (!dialog.open) dialog.showModal()
      if (page === 'ki' && !s.keys[s.provider]) key.focus()
      else if (!known[s.provider]) void check()
    }
  }
}
