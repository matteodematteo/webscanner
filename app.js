// =====================
// CONFIG
// =====================

const CONFIG = {
  API_BASE_URL: "https://your-api.com",
  LOGIN_ENDPOINT: "/auth/login",
  PRODUCT_ENDPOINT: "/product/",
  USE_CREDENTIALS: true,
  SCAN_DELAY: 1500 // ms between accepted scans
};

// =====================
// STATE & ELEMENTS
// =====================

let html5QrCode = null;
let isScanningActive = false;
let lastScanTime = 0;

const scannerId = "scanner";
const statusEl = document.getElementById("status");
const videoContainer = document.getElementById("scanner");

const barcodeInput = document.getElementById("barcodeOutput");
const scanBtn = document.getElementById("scanBtn");

const productNameEl = document.getElementById("productName");
const productPriceEl = document.getElementById("productPrice");
const productQtyEl = document.getElementById("productQty");

// =====================
// UTILITIES
// =====================

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#c0392b" : "#666";
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 900;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.08);
      o.stop(ctx.currentTime + 0.09);
    }, 50);
  } catch (e) {
    // ignore audio errors
    console.warn("Audio not available:", e);
  }
}

function clearProductInfo() {
  productNameEl.value = "";
  productPriceEl.value = "";
  productQtyEl.value = "";
}

// =====================
// API: fetch product by barcode
// =====================

async function fetchProduct(barcode) {
  // Replace with your real API; this helper expects JSON { name, price, qty }
  const url = CONFIG.API_BASE_URL + CONFIG.PRODUCT_ENDPOINT + encodeURIComponent(barcode);
  const res = await fetch(url, { method: "GET", credentials: CONFIG.USE_CREDENTIALS ? "include" : "same-origin" });
  if (!res.ok) throw new Error(`Product fetch failed (${res.status})`);
  return await res.json();
}

// =====================
// SCANNER (Html5Qrcode) init & start/stop
// =====================

async function getBestCameraId() {
  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) return null;
    // prefer a camera with "back" or "rear" in label if available
    const back = devices.find(d => d.label && /back|rear|environment/i.test(d.label));
    return (back || devices[0]).id;
  } catch (e) {
    console.warn("Could not enumerate cameras:", e);
    return null;
  }
}

async function startScanner() {
  if (isScanningActive) return true;

  setStatus("Requesting camera...");
  if (!html5QrCode) html5QrCode = new Html5Qrcode(scannerId, /* verbose= */ false);

  let cameraId = await getBestCameraId();
  const config = {
    fps: 15,
    // small scan box (optional) - comment out to use full frame
    qrbox: { width: 300, height: 200 },
    // restrict to common 1D formats used
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_39
    ],
    // prefer rear camera if using cameraId undefined; but we pass cameraId when available
    experimentalFeatures: { useBarCodeDetectorIfSupported: false } // avoid native BarcodeDetector variance
  };

  try {
    await html5QrCode.start(
      cameraId || { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    );
    isScanningActive = true;
    setStatus("Scanning... keep barcode in view");
    scanBtn.textContent = "Stop Scanning";
    scanBtn.style.backgroundColor = "#dc3545";
    return true;
  } catch (err) {
    console.error("start failed:", err);
    setStatus("Camera start failed: " + (err.message || err), true);
    return false;
  }
}

async function stopScanner() {
  if (!html5QrCode) {
    isScanningActive = false;
    scanBtn.textContent = "Start Scanning";
    scanBtn.style.backgroundColor = "#007bff";
    setStatus("Ready");
    return;
  }
  try {
    await html5QrCode.stop();        // stops camera
    await html5QrCode.clear();       // clears UI
  } catch (e) {
    console.warn("stop error:", e);
  } finally {
    isScanningActive = false;
    scanBtn.textContent = "Start Scanning";
    scanBtn.style.backgroundColor = "#007bff";
    setStatus("Stopped");
  }
}

// callback on detection
async function onScanSuccess(decodedText, decodedResult) {
  if (!isScanningActive) return;
  // throttle
  const now = Date.now();
  if (now - lastScanTime < CONFIG.SCAN_DELAY) return;
  lastScanTime = now;

  // Some devices/readers may return noise; basic length sanity check
  if (!decodedText || decodedText.length < 6) {
    console.log("Ignored short decode:", decodedText);
    return;
  }

  // accept and handle
  playBeep();
  barcodeInput.value = decodedText;
  setStatus("Barcode detected: " + decodedText);

  // stop scanner right away
  await stopScanner();

  // fetch product and populate
  clearProductInfo();
  try {
    const product = await fetchProduct(decodedText);
    productNameEl.value = product.name || "";
    productPriceEl.value = product.price || "";
    productQtyEl.value = product.qty || "";
    setStatus("Product loaded");
  } catch (err) {
    console.error("fetchProduct error:", err);
    setStatus("Product lookup failed", true);
    // leave product fields empty
  }
}

// optional per-frame failure callback (we keep silent)
function onScanFailure(error) {
  // no-op or small log
  // console.debug("scan failure:", error);
}

// =====================
// UI Handlers
// =====================

scanBtn.addEventListener("click", async () => {
  if (isScanningActive) {
    await stopScanner();
    return;
  }

  // when starting scanning clear input and product info
  barcodeInput.value = "";
  clearProductInfo();
  setStatus("Starting scanner...");
  const ok = await startScanner();
  if (!ok) {
    // fallback message already set in startScanner
  }
});

// enter key on input should trigger fetch
barcodeInput.addEventListener("keydown", async (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    const barcode = barcodeInput.value.trim();
    if (!barcode) {
      alert("Please enter or scan a barcode");
      return;
    }

    // stop scanner if running
    if (isScanningActive) {
      await stopScanner();
    }

    playBeep();
    setStatus("Looking up product...");
    clearProductInfo();
    try {
      const product = await fetchProduct(barcode);
      productNameEl.value = product.name || "";
      productPriceEl.value = product.price || "";
      productQtyEl.value = product.qty || "";
      setStatus("Product loaded");
    } catch (err) {
      console.error("fetch error:", err);
      setStatus("Product lookup failed", true);
      alert("Product fetch error: " + (err.message || err));
    }
  }
});

// when the page is unloaded, ensure we stop camera
window.addEventListener("beforeunload", async () => {
  if (html5QrCode && isScanningActive) {
    try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(e) {}
  }
});

// quick sanity initialization
setStatus("Ready");

// =====================
// End of file
// =====================
