import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = fileURLToPath(new URL('../', import.meta.url));
const fields = ['total_quantity', 'bill_price', 'bill_real_price', 'no_pay_price', 'italian_name', 'zh_name'];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const row = values => `<tr>${fields.map((field, i) => `<td class="jrcel cel_${field}_123_0"><span>${esc(values[i])}</span></td>`).join('')}</tr>`;
const heading = row(['总单数', '总金额', '已支付金额', '未支付金额', '发票客户意文名称', '发票客户中文名称']);
function fixture(year, mode) {
  const summary = mode === 'mismatch' ? '121.25' : '120.25';
  return `<html><body><h1>入库记录-年结详情</h1><p>统计年份： ${year}</p><table class="jrPage">${heading}${row([2, '100.25000', '90.00000', '10.25000', 'Alpha', '甲'])}${row(['', '', '', '', '', ''])}</table><table class="jrPage">${heading}${row([1, '20.00000', '20.00000', '0.00000', 'A & B <supplier>', '乙'])}${row([0, '0.00000', '0.00000', '0.00000', 'Zero', ''])}${row([3, summary, '110.00000', '10.25000', '：合计', ''])}</table><script>window.untrustedReportExecuted = true</script></body></html>`;
}
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, name === '/' ? 'index.html' : name.slice(1));
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [], requests = [];
    let mode = 'normal', year = '2026', expired = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('lg.account', JSON.stringify({ apiBase: '/api/erp', shopkey: 'test-shop', login_name: 'tester' }));
      localStorage.setItem('lg.session', JSON.stringify({ apiBase: '/api/erp', connected: true }));
    });
    await page.route('**/api/erp/**', async route => {
      const request = route.request(), endpoint = decodeURIComponent(new URL(request.url()).pathname);
      const params = Object.fromEntries(new URLSearchParams(request.postData() || ''));
      requests.push({ endpoint, method: request.method(), params });
      const reply = (body, status = 200, contentType = 'text/plain') => route.fulfill({ status, body, contentType });
      if (endpoint === '/api/erp/login') { assert.equal(request.method(), 'GET'); return reply('Login'); }
      if (endpoint === '/api/erp/login.do') { assert.equal(request.method(), 'POST'); return reply('{"code":0}', 200, 'application/json'); }
      if (endpoint === '/api/erp/sellAccountCode/statisticsGoodsSupplierInfo') {
        assert.equal(request.method(), 'POST');
        assert.equal(params.flag, '11');
        assert.equal(params.page, '1');
        assert.equal(params.rows, '200');
        assert.ok(params.statement_beginDate.startsWith(year + '-'));
        assert.ok(params.statement_endDate.startsWith(year + '-'));
        if (mode === 'slow-sales') {
          await new Promise(resolve => setTimeout(resolve, 400));
          try { return await reply('{"rows":[]}', 200, 'application/json'); } catch { return; }
        }
        const rows = [
          { memeberid: '  ALPHA  ', accountCode: 'shared', price: '10.00' },
          { memeberid: '乙', accountCode: 'shared', price: '3.00' },
          { memeberid: 'Gamma', accountCode: 'G1', price: '4.00' },
          { memeberid: 'Alpha', accountCode: 'refund', price: '-1.00' }
        ];
        return reply(JSON.stringify({ rows }), mode === 'sales-failure' && params.statement_beginDate.endsWith('01-01') ? 500 : 200, 'application/json');
      }
      if (endpoint === '/api/erp/tempdesign/previewStockBillReport') {
        assert.equal(request.method(), 'POST');
        const params = Object.fromEntries(new URLSearchParams(request.postData()));
        year = params.statement_beginDate.slice(0, 4);
        assert.deepEqual(params, { statement_beginDate: `${year}-01-01`, statement_endDate: `${year}-12-31`, flag: '5' });
        return reply(mode === 'unsafe-path' ? '../private/report.html' : `Test shop/年结详情_${year}.html`, 200, 'application/json');
      }
      assert.equal(endpoint, `/api/erp/generic/web/Test shop/年结详情_${year}.html`);
      assert.equal(request.method(), 'GET');
      assert.equal(request.postData(), null);
      if (mode === 'expired' && !expired) { expired = true; return reply('Session expired', 401); }
      if (mode === 'slow') {
        await new Promise(resolve => setTimeout(resolve, 400));
        try { return await reply(fixture(year, mode), 200, 'text/html'); } catch { return; }
      }
      if (mode === 'missing') return reply('Missing', 404);
      return reply(fixture(mode === 'wrong-year' ? '2025' : year, mode), 200, 'text/html');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('[data-nav="items"]').click();
    assert.deepEqual(await page.locator('[data-items-tab]').allTextContents(), ['Products', 'Suppliers', 'Goods received']);
    await page.locator('#receivedTab').click();
    assert.equal(await page.locator('#itemsReceivedPanel').isVisible(), true);
    assert.equal(await page.locator('#reportFilters').isHidden(), true);
    assert.equal(requests.length, 0);
    await page.locator('#receivedYear').fill('2026');
    const load = async () => { await page.locator('#loadGoodsReceived').click(); await page.waitForFunction(() => !state.busy); };
    const totals = async () => (await page.locator('#goodsReceivedTable tfoot td').allTextContents()).slice(0, 4);
    await load();
    assert.equal(requests.length, 15);
    const periods = requests.filter(request => request.endpoint.includes('statisticsGoodsSupplierInfo')).map(request => request.params).sort((a, b) => a.statement_beginDate.localeCompare(b.statement_beginDate));
    assert.equal(periods.length, 13);
    let nextDay = '2026-01-01';
    for (const period of periods) {
      assert.equal(period.statement_beginDate, nextDay);
      assert.ok((Date.parse(period.statement_endDate) - Date.parse(period.statement_beginDate)) / 86400000 < 30);
      nextDay = new Date(Date.parse(period.statement_endDate) + 86400000).toISOString().slice(0, 10);
    }
    assert.equal(nextDay, '2027-01-01');
    assert.equal(await page.locator('#goodsReceivedTable tbody tr').count(), 4);
    assert.equal(await page.locator('#goodsReceivedTable thead th').count(), 8);
    assert.deepEqual((await page.locator('#goodsReceivedTable thead th').allTextContents()).slice(-2).map(text => text.replace(/[↑↓↕]/g, '').trim()), ['Profit (€)', 'Profit (%)']);
    assert.equal(await page.locator('#goodsReceivedTable tbody tr').first().locator('td').count(), 8);
    assert.deepEqual(await totals(), ['3', '€120.25', '€110.00', '€10.25']);
    assert.equal(await page.locator('#goodsReceivedTable tfoot td').nth(4).innerText(), '€208.00');
    assert.equal(await page.locator('#goodsReceivedTable tfoot .received-profit-amount').innerText(), '€87.75');
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-amount').first().innerText(), '€52.00', 'Default sort should put the highest euro profit first');
    assert.equal(await page.locator('[data-received-sort="profitAmount"]').locator('..').getAttribute('aria-sort'), 'descending');
    await page.locator('[data-received-sort="profitRatio"]').click();
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-ratio').first().innerText(), '95.00 %');
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-ratio').last().innerText(), '—');
    await page.locator('[data-received-sort="profitRatio"]').click();
    assert.match(await page.locator('#goodsReceivedTable tbody td').first().innerText(), /^Alpha/);
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-ratio').last().innerText(), '—', 'Undefined ratios stay last in both directions');
    await page.locator('[data-received-sort="profitRatio"]').click();
    await page.locator('[data-received-sort="profitAmount"]').click();
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-amount').first().innerText(), '€52.00', 'Amount sorting should select the biggest euro profit, independently of ratio');
    assert.equal(await page.locator('[data-received-sort="profitAmount"]').locator('..').getAttribute('aria-sort'), 'descending');
    await page.locator('[data-received-sort="profitAmount"]').click();
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-amount').first().innerText(), '€0.00');
    await page.locator('[data-received-sort="profitRatio"]').click();
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-ratio').first().innerText(), '95.00 %');
    assert.equal(await page.evaluate(() => state.goodsReceived.sourcePages), 2);
    assert.equal(await page.evaluate(() => window.untrustedReportExecuted), undefined);
    assert.equal(await page.locator('#goodsReceivedTable script, #goodsReceivedTable supplier').count(), 0);
    await page.locator('[data-received-sort="supplier"]').click();
    assert.match(await page.locator('#goodsReceivedTable tbody td').first().innerText(), /^A & B <supplier>/);
    await page.locator('[data-received-sort="supplier"]').click();
    assert.equal(await page.locator('#goodsReceivedTable tbody td').first().innerText(), 'Zero');
    await page.locator('#goodsReceivedSearch').fill('甲');
    assert.deepEqual(await totals(), ['2', '€100.25', '€90.00', '€10.25']);
    assert.equal(await page.locator('#goodsReceivedTable tbody td').nth(5).innerText(), '€117.00');
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-amount').innerText(), '€16.75');
    assert.equal(await page.locator('#goodsReceivedTable tbody .received-profit-ratio').innerText(), '16.71 %');
    const exports = await page.evaluate(() => {
      const original = download, captures = [];
      download = (content, name) => captures.push({ content, name });
      exportCSV(); exportJSON(); download = original; return captures;
    });
    assert.match(exports[0].name, /goods-received-2026/);
    assert.match(exports[0].content, /"Alpha","甲","2","100.25","90","10.25","117","16.75"/);
    assert.equal(JSON.parse(exports[1].content).totals.totalAmount, 100.25);
    assert.equal(JSON.parse(exports[1].content).totals.annualSales, 117);
    assert.equal(JSON.parse(exports[1].content).totals.profitAmount, 16.75);
    await page.locator('#goodsReceivedSearch').fill('');
    assert.equal(requests.length, 15, 'Filtering and sorting should remain local');
    await page.locator('[data-received-sort="annualSales"]').click();
    assert.match(await page.locator('#goodsReceivedTable tbody td').first().innerText(), /^Alpha/);
    await page.locator('[data-received-sort="profitRatio"]').click();
    assert.match(await page.locator('#goodsReceivedTable tbody td').first().innerText(), /^A & B <supplier>/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `goods-received-${viewport.width}.png`), fullPage: true });
    }
    await page.locator('#productsTab').click();
    assert.equal(await page.locator('#reportFilters').isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#receivedTab').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#productsTab').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#receivedTab').getAttribute('aria-selected'), 'true');
    const salesRequestCount = () => requests.filter(request => request.endpoint.includes('statisticsGoodsSupplierInfo')).length;
    const cachedSalesCount = salesRequestCount(), cachedRequestCount = requests.length;
    await load();
    assert.equal(salesRequestCount(), cachedSalesCount, 'Loading the same annual comparison must reuse its sales periods');
    assert.equal(requests.length, cachedRequestCount + 2, 'Purchase preview and HTML may refresh without resending sales');
    assert.equal(await page.locator('#goodsReceivedTable tfoot td').nth(4).innerText(), '€208.00');
    if (viewport.width > 640) {
      // Report output must retain the last valid data on bad HTML, missing files, or cancellation.
      for (const failure of ['mismatch', 'wrong-year', 'missing', 'unsafe-path', 'sales-failure']) {
        if (failure === 'sales-failure') await page.evaluate(() => periodSupplierSalesCache.clear());
        mode = failure; await load();
        assert.deepEqual(await totals(), ['3', '€120.25', '€110.00', '€10.25']);
        assert.ok(await page.locator('#globalError').innerText());
        assert.equal(await page.locator('#goodsReceivedTable tfoot td').nth(4).innerText(), '€208.00', 'A failed sales period must preserve the previous comparison');
      }
      mode = 'slow';
      await page.locator('#loadGoodsReceived').click();
      await page.waitForFunction(() => document.getElementById('reportProgress').textContent.startsWith('Loading'));
      await page.locator('#cancelGoodsReceived').click();
      await page.waitForFunction(() => !state.busy);
      assert.deepEqual(await totals(), ['3', '€120.25', '€110.00', '€10.25']);
      mode = 'slow-sales';
      await page.locator('#loadGoodsReceived').click();
      await page.waitForFunction(() => document.getElementById('reportProgress').textContent.startsWith('Loading annual sales'));
      await page.locator('#cancelGoodsReceived').click();
      await page.waitForFunction(() => !state.busy);
      assert.equal(await page.locator('#goodsReceivedTable tfoot td').nth(4).innerText(), '€208.00');
      // Expiry while loading HTML recovers the session and replays the same GET.
      mode = 'expired';
      await page.evaluate(() => rememberCredentials({ shopkey: 'test-shop', login_name: 'tester', password: 'synthetic-test-only' }));
      await load();
      assert.equal(expired, true);
      assert.equal(requests.some(request => request.endpoint.endsWith('/login.do')), true);
      assert.deepEqual(await totals(), ['3', '€120.25', '€110.00', '€10.25']);
      // No sales, negative purchases, aliases, and ambiguous names must not invent a ratio or double-count sales.
      const comparison = await page.evaluate(() => {
        const purchases = [
          { supplier: 'No sales', chineseName: '', totalAmount: 100 },
          { supplier: 'Returned', chineseName: '', totalAmount: -10 },
          { supplier: 'Alias', chineseName: '同名', totalAmount: 20 },
          { supplier: 'Another', chineseName: '同名', totalAmount: 30 }
        ].map(row => ({ documents: 1, paidAmount: 0, unpaidAmount: row.totalAmount, ...row }));
        return compareReceivedSales(purchases, [{ supplier: '同名', annualSales: 40 }, { supplier: 'Returned', annualSales: 0 }]);
      });
      assert.equal(comparison[0].annualSales, 0);
      assert.equal(comparison[0].profitRatio, -100);
      assert.equal(comparison[1].profitRatio, null);
      assert.equal(comparison.reduce((sum, row) => sum + row.annualSales, 0), 40);
      assert.equal(comparison.find(row => row.noPurchaseMatch).profitRatio, null);
      if (process.env.GOODS_RECEIVED_SAMPLE_URL) {
        const realResponse = await fetch(process.env.GOODS_RECEIVED_SAMPLE_URL);
        assert.equal(realResponse.status, 200);
        const html = await realResponse.text();
        const parsed = await page.evaluate(html => {
          const parsed = parseGoodsReceivedHTML(html, '2026');
          return { rows: parsed.rows.length, pages: parsed.sourcePages, summary: parsed.summary };
        }, html);
        assert.ok(parsed.rows > 0);
        assert.equal(parsed.pages, 3);
        console.log(`PASS existing LG ERP HTML: parsed ${parsed.rows} supplier rows across ${parsed.pages} pages, with totals reconciled.`);
      }
      // Annual Products/Suppliers data supplies the comparison without duplicate requests, even after filtering.
      mode = 'normal';
      await page.evaluate(() => { clearData(); state.account = { shopkey: 'cache-test', login_name: 'tester' }; });
      await page.locator('#productsTab').click();
      await page.locator('#dateFrom').fill('2026-01-01');
      await page.locator('#dateTo').fill('2026-12-31');
      const beforeProducts = salesRequestCount();
      await page.locator('#runReport').click();
      await page.waitForFunction(() => !state.busy);
      assert.equal(salesRequestCount(), beforeProducts + 13);
      await page.locator('#itemSearch').fill('no matching product');
      await page.locator('#suppliersTab').click();
      const beforeComparison = salesRequestCount();
      await page.locator('#receivedTab').click();
      await load();
      assert.equal(salesRequestCount(), beforeComparison, 'A full annual Products/Suppliers report must supply all cached sales periods');
      assert.equal(await page.locator('#goodsReceivedTable tfoot td').nth(4).innerText(), '€208.00', 'Product filters must not narrow cached annual sales');
      // Different years and accounts must not reuse the previous year/account data.
      await page.locator('#receivedYear').fill('2025');
      await load();
      assert.equal(salesRequestCount(), beforeComparison + 13);
      await page.locator('#receivedYear').fill('2026');
      await load();
      assert.equal(salesRequestCount(), beforeComparison + 13, 'Returning to a cached year must not resend sales');
      await page.evaluate(() => { state.account = { shopkey: 'another-account', login_name: 'tester' }; });
      await load();
      assert.equal(salesRequestCount(), beforeComparison + 26, 'Cache must be isolated by account');
      // An explicit Products Run report still refreshes the source periods.
      await page.locator('#productsTab').click();
      const beforeRefresh = salesRequestCount();
      await page.locator('#runReport').click();
      await page.waitForFunction(() => !state.busy);
      assert.equal(salesRequestCount(), beforeRefresh + 13);
    }
    await page.evaluate(() => setSession(false));
    assert.equal(await page.evaluate(() => periodSupplierSalesCache.size), 0, 'Disconnecting must clear cached account data');
    assert.equal(await page.locator('#goodsReceivedTable tfoot').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: purchases plus full-year sales, supplier matching/refunds, profit-ratio ordering, totals/exports, failure/cancellation, and safe text rendering.`);
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
