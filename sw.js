// Offline app shell. All paths are resolved against the service worker scope
// so installs work both at the domain root and from a deployed subfolder.
const CACHE_NAME = 'webscanner-v7';
const APP_SHELL_URL = new URL('index.html', self.registration.scope).toString();
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'document', 'image', 'font']);
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'css/base.css',
  'css/scanner.css',
  'css/layout.css',
  'css/components.css',
  'css/history.css',
  'css/dialogs.css',
  'css/responsive.css',
  'js/html5-qrcode.min.js',
  'js/config.js?v=62',
  'js/state.js?v=62',
  'js/dom.js?v=62',
  'js/utils.js?v=62',
  'js/ui.js?v=62',
  'js/settings.js?v=62',
  'js/input-mode.js?v=62',
  'js/product.js?v=62',
  'js/api.js?v=62',
  'js/sales.js?v=62',
  'js/closest-search.js?v=62',
  'js/history.js?v=62',
  'js/camera.js?v=62',
  'js/events.js?v=62',
  'js/app.js?v=62'
].map((url) => new URL(url, self.registration.scope).toString());

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
      caches.match(event.request).then((cachedRequest) => cachedRequest || caches.match(APP_SHELL_URL)).then((cached) => {
        const networkUpdate = fetch(event.request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            const shellCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy);
              cache.put(APP_SHELL_URL, shellCopy);
            });
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
        // Cache same-origin app resources that may be needed offline.
        try {
          const requestUrl = new URL(event.request.url);
          if (requestUrl.origin === location.origin && resp && resp.ok && CACHEABLE_DESTINATIONS.has(event.request.destination)) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
        } catch (e) {
          // ignore
        }
        return resp;
      }).catch(() => cached || caches.match(APP_SHELL_URL));

      // Serve cached immediately if we have it; otherwise wait on network.
      return cached || networkFetch;
    })
  );
});
