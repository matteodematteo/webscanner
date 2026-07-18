(function bootstrapWebBarcodeScanner() {
  // ============================================================================
  // 1. CONFIG & DATA MODEL
  // ============================================================================
  const CONFIG = {
    // Endpoints (Cloudflare Worker Proxies)
    cookieProxyEndpoint: 'https://proxy.example.workers.dev/auth',
    infoProxyEndpoint: 'https://proxy.example.workers.dev/info',
    discountProxyEndpoint: 'https://proxy.example.workers.dev/discount',
    closestSearchProxyEndpoint: 'https://proxy.example.workers.dev/search',
    updateProxyEndpoint: 'https://proxy.example.workers.dev/update',
    addProductProxyEndpoint: 'https://proxy.example.workers.dev/add',
    sendTxtEndpoint: 'https://proxy.example.workers.dev/send',

    // Storage Keys namespaces
    storageKeys: {
      settings: 'web_barcode_scanner_settings',
      cookie: 'web_barcode_scanner_cookie',
      cookieStatus: 'web_barcode_scanner_cookie_status',
      history: 'web_barcode_scanner_history',
      cameraId: 'web_barcode_scanner_camera_id',
      roiSize: 'web_barcode_scanner_roi_size',
      productInfoSlide: 'web_barcode_scanner_slide_index'
    },

    // Timing constants
    scanIntervalMs: 240, 
    mobileScanIntervalMs: 170, 
    iosScanIntervalMs: 130,
    duplicateScanCooldownMs: 600,
    previewWatchIntervalMs: 1000,
    previewStallThreshold: 3,

    // Image sizing and formatting
    preferredSquareSize: 1080,
    mobilePreferredSquareSize: 1080,
    detectorFormats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf'],
    detectionCropModes: ["roi"], // Strictly limited to user-drawn ROI box

    // Video constraints (targeting 1920x1080 @ 30fps rear camera)
    videoConstraints: { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } }
  };

  const state = {
    // Camera / Stream
    els: {},
    stream: null,
    track: null,
    devices: [],
    activeDeviceId: null,
    detector: null,
    isCameraRunning: false,
    isScanning: false,
    torchOn: false,
    scanTimer: null,
    cameraStartPromise: null,

    // Detection Loop
    isScanLoopScheduled: false,
    isScanInFlight: false,
    lastDetectedBarcode: null,
    lastDetectedAt: 0,
    pendingConfirmCode: null,
    pendingConfirmCount: 0,

    // ROI Box
    roi: { width: 0.8, height: 0.5 },
    roiDrag: null,

    // Product & History 
    currentProductRecord: null,
    lookupSequence: 0,
    closestSearchResults: [],
    history: [],
    selectedHistoryIndex: null,
    editingHistoryId: null,

    // Auth & UI
    authCookie: null,
    authStatus: 'Missing',
    displayMode: 'full', // Hard-locked to full
    isQuantityEntryUnlocked: false,
    manualScrollLocked: false,
    manualScrollLockY: 0,
    lockedScrollY: 0,
    pendingApiRequests: 0
  };

  // ============================================================================
  // 2. BOOTSTRAP & UI INITIALIZATION
  // ============================================================================
  function init() {
    waitForHtml5QrReady().then(() => {
      queryElements();
      requireElements();
      
      // Load stored states
      loadSettings();
      loadHistoryState();
      loadRoiState();
      loadProductInfoSlideIndex();
      
      // Initialize UI 
      initProductInfoSlider();
      renderHistory();
      bindEvents();

      // Background setups
      loginAndRefreshCookie(); // Non-blocking auth fetch
      startCamera(state.activeDeviceId);
    }).catch(err => {
      console.error("Failed to initialize scanner:", err);
    });
  }

  function waitForHtml5QrReady() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = setInterval(() => {
        if (window.Html5Qrcode) {
          clearInterval(check);
          resolve();
        } else if (++attempts > 50) {
          clearInterval(check);
          reject(new Error("html5-qrcode load timeout"));
        }
      }, 100);
    });
  }

  function queryElements() {
    // Map required DOM nodes to state.els
    state.els.previewFrame = document.getElementById('previewFrame');
    state.els.cameraPreview = document.getElementById('cameraPreview');
    state.els.roiBox = document.getElementById('roiBox');
    state.els.apiLoader = document.getElementById('apiLoader');
    state.els.lockscreenscroll = document.getElementById('lockscreenscroll');
    state.els.html5QrScanHost = document.getElementById('html5QrScanHost');
    // ... Additional queries mapped here
  }

  function requireElements() {
    if (!state.els.previewFrame || !state.els.cameraPreview) {
      throw new Error("Critical DOM elements missing.");
    }
  }

  // ============================================================================
  // 3. CAMERA & PIPELINE
  // ============================================================================
  async function startCamera(deviceId) {
    // Set up constraints, attach to video element, apply enhancements
    try {
      state.stream = await navigator.mediaDevices.getUserMedia(CONFIG.videoConstraints);
      state.els.cameraPreview.srcObject = state.stream;
      state.isCameraRunning = true;
      applyTrackEnhancements();
    } catch (err) {
      getCameraHardwareIssue(err);
    }
  }

  function createDetector() {
    state.detector = new Html5Qrcode(state.els.html5QrScanHost.id);
  }

  function startScanning() {
    if (!state.isCameraRunning) return;
    if (!state.detector) createDetector();
    state.isScanning = true;
    runScanLoop();
  }

  function runScanLoop() {
    if (!state.isScanning) return;
    captureAttempt().then(() => {
      scheduleScanCallback();
    });
  }

  async function captureAttempt() {
    // Draw ROI cropped frame to canvas
    const file = canvasToImageFile(); // Extracts only the ROI box geometry
    
    try {
      // Use identical decoding approach across iOS/Android
      const result = await state.detector.scanFile(file, false);
      if (result) {
        let code = normalizeDetectedText(result);
        if (!wasRecentlyDetected(code) && confirmAcrossFrames(code)) {
          handleDetectedCode(code);
        }
      }
    } catch (e) {
      // No barcode found in this frame (expected behavior for most ticks)
    }
  }

  function restartCameraForRoiResize() {
    stopScanning();
    // Re-bind camera logic to adjust to new boundaries
    startCamera(state.activeDeviceId).then(() => startScanning());
  }

  // ============================================================================
  // 4. DATA FETCHING & PROXY WRAPPERS
  // ============================================================================
  async function apiFetch(url, options) {
    showApiLoader(); // Increments state.pendingApiRequests
    try {
      const response = await fetch(url, options);
      return await response.json();
    } finally {
      hideApiLoader(); // Decrements counter and hides spinner when 0
    }
  }

  async function loginAndRefreshCookie(settingsOverride) {
    // Non-blocking background call
    try {
      const response = await apiFetch(CONFIG.cookieProxyEndpoint, { method: 'POST' /* ... */ });
      state.authCookie = extractCookieFromResponse(response);
      saveCookieState();
    } catch (e) {
      state.authStatus = 'Failed';
    }
  }

  async function fetchProductInfo(barcode, options) {
    // Parallel fetches through proxies
    const [infoData, discountData] = await Promise.all([
      fetchProductInfoThroughProxy(barcode),
      fetchDiscountInfoThroughProxy(barcode)
    ]);
    
    const normalizedData = normalizeProductData(infoData);
    const saleData = normalizeSaleData(discountData);

    renderProductData(normalizedData, saleData);
    
    // Fallback logic if missing
    if (shouldFallbackToClosestSearch(normalizedData)) {
      openClosestSearchDialog();
    } else {
      addHistoryItem(barcode, normalizedData);
    }
  }

  // ============================================================================
  // 5. EVENT BINDING & UTILS
  // ============================================================================
  function bindEvents() {
    state.els.lockscreenscroll.addEventListener('click', toggleScreenScrollLock);
    // Bind slider dots, dialog buttons, FABs, ROI resize handles
  }

  function toggleScreenScrollLock() {
    state.manualScrollLocked = !state.manualScrollLocked;
    const body = document.body;
    const historyList = document.getElementById('historyList');
    
    if (state.manualScrollLocked) {
      state.manualScrollLockY = window.scrollY;
      body.classList.add('is-scroll-locked');
      body.style.top = `-${state.manualScrollLockY}px`;
      historyList.classList.add('is-locked-scroll');
    } else {
      body.classList.remove('is-scroll-locked');
      body.style.top = '';
      window.scrollTo(0, state.manualScrollLockY);
      historyList.classList.remove('is-locked-scroll');
    }
  }

  function showApiLoader() {
    state.pendingApiRequests++;
    state.els.apiLoader.style.display = 'block';
  }

  function hideApiLoader() {
    state.pendingApiRequests--;
    if (state.pendingApiRequests <= 0) {
      state.pendingApiRequests = 0;
      state.els.apiLoader.style.display = 'none';
    }
  }

  // Start the application
  window.addEventListener('DOMContentLoaded', init);

})();
