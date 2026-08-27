"use strict";

/* Background sales quantity lookup */

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
    return [];
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
  return [];
}


function getSalesTotalCount(payload) {
  const total = Number(payload?.total ?? payload?.recordsTotal ?? payload?.count);
  return Number.isFinite(total) && total > 0 ? total : 0;
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
  state.salesLookupSequence += 1;
  state.salesBarcode = "";
  state.salesRows = [];
  state.isSalesLoading = false;
  renderSalesQuantity();
}


async function fetchSalesPerformancePage(code, cookie, page, rows) {
  const beginDate = formatSalesDateForRequest(state.salesBeginDate);
  const endDate = formatSalesEndDateForRequest(state.salesEndDate);
  const proxyEndpoint = String(CONFIG.salesPerformanceProxyEndpoint || "").trim();

  if (proxyEndpoint) {
    const response = await fetch(proxyEndpoint, {
      method: "POST",
      body: JSON.stringify({
        goodsCode: code,
        barcode: code,
        cookie: cookie,
        beginDate: beginDate,
        endDate: endDate,
        page: page,
        rows: rows
      }),
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Sales request failed with status ${response.status}`);
    }
    return response.text();
  }

  const url = new URL(CONFIG.salesPerformanceEndpoint);
  url.searchParams.set("goodsCode", code);
  url.searchParams.set("person", "");
  url.searchParams.set("operator", "");
  url.searchParams.set("beginDate", beginDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("page", String(page));
  url.searchParams.set("rows", String(rows));

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  if (!response.ok) {
    throw new Error(`Sales request failed with status ${response.status}`);
  }
  return response.text();
}


async function loadSalesPerformanceRows(code) {
  const cookie = await getCookieForRequests();
  const rowsPerPage = Math.max(1, Number(CONFIG.salesPerformanceRows || 500) || 500);
  const maxPages = 20;
  const allRows = [];
  let totalCount = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const responseText = await fetchSalesPerformancePage(code, cookie, page, rowsPerPage);
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error("Sales response was not valid JSON.");
    }

    const pageRows = extractSalesRows(parsed);
    totalCount = totalCount || getSalesTotalCount(parsed);
    allRows.push(...pageRows);

    if (pageRows.length < rowsPerPage || (totalCount > 0 && allRows.length >= totalCount)) {
      break;
    }
  }

  return allRows;
}


function startSalesPerformanceLookup(barcode) {
  const code = String(barcode || "").trim();
  const lookupSequence = state.salesLookupSequence + 1;
  state.salesLookupSequence = lookupSequence;
  state.salesBarcode = code;
  state.salesRows = [];
  state.isSalesLoading = Boolean(code);
  renderSalesQuantity();

  if (!code) {
    return;
  }

  loadSalesPerformanceRows(code)
    .then(function (rows) {
      if (lookupSequence !== state.salesLookupSequence) {
        return;
      }
      state.salesRows = rows;
      state.isSalesLoading = false;
      renderSalesQuantity();
    })
    .catch(function () {
      if (lookupSequence !== state.salesLookupSequence) {
        return;
      }
      state.salesRows = [];
      state.isSalesLoading = false;
      if (state.els?.salesQuantityField) {
        state.els.salesQuantityField.textContent = "-";
      }
      if (state.els?.salesQuantityLoader) {
        state.els.salesQuantityLoader.hidden = true;
      }
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
  state.salesBeginDate = String(beginDate || "").trim();
  state.salesEndDate = String(endDate || "").trim();

  if (state.salesBeginDate && state.salesEndDate) {
    const begin = parseSalesDate(state.salesBeginDate);
    const end = parseSalesDate(state.salesEndDate);
    if (begin && end && begin > end) {
      state.els.salesPeriodStatus.textContent = "Start must be before end.";
      return false;
    }
  }

  renderSalesQuantity();
  if (state.salesBarcode) {
    startSalesPerformanceLookup(state.salesBarcode);
  }
  return true;
}
