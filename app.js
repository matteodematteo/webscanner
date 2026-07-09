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
  const resolutionSelect = document.getElementById("resolution");
  const actualResEl = document.getElementById("actualRes");
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
  zoomVal.textContent = parseFloat(zoomInput.value).toFixed(1) + "×";

  zoomInput.addEventListener("change", async () => {
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
        log("Camera " + i + ": " + (d.label || "(no label)") + " [id=" + d.id.slice(0, 12) + "…]");
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

    const selectedDeviceId = cameraSelect.value; // "" means "Auto (rear camera)"
    const source = selectedDeviceId ? { deviceId: selectedDeviceId } : { exact: "environment" };

    scanConfig.videoConstraints = buildVideoConstraints(source);

    statusEl.textContent = "Starting camera…";

    try {
      await html5QrCode.start(
        simpleCameraIdOrConfig(source),
        scanConfig,
        onScanSuccess,
        onScanFailure
      );
      statusEl.textContent = (selectedDeviceId ? "Scanning on selected camera… " : "Scanning… ")
        + "(fps=" + scanConfig.fps + ", roi=" + qrboxInput.value + "px, zoom=" + zoomInput.value + "×, focus=" + focusModeSelect.value + ")";
      log("Started: " + (selectedDeviceId ? "deviceId=" + selectedDeviceId : "facingMode=environment")
        + " fps=" + scanConfig.fps + " roi=" + qrboxInput.value + " zoom=" + zoomInput.value
        + " focus=" + focusModeSelect.value + " formats=" + Array.from(enabledFormats).join(","));
      reportActualResolution();
    } catch (err) {
      log("Primary camera start failed, falling back: " + err);
      try {
        // Fallback: plain "environment" facing mode, still via videoConstraints.
        const fallbackSource = "environment";
        scanConfig.videoConstraints = buildVideoConstraints(fallbackSource);
        await html5QrCode.start(
          simpleCameraIdOrConfig(fallbackSource),
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
        statusEl.textContent = "Scanning (fallback facingMode)…";
        reportActualResolution();
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
        log("Actual camera feed: " + caps.width + "×" + caps.height
          + (caps.zoom ? " (zoom=" + caps.zoom + "×)" : ""));
      } else {
        actualResEl.textContent = "unavailable";
      }
    } catch (err) {
      actualResEl.textContent = "unavailable";
    }
  }

  resolutionSelect.addEventListener("change", startScanner);

  applyBtn.addEventListener("click", startScanner);

  window.addEventListener("beforeunload", () => {
    if (html5QrCode) html5QrCode.stop().catch(() => {});
  });

  // Initial start with defaults
  startScanner();
})();
