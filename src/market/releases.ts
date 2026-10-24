/**
 * Neueste Fassung einer App aus GitHub-Releases. Die öffentliche Schnittstelle
 * erlaubt 60 Abrufe pro Stunde und Gerät; deshalb eine Stunde gemerkt.
 */

export interface Release {
  version: string
  date: string
  url: string
  page: string
  sizeMb: number | null
}

const CACHE_MS = 60 * 60_000

export async function latestRelease(repo: string, asset: string | undefined, signal?: AbortSignal): Promise<Release> {
  const key = `james.release.${repo}`
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; release: Release } | null
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.release
  } catch {
    // neu laden
  }
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response.ok) throw new Error(response.status === 403 ? 'GitHub bremst gerade. Später noch einmal.' : `Kein Release gefunden (${response.status}).`)
  const json = (await response.json()) as {
    tag_name: string
    published_at: string
    html_url: string
    assets?: { name: string; size: number; browser_download_url: string }[]
  }
  let pattern: RegExp | null = null
  try {
    pattern = asset ? new RegExp(asset) : null
  } catch {
    pattern = null
  }
  const file = json.assets?.find(a => (pattern ? pattern.test(a.name) : true))
  const release: Release = {
    version: json.tag_name.replace(/^v/, ''),
    date: json.published_at,
    url: file?.browser_download_url ?? json.html_url,
    page: json.html_url,
    sizeMb: file ? Math.round(file.size / 1048576) : null
  }
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), release }))
  } catch {
    // egal
  }
  return release
}
