/* ==========================================================================
 * ARQUIVO: service-worker.js (Versão 3.0.0-final)
 * Descrição: Gerenciador de cache, proxy de rede e atualizador de versão.
 * ========================================================================== */

// CONTROLE DE VERSÃO: Mude isso sempre que atualizar o HTML/CSS/JS
const CACHE_VERSION = 'v3.0.0-final';
const CACHE_STATIC = `static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `dynamic-${CACHE_VERSION}`;

// ATIVOS CRÍTICOS: Arquivos que devem funcionar offline imediatamente
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
  // Adicione seus ícones aqui se necessário: './icon-192.png', etc.
];

// 1. FASE DE INSTALAÇÃO
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando versão:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching App Shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Força o SW a entrar em estado de espera
  );
});

// 2. FASE DE ATIVAÇÃO (Limpeza de cache antigo)
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
          console.log('[SW] Removendo cache obsoleto:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. INTERCEPTAÇÃO DE REDE (FETCH)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // ESTRATÉGIA A: NETWORK ONLY (Ignora cache para API do Google Apps Script)
  if (requestUrl.href.includes('script.google.com') || event.request.method === 'POST') {
    return; 
  }

  // ESTRATÉGIA B: STALE-WHILE-REVALIDATE (Para o site em si)
  // Tenta servir o cache rápido, mas busca atualização no fundo
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          // Verifica se a resposta é válida
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          // Atualiza o cache dinâmico com a nova versão
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_STATIC).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch((err) => {
          console.warn('[SW] Fetch falhou, tentando offline:', err);
        });

      // Retorna o que tiver no cache, ou espera a rede se não tiver nada
      return cachedResponse || networkFetch;
    })
  );
});

// 4. MENSAGERIA PARA ATUALIZAÇÃO (SKIP WAITING)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Atualização forçada pelo usuário.');
    self.skipWaiting();
  }
});
