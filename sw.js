// No precache
self.addEventListener('install', (e) => self.skipWaiting());

// Limpia cualquier caché vieja si existiera
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Red estricta a red. Sin uso de Cache Storage ni HTTP cache.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(new Request(e.request, { cache: 'no-store' }))
  );
});
