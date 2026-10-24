import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PcLink, type LinkEvents } from '../src/pc/link'
import { parsePcLink } from '../src/pc/pairing'

describe('parsePcLink', () => {
  it('nimmt den Link der PC-Fernbedienung', () => {
    expect(parsePcLink('https://192.168.1.20:8788/#host=192.168.1.20:8788&token=abcdefgh_123-XY')).toEqual({
      host: '192.168.1.20:8788',
      token: 'abcdefgh_123-XY'
    })
  })

  it('nimmt den App-Link vom PC', () => {
    expect(parsePcLink('https://nivarro-boop.github.io/jarvis-iphone/#pc=james-pc.tail1234.ts.net:8788&token=abcdefghij')).toEqual({
      host: 'james-pc.tail1234.ts.net:8788',
      token: 'abcdefghij'
    })
  })

  it('lehnt untergeschobene oder kaputte Links ab', () => {
    // Vorne ein fremder Server, im Fragment der PC: Die Marke soll nicht dorthin.
    expect(parsePcLink('https://evil.example/#host=192.168.1.20:8788&token=abcdefgh')).toBeNull()
    expect(parsePcLink('https://192.168.1.20:8788/#host=192.168.1.20:8788&token=kurz')).toBeNull()
    expect(parsePcLink('https://192.168.1.20:8788/')).toBeNull()
    expect(parsePcLink('#pc=evil.example/pfad&token=abcdefgh')).toBeNull()
  })
})

class FakeSocket {
  static last: FakeSocket
  static OPEN = 1
  readyState = 0
  binaryType = 'blob'
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) {
    FakeSocket.last = this
  }
  send(data: unknown) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

describe('PcLink', () => {
  let events: { [K in keyof LinkEvents]: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    events = { status: vi.fn(), state: vi.fn(), note: vi.fn(), voice: vi.fn(), wake: vi.fn() }
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('verbindet verschlüsselt mit Marke, meldet sich an und gibt Zustände weiter', () => {
    const link = new PcLink({ host: '10.0.0.2:8788', token: 'a+b/c' }, events as unknown as LinkEvents)
    link.start()
    const ws = FakeSocket.last
    expect(ws.url).toBe('wss://10.0.0.2:8788/ws/phone?token=a%2Bb%2Fc')
    ws.open()
    expect(JSON.parse(ws.sent[0] as string)).toMatchObject({ t: 'hello' })
    expect(events.status).toHaveBeenLastCalledWith('online')

    ws.onmessage?.({ data: JSON.stringify({ t: 'state', state: 'thinking', paused: false, until: null }) })
    expect(events.state).toHaveBeenCalledWith('thinking', false)
    ws.onmessage?.({ data: JSON.stringify({ t: 'wake', mac: 'aa:bb:cc:dd:ee:ff', broadcast: '10.0.0.255', address: '10.0.0.2', port: 8788 }) })
    expect(events.wake).toHaveBeenCalledWith({ mac: 'aa:bb:cc:dd:ee:ff', broadcast: '10.0.0.255', address: '10.0.0.2' })

    expect(link.send({ t: 'text', text: 'Hallo' })).toBe(true)
    expect(JSON.parse(ws.sent.at(-1) as string)).toEqual({ t: 'text', text: 'Hallo' })
  })

  it('schickt Mikrofonton mit Kennbyte und liest Stimme trotz ungerader Ausrichtung', () => {
    const link = new PcLink({ host: 'pc:8788', token: 'abcdefgh' }, events as unknown as LinkEvents)
    link.start()
    const ws = FakeSocket.last
    ws.open()
    link.sendMic(new Int16Array([1, -2]))
    const frame = ws.sent.at(-1) as Uint8Array
    expect(frame[0]).toBe(0x01)
    expect(Array.from(new Int16Array(frame.slice(1).buffer))).toEqual([1, -2])

    const voice = new Uint8Array(5)
    voice[0] = 0x02
    voice.set(new Uint8Array(new Int16Array([300, -300]).buffer), 1)
    ws.onmessage?.({ data: voice.buffer })
    expect(Array.from(events.voice.mock.calls[0][0] as Int16Array)).toEqual([300, -300])
  })

  it('versucht es nach Abbruch erneut, gibt bei abgelehnter Marke aber auf', () => {
    const link = new PcLink({ host: 'pc:8788', token: 'abcdefgh' }, events as unknown as LinkEvents)
    link.start()
    const first = FakeSocket.last
    first.onclose?.({ code: 1006 })
    first.onclose = null
    vi.advanceTimersByTime(1100)
    const second = FakeSocket.last
    expect(second).not.toBe(first)
    second.onclose?.({ code: 1006 })
    expect(events.status).toHaveBeenLastCalledWith('unreachable')
    vi.advanceTimersByTime(2000)
    const third = FakeSocket.last
    third.onclose?.({ code: 1008 })
    expect(events.status).toHaveBeenLastCalledWith('rejected', expect.stringContaining('neu koppeln'))
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.last).toBe(third)
  })
})
