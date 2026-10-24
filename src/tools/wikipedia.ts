/**
 * Deutsche Wikipedia: erst suchen, dann die Zusammenfassung des besten
 * Treffers. Beide Schnittstellen erlauben Aufrufe aus dem Browser.
 */
export async function wikipedia(term: string, signal?: AbortSignal) {
  if (!term) return { fehler: 'Kein Suchbegriff.' }
  const search = new URLSearchParams({ action: 'query', list: 'search', srsearch: term, srlimit: '1', format: 'json', origin: '*' })
  const found = await fetch(`https://de.wikipedia.org/w/api.php?${search}`, { signal })
  if (!found.ok) throw new Error(`Wikipedia nicht erreichbar (${found.status}).`)
  const hits = ((await found.json()) as { query?: { search?: { title: string }[] } }).query?.search ?? []
  if (!hits.length) return { hinweis: `Nichts zu „${term}“ gefunden.` }
  const title = hits[0].title
  const summary = await fetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal })
  if (!summary.ok) return { titel: title }
  const json = (await summary.json()) as { title: string; extract?: string; content_urls?: { mobile?: { page?: string } } }
  return { titel: json.title, text: (json.extract ?? '').slice(0, 1500), quelle: json.content_urls?.mobile?.page }
}
