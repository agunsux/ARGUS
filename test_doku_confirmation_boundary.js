process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { state, resetDatabase } = require('./src/database');
const { paymentManager } = require('./src/services/payment');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { MONEY_STATE } = require('./src/services/payment/canonicalPaymentTypes');

(async () => {
  const provider = paymentManager.getProvider('doku');
  const original = { allowSimulation: provider.allowSimulation, verifyWebhook: provider.verifyWebhook, parseWebhook: provider.parseWebhook, getPaymentStatus: provider.getPaymentStatus };
  let passed = 0;
  try {
    for (const scenario of ['timeout', 'pending', 'simulated', 'wrong-invoice', 'wrong-amount', 'wrong-currency', 'missing-response', 'unknown-order']) {
      resetDatabase();
      if (scenario !== 'unknown-order') state.orders.push({ id: 'boundary-order', buyer_total: 1000, currency: 'IDR', status: 'PENDING' });
      state.canonical_payments = [{ order_id: 'boundary-order', status: 'PAYMENT_PENDING' }];
      const before = JSON.stringify(state.canonical_payments);
      provider.allowSimulation = false;
      // Local fixture isolates the confirmation boundary AFTER signature verification.
      provider.verifyWebhook = () => true;
      provider.parseWebhook = () => ({ orderId: 'boundary-order', providerRef: 'boundary-ref', providerEventId: 'boundary-event', status: MONEY_STATE.PAID, amount: 1000, currency: 'IDR' });
      provider.getPaymentStatus = async () => {
        if (scenario === 'timeout') throw new Error('fixture timeout');
        if (scenario === 'missing-response') return null;
        return {
          status: scenario === 'pending' ? MONEY_STATE.PAYMENT_PENDING : MONEY_STATE.PAID,
          simulated: scenario === 'simulated', amount: scenario === 'wrong-amount' ? 1 : 1000,
          currency: scenario === 'wrong-currency' ? 'USD' : 'IDR',
          rawResponse: { order: { invoice_number: scenario === 'wrong-invoice' ? 'unrelated' : 'INV-DOKU-boundary-order' } }
        };
      };
      await assert.rejects(PaymentService.handleWebhook({ providerName: 'doku', body: {} }), { code: 'GATEWAY_STATUS_UNCONFIRMED' });
      assert.equal(JSON.stringify(state.canonical_payments), before);
      assert.equal(state.provider_webhooks.length, 0);
      assert.equal(state.processed_webhooks.size, 0);
      passed++;
    }
  } finally {
    Object.assign(provider, original);
    resetDatabase();
  }
  console.log(`DOKU confirmation boundary: PASS=${passed} FAIL=0 SKIPPED=0; fixture, not gateway evidence`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });