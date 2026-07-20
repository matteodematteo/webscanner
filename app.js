"use strict";

/* Application bootstrap and initialization */

async function init() {
  await waitForHtml5QrReady(isIOSDevice() ? 9000 : 2800);

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
  loadRoiState();
  applyRoiBoxStyle();
  initRoiResize();
  initProductInfoSlider();

  state.inputMode = loadInputMode();
  document.body.classList.toggle("mode-scanner", state.inputMode === "scanner");
  state.els.barcodeInput.inputMode = state.inputMode === "scanner" ? "none" : "numeric";
  updateInputModeSwitchUi();

  loginAndRefreshCookie(savedSettings).catch(function (error) {
    const message = error.message || "Cookie refresh failed.";
    saveCookieState("", `Cookie refresh failed: ${message}`);
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

  setStatus("Opening camera preview...");
  refreshDevices(readSavedCameraId()).catch(() => {
    // Ignore early device enumeration issues before permission is granted.
  });
  schedulePreviewWarmStart();
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
