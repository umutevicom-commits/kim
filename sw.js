/* Service Worker — offline support for Kim Milyoner Olmak İster */
const CACHE = 'kmo-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './questions.json',
  './assets/css/styles.css',
  './assets/js/main.js',
  './assets/js/game.js',
  './assets/js/data.js',
  './assets/js/timer.js',
  './assets/js/audio.js',
  './assets/js/storage.js',
  './assets/js/supabase.js',
  './assets/js/confetti.js',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Orbitron:wght@500;700;900&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
