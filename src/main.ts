import './style.css'
import { PROVIDERS, runTurn } from './ai/agent'
import { ProviderError, type Message } from './ai/types'
import { systemPrompt } from './prompt'
import { Listener } from './speech/listen'
import { SentenceBuffer } from './speech/sentences'
import { Speaker } from './speech/speak'
import { loadHistory, loadMemory, loadSettings, saveHistory, type Settings } from './store'
import { busyLabel, runTool, toolSpecs } from './tools'
import { Orb, type OrbState } from './ui/orb'
import { skillsPrompt } from './market/installed'
import { setupMarket } from './ui/market'
import { setupSettings } from './ui/settings'
import { Timers } from './ui/timers'
import { renderTranscript } from './ui/transcript'
import { applyUpdate, watchForUpdates } from './update'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const ui = {
  app: $('app'),
  status: $('status'),
  hint: $('hint'),
  you: $('you'),
  answer: $('answer'),
  welcome: $('welcome'),
  compose: $<HTMLFormElement>('compose'),
  text: $<HTMLInputElement>('text'),
  talk: $<HTMLButtonElement>('talk'),
  orbButton: $<HTMLButtonElement>('orb-button'),
  install: $('install')
}

let settings: Settings = loadSettings()
let history: Message[] = loadHistory()
let turn: AbortController | null = null
let state: OrbState = 'idle'
/** Hat der Nutzer seit dem Start schon etwas getan? Dann kein stilles Neuladen mehr. */
let touched = false
document.addEventListener('pointerdown', () => (touched = true), { capture: true, once: true })
document.addEventListener('keydown', () => (touched = true), { capture: true, once: true })

const orb = new Orb($<HTMLCanvasElement>('orb'))
const speaker = new Speaker()
const listener = new Listener()
const timers = new Timers($('timers'), (label: string) => {
  const name = settings.userName.trim() || 'Hans'
  if (settings.speak) speaker.say(`${name}, dein Timer ${label === 'Timer' ? '' : `für ${label} `}ist abgelaufen.`)
})

const STATUS: Record<OrbState, string> = {
  idle: 'Bereit',
  listening: 'Hört zu',
  thinking: 'Denkt nach',
  speaking: 'Spricht',
  error: 'Problem',
  setup: 'Einrichtung nötig'
}

function setState(next: OrbState, label?: string): void {
  state = next
  ui.app.dataset.state = next
  ui.status.textContent = label ?? STATUS[next]
  orb.set(next)
  ui.orbButton.setAttribute('aria-label', next === 'idle' || next === 'error' ? 'Sprechen' : 'Stopp')
}

function needsSetup(): boolean {
  return !settings.keys[settings.provider].trim()
}

function refreshSetup(): void {
  const missing = needsSetup()
  ui.welcome.hidden = !missing
  // Erst einrichten, dann installieren — zwei Karten gleichzeitig wären zu viel.
  if (missing) ui.install.hidden = true
  else if (wantsInstallHint()) ui.install.hidden = false
  ui.hint.textContent = missing ? '' : listener.supported ? 'Tippe auf die Kugel und sprich.' : 'Schreib James unten eine Nachricht.'
  if (missing) setState('setup')
  else if (state === 'setup') setState('idle')
}

// ─────────────────────────────────────────────────────────────
// Zuhören
// ─────────────────────────────────────────────────────────────

function listen(): void {
  if (needsSetup()) return openSettings()
  stopAll()
  if (!listener.supported) {
    ui.text.focus()
    return
  }
  setState('listening')
  ui.you.textContent = ''
  ui.hint.textContent = 'Sprich jetzt — tippen beendet.'
  listener.start({
    onPartial: text => {
      ui.you.textContent = text
    },
    onFinal: text => {
      ui.hint.textContent = ''
      if (text) void ask(text)
      else setState('idle', 'Nichts verstanden')
    },
    onError: message => showError(message)
  })
}

// ─────────────────────────────────────────────────────────────
// Fragen und antworten
// ─────────────────────────────────────────────────────────────

