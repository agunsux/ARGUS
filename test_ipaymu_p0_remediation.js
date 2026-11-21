// Deterministic contract/containment fixtures. NO actual Sandbox transactions.
process.env.NODE_ENV = 'test';
const assert = require('assert');
const crypto = require('crypto');
const { IPaymuProvider } = require('./src/services/payment/IPaymuProvider');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { paymentManager } = require('./src/services/payment');
const { state } = require('./src/database');
const make = (config = {}) => new IPaymuProvider({ mode: 'sandbox',
  apiBaseUrl: 'https://sandbox.ipaymu.com/api/v2', apiKey: 'fixture-api-key',
  virtualAccount: 'YOUR_IPAYMU_VA', allowSimulation: false, ...config });
// Values follow the published callback example. This is NOT captured evidence.
const payload = { trx_id: '12345678', sid: 'SESSION789', reference_id: 'ORDER123456',
  status: 'berhasil', status_code: '1', amount: '100000', merchant: 'YOUR_IPAYMU_VA',
  paid_off: '98500', transaction_status_code: '1', is_escrow: '0',
  additional_info: '[]', url: 'https://your-domain.com/callback' };
// Independent fixture oracle: do not sign using the implementation under test.
function sign(body = payload, key = 'YOUR_IPAYMU_VA', escaped = false) {
  const values = { ...body, trx_id: Number(body.trx_id), status_code: Number(body.status_code),
    paid_off: Number(body.paid_off), transaction_status_code: Number(body.transaction_status_code),
    is_escrow: false, additional_info: [] };
  let json = JSON.stringify(Object.fromEntries(Object.keys(values).sort().map(k => [k, values[k]])));
  if (escaped) json = json.replace(/\//g, '\\/');
  return crypto.createHmac('sha256', key).update(json).digest('hex');
}
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('[PASS] ' + name); }
  catch (error) { console.error('[FAIL] ' + name + ' (' + error.name + ')'); process.exitCode = 1; }
}
async function run() {
  for (const runtime of ['production', 'development']) await test('Explicit sandbox under ' + runtime, () => {
    const old = { ...process.env };
    try {
      process.env.NODE_ENV = runtime; process.env.IPAYMU_ENV = 'sandbox';
      process.env.IPAYMU_BASE_URL = 'https://sandbox.ipaymu.com/api/v2';
      const p = new IPaymuProvider({ apiKey: 'fixture-api-key', virtualAccount: 'YOUR_IPAYMU_VA' });
      assert.strictEqual(p.mode, 'sandbox'); assert.strictEqual(p.assertConfiguration(), true);
    } finally { process.env = old; }
  });
  for (const [name, overrides] of [
    ['missing environment', { mode: null }], ['invalid environment', { mode: 'invalid' }],
    ['missing key', { apiKey: '' }], ['missing VA', { virtualAccount: '' }],
    ['sandbox/live mismatch', { apiBaseUrl: 'https://my.ipaymu.com/api/v2' }],
    ['live/sandbox mismatch', { mode: 'production' }], ['missing base URL', { apiBaseUrl: null }]
  ]) await test(name + ' rejected', () => assert.throws(() => make(overrides).assertConfiguration()));
  await test('Production activation remains closed', () => assert.throws(() =>
    make({ mode: 'production', apiBaseUrl: 'https://my.ipaymu.com/api/v2' }).assertConfiguration({ activation: true })));
  await test('Preview callback URLs are deployment-bound', () => {
    const old = { ...process.env };
    try {
      process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_URL = 'fixture-preview.vercel.app';
      const urls = make().resolvePaymentUrls({ orderId: 'ORDER123456' });
      assert.ok(Object.values(urls).every(url => new URL(url).host === process.env.VERCEL_URL));
      assert.throws(() => make().resolvePaymentUrls({ orderId: 'ORDER123456', notifyUrl: 'https://tikum.app/callback' }));
    } finally { process.env = old; }
  });
  await test('No Sandbox URL fallback without Preview hostname', () => assert.throws(() => make().resolvePaymentUrls({ orderId: 'ORDER123456' })));
  await test('Status response contains no credential values', () => {
    const status = JSON.stringify(make().getStatus());
    assert.ok(!status.includes('fixture-api-key') && !status.includes('YOUR_IPAYMU_VA'));
  });
  await test('Official normalized callback accepted', () => assert.strictEqual(make().verifyWebhook({ 'X-Signature': sign() }, payload), true));
  await test('Escaped slash serialization accepted', () => assert.strictEqual(make().verifyWebhook({ 'x-signature': sign(payload, 'YOUR_IPAYMU_VA', true) }, payload), true));
  await test('Reordered payload accepted', () => assert.strictEqual(make().verifyWebhook({ 'x-signature': sign() }, Object.fromEntries(Object.entries(payload).reverse())), true));
  await test('Missing optional additional_info normalized', () => {
    const body = { ...payload }; delete body.additional_info;
    assert.strictEqual(make().verifyWebhook({ 'x-signature': sign() }, body), true);
  });
  for (const field of ['amount', 'trx_id', 'merchant']) await test('Altered ' + field + ' rejected', () => {
    assert.strictEqual(make().verifyWebhook({ 'x-signature': sign() }, { ...payload, [field]: '999' }), false);
  });
  await test('Altered signing VA rejected', () => assert.strictEqual(make({ virtualAccount: 'different' }).verifyWebhook({ 'x-signature': sign() }, payload), false));
  await test('API-key fallback rejected', () => assert.strictEqual(make().verifyWebhook({ 'x-signature': sign(payload, 'fixture-api-key') }, payload), false));
  for (const signature of [undefined, 'invalid', '0'.repeat(64)]) await test('Missing/malformed/invalid signature rejected', () => {
    assert.strictEqual(make().verifyWebhook({ 'x-signature': signature }, payload), false);
  });
  for (const body of [null, [], { ...payload, amount: {} }, { ...payload, sid: undefined }]) await test('Malformed or required-field omission rejected', () => {
    assert.strictEqual(make().verifyWebhook({ 'x-signature': sign() }, body), false);
  });
  const inquiry = status => ({ statusCode: 200, json: { Status: 200, Success: true, Data: {
    TransactionId: 4719, SessionId: 'SESSION789', ReferenceId: 'ORDER123456', Amount: 10000, Status: status
  } } });
  for (const [code, expected] of [[0, 'PAYMENT_PENDING'], [1, 'PAID'], [2, 'CANCELLED'], [4, 'FAILED'], [5, 'FAILED'], [6, 'PAID'], [-2, 'EXPIRED']]) {
    await test('Inquiry contract status ' + code, async () => {
      const p = make(); p._httpRequest = async req => {
        assert.strictEqual(req.url, 'https://sandbox.ipaymu.com/api/v2/transaction');
        assert.deepStrictEqual(JSON.parse(req.body), { transactionId: '4719' });
        return inquiry(code);
      };
      const result = await p.getPaymentStatus({ orderId: 'ORDER123456', providerRef: '4719' });
      assert.strictEqual(result.status, expected); assert.strictEqual(result.simulated, false);
      assert.strictEqual(result.currency, null); assert.strictEqual(result.merchantIdentity, null);
    });
  }
  for (const response of [{ statusCode: 500 }, { statusCode: 401 }, { statusCode: 200, json: null },
    { statusCode: 200, json: { Status: 200, Success: true, Data: {} } }, inquiry(99)]) {
    await test('Unconfirmed inquiry rejected', async () => {
      const p = make(); p._httpRequest = async () => response;
      await assert.rejects(p.getPaymentStatus({ providerRef: '4719' }));
    });
  }
  await test('Timeout never becomes simulated', async () => {
    const p = make(); p._httpRequest = async () => { throw new Error('fixture timeout'); };
    await assert.rejects(p.getPaymentStatus({ providerRef: '4719' }), error => error.code === 'IPAYMU_INQUIRY_UNAVAILABLE');
  });
  await test('Unknown transaction cannot fall back to order ID', async () => {
    await assert.rejects(make().getPaymentStatus({ orderId: 'ORDER123456' }), error => error.code === 'IPAYMU_TRANSACTION_ID_REQUIRED');
  });
  await test('Malformed creation response rejected after transport', async () => {
    const old = { ...process.env }; let called = false;
    try {
      process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_URL = 'fixture-preview.vercel.app';
      const p = make(); p._httpRequest = async () => { called = true; return { statusCode: 200, json: null }; };
      await assert.rejects(p.createPayment({ orderId: 'ORDER123456', amount: 10000, channel: 'IPAYMU_REDIRECT' }));
      assert.strictEqual(called, true);
    } finally { process.env = old; }
  });
  await test('Containment authenticates before blocking and leaves all financial state unchanged', async () => {
    paymentManager.registerProvider(make());
    const before = JSON.stringify(state);
    await assert.rejects(PaymentService.handleWebhook({ providerName: 'ipaymu', body: payload, headers: {} }), error => error.code === 'INVALID_WEBHOOK_SIGNATURE');
    // Signature rejection may append an audit event. Capture baseline after it.
    const afterRejection = JSON.stringify(state);
    const invoke = () => PaymentService.handleWebhook({ providerName: 'ipaymu', body: payload, headers: { 'x-signature': sign() } });
    const results = await Promise.allSettled([invoke(), invoke(), invoke()]);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'IPAYMU_ATOMIC_TRANSITION_UNAVAILABLE'));
    assert.strictEqual(JSON.stringify(state), afterRejection);
    assert.ok(before.length > 0);
  });
  await test('Reconciliation performs inquiry but does not claim atomic repair', async () => {
    const p = make(); let calls = 0;
    p._httpRequest = async () => { calls++; return inquiry(1); }; paymentManager.registerProvider(p);
    state.canonical_payments = [{ id: 'fixture-payment', order_id: 'ORDER123456', provider: 'ipaymu', provider_transaction_id: '4719', provider_reference: 'SESSION789', gross_amount: 10000, metadata: { environment: 'sandbox' } }];
    state.orders = [{ id: 'ORDER123456', buyer_total: 10000 }];
    const before = JSON.stringify(state.canonical_payments);
    for (let index = 0; index < 2; index++) {
      const result = await PaymentService.reconcileTransactions({ providerName: 'ipaymu' });
      assert.strictEqual(result.persisted, false); assert.strictEqual(result.reconciled_count, 0);
      assert.strictEqual(result.records[0].status, 'IDENTITY_UNVERIFIED');
    }
    assert.strictEqual(calls, 2); assert.strictEqual(JSON.stringify(state.canonical_payments), before);
  });
  console.log('P0 adapter/containment checks passed: ' + passed + '; atomicity and durable ordering remain BLOCKED');
}
run().catch(() => { console.error('P0 fixture runner failed'); process.exitCode = 1; });