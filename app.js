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
let codeReader = null;
let mediaStream = null;

// =====================
// ELEMENTS
// =====================

const videoElement = document.getElementById("video");
const scannerDiv = document.getElementById("scanner");
const barcodeInputElement = document.getElementById("barcodeOutput");
const productNameElement = document.getElementById("productName");
const productPriceElement = document.getElementById("productPrice");
const productQtyElement = document.getElementById("productQty");
const scanBtn = document.getElementById("scanBtn");
const statusElement = document.getElementById("status");

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

    console.log("🔊 Beep!");
  } catch (err) {
    console.error("Sound error:", err);
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
// INIT ZXING
// =====================

async function initZXing() {
  try {
    statusElement.textContent = "Initializing camera...";

    if (!window.ZXing) {
      statusElement.textContent = "Loading ZXing library...";
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!window.ZXing) {
        throw new Error("ZXing library not loaded");
      }
    }

    const { BrowserMultiFormatReader } = window.ZXing;
    codeReader = new BrowserMultiFormatReader();

    statusElement.textContent = "Requesting camera access...";

    const result = await codeReader.decodeFromVideoDevice(
      undefined,
      videoElement,
      async (result, err) => {
        if (result && isScanningActive) {
          const barcode = result.text;
          console.log("✅ Barcode detected:", barcode);
          await handleBarcodeDetection(barcode);
        }
      }
    );

    statusElement.textContent = "Camera active - ready to scan";
    console.log("✅ ZXing initialized");
    return true;

  } catch (err) {
    console.error("❌ ZXing init error:", err);
    statusElement.textContent = `Camera Error: ${err.message}`;
    alert(`Camera Error: ${err.message}`);
    return false;
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

  console.log("✅ Barcode scanned:", barcode);

  // 🔥 PLAY SOUND
  playBarcodeSound();

  // 🔥 Display barcode
  barcodeInputElement.value = barcode;

  // 🔥 Stop scanning
  stopScanning();

  // 🔥 Clear product info
  clearProductInfo();

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

  // 🔥 Clear product info
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
    console.log("🟢 START SCANNING");

    // 🔥 Clear fields
    barcodeInputElement.value = "";
    barcodeInputElement.placeholder = "Scanning...";
    clearProductInfo();

    // 🔥 Initialize ZXing
    const initialized = await initZXing();
    if (!initialized) return;

    // 🔥 Enable scanning
    isScanningActive = true;
    scanBtn.textContent = "Stop Scanning";
    scanBtn.style.backgroundColor = "#dc3545";
    statusElement.textContent = "🔴 SCANNING - Point barcode at camera";

  } catch (err) {
    console.error("❌ Error:", err);
    statusElement.textContent = "Error";
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
  statusElement.textContent = "Scanning stopped";

  if (codeReader) {
    codeReader.reset();
  }

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
console.log("✅ App initialized");
