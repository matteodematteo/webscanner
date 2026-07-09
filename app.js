// script.js — Barcode/QR Scanner logic (html5-qrcode)
(function () {
  const resultText = document.getElementById("result-text");
  const resultLabel = document.getElementById("result-label");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");

  const statLatency = document.getElementById("statLatency");
  const statCount = document.getElementById("statCount");
  const statRate = document.getElementById("statRate");

  const fpsInput = document.getElementById("fps");
  const fpsVal = document.getElementById("fpsVal");
  const qrboxInput = document.getElementById("qrbox");
  const qrboxVal = document.getElementById("qrboxVal");
  const zoomInput = document.getElementById("zoom");
  const zoomVal = document.getElementById("zoomVal");
  const focusModeSelect = document.getElementById("focusMode");
  const cameraSelect = document.getElementById("cameraSelect");
  const applyBtn = document.getElementById("applyBtn");
  const formatChipsEl = document.getElementById("formatChips");

  const ALL_FORMATS = [
    { key: "QR_CODE", label: "QR" },
    { key: "EAN_13", label: "EAN-13" },
    { key: "EAN_8", label: "EAN-8" },
    { key: "CODE_128", label: "Code128" },
    { key: "UPC_A", label: "UPC-A" },
    { key: "UPC_E", label: "UPC-E" },
    { key: "CODE_39", label: "Code39" }
  ];
  const enabledFormats = new Set(["EAN_13", "EAN_8", "CODE_128", "UPC_A"]);

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
    });
    formatChipsEl.appendChild(chip);
  });

  fpsInput.addEventListener("input", () => fpsVal.textContent = fpsInput.value);
  qrboxInput.addEventListener("input", () => qrboxVal.textContent = qrboxInput.value);
  zoomInput.addEventListener("input", () => zoomVal.textContent = parseFloat(zoomInput.value).toFixed(1) + "×");

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

  function onScanSuccess(decodedText) {
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

    resultLabel.style.display = "block";
    resultText.textContent = decodedText;
    if (navigator.vibrate) navigator.vibrate(60);
    log("Scan #" + scanCount + ": " + decodedText + " (Δ" + gapMs.toFixed(0) + "ms)");
  }

  function onScanFailure() { /* expected most frames */ }

  function currentFormats() {
    return Array.from(enabledFormats).map(k => Html5QrcodeSupportedFormats[k]);
  }

  function buildVideoConstraints(source) {
    // `source` is either { deviceId: "..." } to pin an exact camera,
    // or a facingMode value (string or { exact: "environment" }) as fallback.
    const advanced = [];
    const fm = focusModeSelect.value;
    if (fm !== "none") advanced.push({ focusMode: fm });
    advanced.push({ zoom: parseFloat(zoomInput.value) });

    const base = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      advanced: advanced
    };

    if (source && source.deviceId) {
      base.deviceId = { exact: source.deviceId };
    } else {
      base.facingMode = source;
    }
    return base;
  }

  async function loadCameras() {
    try {
      const devices = await Html5Qrcode.getCameras();
      cameraSelect.innerHTML = "";

      const autoOpt = document.createElement("option");
      autoOpt.value = "";
      autoOpt.textContent = "Auto (rear camera)";
      cameraSelect.appendChild(autoOpt);

      devices.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.label || ("Camera " + (i + 1));
        cameraSelect.appendChild(opt);
      });

      // Try to default-select a rear/back camera if the label hints at it
      const rearGuess = devices.find(d => /back|rear|environment/i.test(d.label));
      if (rearGuess) cameraSelect.value = rearGuess.id;

      log("Found " + devices.length + " camera(s).");
    } catch (err) {
      cameraSelect.innerHTML = "<option value=''>Auto (rear camera)</option>";
      log("Could not list cameras (permission needed first): " + err);
    }
  }

  cameraSelect.addEventListener("change", startScanner);

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

  async function startScanner() {
    await stopIfRunning();
    resetStats();
    lastCode = null;

    const formats = currentFormats();
    if (formats.length === 0) {
      statusEl.textContent = "Select at least one format above.";
      return;
    }

    html5QrCode = new Html5Qrcode("reader", {
      formatsToSupport: formats,
      verbose: false
    });

    const scanConfig = {
      fps: parseInt(fpsInput.value, 10),
      qrbox: { width: parseInt(qrboxInput.value, 10), height: parseInt(qrboxInput.value, 10) },
      aspectRatio: 1.0,
      formatsToSupport: formats,
      experimentalFeatures: { useBarCodeDetectorIfSupported: false }
    };

    statusEl.textContent = "Starting camera…";

    const selectedDeviceId = cameraSelect.value; // "" means "Auto (rear camera)"

    try {
      if (selectedDeviceId) {
        // User explicitly picked a camera from the list — use it directly.
        await html5QrCode.start(
          buildVideoConstraints({ deviceId: selectedDeviceId }),
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
        statusEl.textContent = "Scanning on selected camera… (fps=" + scanConfig.fps + ", roi=" + qrboxInput.value + "px, zoom=" + zoomInput.value + "×, focus=" + focusModeSelect.value + ")";
        log("Started with deviceId=" + selectedDeviceId);
      } else {
        // Auto mode: prefer exact rear camera, fall back to non-exact.
        await html5QrCode.start(
          buildVideoConstraints({ exact: "environment" }),
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
        statusEl.textContent = "Scanning… (fps=" + scanConfig.fps + ", roi=" + qrboxInput.value + "px, zoom=" + zoomInput.value + "×, focus=" + focusModeSelect.value + ")";
        log("Started: fps=" + scanConfig.fps + " roi=" + qrboxInput.value + " zoom=" + zoomInput.value + " focus=" + focusModeSelect.value + " formats=" + Array.from(enabledFormats).join(","));
      }
    } catch (err) {
      log("Primary camera start failed, falling back: " + err);
      try {
        await html5QrCode.start(
          buildVideoConstraints("environment"),
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
        statusEl.textContent = "Scanning (fallback facingMode)…";
      } catch (err2) {
        statusEl.textContent = "Camera error: " + err2;
        log("Camera error: " + err2);
      }
    }

    // Populate/refresh the camera list now that permission has been granted
    // and device labels are available (labels are blank pre-permission).
    if (!cameraSelect.dataset.loaded) {
      cameraSelect.dataset.loaded = "1";
      loadCameras();
    }
  }

  applyBtn.addEventListener("click", startScanner);

  window.addEventListener("beforeunload", () => {
    if (html5QrCode) html5QrCode.stop().catch(() => {});
  });

  // Initial start with defaults
  startScanner();
})();
