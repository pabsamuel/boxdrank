/* Basit çevrimdışı önbellek — PWA olarak "uygulama gibi" açılması için */
const CACHE = 'nukon-monitor-v1';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=> c.addAll(ASSETS)).then(()=> self.skipWaiting()));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(keys=>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=> self.clients.claim()));
});
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  // API isteklerini önbelleğe alma (her zaman canlı)
  if(url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});
