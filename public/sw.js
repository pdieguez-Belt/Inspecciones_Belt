const CACHE_NAME = 'belt-fotos-v2'
const PRECACHE = ['/', '/manifest.json', '/logo-belt.png', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Don't cache API calls or silhouette images
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/img/')) return
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
      }
      return res
    })).catch(() => caches.match('/'))
  )
})
