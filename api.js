"use strict";

/* API and proxy network requests */

async function apiFetch(url, options) {
  showApiLoader();
  try {
    return await fetch(url, options);
  } finally {
    hideApiLoader();
  }
}


async function fetchProductInfoThroughProxy(code, cookie) {
  const response = await apiFetch(CONFIG.infoProxyEndpoint, {
    method: "POST",
    body: JSON.stringify({
      barcode: code,
      cookie: cookie
    }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Info proxy request failed with status ${response.status}`);
  }

  return response.text();
}


async function fetchDiscountInfoThroughProxy(code, cookie) {
  const response = await apiFetch(CONFIG.discountProxyEndpoint, {
    method: "POST",
    body: JSON.stringify({
      barcode: code,
      cookie: cookie
    }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Discount proxy request failed with status ${response.status}`);
  }

  return response.text();
}


async function fetchUpdateItemThroughProxy(payload, cookie) {
  const response = await apiFetch(CONFIG.updateProxyEndpoint, {
    method: "POST",
    body: JSON.stringify({
      id: payload.id,
      barcode: payload.barcode,
      goods_code: payload.barcode,
      italian_name: payload.italian_name,
      p_price: payload.p_price,
      s_price: payload.s_price,
      s_discount: payload.s_discount,
      cookie: cookie
    }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Update proxy request failed with status ${response.status}`);
  }

  return response.text();
}


async function fetchAddProductThroughProxy(payload, cookie) {
  const response = await apiFetch(CONFIG.addProductProxyEndpoint, {
    method: "POST",
    body: JSON.stringify({
      barcode: payload.barcode,
      italian_name: payload.italian_name,
      p_price: payload.p_price,
      s_price: payload.s_price,
      s_discount: payload.s_discount,
      cookie: cookie
    }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Add product proxy request failed with status ${response.status}`);
  }

  return response.text();
}


async function getCookieForRequests() {
  let cookie = state.authCookie;
  if (!cookie) {
    cookie = await loginAndRefreshCookie();
  }
  return cookie;
}


async function loadProductInfoResponse(barcode) {
  const code = String(barcode || "").trim();
  if (!code) {
    throw new Error("Barcode is empty");
  }

  const cookie = await getCookieForRequests();
  const responseText = await fetchProductInfoThroughProxy(code, cookie);

  let parsedProduct;
  try {
    parsedProduct = JSON.parse(responseText);
  } catch {
    throw new Error("Product info response was not valid JSON.");
  }

  return {
    cookie: cookie,
    raw: parsedProduct,
    normalized: normalizeProductData(parsedProduct?.product || parsedProduct)
  };
}


async function loadProductAndDiscountResponse(barcode) {
  const code = String(barcode || "").trim();
  if (!code) {
    throw new Error("Barcode is empty");
  }

  const cookie = await getCookieForRequests();
  const [productResult, discountResult] = await Promise.allSettled([
    fetchProductInfoThroughProxy(code, cookie),
    fetchDiscountInfoThroughProxy(code, cookie)
  ]);

  if (productResult.status !== "fulfilled") {
    throw productResult.reason instanceof Error
      ? productResult.reason
      : new Error("Could not load product info.");
  }

  const productResponseText = productResult.value;
  const discountResponseText = discountResult.status === "fulfilled"
    ? discountResult.value
    : "";

  let parsedProduct;
  let parsedDiscount = null;
  try {
    parsedProduct = JSON.parse(productResponseText);
  } catch {
    throw new Error("Product info response was not valid JSON.");
  }

  try {
    parsedDiscount = discountResponseText ? JSON.parse(discountResponseText) : null;
  } catch {
    parsedDiscount = null;
  }

  const normalizedProduct = normalizeProductData(parsedProduct?.product || parsedProduct);
  const discountFields = getLegacyDiscountFields({
    product: parsedProduct?.product || parsedProduct,
    sale: parsedDiscount
  }, normalizedProduct);
  const hasVisibleDiscount = discountFields.hasDiscount;

  return {
    cookie: cookie,
    product: normalizedProduct,
    sale: parsedDiscount,
    discountPrice: hasVisibleDiscount ? discountFields.discountPrice : "",
    hasDiscount: hasVisibleDiscount
  };
}

