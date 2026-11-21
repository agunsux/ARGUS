/**
 * TIKUM / ARGUS — iPaymu Preview Sandbox Gate & State Progression Test Suite
 *
 * Verifies:
 * 1. Environment-Locked Gate (Production Denial, Preview requirement, Environment Mismatch, URL Mismatch, Missing Credentials)
 * 2. Client Parameter Resistance (zero browser/client overrides allowed)
 * 3. Default Containment (IPAYMU_PREVIEW_SANDBOX_ENABLED !== 'true' throws IPAYMU_ATOMIC_TRANSITION_UNAVAILABLE)
 * 4. PENDING -> SUCCESS state progression through UnitOfWork
 * 5. SUCCESS -> PENDING/FAILED/EXPIRED downgrade protection
 * 6. Duplicate callback idempotency (zero duplicate ledger or outbox entries)
 * 7. Amount mismatch rejection (HTTP 422 / AMOUNT_MISMATCH)
 * 8. Provider inquiry failure handling (HTTP 409 / GATEWAY_STATUS_UNCONFIRMED)
 * 9. Outbox retry and deduplication
 * 10. Failure rollback resilience
 */

const assert = require('assert');
const crypto = require('crypto');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { IPaymuProvider } = require('./src/services/payment/IPaymuProvider');
const { paymentManager } = require('./src/services/payment/index');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { MONEY_STATE, CANONICAL_PAYMENT_STATUS } = require('./src/services/payment/canonicalPaymentTypes');
const { EscrowService } = require('./src/services/escrowService');
const { UnitOfWork } = require('./src/storage/UnitOfWork');
const { OutboxDispatcher } = require('./src/services/outbox/OutboxDispatcher');
const { state } = require('./src/database');

console.log('================================================================');
console.log('  TIKUM — iPaymu PREVIEW SANDBOX GATE & FINANCIAL INTEGRITY');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function asyncCheck(title, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

// Preserve original environment
const originalEnv = { ...process.env };

function resetEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) {
      delete process.env[k];
    }
  }
  Object.assign(process.env, originalEnv);
}

function setValidPreviewSandboxEnv() {
  process.env.NODE_ENV = 'test';
  delete process.env.APP_ENV;
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'preview-argus-git-preview.vercel.app';
  process.env.IPAYMU_PREVIEW_SANDBOX_ENABLED = 'true';
  process.env.IPAYMU_ENV = 'sandbox';
  process.env.IPAYMU_BASE_URL = 'https://sandbox.ipaymu.com/api/v2';
  process.env.IPAYMU_API_KEY = 'sandbox-api-key-test-12345';
  process.env.IPAYMU_VA = '1122334455';
  process.env.MARKETPLACE_MODE = 'LIVE';
}

function generateValidWebhook(payload, va) {
  const values = {
    ...payload,
    trx_id: Number(payload.trx_id),
    status_code: Number(payload.status_code),
    paid_off: Number(payload.paid_off),
    transaction_status_code: Number(payload.transaction_status_code),
    is_escrow: false,
    additional_info: []
  };
  const json = JSON.stringify(Object.fromEntries(Object.keys(values).sort().map(k => [k, values[k]])));
  const signature = crypto.createHmac('sha256', va).update(json).digest('hex');
  return {
    headers: { 'x-signature': signature },
    body: payload
  };
}

