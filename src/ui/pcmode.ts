import { MicStream, VoicePlayback } from '../pc/audio'
import { PcLink, type LinkStatus, type PcState } from '../pc/link'
import { loadPcPairing, parsePcLink, savePcPairing, type PcPairing } from '../pc/pairing'
import type { Orb, OrbState } from './orb'

/**
 * PC-Modus: Das iPhone wird Mikrofon, Lautsprecher und Fernbedienung für
 * James am PC. Dort laufen Gmail, Kalender, Browser, Programme — alles, was
 * der PC-James kann, steht so auch unterwegs bereit (über Tailscale) oder im
 * Heimnetz.
 */

export interface PcView {
  /** Text oben links, z. B. „PC · hört zu“. */
  status: string
  /** Für Punkt und Knöpfe — dieselben Zustände wie der iPhone-Modus. */
  look: OrbState
  note: string
}

const LABELS: Record<PcState, string> = {
  idle: 'bereit',
  listening: 'hört zu',
  thinking: 'denkt nach',
  speaking: 'spricht',
  tool: 'arbeitet',
  research: 'recherchiert',
  confirm: 'wartet auf dich',
  error: 'Problem',
  offline: 'offline',
  connecting: 'verbindet',
  paused: 'stillgelegt'
}

const LOOKS: Partial<Record<PcState, OrbState>> = {
  listening: 'listening',
  thinking: 'thinking',
  tool: 'thinking',
  research: 'thinking',
  speaking: 'speaking',
  error: 'error',
  offline: 'error',
  connecting: 'setup',
  paused: 'setup',
  confirm: 'listening'
}

const OFFLINE_HELP =
  'PC nicht erreichbar. Läuft James am PC, und ist dort unter Menü → iPhone & Apple Watch die Fernbedienung an? ' +
  'Das iPhone muss im selben WLAN sein (oder im Tailnet) und dem Zertifikat des PCs vertrauen.'

export class PcMode {
  private pairing: PcPairing | null = loadPcPairing()
  private link: PcLink | null = null
  private playback = new VoicePlayback()
  private mic = new MicStream(pcm => this.link?.sendMic(pcm))
  private talking = false
  private linkStatus: LinkStatus = 'off'
  private pcState: PcState = 'offline'
  private note = ''
  private enabled = false
  /** Das Weckziel, das der PC beim Verbinden schickt — für später (native App). */
  wakeTarget: { mac: string; broadcast: string; address: string } | null = null

  constructor(private orb: Orb, private render: (view: PcView) => void) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.playback.wake()
        this.link?.ensure()
      } else {
        this.talkEnd()
      }
    })
    window.addEventListener('online', () => this.link?.ensure())
  }

  get paired(): PcPairing | null {
    return this.pairing
  }

  get active(): boolean {
    return this.enabled
  }

  /** Läuft gerade ein Gespräch mit dem PC? Dann kein stilles Neuladen. */
  get busy(): boolean {
    return this.talking || ['listening', 'thinking', 'speaking', 'tool', 'research', 'confirm'].includes(this.pcState)
  }

  pair(input: string): { ok: boolean; error?: string } {
    const pairing = parsePcLink(input)
    if (!pairing) return { ok: false, error: 'Das ist kein Kopplungslink vom PC. Er steht am PC unter Menü → iPhone & Apple Watch.' }
    this.pairing = pairing
    savePcPairing(pairing)
    if (this.enabled) this.restart()
    return { ok: true }
  }

  unpair(): void {
    this.pairing = null
    savePcPairing(null)
    this.link?.stop()
    this.link = null
  }

  /** In den PC-Modus wechseln (oder zurück). */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (on) this.restart()
    else {
      this.talkEnd()
      this.playback.flush()
      this.link?.stop()
      this.link = null
      void this.mic.close()
    }
  }

  private restart(): void {
    this.link?.stop()
    if (!this.pairing) {
      this.linkStatus = 'off'
      this.note = 'Noch kein PC gekoppelt: Einstellungen → PC koppeln.'
      this.update()
      return
    }
    this.link = new PcLink(this.pairing, {
      status: (status, detail) => {
        this.linkStatus = status
        if (status === 'unreachable') this.note = OFFLINE_HELP
        else if (status === 'rejected') this.note = detail ?? ''
        else if (status === 'online' && this.note === OFFLINE_HELP) this.note = ''
        this.update()
      },
      state: state => {
        this.pcState = state
        // Neue Runde: Was noch an Ton in der Warteschlange lag, gehört zur alten Antwort.
        if (state === 'listening') this.playback.flush()
        this.update()
      },
      note: text => {
        this.note = text
        this.update()
      },
      voice: pcm => {
        if (!this.playback.push(pcm) && !this.playback.ready) {
          this.note = 'Einmal auf den Bildschirm tippen, dann darf James sprechen.'
          this.update()
        } else {
          this.orb.kick(0.15)
        }
      },
      wake: target => {
        this.wakeTarget = target
      }
    })
    this.link.start()
    this.update()
  }

  /** Jede Berührung: Ton freischalten (iOS verlangt eine Geste). */
  unlockAudio(): void {
    void this.playback.ensure()
  }

  /** Kugel antippen: wie der Druck auf die Kugel am PC — wecken, unterbrechen, stilllegen. */
  press(): void {
    this.playback.flush()
    this.link?.send({ t: 'press' })
  }

  sendText(text: string): boolean {
    const clean = text.trim()
    if (!clean) return false
    if (!this.link?.send({ t: 'text', text: clean })) {
      this.note = 'Nicht verbunden. Der Text wurde nicht gesendet.'
      this.update()
      return false
    }
    this.note = ''
    this.update()
    return true
  }

  async talkStart(): Promise<void> {
    if (this.talking || !this.link?.online) return
    this.talking = true
    this.playback.flush()
    await this.playback.ensure()
    try {
      await this.mic.start()
      this.link.send({ t: 'mic', on: true })
    } catch (error) {
      this.talking = false
      this.note = `Kein Zugriff aufs Mikrofon: ${error instanceof Error ? error.message : String(error)}`
    }
    this.update()
  }

  talkEnd(): void {
    if (!this.talking) return
    this.talking = false
    this.mic.stop()
    this.link?.send({ t: 'mic', on: false })
    this.update()
  }

  view(): PcView {
    if (!this.pairing) return { status: 'PC · nicht gekoppelt', look: 'setup', note: this.note }
    if (this.linkStatus !== 'online') {
      const text = this.linkStatus === 'unreachable' ? 'PC · nicht erreichbar' : this.linkStatus === 'rejected' ? 'PC · abgelehnt' : 'PC · verbindet'
      return { status: text, look: this.linkStatus === 'connecting' ? 'setup' : 'error', note: this.note }
    }
    if (this.talking) return { status: 'PC · hört zu (loslassen zum Senden)', look: 'listening', note: this.note }
    return { status: `PC · ${LABELS[this.pcState] ?? this.pcState}`, look: LOOKS[this.pcState] ?? 'idle', note: this.note }
  }

  settingsStatus(): string {
    if (!this.pairing) return 'Nicht gekoppelt.'
    const where = `PC: ${this.pairing.host}`
    if (!this.enabled) return `${where}. Oben auf „PC“ tippen zum Verbinden.`
    return `${where} · ${this.view().status.replace(/^PC · /, '')}`
  }

  private update(): void {
    if (!this.enabled) return
    const view = this.view()
    this.orb.set(view.look)
    this.render(view)
  }
}
