/* TrendGhost service worker: offline shell + Web Share Target handoff. */

const CACHE = 'trendghost-v1';

/**
 * Where the app is mounted. GitHub Pages serves it from /<repo>/, a custom
 * domain from /. The worker is always served next to index.html, so its own
 * URL is the one source of truth for that — no build-time templating needed.
 */
const BASE = new URL('./', self.location).pathname;

const SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`];

/**
 * Where a shared photo/video is parked between the OS handing it to us and the
 * page opening. It MUST be durable storage, not a variable: sharing from TikTok
 * usually happens with the app closed, and the browser is free to kill this
 * worker between the POST and the page load.
 */
const SHARE_CACHE = 'trendghost-share';
const SHARE_KEY = `${BASE}__shared-media`;

/**
 * Sharing from a gallery hands over the video itself. Sharing from inside
 * TikTok, Reels or Shorts hands over a LINK instead — the app never gives the
 * file away. We keep that link only so the page can explain what happened and
 * offer the file picker; it is never fetched (CONTENT_SOURCING.md).
 */
const SHARE_LINK_KEY = `${BASE}__shared-link`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Lane 1 (CONTENT_SOURCING.md): the OS posts the shared photo or video here.
  if (event.request.method === 'POST' && url.pathname === `${BASE}share-target`) {
    event.respondWith(
      (async () => {
        try {
          const data = await event.request.formData();
          const file = data.get('media');
          if (file && typeof file !== 'string') {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              SHARE_KEY,
              new Response(file, {
                headers: {
                  'content-type': file.type || 'application/octet-stream',
                  'x-share-name': encodeURIComponent(file.name || 'shared'),
                },
              }),
            );
            return Response.redirect(`${BASE}?shared=1`, 303);
          }

          const link = [data.get('url'), data.get('text'), data.get('title')]
            .filter((value) => typeof value === 'string' && value.trim() !== '')
            .join(' ');
          if (link) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(SHARE_LINK_KEY, new Response(link));
            return Response.redirect(`${BASE}?shared=link`, 303);
          }
        } catch {
          // Fall through: open the app normally rather than showing a browser error.
        }
        return Response.redirect(BASE, 303);
      })(),
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches
      .match(event.request)
      .then(
        (cached) => cached ?? fetch(event.request).catch(() => caches.match(`${BASE}index.html`)),
      ),
  );
});
