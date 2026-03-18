"use strict";

const CONFIG = {
  COOKIE_POST_URL: "https://lgkiller.mattoteo96.workers.dev/",
  PRODUCT_GET_URL_PREFIX: "https://www.lgerp.cc/goods/ongoodsCode?goodCode=",
  SCAN_COOLDOWN_MS: 1600,
  SCAN_INTERVAL_MS: 220,
  VIDEO_CONSTRAINTS: {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  }
};

const els = {
  allowCameraBtn: document.getElementById("allowCameraBtn"),
  barcodeInput: document.getElementById("barcodeOutput"),
  cameraBadge: document.getElementById("cameraBadge"),
  cameraBtn: document.getElementById("cameraBtn"),
  cameraPreview: document.getElementById("cameraPreview"),
  cameraStatus: document.getElementById("cameraStatus"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  detectorStatus: document.getElementById("detectorStatus"),
  dismissPermissionBtn: document.getElementById("dismissPermissionBtn"),
  passwordInput: document.getElementById("password"),
  permissionModal: document.getElementById("permissionModal"),
  previewEmpty: document.getElementById("previewEmpty"),
  productName: document.getElementById("productName"),
  productPrice: document.getElementById("productPrice"),
  productQty: document.getElementById("productQty"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  scanBtn: document.getElementById("scanBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  shopKeyInput: document.getElementById("shopKey"),
  loginNameInput: document.getElementById("loginName"),
  statusCard: document.getElementById("statusCard"),
  statusText: document.getElementById("statusText"),
  statusTitle: document.getElementById("statusTitle"),
  toast: document.getElementById("toast")
};

const state = {
  authCookie: localStorage.getItem("auth_cookie") || "",
  credentials: readStoredCredentials(),
  detector: null,
  detectorSupported: "BarcodeDetector" in window,
  scanning: false,
  scanLoopHandle: 0,
  scannerCanvas: document.createElement("canvas"),
  stream: null,
  toastTimer: 0,
  lastScanAt: 0
};

function readStoredCredentials() {
  try {
    return JSON.parse(localStorage.getItem("auth_credentials") || "null");
  } catch {
    return null;
  }
}

function setStatus(title, message, stateName = "idle") {
  els.statusTitle.textContent = title;
  els.statusText.textContent = message;
  els.statusCard.dataset.state = stateName;
}

function showToast(message, duration = 1800) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, duration);
}

function clearProductInfo() {
  els.productName.value = "";
  els.productPrice.value = "";
  els.productQty.value = "";
}

function setPreviewState({ active, label }) {
  els.previewEmpty.hidden = active;
  els.cameraBadge.textContent = label;
  els.cameraStatus.textContent = `Camera: ${active ? "active" : "inactive"}`;
  els.scanBtn.disabled = !active || !state.detectorSupported;
}

function updateDetectorStatus() {
  els.detectorStatus.textContent = state.detectorSupported
    ? "Detector: BarcodeDetector ready"
    : "Detector: unsupported in this browser";
}

function updateScanButton() {
  els.scanBtn.textContent = state.scanning ? "Stop Scanning" : "Start Scanning";
  els.scanBtn.dataset.variant = state.scanning ? "danger" : "";
}

function playBeep() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;

    const audioContext = new Context();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.14);
  } catch {
    // Audio feedback is optional.
  }
}

function formatCookieFromResponse(respContent) {
  if (!respContent) return "";

  if (typeof respContent === "object" && respContent !== null) {
    if (respContent.fullCookie) return String(respContent.fullCookie);
    if (respContent.cookie) return String(respContent.cookie);
  }

  try {
    const parsed = JSON.parse(String(respContent));
    if (parsed.fullCookie) return String(parsed.fullCookie);
    if (parsed.cookie) return String(parsed.cookie);
  } catch {
    // Not JSON, continue with string parsing.
  }

  return String(respContent)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const lower = part.toLowerCase();
      return !(
        lower.startsWith("path=") ||
        lower.startsWith("expires=") ||
        lower.startsWith("domain=") ||
        lower.startsWith("max-age=") ||
        lower.includes("secure") ||
        lower.includes("httponly") ||
        lower.includes("samesite")
      );
    })
    .filter((part) => part.includes("="))
    .join("; ");
}

