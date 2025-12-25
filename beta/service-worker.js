/* ==========================================================================
 * ARQUIVO: service-worker.js (Versão 4.0.0-shell)
 * ========================================================================== */

const CACHE_VERSION = 'v4.0.0-shell';
const CACHE_STATIC = `static-${CACHE_VERSION}`;

// ATIVOS CRÍTICOS (Shell + Conteúdo)
const STATIC_ASSETS = [
  './',
  './index.html',
  './conteudo.html',  // NOVO: Fragmento de conteúdo
  './ambiente.js',    // NOVO: Configurador de ambiente
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_STATIC) return caches.delete(key);
      }));
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((response) => {
        return caches.open(CACHE_STATIC).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});