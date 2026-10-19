'use strict';
/* LG Insights — static web app. Default API base is the same-origin Vercel
   cookie proxy (/api/erp -> LG ERP), so the browser never talks
   cross-origin. Absolute bases (direct ERP or worker.js proxy) still work. */
const ERP_ORIGIN = 'https://www.lgerp.cc';
const DEFAULT_API = '/api/erp';
const SESSION_KEY = 'lg.session';
const CREDENTIALS_KEY = 'lg.credentials';
const ACCOUNT_KEY = 'lg.account';
const ACCOUNTS_KEY = 'lg.accounts';
const VIEW_KEY = 'lg.view';
const ITEM_PAGE_SIZE = 100;
const ITEM_REQUEST_ROWS = 200;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = n => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const num = n => new Intl.NumberFormat('en-IE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const num0 = n => new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 }).format(Number(n) || 0);
const num2 = n => new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const today = () => localDate(new Date());
function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const settings = { apiBase: DEFAULT_API };
let sid = localStorage.getItem('lg.sid');
if (!sid) { sid = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); localStorage.setItem('lg.sid', sid); }
let state = { view: 'revenue', signedIn: false, account: null, busy: false, revenue: null, items: null, research: null, goodsReceived: null, itemsTab: 'products', receivedSort: { key: 'profitAmount', dir: -1 }, supplierSort: { key: 'name', dir: 1 }, itemSort: { key: 'quantity', dir: -1 }, loadedPage: 1 };
let toastTimer;
let activeReportController = null;
let loginRecoveryPromise = null;
let authGeneration = 0;
let supplierValues = [];
let selectedSuppliers = new Set();
const periodSupplierSalesCache = new Map();

function supplierSalesCacheKey(fields) {
  const account = state.account || savedAccount() || savedCredentials() || {};
  return JSON.stringify([settings.apiBase, account.shopkey || '', account.login_name || '', ...Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, String(value)])]);
}
function groupPeriodSupplierSales(data) {
  const suppliers = new Map();
  for (const item of Array.isArray(data) ? data : data.rows) {
    const name = String(item.memeberid ?? ''), key = receivedSupplierKey(name);
    if (!suppliers.has(key)) suppliers.set(key, { supplier: name || 'Unassigned supplier', annualSales: 0 });
    suppliers.get(key).annualSales += Number(item.price) || 0;
  }
  return [...suppliers.values()];
}
async function loadItemsReport(fields) {
  const key = supplierSalesCacheKey(fields);
  const report = await reportWithRecovery('items', '/sellAccountCode/statisticsGoodsSupplierInfo', fields);
  checkReportCancelled();
  if (key === supplierSalesCacheKey(fields)) periodSupplierSalesCache.set(key, groupPeriodSupplierSales(report.data));
  return report;
}

async function loadRevenue(from, to) {
  const started = performance.now();
  const fields = { statement_beginDate: from, statement_endDate: to, person: '', overPrintIva: '-1', flag: '9', funName: '日期统计' };
  const result = await reportWithRecovery('revenue', '/sellAccountCode/account_statement', fields);
  checkReportCancelled();
  return { ...result, operation: 'revenue', elapsed: Math.round(performance.now() - started), requestFields: fields };
}

function reportCancelled() {
  const failure = Error('Report cancelled.');
  failure.cancelled = true;
  return failure;
}

function checkReportCancelled() { if (activeReportController && activeReportController.signal.aborted) throw reportCancelled(); }

function datePreset(range, now = new Date()) {
  const end = new Date(now), start = new Date(now);
  if (range === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  if (range === 'week') start.setDate(start.getDate() - 6);
  if (range === 'month') start.setDate(1);
  if (range === 'quarter') {
    const day = start.getDate();
    start.setDate(1); start.setMonth(start.getMonth() - 3);
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
  }
  if (range === 'year') { start.setMonth(0, 1); }
  return { from: localDate(start), to: localDate(end) };
}

function updateDatePresets() {
  const from = $('dateFrom').value, to = $('dateTo').value, now = new Date();
  document.querySelectorAll('[data-range]').forEach(button => {
    const dates = datePreset(button.dataset.range, now);
    const active = !!from && !!to && from === dates.from && to === dates.to;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function savedSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function savedView() { try { const v = localStorage.getItem(VIEW_KEY); return v === 'items' || v === 'revenue' || v === 'research' ? v : 'revenue'; } catch { return 'revenue'; } }
function savedAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
    return saved && saved.apiBase === settings.apiBase && ['shopkey', 'login_name'].every(key => typeof saved[key] === 'string' && saved[key]) ? { shopkey: saved.shopkey, login_name: saved.login_name } : null;
  } catch { return null; }
}
function rememberAccount(fields) {
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ apiBase: settings.apiBase, shopkey: fields.shopkey, login_name: fields.login_name })); } catch {}
}
function loadSavedAccounts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter(a => a && typeof a.shopkey === 'string' && a.shopkey.trim() && typeof a.login_name === 'string' && a.login_name.trim() && typeof a.password === 'string' && a.password && (!a.apiBase || a.apiBase === settings.apiBase));
  } catch { return []; }
}
function persistSavedAccounts(list) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch {}
}
function rememberSavedAccount(fields) {
  try {
    const shopkey = String(fields.shopkey || '').trim(), loginName = String(fields.login_name || '').trim(), password = String(fields.password || '');
    if (!shopkey || !loginName || !password) return;
    const rest = loadSavedAccounts().filter(a => a.shopkey.toLowerCase() !== shopkey.toLowerCase());
    rest.unshift({ apiBase: settings.apiBase, shopkey, login_name: loginName, password, updatedAt: Date.now() });
    persistSavedAccounts(rest.slice(0, 20));
  } catch {}
}
function removeSavedAccount(shopkey) {
  try { persistSavedAccounts(loadSavedAccounts().filter(a => a.shopkey.toLowerCase() !== String(shopkey).toLowerCase())); } catch {}
}
let renderedAccounts = [];
function renderSavedLogins() {
  const toggle = $('savedLoginsToggle'), box = $('savedLoginsList'), count = $('savedLoginsCount');
  if (!toggle || !box || !count) return;
  const list = loadSavedAccounts();
  renderedAccounts = list;
  count.textContent = String(list.length);
  if (!list.length) { box.innerHTML = '<div class="saved-empty">No saved logins yet. They appear here after you log in.</div>'; return; }
  box.innerHTML = list.map((a, i) => `<div class="saved-row"><div class="saved-info"><b>${esc(a.shopkey)}</b><span>${esc(a.login_name)}</span><span class="saved-pass" data-pass="${i}">••••••</span></div><button type="button" data-show="${i}">Show</button><button type="button" data-use="${i}">Use</button><button type="button" data-del="${esc(a.shopkey)}" aria-label="Delete saved login ${esc(a.shopkey)}">×</button></div>`).join('');
}
function savedCredentials() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CREDENTIALS_KEY));
    if (saved && saved.apiBase === settings.apiBase && ['shopkey', 'login_name', 'password'].every(key => typeof saved.fields[key] === 'string' && saved.fields[key])) return saved.fields;
  } catch {}
  // Fallback: password persisted by a previous successful Login (saved logins),
  // so expired sessions can re-login silently even in a fresh tab.
  try {
    const identity = savedAccount();
    if (!identity) return null;
    const match = loadSavedAccounts().find(a => a.shopkey.toLowerCase() === identity.shopkey.toLowerCase());
    if (match && match.password) return { shopkey: match.shopkey, login_name: match.login_name, password: match.password };
  } catch {}
  return null;
}
function rememberCredentials(fields) {
  rememberAccount(fields);
  // Tab storage survives refresh without keeping the password after this tab closes.
  try { sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ apiBase: settings.apiBase, fields: { shopkey: fields.shopkey, login_name: fields.login_name, password: fields.password } })); } catch {}
}
function forgetCredentials() { try { sessionStorage.removeItem(CREDENTIALS_KEY); } catch {} }


function apiOrigin() { try { return new URL(settings.apiBase, location.origin).origin; } catch { return null; } }
function isProxy() { const o = apiOrigin(); return !o || o !== new URL(ERP_ORIGIN).origin; }
function isLocalProxy() { try { return apiOrigin() === location.origin; } catch { return false; } }
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4500); }
function error(message) { $('globalError').textContent = message || ''; }

/* Low-level call. Direct mode uses cookies (credentials:include) and no custom
   headers to avoid CORS preflight. Cloudflare-worker mode sends X-Session so
   worker.js can keep the ERP cookie jar server-side. Same-origin modes
   (Vercel rewrite /api/lg, or /api/erp serverless) use cookies handled by
   the browser and never trigger CORS. */
async function upstream(path, { method = 'POST', form = null, formData = null, get = false } = {}) {
  const headers = { 'Accept': 'application/json, text/javascript, */*; q=0.01' };
  const local = isLocalProxy();
  const init = { method, headers, credentials: (isProxy() && !local) ? 'omit' : 'include' };
  if (activeReportController) init.signal = activeReportController.signal;
  if (isProxy() && !local) headers['X-Session'] = sid;
  if (formData) init.body = formData;
  else if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; init.body = new URLSearchParams(form).toString(); }
  let r;
  try { r = await fetch(settings.apiBase + path, init); }
  catch (e) {
    if (init.signal && init.signal.aborted) throw reportCancelled();
    if (isProxy()) throw Error('Could not reach the proxy at ' + settings.apiBase + '. Check the URL for typos, then make sure the latest deployment is Ready.');
    throw Error('Could not reach LG ERP directly — browsers often block cross-site logins.');
  }
  let text;
  try { text = await r.text(); }
  catch (e) { if (init.signal && init.signal.aborted) throw reportCancelled(); throw e; }
  if (r.status === 404 && isLocalProxy() && r.headers.get('X-LG-Proxy') !== '1') {
    const failure = Error('The Vercel proxy route is missing. Upload api/proxy.js and vercel.json, then redeploy. Check /api/erp: it should say "LG Insights proxy is running."');
    failure.proxyUnavailable = true;
    throw failure;
  }
  return { status: r.status, text };
}

function parse(text) { try { return JSON.parse(text); } catch { return null; } }

async function authenticate(fields) {
  if (!isProxy()) { try { await fetch(settings.apiBase + '/login', { credentials: 'include' }); } catch {} }
  else if (isLocalProxy()) { try { await upstream('/login', { method: 'GET' }); } catch {} }
  const fd = new FormData();
  fd.append('shopkey', fields.shopkey); fd.append('login_name', fields.login_name); fd.append('password', fields.password);
  const { status, text } = await upstream('/login.do', { formData: fd });
  if (status === 404) throw Error('LG ERP returned 404 for /login.do. The proxy was reached, but the login endpoint was not found.');
  const data = parse(text);
  if (!(status >= 200 && status < 300 && data && String(data.code) === '0')) {
    const failure = Error('LG ERP did not accept these credentials. Check the shop key, login name, and password.');
    failure.credentialsRejected = status >= 200 && status < 500;
    throw failure;
  }
}

async function doLogin(fields) {
  if (state.busy) return null;
  busy(true); error(''); forgetCredentials(); setSession(false);
  try {
    const t0 = performance.now();
    await authenticate(fields);
    authGeneration++;
    rememberCredentials(fields);
    rememberSavedAccount(fields);
    setSession(true);
    toast(`Account connected · ${Math.round(performance.now() - t0)} ms`);
    return true;
  } catch (e) { $('loginError').textContent = e.message; error(e.message); return null; }
  finally { busy(false); }
}

async function postReport(path, fields, method = 'POST') {
  const t0 = performance.now();
  const { status, text } = await upstream(path, method === 'GET' ? { method: 'GET' } : { form: fields });
  if (status === 404) throw Error('LG ERP returned 404 for ' + path + '. The proxy was reached, but the report endpoint was not found.');
  const data = parse(text);
  return { status, body: text, data, elapsed: Math.round(performance.now() - t0), bytes: new TextEncoder().encode(text).length };
}

function checkSession(path, status, data, text) {
  if (status === 401 || status === 403 || status === 301 || status === 302 || status === 303 || status === 307 || status === 308) return false;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (['401', '403'].includes(String(data.stateCode)) || ['401', '403'].includes(String(data.code))) return false;
    if (data.success === false || String(data.success).toLowerCase() === 'false') return 'bad';
    if (data.code !== undefined && String(data.code) !== '0') return 'bad';
  }
  if (path !== 'chart' && data === null && text && (text.includes('name="password"') || text.includes('login.do'))) return false;
  return true;
}

function validateReport(kind, response) {
  const session = checkSession(kind, response.status, response.data, response.body);
  let validData = kind === 'revenue' ? response.data && response.data.data : Array.isArray(response.data) || response.data && Array.isArray(response.data.rows);
  if (kind === 'received-preview') { try { goodsReceivedPath(response.body); validData = true; } catch { validData = false; } }
  if (kind === 'received-html') validData = /<table\b/i.test(response.body) && /cel_total_quantity_/.test(response.body);
  if (session === false || !(response.status >= 200 && response.status < 300) || session === 'bad' || !validData) {
    const failure = Error(session === false ? 'Your session has expired. Connect your account again.' : 'LG ERP did not accept this report request.');
    failure.sessionExpired = session === false;
    throw failure;
  }
  return response;
}

function restoreLogin(fields) {
  if (!loginRecoveryPromise) {
    loginRecoveryPromise = (async () => {
      toast('Reconnecting to LG ERP…');
      try { await authenticate(fields); authGeneration++; setSession(true); }
      catch (e) {
        if (e.credentialsRejected) { forgetCredentials(); setSession(false); openLogin(); }
        throw e;
      }
    })().finally(() => { loginRecoveryPromise = null; });
  }
  return loginRecoveryPromise;
}

async function reportWithRecovery(kind, path, fields, method = 'POST') {
  checkReportCancelled();
  const credentials = savedCredentials();
  const generation = authGeneration;
  let recovered = false;
  if (!state.signedIn && credentials) { await restoreLogin(credentials); recovered = true; }
  try { return validateReport(kind, await postReport(path, fields, method)); }
  catch (firstFailure) {
    if (firstFailure.proxyUnavailable || firstFailure.cancelled) throw firstFailure;
    if (!credentials || recovered) {
      if (firstFailure.sessionExpired) { setSession(false); openLogin(); }
      throw firstFailure;
    }
    // One login and one replay only, using the original dates, page and fields.
    if (loginRecoveryPromise || generation === authGeneration) await restoreLogin(credentials);
    try { return validateReport(kind, await postReport(path, fields, method)); }
    catch (retryFailure) {
      if (retryFailure.cancelled) throw retryFailure;
      if (retryFailure.sessionExpired) { setSession(false); openLogin(); }
      throw Error(retryFailure.message + ' Automatic re-login and retry did not resolve it.');
    }
  }
}

/* BETA: split long ranges into 30-day chunks, fetch all chunks in parallel,
   then merge locally. Single-chunk ranges use the original one-request path. */
function splitRange30(from, to) {
  const out = [];
  const s0 = new Date(from + 'T00:00:00'), e0 = new Date(to + 'T00:00:00');
  if (isNaN(s0) || isNaN(e0) || s0 > e0) return out;
  let s = new Date(s0);
  while (s <= e0) {
    const cs = new Date(s);
    let ce = new Date(s); ce.setDate(ce.getDate() + 29);
    if (ce > e0) ce = new Date(e0);
    out.push({ from: localDate(cs), to: localDate(ce) });
    s = new Date(ce); s.setDate(s.getDate() + 1);
  }
  return out;
}
function showChunkProgress(text) {
  const el = $('reportProgress');
  el.textContent = text;
  el.classList.remove('hidden');
}
function mergeRevenueChunks(resps) {
  const labelOrder = [], seen = new Set(), seriesNames = [];
  for (const r of resps) {
    const d = r && r.data && r.data.data;
    if (!d) continue;
    for (const s of (d.series || [])) if (!seriesNames.includes(s.name)) seriesNames.push(s.name);
    for (const y of (d.yAxis || [])) if (!seen.has(y)) { seen.add(y); labelOrder.push(y); }
  }
  const sums = new Map(), totals = [];
  for (const r of resps) {
    const d = r && r.data && r.data.data;
    if (!d) continue;
    (d.yAxis || []).forEach((y, i) => {
      if (!sums.has(y)) sums.set(y, new Map());
      const m = sums.get(y);
      for (const s of (d.series || [])) {
        const raw = s.data && s.data[i];
        const v = (raw && typeof raw === 'object') ? Number(raw.value) || 0 : Number(raw) || 0;
        m.set(s.name, (m.get(s.name) || 0) + v);
      }
    });
    (d.totalArr || []).forEach((v, i) => { totals[i] = (totals[i] || 0) + (Number(v) || 0); });
  }
  return { yAxis: labelOrder, series: seriesNames.map(name => ({ name, data: labelOrder.map(y => (sums.get(y) && sums.get(y).get(name)) || 0) })), totalArr: totals };
}
function mergeItemsChunks(resps) {
  const byKey = new Map();
  for (const r of resps) {
    const d = r && r.data;
    const arr = Array.isArray(d) ? d : (d && Array.isArray(d.rows) ? d.rows : []);
    for (const row of arr) {
      const key = String(row.accountCode ?? row.accountName ?? '');
      if (!byKey.has(key)) { byKey.set(key, { ...row, supplierNames: row.supplierNames ? [...row.supplierNames] : row.supplierNames }); continue; }
      const m = byKey.get(key);
      m.quantity = (Number(m.quantity) || 0) + (Number(row.quantity) || 0);
      m.price = (Number(m.price) || 0) + (Number(row.price) || 0);
      if (row.yesMoney !== undefined && row.yesMoney !== null) m.yesMoney = row.yesMoney;
      if (!m.memeberid && row.memeberid) m.memeberid = row.memeberid;
      if (row.supplierNames) m.supplierNames = [...new Set([...(m.supplierNames || []), ...row.supplierNames])];
    }
  }
  return [...byKey.values()];
}
async function runReport() {
  if (state.busy) return false;
  if (!state.signedIn && !savedCredentials()) { openLogin(); return false; }
  const view = state.view;
  activeReportController = new AbortController();
  busy(true); error('');
  try {
    if (view === 'items' && state.itemsTab === 'received') {
      const year = $('receivedYear').value.trim();
      if (!/^\d{4}$/.test(year) || Number(year) < 1900) throw Error('Choose a valid four-digit report year.');
      const report = await loadGoodsReceived(year);
      checkReportCancelled();
      state.goodsReceived = report;
      renderGoodsReceived();
      toast(`Goods received loaded · ${year}`);
      return true;
    }
    const from = $('dateFrom').value, to = $('dateTo').value;
    if (!from || !to || from > to) throw Error('Choose a valid date range. The start date must be before the end date.');
    const chunks = splitRange30(from, to);
    if (view === 'revenue') {
      if (chunks.length < 2) {
        const r = await loadRevenue(from, to);
        state.revenue = r;
        renderRevenue();
        toast(`Revenue loaded · ${r.elapsed} ms`);
      } else {
        showChunkProgress(`Loading ${chunks.length} chunks in parallel…`);
        const t0 = performance.now();
        let done = 0;
        const resps = await Promise.all(chunks.map(c => loadRevenue(c.from, c.to).then(r => { done++; showChunkProgress(`Loaded ${done} of ${chunks.length} chunks…`); return r; })));
        checkReportCancelled();
        const elapsed = Math.round(performance.now() - t0);
        state.revenue = { ...resps[0], data: { ...resps[0].data, data: mergeRevenueChunks(resps) }, operation: 'revenue', elapsed, requestFields: { statement_beginDate: from, statement_endDate: to, person: '', overPrintIva: '-1', flag: '9', funName: '日期统计' } };
        renderRevenue();
        toast(`Revenue loaded · ${chunks.length} chunks in parallel · ${elapsed} ms`);
      }
    } else {
      const baseFields = { statement_beginDate: from, statement_endDate: to, flag: '11', page: '1', rows: String(ITEM_REQUEST_ROWS) };
      if (chunks.length < 2) {
        const result = await loadItemsReport(baseFields);
        checkReportCancelled();
        state.items = { ...result, operation: 'items', requestFields: baseFields };
        state.loadedPage = 1;
        renderItems();
        toast(`Sold items loaded · ${result.elapsed} ms`);
      } else {
        showChunkProgress(`Loading ${chunks.length} chunks in parallel…`);
        const t0 = performance.now();
        let done = 0;
        const resps = await Promise.all(chunks.map(c => {
          const f = { ...baseFields, statement_beginDate: c.from, statement_endDate: c.to };
          return loadItemsReport(f).then(r => { done++; showChunkProgress(`Loaded ${done} of ${chunks.length} chunks…`); return r; });
        }));
        checkReportCancelled();
        const elapsed = Math.round(performance.now() - t0);
        state.items = { ...resps[0], data: mergeItemsChunks(resps), operation: 'items', elapsed, requestFields: baseFields };
        state.loadedPage = 1;
        renderItems();
        toast(`Sold items loaded · ${chunks.length} chunks in parallel · ${elapsed} ms`);
      }
    }
    return true;
  } catch (e) {
    if (e.cancelled) toast('Report cancelled.');
    else error(e.message);
    return false;
  }
  finally { activeReportController = null; $('reportProgress').classList.add('hidden'); busy(false); }
}

