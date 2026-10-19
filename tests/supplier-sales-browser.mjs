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
const sales = [
  ...Array.from({ length: 120 }, (_, index) => ({ memeberid: 'Alpha', accountCode: `A${index}`, accountName: `Alpha product ${index}`, price: '2.00', quantity: 1, yesMoney: 2 })),
  ...Array.from({ length: 81 }, (_, index) => ({ memeberid: 'Beta', accountCode: `B${index}`, accountName: `Beta product ${index}`, price: '3.00', quantity: 1, yesMoney: 3 })),
  { memeberid: 'Alpha', accountCode: 'A0', accountName: 'Refund', price: '-5.00', quantity: -1, yesMoney: 5 },
  { memeberid: 'Zero', accountCode: 'Z0', accountName: 'Zero sale', price: '0.00', quantity: 1, yesMoney: 0 },
  { memeberid: '', accountCode: 'U0', accountName: 'Unassigned product', price: '4.00', quantity: 1, yesMoney: 4 }
];
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
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      localStorage.setItem('lg.account', JSON.stringify({ apiBase: '/api/erp', shopkey: 'test-shop', login_name: 'tester' }));
      localStorage.setItem('lg.session', JSON.stringify({ apiBase: '/api/erp', connected: true }));
      // Old exclusion settings must no longer affect either tab.
      localStorage.setItem('lg.supplierExclusions:' + JSON.stringify(['/api/erp', 'test-shop', 'tester']), JSON.stringify(['Beta', 'sales:beta']));
    });
    const page = await context.newPage(), errors = [], requests = [];
    let mode = 'normal';
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/erp/**', async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      const fields = Object.fromEntries(new URLSearchParams(request.postData() || ''));
      requests.push({ endpoint, fields });
      assert.equal(endpoint, '/api/erp/sellAccountCode/statisticsGoodsSupplierInfo', 'Only the existing Products request is allowed');
      assert.equal(fields.page, '1', 'No extra sales pages should be fetched');
      assert.equal(fields.flag, '11');
      assert.equal(fields.rows, '200');
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 400));
      const rows = mode === 'empty' ? [] : sales.map(row => ({ ...row, price: Number(row.price) * (mode === 'double' ? 2 : 1) }));
      // Simulate an API that repeats rows regardless of page and advertises more records.
      try { await route.fulfill({ status: mode === 'failure' ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ total: 999, rows }) }); }
      catch (error) { if (mode !== 'slow') throw error; }
    });
    const waitForReport = () => page.waitForFunction(() => !state.busy && !!state.items);
    const rerun = async () => { await page.locator('#runReport').click(); await page.waitForFunction(() => !state.busy); };
    const expectTotal = async value => assert.equal(await page.locator('#supplierSalesTable tfoot td').innerText(), value);
    const names = () => page.locator('#supplierSalesTable tbody .supplier-sales-name').allTextContents();
    const rowFor = name => page.locator('#supplierSalesTable tbody tr').filter({ has: page.locator('.supplier-sales-name', { hasText: new RegExp(`^${name}$`) }) });

    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('[data-nav="items"]').click();
    await page.locator('#suppliersTab').click();
    assert.equal(requests.length, 0, 'Opening an empty summary must not load a separate report');
    assert.equal(await page.locator('#supplierSalesTable tfoot').count(), 0);
    await page.locator('#productsTab').click();
    await page.locator('#dateFrom').fill('2026-10-01');
    await page.locator('#dateTo').fill('2026-10-18');
    await page.locator('#runReport').click(); await waitForReport();
    assert.equal(requests.length, 1);
    assert.equal(await page.locator('#itemsTable tbody tr').count(), 100);
    assert.equal(await page.locator('#itemsTable tfoot td').innerText(), '€482.00');
    await page.locator('#nextPage').click();
    await page.locator('#suppliersTab').click();
    assert.equal(requests.length, 1, 'Switching tabs and local pages must not fetch');
    await expectTotal('€482.00');
    assert.deepEqual(await names(), ['Alpha', 'Beta', 'Unassigned supplier', 'Zero']);
    assert.equal(await rowFor('Alpha').locator('td').last().innerText(), '€235.00');
    assert.equal(await rowFor('Zero').locator('td').last().innerText(), '€0.00');
    assert.equal(await page.locator('#supplierExclusions, [data-exclude-supplier]').count(), 0);
    await page.locator('[data-supplier-sort="name"]').click();
    assert.equal((await names())[0], 'Zero');
    await page.locator('[data-supplier-sort="name"]').click();
    assert.equal((await names())[0], 'Alpha');
    await page.locator('[data-supplier-sort="total"]').click();
    assert.equal((await names())[0], 'Beta');
    await page.locator('[data-supplier-sort="total"]').click();
    assert.equal((await names())[0], 'Zero');
    await page.locator('#supplierSalesSearch').fill('Beta');
    await expectTotal('€243.00');
    const exported = await page.evaluate(() => {
      const original = download, captures = [];
      download = (content, name) => captures.push({ content, name });
      exportCSV(); exportJSON(); download = original;
      return captures;
    });
    assert.match(exported[0].content, /"Beta","81","243"/);
    assert.equal(JSON.parse(exported[1].content).rows.length, 1);
    assert.equal(JSON.parse(exported[1].content).rows[0].total, 243);
    await page.locator('#supplierSalesSearch').fill('');
    await page.locator('#productsTab').click();
    await page.locator('#supplierToggle').click();
    await page.locator('[data-supplier="Alpha"]').click();
    await page.locator('#supplierClose').click();
    assert.equal(await page.locator('#itemsTable tfoot td').innerText(), '€235.00');
    await page.locator('#suppliersTab').click();
    assert.deepEqual(await names(), ['Alpha']);
    await expectTotal('€235.00');
    await page.locator('#productsTab').click();
    await page.locator('#itemSearch').fill('Refund');
    assert.equal(await page.locator('#itemsTable tfoot td').innerText(), '-€5.00');
    await page.locator('#suppliersTab').click();
    await expectTotal('-€5.00');
    await page.locator('#supplierSalesSearch').fill('no such supplier');
    await expectTotal('€0.00');
    await page.locator('#supplierSalesSearch').fill('');
    await page.locator('#productsTab').click();
    await page.locator('#itemSearch').fill('');
    await page.locator('#supplierToggle').click();
    await page.locator('[data-supplier=""]').click();
    await page.locator('#supplierClose').click();
    await page.locator('#suppliersTab').click();
    await expectTotal('€482.00');
    assert.equal(requests.length, 1, 'Search, sorting, filters, and switching must remain local');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => {
      const wrap = document.querySelector('#supplierSalesTable .tablewrap');
      return wrap.scrollWidth <= wrap.clientWidth;
    }), true, 'Supplier and Total sales must fit together on mobile');
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `supplier-sales-${viewport.width}.png`), fullPage: true });
    }
    // Run report in Suppliers refreshes the same Products report exactly once.
    mode = 'double'; await rerun(); await expectTotal('€964.00');
    assert.equal(requests.length, 2);
    await page.locator('#productsTab').click();
    assert.equal(await page.locator('#itemsTable tfoot td').innerText(), '€964.00');
    await page.locator('#suppliersTab').click();
    mode = 'failure'; await rerun(); await expectTotal('€964.00');
    mode = 'slow'; await page.locator('#runReport').click();
    await page.locator('#cancelReport').click();
    await page.waitForFunction(() => !state.busy); await expectTotal('€964.00');
    // Empty reports replace both views rather than leaving stale totals.
    mode = 'empty'; await rerun(); await expectTotal('€0.00');
    assert.equal(await page.locator('#itemsTable tfoot td').textContent(), '€0.00');
    assert.equal(await page.locator('#supplierSalesTable .supplier-sales-name').count(), 0);
    mode = 'normal';
    await page.locator('#dateFrom').fill('2026-09-01');
    await rerun(); await expectTotal('€964.00');
    assert.equal(await page.locator('#itemsTable tfoot td').textContent(), '€964.00');
    assert.equal(requests.every(request => request.fields.page === '1'), true);
    await page.evaluate(() => setSession(false));
    assert.equal(await page.locator('#itemsTable tfoot, #supplierSalesTable tfoot').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: shared Products data, local grouping across pages, refunds, zero totals, sorting, filters, exports, refresh, failure/cancellation, and no supplier requests.`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
