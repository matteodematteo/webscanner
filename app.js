"use strict";

(function bootstrapApp() {
  const CONFIG = {
    COOKIE_POST_URL: "https://lgkiller.mattoteo96.workers.dev/",
    PRODUCT_GET_URL_PREFIX: "https://www.lgerp.cc/goods/ongoodsCode?goodCode=",
    SCAN_COOLDOWN_MS: 1600,
    ZXING_RESTART_DELAY_MS: 180,
    CAMERA_CONSTRAINTS: {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 24, max: 30 }
      }
    },
    FORMATS: [
      "qr_code",
      "data_matrix",
      "aztec",
      "pdf_417",
      "ean_13",
      "ean_8",
      "upc_a",
      "upc_e",
      "code_128",
      "code_39",
      "itf",
      "codabar"
    ]
  };

  const state = {
    authCookie: localStorage.getItem("auth_cookie") || "",
    credentials: readStoredCredentials(),
    els: null,
    lastScanAt: 0,
    reader: null,
    scanControls: null,
    scanningActive: false,
    stream: null,
    toastTimer: 0
  };

  function readStoredCredentials() {
    try {
      return JSON.parse(localStorage.getItem("auth_credentials") || "null");
    } catch {
      return null;
    }
  }

  function queryElements() {
    return {
      allowCameraBtn: document.getElementById("allowCameraBtn"),
      barcodeInput: document.getElementById("barcodeOutput"),
      cameraBadge: document.getElementById("cameraBadge"),
      cameraBtn: document.getElementById("cameraBtn"),
      cameraPreview: document.getElementById("cameraPreview"),
      cameraStatus: document.getElementById("cameraStatus"),
      closeSettingsBtn: document.getElementById("closeSettingsBtn"),
      cookieStatus: document.getElementById("cookieStatus"),
      detectorStatus: document.getElementById("detectorStatus"),
      diagnosticsText: document.getElementById("diagnosticsText"),
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
  }

  function requireElements(els) {
    const missing = Object.entries(els)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(`Missing required DOM elements: ${missing.join(", ")}`);
    }
  }

  function setStatus(title, message, stateName) {
    state.els.statusTitle.textContent = title;
    state.els.statusText.textContent = message;
    state.els.statusCard.dataset.state = stateName || "idle";
  }

  function setDiagnostics(message) {
    state.els.diagnosticsText.textContent = `Diagnostics: ${message}`;
  }

  function showToast(message, duration) {
    window.clearTimeout(state.toastTimer);
    state.els.toast.textContent = message;
    state.els.toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => {
      state.els.toast.classList.remove("show");
    }, duration || 1800);
  }

  function updateCookieStatus() {
    state.els.cookieStatus.textContent = state.authCookie
      ? `Cookie: saved (${state.authCookie.length})`
      : "Cookie: missing";
  }

  function clearProductInfo() {
    state.els.productName.value = "";
    state.els.productPrice.value = "";
    state.els.productQty.value = "";
  }

  function setPreviewState(active, label) {
    state.els.previewEmpty.hidden = active;
    state.els.cameraBadge.textContent = label;
    state.els.cameraStatus.textContent = `Camera: ${active ? "active" : "inactive"}`;
    state.els.scanBtn.disabled = !active;
  }

  function updateScanButton() {
    state.els.scanBtn.textContent = state.scanningActive ? "Stop Scanning" : "Start Scanning";
    state.els.scanBtn.dataset.variant = state.scanningActive ? "danger" : "";
  }

  function playBeep() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;

      const audioContext = new Context();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = 920;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      gain.gain.setValueAtTime(0.001, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.13);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.13);
    } catch {
      // Optional feedback only.
    }
  }

  function safeJsonParse(value) {
    if (typeof value === "object" && value !== null) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }

  function appInventorCookieFromFullCookie(fullCookie) {
    const parts = String(fullCookie || "").split(",");
    const selectedIndexes = [5, 3];
    const cookieParts = [];

    for (let index = 0; index < selectedIndexes.length; index += 1) {
      const rawSegment = parts[selectedIndexes[index] - 1];
      if (!rawSegment) continue;

      const firstSemicolonPart = rawSegment.split(";")[0].trim();
      if (firstSemicolonPart && firstSemicolonPart.includes("=")) {
        cookieParts.push(firstSemicolonPart);
      }
    }

    if (cookieParts.length > 0) {
      return cookieParts.join("; ");
    }

    return "";
  }

  function genericCookieFromFullCookie(fullCookie) {
    const matches = String(fullCookie || "").match(/[A-Za-z0-9_.-]+=([^;,]|"[^"]*")+/g);
    if (!matches || matches.length === 0) {
      return "";
    }

    const cookies = [];
    for (let index = 0; index < matches.length; index += 1) {
      const token = matches[index].trim();
      const lower = token.toLowerCase();
      if (
        lower.startsWith("path=") ||
        lower.startsWith("expires=") ||
        lower.startsWith("domain=") ||
        lower.startsWith("max-age=") ||
        lower.startsWith("samesite=")
      ) {
        continue;
      }
      cookies.push(token);
    }

    return cookies.join("; ");
  }

  function extractCookieFromResponse(responseContent) {
    const parsed = safeJsonParse(responseContent);
    const fullCookie =
      parsed?.fullCookie ||
      parsed?.cookie ||
      parsed?.data?.fullCookie ||
      parsed?.data?.cookie ||
      "";

    if (fullCookie) {
      const mitStyleCookie = appInventorCookieFromFullCookie(fullCookie);
      if (mitStyleCookie) {
        return mitStyleCookie;
      }

      const genericCookie = genericCookieFromFullCookie(fullCookie);
      if (genericCookie) {
        return genericCookie;
      }
    }

    if (parsed?.cookie) {
      return String(parsed.cookie);
    }

    return "";
  }

  async function postCredentialsAndStoreCookie(loginName, password, shopKey) {
    const params = new URLSearchParams();
    params.set("login_name", loginName || "");
    params.set("password", password || "");
    params.set("shopkey", shopKey || "");

    setStatus("Authenticating", "Requesting a fresh product cookie.", "idle");
    setDiagnostics("Posting login data to the cookie endpoint.");

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
    const cookie = extractCookieFromResponse(responseText);
    if (!cookie) {
      throw new Error("Could not extract a cookie from the JSON response.");
    }

    state.authCookie = cookie;
    state.credentials = {
      login_name: loginName,
      password: password,
      shopkey: shopKey
    };

    localStorage.setItem("auth_cookie", cookie);
    localStorage.setItem("auth_credentials", JSON.stringify(state.credentials));
    updateCookieStatus();
    showToast("Settings saved");
    setStatus("Authenticated", "Cookie parsed and stored locally.", "success");
    setDiagnostics(`Cookie saved: ${cookie}`);
  }

  function firstDefined() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return "";
  }

  function extractProductFields(data) {
    const queue = [data];
    const found = { name: "", price: "", qty: "" };

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

      const values = Object.values(node);
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
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

  async function fetchProductByBarcode(barcode, allowAuthRefresh) {
    const cleanBarcode = String(barcode || "").trim();
    if (!cleanBarcode) {
      throw new Error("Barcode is empty.");
    }

    setStatus("Looking Up Product", `Fetching data for ${cleanBarcode}.`, "idle");

    const headers = new Headers({
      Accept: "application/json, text/plain, */*"
    });

    if (state.authCookie) {
      try {
        headers.set("Cookie", state.authCookie);
      } catch {
        // Browser fetch forbids this header in many cases.
      }
    }

    const response = await fetch(`${CONFIG.PRODUCT_GET_URL_PREFIX}${encodeURIComponent(cleanBarcode)}`, {
      method: "GET",
      headers: headers,
      credentials: "include"
    });

    if ((response.status === 401 || response.status === 403) && allowAuthRefresh !== false && state.credentials) {
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

  function getCameraSupportIssue() {
    if (!window.isSecureContext) {
      return 'Camera access requires a secure page. Open this app from "https://" or "http://localhost".';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return "This browser does not support camera access.";
    }
    if (!window.ZXingBrowser || !window.ZXingBrowser.BrowserMultiFormatReader) {
      return "The ZXing scanner library did not load.";
    }
    return "";
  }

  function buildZxingHints() {
    const browserApi = window.ZXingBrowser;
    const coreApi = window.ZXing;
    if (!browserApi || !coreApi?.DecodeHintType || !coreApi?.BarcodeFormat) {
      return null;
    }

    const formats = [];
    const formatMap = coreApi.BarcodeFormat;
    const wantedFormats = [
      "QR_CODE",
      "DATA_MATRIX",
      "AZTEC",
      "PDF_417",
      "EAN_13",
      "EAN_8",
      "UPC_A",
      "UPC_E",
      "CODE_128",
      "CODE_39",
      "ITF",
      "CODABAR"
    ];

    for (let index = 0; index < wantedFormats.length; index += 1) {
      const format = formatMap[wantedFormats[index]];
      if (format !== undefined) {
        formats.push(format);
      }
    }

    if (formats.length === 0) {
      return null;
    }

    const hints = new Map();
    hints.set(coreApi.DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(coreApi.DecodeHintType.TRY_HARDER, true);
    return hints;
  }

  async function applyTrackEnhancements() {
    const videoTrack = state.stream?.getVideoTracks?.()[0];
    if (!videoTrack || !videoTrack.getCapabilities || !videoTrack.applyConstraints) {
      return;
    }

    const capabilities = videoTrack.getCapabilities();
    const advanced = [];

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    } else if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("single-shot")) {
      advanced.push({ focusMode: "single-shot" });
    }

    if (capabilities.zoom && typeof capabilities.zoom.max === "number") {
      const zoomValue = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min || 1, 1.5));
      advanced.push({ zoom: zoomValue });
    }

    if (advanced.length === 0) {
      return;
    }

    try {
      await videoTrack.applyConstraints({ advanced: advanced });
      setDiagnostics("Camera started with focus/zoom enhancements where supported.");
    } catch {
      setDiagnostics("Camera started. Focus enhancements are not supported on this device.");
    }
  }

  function releaseCameraSession() {
    if (state.scanControls && typeof state.scanControls.stop === "function") {
      try {
        state.scanControls.stop();
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (state.stream) {
      const tracks = state.stream.getTracks();
      for (let index = 0; index < tracks.length; index += 1) {
        tracks[index].stop();
      }
    }

    state.scanControls = null;
    state.stream = null;
    state.scanningActive = false;
    state.els.cameraPreview.srcObject = null;
    setPreviewState(false, "Camera idle");
    updateScanButton();
  }

  async function ensureReader() {
    if (state.reader) {
      return state.reader;
    }

    const BrowserMultiFormatReader = window.ZXingBrowser?.BrowserMultiFormatReader;
    if (!BrowserMultiFormatReader) {
      throw new Error("The ZXing browser reader is unavailable.");
    }

    const hints = buildZxingHints();
    state.reader = hints
      ? new BrowserMultiFormatReader(hints, CONFIG.ZXING_RESTART_DELAY_MS)
      : new BrowserMultiFormatReader(undefined, CONFIG.ZXING_RESTART_DELAY_MS);

    return state.reader;
  }

  async function handleDetectedCode(text) {
    const now = Date.now();
    if (now - state.lastScanAt < CONFIG.SCAN_COOLDOWN_MS) {
      return;
    }

    const barcode = String(text || "").trim();
    if (!barcode) {
      return;
    }

    state.lastScanAt = now;
    state.scanningActive = false;
    updateScanButton();
    state.els.barcodeInput.value = barcode;
    playBeep();
    clearProductInfo();

    try {
      const product = await fetchProductByBarcode(barcode, true);
      state.els.productName.value = product.name;
      state.els.productPrice.value = product.price;
      state.els.productQty.value = product.qty;
    } catch (error) {
      setStatus("Lookup Failed", error.message || "Could not load product data.", "error");
    }
  }

  async function startCameraSession() {
    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      throw new Error(supportIssue);
    }

    releaseCameraSession();
    setStatus("Requesting Camera", "Waiting for browser permission.", "idle");
    setDiagnostics("Starting ZXing camera session.");

    const reader = await ensureReader();
    state.scanControls = await reader.decodeFromConstraints(
      CONFIG.CAMERA_CONSTRAINTS,
      state.els.cameraPreview,
      async (result, error, controls) => {
        if (controls) {
          state.scanControls = controls;
        }

        state.stream = state.els.cameraPreview.srcObject || state.stream;
        if (!state.stream) {
          return;
        }

        if (!result) {
          return;
        }

        if (!state.scanningActive) {
          return;
        }

        await handleDetectedCode(result.getText ? result.getText() : result.text);
      }
    );

    state.stream = state.els.cameraPreview.srcObject;
    await applyTrackEnhancements();
    state.els.permissionModal.classList.remove("active");
    state.els.cameraBtn.textContent = "Restart Camera";
    setPreviewState(true, "Live preview");
    updateScanButton();
    setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
  }

  function startScanning() {
    if (!state.stream) {
      setStatus("Camera Required", "Enable the camera before starting the scanner.", "error");
      return;
    }

    state.scanningActive = true;
    state.lastScanAt = 0;
    clearProductInfo();
    updateScanButton();
    setStatus("Scanning", "ZXing is decoding the live preview.", "success");
  }

  function stopScanning() {
    state.scanningActive = false;
    updateScanButton();
    if (state.stream) {
      setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
    }
  }

  async function handleManualLookup() {
    const barcode = state.els.barcodeInput.value.trim();
    if (!barcode) {
      setStatus("Barcode Missing", "Type or scan a barcode first.", "error");
      return;
    }

    stopScanning();
    clearProductInfo();
    playBeep();

    try {
      const product = await fetchProductByBarcode(barcode, true);
      state.els.productName.value = product.name;
      state.els.productPrice.value = product.price;
      state.els.productQty.value = product.qty;
    } catch (error) {
      setStatus("Lookup Failed", error.message || "Could not load product data.", "error");
    }
  }

  function openSettingsModal() {
    const credentials = state.credentials || {};
    state.els.shopKeyInput.value = credentials.shopkey || "";
    state.els.loginNameInput.value = credentials.login_name || "";
    state.els.passwordInput.value = credentials.password || "";
    state.els.settingsModal.classList.add("active");
  }

  function closeSettingsModal() {
    state.els.settingsModal.classList.remove("active");
  }

  async function saveSettings() {
    const shopKey = state.els.shopKeyInput.value.trim();
    const loginName = state.els.loginNameInput.value.trim();
    const password = state.els.passwordInput.value;

    if (!loginName || !password) {
      setStatus("Settings Incomplete", "Login name and password are required.", "error");
      return;
    }

    state.els.saveSettingsBtn.disabled = true;
    try {
      await postCredentialsAndStoreCookie(loginName, password, shopKey);
      closeSettingsModal();
    } catch (error) {
      setStatus("Settings Failed", error.message || "Could not save settings.", "error");
      setDiagnostics(error.message || "Cookie parsing failed.");
    } finally {
      state.els.saveSettingsBtn.disabled = false;
    }
  }

  function bindEvents() {
    state.els.allowCameraBtn.addEventListener("click", async function () {
      state.els.allowCameraBtn.disabled = true;
      try {
        await startCameraSession();
      } catch (error) {
        setStatus("Camera Blocked", error.message || "Camera access failed.", "error");
        setDiagnostics(error.message || "Camera access failed.");
      } finally {
        state.els.allowCameraBtn.disabled = false;
      }
    });

    state.els.dismissPermissionBtn.addEventListener("click", function () {
      state.els.permissionModal.classList.remove("active");
      setStatus("Permission Needed", "Enable the camera whenever you are ready to scan.", "idle");
    });

    state.els.cameraBtn.addEventListener("click", async function () {
      state.els.cameraBtn.disabled = true;
      try {
        await startCameraSession();
      } catch (error) {
        setStatus("Camera Blocked", error.message || "Camera access failed.", "error");
        setDiagnostics(error.message || "Camera access failed.");
      } finally {
        state.els.cameraBtn.disabled = false;
      }
    });

    state.els.scanBtn.addEventListener("click", function () {
      if (state.scanningActive) {
        stopScanning();
      } else {
        startScanning();
      }
    });

    state.els.settingsBtn.addEventListener("click", openSettingsModal);
    state.els.closeSettingsBtn.addEventListener("click", closeSettingsModal);
    state.els.saveSettingsBtn.addEventListener("click", saveSettings);

    state.els.barcodeInput.addEventListener("keydown", async function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        await handleManualLookup();
      }
    });

    state.els.settingsModal.addEventListener("click", function (event) {
      if (event.target === state.els.settingsModal) {
        closeSettingsModal();
      }
    });

    state.els.permissionModal.addEventListener("click", function (event) {
      if (event.target === state.els.permissionModal) {
        state.els.permissionModal.classList.remove("active");
      }
    });

    window.addEventListener("beforeunload", function () {
      releaseCameraSession();
    });

    window.addEventListener("error", function (event) {
      setStatus("Runtime Error", event.message || "Unknown JavaScript error.", "error");
      setDiagnostics(`window error: ${event.message || "Unknown error"}`);
    });
  }

  function init() {
    state.els = queryElements();
    requireElements(state.els);
    updateCookieStatus();
    updateScanButton();
    bindEvents();

    state.els.detectorStatus.textContent = "Detector: ZXing browser scanner";
    setPreviewState(false, "Camera idle");

    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      setStatus("Camera Unavailable", supportIssue, "error");
      setDiagnostics(supportIssue);
      return;
    }

    setStatus("Ready", "Waiting for camera permission.", "idle");
    setDiagnostics("ZXing loaded. Cookie parser is ready.");
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  } catch (error) {
    console.error(error);
  }
}());
