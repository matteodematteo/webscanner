// =====================
// CONFIG
// =====================
const CONFIG = {
  COOKIE_POST_URL: "https://lgkiller.mattoteo96.workers.dev/",
  PRODUCT_GET_URL_PREFIX: "https://www.lgerp.cc/goods/ongoodsCode?goodCode=",
  SCAN_DELAY: 1500
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
let cameraStartedForPreview = false;
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
// COOKIE HANDLING
// =====================
function formatCookieFromResponse(respContent) {
  try {
    if (!respContent) return "";
    if (typeof respContent === "object") {
      if (respContent.fullCookie) return String(respContent.fullCookie);
      if (respContent.cookie) return String(respContent.cookie);
    }
    try {
      const p = JSON.parse(respContent);
      if (p.fullCookie) return String(p.fullCookie);
      if (p.cookie) return String(p.cookie);
    } catch (e) {}
    const parts = String(respContent).split(";");
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
        pairs.push(t);
      }
    }
    return pairs.join("; ");
  } catch (e) {
    console.error("formatCookie error", e);
    return "";
  }
}

async function storeCookieFromPostResponse(responseText) {
  const cookieStr = formatCookieFromResponse(responseText);
  if (cookieStr) {
    storedCookie = cookieStr;
    localStorage.setItem("auth_cookie", storedCookie);
    return true;
  }
  return false;
}

async function postCredentialsAndStoreCookie(login_name, password, shopkey) {
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

// =====================
// PRODUCT FETCH
// =====================
async function fetchProductByBarcode(barcode, allowAuthRefresh = true) {
  if (!barcode) throw new Error("Empty barcode");
  const url = CONFIG.PRODUCT_GET_URL_PREFIX + encodeURIComponent(barcode);
  try {
    setStatus("Fetching product...");
    const headers = {};
    if (storedCookie) headers["Cookie"] = storedCookie;
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      if ((res.status === 401 || res.status === 403 || res.status === 302) && allowAuthRefresh && storedCredentials) {
        setStatus("Auth failed - refreshing cookie...");
        try { await postCredentialsAndStoreCookie(storedCredentials.login_name, storedCredentials.password, storedCredentials.shopkey); } catch (e) {}
        return fetchProductByBarcode(barcode, false);
      }
      throw new Error(`Product request failed (${res.status})`);
    }
    const data = await res.json();
    let name = data.italian_name ?? data.italianName ?? null;
    let price = data.s_price ?? data.sPrice ?? data.price ?? null;
    let qty = data.resporeal_inventoryse ?? data.real_inventory ?? data.qty ?? null;
    if (!name || !price || !qty) {
      const seen = [data];
      while (seen.length) {
        const node = seen.shift();
        if (!node || typeof node !== "object") continue;
        if (!name && node.italian_name) name = node.italian_name;
        if (!price && node.s_price) price = node.s_price;
        if (!qty && node.resporeal_inventoryse) qty = node.resporeal_inventoryse;
        for (const k of Object.keys(node)) if (node[k] && typeof node[k] === "object") seen.push(node[k]);
      }
    }
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
// CAMERA PERMISSION & PREVIEW
// =====================
async function ensureCameraPermission() {
  // Ask for permission explicitly using getUserMedia (prompts user)
  try {
    setStatus("Requesting camera permission...");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    // We got permission — stop tracks (we just wanted prompt) and return true
    stream.getTracks().forEach(t => t.stop());
    setStatus("Camera permission granted");
    return true;
  } catch (err) {
    console.warn("Camera permission denied or error", err);
    setStatus("Camera permission denied", true);
    return false;
  }
}

async function getBestCameraId() {
  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) return null;
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
  try {
    await html5QrCode.start(
      cameraId || { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 280, height: 280 },
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
      async (decodedText) => {
        if (!isScanningActive) return;
        const now = Date.now();
        if (now - lastScanTime < CONFIG.SCAN_DELAY) return;
        lastScanTime = now;
        if (!decodedText || decodedText.length < 6) return;
        playBeep();
        barcodeInput.value = decodedText;
        isScanningActive = false;
        scanBtn.textContent = "Start Scanning";
        scanBtn.style.backgroundColor = "#007bff";
        setStatus("Detected: " + decodedText);
        clearProductInfo();
        try {
          const product = await fetchProductByBarcode(decodedText);
          productNameEl.value = product.name || "";
          productPriceEl.value = product.price || "";
          productQtyEl.value = product.qty || "";
        } catch (err) {
          alert("Product lookup failed: " + (err.message || String(err)));
        }
      },
      (errorMessage) => {
        // ignore per-frame failures
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
// UI: Start/Stop scanning modes
// =====================

async function startScanningMode() {
  const ok = await ensureCameraPermission();
  if (!ok) {
    // user denied; show instruction
    if (confirm("Camera permission is required. Please allow camera access in browser settings. Try again?")) {
      return;
    } else {
      return;
    }
  }
  if (!html5QrCode) {
    await initPreviewAndScanner();
  }
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

scanBtn.addEventListener("click", async () => {
  if (!cameraStartedForPreview) {
    // ensure permission & preview started
    const ok = await ensureCameraPermission();
    if (!ok) {
      return;
    }
    await initPreviewAndScanner();
  }
  if (isScanningActive) {
    await stopScanningMode();
  } else {
    await startScanningMode();
  }
});

// Enter key in input triggers lookup
barcodeInput.addEventListener("keydown", async (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    const code = barcodeInput.value.trim();
    if (!code) { alert("Please enter a barcode"); return; }
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

// Settings modal
settingsBtn.addEventListener("click", () => {
  const creds = JSON.parse(localStorage.getItem("auth_credentials") || "null");
  shopKeyInput.value = creds?.shopkey || "";
  loginNameInput.value = creds?.login_name || "";
  passwordInput.value = creds?.password || "";
  modalBackdrop.classList.add("active");
});
closeModalBtn.addEventListener("click", () => modalBackdrop.classList.remove("active"));
saveSettingsBtn.addEventListener("click", async () => {
  const shopkey = shopKeyInput.value.trim();
  const login_name = loginNameInput.value.trim();
  const password = passwordInput.value;
  if (!login_name || !password) {
    alert("Please enter login_name and password");
    return;
  }
  saveSettingsBtn.disabled = true;
  try {
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

// Initialize only permission prompt attempt on load if user gesture allowed.
// Many browsers block getUserMedia unless triggered by user; we attempt but ignore errors.
(async () => {
  setStatus("Initializing...");
  // Attempt to request permission silently (will prompt); if browser blocks, user will be prompted on Start button
  try {
    await ensureCameraPermission();
    // if permission granted, init preview
    await initPreviewAndScanner();
  } catch (e) {
    // ignore; user can click Start Scanning to trigger permission prompt
    console.warn("Preview init skipped:", e);
  }
  // load stored cookie/credentials
  storedCookie = localStorage.getItem("auth_cookie") || "";
  storedCredentials = JSON.parse(localStorage.getItem("auth_credentials") || "null");
  setStatus("Ready");
})();