function busy(on) {
  state.busy = on;
  document.querySelectorAll('button').forEach(b => { if (!['closeLogin', 'showPassword', 'cancelReport', 'cancelResearch', 'cancelGoodsReceived', 'supplierClose', 'clearLoginFields'].includes(b.id)) b.disabled = on; });
  $('cancelReport').classList.toggle('hidden', !on || !activeReportController);
  $('cancelResearch').classList.toggle('hidden', !on || !activeReportController);
  $('runReport').innerHTML = on ? '<span class="loading"></span> Working…' : '<span>↻</span> Run report';
  const receiving = on && state.view === 'items' && state.itemsTab === 'received';
  $('loadGoodsReceived').innerHTML = receiving ? '<span class="loading"></span> Working…' : 'Load annual report';
  $('cancelGoodsReceived').hidden = !receiving || !activeReportController;
  $('receivedYear').disabled = on;
  if (!on) updateItemPagination();
}

function setSession(on) {
  state.signedIn = !!on;
  const account = on && (savedAccount() || savedCredentials());
  state.account = account ? { shopkey: account.shopkey, login_name: account.login_name } : null;
  if (state.account) rememberAccount(state.account);
  try {
    if (on) localStorage.setItem(SESSION_KEY, JSON.stringify({ apiBase: settings.apiBase, connected: true }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
  if (!on) { state.revenue = state.items = state.goodsReceived = null; state.loadedPage = 1; periodSupplierSalesCache.clear(); }
  $('sessionBadge').className = 'badge ' + (on ? 'connected' : '');
  $('sessionText').textContent = on ? 'Connected' : 'Not connected';
  $('connectBtn').textContent = 'Login';
  $('accountLabel').textContent = state.account ? 'Shop key: ' + state.account.shopkey : 'Your workspace';
  $('accountHint').textContent = state.account ? state.account.login_name : on ? 'Connected to LG ERP' : 'No active account';
  // Refresh unloaded panels when login changes, including restored sessions.
  // Keep any loaded report intact during an automatic re-login.
  if (!state.revenue) renderRevenue();
  if (!state.items) renderItems();
  if (!state.goodsReceived) renderGoodsReceived();
}

function clearData() { state.revenue = state.items = state.research = state.goodsReceived = null; state.loadedPage = 1; periodSupplierSalesCache.clear(); $('itemSearch').value = ''; selectedSuppliers.clear(); $('supplierSearch').value = ''; $('supplierSalesSearch').value = ''; $('goodsReceivedSearch').value = ''; renderAll(); }
function openLogin() {
  const account = state.account || savedAccount() || savedCredentials();
  $('shopKey').value = account ? account.shopkey : '';
  $('loginName').value = account ? account.login_name : '';
  $('password').value = ''; $('password').type = 'password'; $('showPassword').textContent = 'Show';
  $('loginModal').classList.remove('hidden'); $('loginError').textContent = '';
  renderSavedLogins();
  $('savedLoginsList').hidden = true;
  $('savedLoginsToggle').setAttribute('aria-expanded', 'false');
  document.body.classList.add('login-open');
  updateKeyboardVars();
  try { $('shopKey').focus({ preventScroll: true }); } catch { $('shopKey').focus(); }
  keepFieldVisible($('shopKey'));
}
function closeLogin() { if (state.busy) return; $('loginModal').classList.add('hidden'); $('password').value = ''; $('password').type = 'password'; $('showPassword').textContent = 'Show'; document.body.classList.remove('login-open'); $('loginModal').classList.remove('keyboard-open'); }

function navigate(view) {
  if (view !== 'revenue' && view !== 'items' && view !== 'research') view = 'revenue';
  state.view = view;
  try { localStorage.setItem(VIEW_KEY, view); } catch {}
  const copy = { revenue: ['Revenue', 'The bigger picture', 'Revenue overview', 'A clear view of your sales, receipts, and payment mix.'], items: ['Sold items', 'Every item tells a story', 'Sold-item explorer', 'Explore products, quantities, and sales across your selected period.'], research: ['Research', 'Every account, one barcode', 'Barcode research', 'One barcode checked against every saved account.'] }[view];
  ['crumb', 'pageEyebrow', 'pageTitle', 'pageSubtitle'].forEach((id, i) => $(id).textContent = copy[i]);
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  ['revenue', 'items', 'research'].forEach(v => $(v + 'View').classList.toggle('hidden', v !== view));
  updateReportFilterVisibility();
  error('');
  fitStatTexts();
}

function fitOneLine(el, min = 8) {
  if (!el || !(el instanceof HTMLElement)) return;
  try {
    el.style.whiteSpace = 'nowrap';
    el.style.fontSize = '';
    const k = 'base' + (window.innerWidth <= 800 ? 'M' : 'D');
    if (!el.dataset[k]) el.dataset[k] = getComputedStyle(el).fontSize;
    el.style.fontSize = el.dataset[k];
    let px = parseFloat(el.dataset[k]) || 12, guard = 60;
    while (guard-- > 0 && px > min && el.scrollWidth > el.clientWidth + 1) { px -= 1; el.style.fontSize = px + 'px'; }
  } catch {}
}
function fitStatTexts() {
  try { document.querySelectorAll('.stats .stat').forEach(card => {
    if (!card.getClientRects().length) return; // hidden tab: keep existing sizes
    card.querySelectorAll('.label, .value, .caption').forEach(el => fitOneLine(el));
  }); } catch {}
}
function statsHTML(values) { return values.map((x, i) => `<div class="panel stat"><div class="label">${esc(x[0])}<span class="tinyicon">${['↗', '◷', '▤', '◇'][i]}</span></div><div class="value">${esc(x[1])}</div>${x[3] ? `<div class="secondary-metric">${esc(x[3].label)} <span>${esc(x[3].value)}</span></div>` : ''}<div class="caption">${esc(x[2])}</div></div>`).join(''); }

const seriesEnglish = { '应收': 'Receivable', '实收': 'Received', '找零': 'Change', '银行卡': 'Card', '现金': 'Cash', '结算总单数': 'Total receipts', '减免': 'Price reduction', '利润': 'Profit' };
const labelSeries = s => seriesEnglish[s] || s;

function revenueRows() {
  const d = state.revenue && state.revenue.data && state.revenue.data.data;
  if (!d) return [];
  return (d.yAxis || []).map((name, i) => { const row = { Group: name }; for (const s of d.series || []) row[labelSeries(s.name)] = typeof (s.data && s.data[i]) === 'object' ? s.data[i] && s.data[i].value : s.data && s.data[i]; return row; });
}

function table(rows, columns, sort, rowOffset = null, summary = null) {
  if (!rows.length && !summary) return '';
  const footer = summary ? `<tfoot><tr><th scope="row" colspan="${columns.length - 1 + (rowOffset !== null ? 1 : 0)}">${esc(summary.label)}</th><td class="number">${esc(summary.value)}</td></tr></tfoot>` : '';
  return `<div class="tablewrap"><table><thead><tr>${rowOffset !== null ? '<th scope="col" aria-label="Row number" style="text-align:right">#</th>' : ''}${columns.map(c => `<th${c.numeric ? ' style="text-align:right"' : ''}>${sort ? `<button data-sort="${esc(c.key)}">${esc(c.label)} <span class="sortarrow" aria-hidden="true">${state.itemSort.key === c.key ? (state.itemSort.dir === 1 ? '↑' : '↓') : '↕'}</span></button>` : esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr${row.isCurrentAccount ? ' class="current-account"' : ''}>${rowOffset !== null ? `<td class="number">${rowOffset + index + 1}</td>` : ''}${columns.map(c => `<td class="${c.numeric ? 'number' : (c.key === 'accountName' || c.key === 'name') ? 'name' : ''}">${esc(c.format ? c.format(row[c.key]) : row[c.key])}</td>`).join('')}</tr>`).join('')}</tbody>${footer}</table></div>`;
}

function renderRevenue() {
  const r = state.revenue, d = r && r.data && r.data.data, t = (d && d.totalArr) || [];
  const val = i => d ? euro(t[i]) : '—';
  const avgReceipt = d && Number(t[5]) ? euro(Number(t[0]) / Number(t[5])) : '—';
  const margin = d && Number(t[0]) ? (Number(t[16]) / Number(t[0]) * 100).toFixed(1) + ' %' : '—';
  $('revenueStats').innerHTML = statsHTML([['Receivable', val(0), 'receivable · selected period'], ['Reported profit', val(16), 'As reported by LG ERP', { label: 'Profit margin', value: margin }], ['Total receipts', d ? num(t[5]) : '—', 'Receipts in the selected period'], ['Average receipt', avgReceipt, 'Receivable ÷ total receipts']]);
  fitStatTexts();
  if (!d) {
    $('paymentChart').innerHTML = '';
    $('revenueBreakdown').innerHTML = ['Total received', 'Items sold', 'Average item price', 'Profit per receipt'].map(k => `<div class="row"><span>${k}${k === 'Profit per receipt' ? '<small class="metric-explanation">Reported profit ÷ total receipts</small>' : k === 'Average item price' ? '<small class="metric-explanation">Receivable ÷ items sold</small>' : ''}</span><b>—</b></div>`).join('');
    $('revenueTable').innerHTML = '';
    $('revenueUpdated').textContent = 'No report loaded'; $('revenuePeriod').textContent = 'Your selected reporting period';
    return;
  }
  const mix = [['Card', Number(t[3]) || 0], ['Cash', Number(t[4]) || 0], ['Buono', Number(t[13]) || 0]];
  const max = Math.max(1, ...mix.map(x => Math.abs(x[1])));
  $('paymentChart').innerHTML = mix.map(([name, value]) => `<div class="barrow"><span>${name}</span><div class="bartrack"><div class="bar" style="width:${Math.abs(value) / max * 100}%"></div></div><span class="barval">${euro(value)}</span></div>`).join('');
  const avgItem = Number(t[7]) ? euro(Number(t[0]) / Number(t[7])) : '—';
  const profitPerReceipt = Number(t[5]) ? euro(Number(t[16]) / Number(t[5])) : '—';
  $('revenueBreakdown').innerHTML = [['Total received', euro(t[1])], ['Items sold', num(t[7])], ['Average item price', avgItem], ['Profit per receipt', profitPerReceipt]].map(([k, v]) => `<div class="row"><span>${k}${k === 'Profit per receipt' ? '<small class="metric-explanation">Reported profit ÷ total receipts</small>' : k === 'Average item price' ? '<small class="metric-explanation">Receivable ÷ items sold</small>' : ''}</span><b>${esc(v)}</b></div>`).join('');
  const rows = revenueRows();
  $('revenueTable').innerHTML = table(rows, Object.keys(rows[0] || {}).map((key, i) => ({ key, label: key, numeric: i > 0, format: i > 0 ? (key === 'Total receipts' ? num0 : num2) : undefined })), false);
  $('revenueUpdated').textContent = `Updated ${r.requestFields.statement_beginDate} — ${r.requestFields.statement_endDate} · ${r.elapsed} ms`;
  $('revenuePeriod').textContent = `${r.requestFields.statement_beginDate} — ${r.requestFields.statement_endDate}`;
}

function itemRows() { const data = state.items && state.items.data; return Array.isArray(data) ? data : (Array.isArray(data && data.rows) ? data.rows : []); }
function updateSupplierOptions(rows) {
  const filter = $('supplierSearch');
  supplierValues = [...new Set(rows.map(row => String(row.memeberid ?? '')).filter(value => value.trim()))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const available = new Set(supplierValues);
  selectedSuppliers = new Set([...selectedSuppliers].filter(supplier => available.has(supplier)));
  const options = '<option value="">All suppliers</option>' + supplierValues.map(supplier => `<option value="${esc(supplier)}">${esc(supplier)}</option>`).join('');
  if (filter.innerHTML !== options) {
    filter.innerHTML = options;
  }
  for (const option of filter.options || []) option.selected = option.value ? selectedSuppliers.has(option.value) : selectedSuppliers.size === 0;
  renderSupplierMenu();
}
function renderSupplierMenu() {
  const query = $('supplierQuery').value.trim().toLowerCase();
  $('supplierLabel').textContent = selectedSuppliers.size > 1 ? `${selectedSuppliers.size} suppliers selected` : [...selectedSuppliers][0] || 'All suppliers';
  $('supplierToggle').title = [...selectedSuppliers].join(', ') || 'All suppliers';
  const matches = ['', ...supplierValues.filter(supplier => supplier.toLowerCase().includes(query))];
  const options = $('supplierOptions');
  const buttons = [...options.querySelectorAll('[data-supplier]')];
  const isSelected = supplier => supplier ? selectedSuppliers.has(supplier) : selectedSuppliers.size === 0;
  // Preserve the focused option and scroll position when only selection changes.
  if (buttons.length === matches.length && buttons.every((button, i) => button.dataset.supplier === matches[i])) {
    buttons.forEach(button => button.setAttribute('aria-selected', String(isSelected(button.dataset.supplier))));
  } else {
    const scrollTop = options.scrollTop;
    options.innerHTML = matches.map(supplier => `<button type="button" class="supplier-option" role="option" aria-selected="${isSelected(supplier)}" data-supplier="${esc(supplier)}"><span class="supplier-check" aria-hidden="true"></span><span>${esc(supplier || 'All suppliers')}</span></button>`).join('');
    options.scrollTop = scrollTop;
  }
}
function toggleSupplierMenu(open) {
  const menu = $('supplierMenu');
  if (!open && menu.hidden) { document.body.classList.remove('supplier-open'); toggleSupplierScrim(false); return; }
  menu.hidden = !open;
  $('supplierToggle').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('supplier-open', open);
  toggleSupplierScrim(open);
  menu.classList.remove('above');
  menu.style.left = ''; menu.style.right = ''; menu.style.maxHeight = '';
  $('supplierOptions').style.maxHeight = '';
  if (open) {
    $('supplierQuery').value = '';
    renderSupplierMenu();
    $('supplierOptions').scrollTop = 0;
    positionSupplierMenu();
    try { $('supplierQuery').focus({ preventScroll: true }); } catch { $('supplierQuery').focus(); }
  } else if (menu.contains(document.activeElement)) {
    try { $('supplierToggle').focus({ preventScroll: true }); } catch { try { $('supplierToggle').focus(); } catch {} }
  }
}
function filteredItems() {
  const q = $('itemSearch').value.toLowerCase().trim();
  return itemRows().filter(r => (!q || [r.accountCode, r.accountName].some(v => String(v ?? '').toLowerCase().includes(q))) && (!selectedSuppliers.size || selectedSuppliers.has(String(r.memeberid ?? '')))).sort((a, b) => {
    const k = state.itemSort.key, x = a[k], y = b[k];
    return state.itemSort.dir * (['yesMoney', 'quantity', 'price', 'total'].includes(k) ? Number(x) - Number(y) : String(x ?? '').localeCompare(String(y ?? '')));
  });
}
const itemColumns = [{ key: 'accountCode', label: 'Item code' }, { key: 'memeberid', label: 'Supplier / memeberid' }, { key: 'accountName', label: 'Product' }, { key: 'quantity', label: 'Quantity', numeric: true, format: num }, { key: 'yesMoney', label: 'Single item price', numeric: true, format: euro }, { key: 'price', label: 'Total', numeric: true, format: euro }];

function updateItemPagination(matchingCount = filteredItems().length) {
  const pages = Math.max(1, Math.ceil(matchingCount / ITEM_PAGE_SIZE));
  state.loadedPage = Math.max(1, Math.min(state.loadedPage, pages));
  $('pageLabel').textContent = 'Page ' + state.loadedPage + ' of ' + pages;
  $('prevPage').disabled = state.busy || !state.items || state.loadedPage <= 1;
  $('nextPage').disabled = state.busy || !state.items || state.loadedPage >= pages;
}

function loadedItemStatsHTML() {
  const rows = itemRows(), has = !!state.items, sum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const suppliers = new Set(rows.flatMap(row => row.supplierNames || (row.memeberid ? [row.memeberid] : [])));
  return statsHTML([['Loaded products', has ? num(rows.length) : '—', 'Loaded report'], ['Units loaded', has ? num(sum('quantity')) : '—', 'Sum of quantity'], ['Total loaded', has ? euro(sum('price')) : '—', 'Sum of item totals'], ['Suppliers loaded', has ? num(suppliers.size) : '—', 'Distinct suppliers']]);
}
function renderItems() {
  const rows = itemRows(), has = !!state.items;
  updateSupplierOptions(rows);
  const filtered = filteredItems();
  updateItemPagination(filtered.length);
  const rowOffset = (state.loadedPage - 1) * ITEM_PAGE_SIZE;
  const visible = filtered.slice(rowOffset, rowOffset + ITEM_PAGE_SIZE);
  $('itemsStats').innerHTML = loadedItemStatsHTML();
  fitStatTexts();
  const filteredTotal = filtered.reduce((total, row) => total + (Number(row.price) || 0), 0);
  $('itemsTable').innerHTML = has ? table(visible, itemColumns, true, rowOffset, { label: 'Total (all matching items)', value: euro(filteredTotal) }) : '';
  $('itemSearch').placeholder = 'Barcode or product name…';
  $('itemSearch').setAttribute('aria-label', 'Search loaded items by barcode or product name');
  $('itemsDescription').textContent = 'Source values, with item codes preserved';
  $('itemsCount').textContent = has ? `${num(visible.length)} shown · ${num(filtered.length)} matching of ${num(rows.length)} loaded · ${state.items.requestFields.statement_beginDate} — ${state.items.requestFields.statement_endDate} · exports include all matches` : 'No items loaded';
  renderSupplierSales();
}

/* Supplier totals are a local grouping of the same filtered rows as the Products tab. */
const normalizeSupplier = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();
function buildSupplierSales(soldItems) {
  const suppliers = new Map();
  soldItems.forEach((item, index) => {
    const key = String(item.memeberid ?? '');
    if (!suppliers.has(key)) suppliers.set(key, { key, name: key || 'Unassigned supplier', total: 0, products: new Set() });
    const supplier = suppliers.get(key);
    supplier.total += Number(item.price) || 0;
    supplier.products.add(String(item.accountCode || item.accountName || `row:${index}`));
  });
  return [...suppliers.values()].map(({ products, ...supplier }) => ({ ...supplier, productCount: products.size }));
}
function supplierSalesReport() {
  const report = state.items;
  return report ? { operation: 'supplier-sales', from: report.requestFields.statement_beginDate, to: report.requestFields.statement_endDate, rows: buildSupplierSales(filteredItems()), elapsed: report.elapsed } : null;
}
function visibleSupplierSales(report = supplierSalesReport()) {
  const query = normalizeSupplier($('supplierSalesSearch').value);
  const { key, dir } = state.supplierSort;
  return ((report && report.rows) || []).filter(row => !query || normalizeSupplier(row.name).includes(query)).sort((a, b) => (key === 'total' ? dir * (a.total - b.total) : dir * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
function renderSupplierSales() {
  const report = supplierSalesReport(), rows = visibleSupplierSales(report);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  $('supplierSalesStats').innerHTML = loadedItemStatsHTML();
  const sortHeader = (key, label, numeric) => `<th scope="col"${numeric ? ' class="supplier-number"' : ''} aria-sort="${state.supplierSort.key === key ? (state.supplierSort.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-supplier-sort="${key}"${state.busy ? ' disabled' : ''}>${label} <span aria-hidden="true">${state.supplierSort.key === key ? (state.supplierSort.dir === 1 ? '↑' : '↓') : '↕'}</span></button></th>`;
  $('supplierSalesTable').innerHTML = report ? `<div class="tablewrap"><table><thead><tr>${sortHeader('name', 'Supplier', false)}${sortHeader('total', 'Total sales', true)}</tr></thead><tbody>${rows.map(row => `<tr><td class="supplier-sales-name">${esc(row.name)}</td><td class="number">${esc(euro(row.total))}</td></tr>`).join('')}${rows.length ? '' : '<tr><td colspan="2" class="supplier-sales-empty">No suppliers match the Products filters and supplier search.</td></tr>'}</tbody><tfoot><tr><th scope="row">Total (all matching suppliers)</th><td class="number">${esc(euro(total))}</td></tr></tfoot></table></div>` : '<div class="empty"><h3>Supplier sales</h3><p>Run a Sold items report to see the loaded products grouped by supplier.</p></div>';
  $('supplierSalesDescription').textContent = report ? `${report.from} — ${report.to} · Grouped from filtered Products rows across all local pages` : 'Products grouped by supplier, with their Total column summed';
  $('supplierSalesCount').textContent = report ? `${num0(rows.length)} shown of ${num0(report.rows.length)} suppliers · Same loaded data as Products` : 'No products loaded';
  fitStatTexts();
}
function goodsReceivedPath(body) {
  const parsed = parse(body), name = (typeof parsed === 'string' ? parsed : body).trim();
  if (!name || /[:?#\r\n]/.test(name)) throw Error('LG ERP did not return a valid report filename.');
  const parts = name.replace(/\\/g, '/').split('/').map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || /[\\/:?#\x00-\x1f]/.test(part)) || !/\.html$/i.test(parts[parts.length - 1])) throw Error('LG ERP did not return a valid report filename.');
  return '/generic/web/' + parts.map(encodeURIComponent).join('/');
}
const receivedNumericKeys = ['documents', 'totalAmount', 'paidAmount', 'unpaidAmount'];
function sumGoodsReceived(rows) {
  return Object.fromEntries(receivedNumericKeys.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
}
function parseGoodsReceivedHTML(html, year) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sourceYear = (doc.body.textContent.match(/统计年份\s*[:：]\s*(\d{4})/) || [])[1];
  if (sourceYear && sourceYear !== String(year)) throw Error('LG ERP returned a report for a different year. Please load the report again.');
  const fields = { documents: 'total_quantity', totalAmount: 'bill_price', paidAmount: 'bill_real_price', unpaidAmount: 'no_pay_price', supplier: 'italian_name', chineseName: 'zh_name' };
  const readNumber = text => {
    const value = text.replace(/[\s,\u00a0]/g, '').replace(/\u2212/g, '-');
    return /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const reportRows = new Set([...doc.querySelectorAll('[class*="cel_total_quantity_"]')].map(cell => cell.closest('tr')).filter(Boolean));
  const rows = [];
  let summary = null;
  for (const tr of reportRows) {
    const cells = [...tr.children];
    const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
      const cell = cells.find(cell => [...cell.classList].some(name => name.startsWith(`cel_${field}_`)));
      return [key, cell ? cell.textContent.replace(/\s+/g, ' ').trim() : ''];
    }));
    const numbers = receivedNumericKeys.map(key => readNumber(values[key]));
    if (numbers.every(value => value === null)) continue; // Repeated page headings and blank layout rows.
    if (numbers.some(value => value === null) || !Number.isInteger(numbers[0])) throw Error('Could not read every amount in the goods-received report. The previous report has been kept.');
    const row = { supplier: values.supplier, chineseName: values.chineseName, ...Object.fromEntries(receivedNumericKeys.map((key, i) => [key, numbers[i]])) };
    if (/^(合计|总计|total|grand total)$/i.test(row.supplier.replace(/^[\s:：]+/, ''))) summary = row;
    else rows.push({ ...row, supplier: row.supplier || row.chineseName || 'Unnamed supplier' });
  }
  if (!summary) throw Error('Could not find the goods-received report totals. The report layout may have changed.');
  const calculated = sumGoodsReceived(rows);
  if (receivedNumericKeys.some(key => Math.abs(calculated[key] - summary[key]) > (key === 'documents' ? 0 : 0.01))) throw Error('The supplier rows do not match the original report totals. The previous report has been kept.');
  return { rows, summary: Object.fromEntries(receivedNumericKeys.map(key => [key, summary[key]])), sourcePages: doc.querySelectorAll('table.jrPage').length || 1 };
}
async function loadAnnualSupplierSales(year) {
  const chunks = splitRange30(`${year}-01-01`, `${year}-12-31`);
  let done = 0;
  showChunkProgress(`Loading annual sales for ${year} · 0 of ${chunks.length} periods…`);
  const results = await Promise.allSettled(chunks.map(async chunk => {
    const fields = { statement_beginDate: chunk.from, statement_endDate: chunk.to, flag: '11', page: '1', rows: String(ITEM_REQUEST_ROWS) };
    const key = supplierSalesCacheKey(fields);
    let sales = periodSupplierSalesCache.get(key);
    if (!sales) {
      const report = await loadItemsReport(fields);
      sales = groupPeriodSupplierSales(report.data);
    }
    checkReportCancelled();
    showChunkProgress(`Loading annual sales for ${year} · ${++done} of ${chunks.length} periods…`);
    return sales;
  }));
  checkReportCancelled();
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  const periods = results.map(result => result.value);
  // Sum each response by supplier before any product merging, so shared barcodes keep their supplier.
  const suppliers = new Map();
  for (const sales of periods) {
    for (const sale of sales) {
      const key = receivedSupplierKey(sale.supplier);
      if (!suppliers.has(key)) suppliers.set(key, { supplier: sale.supplier, annualSales: 0 });
      suppliers.get(key).annualSales += sale.annualSales;
    }
  }
  return [...suppliers.values()];
}
const receivedSupplierKey = value => normalizeSupplier(value).replace(/\s+/g, ' ');
function receivedProfit(annualSales, totalAmount) {
  const profitAmount = annualSales - totalAmount;
  return { profitAmount, profitRatio: totalAmount > 0 ? profitAmount / totalAmount * 100 : null };
}
function compareReceivedSales(purchases, sales) {
  const rows = purchases.map(row => ({ ...row, annualSales: 0 })), aliases = new Map();
  rows.forEach((row, index) => {
    for (const name of [row.supplier, row.chineseName]) {
      const key = receivedSupplierKey(name);
      if (!key) continue;
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(index);
    }
  });
  for (const sale of sales) {
    const matches = aliases.get(receivedSupplierKey(sale.supplier));
    if (matches && matches.size === 1) rows[[...matches][0]].annualSales += sale.annualSales;
    else rows.push({ supplier: sale.supplier, chineseName: '', documents: 0, totalAmount: 0, paidAmount: 0, unpaidAmount: 0, annualSales: sale.annualSales, noPurchaseMatch: true });
  }
  return rows.map(row => ({ ...row, ...receivedProfit(row.annualSales, row.totalAmount) }));
}
function sumReceivedComparison(rows) {
  const totals = sumGoodsReceived(rows), annualSales = rows.reduce((sum, row) => sum + row.annualSales, 0);
  return { ...totals, annualSales, ...receivedProfit(annualSales, totals.totalAmount) };
}
async function loadGoodsReceived(year) {
  const started = performance.now();
  showChunkProgress(`Generating goods-received report for ${year}…`);
  const preview = await reportWithRecovery('received-preview', '/tempdesign/previewStockBillReport', { statement_beginDate: `${year}-01-01`, statement_endDate: `${year}-12-31`, flag: '5' });
  checkReportCancelled();
  const path = goodsReceivedPath(preview.body);
  showChunkProgress(`Loading goods-received report for ${year}…`);
  const report = await reportWithRecovery('received-html', path, {}, 'GET');
  checkReportCancelled();
  const purchases = parseGoodsReceivedHTML(report.body, year);
  const sales = await loadAnnualSupplierSales(year);
  checkReportCancelled();
  return { operation: 'goods-received', year, ...purchases, rows: compareReceivedSales(purchases.rows, sales), elapsed: Math.round(performance.now() - started) };
}
function visibleGoodsReceived() {
  const query = normalizeSupplier($('goodsReceivedSearch').value), { key, dir } = state.receivedSort;
  return ((state.goodsReceived && state.goodsReceived.rows) || []).filter(row => !query || normalizeSupplier(row.supplier + ' ' + row.chineseName).includes(query)).sort((a, b) => {
    if (key === 'profitRatio') {
      if (a.profitRatio === null && b.profitRatio !== null) return 1;
      if (b.profitRatio === null && a.profitRatio !== null) return -1;
      return dir * ((a.profitRatio ?? 0) - (b.profitRatio ?? 0)) || b.profitAmount - a.profitAmount || a.supplier.localeCompare(b.supplier);
    }
    return (key === 'supplier' ? dir * a.supplier.localeCompare(b.supplier, undefined, { numeric: true, sensitivity: 'base' }) : dir * (a[key] - b[key])) || a.supplier.localeCompare(b.supplier);
  });
}
function renderGoodsReceived() {
  const report = state.goodsReceived, rows = visibleGoodsReceived(), totals = sumReceivedComparison(rows);
  $('goodsReceivedStats').innerHTML = statsHTML([['Documents', report ? num0(totals.documents) : '—', 'Matching suppliers'], ['Total purchases', report ? euro(totals.totalAmount) : '—', 'Goods received'], ['Paid', report ? euro(totals.paidAmount) : '—', 'Recorded supplier payments'], ['Profit (€)', report ? euro(totals.profitAmount) : '—', 'Sum of supplier profits']]);
  const columns = [['supplier', 'Supplier'], ['documents', 'Documents'], ['totalAmount', 'Total'], ['paidAmount', 'Paid'], ['unpaidAmount', 'Unpaid'], ['annualSales', 'Annual sales'], ['profitAmount', 'Profit (€)'], ['profitRatio', 'Profit (%)']];
  const format = (key, value) => key === 'documents' ? num0(value) : euro(value);
  const profitCells = row => `<td class="number received-profit ${row.profitAmount > 0 ? 'positive' : row.profitAmount < 0 ? 'negative' : ''}"><span class="received-profit-amount">${esc(euro(row.profitAmount))}</span></td><td class="number"><span class="received-profit-ratio" title="(Annual sales − Total purchases) ÷ Total purchases × 100">${row.profitRatio === null ? '—' : esc(num2(row.profitRatio)) + ' %'}</span></td>`;
  const headers = columns.map(([key, label]) => `<th scope="col"${key !== 'supplier' ? ' class="supplier-number"' : ''} aria-sort="${state.receivedSort.key === key ? (state.receivedSort.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-received-sort="${key}"${state.busy ? ' disabled' : ''}>${label} <span aria-hidden="true">${state.receivedSort.key === key ? (state.receivedSort.dir === 1 ? '↑' : '↓') : '↕'}</span></button></th>`).join('');
  $('goodsReceivedTable').innerHTML = report ? `<div class="tablewrap" tabindex="0" role="region" aria-label="Goods received by supplier"><table><thead><tr>${headers}</tr></thead><tbody>${rows.map(row => `<tr><td class="received-supplier">${esc(row.supplier)}${row.chineseName ? `<small>${esc(row.chineseName)}</small>` : ''}${row.noPurchaseMatch ? '<small>No matching purchase entry</small>' : ''}</td>${receivedNumericKeys.map(key => `<td class="number">${esc(format(key, row[key]))}</td>`).join('')}<td class="number">${esc(euro(row.annualSales))}</td>${profitCells(row)}</tr>`).join('')}${rows.length ? '' : `<tr><td colspan="${columns.length}" class="supplier-sales-empty">No suppliers match your search.</td></tr>`}</tbody><tfoot><tr><th scope="row">Total (matching suppliers)</th>${receivedNumericKeys.map(key => `<td class="number">${esc(format(key, totals[key]))}</td>`).join('')}<td class="number">${esc(euro(totals.annualSales))}</td>${profitCells(totals)}</tr></tfoot></table></div>` : '<div class="empty"><h3>Annual goods received</h3><p>Select a year and load the report to compare supplier purchases and sales.</p></div>';
  $('goodsReceivedDescription').textContent = report ? `Year ${report.year} · Profit ratio = (annual sales − purchases) ÷ purchases × 100` : 'Annual goods-received report from LG ERP';
  $('goodsReceivedCount').textContent = report ? `${num0(rows.length)} of ${num0(report.rows.length)} suppliers · ${num0(report.sourcePages)} report pages · ${report.elapsed} ms` : 'No annual report loaded';
  fitStatTexts();
}
function updateReportFilterVisibility() {
  $('reportFilters').classList.toggle('hidden', state.view === 'research' || (state.view === 'items' && state.itemsTab === 'received'));
}
function switchItemsTab(tab) {
  if (state.busy || !['products', 'suppliers', 'received'].includes(tab)) return;
  state.itemsTab = tab;
  toggleSupplierMenu(false);
  $('itemsProductsPanel').hidden = tab !== 'products';
  $('itemsSuppliersPanel').hidden = tab !== 'suppliers';
  $('itemsReceivedPanel').hidden = tab !== 'received';
  document.querySelectorAll('[data-items-tab]').forEach(button => {
    const active = button.dataset.itemsTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  fitStatTexts();
  updateReportFilterVisibility();
  if (tab === 'suppliers') renderSupplierSales();
  if (tab === 'received') renderGoodsReceived();
}

/* Barcode research (multi-account) — port of RESEARCH_LOGIC.md.
   Browser note: one shared cookie jar, so accounts run SEQUENTIALLY:
   each account logs in fresh (global session moves to it), runs its own
   info + discount requests, then the session is restored by re-logging in
   as the original account. Per-account failures become row errors. */
function flexStr(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}
function flexNum(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function firstJsonObject(text) {
  const data = parse(text);
  if (!data) return null;
  if (Array.isArray(data)) return data[0] && typeof data[0] === 'object' ? data[0] : null;
  if (typeof data !== 'object') return null;
  for (const k of ['product', 'data', 'rows', 'list']) {
    const v = data[k];
    if (Array.isArray(v)) { if (v[0] && typeof v[0] === 'object') return v[0]; }
    else if (v && typeof v === 'object') return v;
  }
  return data;
}
async function researchInfo(barcode) {
  const { status, text } = await upstream('/goods/ongoodsCode?goodCode=' + encodeURIComponent(barcode), { method: 'GET' });
  if (!(status >= 200 && status < 300)) throw Error('info HTTP ' + status);
  const obj = firstJsonObject(text);
  if (!obj) return null;
  const name = flexStr(obj, 'italian_name', 'italianName', 'goods_name', 'name');
  const id = flexStr(obj, 'id', 'goods_id');
  const sPrice = flexNum(obj, 's_price', 'sPrice', 'selling_price', 'sale_price', 'f_s_price', 'price', 'out_price', 'retail_price');
  const sDiscount = flexNum(obj, 's_discount', 'sDiscount');
  const pPrice = flexNum(obj, 'p_price', 'pPrice', 'purchase_price', 'cost', 'f_p_price', 'in_price');
  const stock = flexNum(obj, 'real_inventory', 'realInventory');
  if (!name && !id && !(sPrice > 0) && !(pPrice > 0) && !(stock > 0)) return null;
  return { name, sPrice, sDiscount };
}
async function researchDiscount(barcode, basePrice) {
  const { status, text } = await upstream('/sale/selectBygoodsCode.do', { form: { code: barcode } });
  if (!(status >= 200 && status < 300)) throw Error('discount HTTP ' + status);
  const obj = firstJsonObject(text);
  const rawS = obj ? flexNum(obj, 'sdiscount', 'sDiscount', 's_discount', 'discount', 'disc', 'discount_rate', 'rate') : 0;
  if (!(rawS > 0)) return null;
  const sDiscount = rawS <= 1 ? rawS * 100 : rawS;
  const respPrice = obj ? flexNum(obj, 'discountPrice', 'discount_price', 'discounted_price') : 0;
  const discountPrice = respPrice > 0 ? respPrice : basePrice > 0 ? basePrice * (1 - sDiscount / 100) : null;
  return { sDiscount, discountPrice };
}
function combineResearchRow(acc, info, disc, isCurrent) {
  const base = info.sPrice;
  const effective = disc && disc.sDiscount > 0 ? disc.sDiscount : info.sDiscount > 0 ? info.sDiscount : 0;
  let finalPrice = null;
  if (base > 0) {
    if (disc && disc.sDiscount > 0 && (disc.discountPrice || 0) > 0) finalPrice = disc.discountPrice;
    else if (effective > 0) finalPrice = base * (1 - effective / 100);
    else finalPrice = base;
  }
  return { shopKey: acc.shopkey, loginName: acc.login_name, name: info.name || null, sPrice: base > 0 ? base : null, sDiscount: effective, finalPrice, errorMessage: null, isCurrentAccount: isCurrent };
}
function researchAccounts() {
  const list = [];
  const creds = savedCredentials();
  if (creds && creds.shopkey && creds.login_name && creds.password) list.push({ shopkey: String(creds.shopkey).trim(), login_name: String(creds.login_name).trim(), password: creds.password });
  for (const a of loadSavedAccounts()) {
    if (a.shopkey && !list.some(x => x.shopkey.toLowerCase() === a.shopkey.toLowerCase())) list.push({ shopkey: a.shopkey, login_name: a.login_name, password: a.password });
  }
  return list.filter(a => a.shopkey && a.login_name && a.password);
}
async function researchOneAccount(acc, barcode, isCurrent) {
  const blank = { shopKey: acc.shopkey, loginName: acc.login_name, name: null, sPrice: null, sDiscount: 0, finalPrice: null, errorMessage: null, isCurrentAccount: isCurrent };
  try { await authenticate({ shopkey: acc.shopkey, login_name: acc.login_name, password: acc.password }); }
  catch (e) {
    if (e.cancelled) throw e;
    return { row: { ...blank, errorMessage: 'Login failed: ' + (e.message || 'unknown error') }, loggedIn: false };
  }
  authGeneration++;
  let info = null;
  try { info = await researchInfo(barcode); }
  catch (e) { if (e.cancelled) throw e; info = null; }
  if (!info) return { row: { ...blank, errorMessage: 'Product info failed: No product data' }, loggedIn: true };
  let disc = null;
  try { disc = await researchDiscount(barcode, info.sPrice); }
  catch (e) { if (e.cancelled) throw e; disc = null; }
  return { row: combineResearchRow(acc, info, disc, isCurrent), loggedIn: true };
}
async function runResearch() {
  if (state.busy) return false;
  const barcode = ($('researchBarcode').value || '').trim();
  if (!barcode) { error('Enter a barcode to research.'); try { $('researchBarcode').focus(); } catch {} return false; }
  if (!state.signedIn && !savedCredentials()) { openLogin(); return false; }
  const accounts = researchAccounts();
  if (!accounts.length) { error('No saved ERP accounts. Log in first, then run research.'); openLogin(); return false; }
  const creds = savedCredentials();
  const currentKey = String((creds && creds.shopkey) || (state.account && state.account.shopkey) || accounts[0].shopkey || '').trim();
  const current = accounts.find(a => a.shopkey.toLowerCase() === currentKey.toLowerCase());
  if (currentKey && !current) { error('The current account has no saved password. Log in again first.'); openLogin(); return false; }
  activeReportController = new AbortController();
  busy(true); error('');
  const t0 = performance.now();
  try {
    const rows = [];
    let lastAuthedKey = '';
    for (let i = 0; i < accounts.length; i++) {
      checkReportCancelled();
      const acc = accounts[i];
      const isCurrent = acc.shopkey.toLowerCase() === currentKey.toLowerCase();
      $('researchCount').textContent = `Checking ${i + 1} of ${accounts.length} · ${acc.shopkey}…`;
      const r = await researchOneAccount(acc, barcode, isCurrent);
      if (r.loggedIn) lastAuthedKey = acc.shopkey.toLowerCase();
      rows.push(r.row);
    }
    checkReportCancelled();
    rows.sort((a, b) => ((b.isCurrentAccount ? 1 : 0) - (a.isCurrentAccount ? 1 : 0)) || ((a.finalPrice ?? Number.MAX_VALUE) - (b.finalPrice ?? Number.MAX_VALUE)));
    if (current && lastAuthedKey !== current.shopkey.toLowerCase()) {
      try {
        await authenticate({ shopkey: current.shopkey, login_name: current.login_name, password: current.password });
        authGeneration++; setSession(true);
      } catch (e) {
        if (e.cancelled) throw e;
        setSession(false); openLogin();
        throw Error('Research finished, but the session could not be restored to ' + current.shopkey + '. Connect your account again.');
      }
    } else { authGeneration++; setSession(true); }
    state.research = { operation: 'research', barcode, rows, elapsed: Math.round(performance.now() - t0) };
    renderResearch();
    toast(`Research done · ${rows.length} accounts · ${state.research.elapsed} ms`);
    return true;
  } catch (e) {
    if (e.cancelled) toast('Research cancelled.');
    else error(e.message);
    return false;
  } finally { activeReportController = null; busy(false); }
}
const researchColumns = [{ key: 'shopKey', label: 'Shop' }, { key: 'loginName', label: 'Login' }, { key: 'name', label: 'Product' }, { key: 'sPrice', label: 'List price', numeric: true, format: v => v == null ? '—' : euro(v) }, { key: 'sDiscount', label: 'Discount %', numeric: true, format: v => (!v ? '—' : num(v) + ' %') }, { key: 'finalPrice', label: 'Final price', numeric: true, format: v => v == null ? '—' : euro(v) }, { key: 'note', label: 'Note' }];
function renderResearch() {
  const r = state.research, rows = (r && r.rows) || [], has = !!r;
  const priced = rows.filter(x => x.finalPrice != null);
  const lowest = priced.length ? Math.min(...priced.map(x => x.finalPrice)) : null;
  const current = rows.find(x => x.isCurrentAccount);
  const withData = rows.filter(x => !x.errorMessage).length;
  const lowestRow = lowest == null ? null : rows.find(x => x.finalPrice === lowest);
  $('researchStats').innerHTML = statsHTML([['Researched barcode', has ? esc(r.barcode) : '—', 'Fresh query per account'], ['Current account price', has ? (current && current.finalPrice != null ? euro(current.finalPrice) : '—') : '—', has && current ? 'Shop key: ' + current.shopKey : 'Your active account'], ['Lowest price', has ? (lowest == null ? '—' : euro(lowest)) : '—', has ? (lowestRow ? 'At ' + lowestRow.shopKey : 'Best final price') : 'Best final price'], ['Accounts with data', has ? num(withData) + ' of ' + num(rows.length) : '—', 'Barcode recorded']]);
  fitStatTexts();
  const tableRows = rows.map(x => ({ ...x, name: x.name || '—', note: x.errorMessage || (x.isCurrentAccount ? 'Current account' : '') }));
  $('researchTable').innerHTML = has ? table(tableRows, researchColumns, false) : '';
  $('researchCount').textContent = has ? `${num(rows.length)} rows · ${r.barcode} · ${r.elapsed} ms · exports include all rows` : 'No research yet';
}

function renderAll() { renderRevenue(); renderItems(); renderGoodsReceived(); renderResearch(); }

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportable() { return state.view === 'revenue' ? state.revenue : state.view === 'items' ? (state.itemsTab === 'received' ? state.goodsReceived : state.itemsTab === 'suppliers' ? supplierSalesReport() : state.items) : state.view === 'research' ? state.research : null; }
function exportJSON() {
  const r = exportable();
  if (!r) { toast('Load a report first.'); return; }
  const payload = r.operation === 'research' ? { barcode: r.barcode, rows: r.rows } : r.operation === 'goods-received' ? { year: r.year, profitRatioFormula: '(annualSales - totalAmount) / totalAmount * 100; requires positive totalAmount', rows: visibleGoodsReceived(), totals: sumReceivedComparison(visibleGoodsReceived()) } : r.operation === 'supplier-sales' ? { from: r.from, to: r.to, rows: visibleSupplierSales() } : r.data;
  download(JSON.stringify(payload, null, 2), `lg-${r.operation}-${today()}.json`, 'application/json');
}
function csvCell(value) { let s = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(s) && !/^\s*-?\d+(\.\d+)?\s*$/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
function exportCSV() {
  if (state.view === 'items' && state.itemsTab === 'received') {
    const report = state.goodsReceived;
    if (!report) { toast('Load an annual goods-received report first.'); return; }
    const keys = ['supplier', 'chineseName', ...receivedNumericKeys, 'annualSales', 'profitAmount', 'profitRatio'];
    const csv = [['Supplier', 'Chinese name', 'Documents', 'Total', 'Paid', 'Unpaid', 'Annual sales', 'Profit (sales minus purchases)', 'Profit ratio % (profit / purchases)'], ...visibleGoodsReceived().map(row => keys.map(key => row[key]))].map(row => row.map(csvCell).join(',')).join('\r\n');
    download('\uFEFF' + csv, `lg-goods-received-${report.year}.csv`, 'text/csv');
    return;
  }
  if (state.view === 'items' && state.itemsTab === 'suppliers') {
    const report = supplierSalesReport();
    if (!report) { toast('Run a Sold items report first.'); return; }
    const csv = [['Supplier', 'Products sold', 'Total sales'], ...visibleSupplierSales().map(row => [row.name, row.productCount, row.total])].map(row => row.map(csvCell).join(',')).join('\r\n');
    download('\uFEFF' + csv, `lg-supplier-sales-${report.from}-${report.to}.csv`, 'text/csv');
    return;
  }
  if (state.view === 'research') {
    if (!state.research || !state.research.rows.length) { toast('There are no rows to export.'); return; }
    const keys = ['shopKey', 'loginName', 'name', 'sPrice', 'sDiscount', 'finalPrice', 'errorMessage'];
    const csv = [keys, ...state.research.rows.map(r => keys.map(k => r[k]))].map(row => row.map(csvCell).join(',')).join('\r\n');
    download('﻿' + csv, `lg-research-${today()}.csv`, 'text/csv');
    return;
  }
  const rows = state.view === 'items' ? filteredItems() : revenueRows();
  if (!rows.length) { toast('There are no rows to export.'); return; }
  const keys = state.view === 'items' ? itemColumns.map(c => c.key) : Object.keys(rows[0]);
  const csv = [keys, ...rows.map(r => keys.map(k => r[k]))].map(row => row.map(csvCell).join(',')).join('\r\n');
  download('﻿' + csv, `lg-${state.view}-${today()}.csv`, 'text/csv');
}

/* wiring */
document.querySelectorAll('[data-items-tab]').forEach(button => {
  button.onclick = () => switchItemsTab(button.dataset.itemsTab);
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || state.busy) return;
    event.preventDefault();
    const tabs = ['products', 'suppliers', 'received'];
    const tab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(tabs.indexOf(state.itemsTab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    switchItemsTab(tab);
    document.querySelector(`[data-items-tab="${tab}"]`).focus({ preventScroll: true });
  });
});
$('loadGoodsReceived').onclick = () => runReport();
$('cancelGoodsReceived').onclick = () => { if (activeReportController) activeReportController.abort(); };
$('receivedYear').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); runReport(); } });
$('goodsReceivedSearch').oninput = renderGoodsReceived;
$('goodsReceivedTable').onclick = event => {
  const button = event.target.closest('[data-received-sort]');
  if (!button || state.busy) return;
  const key = button.dataset.receivedSort;
  if (!['supplier', ...receivedNumericKeys, 'annualSales', 'profitAmount', 'profitRatio'].includes(key)) return;
  state.receivedSort = { key, dir: state.receivedSort.key === key ? -state.receivedSort.dir : key === 'supplier' ? 1 : -1 };
  const wrap = $('goodsReceivedTable').querySelector('.tablewrap'), x = wrap.scrollLeft, y = wrap.scrollTop;
  renderGoodsReceived();
  const next = $('goodsReceivedTable').querySelector('.tablewrap');
  next.scrollLeft = x; next.scrollTop = y;
  $('goodsReceivedTable').querySelector(`[data-received-sort="${key}"]`).focus({ preventScroll: true });
};
$('supplierSalesSearch').oninput = renderSupplierSales;
$('supplierSalesTable').onclick = event => {
  if (state.busy) return;
  const sort = event.target.closest('[data-supplier-sort]');
  if (sort) {
    const key = sort.dataset.supplierSort;
    state.supplierSort = { key, dir: state.supplierSort.key === key ? -state.supplierSort.dir : key === 'total' ? -1 : 1 };
    const wrap = $('supplierSalesTable').querySelector('.tablewrap'), x = wrap.scrollLeft, y = wrap.scrollTop;
    renderSupplierSales();
    const nextWrap = $('supplierSalesTable').querySelector('.tablewrap');
    nextWrap.scrollLeft = x; nextWrap.scrollTop = y;
    $('supplierSalesTable').querySelector(`[data-supplier-sort="${key}"]`).focus({ preventScroll: true });
  }
};
document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigate(b.dataset.nav));
document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => {
  const dates = datePreset(b.dataset.range);
  $('dateFrom').value = dates.from; $('dateTo').value = dates.to;
  updateDatePresets();
});
['dateFrom', 'dateTo'].forEach(id => {
  $(id).addEventListener('input', updateDatePresets);
  $(id).addEventListener('change', updateDatePresets);
});
$('connectBtn').onclick = openLogin;
$('avatarLogin').onclick = openLogin;
$('closeLogin').onclick = closeLogin;
$('loginModal').addEventListener('click', e => { if (e.target === $('loginModal')) closeLogin(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('loginModal').classList.contains('hidden')) closeLogin();
  if (!$('supplierMenu').hidden) { toggleSupplierMenu(false); $('supplierToggle').focus(); }
});
$('showPassword').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('showPassword').textContent = show ? 'Hide' : 'Show'; };
$('clearLoginFields').onclick = () => {
  $('shopKey').value = ''; $('loginName').value = ''; $('password').value = '';
  $('password').type = 'password'; $('showPassword').textContent = 'Show';
  $('loginError').textContent = '';
  try { $('shopKey').focus({ preventScroll: true }); } catch { try { $('shopKey').focus(); } catch {} }
  keepFieldVisible($('shopKey'));
};
$('savedLoginsToggle').onclick = () => {
  const box = $('savedLoginsList'), open = box.hidden;
  box.hidden = !open;
  $('savedLoginsToggle').setAttribute('aria-expanded', String(open));
};
$('savedLoginsList').onclick = e => {
  const showBtn = e.target.closest('[data-show]');
  if (showBtn) {
    const acc = renderedAccounts[Number(showBtn.dataset.show)];
    if (!acc) return;
    const passEl = $('savedLoginsList').querySelector('[data-pass="' + showBtn.dataset.show + '"]');
    const showing = showBtn.textContent === 'Hide';
    if (passEl) passEl.textContent = showing ? '••••••' : acc.password;
    showBtn.textContent = showing ? 'Show' : 'Hide';
    return;
  }
  const useBtn = e.target.closest('[data-use]');
  if (useBtn) {
    const acc = renderedAccounts[Number(useBtn.dataset.use)];
    if (!acc) return;
    $('shopKey').value = acc.shopkey; $('loginName').value = acc.login_name; $('password').value = acc.password;
    $('loginError').textContent = '';
    try { $('loginSubmit').focus({ preventScroll: true }); } catch { try { $('loginSubmit').focus(); } catch {} }
    keepFieldVisible($('loginSubmit'));
    return;
  }
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) { e.stopPropagation(); removeSavedAccount(delBtn.dataset.del); renderSavedLogins(); }
};
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const fields = { shopkey: $('shopKey').value, login_name: $('loginName').value, password: $('password').value };
  clearData();
  const ok = await doLogin(fields);
  $('password').value = '';
  if (ok) { closeLogin(); }
};
$('runReport').onclick = () => runReport();
$('cancelReport').onclick = () => { if (activeReportController) activeReportController.abort(); };
$('runResearch').onclick = () => runResearch();
$('cancelResearch').onclick = () => { if (activeReportController) activeReportController.abort(); };
$('researchBarcode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runResearch(); } });
$('itemSearch').oninput = () => { state.loadedPage = 1; renderItems(); };
$('supplierSearch').onchange = () => {
  selectedSuppliers = new Set([...$('supplierSearch').selectedOptions].map(option => option.value).filter(Boolean));
  state.loadedPage = 1; renderItems();
};
$('supplierToggle').onclick = () => toggleSupplierMenu($('supplierMenu').hidden);
$('supplierClose').onclick = e => { e.stopPropagation(); toggleSupplierMenu(false); };
$('supplierQuery').oninput = renderSupplierMenu;
$('supplierOptions').onclick = e => {
  const option = e.target.closest('[data-supplier]');
  if (!option) return;
  e.stopPropagation();
  const supplier = option.dataset.supplier;
  if (!supplier) selectedSuppliers.clear();
  else if (selectedSuppliers.has(supplier)) selectedSuppliers.delete(supplier);
  else selectedSuppliers.add(supplier);
  state.loadedPage = 1; renderItems();
};
$('prevPage').onclick = () => { if (!state.busy && state.items && state.loadedPage > 1) { state.loadedPage--; renderItems(); } };
$('nextPage').onclick = () => { if (!state.busy && state.items && state.loadedPage < Math.ceil(filteredItems().length / ITEM_PAGE_SIZE)) { state.loadedPage++; renderItems(); } };
$('exportJson').onclick = exportJSON;
$('exportCsv').onclick = exportCSV;
document.addEventListener('click', e => {
  if (!e.target.closest('.supplier-filter')) toggleSupplierMenu(false);
  const action = e.target.closest('[data-action]') && e.target.closest('[data-action]').dataset.action;
  if (action === 'connect') openLogin();
  if (action === 'run') runReport();
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    const sort = sortBtn.dataset.sort;
    const hadFocus = document.activeElement === sortBtn;
    const wrap = document.querySelector('#itemsTable .tablewrap');
    const sx = wrap ? wrap.scrollLeft : 0, sy = wrap ? wrap.scrollTop : 0;
    const wx = window.scrollX || 0, wy = window.scrollY || 0;
    state.itemSort = { key: sort, dir: state.itemSort.key === sort ? -state.itemSort.dir : -1 }; state.loadedPage = 1; renderItems();
    const restore = () => {
      const nwrap = document.querySelector('#itemsTable .tablewrap');
      if (nwrap) { nwrap.scrollLeft = sx; nwrap.scrollTop = sy; }
      try { window.scrollTo(wx, wy); } catch {}
    };
    restore();
    if (hadFocus) {
      const nbtn = document.querySelector('#itemsTable [data-sort="' + sort + '"]');
      if (nbtn) { try { nbtn.focus({ preventScroll: true }); } catch { try { nbtn.focus(); } catch {} } }
      restore();
    }
    requestAnimationFrame(restore);
  }
});

$('dateFrom').value = $('dateTo').value = today();
$('receivedYear').value = $('dateFrom').value.slice(0, 4);
updateDatePresets();
navigate(savedView());
renderAll();
const restoredSession = savedSession();
if (restoredSession && restoredSession.apiBase === settings.apiBase && restoredSession.connected) setSession(true);
busy(false);

/* Responsive helpers: keep supplier dropdown in viewport + keep login fields above the virtual keyboard. */
function isSupplierSheetMode() { try { return window.matchMedia('(max-width: 640px)').matches; } catch { return window.innerWidth <= 640; } }
function updateKeyboardVars() {
  const root = document.documentElement;
  let vvH = window.innerHeight, kb = 0;
  try {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.height)) {
      vvH = Math.round(vv.height);
      kb = Math.max(0, Math.round(window.innerHeight - vv.height));
    }
  } catch {}
  try {
    root.style.setProperty('--vv-height', vvH + 'px');
    root.style.setProperty('--kb-offset', kb + 'px');
  } catch {}
  try {
    const loginOpen = !$('loginModal').classList.contains('hidden');
    $('loginModal').classList.toggle('keyboard-open', loginOpen && kb > 80);
  } catch {}
  const active = document.activeElement;
  if (active && active instanceof HTMLElement && $('loginModal').contains(active)) keepFieldVisible(active, true);
  if (!$('supplierMenu').hidden) positionSupplierMenu();
}
function keepFieldVisible(el, fromViewport) {
  // The supplier menu manages its own position; scrolling its ancestors moves click targets.
  if (!el || $('supplierMenu').contains(el)) return;
  requestAnimationFrame(() => {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: fromViewport ? 'auto' : 'smooth' }); } catch {}
    setTimeout(() => { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {} }, fromViewport ? 120 : 200);
  });
}
function positionSupplierMenu() {
  const menu = $('supplierMenu'), filter = document.querySelector('.supplier-filter'), toggle = $('supplierToggle'), options = $('supplierOptions');
  if (menu.hidden || isSupplierSheetMode()) return;
  menu.classList.remove('above');
  menu.style.left = ''; menu.style.right = ''; menu.style.maxHeight = ''; options.style.maxHeight = '';
  try {
    const filterRect = filter.getBoundingClientRect(), toggleRect = toggle.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 280;
    const menuRight = filterRect.width ? filterRect.right : toggleRect.right;
    if (menuRight - menuWidth < 8) { menu.style.left = '0'; menu.style.right = 'auto'; }
    const anchorRect = toggleRect.width ? toggleRect : filterRect;
    const spaceBelow = window.innerHeight - anchorRect.bottom - 12;
    const spaceAbove = anchorRect.top - 12;
    const menuHeight = menu.offsetHeight || 300;
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) menu.classList.add('above');
    const queryH = (($('supplierQuery') && $('supplierQuery').offsetHeight) || 40) + ((document.querySelector('.supplier-head') && document.querySelector('.supplier-head').offsetHeight) || 30);
    const avail = Math.max(0, ((menu.classList.contains('above') ? spaceAbove : spaceBelow) || 240) - queryH - 30);
    options.style.maxHeight = Math.max(120, Math.min(240, avail)) + 'px';
  } catch {}
}
let supplierScrim = null;
function toggleSupplierScrim(show) {
  const need = !!(show && isSupplierSheetMode());
  if (need && !supplierScrim) {
    supplierScrim = document.createElement('button');
    supplierScrim.type = 'button';
    supplierScrim.className = 'supplier-scrim';
    supplierScrim.setAttribute('aria-label', 'Close supplier filter');
    supplierScrim.tabIndex = -1;
    supplierScrim.addEventListener('click', () => toggleSupplierMenu(false));
    document.body.appendChild(supplierScrim);
  }
  if (supplierScrim) supplierScrim.hidden = !need;
  if (!need && supplierScrim && !show && !isSupplierSheetMode()) { try { supplierScrim.remove(); } catch {} supplierScrim = null; }
}
try {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardVars);
    window.visualViewport.addEventListener('scroll', updateKeyboardVars);
  }
  window.addEventListener('resize', () => { updateKeyboardVars(); toggleSupplierScrim(!$('supplierMenu').hidden); if (!$('supplierMenu').hidden) positionSupplierMenu(); fitStatTexts(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { updateKeyboardVars(); if (!$('supplierMenu').hidden) positionSupplierMenu(); }, 120));
  document.addEventListener('focusin', e => {
    if (e.target instanceof HTMLElement && $('loginModal').contains(e.target)) keepFieldVisible(e.target);
  });
  document.addEventListener('scroll', e => { if (e.target instanceof HTMLElement && $('supplierMenu').contains(e.target)) return; if (!$('supplierMenu').hidden) positionSupplierMenu(); }, true);
  updateKeyboardVars();
} catch {}
