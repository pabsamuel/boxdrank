// Offline shell for RetroSubs.
//
// The page is deployed often, so the HTML is fetched network-first: a new build lands on the
// next load instead of leaving someone stuck on an old one. Everything that never changes
// without a new filename -- fonts, icons -- is served cache-first.
const VERSION = "v18";
const SHELL = "retrosubs-shell-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./fonts/pixelify-sans-latin.woff2",
  "./fonts/pixelify-sans-latin-ext.woff2",
  "./fonts/press-start-2p-latin.woff2",
  "./fonts/press-start-2p-latin-ext.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // config.json carries the payment link: it must never be served from a stale cache, or
  // turning sales on would not reach anyone who already opened the page.
  if (new URL(request.url).pathname.endsWith("/config.json")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  const isDocument = request.mode === "navigate" || request.destination === "document";
  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL).then(c => c.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(SHELL).then(c => c.put(request, copy));
      return response;
    }))
  );
});
