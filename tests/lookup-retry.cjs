const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const product = { goods_code: '123', italian_name: 'Test', s_price: '10' };
function setup(folder, responses) {
  const c = vm.createContext({});
  for (const file of ['product.js', 'api.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', folder, file), 'utf8'), c);
  c.calls = []; c.logins = 0;
  Object.assign(c, {
    state: { authCookie: 'old' }, navigator: { onLine: true }, setStatus() {},
    loginAndRefreshCookie: async () => { c.logins++; c.state.authCookie = 'new'; return 'new'; },
    fetchProductInfoThroughProxy: async (code, cookie) => {
      c.calls.push({code,cookie}); const result = responses.shift();
      if (result instanceof Error) throw result;
      return typeof result === 'string' ? result : JSON.stringify(result);
    }
  });
  return c;
}
(async () => {
  for (const folder of ['js', 'js/js']) {
    for (const failure of [{}, '<html>Login</html>', new Error('401')]) {
      const c = setup(folder, [failure, product]);
      const result = await c.loadProductInfoResponse('123');
      assert.equal(result.normalized.goods_code, '123'); assert.equal(result.cookie, 'new');
      assert.equal(c.logins, 1); assert.equal(c.calls.length, 2);
      assert.equal(c.calls[1].code, '123'); assert.equal(c.calls[1].cookie, 'new');
    }
    const success = setup(folder, [product]); await success.loadProductInfoResponse('123'); assert.equal(success.logins, 0);
    const missing = setup(folder, [{}, {}]); await missing.loadProductInfoResponse('123'); assert.equal(missing.calls.length, 2); assert.equal(missing.logins, 1);
    const failed = setup(folder, [new Error('401'), new Error('401')]); await assert.rejects(failed.loadProductInfoResponse('123')); assert.equal(failed.calls.length, 2);
    const offline = setup(folder, [new Error('offline')]); offline.navigator.onLine = false; await assert.rejects(offline.loadProductInfoResponse('123')); assert.equal(offline.logins, 0);
    const concurrent = setup(folder, [{}, {}, product, product]); await Promise.all([concurrent.loadProductInfoResponse('123'), concurrent.loadProductInfoResponse('123')]); assert.equal(concurrent.logins, 1);
    const discounts = setup(folder, [{}, product]); const cookies = [];
    await discounts.loadProductInfoResponse('123', cookie => cookies.push(cookie)); assert.deepEqual(cookies, ['old', 'new']);
    console.log(`PASS: ${folder} single retry, same barcode, refreshed cookie, concurrent refresh, offline and success paths`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
