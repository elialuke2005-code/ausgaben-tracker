const CACHE = 'ausgaben-v14';
const FILES = ['./', './index.html', './css/style.css', './js/app.js', './js/firebase-config.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  // cache: 'reload' erzwingt frische Netzwerk-Requests, ignoriert Browser-HTTP-Cache
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(FILES.map(url =>
        fetch(url, { cache: 'reload' }).then(r => c.put(url, r))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
