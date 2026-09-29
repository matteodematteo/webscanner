// Offline app shell. All paths are resolved against the service worker scope
// so installs work both at the domain root and from a deployed subfolder.
const CACHE_NAME = 'webscanner-v37';
const APP_VERSION = '96';
const APP_SHELL_URL = new URL('index.html', self.registration.scope).toString();
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'document', 'image', 'font']);
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'css/base.css',
  'css/scanner.css',
  'css/layout.css',
  'css/components.css',
  'css/history.css',
  'css/dialogs.css?v=95',
  'css/responsive.css',
  'js/app-updates.js?v=86',
  'js/zxing-scanner.js?v=74',
  'js/zxing-worker.js?v=74',
  'js/vendor/zxing-wasm/3.1.2/reader.js',
  'js/vendor/zxing-wasm/3.1.2/zxing_reader.wasm',
  'js/config.js?v=91',
  'js/state.js?v=94',
  'js/dom.js?v=89',
  'js/utils.js?v=69',
  'js/ui.js?v=90',
  'js/settings.js?v=69',
  'js/input-mode.js?v=92',
  'js/product.js?v=88',
  'js/api.js?v=87',
  'js/sales.js?v=96',
  'js/closest-search.js?v=96',
  'js/history.js?v=92',
  'js/camera.js?v=74',
  'js/events.js?v=96',
  'js/app.js?v=96'
].map((url) => new URL(url, self.registration.scope).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each asset independently so one bad/missing URL can't abort
      // the whole precache (cache.addAll rejects — and skips caching
      // everything — the moment a single request fails).
      Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'reload' }).then((response) => {
            if (response && response.ok) {
              return cache.put(url, response);
            }
          }).catch(() => {
            // Ignore individual asset failures; the rest still get cached.
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('webscanner-') && k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(async () => {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.postMessage({ type: 'APP_VERSION', version: APP_VERSION }));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_APP_VERSION') {
    event.source?.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  // Let live ERP/proxy requests go straight to the network.
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  // Versioned decoder files are immutable. Reuse them without downloading the
  // WASM binary again while the camera is starting on every repeat visit.
  if (ASSETS_TO_CACHE.includes(requestUrl.href) &&
      requestUrl.pathname.includes('/vendor/zxing-wasm/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })());
    return;
  }
  // Online reloads get current HTML, including new script version URLs.
  // Keep the latest successful page available when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      let response;
      try {
        response = await fetch(event.request, { cache: 'no-store' });
      } catch (_) {}
      if (response?.ok) {
        await Promise.all([
          cache.put(event.request, response.clone()),
          cache.put(APP_SHELL_URL, response.clone())
        ]).catch(() => {});
        return response;
      }
      return await cache.match(event.request) || await cache.match(APP_SHELL_URL) || response || Response.error();
    })());
    return;
  }

  const cachePromise = caches.open(CACHE_NAME);
  const cachedPromise = cachePromise.then((cache) => cache.match(event.request));
  const networkFetch = fetch(event.request).then(async (response) => {
    if (response.ok && (CACHEABLE_DESTINATIONS.has(event.request.destination) || ASSETS_TO_CACHE.includes(requestUrl.href))) {
      const cache = await cachePromise;
      await cache.put(event.request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(async () => await cachedPromise || Response.error());
  // Keep background cache writes alive even after returning a cached response.
  event.waitUntil(networkFetch.then(() => {}));
  event.respondWith(cachedPromise.then((cached) => cached || networkFetch));
});
