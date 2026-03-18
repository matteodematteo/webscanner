// =====================
// CONFIG
// =====================
const CONFIG = {
  COOKIE_POST_URL: "https://lgkiller.mattoteo96.workers.dev/", // POST to obtain cookies
  PRODUCT_GET_URL_PREFIX: "https://www.lgerp.cc/goods/ongoodsCode?goodCode=",
  SCAN_DELAY: 1500 // ms debounce between detections
};

// =====================
// ELEMENTS & STATE
// =====================
const scannerElementId = "scanner";
const statusEl = document.getElementById("status");
const barcodeInput = document.getElementById("barcodeOutput");
const scanBtn = document.getElementById("scanBtn");

const productNameEl = document.getElementById("productName");
const productPriceEl = document.getElementById("productPrice");
const productQtyEl = document.getElementById("productQty");

const settingsBtn = document.getElementById("settingsBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const shopKeyInput = document.getElementById("shopKey");
const loginNameInput = document.getElementById("loginName");
const passwordInput = document.getElementById("password");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const toastEl = document.getElementById("toast");

let html5QrCode = null;
let isScanningActive = false;
let lastScanTime = 0;
let cameraStartedForPreview = false; // we start preview on load
let storedCookie = localStorage.getItem("auth_cookie") || "";
let storedCredentials = JSON.parse(localStorage.getItem("auth_credentials") || "null");

// =====================
// UTILITIES
// =====================
function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#c0392b" : "#666";
}

function showToast(text, duration = 1200) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), duration);
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
  } catch (e) { /* ignore */ }
}

function clearProductInfo() {
  productNameEl.value = "";
  productPriceEl.value = "";
  productQtyEl.value = "";
}

// =====================
// COOKIE: format & store
// =====================

function formatCookieFromResponse(respContent) {
  // Try to handle a few shapes:
  // 1) JSON with fullCookie or cookie field
  // 2) raw string containing Set-Cookie-like pairs separated by ';'
  try {
    if (!respContent) return "";
    // if already an object
    if (typeof respContent === "object") {
      if (respContent.fullCookie) return String(respContent.fullCookie);
      if (respContent.cookie) return String(respContent.cookie);
    }
    // try parse JSON text
    try {
      const p = JSON.parse(respContent);
      if (p.fullCookie) return String(p.fullCookie);
      if (p.cookie) return String(p.cookie);
    } catch (e) {
      // not JSON, continue
    }
    // respContent as string: extract name=value pairs and drop attributes
    // split by ';' and collect tokens that look like name=value (no 'path' 'expires' 'httponly' 'secure')
    const parts = respContent.split(";");
    const pairs = [];
    for (const part of parts) {
      const t = part.trim();
      if (!t) continue;
      const lower = t.toLowerCase();
      if (lower.startsWith("path=") || lower.startsWith("expires=") ||
          lower.includes("httponly") || lower.includes("secure") ||
          lower.startsWith("domain=") || lower.startsWith("max-age=")) {
        continue;
      }
      if (t.includes("=")) {
        // keep only name=value
        pairs.push(t);
      }
    }
    // join reasonable number of pairs (avoid long attributes)
    if (pairs.length === 0) return "";
    // join all pairs (or at least first two)
    return pairs.join("; ");
  } catch (e) {
    console.error("formatCookie error", e);
    return "";
  }
}

async function storeCookieFromPostResponse(responseText) {
  // responseText may be JSON or raw string
  const cookieStr = formatCookieFromResponse(responseText);
  if (cookieStr) {
    storedCookie = cookieStr;
    localStorage.setItem("auth_cookie", storedCookie);
    return true;
  }
  return false;
}

// =====================
// API calls
// =====================

