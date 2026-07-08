(function () {
  const resultText = document.getElementById("result-text");
  const resultLabel = document.getElementById("result-label");
  const statusEl = document.getElementById("status");

  // Updated: 1D retail/industrial barcode formats (QR restriction removed)
  const config = {
    fps: 30,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false,
    videoConstraints: {
      facingMode: { exact: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      // Advanced constraints: continuous autofocus + slight digital zoom
      // to compensate for weak macro-focus at close range on mobile.
      advanced: [
        { focusMode: "continuous" },
        { zoom: 2.0 }
      ]
    },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.UPC_A
    ],
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: false
    }
  };

  const html5QrCode = new Html5Qrcode("reader", {
    formatsToSupport: config.formatsToSupport,
    verbose: false
  });

  let lastCode = null;
  let lastTime = 0;

  function onScanSuccess(decodedText) {
    const now = Date.now();
    if (decodedText === lastCode && now - lastTime < 1500) return;
    lastCode = decodedText;
    lastTime = now;

    resultLabel.style.display = "block";
    resultText.textContent = decodedText;

    if (navigator.vibrate) navigator.vibrate(80);
  }

  function onScanFailure() {
    // Expected on almost every frame with no barcode in view — ignore silently.
  }

  function startWithConstraints(facingModeConstraint) {
    return html5QrCode.start(
      {
        facingMode: facingModeConstraint,
        advanced: config.videoConstraints.advanced
      },
      {
        fps: config.fps,
        qrbox: config.qrbox,
        aspectRatio: config.aspectRatio,
        formatsToSupport: config.formatsToSupport,
        experimentalFeatures: config.experimentalFeatures,
        videoConstraints: config.videoConstraints
      },
      onScanSuccess,
      onScanFailure
    );
  }

  startWithConstraints({ exact: "environment" })
    .then(() => {
      statusEl.textContent = "Scanning…";
    })
    .catch(() => {
      startWithConstraints("environment")
        .then(() => {
          statusEl.textContent = "Scanning…";
        })
        .catch((err) => {
          statusEl.textContent = "Camera error: " + err;
        });
    });

  window.addEventListener("beforeunload", () => {
    html5QrCode.stop().catch(() => {});
  });
})();