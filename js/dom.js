"use strict";

/* DOM element queries and field caching */

function queryElements() {
  return {
    barcodeInput: document.getElementById("barcodeInput"),
    addBarcodeBtn: document.getElementById("addBarcodeBtn"),
    cameraBadge: document.getElementById("cameraBadge"),
    cameraPreview: document.getElementById("cameraPreview"),
    cameraPreviewQuagga: document.getElementById("cameraPreviewQuagga"),
    cameraSelect: document.getElementById("cameraSelect"),
    productInfoSlider: document.getElementById("productInfoSlider"),
    productInfoTrack: document.getElementById("productInfoTrack"),
    productInfoDots: document.getElementById("productInfoDots"),
    apiLoader: document.getElementById("apiLoader"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    clearBarcodeBtn: document.getElementById("clearBarcodeBtn"),
    closestSearchBackBtn: document.getElementById("closestSearchBackBtn"),
    closestSearchDialog: document.getElementById("closestSearchDialog"),
    closestSearchList: document.getElementById("closestSearchList"),
    closestSearchStatus: document.getElementById("closestSearchStatus"),
    closestSearchTitle: document.getElementById("closestSearchTitle"),
    clearSelectedBtn: document.getElementById("clearSelectedBtn"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmDialogCancelBtn: document.getElementById("confirmDialogCancelBtn"),
    confirmDialogOkBtn: document.getElementById("confirmDialogOkBtn"),
    confirmDialogText: document.getElementById("confirmDialogText"),
    captureCanvas: document.getElementById("captureCanvas"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    entryModeBtn: document.getElementById("entryModeBtn"),
    entryModeIcon: document.getElementById("entryModeIcon"),
    historyEmpty: document.getElementById("historyEmpty"),
    historyEditBackBtn: document.getElementById("historyEditBackBtn"),
    historyEditBarcodeInput: document.getElementById("historyEditBarcodeInput"),
    historyEditDialog: document.getElementById("historyEditDialog"),
    historyEditDiscountPriceInput: document.getElementById("historyEditDiscountPriceInput"),
    historyEditIdInput: document.getElementById("historyEditIdInput"),
    historyEditItalianNameInput: document.getElementById("historyEditItalianNameInput"),
    historyEditPPriceInput: document.getElementById("historyEditPPriceInput"),
    historyEditQtyInput: document.getElementById("historyEditQtyInput"),
    historyEditSaveBtn: document.getElementById("historyEditSaveBtn"),
    historyEditSaveNote: document.getElementById("historyEditSaveNote"),
    historyEditSDiscountInput: document.getElementById("historyEditSDiscountInput"),
    historyEditSPriceInput: document.getElementById("historyEditSPriceInput"),
    historyCountBadge: document.getElementById("historyCountBadge"),
    historyList: document.getElementById("historyList"),
    loginInput: document.getElementById("loginInput"),
    loginSettingsBtn: document.getElementById("loginSettingsBtn"),
    passwordInput: document.getElementById("passwordInput"),
    printBackBtn: document.getElementById("printBackBtn"),
    printBigBtn: document.getElementById("printBigBtn"),
    printBtn: document.getElementById("printBtn"),
    printDialog: document.getElementById("printDialog"),
    printStickerBtn: document.getElementById("printStickerBtn"),
    productInfoSection: document.getElementById("productInfoSection"),
    previewFrame: document.getElementById("previewFrame"),
    previewPlaceholder: document.getElementById("previewPlaceholder"),
    quantityInput: document.getElementById("quantityInput"),
    quantityPad: document.getElementById("quantityPad"),
    quantityPadCard: document.getElementById("quantityPadCard"),
    refreshCookieBtn: document.getElementById("refreshCookieBtn"),
    lockScreenScrollBtn: document.getElementById("lockscreenscroll"),
    inputModeSwitch: document.getElementById("inputModeSwitch"),
    resolutionBadge: document.getElementById("resolutionBadge"),
    roiBox: document.getElementById("roiBox"),
    roiResizeHandle: document.getElementById("roiResizeHandle"),
    scanBtn: document.getElementById("scanBtn"),
    searchBarcodeBtn: document.getElementById("searchBarcodeBtn"),
    sendTxtBtn: document.getElementById("sendTxtBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsSaveNote: document.getElementById("settingsSaveNote"),
    shopKeyInput: document.getElementById("shopKeyInput"),
    statusText: document.getElementById("statusText"),
    toast: document.getElementById("toast"),
    torchBtn: document.getElementById("torchBtn")
  };
}


function requireElements(els) {
  const missing = Object.entries(els).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing DOM elements: ${missing.join(", ")}`);
  }
}


function cacheResultFieldElements() {
  state.fieldEls = {};
  for (let index = 0; index < CONFIG.resultFields.length; index += 1) {
    const key = CONFIG.resultFields[index];
    state.fieldEls[key] = document.getElementById(`field_${key}`);
  }
}

