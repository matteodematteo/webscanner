"use strict";

/* On-demand sales quantity and product activity lookups */

function formatSalesQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  return numeric.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}


function formatSalesDateForRequest(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length === 10) {
    return `${text} 00:00:00`;
  }
  return text.replace("T", " ") + (text.length === 16 ? ":00" : "");
}


function formatSalesEndDateForRequest(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length === 10) {
    return `${text} 23:59:59`;
  }
  return text.replace("T", " ") + (text.length === 16 ? ":59" : "");
}


function parseSalesDate(value, endOfDay) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dateOnly = new Date(`${text}T00:00:00`);
    if (Number.isNaN(dateOnly.getTime())) {
      return null;
    }
    if (endOfDay) {
      dateOnly.setHours(23, 59, 59, 999);
    }
    return dateOnly;
  }
  const normalized = text.replace(" ", "T").replace(/\.0+$/, "");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}


function hasSalesQuantityField(item) {
  return Boolean(item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "quantity"));
}


function extractSalesRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Activity response did not contain quantity rows. Refresh your login and retry.");
  }

  const queue = [payload];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || typeof item !== "object") {
      continue;
    }

    if (Array.isArray(item)) {
      if (item.length === 0 || item.some(hasSalesQuantityField)) {
        return item;
      }
      continue;
    }

    const values = Object.values(item);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (Array.isArray(value)) {
        if (value.length === 0 || value.some(hasSalesQuantityField)) {
          return value;
        }
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  throw new Error("Activity response did not contain quantity rows. Refresh your login and retry.");
}


function isSalesRowInSelectedPeriod(row) {
  const beginDate = parseSalesDate(state.salesBeginDate, false);
  const endDate = parseSalesDate(state.salesEndDate, true);
  if (!beginDate && !endDate) {
    return true;
  }

  const rowDate = parseSalesDate(row?.operatortime);
  if (!rowDate) {
    return false;
  }
  if (beginDate && rowDate < beginDate) {
    return false;
  }
  if (endDate && rowDate > endDate) {
    return false;
  }
  return true;
}


