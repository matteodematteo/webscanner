"use strict";

(function bootstrapWebBarcodeScanner() {
  const CONFIG = {
    cookieProxyEndpoint: "https://lgkiller.mattoteo96.workers.dev/",
    infoEndpoint: "https://lgerp.cc/goods/ongoodsCode",
    infoProxyEndpoint: "https://lgkillergetinfo.mattoteo96.workers.dev/",
    discountProxyEndpoint: "https://lgkillerdiscountinfo.mattoteo96.workers.dev/",
    updateProxyEndpoint: "https://lgkillerupdate.mattoteo96.workers.dev/",
    addProductProxyEndpoint: "https://lgkilleraddproduct.mattoteo96.workers.dev/",
    sendTxtEndpoint: "https://withered-base-e090.mattoteo96.workers.dev/",
    settingsStorageKey: "web_barcode_scanner_settings",
    cookieStorageKey: "web_barcode_scanner_cookie",
    cookieStatusStorageKey: "web_barcode_scanner_cookie_status",
    historyStorageKey: "web_barcode_scanner_history",
    cameraStorageKey: "web_barcode_scanner_camera",
    scanIntervalMs: 1200,
    iosDetectionConfirmations: 1,
    iosDetectionResetMs: 1400,
    previewWatchIntervalMs: 3500,
    previewStallThreshold: 2,
    preferredSquareSize: 2160,
    mobilePreferredSquareSize: 960,
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
    },
    mobileVideoConstraints: {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1440, max: 2160 },
        height: { ideal: 1440, max: 2160 },
        aspectRatio: { ideal: 1 },
        frameRate: { ideal: 24, max: 30 },
        resizeMode: "crop-and-scale"
      }
    },
    iosVideoConstraints: {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 960, max: 1280 },
        height: { ideal: 960, max: 1280 },
        aspectRatio: { ideal: 1 },
        frameRate: { ideal: 18, max: 24 },
        resizeMode: "crop-and-scale"
      }
    },
    androidVideoConstraints: {
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
    scanner: null,
    scannerEngine: "",
    isCameraRunning: false,
    isScanning: false,
    torchOn: false,
    scanTimer: 0,
    authCookie: "",
    authStatus: "",
    history: [],
    selectedHistoryIndex: -1,
    pendingConfirmAction: null,
    currentProductRecord: null,
    editingHistoryId: "",
    fieldEls: {},
    lastStatusMessage: "",
    isMobileUi: false,
    isScanLoopScheduled: false,
    isScanInFlight: false,
    audioContext: null,
    toastTimer: 0,
    previewWatchdogTimer: 0,
    lastPreviewTime: 0,
    stalledPreviewChecks: 0,
    isRecoveringPreview: false,
    lookupSequence: 0,
    isCompactMode: false,
    pendingDetectedCode: "",
    pendingDetectedCount: 0,
    pendingDetectedAt: 0
  };

  function queryElements() {
    return {
      barcodeInput: document.getElementById("barcodeInput"),
      cameraBadge: document.getElementById("cameraBadge"),
      cameraPreview: document.getElementById("cameraPreview"),
      cameraPreviewQuagga: document.getElementById("cameraPreviewQuagga"),
      cameraSelect: document.getElementById("cameraSelect"),
      clearAllBtn: document.getElementById("clearAllBtn"),
      clearBarcodeBtn: document.getElementById("clearBarcodeBtn"),
      clearSelectedBtn: document.getElementById("clearSelectedBtn"),
      confirmDialog: document.getElementById("confirmDialog"),
      confirmDialogCancelBtn: document.getElementById("confirmDialogCancelBtn"),
      confirmDialogOkBtn: document.getElementById("confirmDialogOkBtn"),
      confirmDialogText: document.getElementById("confirmDialogText"),
      captureCanvas: document.getElementById("captureCanvas"),
      closeSettingsBtn: document.getElementById("closeSettingsBtn"),
      compactToggleBtn: document.getElementById("compactToggleBtn"),
      historyEmpty: document.getElementById("historyEmpty"),
      historyEditBackBtn: document.getElementById("historyEditBackBtn"),
      historyEditBarcodeInput: document.getElementById("historyEditBarcodeInput"),
      historyEditDialog: document.getElementById("historyEditDialog"),
      historyEditDiscountPriceInput: document.getElementById("historyEditDiscountPriceInput"),
      historyEditIdInput: document.getElementById("historyEditIdInput"),
      historyEditItalianNameInput: document.getElementById("historyEditItalianNameInput"),
      historyEditPPriceInput: document.getElementById("historyEditPPriceInput"),
      historyEditQtyInput: document.getElementById("historyEditQtyInput"),
      historyEditSaveBtn: document.getElementById("historyEditSaveBtn"),
      historyEditSaveNote: document.getElementById("historyEditSaveNote"),
      historyEditSDiscountInput: document.getElementById("historyEditSDiscountInput"),
      historyEditSPriceInput: document.getElementById("historyEditSPriceInput"),
      historyList: document.getElementById("historyList"),
      loginInput: document.getElementById("loginInput"),
      loginSettingsBtn: document.getElementById("loginSettingsBtn"),
      passwordInput: document.getElementById("passwordInput"),
      printBackBtn: document.getElementById("printBackBtn"),
      printBigBtn: document.getElementById("printBigBtn"),
      printBtn: document.getElementById("printBtn"),
      printDialog: document.getElementById("printDialog"),
      printStickerBtn: document.getElementById("printStickerBtn"),
      previewFrame: document.getElementById("previewFrame"),
      previewPlaceholder: document.getElementById("previewPlaceholder"),
      refreshCookieBtn: document.getElementById("refreshCookieBtn"),
      resolutionBadge: document.getElementById("resolutionBadge"),
      scanBtn: document.getElementById("scanBtn"),
      sendTxtBtn: document.getElementById("sendTxtBtn"),
      settingsBtn: document.getElementById("settingsBtn"),
      settingsDialog: document.getElementById("settingsDialog"),
      settingsSaveNote: document.getElementById("settingsSaveNote"),
      shopKeyInput: document.getElementById("shopKeyInput"),
      statusText: document.getElementById("statusText"),
      toast: document.getElementById("toast"),
      torchBtn: document.getElementById("torchBtn")
    };
  }

  function requireElements(els) {
    const missing = Object.entries(els).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`Missing DOM elements: ${missing.join(", ")}`);
    }
  }

  function detectMobileUi() {
    const width = window.innerWidth || screen.width || 0;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || width <= 768;
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function usesNativeAndroidScanner() {
    return !isIOSDevice();
  }

  function getActiveVideoConfig() {
    if (isIOSDevice()) {
      return CONFIG.iosVideoConstraints;
    }
    if (isAndroidDevice()) {
      return CONFIG.androidVideoConstraints;
    }
    return state.isMobileUi ? CONFIG.mobileVideoConstraints : CONFIG.videoConstraints;
  }

  function isIOSDevice() {
    const userAgent = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (/Mac/i.test(userAgent) && "ontouchend" in document);
  }

  function setActivePreviewEngine(engine) {
    const useQuaggaPreview = engine === "quagga";
    if (state.els?.cameraPreview) {
      state.els.cameraPreview.hidden = useQuaggaPreview;
      state.els.cameraPreview.style.display = useQuaggaPreview ? "none" : "block";
    }
    if (state.els?.cameraPreviewQuagga) {
      state.els.cameraPreviewQuagga.hidden = !useQuaggaPreview;
      state.els.cameraPreviewQuagga.style.display = useQuaggaPreview ? "block" : "none";
    }
  }

  function getPreviewVideoElement() {
    if (!state.els) {
      return null;
    }

    if (state.scannerEngine === "quagga") {
      return state.els.cameraPreviewQuagga?.querySelector("video") || null;
    }

    if (state.els.cameraPreview instanceof HTMLVideoElement) {
      return state.els.cameraPreview;
    }

    return state.els.cameraPreview?.querySelector("video") || null;
  }

  function getActiveStreamTrackFromPreview() {
    const video = getPreviewVideoElement();
    const stream = video?.srcObject;
    if (!stream?.getVideoTracks) {
      return null;
    }
    return stream.getVideoTracks()[0] || null;
  }

  async function waitForActiveTrack(timeoutMs) {
    const timeout = typeof timeoutMs === "number" ? timeoutMs : 1800;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const track = getActiveStreamTrackFromPreview();
      if (track) {
        return track;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }

    return getActiveStreamTrackFromPreview();
  }

  function getPreferredReaders() {
    return [
      "ean_reader",
      "ean_8_reader",
      "upc_reader",
      "upc_e_reader",
      "code_128_reader",
      "code_39_reader",
      "codabar_reader",
      "i2of5_reader"
    ];
  }

  function getQuaggaScanArea() {
    return {
      top: "12%",
      right: "12%",
      bottom: "12%",
      left: "12%"
    };
  }

  function configurePreviewVideoElement(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
  }

  function isTextEntryElement(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    return Boolean(target.closest("input, textarea, select"));
  }

  function pauseScanningForInteraction(options) {
    if (!state.isScanning) {
      return;
    }

    stopScanning(true);
    if (!options?.silentStatus) {
      setStatus("Scanner paused while editing");
    }
  }

  function sanitizeDetectedCode(detectedText) {
    return String(detectedText || "").replace(/\s+/g, "").trim();
  }

  function resetPendingDetection() {
    state.pendingDetectedCode = "";
    state.pendingDetectedCount = 0;
    state.pendingDetectedAt = 0;
  }

  function needsIOSDetectionConfirmation(source) {
    return source === "quagga" && isIOSDevice();
  }

  function shouldAcceptDetectedCode(code, source) {
    if (!needsIOSDetectionConfirmation(source)) {
      return true;
    }

    const now = Date.now();
    const isFreshRepeat =
      state.pendingDetectedCode === code &&
      now - state.pendingDetectedAt <= CONFIG.iosDetectionResetMs;

    if (isFreshRepeat) {
      state.pendingDetectedCount += 1;
    } else {
      state.pendingDetectedCode = code;
      state.pendingDetectedCount = 1;
    }

    state.pendingDetectedAt = now;

    if (state.pendingDetectedCount >= CONFIG.iosDetectionConfirmations) {
      resetPendingDetection();
      return true;
    }

    setStatus("Barcode detected. Hold steady for a cleaner read...");
    return false;
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

  function getZxingHints() {
    const ZXing = window.ZXing || window.ZXingBrowser?.ZXing;
    if (!ZXing?.Map || !ZXing?.DecodeHintType || !ZXing?.BarcodeFormat) {
      return undefined;
    }

    const hints = new ZXing.Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.CODABAR
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    return hints;
  }

  function cacheResultFieldElements() {
    state.fieldEls = {};
    for (let index = 0; index < CONFIG.resultFields.length; index += 1) {
      const key = CONFIG.resultFields[index];
      state.fieldEls[key] = document.getElementById(`field_${key}`);
    }
  }

  function setStatus(message) {
    const nextMessage = String(message || "");
    if (state.lastStatusMessage === nextMessage) {
      return;
    }
    state.lastStatusMessage = nextMessage;
    state.els.statusText.textContent = nextMessage;
  }

  function showToast(message) {
    const text = String(message || "").trim();
    if (!text || !state.els.toast) {
      return;
    }

    state.els.toast.textContent = text;
    state.els.toast.classList.add("is-visible");
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(function () {
      state.els.toast.classList.remove("is-visible");
      state.toastTimer = 0;
    }, 2200);
  }

  function playCaptureSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      if (!state.audioContext) {
        state.audioContext = new AudioContextClass();
      }

      const context = state.audioContext;
      if (context.state === "suspended") {
        context.resume().then(function () {
          playCaptureSound();
        }).catch(() => {
          // Ignore resume errors triggered by browser policies.
        });
        return;
      }

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.16);
    } catch {
      // Audio is optional.
    }
  }

  function primeCaptureSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      if (!state.audioContext || state.audioContext.state === "closed") {
        state.audioContext = new AudioContextClass();
      }

      if (state.audioContext.state === "suspended") {
        state.audioContext.resume().catch(() => {
          // Ignore resume errors triggered by browser policies.
        });
      }
    } catch {
      // Audio is optional.
    }
  }

  function readSavedSettings() {
    try {
      const raw = localStorage.getItem(CONFIG.settingsStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        shopKey: parsed?.shopKey || "",
        login: parsed?.login || "",
        password: parsed?.password || "",
        compactMode: Boolean(parsed?.compactMode)
      };
    } catch {
      return { shopKey: "", login: "", password: "", compactMode: false };
    }
  }

  function saveSettings(values, options) {
    const normalizedValues = {
      shopKey: values?.shopKey || "",
      login: values?.login || "",
      password: values?.password || "",
      compactMode: Boolean(values?.compactMode)
    };
    localStorage.setItem(CONFIG.settingsStorageKey, JSON.stringify(normalizedValues));
    if (options?.silent) {
      return;
    }
    state.els.settingsSaveNote.textContent = "Saved successfully on this device.";
    setStatus("Settings saved");
  }

  function fillSettingsForm(values) {
    state.els.shopKeyInput.value = values.shopKey || "";
    state.els.loginInput.value = values.login || "";
    state.els.passwordInput.value = values.password || "";
  }

  function updateCompactToggleButton() {
    if (!state.els.compactToggleBtn) {
      return;
    }
    state.els.compactToggleBtn.textContent = state.isCompactMode ? "+" : "-";
    state.els.compactToggleBtn.setAttribute(
      "aria-label",
      state.isCompactMode ? "Expand app sections" : "Compact app sections"
    );
    state.els.compactToggleBtn.title = state.isCompactMode ? "Show hidden sections" : "Hide optional sections";
  }

  function applyCompactMode(isCompact) {
    state.isCompactMode = Boolean(isCompact);
    document.body.classList.toggle("is-compact", state.isCompactMode);
    updateCompactToggleButton();
  }

  function openSettingsDialog() {
    if (isIOSDevice()) {
      pauseScanningForInteraction({ silentStatus: true });
    }
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

  function readSavedCameraId() {
    return localStorage.getItem(CONFIG.cameraStorageKey) || "";
  }

  function saveCameraId(deviceId) {
    if (!deviceId) return;
    localStorage.setItem(CONFIG.cameraStorageKey, deviceId);
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
    state.els.clearAllBtn.disabled = state.history.length === 0;
    state.els.sendTxtBtn.disabled = state.history.length === 0;
    state.els.printBtn.disabled = state.history.length === 0;
    if (state.history.length === 0) {
      state.selectedHistoryIndex = -1;
      state.els.clearSelectedBtn.disabled = true;
      state.els.historyList.replaceChildren(state.els.historyEmpty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < state.history.length; index += 1) {
      const item = state.history[index];
      const article = document.createElement("article");
      article.className = "history-item";
      if (index === state.selectedHistoryIndex) {
        article.classList.add("is-selected");
      }
      const primary = document.createElement("div");
      primary.className = "history-primary";
      primary.innerHTML = `<span class="history-code">${escapeHtml(item.barcode || "")}</span><span class="history-qty">Qty ${escapeHtml(String(item.comparison_qty || 1))}</span>`;

      const name = document.createElement("div");
      name.className = "history-name";
      name.textContent = item.italian_name || "No name loaded";

      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.innerHTML = `<span>Cost: ${escapeHtml(formatPrice(item.p_price) || "-")}</span><span>Price: ${escapeHtml(getHistoryDisplayPrice(item))}</span>`;

      const footer = document.createElement("div");
      footer.className = "history-footer";
      footer.appendChild(meta);

      const detailButton = document.createElement("button");
      detailButton.className = "btn btn-muted history-detail-btn";
      detailButton.type = "button";
      detailButton.textContent = "Detail";
      detailButton.dataset.action = "detail";
      detailButton.dataset.index = String(index);
      footer.appendChild(detailButton);

      article.appendChild(primary);
      article.appendChild(name);
      article.appendChild(footer);
      article.dataset.index = String(index);
      article.setAttribute("tabindex", "0");
      fragment.appendChild(article);
    }

    state.els.clearSelectedBtn.disabled = state.selectedHistoryIndex < 0;
    state.els.historyList.replaceChildren(fragment);
  }

  function saveHistoryState() {
    localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(state.history));
  }

  function loadHistoryState() {
    try {
      const raw = localStorage.getItem(CONFIG.historyStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      state.history = Array.isArray(parsed)
        ? parsed
            .map(normalizeHistoryItem)
            .filter((item) => item.barcode)
        : [];
    } catch {
      state.history = [];
    }
  }

  function normalizeHistoryItem(item) {
    if (typeof item === "string") {
      return {
        id: `history_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        goods_id: "",
        barcode: item.trim(),
        italian_name: "",
        comparison_qty: 1,
        p_price: "",
        s_price: "",
        s_discount: "",
        discount_price: "",
        has_discount: false
      };
    }

    const barcode = String(item?.barcode || "").trim();
    return {
      id: String(item?.id || `history_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
      goods_id: String(item?.goods_id || item?.id_value || ""),
      barcode: barcode,
      italian_name: String(item?.italian_name || ""),
      comparison_qty: Math.max(1, Number(item?.comparison_qty || 1) || 1),
      p_price: String(item?.p_price || ""),
      s_price: String(item?.s_price || ""),
      s_discount: String(item?.s_discount || ""),
      discount_price: String(item?.discount_price || ""),
      has_discount: Boolean(item?.has_discount)
    };
  }

  function createHistoryEntry(barcode) {
    return normalizeHistoryItem({
      id: `history_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      barcode: barcode
    });
  }

  function addHistoryItem(barcode) {
    const entry = createHistoryEntry(barcode);
    if (!entry.barcode) return null;
    state.history.unshift(entry);
    if (state.history.length > 12) {
      state.history.length = 12;
    }
    state.selectedHistoryIndex = 0;
    saveHistoryState();
    renderHistory();
    return entry.id;
  }

  function updateHistoryItem(entryId, updates) {
    const index = state.history.findIndex((item) => item.id === entryId);
    if (index < 0) return;
    state.history[index] = normalizeHistoryItem({
      ...state.history[index],
      ...updates
    });
    saveHistoryState();
    renderHistory();
  }

  function updateHistoryItemsByBarcode(barcode, updates) {
    const normalizedBarcode = String(barcode || "").trim();
    if (!normalizedBarcode) return;

    let didChange = false;
    state.history = state.history.map(function (item) {
      if (String(item.barcode || "").trim() !== normalizedBarcode) {
        return item;
      }
      const nextItem = normalizeHistoryItem({
        ...item,
        ...updates,
        barcode: normalizedBarcode
      });
      const changed =
        nextItem.goods_id !== item.goods_id ||
        nextItem.barcode !== item.barcode ||
        nextItem.italian_name !== item.italian_name ||
        nextItem.comparison_qty !== item.comparison_qty ||
        nextItem.p_price !== item.p_price ||
        nextItem.s_price !== item.s_price ||
        nextItem.s_discount !== item.s_discount ||
        nextItem.discount_price !== item.discount_price ||
        nextItem.has_discount !== item.has_discount;
      if (changed) {
        didChange = true;
        return nextItem;
      }
      return item;
    });

    if (!didChange) return;
    saveHistoryState();
    renderHistory();
  }

  function buildSharedHistoryFields(item) {
    const normalized = normalizeHistoryItem(item);
    return {
      goods_id: normalized.goods_id,
      barcode: normalized.barcode,
      italian_name: normalized.italian_name,
      p_price: normalized.p_price,
      s_price: normalized.s_price,
      s_discount: normalized.s_discount,
      discount_price: normalized.discount_price,
      has_discount: normalized.has_discount
    };
  }

  function syncHistoryRowsWithRecord(record, fallbackBarcode) {
    const sharedFields = buildSharedHistoryFields(record);
    const barcodes = [
      String(fallbackBarcode || "").trim(),
      String(sharedFields.barcode || "").trim()
    ].filter(Boolean);
    const uniqueBarcodes = [...new Set(barcodes)];

    for (let index = 0; index < uniqueBarcodes.length; index += 1) {
      updateHistoryItemsByBarcode(uniqueBarcodes[index], sharedFields);
    }
  }

  function buildHistoryItemFromLookupData(productPayload, discountPayload, fallbackBarcode, comparisonQty) {
    const normalizedProduct = normalizeProductData(productPayload?.product || productPayload);
    const discountFields = getDiscountFields({
      product: productPayload?.product || productPayload,
      sale: discountPayload
    }, normalizedProduct);
    const sPrice = numberFromValue(normalizedProduct.s_price);
    const discountPrice = numberFromValue(discountFields.discountPrice);
    const hasVisibleDiscount = Boolean(discountPrice) && Boolean(sPrice) && discountPrice < sPrice;

    return normalizeHistoryItem({
      goods_id: String(normalizedProduct.id || ""),
      barcode: String(normalizedProduct.goods_code || fallbackBarcode || "").trim(),
      italian_name: String(normalizedProduct.italian_name || ""),
      p_price: String(normalizedProduct.p_price || ""),
      s_price: String(normalizedProduct.s_price || ""),
      s_discount: String(normalizedProduct.s_discount || ""),
      discount_price: hasVisibleDiscount ? String(discountFields.discountPrice || "") : "",
      has_discount: hasVisibleDiscount,
      comparison_qty: comparisonQty || 1
    });
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

  async function fetchDiscountInfoThroughProxy(code, cookie) {
    const response = await fetch(CONFIG.discountProxyEndpoint, {
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
      throw new Error(`Discount proxy request failed with status ${response.status}`);
    }

    return response.text();
  }

  async function fetchUpdateItemThroughProxy(payload, cookie) {
    const response = await fetch(CONFIG.updateProxyEndpoint, {
      method: "POST",
      body: JSON.stringify({
        id: payload.id,
        italian_name: payload.italian_name,
        p_price: payload.p_price,
        s_price: payload.s_price,
        s_discount: payload.s_discount,
        cookie: cookie
      }),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Update proxy request failed with status ${response.status}`);
    }

    return response.text();
  }

  async function fetchAddProductThroughProxy(payload, cookie) {
    const response = await fetch(CONFIG.addProductProxyEndpoint, {
      method: "POST",
      body: JSON.stringify({
        barcode: payload.barcode,
        italian_name: payload.italian_name,
        p_price: payload.p_price,
        s_price: payload.s_price,
        s_discount: payload.s_discount,
        cookie: cookie
      }),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Add product proxy request failed with status ${response.status}`);
    }

    return response.text();
  }

  async function getCookieForRequests() {
    let cookie = state.authCookie;
    if (!cookie) {
      cookie = await loginAndRefreshCookie();
    }
    return cookie;
  }

  async function loadProductInfoResponse(barcode) {
    const code = String(barcode || "").trim();
    if (!code) {
      throw new Error("Barcode is empty");
    }

    const cookie = await getCookieForRequests();
    const responseText = await fetchProductInfoThroughProxy(code, cookie);

    let parsedProduct;
    try {
      parsedProduct = JSON.parse(responseText);
    } catch {
      throw new Error("Product info response was not valid JSON.");
    }

    return {
      cookie: cookie,
      raw: parsedProduct,
      normalized: normalizeProductData(parsedProduct?.product || parsedProduct)
    };
  }

  async function loadProductAndDiscountResponse(barcode) {
    const code = String(barcode || "").trim();
    if (!code) {
      throw new Error("Barcode is empty");
    }

    const cookie = await getCookieForRequests();
    const [productResponseText, discountResponseText] = await Promise.all([
      fetchProductInfoThroughProxy(code, cookie),
      fetchDiscountInfoThroughProxy(code, cookie)
    ]);

    let parsedProduct;
    let parsedDiscount = null;
    try {
      parsedProduct = JSON.parse(productResponseText);
    } catch {
      throw new Error("Product info response was not valid JSON.");
    }

    try {
      parsedDiscount = discountResponseText ? JSON.parse(discountResponseText) : null;
    } catch {
      parsedDiscount = null;
    }

    const normalizedProduct = normalizeProductData(parsedProduct?.product || parsedProduct);
    const discountFields = getDiscountFields({
      product: parsedProduct?.product || parsedProduct,
      sale: parsedDiscount
    }, normalizedProduct);
    const sPrice = numberFromValue(normalizedProduct.s_price);
    const discountPrice = numberFromValue(discountFields.discountPrice);
    const hasVisibleDiscount = Boolean(discountPrice) && Boolean(sPrice) && discountPrice < sPrice;

    return {
      cookie: cookie,
      product: normalizedProduct,
      sale: parsedDiscount,
      discountPrice: hasVisibleDiscount ? discountFields.discountPrice : "",
      hasDiscount: hasVisibleDiscount
    };
  }

  function hasProductInDatabase(normalizedProduct, barcode) {
    const normalizedBarcode = String(barcode || "").trim();
    if (!normalizedProduct || typeof normalizedProduct !== "object") {
      return false;
    }

    const goodsCode = String(normalizedProduct.goods_code || "").trim();
    const id = String(normalizedProduct.id || "").trim();
    const italianName = String(normalizedProduct.italian_name || "").trim();

    if (goodsCode && normalizedBarcode) {
      return goodsCode === normalizedBarcode;
    }

    return Boolean(id || italianName);
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
    saveHistoryState();
    renderHistory();
    setStatus("Selected barcode removed");
  }

  function clearAllHistory() {
    state.history = [];
    state.selectedHistoryIndex = -1;
    saveHistoryState();
    renderHistory();
    setStatus("Barcode list cleared");
  }

  function openConfirmDialog(message, onConfirm) {
    if (isIOSDevice()) {
      pauseScanningForInteraction({ silentStatus: true });
    }
    state.pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
    state.els.confirmDialogText.textContent = message;
    state.els.confirmDialog.classList.add("is-open");
    state.els.confirmDialog.setAttribute("aria-hidden", "false");
  }

  function closeConfirmDialog() {
    state.pendingConfirmAction = null;
    state.els.confirmDialog.classList.remove("is-open");
    state.els.confirmDialog.setAttribute("aria-hidden", "true");
  }

  function openPrintDialog() {
    if (isIOSDevice()) {
      pauseScanningForInteraction({ silentStatus: true });
    }
    state.els.printDialog.classList.add("is-open");
    state.els.printDialog.setAttribute("aria-hidden", "false");
  }

  function closePrintDialog() {
    state.els.printDialog.classList.remove("is-open");
    state.els.printDialog.setAttribute("aria-hidden", "true");
  }

  function fillHistoryEditForm(item) {
    const entry = normalizeHistoryItem(item);
    state.els.historyEditIdInput.value = entry.goods_id || "";
    state.els.historyEditBarcodeInput.value = entry.barcode || "";
    state.els.historyEditItalianNameInput.value = entry.italian_name || "";
    state.els.historyEditPPriceInput.value = entry.p_price || "";
    state.els.historyEditSPriceInput.value = entry.s_price || "";
    state.els.historyEditSDiscountInput.value = entry.s_discount || "";
    state.els.historyEditQtyInput.value = String(entry.comparison_qty || 1);
    refreshHistoryEditDiscountPrice();
  }

  function openHistoryEditDialog(item) {
    if (isIOSDevice()) {
      pauseScanningForInteraction({ silentStatus: true });
    }
    fillHistoryEditForm(item);
    state.els.historyEditSaveNote.textContent = "";
    state.els.historyEditDialog.classList.add("is-open");
    state.els.historyEditDialog.setAttribute("aria-hidden", "false");
  }

  function closeHistoryEditDialog() {
    state.editingHistoryId = "";
    state.els.historyEditSaveNote.textContent = "";
    state.els.historyEditDialog.classList.remove("is-open");
    state.els.historyEditDialog.setAttribute("aria-hidden", "true");
  }

  function formatTimestamp() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${yy}${MM}${dd}${hh}${mm}${ss}`;
  }

  function formatSessionId() {
    return `session_${formatTimestamp()}`;
  }

  function buildHistoryPayloadItem(item) {
    const entry = normalizeHistoryItem(item);
    const sPrice = numberFromValue(entry.s_price);
    const discountPrice = numberFromValue(entry.discount_price);
    const hasDiscountPrice = entry.has_discount && discountPrice > 0 && (!sPrice || discountPrice < sPrice);
    const selectedPrice = hasDiscountPrice ? discountPrice : sPrice;

    return {
      barcode: entry.barcode,
      italian_name: entry.italian_name || "",
      comparison_qty: entry.comparison_qty || 1,
      s_price: formatPrice(selectedPrice)
    };
  }

  async function sendTxtList() {
    if (state.history.length === 0) {
      setStatus("Barcode list is empty");
      return;
    }

    const payload = {
      session_id: formatSessionId(),
      session_cost: "$0.00",
      data: [
        {
          stack: "full_tickets",
          items: state.history.map(buildHistoryPayloadItem)
        }
      ]
    };

    setStatus("Sending TXT...");
    const response = await fetch(CONFIG.sendTxtEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Send TXT failed with status ${response.status}`);
    }

    state.history = [];
    state.selectedHistoryIndex = -1;
    saveHistoryState();
    renderHistory();
    setStatus("TXT sent successfully");
  }

  async function printHistoryList(printType) {
    if (state.history.length === 0) {
      setStatus("Barcode list is empty");
      return;
    }

    const normalizedType = printType === "40*25" ? "40*25" : "60*38";
    const payload = {
      session_id: `directPrint_${normalizedType}_${formatTimestamp()}`,
      session_cost: "$1.00",
      print_type: normalizedType,
      data: [
        {
          stack: normalizedType === "40*25" ? "sticker_tickets" : "big_tickets",
          items: state.history.map(buildHistoryPayloadItem)
        }
      ]
    };

    setStatus(`Sending print ${normalizedType}...`);
    const response = await fetch(CONFIG.sendTxtEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Print failed with status ${response.status}`);
    }

    state.history = [];
    state.selectedHistoryIndex = -1;
    saveHistoryState();
    renderHistory();
    setStatus(`Print ${normalizedType} sent successfully`);
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
      const element = state.fieldEls[key];
      if (element) {
        element.textContent = "";
      }
    }
    const compactSupplierField = document.getElementById("field_supplier_name_compact");
    if (compactSupplierField) {
      compactSupplierField.textContent = "";
    }
    state.currentProductRecord = null;
    setDiscountVisibility(false);
  }

  function setResultField(key, value) {
    const normalizedValue = value === undefined || value === null ? "" : String(value);
    const element = state.fieldEls[key];
    if (element) {
      element.textContent = normalizedValue;
    }
    if (key === "supplier_name") {
      const compactSupplierField = document.getElementById("field_supplier_name_compact");
      if (compactSupplierField) {
        compactSupplierField.textContent = normalizedValue;
      }
    }
  }

  function setDiscountVisibility(visible) {
    const priceCard = document.getElementById("field_discount_price_card");
    const percentCard = document.getElementById("field_discount_percent_card");
    if (priceCard) {
      priceCard.hidden = !visible;
    }
    if (percentCard) {
      percentCard.hidden = !visible;
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
    const saleSource = rawData?.sale || rawData?.discount;
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

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function sanitizeItalianName(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}\s.,()&-]+/gu, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function getHistoryDisplayPrice(item) {
    const entry = normalizeHistoryItem(item);
    const sPrice = numberFromValue(entry.s_price);
    const discountPrice = numberFromValue(entry.discount_price);
    const showDiscountPrice = entry.has_discount && discountPrice > 0 && (!sPrice || discountPrice < sPrice);
    const value = showDiscountPrice ? discountPrice : sPrice;
    return value ? `EUR ${formatPrice(value)}` : "EUR -";
  }

  function calculateDiscountPrice(sPriceValue, sDiscountValue) {
    const sPrice = numberFromValue(sPriceValue);
    const sDiscount = numberFromValue(sDiscountValue);
    if (!sPrice || !sDiscount) return "";
    return formatPrice(sPrice * (1 - (sDiscount / 100)));
  }

  function refreshHistoryEditDiscountPrice() {
    const discountPrice = calculateDiscountPrice(
      state.els.historyEditSPriceInput.value,
      state.els.historyEditSDiscountInput.value
    );
    state.els.historyEditDiscountPriceInput.value = discountPrice;
  }

  function getDiscountFields(rawData, productData) {
    const saleData = normalizeSaleData(rawData);

    if (
      saleData &&
      saleData !== "" &&
      (!Array.isArray(saleData) || saleData.length > 0) &&
      (saleData.discountPrice !== undefined || saleData.sdiscount !== undefined)
    ) {
      return {
        discountPrice: formatPrice(saleData.discountPrice),
        discountPercent: formatPercent(saleData.sdiscount)
      };
    }

    const sPrice = numberFromValue(productData.s_price);
    const sDiscount = numberFromValue(productData.s_discount);
    const normalizedDiscount = sDiscount / 100;

    return {
      discountPrice: formatPrice(sPrice * (1 - normalizedDiscount)),
      discountPercent: formatPercent(normalizedDiscount)
    };
  }

  function renderProductData(data) {
    const normalized = normalizeProductData(data);
    for (let index = 0; index < CONFIG.resultFields.length; index += 1) {
      const key = CONFIG.resultFields[index];
      setResultField(key, normalized[key]);
    }

    const discountFields = getDiscountFields(data, normalized);
    const sPrice = numberFromValue(normalized.s_price);
    const discountPrice = numberFromValue(discountFields.discountPrice);
    const hasVisibleDiscount = Boolean(discountPrice) && Boolean(sPrice) && discountPrice < sPrice;

    setDiscountVisibility(hasVisibleDiscount);
    setResultField("discount_price", hasVisibleDiscount ? discountFields.discountPrice : "");
    setResultField("discount_percent", hasVisibleDiscount ? discountFields.discountPercent : "");

    state.currentProductRecord = {
      goods_id: String(normalized.id || ""),
      barcode: String(normalized.goods_code || state.els.barcodeInput.value || "").trim(),
      italian_name: String(normalized.italian_name || ""),
      p_price: String(normalized.p_price || ""),
      s_price: String(normalized.s_price || ""),
      s_discount: String(normalized.s_discount || ""),
      discount_price: hasVisibleDiscount ? String(discountFields.discountPrice || "") : "",
      has_discount: hasVisibleDiscount,
      comparison_qty: 1
    };
  }

  async function fetchProductInfo(barcode) {
    const code = String(barcode || "").trim();
    if (!code) {
      setStatus("Type or scan a barcode first");
      return;
    }

    state.els.barcodeInput.value = code;
    clearResultFields();
    const lookupSequence = state.lookupSequence + 1;
    state.lookupSequence = lookupSequence;

    const cookie = await getCookieForRequests();

    addHistoryItem(code);
    setStatus("Requesting product info...");

    const productResponseText = await fetchProductInfoThroughProxy(code, cookie);

    let parsedProduct;
    try {
      parsedProduct = JSON.parse(productResponseText);
    } catch {
      throw new Error("Product info response was not valid JSON.");
    }

    renderProductData({
      product: parsedProduct?.product || parsedProduct,
      sale: null
    });
    if (state.currentProductRecord) {
      syncHistoryRowsWithRecord(state.currentProductRecord, code);
    }
    setStatus("Product info loaded");

    fetchDiscountInfoThroughProxy(code, cookie)
      .then(function (discountResponseText) {
        let parsedDiscount = null;
        try {
          parsedDiscount = discountResponseText ? JSON.parse(discountResponseText) : null;
        } catch {
          parsedDiscount = null;
        }

        const updatedRecord = buildHistoryItemFromLookupData(
          parsedProduct?.product || parsedProduct,
          parsedDiscount,
          code,
          state.currentProductRecord?.comparison_qty || 1
        );
        syncHistoryRowsWithRecord(updatedRecord, code);

        if (lookupSequence === state.lookupSequence && String(state.els.barcodeInput.value || "").trim() === code) {
          renderProductData({
            product: parsedProduct?.product || parsedProduct,
            sale: parsedDiscount
          });
        }
      })
      .catch(function () {
        // Temporary discount lookups are background-only for scan speed.
      });
  }

  async function openHistoryEditor(index) {
    if (index < 0 || index >= state.history.length) return;

    const item = state.history[index];
    state.editingHistoryId = item.id;
    selectHistoryItem(index);
    openHistoryEditDialog(item);
    state.els.historyEditSaveNote.textContent = "Loading latest info...";

    try {
      const { product, discountPrice, hasDiscount } = await loadProductAndDiscountResponse(item.barcode);
      const updatedItem = normalizeHistoryItem({
        ...item,
        goods_id: product.id || item.goods_id,
        barcode: product.goods_code || item.barcode,
        italian_name: product.italian_name || item.italian_name,
        p_price: product.p_price || item.p_price,
        s_price: product.s_price || item.s_price,
        s_discount: product.s_discount || item.s_discount,
        discount_price: discountPrice || calculateDiscountPrice(product.s_price || item.s_price, product.s_discount || item.s_discount),
        has_discount: hasDiscount || Boolean(numberFromValue(product.s_discount || item.s_discount))
      });
      syncHistoryRowsWithRecord(updatedItem, item.barcode);
      const refreshedSelectedItem =
        state.history.find((historyItem) => historyItem.id === item.id) || updatedItem;
      fillHistoryEditForm(refreshedSelectedItem);
      state.els.historyEditSaveNote.textContent = "";
      setStatus(`Latest info loaded for ${updatedItem.barcode}`);
    } catch (error) {
      state.els.historyEditSaveNote.textContent = error.message || "Could not refresh item info.";
    }
  }

  async function saveHistoryEditorChanges() {
    if (!state.editingHistoryId) {
      throw new Error("No barcode row selected");
    }

    const index = state.history.findIndex((item) => item.id === state.editingHistoryId);
    if (index < 0) {
      throw new Error("Selected barcode row was not found");
    }

    const currentItem = state.history[index];
    const payload = {
      id: state.els.historyEditIdInput.value.trim(),
      barcode: state.els.historyEditBarcodeInput.value.trim(),
      italian_name: sanitizeItalianName(state.els.historyEditItalianNameInput.value),
      p_price: state.els.historyEditPPriceInput.value.trim(),
      s_price: state.els.historyEditSPriceInput.value.trim(),
      s_discount: state.els.historyEditSDiscountInput.value.trim()
    };
    const comparisonQty = Math.max(1, Number(state.els.historyEditQtyInput.value || 1) || 1);
    const originalItalianName = state.els.historyEditItalianNameInput.value.trim();
    state.els.historyEditItalianNameInput.value = payload.italian_name;
    if (originalItalianName !== payload.italian_name) {
      showToast("Unsupported symbols removed from name");
    }

    const cookie = await getCookieForRequests();
    state.els.historyEditSaveNote.textContent = originalItalianName !== payload.italian_name
      ? "Italian name cleaned before save."
      : "Checking product...";
    let updatedItem;
    let existingProduct = null;

    try {
      const latestInfo = await loadProductInfoResponse(payload.barcode);
      if (hasProductInDatabase(latestInfo.normalized, payload.barcode)) {
        existingProduct = latestInfo.normalized;
      }
    } catch {
      existingProduct = null;
    }

    const shouldAddNewProduct = !existingProduct;

    if (shouldAddNewProduct) {
      if (!payload.italian_name || !payload.p_price || !payload.s_price) {
        throw new Error("Italian name, cost, and price are required for a new barcode.");
      }
    } else {
      payload.id = String(existingProduct.id || payload.id || currentItem.goods_id || "").trim();
      if (!payload.id) {
        throw new Error("ID is missing");
      }
    }

    if (shouldAddNewProduct) {
      state.els.historyEditSaveNote.textContent = "Adding new product...";
      try {
        const addResponseText = await fetchAddProductThroughProxy(payload, cookie);
        let addResponse = null;
        try {
          addResponse = addResponseText ? JSON.parse(addResponseText) : null;
        } catch {
          addResponse = null;
        }

        const addedProduct = normalizeProductData(addResponse?.product || addResponse);
        updatedItem = normalizeHistoryItem({
          ...currentItem,
          goods_id: String(addedProduct.id || currentItem.goods_id || ""),
          barcode: String(addedProduct.goods_code || payload.barcode || currentItem.barcode || ""),
          italian_name: String(addedProduct.italian_name || payload.italian_name),
          p_price: String(addedProduct.p_price || payload.p_price),
          s_price: String(addedProduct.s_price || payload.s_price),
          s_discount: String(addedProduct.s_discount || payload.s_discount),
          discount_price: calculateDiscountPrice(addedProduct.s_price || payload.s_price, addedProduct.s_discount || payload.s_discount),
          has_discount: Boolean(numberFromValue(addedProduct.s_discount || payload.s_discount)),
          comparison_qty: comparisonQty
        });
        showToast("Product added successfully");
      } catch (error) {
        showToast("Add product failed");
        error.toastShown = true;
        throw error;
      }
    } else {
      state.els.historyEditSaveNote.textContent = "Saving changes...";
      await fetchUpdateItemThroughProxy(payload, cookie);
      updatedItem = normalizeHistoryItem({
        ...currentItem,
        goods_id: payload.id,
        barcode: payload.barcode || currentItem.barcode,
        italian_name: payload.italian_name,
        p_price: payload.p_price,
        s_price: payload.s_price,
        s_discount: payload.s_discount,
        discount_price: calculateDiscountPrice(payload.s_price, payload.s_discount),
        has_discount: Boolean(numberFromValue(payload.s_discount)),
        comparison_qty: comparisonQty
      });
    }

    try {
      const latestItemData = await loadProductAndDiscountResponse(updatedItem.barcode);
      updatedItem = normalizeHistoryItem({
        ...updatedItem,
        goods_id: String(latestItemData.product.id || updatedItem.goods_id || ""),
        barcode: String(latestItemData.product.goods_code || updatedItem.barcode || ""),
        italian_name: String(latestItemData.product.italian_name || updatedItem.italian_name || ""),
        p_price: String(latestItemData.product.p_price || updatedItem.p_price || ""),
        s_price: String(latestItemData.product.s_price || updatedItem.s_price || ""),
        s_discount: String(latestItemData.product.s_discount || updatedItem.s_discount || ""),
        discount_price: latestItemData.discountPrice || calculateDiscountPrice(
          latestItemData.product.s_price || updatedItem.s_price,
          latestItemData.product.s_discount || updatedItem.s_discount
        ),
        has_discount: latestItemData.hasDiscount || Boolean(numberFromValue(latestItemData.product.s_discount || updatedItem.s_discount)),
        comparison_qty: comparisonQty
      });
    } catch {
      // Keep the saved values if the refresh-after-save request fails.
    }

    updateHistoryItemsByBarcode(updatedItem.barcode, {
      goods_id: updatedItem.goods_id,
      barcode: updatedItem.barcode,
      italian_name: updatedItem.italian_name,
      p_price: updatedItem.p_price,
      s_price: updatedItem.s_price,
      s_discount: updatedItem.s_discount,
      discount_price: updatedItem.discount_price,
      has_discount: updatedItem.has_discount,
      comparison_qty: updatedItem.comparison_qty
    });
    if (state.currentProductRecord?.barcode === updatedItem.barcode) {
      state.currentProductRecord = {
        ...state.currentProductRecord,
        goods_id: updatedItem.goods_id,
        italian_name: updatedItem.italian_name,
        p_price: updatedItem.p_price,
        s_price: updatedItem.s_price,
        s_discount: updatedItem.s_discount,
        discount_price: updatedItem.discount_price,
        has_discount: updatedItem.has_discount,
        comparison_qty: updatedItem.comparison_qty
      };
      setResultField("id", updatedItem.goods_id);
      setResultField("italian_name", updatedItem.italian_name);
      setResultField("p_price", updatedItem.p_price);
      setResultField("s_price", updatedItem.s_price);
      setResultField("discount_price", updatedItem.discount_price);
      setResultField("discount_percent", updatedItem.s_discount ? formatPercent(updatedItem.s_discount) : "");
      setDiscountVisibility(Boolean(numberFromValue(updatedItem.discount_price)) && numberFromValue(updatedItem.discount_price) < numberFromValue(updatedItem.s_price));
    }

    setStatus(`Saved ${updatedItem.barcode}`);
    closeHistoryEditDialog();
  }

  function supportsConfiguredScannerEngine() {
    if (isIOSDevice()) {
      return Boolean(window.Quagga);
    }
    return true;
  }

  function getCameraSupportIssue() {
    if (!window.isSecureContext) {
      return 'Camera access needs a secure page, like "https://" or "http://localhost".';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return "This browser does not support camera access.";
    }
    if (!supportsConfiguredScannerEngine()) {
      return isIOSDevice()
        ? "The iPhone barcode scanner library did not load."
        : "The Android barcode scanner library did not load.";
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
      window.clearTimeout(state.scanTimer);
      state.scanTimer = 0;
    }
    state.isScanLoopScheduled = false;
    state.isScanInFlight = false;
  }

  function stopPreviewWatchdog() {
    if (state.previewWatchdogTimer) {
      window.clearInterval(state.previewWatchdogTimer);
      state.previewWatchdogTimer = 0;
    }
    state.stalledPreviewChecks = 0;
    state.lastPreviewTime = 0;
  }

  async function recoverPreviewFromFreeze() {
    if (state.isRecoveringPreview || !state.isCameraRunning) {
      return;
    }

    state.isRecoveringPreview = true;
    const shouldResumeScanning = state.isScanning;
    const selectedDeviceId = state.activeDeviceId || state.els.cameraSelect.value;
    stopScanning(true);
    setStatus("Camera preview paused, reconnecting...");

    try {
      await startCamera(selectedDeviceId);
      if (shouldResumeScanning) {
        await startScanning();
      } else {
        setStatus("Camera preview restored");
      }
    } catch (error) {
      setStatus(error.message || "Camera preview recovery failed");
    } finally {
      state.isRecoveringPreview = false;
    }
  }

  function startPreviewWatchdog() {
    stopPreviewWatchdog();
    if (!state.isCameraRunning) {
      return;
    }

    state.lastPreviewTime = Number(getPreviewVideoElement()?.currentTime || 0);
    state.previewWatchdogTimer = window.setInterval(function () {
      if (!state.isCameraRunning || state.isRecoveringPreview || document.hidden) {
        return;
      }

      const video = getPreviewVideoElement();
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      const currentTime = Number(video.currentTime || 0);
      if (Math.abs(currentTime - state.lastPreviewTime) < 0.01) {
        state.stalledPreviewChecks += 1;
      } else {
        state.lastPreviewTime = currentTime;
        state.stalledPreviewChecks = 0;
      }

      if (state.stalledPreviewChecks >= CONFIG.previewStallThreshold) {
        state.stalledPreviewChecks = 0;
        recoverPreviewFromFreeze().catch(() => {
          // Ignore watchdog recovery noise.
        });
      }
    }, CONFIG.previewWatchIntervalMs);
  }

  async function stopTracks() {
    stopPreviewWatchdog();
    state.isCameraRunning = false;
    state.torchOn = false;
    updateTorchUi(false, false);

    const scanner = state.scanner;
    const currentStream = state.stream;
    state.scanner = null;
    const engine = state.scannerEngine;
    state.scannerEngine = "";

    if (engine === "zxing") {
      if (scanner?.controls?.stop) {
        try {
          scanner.controls.stop();
        } catch {
          // Ignore teardown issues from partially started sessions.
        }
      }
      if (scanner?.reader?.reset) {
        try {
          scanner.reader.reset();
        } catch {
          // Ignore cleanup issues from browsers with partial support.
        }
      }
    } else if (engine === "quagga" && window.Quagga) {
      if (scanner?.onDetected && window.Quagga.offDetected) {
        try {
          window.Quagga.offDetected(scanner.onDetected);
        } catch {
          // Ignore listener cleanup issues.
        }
      }
      try {
        window.Quagga.stop();
      } catch {
        // Ignore cleanup issues from browsers with partial support.
      }
    }

    state.stream = null;
    state.track = null;
    state.detector = null;
    setActivePreviewEngine("");

    if (scanner?.stream?.getTracks) {
      const scannerTracks = scanner.stream.getTracks();
      for (let index = 0; index < scannerTracks.length; index += 1) {
        try {
          scannerTracks[index].stop();
        } catch {
          // Ignore cleanup issues from stale tracks.
        }
      }
    }

    if (currentStream?.getTracks) {
      const tracks = currentStream.getTracks();
      for (let index = 0; index < tracks.length; index += 1) {
        try {
          tracks[index].stop();
        } catch {
          // Ignore stream teardown issues.
        }
      }
    }

    if (state.els.cameraPreview instanceof HTMLVideoElement) {
      try {
        state.els.cameraPreview.pause();
      } catch {
        // Ignore pause issues on detached previews.
      }
      try {
        state.els.cameraPreview.srcObject = null;
      } catch {
        // Ignore srcObject cleanup issues.
      }
      state.els.cameraPreview.removeAttribute("src");
      try {
        state.els.cameraPreview.load();
      } catch {
        // Ignore load reset issues.
      }
    }

    if (state.els.cameraPreviewQuagga) {
      state.els.cameraPreviewQuagga.innerHTML = "";
    }
  }

  function updateResolutionBadge() {
    const liveTrack = state.track || getActiveStreamTrackFromPreview();
    if (!liveTrack?.getSettings) {
      state.els.resolutionBadge.textContent = "0 x 0";
      return;
    }

    const settings = liveTrack.getSettings();
    const video = getPreviewVideoElement();
    const width = settings.width || video?.videoWidth || 0;
    const height = settings.height || video?.videoHeight || 0;
    state.els.resolutionBadge.textContent = `${width} x ${height}`;
  }

  function buildDeviceLabel(device, index) {
    return device.label || `Camera ${index + 1}`;
  }

  function chooseBestDefaultDevice(devices) {
    if (!devices || devices.length === 0) return "";
    const rear = devices.find((device) => /back|rear|environment|wide|ultra/i.test(device.label || ""));
    if (rear) {
      return rear.deviceId;
    }
    if (devices.length > 1) {
      return devices[devices.length - 1].deviceId;
    }
    return devices[0].deviceId;
  }

  async function refreshDevices(preferredDeviceId) {
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = mediaDevices.filter((device) => device.kind === "videoinput");

    state.devices = devices;
    const savedCameraId = readSavedCameraId();
    const fallbackId = preferredDeviceId || state.activeDeviceId || savedCameraId || chooseBestDefaultDevice(state.devices);
    const hasMatch = state.devices.some((device) => device.deviceId === fallbackId);
    const currentId = hasMatch ? fallbackId : chooseBestDefaultDevice(state.devices);
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
    if (currentId) {
      saveCameraId(currentId);
    }
  }

  async function handleDetectedCode(detectedText, options) {
    const source = options?.source || state.scannerEngine || "unknown";
    const code = sanitizeDetectedCode(detectedText);
    if (!state.isScanning || !code) {
      return;
    }

    if (!shouldAcceptDetectedCode(code, source)) {
      return;
    }

    state.els.barcodeInput.value = code;
    playCaptureSound();
    stopScanning(true);

    try {
      await fetchProductInfo(code);
    } catch (error) {
      setStatus(error.message || "Barcode was captured, but info request failed");
    }
  }

  function getSquareCropSize(video) {
    const preferredSquareSize = state.isMobileUi ? CONFIG.mobilePreferredSquareSize : CONFIG.preferredSquareSize;
    const width = video.videoWidth || preferredSquareSize;
    const height = video.videoHeight || preferredSquareSize;
    return Math.max(1, Math.min(width, height));
  }

  function drawSquareFrame() {
    const video = state.els.cameraPreview;
    const canvas = state.els.captureCanvas;
    const context = canvas.getContext("2d", { alpha: false });
    const squareSize = getSquareCropSize(video);
    const sx = Math.max(0, Math.floor((video.videoWidth - squareSize) / 2));
    const sy = Math.max(0, Math.floor((video.videoHeight - squareSize) / 2));
    const outputSize = state.isMobileUi ? 512 : 720;

    canvas.width = outputSize;
    canvas.height = outputSize;
    context.drawImage(video, sx, sy, squareSize, squareSize, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function readBarcodeFromCanvas(canvas) {
    const detector = await createDetector();
    if (!detector) {
      return [];
    }

    try {
      return await detector.detect(canvas);
    } catch {
      return [];
    }
  }

  async function captureAttempt() {
    if (!state.isCameraRunning || !state.track) {
      return false;
    }

    const canvas = drawSquareFrame();
    const detections = await readBarcodeFromCanvas(canvas);
    const detectedText = sanitizeDetectedCode(detections[0]?.rawValue || "");

    if (!detectedText) {
      setStatus("Scanning... point the barcode inside the square");
      return false;
    }

    state.els.barcodeInput.value = detectedText;
    playCaptureSound();
    stopScanning(true);

    try {
      await fetchProductInfo(detectedText);
      return true;
    } catch (error) {
      setStatus(error.message || "Barcode was captured, but info request failed");
      return true;
    }
  }

  async function runScanLoop() {
    if (!state.isScanning || state.isScanLoopScheduled) {
      return;
    }

    state.isScanLoopScheduled = true;
    state.scanTimer = window.setTimeout(async function () {
      state.isScanLoopScheduled = false;
      if (!state.isScanning || state.isScanInFlight) {
        if (state.isScanning) {
          runScanLoop().catch(() => {
            // Ignore transient reschedule issues.
          });
        }
        return;
      }

      state.isScanInFlight = true;
      try {
        const detected = await captureAttempt();
        if (!detected && state.isScanning) {
          runScanLoop().catch(() => {
            // Ignore transient reschedule issues.
          });
        }
      } catch {
        setStatus("Scanning had a temporary read error");
        if (state.isScanning) {
          runScanLoop().catch(() => {
            // Ignore transient reschedule issues.
          });
        }
      } finally {
        state.isScanInFlight = false;
      }
    }, CONFIG.scanIntervalMs);
  }

  async function startCameraWithNativeDetector(preferredCameraId, activeVideoConfig) {
    setActivePreviewEngine("native");

    const constraints = {
      audio: false,
      video: {
        width: { ideal: activeVideoConfig.video.width.ideal, max: activeVideoConfig.video.width.max },
        height: { ideal: activeVideoConfig.video.height.ideal, max: activeVideoConfig.video.height.max },
        aspectRatio: { ideal: activeVideoConfig.video.aspectRatio.ideal },
        frameRate: { ideal: activeVideoConfig.video.frameRate.ideal, max: activeVideoConfig.video.frameRate.max },
        resizeMode: activeVideoConfig.video.resizeMode
      }
    };

    if (preferredCameraId) {
      constraints.video.deviceId = { exact: preferredCameraId };
    } else {
      constraints.video.facingMode = { ideal: activeVideoConfig.video.facingMode.ideal };
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0] || null;

    state.stream = stream;
    state.track = track;
    state.scanner = { stream: stream };
    state.scannerEngine = "native";
    state.activeDeviceId = track?.getSettings?.().deviceId || preferredCameraId || state.activeDeviceId;
    saveCameraId(state.activeDeviceId);

    state.els.cameraPreview.srcObject = stream;
    configurePreviewVideoElement(state.els.cameraPreview);
    await state.els.cameraPreview.play();
    await applyTrackEnhancements(track, activeVideoConfig);
    await refreshDevices(state.activeDeviceId);
    await syncTorchSupport();
  }

  async function startCameraWithZxing(preferredCameraId, activeVideoConfig) {
    setActivePreviewEngine("zxing");
    const reader = new window.ZXingBrowser.BrowserMultiFormatReader(
      getZxingHints(),
      isAndroidDevice() ? 20 : (state.isMobileUi ? 60 : 50)
    );

    const controls = await reader.decodeFromVideoDevice(
      preferredCameraId || undefined,
      "cameraPreview",
      function (result) {
        if (result?.getText) {
          handleDetectedCode(result.getText(), { source: "zxing" }).catch(() => {
            // Ignore async decode handler noise.
          });
        }
      }
    );

    state.scanner = { reader: reader, controls: controls };
    state.scannerEngine = "zxing";
    state.track = await waitForActiveTrack();
    configurePreviewVideoElement(getPreviewVideoElement());
    state.activeDeviceId = state.track?.getSettings?.().deviceId || preferredCameraId || state.activeDeviceId;
    saveCameraId(state.activeDeviceId);
    await applyTrackEnhancements(state.track, activeVideoConfig);
    await refreshDevices(state.activeDeviceId);
    await syncTorchSupport();
  }

  async function startCameraWithQuagga(preferredCameraId, activeVideoConfig) {
    setActivePreviewEngine("quagga");
    state.els.cameraPreviewQuagga.innerHTML = "";

    await new Promise(function (resolve, reject) {
      window.Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: state.els.cameraPreviewQuagga,
          constraints: preferredCameraId
            ? {
                deviceId: preferredCameraId,
                width: activeVideoConfig.video.width.ideal,
                height: activeVideoConfig.video.height.ideal,
                aspectRatio: activeVideoConfig.video.aspectRatio.ideal,
                frameRate: activeVideoConfig.video.frameRate.ideal,
                facingMode: "environment"
              }
            : {
                facingMode: "environment",
                width: activeVideoConfig.video.width.ideal,
                height: activeVideoConfig.video.height.ideal,
                aspectRatio: activeVideoConfig.video.aspectRatio.ideal,
                frameRate: activeVideoConfig.video.frameRate.ideal
              }
        },
        area: getQuaggaScanArea(),
        locator: {
          patchSize: isIOSDevice() ? "medium" : (state.isMobileUi ? "small" : "medium"),
          halfSample: false
        },
        numOfWorkers: 0,
        frequency: isIOSDevice() ? 10 : (state.isMobileUi ? 14 : 12),
        decoder: {
          readers: getPreferredReaders(),
          multiple: false
        },
        locate: true
      }, function (error) {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const onDetected = function (result) {
      const code = result?.codeResult?.code || "";
      handleDetectedCode(code, { source: "quagga" }).catch(() => {
        // Ignore async decode handler noise.
      });
    };

    window.Quagga.onDetected(onDetected);
    window.Quagga.start();
    state.scanner = { onDetected: onDetected };
    state.scannerEngine = "quagga";
    state.track = await waitForActiveTrack(2200);
    configurePreviewVideoElement(getPreviewVideoElement());
    state.activeDeviceId = state.track?.getSettings?.().deviceId || preferredCameraId || state.activeDeviceId;
    saveCameraId(state.activeDeviceId);
    await applyTrackEnhancements(state.track, activeVideoConfig);
    await refreshDevices(state.activeDeviceId);
    await syncTorchSupport();
  }

  async function applyTrackEnhancements(track, activeVideoConfig) {
    if (!track?.getCapabilities || !track.applyConstraints) return;

    const baseVideoConfig = activeVideoConfig?.video || getActiveVideoConfig().video;
    const baseConstraints = {};

    if (baseVideoConfig?.width) {
      baseConstraints.width = baseVideoConfig.width;
    }
    if (baseVideoConfig?.height) {
      baseConstraints.height = baseVideoConfig.height;
    }
    if (baseVideoConfig?.aspectRatio) {
      baseConstraints.aspectRatio = baseVideoConfig.aspectRatio;
    }
    if (baseVideoConfig?.frameRate) {
      baseConstraints.frameRate = baseVideoConfig.frameRate;
    }
    if (baseVideoConfig?.resizeMode) {
      baseConstraints.resizeMode = baseVideoConfig.resizeMode;
    }

    if (Object.keys(baseConstraints).length > 0) {
      try {
        await track.applyConstraints(baseConstraints);
      } catch {
        // Ignore base resolution requests that are not supported by this device.
      }
    }

    const capabilities = track.getCapabilities();
    const advanced = [];

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    }

    if (!isIOSDevice() && capabilities.zoom && typeof capabilities.zoom.max === "number") {
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
    await stopTracks();

    const activeVideoConfig = getActiveVideoConfig();
    await refreshDevices(deviceId || state.activeDeviceId || readSavedCameraId());
    const preferredCameraId = deviceId || state.activeDeviceId || chooseBestDefaultDevice(state.devices);
    if (isIOSDevice()) {
      await startCameraWithQuagga(preferredCameraId, activeVideoConfig);
    } else {
      await startCameraWithNativeDetector(preferredCameraId, activeVideoConfig);
    }

    state.isCameraRunning = true;
    state.isScanning = false;
    setPreviewActive(true);
    updateResolutionBadge();
    updateScanButton();
    updateModePill();
    startPreviewWatchdog();
    setStatus("Camera ready");
  }

  async function startScanning() {
    if (!state.isCameraRunning) {
      await startCamera(state.activeDeviceId);
    }

    if (state.isScanning) return;

    resetPendingDetection();
    state.isScanning = true;
    updateScanButton();
    updateModePill();
    if (usesNativeAndroidScanner()) {
      setStatus("Scanning started");
      if (await captureAttempt()) {
        return;
      }
      cleanupScanTimer();
      await runScanLoop();
      return;
    }

    setStatus("Scanning... point the barcode inside the square");
  }

  function stopScanning(keepStatusMessage) {
    cleanupScanTimer();
    resetPendingDetection();
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
    saveCameraId(selectedId);
    stopScanning(true);
    await startCamera(selectedId);
    if (shouldResumeScanning) {
      await startScanning();
    }
  }

  function bindEvents() {
    state.els.scanBtn.addEventListener("click", async function () {
      state.els.scanBtn.disabled = true;
      primeCaptureSound();
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

    state.els.clearSelectedBtn.addEventListener("click", function () {
      if (state.selectedHistoryIndex < 0) {
        return;
      }
      openConfirmDialog("Delete the selected barcode from the list?", clearSelectedHistory);
    });
    state.els.clearAllBtn.addEventListener("click", function () {
      if (state.history.length === 0) {
        return;
      }
      openConfirmDialog("Delete all barcodes from the list?", clearAllHistory);
    });
    state.els.sendTxtBtn.addEventListener("click", async function () {
      state.els.sendTxtBtn.disabled = true;
      try {
        await sendTxtList();
      } catch (error) {
        setStatus(error.message || "Send TXT failed");
      } finally {
        state.els.sendTxtBtn.disabled = false;
      }
    });

    state.els.printBtn.addEventListener("click", function () {
      if (state.history.length === 0) {
        setStatus("Barcode list is empty");
        return;
      }
      openPrintDialog();
    });

    state.els.printBigBtn.addEventListener("click", async function () {
      state.els.printBigBtn.disabled = true;
      state.els.printStickerBtn.disabled = true;
      try {
        await printHistoryList("60*38");
        closePrintDialog();
      } catch (error) {
        setStatus(error.message || "Print failed");
      } finally {
        state.els.printBigBtn.disabled = false;
        state.els.printStickerBtn.disabled = false;
      }
    });

    state.els.printStickerBtn.addEventListener("click", async function () {
      state.els.printBigBtn.disabled = true;
      state.els.printStickerBtn.disabled = true;
      try {
        await printHistoryList("40*25");
        closePrintDialog();
      } catch (error) {
        setStatus(error.message || "Print failed");
      } finally {
        state.els.printBigBtn.disabled = false;
        state.els.printStickerBtn.disabled = false;
      }
    });

    state.els.printBackBtn.addEventListener("click", closePrintDialog);

    state.els.historyList.addEventListener("click", function (event) {
      const detailButton = event.target.closest('[data-action="detail"]');
      if (detailButton) {
        const detailIndex = Number(detailButton.dataset.index);
        if (!Number.isNaN(detailIndex)) {
          openHistoryEditor(detailIndex).catch((error) => {
            setStatus(error.message || "Could not open barcode row");
          });
        }
        return;
      }

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

    document.addEventListener("focusin", function (event) {
      if (!isIOSDevice() || !isTextEntryElement(event.target)) {
        return;
      }
      pauseScanningForInteraction({ silentStatus: true });
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
    state.els.compactToggleBtn.addEventListener("click", function () {
      const nextCompactMode = !state.isCompactMode;
      applyCompactMode(nextCompactMode);
      saveSettings({
        ...readSavedSettings(),
        compactMode: nextCompactMode
      }, { silent: true });
    });

    state.els.loginSettingsBtn.addEventListener("click", async function () {
      const values = {
        shopKey: state.els.shopKeyInput.value.trim(),
        login: state.els.loginInput.value.trim(),
        password: state.els.passwordInput.value,
        compactMode: state.isCompactMode
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

    state.els.confirmDialogOkBtn.addEventListener("click", function () {
      const action = state.pendingConfirmAction;
      closeConfirmDialog();
      if (action) {
        action();
      }
    });

    state.els.confirmDialogCancelBtn.addEventListener("click", closeConfirmDialog);

    state.els.confirmDialog.addEventListener("click", function (event) {
      if (event.target === state.els.confirmDialog) {
        closeConfirmDialog();
      }
    });

    state.els.printDialog.addEventListener("click", function (event) {
      if (event.target === state.els.printDialog) {
        closePrintDialog();
      }
    });

    state.els.historyEditSaveBtn.addEventListener("click", async function () {
      state.els.historyEditSaveBtn.disabled = true;
      try {
        await saveHistoryEditorChanges();
      } catch (error) {
        state.els.historyEditSaveNote.textContent = error.message || "Save failed.";
        if (!error?.toastShown) {
          showToast("Save failed");
        }
      } finally {
        state.els.historyEditSaveBtn.disabled = false;
      }
    });

    state.els.historyEditBackBtn.addEventListener("click", closeHistoryEditDialog);

    state.els.historyEditSPriceInput.addEventListener("input", refreshHistoryEditDiscountPrice);
    state.els.historyEditSDiscountInput.addEventListener("input", refreshHistoryEditDiscountPrice);

    state.els.historyEditDialog.addEventListener("click", function (event) {
      if (event.target === state.els.historyEditDialog) {
        closeHistoryEditDialog();
      }
    });

    window.addEventListener("beforeunload", function () {
      stopScanning(true);
      stopTracks();
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        state.lastPreviewTime = Number(getPreviewVideoElement()?.currentTime || 0);
        state.stalledPreviewChecks = 0;
      }
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
    state.isMobileUi = detectMobileUi();
    document.body.classList.toggle("is-ios", isIOSDevice());
    cacheResultFieldElements();

    const savedSettings = readSavedSettings();
    loadCookieState();
    loadHistoryState();
    fillSettingsForm(savedSettings);
    applyCompactMode(savedSettings.compactMode);
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
      await refreshDevices(readSavedCameraId());
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
