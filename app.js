"use strict";

(function bootstrapWebBarcodeScanner() {
  const CONFIG = {
    cookieProxyEndpoint: "https://lgkiller.mattoteo96.workers.dev/",
    infoEndpoint: "https://lgerp.cc/goods/ongoodsCode",
    infoProxyEndpoint: "https://lgkillergetinfo.mattoteo96.workers.dev/",
    settingsStorageKey: "web_barcode_scanner_settings",
    cookieStorageKey: "web_barcode_scanner_cookie",
    cookieStatusStorageKey: "web_barcode_scanner_cookie_status",
    scanIntervalMs: 1200,
    preferredSquareSize: 2160,
    resultFields: [
      "id",
      "goods_code",
      "italian_name",
      "p_price",
      "s_price",
      "real_inventory",
      "discount_price",
      "discount_percent",
      "supplier_name",
      "spec"
    ],
    videoConstraints: {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 2160, max: 3840 },
        height: { ideal: 2160, max: 3840 },
        aspectRatio: { ideal: 1 },
        frameRate: { ideal: 30, max: 60 },
        resizeMode: "crop-and-scale"
      }
    }
  };

  const state = {
    els: null,
    stream: null,
    track: null,
    devices: [],
    activeDeviceId: "",
    detector: null,
    isCameraRunning: false,
    isScanning: false,
    torchOn: false,
    scanTimer: 0,
    authCookie: "",
    authStatus: "",
    history: [],
    selectedHistoryIndex: -1
  };

  function queryElements() {
    return {
      barcodeInput: document.getElementById("barcodeInput"),
      cameraBadge: document.getElementById("cameraBadge"),
      cameraPreview: document.getElementById("cameraPreview"),
      cameraSelect: document.getElementById("cameraSelect"),
      clearAllBtn: document.getElementById("clearAllBtn"),
      clearBarcodeBtn: document.getElementById("clearBarcodeBtn"),
      clearSelectedBtn: document.getElementById("clearSelectedBtn"),
      captureCanvas: document.getElementById("captureCanvas"),
      closeSettingsBtn: document.getElementById("closeSettingsBtn"),
      historyEmpty: document.getElementById("historyEmpty"),
      historyList: document.getElementById("historyList"),
      loginInput: document.getElementById("loginInput"),
      loginSettingsBtn: document.getElementById("loginSettingsBtn"),
      passwordInput: document.getElementById("passwordInput"),
      previewFrame: document.getElementById("previewFrame"),
      previewPlaceholder: document.getElementById("previewPlaceholder"),
      refreshCookieBtn: document.getElementById("refreshCookieBtn"),
      resolutionBadge: document.getElementById("resolutionBadge"),
      saveSettingsBtn: document.getElementById("saveSettingsBtn"),
      scanBtn: document.getElementById("scanBtn"),
      settingsBtn: document.getElementById("settingsBtn"),
      settingsDialog: document.getElementById("settingsDialog"),
      settingsSaveNote: document.getElementById("settingsSaveNote"),
      shopKeyInput: document.getElementById("shopKeyInput"),
      statusText: document.getElementById("statusText"),
      torchBtn: document.getElementById("torchBtn")
    };
  }

  function requireElements(els) {
    const missing = Object.entries(els).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`Missing DOM elements: ${missing.join(", ")}`);
    }
  }

  function setStatus(message) {
    state.els.statusText.textContent = message;
  }

  function readSavedSettings() {
    try {
      const raw = localStorage.getItem(CONFIG.settingsStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        shopKey: parsed?.shopKey || "",
        login: parsed?.login || "",
        password: parsed?.password || ""
      };
    } catch {
      return { shopKey: "", login: "", password: "" };
    }
  }

  function saveSettings(values) {
    localStorage.setItem(CONFIG.settingsStorageKey, JSON.stringify(values));
    state.els.settingsSaveNote.textContent = "Saved successfully on this device.";
    setStatus("Settings saved");
  }

  function fillSettingsForm(values) {
    state.els.shopKeyInput.value = values.shopKey || "";
    state.els.loginInput.value = values.login || "";
    state.els.passwordInput.value = values.password || "";
  }

  function openSettingsDialog() {
    fillSettingsForm(readSavedSettings());
    state.els.settingsSaveNote.textContent = "";
    state.els.settingsDialog.classList.add("is-open");
    state.els.settingsDialog.setAttribute("aria-hidden", "false");
  }

  function closeSettingsDialog() {
    state.els.settingsDialog.classList.remove("is-open");
    state.els.settingsDialog.setAttribute("aria-hidden", "true");
  }

  function renderCookieState() {
    // Cookie state is kept in storage and surfaced through the top status text only.
  }

  function loadCookieState() {
    state.authCookie = localStorage.getItem(CONFIG.cookieStorageKey) || "";
    state.authStatus = localStorage.getItem(CONFIG.cookieStatusStorageKey) || "No cookie saved yet.";
  }

  function saveCookieState(cookie, status) {
    state.authCookie = cookie || "";
    state.authStatus = status || "";
    localStorage.setItem(CONFIG.cookieStorageKey, state.authCookie);
    localStorage.setItem(CONFIG.cookieStatusStorageKey, state.authStatus);
    renderCookieState();
  }

  function renderHistory() {
    state.els.historyList.innerHTML = "";
    if (state.history.length === 0) {
      state.selectedHistoryIndex = -1;
      state.els.clearSelectedBtn.disabled = true;
      state.els.historyList.appendChild(state.els.historyEmpty);
      return;
    }

    for (let index = 0; index < state.history.length; index += 1) {
      const item = state.history[index];
      const article = document.createElement("article");
      article.className = "history-item";
      if (index === state.selectedHistoryIndex) {
        article.classList.add("is-selected");
      }
      article.textContent = item;
      article.dataset.index = String(index);
      article.setAttribute("tabindex", "0");
      article.setAttribute("role", "button");
      state.els.historyList.appendChild(article);
    }

    state.els.clearSelectedBtn.disabled = state.selectedHistoryIndex < 0;
  }

  function addHistoryItem(barcode) {
    const value = String(barcode || "").trim();
    if (!value) return;
    state.history.unshift(value);
    if (state.history.length > 12) {
      state.history.length = 12;
    }
    state.selectedHistoryIndex = 0;
    renderHistory();
  }

  async function fetchProductInfoThroughProxy(code, cookie) {
    const response = await fetch(CONFIG.infoProxyEndpoint, {
      method: "POST",
      body: JSON.stringify({
        barcode: code,
        cookie: cookie
      }),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Info proxy request failed with status ${response.status}`);
    }

    return response.text();
  }

  function selectHistoryItem(index) {
    if (index < 0 || index >= state.history.length) return;
    state.selectedHistoryIndex = index;
    renderHistory();
  }

  function clearSelectedHistory() {
    if (state.selectedHistoryIndex < 0 || !state.history[state.selectedHistoryIndex]) return;
    state.history.splice(state.selectedHistoryIndex, 1);
    if (state.history.length === 0) {
      state.selectedHistoryIndex = -1;
    } else if (state.selectedHistoryIndex >= state.history.length) {
      state.selectedHistoryIndex = state.history.length - 1;
    }
    renderHistory();
    setStatus("Selected barcode removed");
  }

  function clearAllHistory() {
    state.history = [];
    state.selectedHistoryIndex = -1;
    renderHistory();
    setStatus("Barcode list cleared");
  }

  function extractCookieFromResponse(payload) {
    if (!payload) return "";

    let rawCookie = "";

    if (typeof payload === "object" && payload !== null) {
      rawCookie =
        payload.fullCookie ||
        payload.data?.fullCookie ||
        payload.cookieString ||
        payload.data?.cookieString ||
        payload.cookie ||
        payload.data?.cookie ||
        "";

      if (!rawCookie) {
        const queue = [payload];
        while (queue.length > 0 && !rawCookie) {
          const item = queue.shift();
          if (!item || typeof item !== "object") {
            continue;
          }

          const values = Object.values(item);
          for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            if (typeof value === "string" && /SESSION=|rememberMe=/i.test(value)) {
              rawCookie = value;
              break;
            }
            if (value && typeof value === "object") {
              queue.push(value);
            }
          }
        }
      }
    } else {
      rawCookie = String(payload);
    }

    if (!rawCookie) return "";

    const sessionMatch = rawCookie.match(/SESSION=([^;,\r\n]+)/i);
    const rememberMatches = [...rawCookie.matchAll(/rememberMe=([^;,\r\n]+)/gi)];
    let rememberValue = "";

    for (let index = 0; index < rememberMatches.length; index += 1) {
      const candidate = rememberMatches[index]?.[1] || "";
      if (candidate && candidate !== "deleteMe") {
        rememberValue = candidate;
      }
    }

    const cookieParts = [];
    if (sessionMatch?.[1]) {
      cookieParts.push(`SESSION=${sessionMatch[1]}`);
    }
    if (rememberValue) {
      cookieParts.push(`rememberMe=${rememberValue}`);
    }

    return cookieParts.join("; ");
  }

  async function loginAndRefreshCookie(settingsOverride) {
    const settings = settingsOverride || readSavedSettings();
    const shopKey = (settings.shopKey || "").trim();
    const login = (settings.login || "").trim();
    const password = settings.password || "";
    const targetSite = "lgerp.cc";

    if (!shopKey || !login || !password) {
      const message = "Fill shop key, login, and password first.";
      state.els.settingsSaveNote.textContent = message;
      saveCookieState(state.authCookie, message);
      setStatus(message);
      return "";
    }

    const params = new URLSearchParams();
    params.set("shopkey", shopKey);
    params.set("login_name", login);
    params.set("password", password);

    state.els.settingsSaveNote.textContent = `Sending login request for ${login} on ${targetSite}...`;
    saveCookieState(state.authCookie, `Refreshing cookie for ${login} on ${targetSite}...`);
    setStatus("Requesting new cookie...");

    const response = await fetch(CONFIG.cookieProxyEndpoint, {
      method: "POST",
      body: params.toString(),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    if (!response.ok) {
      throw new Error(`Proxy request failed with status ${response.status}`);
    }

    const responseText = await response.text();
    let parsed = responseText;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Keep plain text fallback.
    }

    const cookie = extractCookieFromResponse(parsed);
    if (!cookie) {
      throw new Error("Proxy answered, but no usable cookie was returned.");
    }

    saveCookieState(cookie, `Cookie refreshed successfully for ${login} on ${targetSite}.`);
    state.els.settingsSaveNote.textContent = "Login completed and cookie saved.";
    setStatus("Cookie refreshed");
    return cookie;
  }

  function clearResultFields() {
    for (let index = 0; index < CONFIG.resultFields.length; index += 1) {
      const key = CONFIG.resultFields[index];
      const element = document.getElementById(`field_${key}`);
      if (element) {
        element.textContent = "";
      }
    }
  }

  function setResultField(key, value) {
    const element = document.getElementById(`field_${key}`);
    if (element) {
      element.textContent = value === undefined || value === null ? "" : String(value);
    }
  }

  function normalizeProductData(rawData) {
    const queue = [rawData?.product || rawData];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || typeof item !== "object") continue;

      if (item.goods_code || item.italian_name || item.real_inventory) {
        return item;
      }

      const values = Object.values(item);
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] && typeof values[index] === "object") {
          queue.push(values[index]);
        }
      }
    }
    return rawData || {};
  }

  function normalizeSaleData(rawData) {
    const saleSource = rawData?.sale;
    if (!saleSource) {
      return null;
    }

    if (Array.isArray(saleSource)) {
      return saleSource.length > 0 ? saleSource[0] : null;
    }

    if (typeof saleSource === "object") {
      const values = Object.values(saleSource);
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (Array.isArray(value) && value.length > 0) {
          return value[0];
        }
      }
      return Object.keys(saleSource).length > 0 ? saleSource : null;
    }

    return null;
  }

  function numberFromValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function formatPercent(value) {
    const numeric = numberFromValue(value);
    if (!numeric) return "";
    const percent = numeric <= 1 ? numeric * 100 : numeric;
    return `${percent.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
  }

  function formatPrice(value) {
    const numeric = numberFromValue(value);
    if (!numeric) return "";
    return numeric.toFixed(2).replace(/\.00$/, "");
  }

  function getDiscountFields(rawData, productData) {
    const saleData = normalizeSaleData(rawData);

    if (saleData && (saleData.discountPrice !== undefined || saleData.sdiscount !== undefined)) {
      return {
        discountPrice: formatPrice(saleData.discountPrice),
        discountPercent: formatPercent(saleData.sdiscount)
      };
    }

const sPrice = numberFromValue(productData.s_price);
const sDiscount = numberFromValue(productData.s_discount || 100) / 100;
const sDiscount2 = numberFromValue(productData.s_discount2 || 100) / 100;
const sDiscount3 = numberFromValue(productData.s_discount3 || 100) / 100;
const sDiscount4 = numberFromValue(productData.s_discount4 || 100) / 100;
const totalDiscount = sDiscount * sDiscount2 * sDiscount3 * sDiscount4;

return {
  discountPrice: formatPrice(sPrice * totalDiscount),
  discountPercent: formatPercent(totalDiscount)
};

  }

  function renderProductData(data) {
    const normalized = normalizeProductData(data);
    for (let index = 0; index < CONFIG.resultFields.length; index += 1) {
      const key = CONFIG.resultFields[index];
      setResultField(key, normalized[key]);
    }

    const discountFields = getDiscountFields(data, normalized);
    setResultField("discount_price", discountFields.discountPrice);
    setResultField("discount_percent", discountFields.discountPercent);
  }

  async function fetchProductInfo(barcode) {
    const code = String(barcode || "").trim();
    if (!code) {
      setStatus("Type or scan a barcode first");
      return;
    }

    state.els.barcodeInput.value = code;
    clearResultFields();

    let cookie = state.authCookie;
    if (!cookie) {
      cookie = await loginAndRefreshCookie();
    }

    addHistoryItem(code);
    saveCookieState(cookie, `Requesting info for ${code} through ${CONFIG.infoProxyEndpoint}...`);
    setStatus("Requesting product info...");

    const responseText = await fetchProductInfoThroughProxy(code, cookie);

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error("Info response was not valid JSON.");
    }

    renderProductData(parsed);
    saveCookieState(cookie, `Info loaded successfully for barcode ${code}.`);
    setStatus("Product info loaded");
  }

  function supportsBarcodeDetector() {
    return "BarcodeDetector" in window;
  }

  async function createDetector() {
    if (!supportsBarcodeDetector()) return null;
    if (state.detector) return state.detector;

    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats || formats.length === 0) return null;
      state.detector = new window.BarcodeDetector({ formats: formats.filter(Boolean) });
      return state.detector;
    } catch {
      return null;
    }
  }

  function getCameraSupportIssue() {
    if (!window.isSecureContext) {
      return 'Camera access needs a secure page, like "https://" or "http://localhost".';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return "This browser does not support camera access.";
    }
    return "";
  }

  function setPreviewActive(active) {
    state.els.previewPlaceholder.hidden = active;
    state.els.cameraBadge.textContent = active ? "Live preview" : "Preview off";
  }

  function updateScanButton() {
    if (!state.isCameraRunning) {
      state.els.scanBtn.textContent = "Start Scanning";
      state.els.scanBtn.dataset.mode = "start";
      return;
    }
    if (state.isScanning) {
      state.els.scanBtn.textContent = "Stop Scanning";
      state.els.scanBtn.dataset.mode = "stop";
      return;
    }
    state.els.scanBtn.textContent = "Start Scanning";
    state.els.scanBtn.dataset.mode = "start";
  }

  function updateModePill() {
    state.els.previewFrame.classList.toggle("is-scanning", state.isScanning);
  }

  function cleanupScanTimer() {
    if (state.scanTimer) {
      window.clearInterval(state.scanTimer);
      state.scanTimer = 0;
    }
  }

  function stopTracks() {
    if (!state.stream) return;
    const tracks = state.stream.getTracks();
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].stop();
    }
    state.stream = null;
    state.track = null;
  }

  function updateResolutionBadge() {
    if (!state.track) {
      state.els.resolutionBadge.textContent = "0 x 0";
      return;
    }

    const settings = state.track.getSettings ? state.track.getSettings() : {};
    const width = settings.width || state.els.cameraPreview.videoWidth || 0;
    const height = settings.height || state.els.cameraPreview.videoHeight || 0;
    state.els.resolutionBadge.textContent = `${width} x ${height}`;
  }

  function buildDeviceLabel(device, index) {
    return device.label || `Camera ${index + 1}`;
  }

  function chooseBestDefaultDevice(devices) {
    if (!devices || devices.length === 0) return "";
    const rear = devices.find((device) => /back|rear|environment/i.test(device.label));
    return (rear || devices[0]).deviceId;
  }

  async function refreshDevices(preferredDeviceId) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.devices = devices.filter((device) => device.kind === "videoinput");
    const currentId = preferredDeviceId || state.activeDeviceId || chooseBestDefaultDevice(state.devices);
    state.activeDeviceId = currentId;
    state.els.cameraSelect.innerHTML = "";

    for (let index = 0; index < state.devices.length; index += 1) {
      const device = state.devices[index];
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = buildDeviceLabel(device, index);
      option.selected = device.deviceId === currentId;
      state.els.cameraSelect.appendChild(option);
    }

    state.els.cameraSelect.disabled = state.devices.length === 0;
  }

  async function applyTrackEnhancements(track) {
    if (!track?.getCapabilities || !track.applyConstraints) return;

    const capabilities = track.getCapabilities();
    const advanced = [];

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    }

    if (capabilities.zoom && typeof capabilities.zoom.max === "number") {
      const minZoom = typeof capabilities.zoom.min === "number" ? capabilities.zoom.min : 1;
      const desiredZoom = Math.min(capabilities.zoom.max, Math.max(minZoom, 1.2));
      advanced.push({ zoom: desiredZoom });
    }

    if (advanced.length === 0) return;

    try {
      await track.applyConstraints({ advanced: advanced });
    } catch {
      // Device-specific support.
    }
  }

  function updateTorchUi(supported, enabled) {
    state.els.torchBtn.disabled = !supported || !state.isCameraRunning;
    state.els.torchBtn.textContent = enabled ? "Torch On" : "Torch Off";
  }

  async function syncTorchSupport() {
    if (!state.track?.getCapabilities) {
      updateTorchUi(false, false);
      return;
    }

    const capabilities = state.track.getCapabilities();
    const supported = !!capabilities.torch;
    if (!supported) {
      state.torchOn = false;
    }
    updateTorchUi(supported, state.torchOn);
  }

  async function toggleTorch() {
    if (!state.track?.applyConstraints || !state.track.getCapabilities) return;

    const capabilities = state.track.getCapabilities();
    if (!capabilities.torch) {
      updateTorchUi(false, false);
      setStatus("Torch is not supported on this camera");
      return;
    }

    state.torchOn = !state.torchOn;
    try {
      await state.track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
      updateTorchUi(true, state.torchOn);
      setStatus(state.torchOn ? "Torch enabled" : "Torch disabled");
    } catch {
      state.torchOn = false;
      updateTorchUi(true, false);
      setStatus("Torch control failed on this device");
    }
  }

  async function startCamera(deviceId) {
    const supportIssue = getCameraSupportIssue();
    if (supportIssue) throw new Error(supportIssue);

    cleanupScanTimer();
    stopTracks();

    const constraints = {
      audio: false,
      video: {
        width: { ideal: CONFIG.videoConstraints.video.width.ideal, max: CONFIG.videoConstraints.video.width.max },
        height: { ideal: CONFIG.videoConstraints.video.height.ideal, max: CONFIG.videoConstraints.video.height.max },
        aspectRatio: { ideal: CONFIG.videoConstraints.video.aspectRatio.ideal },
        frameRate: { ideal: CONFIG.videoConstraints.video.frameRate.ideal, max: CONFIG.videoConstraints.video.frameRate.max },
        resizeMode: CONFIG.videoConstraints.video.resizeMode
      }
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else {
      constraints.video.facingMode = { ideal: CONFIG.videoConstraints.video.facingMode.ideal };
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
    state.stream = stream;
    state.track = track;
    state.activeDeviceId = track?.getSettings?.().deviceId || deviceId || state.activeDeviceId;
    state.els.cameraPreview.srcObject = stream;

    await state.els.cameraPreview.play();
    await applyTrackEnhancements(track);
    await refreshDevices(state.activeDeviceId);
    await syncTorchSupport();

    state.isCameraRunning = true;
    setPreviewActive(true);
    updateResolutionBadge();
    updateScanButton();
    updateModePill();
    setStatus("Camera ready");
  }

  function getSquareCropSize(video) {
    const width = video.videoWidth || CONFIG.preferredSquareSize;
    const height = video.videoHeight || CONFIG.preferredSquareSize;
    return Math.max(1, Math.min(width, height));
  }

  function drawSquareFrame() {
    const video = state.els.cameraPreview;
    const canvas = state.els.captureCanvas;
    const context = canvas.getContext("2d", { alpha: false });
    const squareSize = getSquareCropSize(video);
    const sx = Math.max(0, Math.floor((video.videoWidth - squareSize) / 2));
    const sy = Math.max(0, Math.floor((video.videoHeight - squareSize) / 2));

    canvas.width = 720;
    canvas.height = 720;
    context.drawImage(video, sx, sy, squareSize, squareSize, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function readBarcodeFromCanvas(canvas) {
    const detector = await createDetector();
    if (!detector) return [];
    try {
      return await detector.detect(canvas);
    } catch {
      return [];
    }
  }

  async function captureAttempt() {
    if (!state.isCameraRunning || !state.track) return false;

    const canvas = drawSquareFrame();
    const detections = await readBarcodeFromCanvas(canvas);
    const detectedText = detections[0]?.rawValue || "";
    if (!detectedText) {
      setStatus("Scanning... point the barcode inside the square");
      return false;
    }

    state.els.barcodeInput.value = detectedText;
    stopScanning(true);

    try {
      await fetchProductInfo(detectedText);
      return true;
    } catch (error) {
      setStatus(error.message || "Barcode was captured, but info request failed");
      return true;
    }
  }

  async function startScanning() {
    if (!state.isCameraRunning) {
      await startCamera(state.activeDeviceId);
    }

    if (state.isScanning) return;

    state.isScanning = true;
    updateScanButton();
    updateModePill();
    setStatus("Scanning started");

    if (await captureAttempt()) {
      return;
    }

    cleanupScanTimer();
    state.scanTimer = window.setInterval(async () => {
      try {
        const detected = await captureAttempt();
        if (detected) cleanupScanTimer();
      } catch {
        setStatus("Scanning had a temporary read error");
      }
    }, CONFIG.scanIntervalMs);
  }

  function stopScanning(keepStatusMessage) {
    cleanupScanTimer();
    state.isScanning = false;
    updateScanButton();
    updateModePill();
    if (!keepStatusMessage) {
      setStatus(state.isCameraRunning ? "Scanning stopped, preview still live" : "Camera stopped");
    }
  }

  async function handleMainButton() {
    if (!state.isCameraRunning) {
      await startCamera(state.activeDeviceId);
    }

    if (state.isScanning) {
      stopScanning();
      return;
    }

    await startScanning();
  }

  async function handleSelectChange() {
    const selectedId = state.els.cameraSelect.value;
    if (!selectedId || selectedId === state.activeDeviceId) return;

    const shouldResumeScanning = state.isScanning;
    stopScanning(true);
    await startCamera(selectedId);
    if (shouldResumeScanning) {
      await startScanning();
    }
  }

  function bindEvents() {
    state.els.scanBtn.addEventListener("click", async function () {
      state.els.scanBtn.disabled = true;
      try {
        await handleMainButton();
      } catch (error) {
        setStatus(error.message || "Could not start the camera");
      } finally {
        state.els.scanBtn.disabled = false;
      }
    });

    state.els.clearBarcodeBtn.addEventListener("click", function () {
      state.els.barcodeInput.value = "";
      setStatus("Barcode field cleared");
    });

    state.els.clearSelectedBtn.addEventListener("click", clearSelectedHistory);
    state.els.clearAllBtn.addEventListener("click", clearAllHistory);

    state.els.historyList.addEventListener("click", function (event) {
      const record = event.target.closest(".history-item");
      if (!record) return;
      const index = Number(record.dataset.index);
      if (!Number.isNaN(index)) {
        selectHistoryItem(index);
      }
    });

    state.els.historyList.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const record = event.target.closest(".history-item");
      if (!record) return;
      event.preventDefault();
      const index = Number(record.dataset.index);
      if (!Number.isNaN(index)) {
        selectHistoryItem(index);
      }
    });

    state.els.barcodeInput.addEventListener("keydown", async function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      try {
        await fetchProductInfo(state.els.barcodeInput.value);
      } catch (error) {
        setStatus(error.message || "Could not load product info");
      }
    });

    state.els.cameraSelect.addEventListener("change", async function () {
      state.els.cameraSelect.disabled = true;
      try {
        await handleSelectChange();
      } catch (error) {
        setStatus(error.message || "Could not change camera");
      } finally {
        state.els.cameraSelect.disabled = state.devices.length === 0;
      }
    });

    state.els.torchBtn.addEventListener("click", async function () {
      state.els.torchBtn.disabled = true;
      try {
        await toggleTorch();
      } finally {
        await syncTorchSupport();
      }
    });

    state.els.settingsBtn.addEventListener("click", openSettingsDialog);
    state.els.closeSettingsBtn.addEventListener("click", closeSettingsDialog);

    state.els.saveSettingsBtn.addEventListener("click", function () {
      saveSettings({
        shopKey: state.els.shopKeyInput.value.trim(),
        login: state.els.loginInput.value.trim(),
        password: state.els.passwordInput.value
      });
    });

    state.els.loginSettingsBtn.addEventListener("click", async function () {
      const values = {
        shopKey: state.els.shopKeyInput.value.trim(),
        login: state.els.loginInput.value.trim(),
        password: state.els.passwordInput.value
      };

      saveSettings(values);
      try {
        await loginAndRefreshCookie(values);
      } catch (error) {
        const message = error.message || "Login request failed.";
        saveCookieState("", `Login failed: ${message}`);
        state.els.settingsSaveNote.textContent = message;
        setStatus("Login failed");
      }
    });

    state.els.refreshCookieBtn.addEventListener("click", async function () {
      state.els.refreshCookieBtn.disabled = true;
      try {
        await loginAndRefreshCookie();
      } catch (error) {
        const message = error.message || "Cookie refresh failed.";
        saveCookieState("", `Cookie refresh failed: ${message}`);
        setStatus("Cookie refresh failed");
      } finally {
        state.els.refreshCookieBtn.disabled = false;
      }
    });

    state.els.settingsDialog.addEventListener("click", function (event) {
      if (event.target === state.els.settingsDialog) {
        closeSettingsDialog();
      }
    });

    window.addEventListener("beforeunload", function () {
      stopScanning(true);
      stopTracks();
    });

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", function () {
        refreshDevices(state.activeDeviceId).catch(() => {
          // Ignore transient device change errors.
        });
      });
    }
  }

  async function init() {
    state.els = queryElements();
    requireElements(state.els);

    loadCookieState();
    fillSettingsForm(readSavedSettings());
    clearResultFields();
    renderHistory();
    bindEvents();

    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      setStatus(supportIssue);
      state.els.scanBtn.disabled = true;
      state.els.cameraSelect.disabled = true;
      state.els.torchBtn.disabled = true;
      return;
    }

    try {
      await refreshDevices();
      await startCamera(state.activeDeviceId);
    } catch (error) {
      setStatus(error.message || "Camera preview could not start automatically");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init().catch((error) => {
        if (state.els?.statusText) {
          setStatus(error.message || "The app could not start");
        }
      });
    });
  } else {
    init().catch((error) => {
      if (state.els?.statusText) {
        setStatus(error.message || "The app could not start");
      }
    });
  }
}());
