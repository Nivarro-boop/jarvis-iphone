import type { PcPairing } from './pairing'

/**
 * Die Leitung zum PC-James. Protokoll wie `src/shared/companion.ts` im
 * Windows-Projekt: JSON-Textrahmen für Steuerung, Binärrahmen mit einem
 * Kennbyte für Ton.
 *
 * Diese App kommt von GitHub Pages über HTTPS; deshalb geht nur `wss://`.
 * Der PC braucht dafür sein Zertifikat (eigene Stelle auf dem iPhone
 * installiert, oder Tailscale) — genau wie für die Sprechtaste in Safari.
 */

const TAG_MIC = 0x01
const TAG_VOICE = 0x02
const PATH = '/ws/phone'
const PING_EVERY = 15_000
const SILENCE_LIMIT = 45_000

/** Zustände der Kugel am PC (CrystalState im Windows-Projekt). */
export type PcState =
  | 'idle' | 'listening' | 'thinking' | 'speaking' | 'tool' | 'research'
  | 'confirm' | 'error' | 'offline' | 'connecting' | 'paused'

export type LinkStatus = 'off' | 'connecting' | 'online' | 'rejected' | 'unreachable'

export interface LinkEvents {
  status(status: LinkStatus, detail?: string): void
  state(state: PcState, paused: boolean): void
  note(text: string): void
  voice(pcm: Int16Array): void
  wake(target: { mac: string; broadcast: string; address: string }): void
}

export class PcLink {
  private socket: WebSocket | null = null
  private retry: number | undefined
  private delay = 1000
  private heartbeat: number | undefined
  private lastHeard = 0
  private failures = 0
  private wanted = false

  constructor(private pairing: PcPairing, private events: LinkEvents) {}

  get online(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  start(): void {
    this.wanted = true
    this.connect()
  }

  stop(): void {
    this.wanted = false
    clearTimeout(this.retry)
    this.discard()
    this.events.status('off')
  }

  /** Nach Rückkehr aus dem Hintergrund: tote Leitungen erkennen. */
  ensure(): void {
    if (!this.wanted) return
    if (!this.socket || this.socket.readyState > WebSocket.OPEN || Date.now() - this.lastHeard > SILENCE_LIMIT) {
      this.delay = 1000
      this.connect()
    }
  }

  send(message: { t: 'press' } | { t: 'text'; text: string } | { t: 'mic'; on: boolean } | { t: 'pause'; paused: boolean }): boolean {
    if (!this.online) return false
    this.socket!.send(JSON.stringify(message))
    return true
  }

  sendMic(pcm: Int16Array): void {
    if (!this.online) return
    const frame = new Uint8Array(1 + pcm.byteLength)
    frame[0] = TAG_MIC
    frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1)
    this.socket!.send(frame)
  }

  private discard(): void {
    const dying = this.socket
    this.socket = null
    clearInterval(this.heartbeat)
    if (dying) {
      dying.onopen = dying.onmessage = dying.onclose = dying.onerror = null
      try {
        dying.close()
      } catch {
        // schon zu
      }
    }
  }

  private connect(): void {
    clearTimeout(this.retry)
    this.discard()
    this.events.status('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(`wss://${this.pairing.host}${PATH}?token=${encodeURIComponent(this.pairing.token)}`)
    } catch {
      this.schedule()
      return
    }
    ws.binaryType = 'arraybuffer'
    this.socket = ws
    this.lastHeard = Date.now()
    let opened = false

    ws.onopen = () => {
      opened = true
      this.failures = 0
      this.delay = 1000
      this.lastHeard = Date.now()
      ws.send(JSON.stringify({ t: 'hello', name: 'iPhone (James-App)' }))
      this.events.status('online')
      clearInterval(this.heartbeat)
      this.heartbeat = window.setInterval(() => this.beat(), PING_EVERY)
    }

    ws.onmessage = event => {
      this.lastHeard = Date.now()
      if (typeof event.data === 'string') {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        this.handle(msg)
        return
      }
      const bytes = new Uint8Array(event.data as ArrayBuffer)
      if (bytes[0] !== TAG_VOICE) return
      // Nutzlast liegt ungerade ausgerichtet; Int16Array braucht gerade Grenzen.
      const pcm = new Int16Array((bytes.byteLength - 1) >> 1)
      new Uint8Array(pcm.buffer).set(bytes.subarray(1, 1 + pcm.byteLength))
      this.events.voice(pcm)
    }

    ws.onclose = event => {
      if (this.socket !== ws) return
      this.socket = null
      clearInterval(this.heartbeat)
      if (event.code === 1008 || event.code === 1002) {
        this.wanted = false
        this.events.status('rejected', 'Der PC hat die Kopplung abgelehnt. Bitte neu koppeln.')
        return
      }
      if (!opened) this.failures++
      // Mehrmals gar nicht erst verbunden: meist schläft der PC, oder das
      // iPhone traut seinem Zertifikat nicht.
      this.events.status(this.failures >= 2 ? 'unreachable' : 'connecting')
      this.schedule()
    }
  }

  private handle(msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'state':
        this.events.state(msg.state as PcState, Boolean(msg.paused))
        break
      case 'note':
        if (typeof msg.text === 'string') this.events.note(msg.text)
        break
      case 'error':
        if (typeof msg.message === 'string') this.events.note(msg.message)
        break
      case 'wake':
        if (typeof msg.mac === 'string' && typeof msg.broadcast === 'string') {
          this.events.wake({ mac: msg.mac, broadcast: msg.broadcast, address: typeof msg.address === 'string' ? msg.address : '' })
        }
        break
      case 'bye':
        this.events.note(typeof msg.reason === 'string' ? msg.reason : 'Der PC hat sich verabschiedet.')
        break
    }
  }

  private beat(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || Date.now() - this.lastHeard > SILENCE_LIMIT) {
      this.connect()
      return
    }
    try {
      this.socket.send(JSON.stringify({ t: 'ping' }))
    } catch {
      this.connect()
    }
  }

  private schedule(): void {
    if (!this.wanted) return
    clearTimeout(this.retry)
    this.retry = window.setTimeout(() => this.connect(), this.delay)
    this.delay = Math.min(20_000, this.delay * 1.6)
  }
}
