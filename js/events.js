"use strict";

/* Event listener bindings */

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

  state.els.clearBarcodeBtn.addEventListener("click", function () {
    state.els.barcodeInput.value = "";
    state.els.quantityInput.value = "";
    setStatus("Barcode field cleared");
  });

  state.els.searchBarcodeBtn.addEventListener("click", async function () {
    state.els.searchBarcodeBtn.disabled = true;
    try {
      const lookupResult = await handleBarcodeLookup({
        allowClosestSearch: true,
        addToHistoryBeforeLookup: false,
        persistToHistory: !state.isQuantityEntryUnlocked
      });
      if (state.isQuantityEntryUnlocked && lookupResult === "exact") {
        moveFocusToInput(state.els.quantityInput);
        selectEntireInputValue({ target: state.els.quantityInput });
      }
    } finally {
      state.els.searchBarcodeBtn.disabled = false;
    }
  });

  state.els.clearSelectedBtn.addEventListener("click", function () {
    if (state.selectedHistoryIndex < 0) {
      return;
    }
    openConfirmDialog("Delete the selected barcode from the list?", clearSelectedHistory);
  });

  state.els.clearAllBtn.addEventListener("click", function () {
    if (state.history.length === 0) {
      return;
    }
    openConfirmDialog("Delete all barcodes from the list?", clearAllHistory);
  });
  
  state.els.sendTxtBtn.addEventListener("click", async function () {
    state.els.sendTxtBtn.disabled = true;
    try {
      await sendTxtList();
      closePrintDialog();
      moveFocusToInput(state.els.barcodeInput);
    } catch (error) {
      setStatus(error.message || "Send TXT failed");
    } finally {
      state.els.sendTxtBtn.disabled = false;
    }
  });

  state.els.printBtn.addEventListener("click", function () {
    if (state.history.length === 0) {
      setStatus("Barcode list is empty");
      return;
    }
    openPrintDialog();
  });

  state.els.printBigBtn.addEventListener("click", async function () {
    state.els.printBigBtn.disabled = true;
    state.els.printStickerBtn.disabled = true;
    try {
      await printHistoryList("60*38");
      closePrintDialog();
      moveFocusToInput(state.els.barcodeInput);
    } catch (error) {
      setStatus(error.message || "Print failed");
    } finally {
      state.els.printBigBtn.disabled = false;
      state.els.printStickerBtn.disabled = false;
    }
  });

  state.els.printStickerBtn.addEventListener("click", async function () {
    state.els.printBigBtn.disabled = true;
    state.els.printStickerBtn.disabled = true;
    try {
      await printHistoryList("40*25");
      closePrintDialog();
      moveFocusToInput(state.els.barcodeInput);
    } catch (error) {
      setStatus(error.message || "Print failed");
    } finally {
      state.els.printBigBtn.disabled = false;
      state.els.printStickerBtn.disabled = false;
    }
  });

  state.els.printBackBtn.addEventListener("click", function() {
    closePrintDialog();
    moveFocusToInput(state.els.barcodeInput);
  });
  
  state.els.torchBtn.addEventListener("click", async function () {
    state.els.torchBtn.disabled = true;
    try {
      await toggleTorch();
    } finally {
      await syncTorchSupport();
    }
  });

  state.els.closestSearchBackBtn.addEventListener("click", function () {
    if (!state.isClosestSearchLoading) {
      closeClosestSearchDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  state.els.historyList.addEventListener("click", function (event) {
    const detailButton = event.target.closest('[data-action="detail"]');
    if (detailButton) {
      const detailIndex = Number(detailButton.dataset.index);
      if (!Number.isNaN(detailIndex)) {
        openHistoryEditor(detailIndex).catch((error) => {
          setStatus(error.message || "Could not open barcode row");
        });
      }
      return;
    }

    const record = event.target.closest(".history-item");
    if (!record) return;
    const index = Number(record.dataset.index);
    if (!Number.isNaN(index)) {
      selectHistoryItem(index);
    }
  });

  state.els.closestSearchList.addEventListener("click", async function (event) {
    const selectButton = event.target.closest('[data-action="select-closest"]');
    if (!selectButton) {
      return;
    }

    const matchIndex = Number(selectButton.dataset.index);
    if (Number.isNaN(matchIndex)) {
      return;
    }

    try {
      await handleClosestSearchSelection(matchIndex);
    } catch (error) {
      setStatus(error.message || "Could not load selected product");
    }
  });

  state.els.historyList.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const record = event.target.closest(".history-item");
    if (!record) return;
    event.preventDefault();
    const index = Number(record.dataset.index);
    if (!Number.isNaN(index)) {
      selectHistoryItem(index);
    }
  });

  state.els.barcodeInput.addEventListener("keydown", async function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (state.isQuantityEntryUnlocked) {
      state.els.barcodeInput.value = String(state.els.barcodeInput.value || "").trim();
      if (!state.els.barcodeInput.value) {
        setStatus("Type or scan a barcode first");
        return;
      }
      await handleBarcodeLookup({
        allowClosestSearch: false,
        addToHistoryBeforeLookup: false,
        persistToHistory: false
      });
      moveFocusToInput(state.els.quantityInput);
      selectEntireInputValue({ target: state.els.quantityInput });
      return;
    }

    const code = String(state.els.barcodeInput.value || "").trim();
    if (!code) {
      setStatus("Type or scan a barcode first");
      return;
    }

    // Kick off the lookup (it reads the code from the field synchronously,
    // before its first await) without waiting for it to resolve.
    handleBarcodeLookup({
      allowClosestSearch: false,
      addToHistoryBeforeLookup: true,
      persistToHistory: true
    }).catch(function (error) {
      setStatus(error.message || "Could not add barcode to history");
    });

    // Clean the barcode field right away, without waiting for the lookup to finish.
    state.els.barcodeInput.value = "";
    moveFocusToInput(state.els.barcodeInput);
  });

  state.els.barcodeInput.addEventListener("keyup", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
  });

  state.els.barcodeInput.addEventListener("blur", function () {
    window.setTimeout(function () {
      if (isAnyDialogOpen()) {
        return;
      }
      const active = document.activeElement;
      if (active && active !== document.body && active !== state.els.barcodeInput) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable) {
          return;
        }
      }
      moveFocusToInput(state.els.barcodeInput);
    }, 30);
  });

  state.els.entryModeBtn.addEventListener("click", function () {
    setQuantityEntryMode(!state.isQuantityEntryUnlocked);
  });

  if (!state.isIOS) {
    state.els.quantityInput.addEventListener("focus", selectEntireInputValue);
    state.els.quantityInput.addEventListener("click", selectEntireInputValue);
    state.els.quantityInput.addEventListener("pointerup", function (event) {
      event.preventDefault();
      selectEntireInputValue(event);
    });
  }
  
  state.els.quantityInput.addEventListener("input", function () {
    state.els.quantityInput.value = sanitizeEditableQuantity(state.els.quantityInput.value);
  });
  
  state.els.quantityInput.addEventListener("keydown", async function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await addCurrentBarcodeWithQuantity();
    moveFocusToInput(state.els.barcodeInput);
  });
  
  state.els.addBarcodeBtn.addEventListener("click", async function () {
    await addCurrentBarcodeWithQuantity();
    moveFocusToInput(state.els.barcodeInput);
  });
  
  state.els.quantityPad.addEventListener("click", async function (event) {
    const keyButton = event.target.closest("[data-key]");
    if (!keyButton) {
      return;
    }
    const key = String(keyButton.dataset.key || "").trim();
    if (!key) {
      return;
    }
    await handleQuantityPadInput(key);
    
    if (key.toLowerCase() === "enter" || key.toLowerCase() === "add") {
      moveFocusToInput(state.els.barcodeInput);
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

  state.els.settingsBtn.addEventListener("click", openSettingsDialog);
  
  state.els.closeSettingsBtn.addEventListener("click", function() {
    closeSettingsDialog();
    moveFocusToInput(state.els.barcodeInput);
  });

  state.els.loginSettingsBtn.addEventListener("click", async function () {
    const values = {
      shopKey: state.els.shopKeyInput.value.trim(),
      login: state.els.loginInput.value.trim(),
      password: state.els.passwordInput.value,
      displayMode: state.displayMode,
      quantityEntryUnlocked: state.isQuantityEntryUnlocked
    };

    saveSettings(values);
    try {
      await loginAndRefreshCookie(values);
    } catch (error) {
      const message = error.message || "Login request failed.";
      saveCookieState("", `Login failed: ${message}`);
      state.els.settingsSaveNote.textContent = message;
      setStatus("Login failed");
    }
  });

  state.els.refreshCookieBtn.addEventListener("click", async function () {
    state.els.refreshCookieBtn.disabled = true;
    try {
      await loginAndRefreshCookie();
    } catch (error) {
      const message = error.message || "Cookie refresh failed.";
      saveCookieState("", `Cookie refresh failed: ${message}`);
      setStatus("Cookie refresh failed");
    } finally {
      state.els.refreshCookieBtn.disabled = false;
    }
  });

  state.els.lockScreenScrollBtn.addEventListener("click", function () {
    toggleScreenScrollLock();
  });

  state.els.inputModeSwitch.addEventListener("click", function (event) {
    const btn = event.target.closest(".input-mode-option");
    if (!btn) {
      return;
    }
    setInputMode(btn.dataset.inputMode).catch(function (error) {
      setStatus(error.message || "Could not switch input mode");
    });
  });

  state.els.settingsDialog.addEventListener("click", function (event) {
    if (event.target === state.els.settingsDialog) {
      closeSettingsDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  state.els.confirmDialogOkBtn.addEventListener("click", function () {
    const action = state.pendingConfirmAction;
    closeConfirmDialog();
    moveFocusToInput(state.els.barcodeInput);
    if (action) {
      action();
    }
  });

  state.els.confirmDialogCancelBtn.addEventListener("click", function() {
    closeConfirmDialog();
    moveFocusToInput(state.els.barcodeInput);
  });

  state.els.confirmDialog.addEventListener("click", function (event) {
    if (event.target === state.els.confirmDialog) {
      closeConfirmDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  state.els.printDialog.addEventListener("click", function (event) {
    if (event.target === state.els.printDialog) {
      closePrintDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  state.els.closestSearchDialog.addEventListener("click", function (event) {
    if (event.target === state.els.closestSearchDialog && !state.isClosestSearchLoading) {
      closeClosestSearchDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  state.els.historyEditSaveBtn.addEventListener("click", async function () {
    state.els.historyEditSaveBtn.disabled = true;
    try {
      await saveHistoryEditorChanges();
    } catch (error) {
      setStatus(error.message || "Save failed.");
      if (!error?.toastShown) {
        showToast("Save failed");
      }
    } finally {
      state.els.historyEditSaveBtn.disabled = false;
    }
  });

  state.els.historyEditBackBtn.addEventListener("click", function() {
    closeHistoryEditDialog();
    moveFocusToInput(state.els.barcodeInput);
  });

  state.els.historyEditSPriceInput.addEventListener("input", refreshHistoryEditDiscountPrice);
  state.els.historyEditSDiscountInput.addEventListener("input", refreshHistoryEditDiscountPrice);
  if (!state.isIOS) {
    state.els.historyEditQtyInput.addEventListener("focus", selectEntireInputValue);
    state.els.historyEditQtyInput.addEventListener("click", selectEntireInputValue);
    state.els.historyEditQtyInput.addEventListener("pointerup", function (event) {
      event.preventDefault();
      selectEntireInputValue(event);
    });
  }

  state.els.historyEditItalianNameInput.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveFocusToInput(state.els.historyEditPPriceInput);
  });

  state.els.historyEditPPriceInput.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveFocusToInput(state.els.historyEditSPriceInput);
  });

  state.els.historyEditDialog.addEventListener("click", function (event) {
    if (event.target === state.els.historyEditDialog) {
      closeHistoryEditDialog();
      moveFocusToInput(state.els.barcodeInput);
    }
  });

  const markPreviewAsLive = function () {
    if (!document.hidden) {
      setPreviewActive(true);
    }
  };
  
  state.els.cameraPreview.addEventListener("loadeddata", markPreviewAsLive);
  state.els.cameraPreview.addEventListener("canplay", markPreviewAsLive);
  state.els.cameraPreview.addEventListener("playing", markPreviewAsLive);
  state.els.cameraPreview.addEventListener("timeupdate", markPreviewAsLive);

  window.addEventListener("beforeunload", function () {
    clearResumePreviewTimer();
    stopScanning(true);
    stopTracks();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearResumePreviewTimer();
      setPreviewActive(false);
    } else {
      state.lastPreviewTime = Number(getPreviewVideoElement()?.currentTime || 0);
      state.stalledPreviewChecks = 0;
      scheduleQuickPreviewResumeCheck();
    }
  });

  window.addEventListener("pageshow", function () {
    scheduleQuickPreviewResumeCheck();
  });

  window.addEventListener("focus", function () {
    scheduleQuickPreviewResumeCheck();
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", function () {
      refreshDevices(state.activeDeviceId).catch(() => {
        // Ignore transient device change errors.
      });
    });
  }
}
