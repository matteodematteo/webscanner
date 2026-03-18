"use strict";

(function bootstrapApp() {
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
    els: null
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
    const { statusTitle, statusText, statusCard } = state.els;
    statusTitle.textContent = title;
    statusText.textContent = message;
    statusCard.dataset.state = stateName || "idle";
  }

  function setDiagnostics(message) {
    if (state.els && state.els.diagnosticsText) {
      state.els.diagnosticsText.textContent = `Diagnostics: ${message}`;
    }
  }

  function showBootError(error) {
    const message = error && error.message ? error.message : String(error);

    try {
      const statusTitle = document.getElementById("statusTitle");
      const statusText = document.getElementById("statusText");
      const statusCard = document.getElementById("statusCard");
      const diagnosticsText = document.getElementById("diagnosticsText");

      if (statusTitle) statusTitle.textContent = "Startup Error";
      if (statusText) statusText.textContent = message;
      if (statusCard) statusCard.dataset.state = "error";
      if (diagnosticsText) diagnosticsText.textContent = `Diagnostics: startup failed - ${message}`;
    } catch {
      // Last-resort fallback below.
    }

    console.error("App startup failed:", error);
  }

  function showToast(message, duration) {
    const { toast } = state.els;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, duration || 1800);
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
    state.els.scanBtn.disabled = !active || !state.detectorSupported;
  }

  function updateDetectorStatus() {
    state.els.detectorStatus.textContent = state.detectorSupported
      ? "Detector: BarcodeDetector ready"
      : "Detector: unsupported in this browser";
  }

  function updateScanButton() {
    state.els.scanBtn.textContent = state.scanning ? "Stop Scanning" : "Start Scanning";
    state.els.scanBtn.dataset.variant = state.scanning ? "danger" : "";
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
      // Optional feedback only.
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
      // Non-JSON response.
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
      password: password,
      shopkey: shopKey
    };

    localStorage.setItem("auth_cookie", cookie);
    localStorage.setItem("auth_credentials", JSON.stringify(state.credentials));
    showToast("Settings saved", 1800);
    setStatus("Authenticated", "Cookie saved locally for product lookup.", "success");
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

    const headers = new Headers({ Accept: "application/json, text/plain, */*" });
    if (state.authCookie) {
      try {
        headers.set("Cookie", state.authCookie);
      } catch {
        // Browsers may block this header.
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
    if (!navigator.mediaDevices) {
      return "This browser does not expose mediaDevices, so camera access is unavailable.";
    }
    if (!navigator.mediaDevices.getUserMedia) {
      return "This browser does not support getUserMedia for camera access.";
    }
    return "";
  }

  function releaseCurrentStream() {
    if (!state.stream) return;

    const tracks = state.stream.getTracks();
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].stop();
    }

    state.stream = null;
    state.els.cameraPreview.srcObject = null;
  }

  async function attachStream(stream) {
    stopScanning(false);
    releaseCurrentStream();

    state.stream = stream;
    state.els.cameraPreview.srcObject = stream;
    await state.els.cameraPreview.play();

    setPreviewState(true, "Live preview");
    state.els.cameraBtn.textContent = "Restart Camera";
    updateScanButton();
    setDiagnostics("Camera stream started successfully.");
  }

  async function requestCameraAccess() {
    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      throw new Error(supportIssue);
    }

    setStatus("Requesting Camera", "Waiting for browser permission.", "idle");
    setDiagnostics("Calling getUserMedia...");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CONFIG.VIDEO_CONSTRAINTS);
    } catch (error) {
      const errorName = error && error.name ? error.name : "UnknownError";
      const errorMessage = error && error.message ? error.message : "";
      setDiagnostics(`getUserMedia failed with ${errorName}${errorMessage ? `: ${errorMessage}` : ""}`);

      if (errorName === "NotAllowedError") {
        throw new Error("Camera permission was blocked. Check Chrome site settings for this page and allow Camera.");
      }
      if (errorName === "NotFoundError") {
        throw new Error("No camera device was found on this device.");
      }
      if (errorName === "NotReadableError") {
        throw new Error("The camera is already in use by another app.");
      }
      throw error;
    }

    await attachStream(stream);
    state.els.permissionModal.classList.remove("active");
    setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
  }

  function createDetector() {
    if (!state.detectorSupported) return null;
    if (state.detector) return state.detector;

    state.detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "codabar"]
    });

    return state.detector;
  }

  function queueNextScan() {
    if (!state.scanning) return;
    state.scanLoopHandle = window.setTimeout(scanFrame, CONFIG.SCAN_INTERVAL_MS);
  }

  async function handleDetectedBarcode(rawValue) {
    const barcode = String(rawValue || "").trim();
    if (!barcode) {
      queueNextScan();
      return;
    }

    stopScanning(false);
    state.els.barcodeInput.value = barcode;
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

  async function scanFrame() {
    if (!state.scanning || !state.stream) return;

    const video = state.els.cameraPreview;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      queueNextScan();
      return;
    }

    const detector = createDetector();
    if (!detector) {
      stopScanning(false);
      setStatus("Scanner Unsupported", "This browser can show the preview but cannot scan barcodes.", "error");
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      queueNextScan();
      return;
    }

    state.scannerCanvas.width = width;
    state.scannerCanvas.height = height;
    const context = state.scannerCanvas.getContext("2d");
    if (!context) {
      stopScanning(false);
      setStatus("Scan Error", "Could not create a canvas context for barcode detection.", "error");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    try {
      const detections = await detector.detect(state.scannerCanvas);
      if (detections && detections.length > 0) {
        await handleDetectedBarcode(detections[0].rawValue);
        return;
      }
    } catch (error) {
      setStatus("Scan Error", error.message || "Barcode detection failed.", "error");
    }

    queueNextScan();
  }

  function startScanning() {
    if (!state.stream) {
      setStatus("Camera Required", "Enable the camera before starting the scanner.", "error");
      return;
    }
    if (!state.detectorSupported) {
      setStatus("Scanner Unsupported", "This browser does not support automatic barcode scanning.", "error");
      return;
    }
    if (state.scanning) return;

    clearProductInfo();
    state.scanning = true;
    updateScanButton();
    setStatus("Scanning", "Hold the barcode inside the guide frame.", "success");
    queueNextScan();
  }

  function stopScanning(resetStatus) {
    state.scanning = false;
    window.clearTimeout(state.scanLoopHandle);
    state.scanLoopHandle = 0;
    updateScanButton();

    if (resetStatus && state.stream) {
      setStatus("Camera Ready", "Preview is live. You can start scanning now.", "success");
    }
  }

  async function handleManualLookup() {
    const barcode = state.els.barcodeInput.value.trim();
    if (!barcode) {
      setStatus("Barcode Missing", "Type or scan a barcode first.", "error");
      return;
    }

    stopScanning(false);
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
    } finally {
      state.els.saveSettingsBtn.disabled = false;
    }
  }

  function bindEvents() {
    state.els.allowCameraBtn.addEventListener("click", async function () {
      state.els.allowCameraBtn.disabled = true;
      try {
        await requestCameraAccess();
      } catch (error) {
        setStatus("Camera Blocked", error.message || "Camera access failed.", "error");
        setDiagnostics(error.message || "Camera access failed.");
        state.els.permissionModal.classList.add("active");
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
        await requestCameraAccess();
      } catch (error) {
        setStatus("Camera Blocked", error.message || "Camera access failed.", "error");
        setDiagnostics(error.message || "Camera access failed.");
        state.els.permissionModal.classList.add("active");
      } finally {
        state.els.cameraBtn.disabled = false;
      }
    });

    state.els.scanBtn.addEventListener("click", function () {
      if (state.scanning) {
        stopScanning(true);
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

    window.addEventListener("error", function (event) {
      setStatus("Runtime Error", event.message || "Unknown JavaScript error.", "error");
      setDiagnostics(`window error: ${event.message || "Unknown error"}`);
    });

    window.addEventListener("beforeunload", function () {
      stopScanning(false);
      releaseCurrentStream();
    });
  }

  function init() {
    state.els = queryElements();
    requireElements(state.els);

    updateDetectorStatus();
    setPreviewState(false, "Camera idle");
    updateScanButton();
    bindEvents();

    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      setStatus("Camera Unavailable", supportIssue, "error");
      setDiagnostics(supportIssue);
      return;
    }

    if (!state.detectorSupported) {
      setStatus("Preview Only", "BarcodeDetector is not available in this browser.", "idle");
      setDiagnostics("Camera APIs are available. Automatic scanning is not supported here.");
      return;
    }

    setStatus("Ready", "Waiting for camera permission.", "idle");
    setDiagnostics("App initialized. Buttons should now respond.");
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        try {
          init();
        } catch (error) {
          showBootError(error);
        }
      });
    } else {
      init();
    }
  } catch (error) {
    showBootError(error);
  }
}());
