/**
 * Google-Anmeldung direkt aus der Web-App, ohne eigenen Server.
 *
 * OAuth 2.0 für Browser-Apps: Die App leitet zu Google weiter und bekommt das
 * Zugriffstoken im Fragment zurück. Der Schlüssel (Client-ID) gehört dem
 * Nutzer selbst, angelegt in der Google Cloud Console — so laufen Gmail und
 * Kalender über sein eigenes Projekt, und niemand sonst sieht etwas.
 *
 * Grenze ohne Server: Das Token gilt eine Stunde. Danach genügt ein Tipp auf
 * „Neu anmelden“; Google fragt beim zweiten Mal nicht erneut nach Rechten.
 */

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events'
]

const KEYS = { client: 'james.google.client', token: 'james.google.token', state: 'james.google.state' }

interface StoredToken {
  token: string
  expires: number
  scope: string
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ohne Speicher keine dauerhafte Anmeldung
  }
}

export function clientId(): string {
  return read<string>(KEYS.client) ?? ''
}

export function setClientId(id: string): void {
  write(KEYS.client, id.trim() || null)
}

export function validClientId(id: string): boolean {
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim())
}

/** Ist ein gültiges Token da? */
export function accessToken(): string | null {
  const stored = read<StoredToken>(KEYS.token)
  return stored && stored.expires > Date.now() + 30_000 ? stored.token : null
}

export function signedInOnce(): boolean {
  return read<StoredToken>(KEYS.token) !== null
}

export function signOut(): void {
  const token = read<StoredToken>(KEYS.token)?.token
  write(KEYS.token, null)
  if (token) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined)
}

export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href
}

/** Zu Google weiterleiten. Kommt mit `#access_token=…` zurück. */
export function signIn(): void {
  const id = clientId()
  if (!validClientId(id)) throw new Error('Zuerst die Client-ID aus der Google Cloud Console eintragen.')
  const state = crypto.randomUUID()
  write(KEYS.state, state)
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
    // Beim ersten Mal Rechte zeigen, danach still.
    prompt: signedInOnce() ? 'select_account' : 'consent'
  })
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/**
 * Beim Start: Kommt die App gerade von Google zurück? Dann Token übernehmen
 * und das Fragment sofort entfernen, damit es nicht im Verlauf steht.
 */
export function completeSignIn(hash = location.hash): { ok: boolean; error?: string } | null {
  if (!/^#(access_token|error)=|&access_token=|&error=/.test(hash)) return null
  const params = new URLSearchParams(hash.slice(1))
  window.history.replaceState(null, '', location.pathname + location.search)
  const expected = read<string>(KEYS.state)
  write(KEYS.state, null)
  if (!expected || params.get('state') !== expected) return { ok: false, error: 'Anmeldung abgelehnt: Sie kam nicht von dieser App.' }
  const error = params.get('error')
  if (error) return { ok: false, error: error === 'access_denied' ? 'Anmeldung abgebrochen.' : `Google meldet: ${error}` }
  const token = params.get('access_token')
  const expiresIn = Number(params.get('expires_in') ?? 3600)
  if (!token) return { ok: false, error: 'Google hat kein Token geschickt.' }
  write(KEYS.token, { token, expires: Date.now() + expiresIn * 1000, scope: params.get('scope') ?? '' } satisfies StoredToken)
  return { ok: true }
}

export class GoogleAuthError extends Error {}

/** Aufruf einer Google-Schnittstelle mit dem gespeicherten Token. */
export async function googleFetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const token = accessToken()
  if (!token) {
    throw new GoogleAuthError(
      signedInOnce() ? 'Die Google-Anmeldung ist abgelaufen. In den Einstellungen auf „Mit Google anmelden“ tippen.' : 'Google ist noch nicht verbunden (Einstellungen → Google).'
    )
  }
  const response = await fetch(url, { ...init, signal, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (response.status === 401) {
    write(KEYS.token, null)
    throw new GoogleAuthError('Google hat die Anmeldung zurückgezogen. Bitte neu anmelden.')
  }
  if (response.status === 403) {
    const body = await response.text().catch(() => '')
    throw new Error(/has not been used|is disabled/.test(body) ? 'Die Schnittstelle ist im Google-Projekt nicht aktiviert (Gmail API bzw. Calendar API einschalten).' : 'Google verweigert den Zugriff.')
  }
  if (!response.ok) throw new Error(`Google meldet Fehler ${response.status}.`)
  return response
}