async function postCredentialsAndStoreCookie(login_name, password, shopkey) {
  // Build URL-encoded body as shown in your block image:
  const params = new URLSearchParams();
  params.append("login_name", login_name || "");
  params.append("password", password || "");
  params.append("shopkey", shopkey || "");
  try {
    setStatus("Requesting auth cookie...");
    const res = await fetch(CONFIG.COOKIE_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    const text = await res.text();
    const ok = await storeCookieFromPostResponse(text);
    if (!ok) throw new Error("Could not format cookie from response");
    // Save credentials for refresh if user wants (we store them)
    storedCredentials = { login_name, password, shopkey };
    localStorage.setItem("auth_credentials", JSON.stringify(storedCredentials));
    showToast("Saved");
    setStatus("Auth cookie saved");
    return true;
  } catch (err) {
    console.error("postCredentials error", err);
    setStatus("Auth error", true);
    throw err;
  }
}

async function fetchProductByBarcode(barcode, allowAuthRefresh = true) {
  if (!barcode) throw new Error("Empty barcode");
  const url = CONFIG.PRODUCT_GET_URL_PREFIX + encodeURIComponent(barcode);
  try {
    setStatus("Fetching product...");
    const headers = {};
    if (storedCookie) headers["Cookie"] = storedCookie;
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      // if unauthorized and credentials exist, try refresh cookie once
      if ((res.status === 401 || res.status === 403 || res.status === 302) && allowAuthRefresh && storedCredentials) {
        setStatus("Auth failed - refreshing cookie...");
        try {
          await postCredentialsAndStoreCookie(storedCredentials.login_name, storedCredentials.password, storedCredentials.shopkey);
        } catch (err) { /* propagate next */ }
        return fetchProductByBarcode(barcode, false); // retry once
      }
      throw new Error(`Product request failed (${res.status})`);
    }
    const data = await res.json();
    // user said search these keys: italian_name, s_price and resporeal_inventoryse
    // We'll be defensive and look in top-level or nested fields
    let name = data.italian_name ?? data.italianName ?? null;
    let price = data.s_price ?? data.sPrice ?? data.price ?? null;
    // qty from resporeal_inventoryse - could be nested
    let qty = data.resporeal_inventoryse ?? data.real_inventory ?? data.qty ?? null;

    // try deeper search if not found:
    if (!name || !price || !qty) {
      // flatten search
      const seen = [data];
      while (seen.length) {
        const node = seen.shift();
        if (!node || typeof node !== "object") continue;
        if (!name && node.italian_name) name = node.italian_name;
        if (!price && node.s_price) price = node.s_price;
        if (!qty && node.resporeal_inventoryse) qty = node.resporeal_inventoryse;
        for (const k of Object.keys(node)) {
          if (node[k] && typeof node[k] === "object") seen.push(node[k]);
        }
      }
    }

    // fallback defaults
    name = (name === null || name === undefined) ? "" : String(name);
    price = (price === null || price === undefined) ? "" : String(price);
    qty = (qty === null || qty === undefined) ? "" : String(qty);

    setStatus("Product loaded");
    return { name, price, qty, raw: data };
  } catch (err) {
    console.error("fetchProductByBarcode error", err);
    setStatus("Product fetch failed", true);
    throw err;
  }
}

// =====================
// Scanner setup (preview always visible)
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

async function initPreviewAndScanner() {
  if (html5QrCode) return;
  html5QrCode = new Html5Qrcode(scannerElementId, { verbose: false });

  const cameraId = await getBestCameraId();

  // start scanning but we will only act on detections when isScanningActive === true
  try {
    await html5QrCode.start(
      cameraId || { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 280, height: 280 }, // focused square area (optional)
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: false }
      },
      async (decodedText, decodedResult) => {
        // This callback triggers continuously when html5-qrcode detects; we only accept when scanning active
        if (!isScanningActive) return;
        const now = Date.now();
        if (now - lastScanTime < CONFIG.SCAN_DELAY) return;
        lastScanTime = now;

        if (!decodedText) return;
        // basic sanity check
        if (decodedText.length < 6) return;

        playBeep();
        barcodeInput.value = decodedText;
        // stop only scanning mode (preview stays)
        isScanningActive = false;
        scanBtn.textContent = "Start Scanning";
        scanBtn.style.backgroundColor = "#007bff";
        setStatus("Detected: " + decodedText);

        // fetch product and populate fields
        clearProductInfo();
        try {
          const product = await fetchProductByBarcode(decodedText);
          productNameEl.value = product.name || "";
          productPriceEl.value = product.price || "";
          productQtyEl.value = product.qty || "";
        } catch (err) {
          // If fetching fails, we already attempted refresh inside fetchProductByBarcode
          alert("Product lookup failed: " + (err.message || String(err)));
        }
      },
      (errorMessage) => {
        // silent per-frame failure callback
        // console.debug("scan fail:", errorMessage);
      }
    );
    cameraStartedForPreview = true;
    setStatus("Camera preview active");
  } catch (err) {
    console.error("initPreviewAndScanner error", err);
    setStatus("Camera preview failed: " + (err.message || err), true);
  }
}

