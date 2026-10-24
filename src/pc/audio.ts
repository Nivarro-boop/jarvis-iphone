/**
 * Ton zwischen iPhone und PC-James — dasselbe Format wie die Fernbedienung
 * des PCs: Mikrofon als 16-kHz-PCM nach oben, James' Stimme als 24-kHz-PCM
 * nach unten. Übernommen aus `resources/companion/app.js` (James-Jarvis).
 */

export const VOICE_RATE = 24_000

/** Spielt ankommende PCM-Blöcke nahtlos hintereinander ab. */
export class VoicePlayback {
  private context: AudioContext | null = null
  private nextTime = 0
  private sources = new Set<AudioBufferSourceNode>()

  /** Nur innerhalb einer Berührung aufrufen — sonst gibt iOS keinen Ton heraus. */
  async ensure(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: VOICE_RATE, latencyHint: 'interactive' })
      // Safari kennt „interrupted“ (Anruf, Wecker): danach selbst wieder anlaufen.
      this.context.addEventListener('statechange', () => {
        if (this.context && this.context.state !== 'running') void this.wake()
      })
    }
    await this.wake()
  }

  get ready(): boolean {
    return this.context?.state === 'running'
  }

  async wake(): Promise<void> {
    if (!this.context || this.context.state === 'running') return
    try {
      await this.context.resume()
      // Die Uhr stand still; alte Planung würde sonst auf einen Schlag loslaufen.
      this.nextTime = 0
    } catch {
      // ohne Geste nicht möglich; die nächste Berührung holt es nach
    }
  }

  push(pcm: Int16Array): boolean {
    const ctx = this.context
    if (!ctx) return false
    if (ctx.state !== 'running') {
      void this.wake()
      return false
    }
    const rate = ctx.sampleRate
    const samples = rate === VOICE_RATE ? pcm.length : Math.round((pcm.length * rate) / VOICE_RATE)
    const buffer = ctx.createBuffer(1, samples, rate)
    const channel = buffer.getChannelData(0)
    if (rate === VOICE_RATE) {
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000
    } else {
      const ratio = VOICE_RATE / rate
      for (let i = 0; i < samples; i++) {
        const pos = i * ratio
        const index = Math.floor(pos)
        const a = pcm[index] ?? 0
        const b = pcm[index + 1] ?? a
        channel[i] = (a + (b - a) * (pos - index)) / 0x8000
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const now = ctx.currentTime
    if (this.nextTime < now + 0.06) this.nextTime = now + 0.06
    source.start(this.nextTime)
    this.nextTime += buffer.duration
    this.sources.add(source)
    source.onended = () => this.sources.delete(source)
    return true
  }

  get playing(): boolean {
    return this.sources.size > 0
  }

  /** Unterbrechen: alles Geplante verwerfen. */
  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // war schon durch
      }
    }
    this.sources.clear()
    this.nextTime = 0
  }
}

/** Mikrofon → 16-kHz-PCM-Blöcke über ein AudioWorklet. */
export class MicStream {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private active = false

  constructor(private onFrame: (pcm: Int16Array) => void) {}

  private alive(): boolean {
    if (!this.node || !this.stream || !this.context || this.context.state === 'closed') return false
    // Nach einem Anruf beendet iOS die Spur still; dann neu aufbauen.
    return this.stream.getAudioTracks().some(track => track.readyState === 'live')
  }

  private async ensure(): Promise<void> {
    if (this.alive()) {
      if (this.context!.state !== 'running') await this.context!.resume()
      return
    }
    await this.close()
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieser Browser gibt das Mikrofon nicht frei.')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    })
    this.context = new AudioContext({ latencyHint: 'interactive' })
    if (this.context.state === 'suspended') await this.context.resume()
    await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pc-mic-worklet.js`)
    const source = this.context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.context, 'mic-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit'
    })
    this.node.port.onmessage = event => {
      if (this.active) this.onFrame(event.data as Int16Array)
    }
    source.connect(this.node)
  }

  async start(): Promise<void> {
    await this.ensure()
    this.active = true
    this.node!.port.postMessage({ type: 'enable', value: true })
  }

  stop(): void {
    this.active = false
    this.node?.port.postMessage({ type: 'enable', value: false })
  }

  /** Spuren beenden, sonst bleibt der rote Aufnahmebalken von iOS stehen. */
  async close(): Promise<void> {
    this.active = false
    try {
      this.node?.disconnect()
    } catch {
      // schon weg
    }
    if (this.node) this.node.port.onmessage = null
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => undefined)
    this.node = null
    this.stream = null
    this.context = null
  }
}
