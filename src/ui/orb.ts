/**
 * Die Kugel — dieselbe Figur wie am Rechner: ein weicher, atmender Körper,
 * dessen Farbe und Unruhe zeigen, was James gerade tut.
 */

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'setup'

interface Look {
  edge: [number, number, number]
  body: [number, number, number]
  core: [number, number, number]
  energy: number
  speed: number
}

const LOOKS: Record<OrbState, Look> = {
  idle: { edge: [26, 60, 160], body: [52, 130, 240], core: [235, 245, 255], energy: 0.05, speed: 0.35 },
  setup: { edge: [26, 50, 120], body: [60, 100, 180], core: [210, 225, 245], energy: 0.03, speed: 0.25 },
  listening: { edge: [20, 110, 170], body: [70, 200, 255], core: [240, 255, 255], energy: 0.1, speed: 0.9 },
  thinking: { edge: [70, 40, 160], body: [140, 110, 255], core: [240, 230, 255], energy: 0.09, speed: 1.6 },
  speaking: { edge: [24, 70, 190], body: [70, 150, 255], core: [245, 250, 255], energy: 0.12, speed: 1.1 },
  error: { edge: [120, 40, 40], body: [230, 110, 90], core: [255, 235, 225], energy: 0.04, speed: 0.4 }
}

export class Orb {
  private ctx: CanvasRenderingContext2D
  private state: OrbState = 'idle'
  private look: Look = { ...LOOKS.idle, edge: [...LOOKS.idle.edge], body: [...LOOKS.idle.body], core: [...LOOKS.idle.core] }
  private time = 0
  private last = 0
  private pulse = 0
  private frame = 0
  private slow = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas nicht verfügbar')
    this.ctx = ctx
    new ResizeObserver(() => this.resize()).observe(canvas)
    this.resize()
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.play()))
    this.play()
  }

  set(state: OrbState): void {
    this.state = state
  }

  /** Ein kurzer Schub, z. B. bei jedem gesprochenen Satz. */
  kick(amount = 1): void {
    this.pulse = Math.min(1.5, this.pulse + amount)
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    const { width, height } = this.canvas.getBoundingClientRect()
    this.canvas.width = Math.max(1, Math.round(width * ratio))
    this.canvas.height = Math.max(1, Math.round(height * ratio))
  }

  private play(): void {
    if (this.frame) return
    this.last = performance.now()
    const tick = (now: number) => {
      this.frame = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.step(dt)
      this.draw()
    }
    this.frame = requestAnimationFrame(tick)
  }

  private pause(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private step(dt: number): void {
    const target = LOOKS[this.state]
    const k = 1 - Math.exp(-dt * 4)
    for (const key of ['edge', 'body', 'core'] as const) {
      for (let i = 0; i < 3; i++) this.look[key][i] += (target[key][i] - this.look[key][i]) * k
    }
    this.look.energy += (target.energy - this.look.energy) * k
    this.look.speed += (target.speed - this.look.speed) * k
    this.time += dt * this.look.speed * (this.slow ? 0.3 : 1)
    this.pulse *= Math.exp(-dt * 3)
    // Beim Sprechen ohne echten Pegel: ein unregelmäßiges Wippen wie Silben.
    if (this.state === 'speaking' && Math.random() < dt * 7) this.kick(0.25 + Math.random() * 0.35)
  }

  private draw(): void {
    const { ctx, canvas, look, time } = this
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    // Schein reicht bis 1,8 × Radius; so bleibt er innerhalb der Leinwand und zeigt keine Kanten.
    const base = Math.min(w, h) * 0.26 * (1 + this.pulse * 0.06)
    ctx.clearRect(0, 0, w, h)

    const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

    // Schein um die Kugel
    const glow = ctx.createRadialGradient(cx, cy, base * 0.6, cx, cy, base * 1.8)
    glow.addColorStop(0, rgb(look.body, 0.35 + this.pulse * 0.1))
    glow.addColorStop(1, rgb(look.edge, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    // Lauschen: ein Ring, der nach außen läuft
    if (this.state === 'listening') {
      const phase = (time * 0.6) % 1
      ctx.strokeStyle = rgb(look.body, 0.5 * (1 - phase))
      ctx.lineWidth = base * 0.03
      ctx.beginPath()
      ctx.arc(cx, cy, base * (1.1 + phase * 0.65), 0, Math.PI * 2)
      ctx.stroke()
    }

    // Körper: verformter Kreis
    const energy = look.energy + this.pulse * 0.05
    const points = 72
    ctx.beginPath()
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2
      const wobble =
        Math.sin(a * 2 + time * 1.3) * 0.5 +
        Math.sin(a * 3 - time * 1.7 + 1.2) * 0.3 +
        Math.sin(a * 5 + time * 2.3 + 2.1) * 0.2
      const r = base * (1 + wobble * energy)
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    const hx = cx - base * 0.22 + Math.sin(time * 0.7) * base * 0.06
    const hy = cy - base * 0.2 + Math.cos(time * 0.9) * base * 0.06
    const body = ctx.createRadialGradient(hx, hy, base * 0.05, cx, cy, base * 1.15)
    body.addColorStop(0, rgb(look.core))
    body.addColorStop(0.28, rgb(look.core, 0.95))
    body.addColorStop(0.45, rgb(look.body))
    body.addColorStop(1, rgb(look.edge))
    ctx.fillStyle = body
    ctx.shadowColor = rgb(look.body, 0.8)
    ctx.shadowBlur = base * 0.35
    ctx.fill()
    ctx.shadowBlur = 0

    // Weicher Rand wie im Symbol
    ctx.strokeStyle = rgb(look.core, 0.12)
    ctx.lineWidth = base * 0.05
    ctx.stroke()
  }
}
