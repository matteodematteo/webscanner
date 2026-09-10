# Scanner

The app uses ZXing WASM 3.1.2 for both Android and iOS. `js/zxing-scanner.js`
loads a dedicated worker, which uses the matching wrapper and binary in
`js/vendor/zxing-wasm/3.1.2/`. No runtime CDN or native BarcodeDetector is needed.

Frames are cropped to the adjustable scan box and transferred as RGBA pixels,
without JPEG compression. Only one frame is decoded at a time. Two matching
frames confirm a capture, then the existing product lookup runs. Stop, camera
switch, and restart invalidate pending results. The existing 10-second scan
timeout remains in place.

Camera zoom is never requested. Continuous autofocus is requested where the
camera exposes it. Saved camera selections are respected. Resizing the scan
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
