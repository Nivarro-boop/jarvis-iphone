/**
 * Timer, solange die App offen ist. Eine Web-App darf im Hintergrund nicht
 * klingeln — das sagt James beim Stellen auch so.
 */
interface Running {
  label: string
  end: number
  element: HTMLElement
  done: boolean
  handle: number
}

export class Timers {
  private running: Running[] = []
  private ticker = 0
  private audio: AudioContext | null = null

  constructor(private host: HTMLElement, private onDone: (label: string) => void) {}

  start(seconds: number, label: string): void {
    const element = document.createElement('div')
    element.className = 'timer'
    const text = document.createElement('span')
    const close = document.createElement('button')
    close.className = 'icon-button small'
    close.type = 'button'
    close.setAttribute('aria-label', `Timer ${label} entfernen`)
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>'
    element.append(text, close)
    this.host.append(element)
    const entry: Running = { label, end: Date.now() + seconds * 1000, element, done: false, handle: 0 }
    entry.handle = window.setTimeout(() => this.ring(entry), seconds * 1000)
    close.addEventListener('click', () => this.remove(entry))
    this.running.push(entry)
    this.render()
    if (!this.ticker) this.ticker = window.setInterval(() => this.render(), 250)
  }

  /** Klingelnde Timer verstummen, sobald jemand tippt. */
  acknowledge(): void {
    for (const entry of this.running.filter(r => r.done)) this.remove(entry)
  }

  private ring(entry: Running): void {
    entry.done = true
    entry.element.classList.add('done')
    this.render()
    this.beep()
    this.onDone(entry.label)
  }

  private remove(entry: Running): void {
    clearTimeout(entry.handle)
    entry.element.remove()
    this.running = this.running.filter(r => r !== entry)
    if (!this.running.length) {
      clearInterval(this.ticker)
      this.ticker = 0
    }
  }

  private render(): void {
    for (const entry of this.running) {
      const left = Math.max(0, Math.ceil((entry.end - Date.now()) / 1000))
      const m = Math.floor(left / 60)
      const s = String(left % 60).padStart(2, '0')
      const span = entry.element.firstElementChild as HTMLElement
      span.textContent = entry.done ? `${entry.label} – fertig` : `${entry.label} ${m}:${s}`
    }
  }

  private beep(): void {
    try {
      this.audio ??= new AudioContext()
      const ctx = this.audio
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        const t = ctx.currentTime + i * 0.35
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.3)
      }
    } catch {
      // Kein Ton möglich; die Ansage reicht.
    }
  }
}