async function postCredentialsAndStoreCookie(loginName, password, shopKey) {
  const params = new URLSearchParams();
  params.set("login_name", loginName || "");
  params.set("password", password || "");
  params.set("shopkey", shopKey || "");

  setStatus("Authenticating", "Requesting a fresh product cookie.", "idle");

  const response = await fetch(CONFIG.COOKIE_POST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Authentication failed with status ${response.status}`);
  }

  const responseText = await response.text();
  const cookie = formatCookieFromResponse(responseText);
  if (!cookie) {
    throw new Error("The authentication endpoint did not return a usable cookie.");
  }

  state.authCookie = cookie;
  state.credentials = {
    login_name: loginName,
    password,
    shopkey: shopKey
  };

  localStorage.setItem("auth_cookie", cookie);
  localStorage.setItem("auth_credentials", JSON.stringify(state.credentials));
  showToast("Settings saved");
  setStatus("Authenticated", "Cookie saved locally for product lookup.", "success");
}

async function fetchProductByBarcode(barcode, allowAuthRefresh = true) {
  const cleanBarcode = String(barcode || "").trim();
  if (!cleanBarcode) {
    throw new Error("Barcode is empty.");
  }

  setStatus("Looking Up Product", `Fetching data for ${cleanBarcode}.`, "idle");

  const headers = new Headers({ Accept: "application/json, text/plain, */*" });

  if (state.authCookie) {
    try {
      headers.set("Cookie", state.authCookie);
    } catch {
      // Browsers may block programmatic Cookie headers.
    }
  }

  const response = await fetch(`${CONFIG.PRODUCT_GET_URL_PREFIX}${encodeURIComponent(cleanBarcode)}`, {
    method: "GET",
    headers,
    credentials: "include"
  });

  if ((response.status === 401 || response.status === 403) && allowAuthRefresh && state.credentials) {
    await postCredentialsAndStoreCookie(
      state.credentials.login_name,
      state.credentials.password,
      state.credentials.shopkey
    );

    return fetchProductByBarcode(cleanBarcode, false);
  }

  if (!response.ok) {
    throw new Error(`Product request failed with status ${response.status}`);
  }

  const data = await response.json();
  const normalized = extractProductFields(data);

  setStatus("Product Loaded", `Loaded data for barcode ${cleanBarcode}.`, "success");
  return normalized;
}

function extractProductFields(data) {
  const queue = [data];
  const found = {
    name: "",
    price: "",
    qty: ""
  };

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;

    if (!found.name) {
      found.name = firstDefined(node.italian_name, node.italianName, node.name, node.product_name);
    }
    if (!found.price) {
      found.price = firstDefined(node.s_price, node.sPrice, node.price, node.sale_price);
    }
    if (!found.qty) {
      found.qty = firstDefined(node.real_inventory, node.resporeal_inventoryse, node.qty, node.quantity);
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return {
    name: found.name ? String(found.name) : "",
    price: found.price ? String(found.price) : "",
    qty: found.qty ? String(found.qty) : "",
    raw: data
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

async function requestCameraAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access.");
  }

  setStatus("Requesting Camera", "Waiting for browser permission.", "idle");

  const stream = await navigator.mediaDevices.getUserMedia(CONFIG.VIDEO_CONSTRAINTS);
  await attachStream(stream);

  els.permissionModal.classList.remove("active");
  setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
}

async function attachStream(stream) {
  stopScanning({ resetStatus: false });
  releaseCurrentStream();

  state.stream = stream;
  els.cameraPreview.srcObject = stream;

  try {
    await els.cameraPreview.play();
  } catch (error) {
    releaseCurrentStream();
    throw new Error(`The camera stream started but the preview could not play: ${error.message}`);
  }

  setPreviewState({ active: true, label: "Live preview" });
  els.cameraBtn.textContent = "Restart Camera";
  updateScanButton();
}

function releaseCurrentStream() {
  if (!state.stream) return;

  for (const track of state.stream.getTracks()) {
    track.stop();
  }

  state.stream = null;
  els.cameraPreview.srcObject = null;
}

function createDetector() {
  if (!state.detectorSupported) return null;
  if (state.detector) return state.detector;

  state.detector = new window.BarcodeDetector({
    formats: [
      "ean_13",
      "ean_8",
      "upc_a",
      "upc_e",
      "code_128",
      "code_39",
      "codabar"
    ]
  });

  return state.detector;
}

async function scanFrame() {
  if (!state.scanning || !state.stream) return;

  const video = els.cameraPreview;
  if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
    queueNextScan();
    return;
  }

  const detector = createDetector();
  if (!detector) {
    stopScanning({ resetStatus: false });
    setStatus("Scanner Unsupported", "This browser can show the preview but cannot scan barcodes.", "error");
    return;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    queueNextScan();
    return;
  }

  const canvas = state.scannerCanvas;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    stopScanning({ resetStatus: false });
    setStatus("Scan Error", "Could not create a canvas context for barcode detection.", "error");
    return;
  }

  context.drawImage(video, 0, 0, width, height);

  try {
    const detections = await detector.detect(canvas);
    const match = detections.find((item) => item.rawValue);

    if (match && Date.now() - state.lastScanAt >= CONFIG.SCAN_COOLDOWN_MS) {
      state.lastScanAt = Date.now();
      await handleDetectedBarcode(match.rawValue);
      return;
    }
  } catch (error) {
    setStatus("Scan Error", error.message || "Barcode detection failed.", "error");
  }

  queueNextScan();
}

function queueNextScan() {
  if (!state.scanning) return;
  state.scanLoopHandle = window.setTimeout(scanFrame, CONFIG.SCAN_INTERVAL_MS);
}

function startScanning() {
  if (!state.stream) {
    setStatus("Camera Required", "Enable the camera before starting the scanner.", "error");
    return;
  }

  if (!state.detectorSupported) {
    setStatus("Scanner Unsupported", "This browser cannot scan barcodes automatically.", "error");
    return;
  }

  if (state.scanning) return;

  clearProductInfo();
  state.scanning = true;
  state.lastScanAt = 0;
  updateScanButton();
  setStatus("Scanning", "Hold the barcode inside the guide frame.", "success");
  queueNextScan();
}

function stopScanning(options = {}) {
  state.scanning = false;
  window.clearTimeout(state.scanLoopHandle);
  state.scanLoopHandle = 0;
  updateScanButton();

  if (options.resetStatus && state.stream) {
    setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
  }
}

async function handleDetectedBarcode(rawValue) {
  const barcode = String(rawValue || "").trim();
  if (!barcode) {
    queueNextScan();
    return;
  }

  stopScanning({ resetStatus: false });
  els.barcodeInput.value = barcode;
  playBeep();

  try {
    const product = await fetchProductByBarcode(barcode);
    els.productName.value = product.name;
    els.productPrice.value = product.price;
    els.productQty.value = product.qty;
  } catch (error) {
    setStatus("Lookup Failed", error.message || "Could not load product data.", "error");
  }
}

async function handleManualLookup() {
  const barcode = els.barcodeInput.value.trim();
  if (!barcode) {
    setStatus("Barcode Missing", "Type or scan a barcode first.", "error");
    return;
  }

  stopScanning({ resetStatus: false });
  clearProductInfo();
  playBeep();

  try {
    const product = await fetchProductByBarcode(barcode);
    els.productName.value = product.name;
    els.productPrice.value = product.price;
    els.productQty.value = product.qty;
  } catch (error) {
    setStatus("Lookup Failed", error.message || "Could not load product data.", "error");
  }
}

function openSettingsModal() {
  const credentials = state.credentials || {};
  els.shopKeyInput.value = credentials.shopkey || "";
  els.loginNameInput.value = credentials.login_name || "";
  els.passwordInput.value = credentials.password || "";
  els.settingsModal.classList.add("active");
}

function closeSettingsModal() {
  els.settingsModal.classList.remove("active");
}

async function saveSettings() {
  const shopKey = els.shopKeyInput.value.trim();
  const loginName = els.loginNameInput.value.trim();
  const password = els.passwordInput.value;

  if (!loginName || !password) {
    setStatus("Settings Incomplete", "Login name and password are required.", "error");
    return;
  }

  els.saveSettingsBtn.disabled = true;

  try {
    await postCredentialsAndStoreCookie(loginName, password, shopKey);
    closeSettingsModal();
  } catch (error) {
    setStatus("Settings Failed", error.message || "Could not save settings.", "error");
  } finally {
    els.saveSettingsBtn.disabled = false;
  }
}

function bindEvents() {
  els.allowCameraBtn.addEventListener("click", async () => {
    els.allowCameraBtn.disabled = true;

    try {
      await requestCameraAccess();
    } catch (error) {
      setStatus("Camera Blocked", error.message || "Camera access was denied.", "error");
      els.permissionModal.classList.add("active");
    } finally {
      els.allowCameraBtn.disabled = false;
    }
  });

  els.dismissPermissionBtn.addEventListener("click", () => {
    els.permissionModal.classList.remove("active");
    setStatus("Permission Needed", "Enable the camera whenever you are ready to scan.", "idle");
  });

  els.cameraBtn.addEventListener("click", async () => {
    els.cameraBtn.disabled = true;

    try {
      await requestCameraAccess();
    } catch (error) {
      setStatus("Camera Blocked", error.message || "Camera access was denied.", "error");
      els.permissionModal.classList.add("active");
    } finally {
      els.cameraBtn.disabled = false;
    }
  });

  els.scanBtn.addEventListener("click", () => {
    if (state.scanning) {
      stopScanning({ resetStatus: true });
      return;
    }

    startScanning();
  });

  els.barcodeInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    await handleManualLookup();
  });

  els.settingsBtn.addEventListener("click", openSettingsModal);
  els.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  els.saveSettingsBtn.addEventListener("click", saveSettings);

  els.settingsModal.addEventListener("click", (event) => {
    if (event.target === els.settingsModal) {
      closeSettingsModal();
    }
  });

  els.permissionModal.addEventListener("click", (event) => {
    if (event.target === els.permissionModal) {
      els.permissionModal.classList.remove("active");
    }
  });

  window.addEventListener("beforeunload", () => {
    stopScanning({ resetStatus: false });
    releaseCurrentStream();
  });
}

function init() {
  updateDetectorStatus();
  setPreviewState({ active: false, label: "Camera idle" });
  updateScanButton();
  bindEvents();

  if (!state.detectorSupported) {
    setStatus(
      "Preview Only",
      "Your browser can still show the camera preview, but barcode detection is not supported here.",
      "idle"
    );
    return;
  }

  setStatus("Ready", "Waiting for camera permission.", "idle");
}

init();