async function ask(question: string): Promise<void> {
  const text = question.trim()
  if (!text) return
  if (needsSetup()) return openSettings()
  stopAll()
  const controller = new AbortController()
  turn = controller
  ui.you.textContent = text
  ui.answer.textContent = ''
  ui.answer.classList.remove('error')
  ui.hint.textContent = ''
  setState('thinking')

  const sentences = new SentenceBuffer()
  const speak = (parts: string[]) => {
    if (!settings.speak) return
    for (const part of parts) {
      speaker.say(part)
      orb.kick(0.6)
    }
    if (parts.length && state === 'thinking') setState('speaking')
  }

  try {
    const provider = PROVIDERS[settings.provider]
    const result = await runTurn({
      provider,
      apiKey: settings.keys[settings.provider].trim(),
      model: settings.models[settings.provider],
      system: systemPrompt({ userName: settings.userName, memory: loadMemory(), skills: skillsPrompt() }),
      history,
      userText: text,
      tools: toolSpecs,
      signal: controller.signal,
      runTool: call => runTool(call.name, call.args, { signal: controller.signal, startTimer: (s, l) => timers.start(s, l) }),
      onText: delta => {
        ui.answer.textContent += delta
        ui.answer.parentElement!.scrollTop = ui.answer.parentElement!.scrollHeight
        speak(sentences.push(delta))
      },
      onTool: call => {
        if (state === 'thinking') ui.status.textContent = `James ${busyLabel(call.name)}`
      }
    })
    if (turn !== controller) return
    speak(sentences.flush())
    history = result.history
    saveHistory(history)
    if (!result.answer.trim()) ui.answer.textContent = 'Erledigt.'
    finishTurn()
  } catch (error) {
    if (controller.signal.aborted) return
    showError(error instanceof ProviderError ? error.message : `Da ist etwas schiefgegangen: ${String(error)}`)
  } finally {
    if (turn === controller) turn = null
  }
}

function finishTurn(): void {
  if (!settings.speak || !speaker.speaking) return afterAnswer()
  setState('speaking')
  speaker.whenIdle(afterAnswer)
}

function afterAnswer(): void {
  setState('idle')
  if (settings.conversation && listener.supported && document.visibilityState === 'visible') {
    setTimeout(() => {
      if (state === 'idle') listen()
    }, 350)
  }
}

function showError(message: string): void {
  ui.answer.textContent = message
  ui.answer.classList.add('error')
  setState('error')
  ui.hint.textContent = ''
}

/** Alles anhalten: Zuhören, Denken, Sprechen. */
function stopAll(): void {
  listener.abort()
  speaker.stop()
  turn?.abort()
  turn = null
}

function primaryAction(): void {
  speaker.unlock()
  timers.acknowledge()
  if (state === 'listening') {
    listener.stop()
    return
  }
  if (state === 'thinking' || state === 'speaking') {
    stopAll()
    setState('idle', 'Angehalten')
    return
  }
  listen()
}

// ─────────────────────────────────────────────────────────────
// Bedienung
// ─────────────────────────────────────────────────────────────

ui.talk.addEventListener('click', primaryAction)
ui.orbButton.addEventListener('click', primaryAction)

ui.text.addEventListener('input', () => ui.compose.classList.toggle('ready', ui.text.value.trim().length > 0))
ui.compose.addEventListener('submit', event => {
  event.preventDefault()
  speaker.unlock()
  const value = ui.text.value
  ui.text.value = ''
  ui.compose.classList.remove('ready')
  ui.text.blur()
  void ask(value)
})

const { open: openSettings } = setupSettings({
  get: () => settings,
  set: next => {
    settings = next
    speaker.voiceURI = settings.voice
    speaker.rate = settings.rate
    refreshSetup()
  },
  speaker,
  onClearHistory: () => {
    history = []
    saveHistory(history)
    ui.you.textContent = ''
    ui.answer.textContent = ''
  }
})
$('welcome-setup').addEventListener('click', openSettings)
$('open-settings').addEventListener('click', openSettings)

// Der Systemprompt wird vor jeder Frage neu gebaut; Änderungen wirken also sofort.
const market = setupMarket({ onChanged: () => undefined })
$('open-market').addEventListener('click', market.open)
// Installierte Fähigkeiten auch ohne Öffnen des Marktplatzes aktuell halten.
void market.refresh()

const historyDialog = $<HTMLDialogElement>('history')
$('open-history').addEventListener('click', () => {
  renderTranscript($('transcript'), history)
  historyDialog.showModal()
})

// Hinweis zum Installieren — nur in Safari auf iPhone/iPad, nicht in der installierten App.
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
function wantsInstallHint(): boolean {
  try {
    return ios && !standalone && !localStorage.getItem('james.install-hint')
  } catch {
    return false
  }
}
$('install-close').addEventListener('click', () => {
  ui.install.hidden = true
  try {
    localStorage.setItem('james.install-hint', '1')
  } catch {
    // egal
  }
})

// Wer die App verlässt, will nicht, dass James im Hintergrund weiterredet.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'listening' || state === 'speaking')) {
    stopAll()
    setState('idle')
  }
})

speaker.voiceURI = settings.voice
speaker.rate = settings.rate
setState('idle')
refreshSetup()

watchForUpdates({
  busy: () => !['idle', 'setup', 'error'].includes(state) || !!document.querySelector('dialog[open]'),
  touched: () => touched,
  onAvailable: remote => {
    $('update-text').textContent = `Neue Version ${remote.version} ist da`
    $('update').hidden = false
  }
})
$('update-apply').addEventListener('click', () => void applyUpdate())

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
}
