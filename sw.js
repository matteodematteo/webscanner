// Simple service worker: cache-first app shell and scanner library for offline use
const CACHE_NAME = 'webscanner-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/scanner.css',
  '/css/responsive.css',
  '/js/config.js?v=53',
  '/js/state.js?v=53',
  '/js/dom.js?v=53',
  '/js/utils.js?v=53',
  '/js/ui.js?v=53',
  '/js/settings.js?v=53',
  '/js/input-mode.js?v=53',
  '/js/product.js?v=53',
  '/js/api.js?v=53',
  '/js/closest-search.js?v=53',
  '/js/history.js?v=53',
  '/js/camera.js?v=53',
  '/js/events.js?v=53',
  '/js/app.js?v=53',
  '/js/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // For navigation requests, prefer network but fall back to cache (so updates get picked up)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        // Successful navigation: update cache and return network response
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For other requests, try cache first then network
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((resp) => {
      // Optionally cache fetched resources (only same-origin JS/CSS/HTML)
      try {
        const requestUrl = new URL(event.request.url);
        if (requestUrl.origin === location.origin && (event.request.destination === 'script' || event.request.destination === 'style' || event.request.destination === 'document')) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
      } catch (e) {
        // ignore
      }
      return resp;
    })).catch(() => {
      // offline fallback: return cached index for navigations handled above; for assets, let it fail
      return caches.match('/index.html');
    })
  );
});
