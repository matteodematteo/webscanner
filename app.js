// =====================
// CONFIG
// =====================

const CONFIG = {
  API_BASE_URL: "https://your-api.com",
  LOGIN_ENDPOINT: "/auth/login",
  PRODUCT_ENDPOINT: "/product/",
  USE_CREDENTIALS: true,
  SCAN_DELAY: 1500
};

// =====================
// STORAGE
// =====================

const STORAGE_KEY = "app_settings";

// =====================
// STATE
// =====================

let isScanningActive = false;
let lastScanTime = 0;
let userSettings = null;
let quaggaInitialized = false;
let lastDetectedBarcode = null;
let mediaStream = null;
let torchActive = false;

// =====================
// ELEMENTS
// =====================

const scannerDiv = document.getElementById("scanner");
const barcodeInputElement = document.getElementById("barcodeOutput");
const productNameElement = document.getElementById("productName");
const productPriceElement = document.getElementById("productPrice");
const productQtyElement = document.getElementById("productQty");
const scanBtn = document.getElementById("scanBtn");
const torchBtn = document.getElementById("torchBtn");

const modal = document.getElementById("modal");
const settingsBtn = document.getElementById("settingsBtn");
const saveBtn = document.getElementById("saveSettings");
const closeBtn = document.getElementById("closeModal");

const shopKeyInput = document.getElementById("shopKey");
const loginNameInput = document.getElementById("loginName");
const passwordInput = document.getElementById("password");

// =====================
// SOUND - BEEP ON BARCODE DETECTION
// =====================

function playBarcodeSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);

    console.log("🔊 Beep sound played");
  } catch (err) {
    console.error("Sound error:", err);
  }
}

// =====================
// TORCH/FLASHLIGHT CONTROL
// =====================

async function toggleTorch() {
  try {
    if (!mediaStream) return;

    const videoTrack = mediaStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};

    if (!capabilities.torch) {
      console.log("Torch not supported on this device");
      torchBtn.style.display = "none";
      return;
    }

    torchActive = !torchActive;
    await videoTrack.applyConstraints({
      advanced: [{ torch: torchActive }]
    });

    torchBtn.style.backgroundColor = torchActive ? "#FF9800" : "#6c757d";
    torchBtn.textContent = torchActive ? "💡 Torch ON" : "🔦 Torch";
    console.log("🔦 Torch:", torchActive ? "ON" : "OFF");
  } catch (err) {
    console.error("Torch error:", err);
  }
}

// =====================
// SETTINGS
// =====================

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    userSettings = JSON.parse(saved);
    shopKeyInput.value = userSettings.shop_key || "";
    loginNameInput.value = userSettings.login_name || "";
    passwordInput.value = userSettings.password || "";
  }
}

function saveSettings() {
  userSettings = {
    shop_key: shopKeyInput.value,
    login_name: loginNameInput.value,
    password: passwordInput.value
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings));
  alert("✅ Settings saved successfully!");
  modal.style.display = "none";
}

// =====================
// AUTH
// =====================

async function login() {
  if (!userSettings) throw new Error("Missing credentials");

  const response = await fetch(CONFIG.API_BASE_URL + CONFIG.LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: CONFIG.USE_CREDENTIALS ? "include" : "same-origin",
    body: JSON.stringify(userSettings)
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }
}

// =====================
// API
// =====================

async function fetchProduct(barcode) {
  try {
    return await requestProduct(barcode);
  } catch (err) {
    console.log("Retrying after login...");
    await login();
    return await requestProduct(barcode);
  }
}

async function requestProduct(barcode) {
  const response = await fetch(
    CONFIG.API_BASE_URL + CONFIG.PRODUCT_ENDPOINT + barcode,
    {
      method: "GET",
      credentials: CONFIG.USE_CREDENTIALS ? "include" : "same-origin"
    }
  );

  if (!response.ok) {
    throw new Error("Fetch failed");
  }

  return await response.json();
}

// =====================
// DISPLAY PRODUCT INFO
// =====================

function displayProductInfo(product) {
  productNameElement.value = product.name || "";
  productPriceElement.value = product.price || "";
  productQtyElement.value = product.qty || "";
}

function clearProductInfo() {
  productNameElement.value = "";
  productPriceElement.value = "";
  productQtyElement.value = "";
}

// =====================
// INIT QUAGGA2 - WITH AUTOFOCUS
// =====================

async function initQuagga() {
  if (quaggaInitialized) {
    console.log("✅ Quagga2 already initialized");
    return true;
  }

  return new Promise((resolve) => {
    try {
      console.log("📹 Initializing Quagga2 with autofocus...");

      // 🔥 QUAGGA2 CONFIG - OPTIMIZED WITH AUTOFOCUS
      Quagga.init(
        {
          inputStream: {
            type: "LiveStream",
            target: scannerDiv,
            constraints: {
              facingMode: "environment",
              // 🔥 AUTOFOCUS SETTINGS
              autoFocus: true,
              focusMode: "continuous",
              focusDistance: "optimal",
              // 🔥 HIGH RESOLUTION FOR BETTER DETECTION
              width: { ideal: 1280 },
              height: { ideal: 960 }
            }
          },
          locator: {
            halfSample: false,        // 🔥 Full sample for accuracy
            patchSize: "x-large"      // 🔥 Large patches for barcode detection
          },
          numOfWorkers: 4,             // 🔥 More workers for speed
          frequency: 15,               // 🔥 15 scans per second
          decoder: {
            readers: [
              "ean_reader",
              "ean_8_reader",
              "code_128_reader",
              "code_39_reader",
              "upc_reader",
              "upc_e_reader",
              "i2of5_reader",
              "codabar_reader"
            ],
            debug: false
          }
        },
        function(err) {
          if (err) {
            console.error("❌ Quagga2 initialization error:", err);
            barcodeInputElement.placeholder = "Camera Error";
            alert(`Camera Error: ${err.message}`);
            resolve(false);
            return;
          }

          console.log("✅ Quagga2 initialized with autofocus enabled");

          // 🔥 GET MEDIA STREAM FOR TORCH CONTROL
          const video = scannerDiv.querySelector("video");
          if (video && video.srcObject) {
            mediaStream = video.srcObject;
            torchBtn.style.display = "inline-block";
            console.log("✅ Media stream acquired for torch control");
          }

          // 🔥 START CAMERA STREAM
          Quagga.start();

          // 🔥 Setup detection handler
          Quagga.onDetected(onQuaggaDetected);

          quaggaInitialized = true;
          barcodeInputElement.placeholder = "Scan or type barcode here...";
          resolve(true);
        }
      );
    } catch (err) {
      console.error("❌ Error:", err);
      barcodeInputElement.placeholder = "Error";
      resolve(false);
    }
  });
}

