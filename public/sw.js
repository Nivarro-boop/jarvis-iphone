/**
 * Hält die App-Hülle vor, damit James auch bei schlechtem Netz sofort startet.
 * Anfragen an KI, Wetter und Wikipedia laufen immer übers Netz.
 *
 * Strategie: Seiten zuerst aus dem Netz (damit Updates ankommen), sonst aus
 * dem Zwischenspeicher; Dateien mit Hash im Namen aus dem Zwischenspeicher.
 */
const CACHE = 'james-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', 'manifest.webmanifest', 'icons/apple-touch-icon.png'])))
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./'))
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
