// script.js — Barcode/QR Scanner logic (html5-qrcode)
(function () {
  const resultText = document.getElementById("result-text");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");

  const statLatency = document.getElementById("statLatency");
  const statCount = document.getElementById("statCount");
  const statRate = document.getElementById("statRate");

  const fpsInput = document.getElementById("fps");
  const fpsVal = document.getElementById("fpsVal");
  const roiWidthInput = document.getElementById("roiWidth");
  const roiWidthVal = document.getElementById("roiWidthVal");
  const roiHeightInput = document.getElementById("roiHeight");
  const roiHeightVal = document.getElementById("roiHeightVal");
  const zoomInput = document.getElementById("zoom");
  const zoomVal = document.getElementById("zoomVal");
  const focusModeSelect = document.getElementById("focusMode");
  const cameraSelect = document.getElementById("cameraSelect");
  const resolutionSelect = document.getElementById("resolution");
  const actualResEl = document.getElementById("actualRes");
  const applyBtn = document.getElementById("applyBtn");
  const toggleScanBtn = document.getElementById("toggleScanBtn");
  const formatChipsEl = document.getElementById("formatChips");
  const stopOnCaptureEl = document.getElementById("stopOnCapture");
  const beepOnCaptureEl = document.getElementById("beepOnCapture");
  const verifyReadsEl = document.getElementById("verifyReads");
  const capturedListEl = document.getElementById("captured-list");
  const emptyDataEl = document.getElementById("empty-data");
  const clearDataBtn = document.getElementById("clearDataBtn");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const recordCounterEl = document.getElementById("recordCounter");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const lastScannedInput = document.getElementById("lastScannedInput");
  const searchBtn = document.getElementById("searchBtn");
  const cleanBtn = document.getElementById("cleanBtn");
  const qtyBox = document.getElementById("qtyBox");
  const modeSwitchBtn = document.getElementById("modeSwitchBtn");
  const numKeypad = document.getElementById("numKeypad");
  const keypadKeys = numKeypad.querySelectorAll(".key");

  // --- Settings persistence (localStorage) ---
  const SETTINGS_KEY = "barcodeScannerSettings_v1";

  function loadSavedSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        fps: fpsInput.value,
        roiWidth: roiWidthInput.value,
        roiHeight: roiHeightInput.value,
        zoom: zoomInput.value,
        focusMode: focusModeSelect.value,
        resolution: resolutionSelect.value,
        cameraDeviceId: cameraSelect.value,
        enabledFormats: Array.from(enabledFormats),
        stopOnCapture: stopOnCaptureEl.checked,
        beepOnCapture: beepOnCaptureEl.checked,
        verifyReads: verifyReadsEl.checked,
        scanMode: scanMode
      }));
    } catch (e) {
      // Storage full/unavailable — not critical, just skip persisting.
    }
  }

  const savedSettings = loadSavedSettings();

  const ALL_FORMATS = [
    { key: "QR_CODE", label: "QR" },
    { key: "EAN_13", label: "EAN-13" },
    { key: "EAN_8", label: "EAN-8" },
    { key: "CODE_128", label: "Code128" },
    { key: "UPC_A", label: "UPC-A" },
    { key: "UPC_E", label: "UPC-E" },
    { key: "CODE_39", label: "Code39" }
  ];
  const enabledFormats = new Set(
    (savedSettings && savedSettings.enabledFormats && savedSettings.enabledFormats.length)
      ? savedSettings.enabledFormats
      : ["EAN_13", "EAN_8", "CODE_128", "UPC_A"]
  );

  if (savedSettings) {
    if (savedSettings.fps) fpsInput.value = savedSettings.fps;
    if (savedSettings.roiWidth) roiWidthInput.value = savedSettings.roiWidth;
    if (savedSettings.roiHeight) roiHeightInput.value = savedSettings.roiHeight;
    if (savedSettings.zoom) zoomInput.value = savedSettings.zoom;
    if (savedSettings.focusMode) focusModeSelect.value = savedSettings.focusMode;
    if (savedSettings.resolution) resolutionSelect.value = savedSettings.resolution;
    if (typeof savedSettings.stopOnCapture === "boolean") stopOnCaptureEl.checked = savedSettings.stopOnCapture;
    if (typeof savedSettings.beepOnCapture === "boolean") beepOnCaptureEl.checked = savedSettings.beepOnCapture;
    if (typeof savedSettings.verifyReads === "boolean") verifyReadsEl.checked = savedSettings.verifyReads;
  }

  ALL_FORMATS.forEach(f => {
    const chip = document.createElement("div");
    chip.className = "chip" + (enabledFormats.has(f.key) ? " active" : "");
    chip.textContent = f.label;
    chip.dataset.key = f.key;
    chip.addEventListener("click", () => {
      if (enabledFormats.has(f.key)) {
        enabledFormats.delete(f.key);
        chip.classList.remove("active");
      } else {
        enabledFormats.add(f.key);
        chip.classList.add("active");
      }
      saveSettings();
    });
    formatChipsEl.appendChild(chip);
  });

  fpsInput.addEventListener("input", () => { fpsVal.textContent = fpsInput.value; saveSettings(); });
  roiWidthInput.addEventListener("input", () => { roiWidthVal.textContent = roiWidthInput.value; });
  roiHeightInput.addEventListener("input", () => { roiHeightVal.textContent = roiHeightInput.value; });
  zoomInput.addEventListener("input", () => zoomVal.textContent = parseFloat(zoomInput.value).toFixed(1) + "×");
  fpsVal.textContent = fpsInput.value;
  roiWidthVal.textContent = roiWidthInput.value;
  roiHeightVal.textContent = roiHeightInput.value;
  zoomVal.textContent = parseFloat(zoomInput.value).toFixed(1) + "×";

  focusModeSelect.addEventListener("change", saveSettings);
  stopOnCaptureEl.addEventListener("change", saveSettings);
  beepOnCaptureEl.addEventListener("change", saveSettings);
  verifyReadsEl.addEventListener("change", saveSettings);

  // ROI box is part of html5-qrcode's start() config, not a live video
  // constraint — so "real-time" here means: as soon as you release the
  // slider (change event), it restarts the scan with the new box size.
  // The camera itself doesn't drop, only the decode region changes.
  async function applyRoiChange() {
    saveSettings();
    if (!html5QrCode) return; // not started yet — new value takes effect on first start
    const ok = await startScanner();
    setScanningUI(ok);
  }
  roiWidthInput.addEventListener("change", applyRoiChange);
  roiHeightInput.addEventListener("change", applyRoiChange);

  zoomInput.addEventListener("change", async () => {
    saveSettings();
    // Live-apply zoom to the running track without a full restart, when possible.
    if (html5QrCode && typeof html5QrCode.applyVideoConstraints === "function") {
      try {
        await html5QrCode.applyVideoConstraints({
          advanced: [{ zoom: parseFloat(zoomInput.value) }]
        });
        log("Applied live zoom=" + zoomInput.value + "× (no restart)");
      } catch (err) {
        log("Live zoom apply failed, use Apply & Restart instead: " + err);
      }
    }
  });

  // --- Tabs ---
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanels.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // --- Scan mode: classic (qty=1, no keypad) vs quantity (keypad + confirm) ---
  let scanMode = (savedSettings && savedSettings.scanMode) ? savedSettings.scanMode : "classic";

  // --- Compact keypad: builds qtyBox's value digit by digit ---
  let pendingScan = null; // { text, format } — set when a scan is awaiting quantity confirmation

  function resetQtyBox() {
    qtyBox.value = "";
  }

  // Keypad + qty box are only usable once an actual scan is waiting to be
  // confirmed — not just because quantity mode is on, and not just because
  // scanning happens to be paused (e.g. right after switching modes).
  function updateKeypadInteractivity() {
    const usable = scanMode === "quantity" && pendingScan !== null;
    keypadKeys.forEach(k => { k.disabled = !usable; });
    qtyBox.disabled = !usable;
    if (!usable) resetQtyBox();
  }

  function applyModeUI() {
    const isQty = scanMode === "quantity";
    modeSwitchBtn.textContent = isQty ? "Mode: Quantity" : "Mode: Classic";
    numKeypad.style.display = isQty ? "block" : "none";
    updateKeypadInteractivity();
  }
  applyModeUI();

  modeSwitchBtn.addEventListener("click", () => {
    scanMode = (scanMode === "classic") ? "quantity" : "classic";
    pendingScan = null; // switching modes invalidates any unconfirmed scan
    applyModeUI();
    log("Scan mode: " + scanMode);
    saveSettings();
  });

  keypadKeys.forEach(key => {
    key.addEventListener("click", () => {
      const k = key.dataset.key;
      if (k === "back") {
        qtyBox.value = qtyBox.value.slice(0, -1);
      } else if (k === "add") {
        if (!pendingScan) {
          log("No scan waiting to confirm.");
          return;
        }
        const qty = Math.max(1, parseInt(qtyBox.value, 10) || 1);
        addCapturedBarcode(pendingScan.text, pendingScan.format, qty);
        pendingScan = null;
        resetQtyBox();
        statusEl.textContent = "Added — resuming…";
        resumeScanning().then(ok => setScanningUI(ok));
      } else {
        // digit key — appends naturally since the box starts empty
        qtyBox.value = (qtyBox.value + k).slice(0, 6); // reasonable cap
      }
    });
  });

  // --- Search / Clean (row 1) ---
  searchBtn.addEventListener("click", () => {
    const query = lastScannedInput.value.trim();
    if (!query) return;
    const match = capturedBarcodes.find(item => item.text === query)
      || capturedBarcodes.find(item => item.text.toLowerCase().includes(query.toLowerCase()));
    if (match) {
      selectedBarcodeId = match.id;
      renderCapturedList();
      const el = capturedListEl.querySelector(`[data-id="${match.id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      log("Search: found match for \"" + query + "\".");
    } else {
      log("Search: no match found for \"" + query + "\".");
      statusEl.textContent = "No match found in list.";
    }
  });

  cleanBtn.addEventListener("click", () => {
    lastScannedInput.value = "";
  });

  // --- Captured barcode list (newest first) ---
  let capturedBarcodes = [];
  let nextBarcodeId = 1;
  let selectedBarcodeId = null;

  function renderCapturedList() {
    recordCounterEl.textContent = "(" + capturedBarcodes.length + ")";
    if (capturedBarcodes.length === 0) {
      emptyDataEl.style.display = "block";
      capturedListEl.innerHTML = "";
      deleteSelectedBtn.disabled = true;
      return;
    }
    emptyDataEl.style.display = "none";
    capturedListEl.innerHTML = capturedBarcodes.map(item => `
      <div class="captured-item${item.id === selectedBarcodeId ? " selected" : ""}" data-id="${item.id}">
        <div class="code">${escapeHtml(item.text)} <span style="color:#4caf50;">×${item.qty}</span></div>
        <div class="meta"><span>${item.format}</span><span>${item.time}</span></div>
      </div>
    `).join("");

    capturedListEl.querySelectorAll(".captured-item").forEach(el => {
      el.addEventListener("click", () => {
        const id = Number(el.dataset.id);
        selectedBarcodeId = (selectedBarcodeId === id) ? null : id;
        renderCapturedList();
      });
    });

    deleteSelectedBtn.disabled = (selectedBarcodeId === null);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addCapturedBarcode(text, format, qty) {
    capturedBarcodes.unshift({
      id: nextBarcodeId++,
      text: text,
      format: format || "—",
      qty: qty || 1,
      time: new Date().toLocaleTimeString()
    });
    renderCapturedList();
  }

  clearDataBtn.addEventListener("click", () => {
    capturedBarcodes = [];
    selectedBarcodeId = null;
    renderCapturedList();
  });

  deleteSelectedBtn.addEventListener("click", () => {
    if (selectedBarcodeId === null) return;
    capturedBarcodes = capturedBarcodes.filter(item => item.id !== selectedBarcodeId);
    selectedBarcodeId = null;
    renderCapturedList();
  });

  renderCapturedList();

  // --- Beep sound (Web Audio API, no external asset needed) ---
  let audioCtx = null;
  function playBeep() {
    if (!beepOnCaptureEl.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (err) {
      log("Beep failed: " + err);
    }
  }

  function log(msg) {
    const line = document.createElement("div");
    line.textContent = new Date().toLocaleTimeString() + " — " + msg;
    logEl.prepend(line);
  }

  let html5QrCode = null;
  let scanTimestamps = [];
  let scanCount = 0;
  let lastCode = null;
  let lastCodeTime = 0;
  let lastFrameSeenAt = performance.now();

  function resetStats() {
    scanTimestamps = [];
    scanCount = 0;
    statCount.textContent = "0";
    statRate.textContent = "–";
    statLatency.textContent = "–";
  }

  let isStoppingAfterCapture = false;
  let isScanning = false;

  function setScanningUI(scanning) {
    isScanning = scanning;
    if (scanning) pendingScan = null; // a fresh scanning session shouldn't carry over a stale pending item
    toggleScanBtn.disabled = false;
    toggleScanBtn.textContent = scanning ? "Pause Scan" : (html5QrCode ? "Resume Scan" : "Start Scan");
    toggleScanBtn.classList.toggle("state-start", !scanning);
    toggleScanBtn.classList.toggle("state-stop", scanning);
    updateKeypadInteractivity();
  }

  // --- Checksum validation for numeric retail barcodes ---
  // A garbled/blurry read (classic symptom: first digit wrong) will almost
  // always fail its own check digit — this catches that before it's accepted.
  function digitsOf(str) {
    return str.split("").map(Number);
  }

  function validEAN13(text) {
    if (!/^\d{13}$/.test(text)) return true; // not this format's shape, don't block
    const d = digitsOf(text);
    const check = d.pop();
    let sum = 0;
    d.forEach((n, i) => sum += n * (i % 2 === 0 ? 1 : 3));
    return ((10 - (sum % 10)) % 10) === check;
  }

  function validEAN8(text) {
    if (!/^\d{8}$/.test(text)) return true;
    const d = digitsOf(text);
    const check = d.pop();
    let sum = 0;
    d.forEach((n, i) => sum += n * (i % 2 === 0 ? 3 : 1));
    return ((10 - (sum % 10)) % 10) === check;
  }

  function validUPCA(text) {
    if (!/^\d{12}$/.test(text)) return true;
    const d = digitsOf(text);
    const check = d.pop();
    let sum = 0;
    d.forEach((n, i) => sum += n * (i % 2 === 0 ? 3 : 1));
    return ((10 - (sum % 10)) % 10) === check;
  }

  function passesChecksum(text, formatName) {
    if (formatName === "EAN_13") return validEAN13(text);
    if (formatName === "EAN_8") return validEAN8(text);
    if (formatName === "UPC_A") return validUPCA(text);
    return true; // QR/Code128/etc. — no simple universal check digit, skip
  }

  // --- Double-read confirmation: require the same value twice in a row
  // before accepting, to filter one-off misreads from blur/glare/angle. ---
  let pendingConfirmText = null;
  let pendingConfirmTime = 0;
  const CONFIRM_WINDOW_MS = 700;

  function onScanSuccess(decodedText, decodedResult) {
    const formatNameEarly = (decodedResult && decodedResult.result && decodedResult.result.format
      && decodedResult.result.format.formatName) || "";

    // Gate 1: checksum. Reject silently and keep scanning — this is the
    // classic "first digit wrong" symptom, caught before it ever reaches you.
    if (verifyReadsEl.checked && !passesChecksum(decodedText, formatNameEarly)) {
      log("Rejected (checksum failed): " + decodedText);
      return;
    }

    // Gate 2: require the same value on two consecutive frames.
    if (verifyReadsEl.checked) {
      const nowConfirm = Date.now();
      const isRepeatConfirm = (decodedText === pendingConfirmText)
        && (nowConfirm - pendingConfirmTime < CONFIRM_WINDOW_MS);
      if (!isRepeatConfirm) {
        pendingConfirmText = decodedText;
        pendingConfirmTime = nowConfirm;
        return; // wait for the next frame to confirm before accepting
      }
      // Confirmed — clear pending state and fall through to normal handling.
      pendingConfirmText = null;
    }

    const now = performance.now();
    const gapMs = now - lastFrameSeenAt;
    lastFrameSeenAt = now;

    const wallNow = Date.now();
    if (decodedText === lastCode && wallNow - lastCodeTime < 1200) {
      return; // debounce duplicate reads of the same code
    }
    lastCode = decodedText;
    lastCodeTime = wallNow;

    scanCount++;
    scanTimestamps.push(now);
    scanTimestamps = scanTimestamps.filter(t => now - t <= 5000);

    statCount.textContent = String(scanCount);
    statLatency.textContent = gapMs.toFixed(0);
    statRate.textContent = (scanTimestamps.length / 5).toFixed(2);

    resultText.textContent = decodedText;
    lastScannedInput.value = decodedText;

    const formatName = formatNameEarly;

    if (navigator.vibrate) navigator.vibrate(60);
    playBeep();
    log("Scan #" + scanCount + ": " + decodedText + " (Δ" + gapMs.toFixed(0) + "ms) mode=" + scanMode);

    if (scanMode === "quantity") {
      // Quantity mode always pauses so the keypad can be used to set a
      // quantity — the barcode isn't added to the list until "Add ✓" is
      // tapped. Preview stays live (pause, not stop).
      if (!isStoppingAfterCapture) {
        isStoppingAfterCapture = true;
        pendingScan = { text: decodedText, format: formatName };
        statusEl.textContent = "Captured — enter quantity on keypad, then tap Add ✓.";
        pauseScanning().then(() => {
          setScanningUI(false);
          isStoppingAfterCapture = false;
        });
      }
      return;
    }

    // Classic mode: add immediately with quantity 1.
    addCapturedBarcode(decodedText, formatName, 1);

    if (stopOnCaptureEl.checked && !isStoppingAfterCapture) {
      isStoppingAfterCapture = true;
      statusEl.textContent = "Captured — decoding paused (preview stays on).";
      pauseScanning().then(() => {
        setScanningUI(false);
        isStoppingAfterCapture = false;
      });
    }
  }

  function onScanFailure() { /* expected most frames */ }

  function currentFormats() {
    return Array.from(enabledFormats).map(k => Html5QrcodeSupportedFormats[k]);
  }

  function buildVideoConstraints(source) {
    // Full MediaTrackConstraints, passed via `videoConstraints` in the scan
    // config (NOT as cameraIdOrConfig — that param must have exactly 1 key).
    const advanced = [];
    const fm = focusModeSelect.value;
    if (fm !== "none") advanced.push({ focusMode: fm });
    advanced.push({ zoom: parseFloat(zoomInput.value) });

    const [resW, resH] = resolutionSelect.value.split("x").map(Number);

    const constraints = {
      width: { ideal: resW },
      height: { ideal: resH },
      advanced: advanced
    };

    if (source && source.deviceId) {
      constraints.deviceId = { exact: source.deviceId };
    } else {
      constraints.facingMode = source; // e.g. "environment" or { exact: "environment" }
    }
    return constraints;
  }

  function simpleCameraIdOrConfig(source) {
    // html5-qrcode requires this first-arg object to have exactly ONE key.
    if (source && source.deviceId) {
      return { deviceId: { exact: source.deviceId } };
    }
    return { facingMode: source };
  }

  // Applies resolution/zoom/focus to an ALREADY-live track via the browser's
  // applyConstraints — no re-negotiation of the camera, no new permission
  // prompt, no visible interruption. This runs in the background right after
  // the fast/lean start succeeds, so the heavy constraint set never blocks
  // the preview from appearing.
  async function refineVideoConstraints() {
    if (!html5QrCode || typeof html5QrCode.applyVideoConstraints !== "function") return;
    const selectedDeviceId = cameraSelect.value;
    const source = selectedDeviceId ? { deviceId: selectedDeviceId } : "environment";
    const constraints = buildVideoConstraints(source);
    // The track is already on the right device — re-asserting deviceId/
    // facingMode here is redundant and can only slow this step down.
    delete constraints.deviceId;
    delete constraints.facingMode;
    try {
      await html5QrCode.applyVideoConstraints(constraints);
      log("Refined stream: resolution/zoom/focus applied to the live track.");
      reportActualResolution();
    } catch (err) {
      log("Could not refine resolution/zoom/focus after start (camera still usable at default res): " + err);
    }
  }

  async function loadCameras() {
    try {
      // Use the low-level browser API directly instead of Html5Qrcode.getCameras().
      // getCameras() can trigger its own getUserMedia() call to check permissions,
      // which conflicts with the stream we already have open and silently fails
      // on many mobile browsers. enumerateDevices() just lists what's already
      // permitted — no second camera grab, no conflict.
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const devices = allDevices
        .filter(d => d.kind === "videoinput")
        .map(d => ({ id: d.deviceId, label: d.label }));

      cameraSelect.innerHTML = "";

      const autoOpt = document.createElement("option");
      autoOpt.value = "";
      autoOpt.textContent = "Auto (rear camera)";
      cameraSelect.appendChild(autoOpt);

      if (devices.length === 0) {
        log("enumerateDevices() returned 0 video inputs — permission may not be fully granted yet.");
      }

      devices.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.label || ("Camera " + (i + 1));
        cameraSelect.appendChild(opt);
        log("Camera " + i + ": " + (d.label || "(no label — try reloading after granting permission)") + " [id=" + d.id.slice(0, 12) + "…]");
      });

      log("Found " + devices.length + " camera(s) total.");

      // Restore a previously-saved camera choice now that real options exist.
      if (savedSettings && savedSettings.cameraDeviceId) {
        const matches = Array.from(cameraSelect.options).some(o => o.value === savedSettings.cameraDeviceId);
        if (matches && cameraSelect.value !== savedSettings.cameraDeviceId) {
          cameraSelect.value = savedSettings.cameraDeviceId;
          log("Restoring saved camera selection.");
          const ok = await startScanner();
          setScanningUI(ok);
        }
      }
    } catch (err) {
      cameraSelect.innerHTML = "<option value=''>Auto (rear camera)</option>";
      log("Could not list cameras: " + err);
    }
  }

  cameraSelect.addEventListener("change", async () => {
    saveSettings();
    const ok = await startScanner();
    setScanningUI(ok);
  });

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label + " timed out after " + (ms / 1000) + "s — camera likely blocked or waiting on a permission prompt.")), ms)
      )
    ]);
  }

  async function stopIfRunning() {
    if (html5QrCode) {
      try {
        const state = html5QrCode.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await html5QrCode.stop();
        }
        html5QrCode.clear();
      } catch (e) { /* ignore */ }
    }
  }

  function canPauseResume() {
    return html5QrCode
      && typeof html5QrCode.pause === "function"
      && typeof html5QrCode.resume === "function"
      && html5QrCode.getState
      && (html5QrCode.getState() === Html5QrcodeScannerState.SCANNING
          || html5QrCode.getState() === Html5QrcodeScannerState.PAUSED);
  }

  // Pauses decoding but keeps the camera feed visible on screen — used
  // whenever we stop "scanning" but the user hasn't explicitly left the app,
  // so the preview never goes dark unless the camera was never started.
  async function pauseScanning() {
    if (canPauseResume()) {
      try {
        html5QrCode.pause(false); // false = keep video rendering, just halt decode
        log("Paused decoding (preview stays live).");
        return true;
      } catch (err) {
        log("Pause failed, falling back to full stop: " + err);
      }
    }
    await stopIfRunning();
    return false;
  }

  async function resumeScanning() {
    if (canPauseResume() && html5QrCode.getState() === Html5QrcodeScannerState.PAUSED) {
      try {
        html5QrCode.resume();
        log("Resumed decoding.");
        return true;
      } catch (err) {
        log("Resume failed, restarting camera fully: " + err);
      }
    }
    return await startScanner();
  }

  async function startScanner() {
    await stopIfRunning();
    resetStats();
    lastCode = null;

    const formats = currentFormats();
    if (formats.length === 0) {
      statusEl.textContent = "Select at least one format above.";
      return false;
    }

    html5QrCode = new Html5Qrcode("reader", {
      formatsToSupport: formats,
      verbose: false
    });

    const scanConfig = {
      fps: parseInt(fpsInput.value, 10),
      qrbox: { width: parseInt(roiWidthInput.value, 10), height: parseInt(roiHeightInput.value, 10) },
      aspectRatio: 1.0,
      formatsToSupport: formats,
      experimentalFeatures: { useBarCodeDetectorIfSupported: false }
    };

    const selectedDeviceId = cameraSelect.value; // "" means "Auto (rear camera)"
    // Non-exact "environment" negotiates faster and almost never throws
    // OverconstrainedError (unlike { exact: "environment" }), so the slow
    // fallback chain below is rarely even reached anymore.
    const source = selectedDeviceId ? { deviceId: selectedDeviceId } : "environment";

    statusEl.textContent = "Starting camera…";

    // FAST PATH: request just the camera itself first — no resolution, no
    // advanced zoom/focus. A bare-minimum constraint set negotiates far
    // faster than a combined one. Resolution/zoom/focus get layered on
    // AFTER the stream is already live, via applyVideoConstraints — the
    // preview appears almost immediately instead of waiting on the full
    // negotiation.
    try {
      await withTimeout(
        html5QrCode.start(
          simpleCameraIdOrConfig(source),
          scanConfig,
          onScanSuccess,
          onScanFailure
        ),
        10000,
        "Camera start"
      );
      statusEl.textContent = (selectedDeviceId ? "Scanning on selected camera… " : "Scanning… ")
        + "(fps=" + scanConfig.fps + ", roi=" + roiWidthInput.value + "×" + roiHeightInput.value + "px)";
      log("Fast-started: " + (selectedDeviceId ? "deviceId=" + selectedDeviceId : "facingMode=environment")
        + " fps=" + scanConfig.fps + " roi=" + roiWidthInput.value + "x" + roiHeightInput.value
        + " formats=" + Array.from(enabledFormats).join(","));
      reportActualResolution();
      refineVideoConstraints(); // upgrade resolution/zoom/focus in the background, non-blocking

      if (!cameraSelect.dataset.loaded) {
        cameraSelect.dataset.loaded = "1";
        loadCameras();
      }
      return true;
    } catch (err) {
      log("Primary start failed (" + err + "), retrying with reduced constraints…");

      let recovered = false;

      // Step 2: if a specific camera was picked, retry THAT exact camera
      // with a minimal constraint set (no advanced zoom/focus, no forced
      // resolution) before ever giving up on the user's chosen device.
      if (selectedDeviceId) {
        try {
          const minimalConfig = {
            fps: scanConfig.fps,
            qrbox: scanConfig.qrbox,
            formatsToSupport: formats,
            experimentalFeatures: { useBarCodeDetectorIfSupported: false }
          };
          await withTimeout(
            html5QrCode.start(
              { deviceId: { exact: selectedDeviceId } },
              minimalConfig,
              onScanSuccess,
              onScanFailure
            ),
            10000,
            "Reduced-constraint start"
          );
          statusEl.textContent = "Scanning on selected camera (reduced constraints)…";
          log("Recovered on selected camera with minimal constraints (resolution/zoom/focus not forced).");
          recovered = true;
        } catch (err2) {
          log("Selected camera still failed (" + err2 + "), falling back to auto camera.");
        }
      }

      // Step 3: last resort — generic rear-facing camera, only reached if
      // no device was selected, or the selected device truly can't start.
      if (!recovered) {
        try {
          const fallbackSource = "environment";
          scanConfig.videoConstraints = buildVideoConstraints(fallbackSource);
          await withTimeout(
            html5QrCode.start(
              simpleCameraIdOrConfig(fallbackSource),
              scanConfig,
              onScanSuccess,
              onScanFailure
            ),
            10000,
            "Fallback camera start"
          );
          statusEl.textContent = "Scanning (fallback facingMode — your camera pick could not start)…";
          recovered = true;
        } catch (err3) {
          statusEl.textContent = "Camera error: " + err3.message || String(err3);
          log("Camera error: " + err3);
        }
      }

      reportActualResolution();

      if (recovered && !cameraSelect.dataset.loaded) {
        cameraSelect.dataset.loaded = "1";
        loadCameras();
      }
      return recovered;
    }
  }

  function reportActualResolution() {
    // `ideal` in getUserMedia constraints is a request, not a guarantee —
    // this reads back what the browser/camera actually negotiated.
    try {
      if (!html5QrCode) return;
      const caps = html5QrCode.getRunningTrackSettings
        ? html5QrCode.getRunningTrackSettings()
        : null;
      if (caps && caps.width && caps.height) {
        actualResEl.textContent = caps.width + " × " + caps.height;
        const idNote = caps.deviceId ? (" [deviceId=" + caps.deviceId.slice(0, 12) + "…]") : "";
        const matchNote = (cameraSelect.value && caps.deviceId)
          ? (caps.deviceId === cameraSelect.value ? " ✓ matches selection" : " ⚠ DIFFERENT camera than selected")
          : "";
        log("Actual camera feed: " + caps.width + "×" + caps.height
          + (caps.zoom ? " (zoom=" + caps.zoom + "×)" : "") + idNote + matchNote);
      } else {
        actualResEl.textContent = "unavailable";
      }
    } catch (err) {
      actualResEl.textContent = "unavailable";
    }
  }

  resolutionSelect.addEventListener("change", async () => {
    saveSettings();
    const ok = await startScanner();
    setScanningUI(ok);
  });

  applyBtn.addEventListener("click", async () => {
    saveSettings();
    const ok = await startScanner();
    setScanningUI(ok);
  });

  window.addEventListener("beforeunload", () => {
    if (html5QrCode) html5QrCode.stop().catch(() => {});
  });

  toggleScanBtn.addEventListener("click", async () => {
    toggleScanBtn.disabled = true;
    if (isScanning) {
      toggleScanBtn.textContent = "Pausing…";
      await pauseScanning();
      setScanningUI(false);
      statusEl.textContent = "Paused — preview stays on.";
    } else {
      toggleScanBtn.textContent = html5QrCode ? "Resuming…" : "Starting…";
      const ok = await resumeScanning();
      setScanningUI(ok);
      if (!ok) toggleScanBtn.textContent = "Retry Start Scan";
    }
  });

  // Auto-start immediately so the preview appears as fast as possible.
  // (The earlier "wait for a tap" approach was a precaution against a
  // suspected autoplay-gesture hang — the actual cause of that turned out
  // to be an unrelated truncated-file bug. The 10s timeout + retry-chain
  // in startScanner() already guards against a genuine hang, so it's safe
  // to fire immediately here; if it ever fails, the button still offers
  // "Retry Start Scan".)
  toggleScanBtn.textContent = "Starting…";
  toggleScanBtn.disabled = true;
  statusEl.textContent = "Starting camera…";
  startScanner().then(ok => {
    setScanningUI(ok);
    if (!ok) toggleScanBtn.textContent = "Retry Start Scan";
  });
})();