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
  const req = event.request;
  const url = new URL(req.url);

  // ❌ Nunca interceptar métodos que não sejam GET
  if (req.method !== 'GET') return;

  // ❌ Nunca interceptar Apps Script
  if (url.hostname.includes('script.google.com')) return;

  // ❌ Nunca interceptar extensões, ads, analytics, etc.
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    return;
  }

  // ❌ Só cacheia arquivos do próprio site
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        if (!res || res.status !== 200) return res;

        const clone = res.clone();
        caches.open(CACHE_STATIC).then((cache) => {
          cache.put(req, clone);
        });

        return res;
      });
    })
  );
});

