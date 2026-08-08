"use strict";

/* Application bootstrap — offline-safe, fast start */

async function init() {
  state.els = queryElements();
  requireElements(state.els);
  state.isIOS = isIOSDevice();
  state.isMobileUi = detectMobileUi();
  state.captureContext = state.els.captureCanvas?.getContext("2d", { alpha: false }) || null;
  cacheResultFieldElements();

  const savedSettings = readSavedSettings();
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
  }, isIOSDevice() ? 3000 : 2000);

  state.inputMode = loadInputMode();
  document.body.classList.toggle("mode-scanner", state.inputMode === "scanner");
  state.els.barcodeInput.inputMode = state.inputMode === "scanner" ? "none" : "numeric";
  updateInputModeSwitchUi();

  const scrollLockState = loadScrollLockState();
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
  refreshDevices(readSavedCameraId()).catch(function () {});
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