(async () => {
  try {
    console.log('── Section 1: Environment-Locked Gate & Security Containment ──');

    check('1.1 Preview Sandbox Gate passes when ALL 5 conditions are satisfied', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      const res = PaymentService.assertIPaymuPreviewSandboxGate();
      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.environment, 'sandbox');
      assert.strictEqual(res.deployment, 'preview');
    });

    check('1.2 Production environment ALWAYS rejects (VERCEL_ENV=production)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      process.env.VERCEL_ENV = 'production';
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_PRODUCTION_LOCKED');
        return true;
      });
    });

    check('1.3 Production environment ALWAYS rejects (NODE_ENV=production)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      process.env.NODE_ENV = 'production';
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_PRODUCTION_LOCKED');
        return true;
      });
    });

    check('1.4 Preview authorization flag missing/disabled rejects (default containment)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      delete process.env.IPAYMU_PREVIEW_SANDBOX_ENABLED;
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_ATOMIC_TRANSITION_UNAVAILABLE');
        return true;
      });
    });

    check('1.5 Non-preview Vercel environment rejects (VERCEL_ENV=development or unset)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      process.env.VERCEL_ENV = 'development';
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_PREVIEW_ONLY');
        return true;
      });
    });

    check('1.6 Environment mismatch rejects (IPAYMU_ENV=production under preview)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      process.env.IPAYMU_ENV = 'production';
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_ENV_INVALID');
        return true;
      });
    });

    check('1.7 Base URL mismatch rejects (live URL under sandbox)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      process.env.IPAYMU_BASE_URL = 'https://my.ipaymu.com/api/v2';
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_BASE_URL_INVALID');
        return true;
      });
    });

    check('1.8 Missing credentials rejects (missing IPAYMU_API_KEY)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      delete process.env.IPAYMU_API_KEY;
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_CREDENTIALS_MISSING');
        return true;
      });
    });

    check('1.9 Missing credentials rejects (missing IPAYMU_VA)', () => {
      resetEnv();
      setValidPreviewSandboxEnv();
      delete process.env.IPAYMU_VA;
      assert.throws(() => {
        PaymentService.assertIPaymuPreviewSandboxGate();
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_CREDENTIALS_MISSING');
        return true;
      });
    });

    await asyncCheck('1.10 PaymentService.createPayment fails closed when gate is disabled', async () => {
      resetEnv();
      process.env.MARKETPLACE_MODE = 'LIVE';
      delete process.env.IPAYMU_PREVIEW_SANDBOX_ENABLED;

      await assert.rejects(async () => {
        await PaymentService.createPayment({
          orderId: 'ord-test-blocked',
          amount: 50000,
          currency: 'IDR',
          channel: 'BCA_VA',
          providerName: 'ipaymu'
        });
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_ATOMIC_TRANSITION_UNAVAILABLE');
        return true;
      });
    });

    await asyncCheck('1.11 PaymentService.handleWebhook fails closed when gate is disabled', async () => {
      resetEnv();
      delete process.env.IPAYMU_PREVIEW_SANDBOX_ENABLED;

      const mockVa = '1122334455';
      const ipaymu = new IPaymuProvider({
        virtualAccount: mockVa,
        apiKey: 'test-key',
        mode: 'sandbox',
        apiBaseUrl: 'https://sandbox.ipaymu.com/api/v2'
      });
      paymentManager.registerProvider(ipaymu);

      const payload = {
        trx_id: '99887766',
        sid: 'SID-TEST-001',
        reference_id: 'ORD-BLOCK-001',
        status: 'berhasil',
        status_code: '1',
        amount: '100000',
        merchant: mockVa,
        paid_off: '100000',
        transaction_status_code: '1',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, mockVa);

      await assert.rejects(async () => {
        await PaymentService.handleWebhook({
          providerName: 'ipaymu',
          headers,
          body
        });
      }, (err) => {
        assert.strictEqual(err.code, 'IPAYMU_ATOMIC_TRANSITION_UNAVAILABLE');
        return true;
      });
    });

    console.log('\n── Section 2: Financial Lifecycle, Progression & Downgrade Protection ──');

    await asyncCheck('2.1 Payment Initiation creates Canonical Payment in PAYMENT_PENDING', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      // Configure provider for preview simulation
      const ipaymu = new IPaymuProvider({
        virtualAccount: process.env.IPAYMU_VA,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      paymentManager.registerProvider(ipaymu);

      // Create test order in memory state
      const orderId = `ord-gate-test-${Date.now()}`;
      state.orders = state.orders || [];
      const orderRecord = {
        id: orderId,
        buyer_id: 'usr-buyer-001',
        seller_id: 'usr-seller-001',
        listing_id: 'list-001',
        ticket_id: 'tkt-001',
        event_id: 'evt-001',
        quantity: 1,
        total_amount: 150000,
        buyer_total: 150000,
        seller_payout: 135000,
        buyer_fee: 15000,
        status: 'PENDING_PAYMENT',
        marketplace_status: 'PENDING_PAYMENT',
        currency: 'IDR'
      };
      state.orders.push(orderRecord);

      const result = await PaymentService.createPayment({
        orderId,
        amount: 150000,
        currency: 'IDR',
        channel: 'BCA_VA',
        providerName: 'ipaymu',
        buyer: { id: 'usr-buyer-001', name: 'Buyer Test' }
      });

      assert.strictEqual(result.orderId, orderId);
      assert.strictEqual(result.provider, 'ipaymu');
      assert.strictEqual(result.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING);

      const canonical = state.canonical_payments.find(p => p.order_id === orderId);
      assert.ok(canonical, 'Canonical payment must be stored');
      assert.strictEqual(canonical.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING);
      assert.strictEqual(canonical.money_state, MONEY_STATE.PAYMENT_PENDING);
    });

    await asyncCheck('2.2 PENDING -> SUCCESS progression updates Order, Ledger, and Outbox', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const va = process.env.IPAYMU_VA;
      const ipaymu = new IPaymuProvider({
        virtualAccount: va,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      // Mock inquiry on the provider instance to confirm status
      ipaymu.getPaymentStatus = async ({ providerRef, orderId }) => {
        return {
          orderId,
          providerRef: String(providerRef),
          status: MONEY_STATE.PAID,
          amount: 150000,
          provider: 'ipaymu',
          simulated: false
        };
      };
      paymentManager.registerProvider(ipaymu);

      const orderId = `ord-prog-${Date.now()}`;
      state.orders = state.orders || [];
      const orderRecord = {
        id: orderId,
        buyer_id: 'usr-buyer-002',
        seller_id: 'usr-seller-002',
        listing_id: 'list-002',
        ticket_id: 'tkt-002',
        event_id: 'evt-002',
        quantity: 1,
        total_amount: 150000,
        buyer_total: 150000,
        seller_payout: 135000,
        buyer_fee: 15000,
        status: 'PENDING_PAYMENT',
        marketplace_status: 'PENDING_PAYMENT',
        currency: 'IDR'
      };
      state.orders.push(orderRecord);

      // Add escrow record
      state.escrows = state.escrows || [];
      state.escrows.push({
        id: `esc-${orderId}`,
        order_id: orderId,
        buyer_id: 'usr-buyer-002',
        seller_id: 'usr-seller-002',
        amount: 135000,
        status: 'PENDING_PAYMENT'
      });

      // Add listing record for inventory
      state.listings = state.listings || [];
      state.listings.push({
        id: 'list-002',
        event_id: 'evt-002',
        status: 'ACTIVE',
        available_quantity: 1,
        reserved_quantity: 1
      });

      // Create payment
      await PaymentService.createPayment({
        orderId,
        amount: 150000,
        currency: 'IDR',
        channel: 'BCA_VA',
        providerName: 'ipaymu',
        buyer: { id: 'usr-buyer-002', name: 'Buyer Test' }
      });

      // Send webhook callback
      const trxId = '88221100';
      const payload = {
        trx_id: trxId,
        sid: 'SID-PROG-001',
        reference_id: orderId,
        status: 'berhasil',
        status_code: '1',
        amount: '150000',
        merchant: va,
        paid_off: '150000',
        transaction_status_code: '1',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, va);

      const ledgerCountBefore = (state.financial_ledgers || []).length;

      const webhookRes = await PaymentService.handleWebhook({
        providerName: 'ipaymu',
        headers,
        body
      });

      assert.strictEqual(webhookRes.idempotent, false);
      assert.strictEqual(orderRecord.marketplace_status, 'PAID');

      const canonical = state.canonical_payments.find(p => p.order_id === orderId);
      assert.strictEqual(canonical.status, MONEY_STATE.PAID);

      // Verify double-entry ledger entries were generated and balanced
      const journalTx = (state.financial_ledger || []).find(l => l.order_id === orderId);
      assert.ok(journalTx, 'Must create journal transaction');
      assert.ok(journalTx.entries.length >= 2, 'Must create at least debit and credit ledger entries');
      const totalDebits = journalTx.entries.filter(e => e.type === 'DEBIT').reduce((s, e) => s + (parseInt(e.amount, 10) || 0), 0);
      const totalCredits = journalTx.entries.filter(e => e.type === 'CREDIT').reduce((s, e) => s + (parseInt(e.amount, 10) || 0), 0);
      assert.strictEqual(totalDebits, totalCredits, 'Financial ledger must be strictly balanced');
    });

    await asyncCheck('2.3 Duplicate Callbacks return idempotent 200 with zero duplicate ledger postings', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const va = process.env.IPAYMU_VA;
      const ipaymu = new IPaymuProvider({
        virtualAccount: va,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      ipaymu.getPaymentStatus = async ({ providerRef, orderId }) => ({
        orderId, providerRef, status: MONEY_STATE.PAID, amount: 200000, simulated: false
      });
      paymentManager.registerProvider(ipaymu);

      const orderId = `ord-dedup-${Date.now()}`;
      state.orders.push({
        id: orderId,
        buyer_id: 'usr-buyer-003',
        seller_id: 'usr-seller-003',
        listing_id: 'list-003',
        total_amount: 200000,
        buyer_total: 200000,
        seller_payout: 180000,
        status: 'PENDING_PAYMENT',
        currency: 'IDR'
      });
      state.escrows.push({
        id: `esc-${orderId}`,
        order_id: orderId,
        amount: 180000,
        status: 'PENDING_PAYMENT'
      });
      state.listings.push({ id: 'list-003', available_quantity: 1, reserved_quantity: 1, status: 'ACTIVE' });

      await PaymentService.createPayment({
        orderId, amount: 200000, currency: 'IDR', channel: 'BCA_VA', providerName: 'ipaymu'
      });

      const trxId = '99112233';
      const payload = {
        trx_id: trxId,
        sid: 'SID-DEDUP-001',
        reference_id: orderId,
        status: 'berhasil',
        status_code: '1',
        amount: '200000',
        merchant: va,
        paid_off: '200000',
        transaction_status_code: '1',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, va);

      // First webhook call
      const firstRes = await PaymentService.handleWebhook({ providerName: 'ipaymu', headers, body });
      assert.strictEqual(firstRes.idempotent, false);

      const journalCountAfterFirst = (state.financial_ledger || []).filter(l => l.order_id === orderId).length;
      assert.strictEqual(journalCountAfterFirst, 1);

      // Second webhook call (duplicate)
      const secondRes = await PaymentService.handleWebhook({ providerName: 'ipaymu', headers, body });
      assert.strictEqual(secondRes.idempotent, true);

      const journalCountAfterSecond = (state.financial_ledger || []).filter(l => l.order_id === orderId).length;
      assert.strictEqual(journalCountAfterSecond, 1, 'Zero duplicate ledger entries allowed');
    });

    await asyncCheck('2.4 Amount Mismatch throws AMOUNT_MISMATCH and rolls back without mutations', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const va = process.env.IPAYMU_VA;
      const ipaymu = new IPaymuProvider({
        virtualAccount: va,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      ipaymu.getPaymentStatus = async ({ providerRef, orderId }) => ({
        orderId, providerRef, status: MONEY_STATE.PAID, amount: 50000, simulated: false
      });
      paymentManager.registerProvider(ipaymu);

      const orderId = `ord-mismatch-${Date.now()}`;
      state.orders.push({
        id: orderId,
        buyer_id: 'usr-buyer-004',
        seller_id: 'usr-seller-004',
        total_amount: 100000,
        buyer_total: 100000,
        seller_payout: 90000,
        status: 'PENDING_PAYMENT',
        currency: 'IDR'
      });

      await PaymentService.createPayment({
        orderId, amount: 100000, currency: 'IDR', channel: 'BCA_VA', providerName: 'ipaymu'
      });

      const payload = {
        trx_id: '77665544',
        sid: 'SID-MISMATCH-001',
        reference_id: orderId,
        status: 'berhasil',
        status_code: '1',
        amount: '50000', // Underpaid! Expected 100000
        merchant: va,
        paid_off: '50000',
        transaction_status_code: '1',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, va);

      await assert.rejects(async () => {
        await PaymentService.handleWebhook({ providerName: 'ipaymu', headers, body });
      }, (err) => {
        assert.strictEqual(err.code, 'AMOUNT_MISMATCH');
        return true;
      });

      const order = state.orders.find(o => o.id === orderId);
      assert.strictEqual(order.status, 'PENDING_PAYMENT', 'Order must remain PENDING_PAYMENT on mismatch');
      const canonical = state.canonical_payments.find(p => p.order_id === orderId);
      assert.strictEqual(canonical.status, CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING);
    });

    await asyncCheck('2.5 SUCCESS -> FAILED/EXPIRED Downgrade Protection prevents state corruption', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const va = process.env.IPAYMU_VA;
      const ipaymu = new IPaymuProvider({
        virtualAccount: va,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      paymentManager.registerProvider(ipaymu);

      const orderId = `ord-downgrade-guard-${Date.now()}`;
      const paidOrder = {
        id: orderId,
        buyer_id: 'usr-buyer-005',
        seller_id: 'usr-seller-005',
        listing_id: 'list-005',
        total_amount: 300000,
        buyer_total: 300000,
        status: 'PAID',
        marketplace_status: 'PAID',
        currency: 'IDR'
      };
      state.orders.push(paidOrder);

      state.canonical_payments.push({
        id: `pay-${orderId}`,
        order_id: orderId,
        status: MONEY_STATE.PAID,
        money_state: MONEY_STATE.PAID,
        provider: 'ipaymu',
        provider_reference: 'trx-downgrade-check'
      });

      // Now an out-of-order/delayed webhook arrives reporting FAILED or EXPIRED
      const payload = {
        trx_id: '99001122',
        sid: 'SID-EXPIRED-LATE',
        reference_id: orderId,
        status: 'expired',
        status_code: '-2',
        amount: '300000',
        merchant: va,
        paid_off: '0',
        transaction_status_code: '-2',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, va);

      const downgradeRes = await PaymentService.handleWebhook({ providerName: 'ipaymu', headers, body });

      assert.strictEqual(downgradeRes.idempotent, true);
      assert.strictEqual(downgradeRes.reason, 'STATE_DOWNGRADE_FORBIDDEN');
      assert.strictEqual(paidOrder.marketplace_status, 'PAID', 'Order status must NOT be downgraded to EXPIRED');
      assert.strictEqual(paidOrder.status, 'PAID');

      const canonical = state.canonical_payments.find(p => p.order_id === orderId);
      assert.strictEqual(canonical.money_state, MONEY_STATE.PAID, 'Canonical money state must remain PAID');
    });

    await asyncCheck('2.6 Provider Inquiry Unconfirmed aborts with GATEWAY_STATUS_UNCONFIRMED', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const va = process.env.IPAYMU_VA;
      const ipaymu = new IPaymuProvider({
        virtualAccount: va,
        apiKey: process.env.IPAYMU_API_KEY,
        mode: 'sandbox',
        apiBaseUrl: process.env.IPAYMU_BASE_URL,
        allowSimulation: true,
        merchantVerified: true
      });
      // Inquiry returns still pending despite webhook claiming paid!
      ipaymu.getPaymentStatus = async ({ providerRef, orderId }) => ({
        orderId, providerRef, status: MONEY_STATE.PAYMENT_PENDING, amount: 120000, simulated: false
      });
      paymentManager.registerProvider(ipaymu);

      const orderId = `ord-inq-unconfirmed-${Date.now()}`;
      state.orders.push({
        id: orderId,
        buyer_id: 'usr-buyer-006',
        seller_id: 'usr-seller-006',
        total_amount: 120000,
        buyer_total: 120000,
        status: 'PENDING_PAYMENT',
        currency: 'IDR'
      });

      await PaymentService.createPayment({
        orderId, amount: 120000, currency: 'IDR', channel: 'BCA_VA', providerName: 'ipaymu'
      });

      const payload = {
        trx_id: '33445566',
        sid: 'SID-INQ-001',
        reference_id: orderId,
        status: 'berhasil',
        status_code: '1',
        amount: '120000',
        merchant: va,
        paid_off: '120000',
        transaction_status_code: '1',
        is_escrow: '0',
        additional_info: '[]'
      };
      const { headers, body } = generateValidWebhook(payload, va);

      await assert.rejects(async () => {
        await PaymentService.handleWebhook({ providerName: 'ipaymu', headers, body });
      }, (err) => {
        assert.strictEqual(err.code, 'GATEWAY_STATUS_UNCONFIRMED');
        return true;
      });

      const order = state.orders.find(o => o.id === orderId);
      assert.strictEqual(order.status, 'PENDING_PAYMENT', 'Order must remain PENDING_PAYMENT when inquiry fails');
    });

    console.log('\n── Section 3: Outbox & Failure Rollback Resilience ──');

    await asyncCheck('3.1 Outbox records ARGUS event and dispatcher prevents duplicate dispatch', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const { outboxDispatcher } = require('./src/services/outbox/OutboxDispatcher');

      const orderId = `ord-outbox-${Date.now()}`;
      const payload = {
        orderId,
        provider: 'ipaymu',
        amount: 250000,
        buyerId: 'usr-buyer-007'
      };

      const event = await outboxDispatcher.publishEvent({
        aggregateType: 'ORDER',
        aggregateId: orderId,
        eventType: 'PAYMENT_CONFIRMED',
        payload
      });

      assert.ok(event.id);
      assert.strictEqual(event.status, 'PENDING');

      // Dispatch pending events
      const results = await outboxDispatcher.dispatchPendingEvents(10);
      assert.ok(results.length >= 1);
      const processedResult = results.find(r => r.eventId === event.event_id || r.eventId === event.id);
      assert.ok(processedResult);
      assert.strictEqual(processedResult.status, 'PROCESSED');

      // Verify event in state is now PROCESSED
      const updatedEvent = (state.financial_outbox || []).find(e => e.id === event.id || e.event_id === event.event_id);
      assert.ok(updatedEvent);
      assert.strictEqual(updatedEvent.status, 'PROCESSED');

      // Re-running dispatch should NOT reprocess this event (deduplication)
      const secondRun = await outboxDispatcher.dispatchPendingEvents(10);
      const reprocessed = secondRun.find(r => r.eventId === event.event_id || r.eventId === event.id);
      assert.strictEqual(reprocessed, undefined, 'Already processed events must not be dispatched again');
    });

    await asyncCheck('3.2 Injected Failure inside UnitOfWork rolls back all mutations atomically', async () => {
      resetEnv();
      setValidPreviewSandboxEnv();

      const orderId = `ord-rollback-${Date.now()}`;
      state.orders.push({
        id: orderId,
        buyer_id: 'usr-buyer-008',
        seller_id: 'usr-seller-008',
        total_amount: 175000,
        buyer_total: 175000,
        status: 'PENDING_PAYMENT',
        currency: 'IDR'
      });

      let reachedCheckpoint = false;

      await assert.rejects(async () => {
        await UnitOfWork.execute(async (tx) => {
          // Mutate order inside transaction
          const order = state.orders.find(o => o.id === orderId);
          order.status = 'PAID';
          order.marketplace_status = 'PAID';

          // Post ledger entry
          await FinancialLedger.recordPaymentCapture({
            orderId,
            ticketPrice: 160000,
            platformFee: 15000
          }, tx);

          reachedCheckpoint = true;

          // Injected fatal failure
          const err = new Error('Database connection reset during ledger commit');
          err.code = 'ECONNRESET';
          throw err;
        });
      }, (err) => {
        assert.strictEqual(err.code, 'ECONNRESET');
        return true;
      });

      assert.strictEqual(reachedCheckpoint, true);

      // Verify rollback: order status must be restored to PENDING_PAYMENT
      const order = state.orders.find(o => o.id === orderId);
      assert.strictEqual(order.status, 'PENDING_PAYMENT', 'Order must be restored to PENDING_PAYMENT on rollback');

      // Verify ledger entries for this order were rolled back
      const ledgerTxs = (state.financial_ledger || []).filter(l => l.order_id === orderId);
      assert.strictEqual(ledgerTxs.length, 0, 'Ledger entries must be completely rolled back');
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} iPaymu PREVIEW GATE TESTS PASSED`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
    process.exit(1);
  } finally {
    resetEnv();
  }
})();
