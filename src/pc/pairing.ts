/**
 * Kopplung mit James am PC.
 *
 * Der PC zeigt unter Einstellungen → Telefon einen Link der Form
 *   https://192.168.1.20:8788/#host=192.168.1.20:8788&token=…
 * Neuere PC-Fassungen zeigen zusätzlich einen Link direkt in diese App:
 *   https://nivarro-boop.github.io/jarvis-iphone/#pc=192.168.1.20:8788&token=…
 * Beides wird hier angenommen. Gespeichert wird nur Adresse und Marke.
 */

export interface PcPairing {
  /** `host:port` des PC-James. */
  host: string
  token: string
}

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i

function fragmentParams(text: string): URLSearchParams | null {
  const at = text.indexOf('#')
  return at >= 0 ? new URLSearchParams(text.slice(at + 1)) : null
}

export function parsePcLink(input: string): PcPairing | null {
  const text = input.trim()
  const params = fragmentParams(text)
  if (!params) return null
  const host = (params.get('pc') ?? params.get('host') ?? '').trim().toLowerCase()
  const token = (params.get('token') ?? '').trim()
  if (!HOST.test(host) || token.length < 8 || token.length > 200) return null
  // Beim PC-Link muss die Adresse vorne zum Host im Fragment passen — sonst
  // könnte ein untergeschobener Link die Marke an einen fremden Rechner lenken.
  if (params.has('host') && !params.has('pc')) {
    const front = /^https?:\/\/([^/#?]+)/i.exec(text)?.[1]?.toLowerCase()
    if (front !== host) return null
  }
  return { host, token }
}

const KEY = 'james.pc.v1'

export function loadPcPairing(): PcPairing | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PcPairing | null
    return raw && typeof raw.host === 'string' && typeof raw.token === 'string' && HOST.test(raw.host) ? raw : null
  } catch {
    return null
  }
}

export function savePcPairing(pairing: PcPairing | null): void {
  try {
    if (pairing) localStorage.setItem(KEY, JSON.stringify(pairing))
    else localStorage.removeItem(KEY)
  } catch {
    // ohne Speicher eben nur bis zum Schließen
  }
}
