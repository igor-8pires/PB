const CACHE_PREFIX = 'sistema-vendas-static-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const PRECACHE_URLS = [
  '/manifest.json',
  '/offline.html',
  '/offline-page.js',
  '/file.svg',
  '/globe.svg',
  '/next.svg',
  '/vercel.svg',
  '/window.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if ((cache.startsWith(CACHE_PREFIX) && cache !== CACHE_NAME) || cache === 'sistema-vendas-v1') {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  const isStaticAsset =
    requestUrl.pathname.startsWith('/_next/static/') ||
    PRECACHE_URLS.includes(requestUrl.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        const networkResponse = await fetch(event.request);
        if (networkResponse.ok && networkResponse.type === 'basic') {
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offlinePage = await caches.match('/offline.html');
        return offlinePage || new Response('Sem conexão. Abra o aplicativo online para salvar os dados offline.', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
    );
  }
});
