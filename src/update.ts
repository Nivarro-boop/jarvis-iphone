/**
 * Hält James auf dem neuesten Stand von GitHub.
 *
 * Jeder Push auf `main` baut die App neu, legt eine `version.json` daneben und
 * ein GitHub-Release `v0.2.<Lauf>` an.
 * Die App fragt die beim Start, beim Zurückkehren und alle 30 Minuten ab.
 * Gibt es etwas Neueres:
 * - direkt nach dem Start, bevor jemand etwas getan hat: still neu laden;
 * - mitten im Gebrauch: Hinweis mit „Aktualisieren“, damit kein Gespräch abreißt.
 */

export interface BuildInfo {
  version: string
  sha: string
  date: string
  notes: string[]
}

export const current: BuildInfo = __BUILD__

const CHECK_EVERY = 30 * 60_000
const RELOAD_GUARD = 'james.update-reload'

export function isNewer(remote: BuildInfo | null, local: BuildInfo = current): boolean {
  return !!remote && typeof remote.sha === 'string' && remote.sha !== local.sha && local.sha !== 'lokal'
}

export async function fetchRemote(base = import.meta.env.BASE_URL): Promise<BuildInfo | null> {
  try {
    const response = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as BuildInfo
    return typeof data?.sha === 'string' && typeof data.version === 'string' ? { ...data, notes: Array.isArray(data.notes) ? data.notes : [] } : null
  } catch {
    return null
  }
}

/** Neue Dateien holen und neu laden. Der Service Worker liefert danach die neue Fassung. */
export async function applyUpdate(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
  } catch {
    // ohne Service Worker reicht das Neuladen
  }
  location.reload()
}

export function watchForUpdates(options: {
  /** Ob der Nutzer gerade beschäftigt ist (zuhören, sprechen, Blatt offen). */
  busy(): boolean
  /** Ob seit dem Start schon etwas passiert ist. */
  touched(): boolean
  onAvailable(remote: BuildInfo): void
}): void {
  if (!import.meta.env.PROD) return
  let announced = ''

  const check = async () => {
    const remote = await fetchRemote()
    if (!isNewer(remote) || !remote) return
    let reloadedFor = ''
    try {
      reloadedFor = sessionStorage.getItem(RELOAD_GUARD) ?? ''
    } catch {
      // egal
    }
    // Still aktualisieren, solange noch nichts los war — aber nur einmal pro
    // Fassung, falls der Zwischenspeicher eines CDN kurz hinterherhinkt.
    if (!options.touched() && !options.busy() && reloadedFor !== remote.sha) {
      try {
        sessionStorage.setItem(RELOAD_GUARD, remote.sha)
      } catch {
        // egal
      }
      await applyUpdate()
      return
    }
    if (announced !== remote.sha) {
      announced = remote.sha
      options.onAvailable(remote)
    }
  }

  void check()
  setInterval(() => void check(), CHECK_EVERY)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
}
