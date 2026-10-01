# Scanner

The app uses ZXing WASM 3.1.2 for both Android and iOS. `js/zxing-scanner.js`
loads a dedicated worker, which uses the matching wrapper and binary in
`js/vendor/zxing-wasm/3.1.2/`. No runtime CDN or native BarcodeDetector is needed.

The adjustable box is an aiming guide. Scanning alternates a central band
(at least 85% of the visible width, 50–65% of its height) with the full visible
preview, so labels can extend beyond the box. Quick
1280-pixel passes alternate with thorough 1920-pixel passes for difficult or
inverted labels. If the original and inverted thorough reads fail, the worker
corrects local lighting with a 49-pixel neighborhood and a small noise dead band,
then tries both barcode polarities. Enhanced reads require three matching scan
lines; original reads still require two. Only valid ZXing results are accepted.
Integral image buffers are reused; recovery work runs off the UI thread and is
skipped for flat images. Clean reads do not pay the enhancement cost.

Frames transfer as RGBA pixels without JPEG compression. Only one frame is
decoded at a time. Two consecutive matching fresh camera frames confirm a
capture, then the existing product lookup runs. Video frame callbacks pace
scanning directly, without the extra timer/animation-frame delay. Timed-out
callbacks and repeated video timestamps cannot confirm a stalled image; older
browsers use the video timestamp with timer pacing. Stop, camera
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
  clean and faint gradient labels, one lookup and no camera zoom constraints.
- App and decoder initialization after offline reload.
- JavaScript syntax and the vendored WASM release hash.

`node tests/scanner-contrast-browser.cjs` exercises 51 synthetic cases with the
real worker and WASM: 28 valid labels across five formats, 1–12-pixel modules,
rotation, inversion, shadows and noise, plus 23 invalid-checksum/blank/texture
cases. Twenty faint labels that the previous worker missed now decode exactly.
The checks also include 1080/1920 camera-sized crops. Optional comparison with
an older local worker uses `SCANNER_BASELINE_WORKER`; timing output excludes
fixture generation and is diagnostic, not a phone performance guarantee.

`node tests/scanner-frames.cjs` verifies that frozen/repeated frames, isolated
reads, intervening misses, conflicting results, and hidden pages do not submit
a barcode; it also covers timestamp pacing on older browsers.

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

## Recent print requests

The Print Format popup keeps the last 20 successful TXT, BIG 60*38, and
STICKER 40*25 requests on this device. Recent requests remain accessible after
the working barcode list is cleared. Tap one to see its saved barcodes, Italian
names, sent prices, and quantities; Cancel returns to Print Format. TXT,
60*38, and 40*25 send that saved snapshot as a new request without changing
the current working list. Failed sends are not added to recent requests.
Gate 1/2 selection is saved locally and reused in both print views after
reopening or reloading. The timestamp option starts checked when Print Format
or a saved request is opened. `node tests/print-requests-browser.cjs` verifies
these flows in a mobile browser, including reload and failed sends.

The discount proxy may return 50% as `0.5`. The app converts fractional sale
discounts to percent before calculating label prices. A EUR 4.00 item at 50%
now sends `s_discount: 50` and `discount_price: 2` for both label sizes.
Previously saved rows with the stale `0.5`/`3.98` pair are corrected when read.

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
