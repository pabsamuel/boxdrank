/* TrendGhost service worker: offline shell + Web Share Target handoff. */

const CACHE = 'trendghost-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

let pendingSharedFile = null;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Lane 1 (CONTENT_SOURCING.md): the OS posts the shared video here.
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        const data = await event.request.formData();
        pendingSharedFile = data.get('media');
        const clientsList = await self.clients.matchAll({ type: 'window' });
        for (const client of clientsList) {
          client.postMessage({ type: 'shared-file', file: pendingSharedFile });
        }
        return Response.redirect('/', 303);
      })(),
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached ?? fetch(event.request).catch(() => caches.match('/index.html'))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'claim-shared-file' && pendingSharedFile) {
    event.source?.postMessage({ type: 'shared-file', file: pendingSharedFile });
    pendingSharedFile = null;
  }
});
