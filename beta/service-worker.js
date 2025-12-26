
/* ========================================================================== 
 * ARQUIVO: service-worker.js (Versão 4.1.1)
 * ========================================================================== */
const CACHE_VERSION = 'v4.1.0-shell';
const CACHE_STATIC = `static-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

const STATIC_ASSETS = [
  './',
  './index.html',
  './conteudo.html',
  './ambiente.js',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  OFFLINE_URL
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_STATIC) return caches.delete(key);
      })
    ))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(res => res || caches.match(OFFLINE_URL))
    )
  );
});
