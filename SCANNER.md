# Scanner

The app uses ZXing WASM 3.1.2 for both Android and iOS. `js/zxing-scanner.js`
loads a dedicated worker, which uses the matching wrapper and binary in
`js/vendor/zxing-wasm/3.1.2/`. No runtime CDN or native BarcodeDetector is needed.

The adjustable box is an aiming guide. Scanning alternates an expanded central
area with the full visible preview, so labels can extend beyond the box. Quick
1280-pixel passes alternate with thorough 1920-pixel passes for difficult or
inverted labels. Frames transfer as RGBA pixels without JPEG compression. Only one frame is decoded at a time. Two matching
frames confirm a capture, then the existing product lookup runs. Stop, camera
switch, and restart invalidate pending results. The existing 10-second scan
timeout remains in place.

Camera zoom is never requested. On Android, continuous autofocus is requested where the
camera exposes it. On iPhone, the app leaves native autofocus alone and does
not apply or schedule focus constraints. Saved camera selections are respected. Resizing the scan
box does not restart the camera. Phone-mode capture does not focus an input;
mobile controls use 16px text to avoid focus zoom. Manual pinch zoom remains
available. The scroll-lock button preserves the current page position.

## Deployment

Upload the app directory, including the new worker and vendor directory, to
an HTTPS host. Serve `.wasm` as `application/wasm`. `localhost` also works for
development. The service worker caches the app and decoder for subsequent
offline use; the first visit needs a connection. Product API calls still need
network access. Reload an existing installation after deploying the update.

## Verification

`tests/scanner-browser.cjs` requires Node.js and Playwright. Run it with
`node tests/scanner-browser.cjs`. Set `BROWSER_EXECUTABLE` to use an installed
Chromium browser instead of Playwright's default browser; `NODE_PATH` can point
to an existing Playwright installation.

Verified in headless Chromium with a mobile viewport:

- Real WASM/worker decoding: EAN-13, EAN-8, UPC-A, UPC-E, and Code 128, each
  normal, rotated, inverted, and rotated plus inverted (20 cases).
- Late results ignored after stopping and restarting.
- Scroll position preserved and mobile input font size checked.
- Simulated camera stream through ROI capture, frame confirmation and lookup;
  one lookup and no camera zoom constraints.
- App and decoder initialization after offline reload.
- JavaScript syntax and the vendored WASM release hash.

Physical Android and iPhone cameras have not been tested. Check rear-camera
focus at different distances, small/glossy labels, low light, rotation,
background/resume, camera selection, and torch on representative devices.

## Startup optimization

Camera access and WASM initialization run concurrently. The saved camera is
requested directly; device labels load after playback begins. Playback uses
`video.play()` without a separate metadata wait, and resolution constraints
are applied only in the initial camera request. Optional focus controls do not
block startup. Authentication runs afterward. Service-worker registration and
update checks run independently of camera startup.
Versioned decoder assets use the offline cache without background re-downloads.

Run `node tests/scanner-startup.cjs` to verify concurrent initialization and
that scanning waits for both dependencies. Real phone startup timings still
need measurement; camera permission, hardware and first-load network latency
can dominate the total.

On iPhone, window focus and initial pageshow no longer trigger camera recovery.
Actual foreground returns and frozen-stream recovery remain supported. Recovery
checks are skipped while camera startup is in progress. The camera fallback is
only used if the initial camera request fails, never to replace a working stream.

## Search loading and app updates

When tab one is active, the Refresh button logs in and fills history rows with
missing product details by requesting their info and discount. It requests each
missing barcode once; complete rows are left alone, and failed rows can be
retried on the next Refresh. A failed tab-one info request does not trigger a
second login or an automatic retry. Tabs three and four retain their sales refresh.
Sales-performance requests also use only the current cookie: missing or failed
sessions do not trigger an automatic login or resend. Use Refresh to retry.

Search waits for the exact product lookup first. If that lookup does not find
the barcode, it requests closest matches and waits for the complete response.
The Search button shows a loading circle until the response is received and
processed; the closest-match dialog shows its circle while waiting for matches.
There is no parallel exact/closest search, early cancellation, client timeout,
or automatic retry for server or network errors. A failed response shows the
error and re-enables Search. Expired-session recovery remains supported.

Upload `index.html`, `sw.js`, and the `js/` directory together for this release.
Online reloads fetch current HTML and its versioned scripts; offline reloads
use the latest cached page. An open app checks for updates on return and every
five minutes, and offers **Reload** when a new version activates. Reload keeps
the current barcode and quantity, saved login, settings, cookies, and history.
No browser-data deletion is needed. An installation using the previous service
worker may need a second ordinary reload after the new worker finishes installing.

For future releases, update the `webscanner-version` meta value in `index.html`
and `APP_VERSION` in `sw.js` together, increment `CACHE_NAME`, and update the
URLs of changed scripts in both files. `sw.js` keeps its stable registration
URL and bypasses HTTP cache for update checks.

Run `node tests/search-browser.cjs` for slow responses, loading circles, and search failures
and `node tests/app-updates-browser.cjs` for real service-worker upgrades,
storage preservation, HTTP cache bypass, subfolder hosting, and offline use.
