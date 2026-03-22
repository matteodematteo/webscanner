"use strict";

(function bootstrapCameraApp() {
  const CONFIG = {
    settingsStorageKey: "camera_scanner_settings",
    historyLimit: 10,
    scanIntervalMs: 1200,
    preferredSquareSize: 2160,
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
    isCameraRunning: false,
    isScanning: false,
    torchOn: false,
    scanTimer: 0,
    history: [],
    detector: null,
    selectedHistoryIndex: -1
  };

  function queryElements() {
    return {
      cameraBadge: document.getElementById("cameraBadge"),
      cameraPreview: document.getElementById("cameraPreview"),
      cameraSelect: document.getElementById("cameraSelect"),
      cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
      captureCanvas: document.getElementById("captureCanvas"),
      clearHistoryBtn: document.getElementById("clearHistoryBtn"),
      confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
      deleteDialog: document.getElementById("deleteDialog"),
    deleteDialogText: document.getElementById("deleteDialogText"),
    deleteRecordBtn: document.getElementById("deleteRecordBtn"),
    detectorPill: document.getElementById("detectorPill"),
      historyEmpty: document.getElementById("historyEmpty"),
      historyList: document.getElementById("historyList"),
      previewFrame: document.getElementById("previewFrame"),
      previewPlaceholder: document.getElementById("previewPlaceholder"),
    resolutionBadge: document.getElementById("resolutionBadge"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    scanBtn: document.getElementById("scanBtn"),
    scanModePill: document.getElementById("scanModePill"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsSaveNote: document.getElementById("settingsSaveNote"),
    shopKeyInput: document.getElementById("shopKeyInput"),
    loginInput: document.getElementById("loginInput"),
    passwordInput: document.getElementById("passwordInput"),
    statusText: document.getElementById("statusText"),
    torchBtn: document.getElementById("torchBtn"),
    torchPill: document.getElementById("torchPill")
  };
  }

  function requireElements(els) {
    const missing = Object.entries(els)
      .filter(([, value]) => !value)
      .map(([key]) => key);

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
      return {
        shopKey: "",
        login: "",
        password: ""
      };
    }
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

  function saveSettings() {
    const values = {
      shopKey: state.els.shopKeyInput.value.trim(),
      login: state.els.loginInput.value.trim(),
      password: state.els.passwordInput.value
    };

    localStorage.setItem(CONFIG.settingsStorageKey, JSON.stringify(values));
    state.els.settingsSaveNote.textContent = "Saved successfully on this device.";
    setStatus("Settings saved");
  }

  function updateDeleteButton() {
    state.els.deleteRecordBtn.disabled = state.selectedHistoryIndex < 0;
  }

  function closeDeleteDialog() {
    state.els.deleteDialog.classList.remove("is-open");
    state.els.deleteDialog.setAttribute("aria-hidden", "true");
  }

  function openDeleteDialog() {
    if (state.selectedHistoryIndex < 0 || !state.history[state.selectedHistoryIndex]) {
      return;
    }

    state.els.deleteDialogText.textContent = `Do you want to delete this record: ${state.history[state.selectedHistoryIndex].detectedText}?`;
    state.els.deleteDialog.classList.add("is-open");
    state.els.deleteDialog.setAttribute("aria-hidden", "false");
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
    state.els.scanModePill.textContent = state.isScanning ? "Mode: scanning" : "Mode: preview only";
    state.els.previewFrame.classList.toggle("is-scanning", state.isScanning);
  }

  function cleanupScanTimer() {
    if (state.scanTimer) {
      window.clearInterval(state.scanTimer);
      state.scanTimer = 0;
    }
  }

  function stopTracks() {
    if (!state.stream) {
      return;
    }

    const tracks = state.stream.getTracks();
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].stop();
    }

    state.stream = null;
    state.track = null;
  }

  async function stopCamera() {
    cleanupScanTimer();
    state.isCameraRunning = false;
    state.isScanning = false;
    state.torchOn = false;
    state.els.cameraPreview.srcObject = null;
    stopTracks();
    setPreviewActive(false);
    updateResolutionBadge();
    updateScanButton();
    updateModePill();
    updateTorchUi(false, false);
    state.els.cameraSelect.disabled = true;
    setStatus("Camera stopped");
  }

  function supportsBarcodeDetector() {
    return "BarcodeDetector" in window;
  }

  async function createDetector() {
    if (!supportsBarcodeDetector()) {
      return null;
    }

    if (state.detector) {
      return state.detector;
    }

    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (!formats || formats.length === 0) {
        return null;
      }

      state.detector = new window.BarcodeDetector({
        formats: formats.filter(Boolean)
      });
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

  function getSquareCropSize(video) {
    const width = video.videoWidth || CONFIG.preferredSquareSize;
    const height = video.videoHeight || CONFIG.preferredSquareSize;
    return Math.max(1, Math.min(width, height));
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

  function chooseBestDefaultDevice(devices) {
    if (!devices || devices.length === 0) {
      return "";
    }

    const rear = devices.find((device) => /back|rear|environment/i.test(device.label));
    return (rear || devices[0]).deviceId;
  }

  function buildDeviceLabel(device, index) {
    return device.label || `Camera ${index + 1}`;
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
    if (!track?.getCapabilities || !track.applyConstraints) {
      return;
    }

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

    if (advanced.length === 0) {
      return;
    }

    try {
      await track.applyConstraints({ advanced: advanced });
    } catch {
      // Device-dependent. Ignore if unsupported.
    }
  }

  function updateTorchUi(supported, enabled) {
    state.els.torchBtn.disabled = !supported || !state.isCameraRunning;
    state.els.torchBtn.textContent = enabled ? "Torch On" : "Torch Off";
    state.els.torchPill.textContent = supported
      ? `Torch: ${enabled ? "enabled" : "ready"}`
      : "Torch: unavailable";
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
    if (!state.track?.applyConstraints || !state.track.getCapabilities) {
      return;
    }

    const capabilities = state.track.getCapabilities();
    if (!capabilities.torch) {
      updateTorchUi(false, false);
      setStatus("Torch is not supported on this camera");
      return;
    }

    state.torchOn = !state.torchOn;

    try {
      await state.track.applyConstraints({
        advanced: [{ torch: state.torchOn }]
      });
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
    if (supportIssue) {
      throw new Error(supportIssue);
    }

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

    setStatus("Opening camera...");

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
    if (!detector) {
      return [];
    }

    try {
      return await detector.detect(canvas);
    } catch {
      return [];
    }
  }

  function renderHistory() {
    state.els.historyList.innerHTML = "";

    if (state.history.length === 0) {
      state.selectedHistoryIndex = -1;
      updateDeleteButton();
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
      article.textContent = item.detectedText;
      article.dataset.index = String(index);
      article.setAttribute("tabindex", "0");
      article.setAttribute("role", "button");
      article.setAttribute("aria-label", `Barcode record ${item.detectedText}`);
      state.els.historyList.appendChild(article);
    }

    updateDeleteButton();
  }

  function addHistoryItem(detectedText) {
    if (!detectedText) {
      return;
    }

    state.history.unshift({
      detectedText: detectedText
    });

    if (state.history.length > CONFIG.historyLimit) {
      state.history.length = CONFIG.historyLimit;
    }

    state.selectedHistoryIndex = 0;
    renderHistory();
  }

  async function captureAttempt() {
    if (!state.isCameraRunning || !state.track) {
      return false;
    }

    const canvas = drawSquareFrame();
    const detections = await readBarcodeFromCanvas(canvas);
    const detectedText = detections[0]?.rawValue || "";
    if (detectedText) {
      addHistoryItem(detectedText);
      setStatus(`Detected: ${detectedText}`);
      stopScanning(true);
      return true;
    }

    setStatus("Scanning... point the barcode inside the square");
    return false;
  }

  async function startScanning() {
    if (!state.isCameraRunning) {
      await startCamera(state.activeDeviceId);
    }

    if (state.isScanning) {
      return;
    }

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
        if (detected) {
          cleanupScanTimer();
        }
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
    if (!selectedId || selectedId === state.activeDeviceId) {
      return;
    }

    const shouldResumeScanning = state.isScanning;
    stopScanning();
    await startCamera(selectedId);

    if (shouldResumeScanning) {
      await startScanning();
    }
  }

  async function initDetectorStatus() {
    const detector = await createDetector();
    state.els.detectorPill.textContent = detector
      ? "Detector: BarcodeDetector ready"
      : "Detector: snapshots only on this browser";
  }

  function clearHistory() {
    state.history = [];
    state.selectedHistoryIndex = -1;
    renderHistory();
    setStatus("Recent attempt list cleared");
  }

  function selectHistoryItem(index) {
    if (index < 0 || index >= state.history.length) {
      return;
    }

    state.selectedHistoryIndex = index;
    renderHistory();
  }

  function deleteSelectedRecord() {
    if (state.selectedHistoryIndex < 0 || !state.history[state.selectedHistoryIndex]) {
      closeDeleteDialog();
      return;
    }

    state.history.splice(state.selectedHistoryIndex, 1);
    if (state.history.length === 0) {
      state.selectedHistoryIndex = -1;
    } else if (state.selectedHistoryIndex >= state.history.length) {
      state.selectedHistoryIndex = state.history.length - 1;
    }

    closeDeleteDialog();
    renderHistory();
    setStatus("Record deleted");
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

    state.els.clearHistoryBtn.addEventListener("click", clearHistory);
    state.els.deleteRecordBtn.addEventListener("click", openDeleteDialog);
    state.els.cancelDeleteBtn.addEventListener("click", closeDeleteDialog);
    state.els.confirmDeleteBtn.addEventListener("click", deleteSelectedRecord);
    state.els.settingsBtn.addEventListener("click", openSettingsDialog);
    state.els.closeSettingsBtn.addEventListener("click", closeSettingsDialog);
    state.els.saveSettingsBtn.addEventListener("click", saveSettings);

    state.els.historyList.addEventListener("click", function (event) {
      const record = event.target.closest(".history-item");
      if (!record) {
        return;
      }

      const index = Number(record.dataset.index);
      if (!Number.isNaN(index)) {
        selectHistoryItem(index);
      }
    });

    state.els.historyList.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const record = event.target.closest(".history-item");
      if (!record) {
        return;
      }

      event.preventDefault();
      const index = Number(record.dataset.index);
      if (!Number.isNaN(index)) {
        selectHistoryItem(index);
      }
    });

    state.els.deleteDialog.addEventListener("click", function (event) {
      if (event.target === state.els.deleteDialog) {
        closeDeleteDialog();
      }
    });

    state.els.settingsDialog.addEventListener("click", function (event) {
      if (event.target === state.els.settingsDialog) {
        closeSettingsDialog();
      }
    });

    window.addEventListener("beforeunload", function () {
      stopScanning();
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

    setPreviewActive(false);
    updateScanButton();
    updateModePill();
    renderHistory();
    fillSettingsForm(readSavedSettings());
    bindEvents();
    await initDetectorStatus();

    const supportIssue = getCameraSupportIssue();
    if (supportIssue) {
      setStatus(supportIssue);
      state.els.scanBtn.disabled = true;
      state.els.cameraSelect.disabled = true;
      state.els.torchBtn.disabled = true;
      return;
    }

    await refreshDevices();
    setStatus("Opening camera preview...");

    try {
      await startCamera(state.activeDeviceId);
    } catch (error) {
      setStatus(error.message || "Camera preview could not start automatically");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init().catch((error) => {
        if (state.els?.statusText) {
          setStatus(error.message || "The camera app could not start");
        }
      });
    });
  } else {
    init().catch((error) => {
      if (state.els?.statusText) {
        setStatus(error.message || "The camera app could not start");
      }
    });
  }
}());
