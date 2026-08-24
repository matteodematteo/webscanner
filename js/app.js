"use strict";

/* Application bootstrap — offline-safe, fast start */

async function init() {
  state.els = queryElements();
  requireElements(state.els);
  state.isIOS = isIOSDevice();
  state.isMobileUi = detectMobileUi();
  state.captureContext = state.els.captureCanvas?.getContext("2d", { alpha: false }) || null;
  cacheResultFieldElements();

  // ── Optimization #4: Parallelize independent localStorage reads ───────────
  // All storage reads that don't depend on each other are kicked off together
  // so the JS engine can interleave them instead of serialising every read.
  // loginAndRefreshCookie still runs *after* because it needs savedSettings.
  const [savedSettings, scrollLockState] = await Promise.all([
    Promise.resolve().then(readSavedSettings),
    Promise.resolve().then(loadScrollLockState)
  ]);

  // These three reads are synchronous but cheap; run them alongside the
  // parallel block above so they're logically grouped.
  loadCookieState();
  loadHistoryState();

  fillSettingsForm(savedSettings);
  applyDisplayMode();
  // This is the value we just loaded from storage, so applying it here is
  // never a change — skip the redundant settings read + write that would
  // otherwise happen on every single init.
  setQuantityEntryMode(savedSettings.quantityEntryUnlocked, {
    skipPersistIfUnchanged: true,
    baseSettings: savedSettings
  });
  clearResultFields();
  renderHistory();
  bindEvents();

  state.roi = { width: 0.8, height: 0.8 };

  // Secondary visual setup (ROI drag handle, product-info slider dots) isn't
  // needed for the app to be usable — the ROI box and slider already render
  // correctly from CSS/markup defaults. Push it past the browser's first
  // paint / idle point so it doesn't compete with getting the scan button
  // interactive.
  scheduleIdleWork(function () {
    if (typeof applyRoiBoxStyle === "function") {
      try { applyRoiBoxStyle(); } catch (e) {}
    }
    // Keep resize if present (older camera.js); ignore if removed.
    if (typeof loadRoiState === "function") {
      try { loadRoiState(); } catch (e) {}
    }
    if (typeof initRoiResize === "function") {
      try { initRoiResize(); } catch (e) {}
    }
    initProductInfoSlider();
  });

  // ── Optimization #7: Reduce scanner warm-up delay from 2-3s → 500ms ──────
  // Warm the (large, ~375KB) scanner decoding library in the background once
  // the browser is idle, so it's already loaded by the time the user taps
  // "Start Scanning" — without delaying first paint or competing with the
  // app shell's own scripts for bandwidth on slow connections. This never
  // blocks init: startScanning() will lazily trigger the same load itself
  // if the user scans before this fires.
  scheduleIdleWork(function () {
    if (typeof window.ensureHtml5QrLoaded === "function") {
      window.ensureHtml5QrLoaded().catch(function () {});
    }
  }, 500);

  state.inputMode = loadInputMode();
  document.body.classList.toggle("mode-scanner", state.inputMode === "scanner");
  state.els.barcodeInput.inputMode = state.inputMode === "scanner" ? "none" : "numeric";
  updateInputModeSwitchUi();

  // ── Use the already-loaded scrollLockState (Optimization #4) ─────────────
  state.manualScrollLocked = scrollLockState.isLocked;
  state.manualScrollLockY = scrollLockState.position;
  updateLockScreenScrollButton();
  if (state.manualScrollLocked && state.manualScrollLockY) {
    window.setTimeout(function () {
      document.body.style.top = `-${state.manualScrollLockY}px`;
      document.body.classList.add("is-scroll-locked");
    }, 80);
  }

  // Cookie refresh never blocks camera.
  loginAndRefreshCookie(savedSettings).catch(function (error) {
    const message = error.message || "Cookie refresh failed.";
    saveCookieState(state.authCookie || "", `Cookie refresh failed: ${message}`);
  });

  if (state.inputMode === "scanner") {
    setStatus("Scanner mode: use an external scanner");
    moveFocusToInput(state.els.barcodeInput);
    return;
  }

  // Only disable for real hardware limits — NOT for network / library.
  const hardwareIssue = getCameraHardwareIssue();
  if (hardwareIssue) {
    setStatus(hardwareIssue);
    state.els.scanBtn.disabled = true;
    state.els.cameraSelect.disabled = true;
    state.els.torchBtn.disabled = true;
    return;
  }

  // Always keep Start Scanning enabled offline.
  state.els.scanBtn.disabled = false;
  setStatus("Ready — tap Start Scanning");
  setPreviewActive(false);

  // ── Optimization #5: Defer camera enumeration when a saved ID exists ──────
  // enumerateDevices() can take 30-80 ms. If we already have a saved camera
  // ID, skip the synchronous call and schedule enumeration in idle time so
  // the scan button becomes interactive immediately.  On first run (no saved
  // ID) we still enumerate eagerly so the camera selector is populated.
  const savedCameraId = readSavedCameraId();
  if (savedCameraId) {
    // Pre-populate active device from storage; enumerate in the background.
    state.activeDeviceId = savedCameraId;
    scheduleIdleWork(function () {
      refreshDevices(savedCameraId).catch(function () {});
    }, 150);
  } else {
    // First run — enumerate synchronously so the user can pick a camera.
    refreshDevices("").catch(function () {});
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    init().catch(function (error) {
      if (state.els?.statusText) {
        setStatus(error.message || "The app could not start");
      }
      // Never leave the main button dead after a failed init.
      if (state.els?.scanBtn) {
        state.els.scanBtn.disabled = false;
      }
    });
  });
} else {
  init().catch(function (error) {
    if (state.els?.statusText) {
      setStatus(error.message || "The app could not start");
    }
    if (state.els?.scanBtn) {
      state.els.scanBtn.disabled = false;
    }
  });
}
