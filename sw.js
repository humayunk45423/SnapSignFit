// sw.js - SnapSignFit Service Worker: cache-first offline strategy
const CACHE_VERSION = 'snapsignfit-v9';
const VENDOR_CACHE = 'snapsignfit-vendor-v9';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/snapsignfit_logo.svg',
  '/manifest.json',
  '/js/app.js',
  '/js/hero.js',
  '/js/editor.js',
  '/js/editor-pan.js',
  '/js/export.js',
  '/js/face.js',
  '/js/orient.js',
  '/js/i18n.js',
  '/js/loader.js',
  '/js/presets.js',
  '/js/signature.js',
  '/js/smartcrop.js',
  '/js/bg.js',
  '/js/icons.js',
  '/vendor/pako.min.js',
  '/vendor/UPNG.js'
];

// Vendor assets - large files cached on first access
const VENDOR_PATTERNS = [
  '/vendor/mediapipe/',
  '/vendor/jsquash-jpeg/',
  '/vendor/opencv/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`Pre-cache miss: ${url}`, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION && k !== VENDOR_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (url.origin !== location.origin || event.request.method !== 'GET') return;

  const isVendor = VENDOR_PATTERNS.some(p => url.pathname.startsWith(p));

  if (isVendor) {
    // Vendor: cache-first, network-fallback, then cache response
    event.respondWith(
      caches.open(VENDOR_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (resp.ok) cache.put(event.request, resp.clone());
          return resp;
        } catch (err) {
          return new Response('Offline — vendor asset not cached', { status: 503 });
        }
      })
    );
  } else {
    // App shell: Network-first, cache fallback (immediate updates)
    event.respondWith(
      fetch(event.request)
        .then(async resp => {
          if (resp.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(event.request, resp.clone());
          }
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response('Offline', { status: 503 });
        })
    );
  }
});