// =====================
// QUAGGA2 DETECTION HANDLER
// =====================

function onQuaggaDetected(result) {
  if (!isScanningActive) return;

  const code = result.codeResult.code;
  const confidence = result.codeResult.confidence || 0;

  // 🔥 Only process high confidence detections
  if (code && code.length >= 8 && code !== lastDetectedBarcode) {
    lastDetectedBarcode = code;
    console.log("✅ Barcode detected:", code, "Confidence:", confidence.toFixed(2));
    handleBarcodeDetection(code);
  }
}

// =====================
// HANDLE BARCODE DETECTION
// =====================

async function handleBarcodeDetection(barcode) {
  if (!isScanningActive) return;

  const now = Date.now();
  if (now - lastScanTime < CONFIG.SCAN_DELAY) return;

  lastScanTime = now;

  // 🔥 PLAY SOUND
  playBarcodeSound();

  console.log("✅ Barcode scanned:", barcode);

  // 🔥 Display barcode in input field
  barcodeInputElement.value = barcode;

  // 🔥 Stop scanning
  stopScanning();

  // 🔥 Fetch product
  try {
    const product = await fetchProduct(barcode);
    console.log("✅ Product:", product);
    displayProductInfo(product);
  } catch (error) {
    console.error("❌ Product fetch error:", error);
    clearProductInfo();
  }
}

// =====================
// HANDLE BARCODE INPUT - ENTER KEY
// =====================

async function handleBarcodeSubmit() {
  const barcode = barcodeInputElement.value.trim();

  if (!barcode || barcode.length < 8) {
    alert("❌ Please enter a valid barcode");
    return;
  }

  console.log("📤 Fetching product for barcode:", barcode);

  // 🔥 Play sound
  playBarcodeSound();

  // 🔥 Clear product info first
  clearProductInfo();

  try {
    const product = await fetchProduct(barcode);
    console.log("✅ Product:", product);
    displayProductInfo(product);
  } catch (error) {
    console.error("❌ Product fetch error:", error);
    clearProductInfo();
    alert(`❌ Error: ${error.message}`);
  }
}

// =====================
// START SCANNING
// =====================

async function startScanning() {
  if (isScanningActive) return;

  try {
    console.log("🟢 START SCANNING button clicked");

    // 🔥 CLEAR BARCODE INPUT FIELD
    barcodeInputElement.value = "";
    barcodeInputElement.placeholder = "Scanning... Keep barcode in view";

    // 🔥 Clear product info
    clearProductInfo();

    // 🔥 Initialize Quagga2 if not already done
    const initialized = await initQuagga();

    if (!initialized) {
      console.error("Failed to initialize Quagga2");
      return;
    }

    // 🔥 Enable scanning mode
    isScanningActive = true;
    lastDetectedBarcode = null;
    scanBtn.textContent = "Stop Scanning";
    scanBtn.style.backgroundColor = "#dc3545";

    console.log("✅ Scanning started - Autofocus enabled - Point barcode at camera");

  } catch (err) {
    console.error("❌ Error starting scanner:", err);
    barcodeInputElement.placeholder = "Error";
    isScanningActive = false;
    scanBtn.textContent = "Start Scanning";
    scanBtn.style.backgroundColor = "#007bff";
    alert(`Error: ${err.message}`);
  }
}

// =====================
// STOP SCANNING
// =====================

function stopScanning() {
  if (!isScanningActive) return;

  isScanningActive = false;
  scanBtn.textContent = "Start Scanning";
  scanBtn.style.backgroundColor = "#007bff";
  barcodeInputElement.placeholder = "Scan or type barcode here...";
  lastDetectedBarcode = null;

  console.log("✅ Scanning stopped");
}

// =====================
// EVENTS
// =====================

scanBtn.addEventListener("click", () => {
  if (isScanningActive) {
    stopScanning();
  } else {
    startScanning();
  }
});

// 🔥 TORCH BUTTON
torchBtn.addEventListener("click", toggleTorch);

// 🔥 BARCODE INPUT ENTER KEY EVENT
barcodeInputElement.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleBarcodeSubmit();
  }
});

settingsBtn.addEventListener("click", () => {
  modal.style.display = "flex";
  modal.classList.add("active");
});

closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
  modal.classList.remove("active");
});

saveBtn.addEventListener("click", saveSettings);

modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
});

// =====================
// INIT
// =====================

loadSettings();
console.log("✅ App initialized and ready");
