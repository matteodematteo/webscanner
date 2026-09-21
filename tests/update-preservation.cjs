const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  for (const folder of ['js', 'js/js']) {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', folder, 'api.js'), 'utf8'), context);
    let sent;
    let requests = 0;
    Object.assign(context, {
      CONFIG: { updateProxyEndpoint: 'mock:update', addProductProxyEndpoint: 'mock:add' },
      apiFetch: async (url, options) => {
        requests++;
        sent = JSON.parse(options.body);
        return { ok: true, text: async () => '{"success":true}' };
      }
    });
    const edits = { id: '7', barcode: '123', italian_name: 'Updated', p_price: '8', s_price: '12', s_discount: '5' };
    const original = { p_discount: '20', p_discount2: 0, p_discount3: '3.50', p_discount4: '', spec: 'Box of 12' };
    await context.fetchUpdateItemThroughProxy(edits, 'test-cookie', original);
    for (const key of Object.keys(original)) assert.equal(sent[key], original[key]);
    assert.equal(sent.italian_name, 'Updated');
    assert.equal(sent.s_price, '12');
    assert.equal(sent.cookie, 'test-cookie');
    await context.fetchUpdateItemThroughProxy(edits, 'test-cookie', {
      p_discount1: '7', p_discount2: '2', p_discount3: '0', p_discount4: 0, spec: null
    });
    assert.equal(sent.p_discount, '7');
    assert.equal(sent.p_discount1, '7');
    assert.equal(sent.spec, '');
    const before = requests;
    for (const key of Object.keys(original)) {
      const incomplete = { ...original };
      delete incomplete[key];
      await assert.rejects(context.fetchUpdateItemThroughProxy(edits, 'test-cookie', incomplete), /Cannot safely update/);
    }
    assert.equal(requests, before, 'Incomplete reads must never reach the update endpoint');
    await context.fetchAddProductThroughProxy(edits, 'test-cookie');
    assert.equal(Object.hasOwn(sent, 'p_discount'), false, 'Add flow stays unchanged');
    console.log(`PASS: ${folder} preserves discounts/spec, handles aliases and blocks incomplete reads`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
