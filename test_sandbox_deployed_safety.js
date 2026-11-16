process.env.NODE_ENV = 'test';
process.env.MARKETPLACE_MODE = 'LIVE';
const assert = require('node:assert/strict');
const app = require('./src/server');
let server;
(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  for (const mode of ['production', 'test']) {
    process.env.NODE_ENV = mode;
    process.env.VERCEL = '1';
    for (const value of ['', 'false', 'true']) {
      process.env.ALLOW_DIRECT_PAYMENT_SIMULATION = value;
      // Empty body cannot mutate a payment even on the vulnerable implementation.
      const response = await fetch(`${base}/api/mvp/buyer/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const body = await response.json();
      assert.equal(response.status, 403, `${mode}, flag=${JSON.stringify(value)}`);
      assert.equal(body.code, 'DIRECT_PAYMENT_SIMULATION_FORBIDDEN');
      passed++;
    }
  }
  for (const query of ['', '?probe=true']) {
    const response = await fetch(`${base}/api/v1/payments/sandbox/diagnostics${query}`);
    assert.equal(response.status, 401, 'Anonymous diagnostics must stop before gateway probes');
    await response.arrayBuffer();
    passed++;
  }
  console.log(`DEPLOYED SANDBOX SAFETY: ${passed} PASS; no gateway requests or financial mutations`);
})().then(() => { server.close(); process.exit(0); }).catch(error => {
  console.error(error.message); if (server) server.close(); process.exit(1);
});