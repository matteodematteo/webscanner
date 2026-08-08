// Simple service worker: cache-first app shell for offline use.
// Note: html5-qrcode.min.js is deliberately NOT precached here — it's a
// large (~375KB) file that index.html/app.js now load lazily (on idle, or
// when the user taps "Start Scanning") to keep first paint fast. Precaching
// it here would undo that by fetching it eagerly during SW install. It
// still gets cached for offline use the first time it's actually requested,
// via the generic 'script' handling in the fetch handler below.
const CACHE_NAME = 'webscanner-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/scanner.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/history.css',
  '/css/dialogs.css',
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
  '/js/app.js?v=53'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each asset independently so one bad/missing URL can't abort
      // the whole precache (cache.addAll rejects — and skips caching
      // everything — the moment a single request fails).
      Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url).then((response) => {
            if (response && response.ok) {
              return cache.put(url, response);
            }
          }).catch(() => {
            // Ignore individual asset failures; the rest still get cached.
          })
        )
      )
    )
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
  // Stale-while-revalidate for navigations too: serve the cached app shell
  // instantly (no network round-trip on the critical "app becomes visible"
  // path), then silently refetch in the background so the next load picks
  // up any update. Falls back to network if nothing is cached yet.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const networkUpdate = fetch(event.request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        }).catch(() => cached);

        return cached || networkUpdate;
      })
    );
    return;
  }

  // For other requests, try cache first then network (stale-while-revalidate).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((resp) => {
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
      }).catch(() => cached || caches.match('/index.html'));

      // Serve cached immediately if we have it; otherwise wait on network.
      return cached || networkFetch;
    })
  );
});
