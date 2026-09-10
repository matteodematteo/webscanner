"use strict";

// Keep the wrapper and WASM binary pinned to the same release, served locally.
importScripts("vendor/zxing-wasm/3.1.2/reader.js");
const ready = ZXingWASM.prepareZXingModule({
  overrides: {
    locateFile: (path) => new URL("vendor/zxing-wasm/3.1.2/" + path, self.location.href).href
  },
  fireImmediately: true
});
ready.then(() => self.postMessage({ type: "ready" }))
  .catch((error) => self.postMessage({ type: "error", error: error.message }));

self.onmessage = async ({ data }) => {
  try {
    await ready;
    const pixels = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
    const options = {
      formats: data.formats,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      maxNumberOfSymbols: 1,
      textMode: "Plain",
      minLineCount: 2
    };
    let results = await ZXingWASM.readBarcodes(pixels, options);
    // ZXing's tryInvert applies to matrix codes. Also support light bars on
    // dark labels for the linear formats used by this app.
    if (!results.some((result) => result.isValid)) {
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 255 - pixels.data[i];
        pixels.data[i + 1] = 255 - pixels.data[i + 1];
        pixels.data[i + 2] = 255 - pixels.data[i + 2];
      }
      results = await ZXingWASM.readBarcodes(pixels, options);
    }
    const result = results.find((result) => result.isValid);
    let text = result?.text || "";
    // ZXing 3 normalizes UPC content to EAN-13 internally.
    if (result?.format === "UPCA" && /^0\d{12}$/.test(text)) text = text.slice(1);
    if (result?.format === "UPCE" && result.extra) {
      const original = JSON.parse(result.extra).UPCE;
      if (typeof original === "string" && /^\d{8}$/.test(original)) text = original;
    }
    self.postMessage({ id: data.id, text });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || "Barcode decoding failed" });
  }
};
