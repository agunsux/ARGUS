const assert = require('node:assert/strict');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');

(async () => {
  for (const key of Object.keys(process.env)) {
    if (/^(DOKU_|ENABLE_DOKU_|VERCEL)/.test(key)) delete process.env[key];
  }
  let passed = 0;
  for (const environment of ['preview', 'production']) {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = environment;
    const provider = new DokuPaymentProvider({ allowSimulation: true });
    assert.equal(provider.allowSimulation, false);
    await assert.rejects(provider.requestRefund({ orderId: 'isolated-refund', amount: 1000 }), /awaiting merchant production activation/);
    passed++;
  }
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'test';
  const disabled = new DokuPaymentProvider({ allowSimulation: false });
  await assert.rejects(disabled.requestRefund({ orderId: 'isolated-refund', amount: 1000 }), /awaiting merchant production activation/);
  passed++;
  const fixture = new DokuPaymentProvider({ allowSimulation: true });
  const result = await fixture.requestRefund({ orderId: 'isolated-refund', amount: 1000 });
  assert.equal(result.simulated, true);
  assert.equal(result.status, 'CONFIRMED');
  passed++;
  console.log(`Refund fail-closed: PASS=${passed} FAIL=0 SKIPPED=0; local fixture only`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });