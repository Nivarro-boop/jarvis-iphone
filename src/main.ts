import './style.css'
import { PROVIDERS, runTurn } from './ai/agent'
import { ProviderError, type Message } from './ai/types'
import { systemPrompt } from './prompt'
import { Listener } from './speech/listen'
import { Recorder } from './speech/record'
import { transcriber } from './ai/transcribe'
import { SentenceBuffer } from './speech/sentences'
import { Speaker } from './speech/speak'
import { loadHistory, loadMemory, loadSettings, saveHistory, type Settings } from './store'
import { activeToolSpecs, busyLabel, runTool } from './tools'
import { Orb, type OrbState } from './ui/orb'
import { loadInstalled, skillsPrompt } from './market/installed'
import { setupMarket } from './ui/market'
import { PcMode, type PcView } from './ui/pcmode'
import { parsePcLink } from './pc/pairing'
import { accessToken, clientId, completeSignIn, redirectUri, setClientId, signedInOnce, signIn, signOut, validClientId } from './google/auth'
import { setupSettings } from './ui/settings'
import { Timers } from './ui/timers'
import { renderTranscript } from './ui/transcript'
import { applyUpdate, current, watchForUpdates } from './update'

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
  install: $('install'),
  chips: $('chips')
}

let settings: Settings = loadSettings()
let history: Message[] = loadHistory()
let turn: AbortController | null = null
let lastQuestion = ''
let state: OrbState = 'idle'
/**
 * Hat der Nutzer seit dem Start – oder seit er aus dem Hintergrund zurück ist –
 * schon etwas getan? Dann kein stilles Neuladen, nur ein Hinweis.
 */
let touched = false
document.addEventListener('pointerdown', () => (touched = true), { capture: true })
document.addEventListener('keydown', () => (touched = true), { capture: true })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) touched = false
})

const orb = new Orb($<HTMLCanvasElement>('orb'))
const speaker = new Speaker()
const listener = new Listener()
// KI-Diktat: Schlüssel und Modell erst beim Abschreiben lesen, sie können sich ändern.
const recorder = new Recorder((audio, signal) =>
  transcriber(settings.provider, settings.keys[settings.provider].trim(), settings.models[settings.provider])(audio, signal)
)
const useRecorder = () => settings.dictation === 'ki' && recorder.supported
const canDictate = () => useRecorder() || listener.supported
const timers = new Timers($('timers'), (label: string) => {
  const name = settings.userName.trim() || 'Hans'
  if (settings.speak) speaker.say(`${name}, dein Timer ${label === 'Timer' ? '' : `für ${label} `}ist abgelaufen.`)
})

/** Wer antwortet: James hier auf dem iPhone, oder James am PC. */
type Target = 'phone' | 'pc'
let target: Target = 'phone'
const pc = new PcMode(orb, view => renderPc(view))

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
  if (target === 'pc') return
  ui.app.dataset.state = next
  ui.status.textContent = label ?? STATUS[next]
  orb.set(next)
  ui.orbButton.setAttribute('aria-label', next === 'idle' || next === 'error' ? 'Sprechen' : 'Stopp')
  renderChips()
}

const PC_STARTERS = ['Was steht heute an?', 'Hab ich neue Mails?', 'Spiel Musik', 'Wie geht es dem PC?']

const STARTERS = [
  'Wie wird das Wetter morgen?',
  'Stell einen Timer für zehn Minuten',
  'Erzähl mir etwas über den Mond',
  'Was kann ich heute Abend kochen?',
  'Merk dir, dass ich Kaffee schwarz trinke'
]

/** Antippbare Sätze: zum Einstieg Beispiele, nach einem Fehler „Nochmal“. */
function renderChips(): void {
  const chips: { label: string; retry?: boolean; run(): void }[] = []
  if (target === 'pc') {
    if (pc.view().status === 'PC · bereit' && !ui.you.textContent) {
      for (const label of PC_STARTERS) chips.push({ label, run: () => sendToPc(label) })
    }
  } else if (state === 'error' && lastQuestion) {
    chips.push({ label: 'Nochmal versuchen', retry: true, run: () => void ask(lastQuestion) })
  } else if (state === 'idle' && !ui.you.textContent && !needsSetup()) {
    const fromSkills = loadInstalled().map(s => s.examples[0]).filter(Boolean)
    for (const label of [...new Set([...fromSkills, ...STARTERS])].slice(0, 4)) chips.push({ label, run: () => void ask(label) })
  }
  ui.chips.replaceChildren(
    ...chips.map(chip => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = chip.retry ? 'suggestion retry' : 'suggestion'
      button.textContent = chip.label
      button.addEventListener('click', () => {
        speaker.unlock()
        chip.run()
      })
      return button
    })
  )
}

function needsSetup(): boolean {
  // Im PC-Modus denkt der PC; dafür braucht das iPhone keinen eigenen Schlüssel.
  return target === 'phone' && !settings.keys[settings.provider].trim()
}

function refreshSetup(): void {
  const missing = needsSetup()
  ui.welcome.hidden = !missing
  // Der Hinweis steht oben, die Begrüßung unten — beide dürfen gleichzeitig.
  ui.install.hidden = !wantsInstallHint()
  ui.hint.textContent = missing ? '' : canDictate() ? 'Tippe auf die Kugel und sprich.' : 'Schreib James unten eine Nachricht.'
  if (missing) setState('setup')
  else if (state === 'setup') setState('idle')
  else renderChips()
}

// ─────────────────────────────────────────────────────────────
// Zuhören
// ─────────────────────────────────────────────────────────────

function listen(): void {
  if (needsSetup()) return openSettings()
  stopAll()
  if (!canDictate()) {
    ui.text.focus()
    return
  }
  setState('listening')
  ui.you.textContent = ''
  ui.answer.textContent = ''
  ui.answer.classList.remove('error')
  ui.hint.textContent = 'Sprich jetzt — tippen beendet.'
  if (useRecorder()) {
    void recorder.start({
      onPartial: () => undefined,
      onLevel: level => orb.kick(level * 0.25),
      onNoLevel: () => {
        ui.hint.textContent = 'Sprich jetzt — zum Senden auf die Kugel tippen.'
      },
      onTranscribing: () => {
        setState('thinking', 'Verstehe …')
        ui.hint.textContent = ''
      },
      onFinal: text => {
        ui.hint.textContent = ''
        if (text) void ask(text)
        else setState('idle', 'Nichts verstanden')
      },
      onError: message => showError(message)
    })
    return
  }
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
  lastQuestion = text
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
      tools: activeToolSpecs(),
      signal: controller.signal,
      runTool: call =>
        runTool(call.name, call.args, {
          signal: controller.signal,
          startTimer: (s, l) => timers.start(s, l),
          // Erst die laufende Ansage stoppen, dann fragen — sonst redet James über den Dialog hinweg.
          confirm: async text => {
            speaker.stop()
            return window.confirm(text)
          }
        }),
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
  if (settings.conversation && canDictate() && document.visibilityState === 'visible') {
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
  recorder.abort()
  speaker.stop()
  turn?.abort()
  turn = null
}

function primaryAction(): void {
  if (target === 'pc') {
    pc.press()
    return
  }
  speaker.unlock()
  timers.acknowledge()
  if (state === 'listening') {
    if (recorder.listening) recorder.stop()
    else listener.stop()
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

ui.talk.addEventListener('click', () => {
  // Im PC-Modus ist die Taste eine Sprechtaste (halten), siehe unten.
  if (target === 'phone') primaryAction()
})
ui.orbButton.addEventListener('click', primaryAction)

ui.talk.addEventListener('pointerdown', event => {
  if (target !== 'pc') return
  ui.talk.setPointerCapture(event.pointerId)
  ui.you.textContent = ''
  void pc.talkStart()
})
for (const type of ['pointerup', 'pointercancel'] as const) {
  ui.talk.addEventListener(type, () => {
    if (target === 'pc') pc.talkEnd()
  })
}
document.addEventListener('pointerdown', () => {
  if (target === 'pc') pc.unlockAudio()
}, { capture: true })

// ─────────────────────────────────────────────────────────────
// PC-Modus
// ─────────────────────────────────────────────────────────────

function sendToPc(text: string): void {
  pc.unlockAudio()
  if (pc.sendText(text)) ui.you.textContent = text
}

function renderPc(view: PcView): void {
  ui.app.dataset.state = view.look
  ui.status.textContent = view.status
  ui.answer.classList.remove('error')
  ui.answer.textContent = view.note
  ui.hint.textContent = view.status === 'PC · bereit' ? 'Taste halten und sprechen. Kugel antippen weckt oder unterbricht.' : ''
  $('pc-status').textContent = pc.settingsStatus()
  renderChips()
}

const modeSwitch = $('mode')
function setTarget(next: Target): void {
  if (next === 'pc' && !pc.paired) next = 'phone'
  if (next === target && pc.active === (next === 'pc')) return
  stopAll()
  target = next
  ui.app.dataset.target = next
  try {
    localStorage.setItem('james.target', next)
  } catch {
    // egal
  }
  for (const button of modeSwitch.querySelectorAll('button')) button.setAttribute('aria-checked', String(button.dataset.target === next))
  ui.you.textContent = ''
  ui.answer.textContent = ''
  pc.setEnabled(next === 'pc')
  if (next === 'phone') {
    setState('idle')
    refreshSetup()
  } else {
    ui.welcome.hidden = true
  }
}
modeSwitch.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest('button')
  if (button?.dataset.target) setTarget(button.dataset.target as Target)
})

function refreshPcPairing(): void {
  modeSwitch.hidden = !pc.paired
  $('pc-unpair').hidden = !pc.paired
  $('pc-status').textContent = pc.settingsStatus()
  if (!pc.paired && target === 'pc') setTarget('phone')
}

$('pc-pair').addEventListener('click', () => {
  const input = $<HTMLInputElement>('pc-link')
  const result = pc.pair(input.value)
  if (!result.ok) {
    $('pc-status').textContent = result.error ?? ''
    return
  }
  input.value = ''
  refreshPcPairing()
  setTarget('pc')
})
$('pc-paste').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('pc-link')
  try {
    input.value = (await navigator.clipboard.readText()).trim()
    $('pc-status').textContent = parsePcLink(input.value) ? 'Link erkannt – jetzt „Koppeln“ tippen.' : 'In der Zwischenablage steht kein Kopplungslink.'
  } catch {
    input.focus()
  }
})
$('pc-unpair').addEventListener('click', () => {
  if (!pc.paired || !confirm('Kopplung mit dem PC lösen?')) return
  pc.unpair()
  refreshPcPairing()
})

ui.text.addEventListener('input', () => ui.compose.classList.toggle('ready', ui.text.value.trim().length > 0))
ui.compose.addEventListener('submit', event => {
  event.preventDefault()
  speaker.unlock()
  const value = ui.text.value
  ui.text.value = ''
  ui.compose.classList.remove('ready')
  ui.text.blur()
  if (target === 'pc') sendToPc(value)
  else void ask(value)
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
  },
  summaries: {
    google: () => {
      if (accessToken()) return { text: 'Verbunden' }
      if (signedInOnce()) return { text: 'Neu anmelden', bad: true }
      return { text: validClientId(clientId()) ? 'Bereit zum Anmelden' : 'Aus' }
    },
    pc: () => (pc.paired ? { text: pc.paired.host } : { text: 'Nicht gekoppelt' }),
    store: () => {
      const count = loadInstalled().length
      return { text: count ? `${count} aktiv` : 'Entdecken' }
    },
    version: current.version
  },
  onOpenStore: () => market.open()
})
$('welcome-setup').addEventListener('click', () => openSettings('ki'))
$('open-settings').addEventListener('click', () => openSettings())

// Der Systemprompt wird vor jeder Frage neu gebaut; Änderungen wirken also sofort.
const market = setupMarket({ onChanged: () => renderChips() })
// „Installiere den Kochassistenten“ – das Werkzeug meldet sich hier.
window.addEventListener('james:skills', () => renderChips())
$('open-market').addEventListener('click', () => market.open())
// Installierte Fähigkeiten auch ohne Öffnen des Marktplatzes aktuell halten.
void market.refresh()

// Von der Marktplatz-Website: …/jarvis-iphone/#skill=koch
const linked = /^#skill=([a-z0-9-]{2,41})$/.exec(location.hash)?.[1]
if (linked) {
  window.history.replaceState(null, '', location.pathname + location.search)
  market.open(linked)
}

// ─────────────────────────────────────────────────────────────
// Google
// ─────────────────────────────────────────────────────────────

const googleStatus = $('google-status')
function refreshGoogle(message?: string): void {
  const input = $<HTMLInputElement>('google-client')
  if (document.activeElement !== input) input.value = clientId()
  $('google-origin').textContent = location.origin
  $('google-redirect').textContent = redirectUri()
  googleStatus.className = 'note'
  if (message) googleStatus.textContent = message
  else if (accessToken()) {
    googleStatus.className = 'note ok'
    googleStatus.textContent = 'Verbunden. Sag zum Beispiel: „Hab ich neue Mails?“'
  } else if (signedInOnce()) googleStatus.textContent = 'Anmeldung abgelaufen – einmal „Mit Google anmelden“ tippen.'
  else googleStatus.textContent = validClientId(clientId()) ? 'Bereit zum Anmelden.' : 'Noch nicht eingerichtet.'
  $('google-signout').hidden = !accessToken() && !signedInOnce()
}
$('google-client').addEventListener('change', () => {
  const value = $<HTMLInputElement>('google-client').value.trim()
  if (value && !validClientId(value)) return refreshGoogle('Das sieht nicht wie eine Client-ID aus (endet auf .apps.googleusercontent.com).')
  setClientId(value)
  refreshGoogle()
})
$('google-signin').addEventListener('click', () => {
  const value = $<HTMLInputElement>('google-client').value.trim()
  if (validClientId(value)) setClientId(value)
  try {
    signIn()
  } catch (error) {
    refreshGoogle(error instanceof Error ? error.message : String(error))
  }
})
$('google-signout').addEventListener('click', () => {
  signOut()
  refreshGoogle('Abgemeldet.')
})
$('open-settings').addEventListener('click', () => refreshGoogle())
refreshGoogle()
const returned = completeSignIn()
if (returned) {
  refreshGoogle(returned.ok ? undefined : returned.error)
  if (returned.ok) {
    ui.answer.classList.remove('error')
    ui.answer.textContent = 'Google ist verbunden. Frag mich nach deinen Mails oder Terminen.'
  } else {
    openSettings('google')
  }
}

// Vom PC: …/jarvis-iphone/#pc=192.168.1.20:8788&token=…
if (location.hash.startsWith('#pc=')) {
  const link = location.hash
  window.history.replaceState(null, '', location.pathname + location.search)
  const host = new URLSearchParams(link.slice(1)).get('pc') ?? ''
  if (confirm(`Mit James am PC (${host}) koppeln?`) && pc.pair(link).ok) {
    refreshPcPairing()
    setTarget('pc')
    // Die Kamera öffnet Safari. James vom Home-Bildschirm hat einen eigenen
    // Speicher und weiß von dieser Kopplung nichts — also den Link mitgeben.
    if (!matchMedia('(display-mode: standalone)').matches && !(navigator as { standalone?: boolean }).standalone) {
      openSettings('pc')
      $<HTMLInputElement>('pc-link').value = location.origin + location.pathname + link
      $('pc-copy').hidden = false
      $('pc-handoff').hidden = false
      $('pc-handoff').textContent = 'In Safari gekoppelt. Liegt James auf dem Home-Bildschirm: „Link kopieren“, James dort öffnen, Einstellungen → PC koppeln → Einfügen → Koppeln.'
    }
  }
}
$('pc-copy').addEventListener('click', async () => {
  const value = $<HTMLInputElement>('pc-link').value
  try {
    await navigator.clipboard.writeText(value)
    $('pc-copy').textContent = 'Kopiert'
  } catch {
    $<HTMLInputElement>('pc-link').select()
  }
})

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

// ─────────────────────────────────────────────────────────────
// Tastatur am iPhone
// ─────────────────────────────────────────────────────────────

/**
 * iOS schiebt beim Öffnen der Tastatur die ganze Seite nach oben, statt sie
 * kleiner zu machen — Kopfzeile weg, Eingabe halb verdeckt, und nach dem
 * Schließen bleibt alles verrutscht. Deshalb folgt die App der sichtbaren
 * Fläche und schiebt die Seite immer wieder an den Anfang.
 */
const viewport = window.visualViewport
if (viewport) {
  const fit = () => {
    document.documentElement.style.setProperty('--app-height', `${Math.round(viewport.height)}px`)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }
  viewport.addEventListener('resize', fit)
  viewport.addEventListener('scroll', fit)
  fit()
}
ui.text.addEventListener('blur', () => setTimeout(() => window.scrollTo(0, 0), 50))

// Tippen soll immer gehen: Ohne Schlüssel erklärt die App, statt das Feld zu sperren.
ui.text.addEventListener('focus', () => {
  if (state === 'listening') stopAll()
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
refreshPcPairing()
try {
  if (localStorage.getItem('james.target') === 'pc') setTarget('pc')
} catch {
  // egal
}

watchForUpdates({
  busy: () =>
    (target === 'pc' ? pc.busy : !['idle', 'setup', 'error'].includes(state)) ||
    !!document.querySelector('dialog[open]') ||
    !!ui.text.value.trim(),
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