function getSalesRowQuantity(row) {
  const rawQuantity = row?.quantity;
  if (typeof rawQuantity === "string") {
    const normalized = rawQuantity.trim().replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(rawQuantity);
  return Number.isFinite(parsed) ? parsed : 0;
}


function sumSalesQuantity(rows) {
  return rows
    .filter(isSalesRowInSelectedPeriod)
    .reduce(function (total, row) {
      return total + getSalesRowQuantity(row);
    }, 0);
}


function renderSalesQuantity() {
  const valueEl = state.els?.salesQuantityField;
  const loaderEl = state.els?.salesQuantityLoader;
  const periodBtn = state.els?.salesPeriodBtn;
  if (!valueEl || !loaderEl) {
    return;
  }

  loaderEl.hidden = !state.isSalesLoading;
  if (state.isSalesLoading) {
    valueEl.textContent = "";
  } else if (!state.salesBarcode) {
    valueEl.textContent = "";
  } else if (state.salesError || !state.hasSalesResult) {
    valueEl.textContent = "—";
  } else {
    valueEl.textContent = formatSalesQuantity(sumSalesQuantity(state.salesRows));
  }

  if (periodBtn) {
    const hasPeriod = Boolean(state.salesBeginDate || state.salesEndDate);
    periodBtn.classList.toggle("has-period", hasPeriod);
    periodBtn.title = hasPeriod ? "Sales period active" : "Sales period";
  }
}


function clearSalesData() {
  state.salesAbortController?.abort();
  state.productActivityAbortController?.abort();
  state.salesLookupSequence += 1;
  state.salesBarcode = "";
  state.salesRows = [];
  state.isSalesLoading = false;
  state.hasSalesResult = false;
  state.salesError = false;
  state.productActivityLookupSequence += 1;
  state.productActivityTotals = null;
  state.productActivityDate = "";
  state.isProductActivityLoading = false;
  state.productActivityError = "";
  renderSalesQuantity();
  renderProductActivity();
}


function setSalesProduct(barcode) {
  const code = String(barcode || "").trim();
  if (code !== state.salesBarcode) {
    clearSalesData();
    state.salesBarcode = code;
    renderSalesQuantity();
  }
  if (state.productInfoSlideIndex === 3) startProductActivityLookup();
}


async function fetchSalesPerformance(code, cookie, options) {
  const beginDate = formatSalesDateForRequest(options.beginDate);
  const endDate = formatSalesEndDateForRequest(options.endDate);
  const proxyEndpoint = String(CONFIG.salesPerformanceProxyEndpoint || "").trim();

  if (!proxyEndpoint) {
    throw new Error("Sales performance Cloudflare Worker endpoint is not configured.");
  }

  const response = await fetch(proxyEndpoint, {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      goodsCode: code,
      barcode: code,
      cookie: cookie,
      type: options.type,
      beginDate: beginDate,
      endDate: endDate
    }),
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Sales request failed with status ${response.status}`);
  }
  const responseType = response.headers.get("X-Activity-Type");
  const responseSource = response.headers.get("X-Activity-Source");
  const expectedSource = options.type === "inventory"
    ? "/stock/findGoodsAnalyze" : "/sellAccountCode/findGoodsAnalyze";
  if ((responseType && responseType !== options.type) ||
      (responseSource && responseSource !== expectedSource)) {
    throw new Error("Activity request returned the wrong source. Deploy the updated salesperformance Worker.");
  }
  // The original sales-only Worker ignores type and can return sales rows
  // for an inventory request. Require the stock source before counting inserts.
  if (options.type === "inventory" &&
      (responseType !== "inventory" || responseSource !== expectedSource)) {
    throw new Error("Insert source could not be verified. Deploy the updated salesperformance Worker for stock data.");
  }
  return response.text();
}


async function loadSalesPerformanceRows(code, options = {}) {
  // Snapshot the period before awaiting the session or activity response.
  const requestOptions = {
    type: "sales",
    beginDate: state.salesBeginDate,
    endDate: state.salesEndDate,
    ...options
  };
  const cookie = await getCookieForRequests();
  const responseText = await fetchSalesPerformance(code, cookie, requestOptions);
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("Activity response was not valid JSON. Refresh your login and retry.");
  }
  const rows = extractSalesRows(parsed);
  if (requestOptions.type === "inventory" && rows.some(function (row) {
    return String(row?.invoicesType || "").trim() === "结算记录";
  })) {
    throw new Error("Insert request returned sales records. Deploy the updated salesperformance Worker.");
  }
  return rows;
}


function startSalesPerformanceLookup(barcode) {
  const code = String(barcode || "").trim();
  const lookupSequence = state.salesLookupSequence + 1;
  state.salesLookupSequence = lookupSequence;
  state.salesBarcode = code;
  state.salesRows = [];
  state.salesAbortController?.abort();
  state.salesAbortController = new AbortController();
  state.hasSalesResult = false;
  state.salesError = false;
  state.isSalesLoading = Boolean(code);
  renderSalesQuantity();

  if (!code) {
    return;
  }

  return loadSalesPerformanceRows(code, { signal: state.salesAbortController.signal })
    .then(function (rows) {
      if (lookupSequence !== state.salesLookupSequence) {
        return;
      }
      state.salesRows = rows;
      state.hasSalesResult = true;
      state.isSalesLoading = false;
      renderSalesQuantity();
    })
    .catch(function () {
      if (lookupSequence !== state.salesLookupSequence) {
        return;
      }
      state.salesRows = [];
      state.isSalesLoading = false;
      state.salesError = true;
      renderSalesQuantity();
    });
}


function openSalesPeriodDialog() {
  state.els.salesPeriodStartInput.value = state.salesBeginDate;
  state.els.salesPeriodEndInput.value = state.salesEndDate;
  state.els.salesPeriodStatus.textContent = "";
  state.els.salesPeriodDialog.classList.add("is-open");
  state.els.salesPeriodDialog.setAttribute("aria-hidden", "false");
}


function closeSalesPeriodDialog() {
  state.els.salesPeriodDialog.classList.remove("is-open");
  state.els.salesPeriodDialog.setAttribute("aria-hidden", "true");
}


function applySalesPeriod(beginDate, endDate) {
  const nextBeginDate = String(beginDate || "").trim();
  const nextEndDate = String(endDate || "").trim();

  if (nextBeginDate && nextEndDate) {
    const begin = parseSalesDate(nextBeginDate);
    const end = parseSalesDate(nextEndDate);
    if (begin && end && begin > end) {
      state.els.salesPeriodStatus.textContent = "Start must be before end.";
      return false;
    }
  }

  state.salesBeginDate = nextBeginDate;
  state.salesEndDate = nextEndDate;
  renderSalesQuantity();
  if (state.salesBarcode) {
    startSalesPerformanceLookup(state.salesBarcode);
  }
  return true;
}


function isUnapprovedInventoryRow(row) {
  // billStatusDesc describes the current state. The other status strings
  // label actions (approve/unapprove) and can show the opposite state.
  const status = String(row?.billStatusDesc || "").replace(/<[^>]*>/g, "").trim();
  if (status.includes("未审核")) return true;
  if (status.includes("已审核")) return false;
  // The ERP also represents unapproved stock entries with bill_status 1.
  return String(row?.bill_status ?? "").trim() === "1";
}


function sumActivityPeriods(rows, today) {
  const end = parseSalesDate(today, true);
  return [1, 7, 30, 90].map(function (days) {
    const begin = parseSalesDate(today);
    begin.setDate(begin.getDate() - (days - 1));
    return rows.reduce(function (total, row) {
      const date = parseSalesDate(row?.operatortime);
      return date && date >= begin && date <= end ? total + getSalesRowQuantity(row) : total;
    }, 0);
  });
}


function renderProductActivity() {
  const slide = state.els?.productActivitySlide;
  if (!slide) return;
  slide.setAttribute("aria-busy", state.isProductActivityLoading ? "true" : "false");
  state.els.productActivityLoader.hidden = !state.isProductActivityLoading;
  const status = state.els.productActivityStatus;
  status.textContent = state.productActivityError;
  status.hidden = !state.productActivityError;
  state.els.productActivityRetryBtn.hidden = !state.productActivityError;
  slide.querySelectorAll("[data-activity-type]").forEach(function (element) {
    const totals = state.productActivityTotals?.[element.dataset.activityType];
    element.textContent = totals ? formatSalesQuantity(totals[Number(element.dataset.periodIndex)]) : "—";
  });
}


function startProductActivityLookup(lookupOptions = {}) {
  const code = state.salesBarcode;
  const today = getSalesPeriodDate(0);
  if (!code || state.isProductActivityLoading || (state.productActivityError && !lookupOptions.retry) ||
      (state.productActivityTotals && state.productActivityDate === today)) return;
  const sequence = ++state.productActivityLookupSequence;
  state.productActivityAbortController?.abort();
  const controller = new AbortController();
  state.productActivityAbortController = controller;
  state.isProductActivityLoading = true;
  state.productActivityTotals = null;
  state.productActivityError = "";
  renderProductActivity();
  const options = { beginDate: getSalesPeriodDate(89), endDate: today, signal: controller.signal };
  return Promise.all([
    loadSalesPerformanceRows(code, { ...options, type: "sales" }),
    loadSalesPerformanceRows(code, { ...options, type: "inventory" })
  ]).then(function ([sales, inventory]) {
    if (sequence !== state.productActivityLookupSequence) return;
    state.productActivityTotals = {
      sales: sumActivityPeriods(sales, today),
      inventory: sumActivityPeriods(inventory.filter(function (row) {
        return !isUnapprovedInventoryRow(row);
      }), today)
    };
    state.productActivityDate = today;
  }).catch(function (error) {
    if (sequence !== state.productActivityLookupSequence) return;
    controller.abort();
    state.productActivityError = error.message || "Could not load sales and inventory. Try again.";
  }).finally(function () {
    if (sequence !== state.productActivityLookupSequence) return;
    state.isProductActivityLoading = false;
    renderProductActivity();
  });
}
