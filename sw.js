// BLE Terminal service worker: tüm dosyaları önbelleğe alır, internetsiz açılışı sağlar.
// Dosyalardan biri değişince ONBELLEK adını artırın (v1 -> v2), yoksa eski sürüm açılır.
const ONBELLEK = 'ble-terminal-v1';
const DOSYALAR = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

// Önce önbellek, yoksa ağ. ignoreSearch: ?sahte=1 gibi parametreler de önbellekten açılır.
self.addEventListener('fetch', (olay) => {
  if (olay.request.method !== 'GET') return;
  olay.respondWith(
    caches.match(olay.request, { ignoreSearch: true }).then((yanit) => yanit || fetch(olay.request))
  );
});
