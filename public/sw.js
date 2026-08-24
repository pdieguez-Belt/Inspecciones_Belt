const CACHE_NAME = 'belt-fotos-v16'
const PRECACHE = ['/manifest.json']

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
  // Never cache: API calls, images, PNGs, HTML navigation
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/img/')) return
  if (url.pathname.endsWith('.png') || url.pathname.endsWith('.mp4')) return
  if (e.request.mode === 'navigate') return
  // Only cache static assets (JS, CSS, fonts)
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})
