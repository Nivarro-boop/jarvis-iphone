/**
 * Hält die App-Hülle vor, damit James auch bei schlechtem Netz sofort startet.
 * Anfragen an KI, Wetter und Wikipedia laufen immer übers Netz.
 *
 * Strategie: Seiten zuerst aus dem Netz (damit Updates ankommen), sonst aus
 * dem Zwischenspeicher; Dateien mit Hash im Namen aus dem Zwischenspeicher.
 */
const CACHE = 'james-v4'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', 'manifest.webmanifest', 'icons/apple-touch-icon.png'].map(path => new Request(path, { cache: 'reload' })))))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // Versions- und Kataloginfo immer frisch von GitHub Pages.
  if (/\/(version|marketplace)\.json$/.test(url.pathname)) return

  if (request.mode === 'navigate') {
    // Seiten immer beim Server nachfragen: GitHub Pages erlaubt dem Browser
    // 10 Minuten Zwischenspeichern, sonst käme ein Update erst danach an.
    let fresh
    try {
      fresh = new Request(request, { cache: 'no-cache' })
    } catch {
      fresh = request
    }
    // `v` hängt nur das Update an; gespeichert wird unter der sauberen Adresse.
    const key = new URL(request.url)
    key.searchParams.delete('v')
    event.respondWith(
      fetch(fresh)
        .then(response => {
          // Jede Seite unter ihrer eigenen Adresse, sonst landet der
          // Marktplatz offline anstelle der App.
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put(key.toString(), copy))
          }
          return response
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match('./')))
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      hit =>
        hit ||
        fetch(request).then(response => {
          if (response.ok && url.pathname.includes('/assets/')) {
            const copy = response.clone()
            caches.open(CACHE).then(cache => cache.put(request, copy))
          }
          return response
        })
    )
  )
})
