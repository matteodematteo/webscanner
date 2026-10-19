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
  for (const viewport of [{ width: 1440, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 640 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      navigate('items');
      state.items = {
        operation: 'items', elapsed: 0,
        data: Array.from({ length: 150 }, (_, index) => ({ memeberid: `Supplier ${index}`, accountCode: `P${index}`, accountName: `Product ${index}`, price: 10, yesMoney: 10, quantity: 1 })),
        requestFields: { statement_beginDate: '2026-10-01', statement_endDate: '2026-10-18' }
      };
      renderItems();
    });
    for (const tab of ['products', 'suppliers']) {
      await page.locator(tab === 'products' ? '#productsTab' : '#suppliersTab').click();
      const selector = tab === 'products' ? '#itemsTable .tablewrap' : '#supplierSalesTable .tablewrap';
      const position = async edge => page.evaluate(({ selector, edge }) => {
        const wrap = document.querySelector(selector);
        window.scrollTo(0, window.scrollY + wrap.getBoundingClientRect().top - 100);
        wrap.scrollTop = edge === 'bottom' ? wrap.scrollHeight : edge === 'middle' ? 300 : 0;
        const rect = wrap.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: Math.min(innerHeight - 100, rect.top + rect.height / 2), pageY: window.scrollY, tableY: wrap.scrollTop };
      }, { selector, edge });
      const wheel = async (start, delta) => {
        await page.mouse.move(start.x, start.y);
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(200);
        return page.evaluate(selector => ({ pageY: window.scrollY, tableY: document.querySelector(selector).scrollTop }), selector);
      };

      // Reproduce the old behavior by temporarily restoring scroll chaining.
      if (viewport.width === 1440 && tab === 'products') {
        const oldStyle = await page.addStyleTag({ content: '#itemsView .tablewrap{overscroll-behavior-y:auto!important}' });
        const start = await position('top');
        const after = await wheel(start, -300);
        assert.ok(after.pageY < start.pageY, 'Regression setup should reproduce the outer page scrolling at the table boundary');
        await oldStyle.evaluate(element => element.remove());
      }
      let start = await position('middle');
      let after = await wheel(start, 220);
      assert.ok(after.tableY > start.tableY, `${tab}: scrolling over rows must scroll the table`);
      assert.equal(after.pageY, start.pageY, `${tab}: the outer page must stay still`);
      start = await position('bottom');
      after = await wheel(start, 400);
      assert.equal(after.pageY, start.pageY, `${tab}: reaching the bottom must not pass scrolling to the page`);
      assert.equal(after.tableY, start.tableY);
      start = await position('top');
      after = await wheel(start, -400);
      assert.equal(after.pageY, start.pageY, `${tab}: reaching the top must not pass scrolling to the page`);
      assert.equal(after.tableY, 0);
      // The outer page is still scrollable when the pointer is outside the table.
      await page.mouse.move(5, 180);
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => window.scrollY) < start.pageY, 'Scrolling outside the table must still move the page');
      // Products retains independent horizontal scrolling on narrow screens.
      if (tab === 'products' && viewport.width < 640) {
        start = await position('middle');
        await page.mouse.move(start.x, start.y);
        await page.mouse.wheel(250, 0);
        await page.waitForTimeout(200);
        assert.ok(await page.locator(selector).evaluate(wrap => wrap.scrollLeft) > 0);
      }
      console.log(`PASS ${viewport.width}px ${tab}: inner scrolling, top/bottom containment, and outside-page scrolling.`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
