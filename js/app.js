"use strict";

/* Application bootstrap and initialization — Version B (fast start) */

async function init() {
  // Short non-blocking wait so Html5Qrcode can start loading; do not block UI for long.
  waitForHtml5QrReady(isIOSDevice() ? 2500 : 1200).catch(function () {});

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

  // Fixed ROI (no resize handle) — always 80% centered.
  state.roi = { width: 0.8, height: 0.8 };
  applyRoiBoxStyle();

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

  // Cookie refresh in background — never blocks the UI.
  loginAndRefreshCookie(savedSettings).catch(function (error) {
    const message = error.message || "Cookie refresh failed.";
    saveCookieState(state.authCookie || "", `Cookie refresh failed: ${message}`);
  });

  if (state.inputMode === "scanner") {
    setStatus("Scanner mode: use an external scanner");
    moveFocusToInput(state.els.barcodeInput);
    return;
  }

  const hardwareIssue = getCameraHardwareIssue();
  if (hardwareIssue) {
    setStatus(hardwareIssue);
    state.els.scanBtn.disabled = true;
    state.els.cameraSelect.disabled = true;
    state.els.torchBtn.disabled = true;
    return;
  }

  // Camera starts only when user taps "Start Scanning" (Version B).
  setStatus("Ready — tap Start Scanning");
  setPreviewActive(false);
  // Pre-enumerate devices in background (no permission needed for labels on most browsers).
  refreshDevices(readSavedCameraId()).catch(function () {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    init().catch(function (error) {
      if (state.els?.statusText) {
        setStatus(error.message || "The app could not start");
      }
    });
  });
} else {
  init().catch(function (error) {
    if (state.els?.statusText) {
      setStatus(error.message || "The app could not start");
    }
  });
}
