import { PROVIDERS, pickModel } from '../ai/agent'
import type { ProviderId } from '../ai/types'
import type { Speaker } from '../speech/speak'
import { clearAll, loadMemory, saveSettings, type Settings } from '../store'

interface Options {
  get(): Settings
  set(next: Settings): void
  speaker: Speaker
  onClearHistory(): void
}

const KEY_HELP: Record<ProviderId, string> = {
  gemini:
    'Kostenlos: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → „API-Schlüssel erstellen“. Im Gratis-Kontingent darf Google Eingaben zur Verbesserung nutzen.',
  openai:
    'Von <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a>. Kostet pro Nutzung und braucht Guthaben; ein ChatGPT-Abo zählt dafür nicht.'
}

export function setupSettings({ get, set, speaker, onClearHistory }: Options): { open(): void } {
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
    memory.replaceChildren(...loadMemory().map(fact => Object.assign(document.createElement('li'), { textContent: fact })))
  }

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
    open() {
      const s = get()
      showProvider()
      userName.value = s.userName
      rate.value = String(s.rate)
      rateOut.textContent = `${s.rate.toFixed(2)}×`
      speak.checked = s.speak
      conversation.checked = s.conversation
      dictation.value = s.dictation
      fillVoices()
      fillMemory()
      dialog.showModal()
      if (!s.keys[s.provider]) key.focus()
      else if (!known[s.provider]) void check()
    }
  }
}
