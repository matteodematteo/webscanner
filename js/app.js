"use strict";

/* Application bootstrap — offline-safe, fast start */

async function init() {
  // Do not block UI waiting for the scanner library (works offline if file is local).
  waitForHtml5QrReady(isIOSDevice() ? 2000 : 800).catch(function () {});

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
  setQuantityEntryMode(savedSettings.quantityEntryUnlocked);
  clearResultFields();
  renderHistory();
  bindEvents();

  state.roi = { width: 0.8, height: 0.8 };
  if (typeof applyRoiBoxStyle === "function") {
    applyRoiBoxStyle();
  }
  // Keep resize if present (older camera.js); ignore if removed.
  if (typeof loadRoiState === "function") {
    try { loadRoiState(); } catch (e) {}
  }
  if (typeof initRoiResize === "function") {
    try { initRoiResize(); } catch (e) {}
  }

  initProductInfoSlider();

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