// =====================
// UI behaviour
// =====================

async function startScanningMode() {
  // clear field and product info, set scanning active (we already have preview)
  barcodeInput.value = "";
  barcodeInput.placeholder = "Scanning... keep barcode in view";
  clearProductInfo();
  lastScanTime = 0;
  isScanningActive = true;
  scanBtn.textContent = "Stop Scanning";
  scanBtn.style.backgroundColor = "#dc3545";
  setStatus("🔴 Scanning - point the barcode");
}

async function stopScanningMode() {
  isScanningActive = false;
  scanBtn.textContent = "Start Scanning";
  scanBtn.style.backgroundColor = "#007bff";
  barcodeInput.placeholder = "Scan or type barcode here...";
  setStatus("Ready");
}

// click toggle
scanBtn.addEventListener("click", async () => {
  if (!html5QrCode) {
    await initPreviewAndScanner();
  }
  if (isScanningActive) {
    await stopScanningMode();
  } else {
    await startScanningMode();
  }
});

// enter in input triggers lookup (and stops scanning if active)
barcodeInput.addEventListener("keydown", async (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    const code = barcodeInput.value.trim();
    if (!code) {
      alert("Please enter a barcode");
      return;
    }
    if (isScanningActive) await stopScanningMode();
    playBeep();
    setStatus("Looking up product...");
    clearProductInfo();
    try {
      const product = await fetchProductByBarcode(code);
      productNameEl.value = product.name || "";
      productPriceEl.value = product.price || "";
      productQtyEl.value = product.qty || "";
    } catch (err) {
      alert("Product lookup failed: " + (err.message || String(err)));
    }
  }
});

// settings modal controls
settingsBtn.addEventListener("click", () => {
  // populate with stored if available
  const creds = JSON.parse(localStorage.getItem("auth_credentials") || "null");
  shopKeyInput.value = creds?.shopkey || "";
  loginNameInput.value = creds?.login_name || "";
  passwordInput.value = creds?.password || "";
  modalBackdrop.classList.add("active");
});

closeModalBtn.addEventListener("click", () => {
  modalBackdrop.classList.remove("active");
});

saveSettingsBtn.addEventListener("click", async () => {
  const shopkey = shopKeyInput.value.trim();
  const login_name = loginNameInput.value.trim();
  const password = passwordInput.value;
  if (!login_name || !password) {
    alert("Please enter login_name and password");
    return;
  }
  try {
    saveSettingsBtn.disabled = true;
    setStatus("Saving credentials & requesting cookie...");
    await postCredentialsAndStoreCookie(login_name, password, shopkey);
    saveSettingsBtn.disabled = false;
    modalBackdrop.classList.remove("active");
    showToast("Save successful");
  } catch (err) {
    saveSettingsBtn.disabled = false;
    alert("Save / auth failed: " + (err.message || String(err)));
  }
});

// cleanup on unload
window.addEventListener("beforeunload", async () => {
  if (html5QrCode && cameraStartedForPreview) {
    try { await html5QrCode.stop(); await html5QrCode.clear(); } catch (e) {}
  }
});

// Initialize preview immediately (so the square preview is always visible)
(async () => {
  setStatus("Initializing camera preview...");
  await initPreviewAndScanner();
  // load stored cookie/credentials into memory
  storedCookie = localStorage.getItem("auth_cookie") || "";
  storedCredentials = JSON.parse(localStorage.getItem("auth_credentials") || "null");
  setStatus("Ready");
})();
