/* PIT RATING · service worker: установка приложения и экран «нет сети».
   Данные не кэшируем — всё живое берётся с сервера. */
const V = 'pit-v1', OFF = '/offline.html';
const PRE = [OFF, '/brand/icon-192.png', '/brand/icon-512.png', '/brand/favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(PRE)).then(() => self.skipWaiting())) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (r.mode === 'navigate') { e.respondWith(fetch(r).catch(() => caches.match(OFF))); return }
  const u = new URL(r.url);
  if (u.origin === location.origin && u.pathname.startsWith('/brand/')) e.respondWith(caches.match(r).then(x => x || fetch(r)));
});
