/**
 * TIKUM / ARGUS — DOKU Direct API Sandbox End-to-End Test Suite
 *
 * Local simulation contract suite only. Self-signed notifications below are fixtures,
 * never evidence of a payment received by the official DOKU Sandbox.
 *
 * Verifies:
 * - Order & VA creation via Direct API
 * - QRIS Direct API creation & escrow boundary verification
 * - Webhook ingestion, signature verification, and replay protection
 * - Idempotency on duplicate notifications
 * - Invariant: PAYMENT SUCCESS !== ESCROW RELEASED
 * - ARGUS central escrow release gating (PIC + TrustPolicyEngine)
 * - Failed & expired transaction handling
 * - Timeout reconciliation
 */

process.env.NODE_ENV = 'test';
// Do not accidentally use inherited live credentials in this fixture-only suite.
delete process.env.DOKU_SANDBOX_CLIENT_ID;
delete process.env.DOKU_SANDBOX_SECRET_KEY;
process.env.MARKETPLACE_MODE = 'LIVE';
process.env.PRIMARY_PROVIDER = 'doku';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.DOKU_HOLD_RELEASE_ENABLED = 'true';
process.env.DOKU_CONTRACT_VERIFIED = 'true';
process.env.DOKU_CLIENT_ID = 'MCH-SHINERVA-SANDBOX-001';
process.env.DOKU_SECRET_KEY = 'SK-SHINERVA-SANDBOX-KEY-999';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const { state, resetDatabase } = require('./src/database');
const { paymentManager, DokuPaymentProvider } = require('./src/services/payment/index');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { MONEY_STATE, CANONICAL_PAYMENT_STATUS } = require('./src/services/payment/canonicalPaymentTypes');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { EscrowService, ESCROW_STATUS } = require('./src/services/escrowService');
const { TrustPolicyEngine } = require('./src/trust/TrustPolicyEngine');

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✅ [PASS] ${title}`);
        passed++;
      }).catch(err => {
        console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
        throw err;
      });
    }
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  console.log('================================================================================');
  console.log('  TIKUM / ARGUS — DOKU DIRECT API SANDBOX E2E VERIFICATION SUITE              ');
  console.log('================================================================================\n');

  resetDatabase();

  assert.strictEqual(paymentManager.getProvider('doku').allowSimulation, true,
    'Fixture suite requires simulation; use a separate official gateway integration flow');
  console.log('Mode: LOCAL_SIMULATION_ONLY — NOT OFFICIAL SANDBOX PAID EVIDENCE');
  const mockClientId = process.env.DOKU_CLIENT_ID;
  const mockSecretKey = process.env.DOKU_SECRET_KEY;

  const orderId = 'ord-sandbox-e2e-001';
  state.orders = [{
    id: orderId,
    ticket_id: 't-sbx-01',
    event_id: 'ev-sbx-01',
    buyer_id: 'buyer-sbx-01',
    seller_id: 'seller-sbx-01',
    total_amount: 750000,
    gross_amount: 750000,
    platform_fee: 37500,
    seller_payout: 712500,
    status: 'PENDING_PAYMENT'
  }];

  state.escrows = [{
    id: `esc-${orderId}`,
    order_id: orderId,
    buyer_id: 'buyer-sbx-01',
    seller_id: 'seller-sbx-01',
    amount: 712500,
    gross_amount: 750000,
    status: ESCROW_STATUS.PENDING_PAYMENT,
    requires_escrow: true
  }];

  state.tickets = [{
    id: 't-sbx-01',
    event_id: 'ev-sbx-01',
    seller_id: 'seller-sbx-01',
    status: 'RESERVED',
    validation_status: 'VERIFIED',
    price: 750000
  }];

  state.events = [{
    id: 'ev-sbx-01',
    name: 'Synchronize Festival 2026',
    date: '2026-10-04T19:00:00Z',
    status: 'ACTIVE'
  }];

  // ---------------------------------------------------------------------------
  // 1. ORDER & VIRTUAL ACCOUNT CREATION
  // ---------------------------------------------------------------------------
  console.log('── Step 1: Create Virtual Account via Direct API ──');

  await check('1.1 Direct API VA creation initiates Virtual Account with hold_settlement: true', async () => {
    const payment = await PaymentService.createPayment({
      orderId,
      amount: 750000,
      channel: 'VA_BCA',
      buyer: { id: 'buyer-sbx-01', name: 'Sandbox Tester', email: 'tester@tikum.app', phone: '08123456789' },
      requiresEscrow: true
    });

    assert.ok(payment);
    assert.strictEqual(payment.orderId, orderId);
    assert.strictEqual(payment.status, MONEY_STATE.PAYMENT_PENDING);
    assert.ok(payment.paymentDetails.virtualAccount || payment.paymentDetails.vaNumber);
  });

  // ---------------------------------------------------------------------------
  // 2. QRIS DIRECT API CHANNELS & CONSTRAINTS
  // ---------------------------------------------------------------------------
  console.log('\n── Step 2: Direct API QRIS Channel Testing ──');

  await check('2.1 QRIS Direct API strictly rejects milestone escrow (no hold support)', async () => {
    const qrisOrd = 'ord-sbx-qris-01';
    state.orders.push({
      id: qrisOrd,
      ticket_id: 't-qris-sbx',
      buyer_id: 'buyer-sbx-02',
      seller_id: 'seller-sbx-01',
      total_amount: 100000,
      gross_amount: 100000,
      status: 'PENDING_PAYMENT'
    });

    await assert.rejects(async () => {
      await PaymentService.createPayment({
        orderId: qrisOrd,
        amount: 100000,
        channel: 'QRIS',
        buyer: { id: 'buyer-sbx-02' },
        requiresEscrow: true
      });
    }, (err) => {
      assert.strictEqual(err.name, 'CapabilityUnsupportedError');
      return true;
    });
  });

  await check('2.2 QRIS Direct API generates QR string for standard direct checkout', async () => {
    const qrisOrd = 'ord-sbx-qris-02';
    state.orders.push({
      id: qrisOrd,
      ticket_id: 't-qris-sbx-2',
      buyer_id: 'buyer-sbx-02',
      seller_id: 'seller-sbx-01',
      total_amount: 100000,
      gross_amount: 100000,
      status: 'PENDING_PAYMENT'
    });

    const payment = await PaymentService.createPayment({
      orderId: qrisOrd,
      amount: 100000,
      channel: 'QRIS',
      buyer: { id: 'buyer-sbx-02' },
      requiresEscrow: false
    });

    assert.strictEqual(payment.channel, 'QRIS');
    assert.ok(payment.paymentDetails.qrString);
  });

  // ---------------------------------------------------------------------------
  // 3. PAYMENT NOTIFICATION & WEBHOOK INGESTION
  // ---------------------------------------------------------------------------
  console.log('\n── Step 3: DOKU Payment Notification & Webhook Processing ──');

  const providerRef = `doku-trx-${orderId}`;
  const webhookPayload = {
    order: {
      invoice_number: `INV-DOKU-${orderId}`,
      amount: 750000
    },
    transaction: {
      transaction_id: providerRef,
      status: 'SUCCESS',
      date: new Date().toISOString()
    }
  };

  const rawBody = JSON.stringify(webhookPayload);
  const digest = crypto.createHash('sha256').update(rawBody, 'utf8').digest('base64');
  const requestId = `req-sbx-${Date.now()}`;
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const component = `Client-Id:${mockClientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
  const sig = 'HMACSHA256=' + crypto.createHmac('sha256', mockSecretKey).update(component).digest('base64');

  await check('3.1 Valid signed webhook transitions order to PAID and escrow to ESCROWED', async () => {
    const result = await PaymentService.handleWebhook({
      providerName: 'doku',
      headers: {
        'client-id': mockClientId,
        'request-id': requestId,
        'request-timestamp': timestamp,
        'signature': sig
      },
      body: webhookPayload,
      rawBodyBuffer: Buffer.from(rawBody, 'utf8')
    });

    assert.strictEqual(result.idempotent, false);
    assert.strictEqual(result.event.status, MONEY_STATE.PAID);

    const escrow = state.escrows.find(e => e.order_id === orderId);
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
  });

  await check('3.2 Replayed duplicate webhook returns idempotent: true without double-credit', async () => {
    const initialLedgerCount = (state.financial_ledger || []).length;

    const result = await PaymentService.handleWebhook({
      providerName: 'doku',
      headers: {
        'client-id': mockClientId,
        'request-id': requestId,
        'request-timestamp': timestamp,
        'signature': sig
      },
      body: webhookPayload,
      rawBodyBuffer: Buffer.from(rawBody, 'utf8')
    });

    assert.strictEqual(result.idempotent, true);
    const postLedgerCount = (state.financial_ledger || []).length;
    assert.strictEqual(postLedgerCount, initialLedgerCount, 'No duplicate ledger entry on replayed webhook');
  });

  await check('3.3 Delayed webhook with timestamp drift > 300s is rejected', async () => {
    const expiredTs = new Date(Date.now() - 360 * 1000).toISOString().slice(0, 19) + 'Z';
    const expComp = `Client-Id:${mockClientId}\nRequest-Id:exp-req-1\nRequest-Timestamp:${expiredTs}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${digest}`;
    const expSig = 'HMACSHA256=' + crypto.createHmac('sha256', mockSecretKey).update(expComp).digest('base64');

    await assert.rejects(async () => {
      await PaymentService.handleWebhook({
        providerName: 'doku',
        headers: {
          'client-id': mockClientId,
          'request-id': 'exp-req-1',
          'request-timestamp': expiredTs,
          'signature': expSig
        },
        body: webhookPayload,
        rawBodyBuffer: Buffer.from(rawBody, 'utf8')
      });
    }, (err) => {
      assert.strictEqual(err.code, 'INVALID_WEBHOOK_SIGNATURE');
      return true;
    });
  });

  await check('3.4 Payment status inquiry queries DOKU status without errors', async () => {
    const doku = paymentManager.getProvider('doku');
    const statusResult = await doku.getPaymentStatus({
      orderId,
      invoiceNumber: `INV-DOKU-${orderId}`,
      providerRef
    });
    assert.ok(statusResult);
    assert.strictEqual(statusResult.provider, 'doku');
    assert.strictEqual(statusResult.orderId, orderId);
    assert.ok(statusResult.status);
  });

  await check('3.5 Tampered webhook payload/signature is strictly rejected', async () => {
    const forgedSig = 'HMACSHA256=' + crypto.createHmac('sha256', 'WRONG-SECRET-KEY').update(component).digest('base64');
    await assert.rejects(async () => {
      await PaymentService.handleWebhook({
        providerName: 'doku',
        headers: {
          'client-id': mockClientId,
          'request-id': requestId,
          'request-timestamp': timestamp,
          'signature': forgedSig
        },
        body: webhookPayload,
        rawBodyBuffer: Buffer.from(rawBody, 'utf8')
      });
    }, (err) => {
      assert.strictEqual(err.code, 'INVALID_WEBHOOK_SIGNATURE');
      return true;
    });
  });

  await check('3.6 Webhook verification accepts x-vercel-protection-bypass header and _vercel_share query without cryptographic degradation', async () => {
    // Verifies that Vercel Deployment Protection bypass mechanisms do NOT alter HMAC computation or target
    const bypassHeaders = {
      'client-id': mockClientId,
      'request-id': `req-bypass-${Date.now()}`,
      'request-timestamp': timestamp,
      'x-vercel-protection-bypass': 'automation-bypass-test-token',
      'request-target': '/api/v1/payments/webhook/doku?_vercel_share=automation-bypass-test-token'
    };
    const compBypass = `Client-Id:${mockClientId}\nRequest-Id:${bypassHeaders['request-id']}\nRequest-Timestamp:${timestamp}\nRequest-Target:${bypassHeaders['request-target']}\nDigest:${digest}`;
    bypassHeaders['signature'] = 'HMACSHA256=' + crypto.createHmac('sha256', mockSecretKey).update(compBypass).digest('base64');

    const doku = paymentManager.getProvider('doku');
    const isValid = doku.verifyWebhook(bypassHeaders, webhookPayload, Buffer.from(rawBody, 'utf8'));
    assert.strictEqual(isValid, true, 'Cryptographic verification passes with bypass metadata');
  });

  // ---------------------------------------------------------------------------
  // 4. CENTRALIZED ARGUS ESCROW RELEASE
  // ---------------------------------------------------------------------------
  console.log('\n── Step 4: Centralized ARGUS Escrow Release Gating ──');

  await check('4.1 Escrow remains HELD and seller remains UNPAID until ARGUS approval', async () => {
    const escrow = state.escrows.find(e => e.order_id === orderId);
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(escrow.released_at, undefined);
  });

  await check('4.2 Releasing escrow without PIC admission throws ENTRY_NOT_CONFIRMED', async () => {
    await assert.rejects(async () => {
      await EscrowService.releaseToSeller(orderId, 'admin-argus');
    }, (err) => {
      assert.strictEqual(err.code, 'ENTRY_NOT_CONFIRMED');
      return true;
    });
  });

  await check('4.3 With PIC admission and Trust Policy pass, EscrowService executes release', async () => {
    if (!state.entry_verifications) state.entry_verifications = [];
    state.entry_verifications.push({
      order_id: orderId,
      status: 'CONFIRMED',
      verified_by: 'pic-gate-01'
    });

    await TrustPolicyEngine.recordAttestation({ orderId, attestationType: 'PLATFORM_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId, attestationType: 'TICKET_EVIDENCE_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId, attestationType: 'PAYMENT_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId, attestationType: 'BUYER_ATTESTATION', actorId: 'buyer-sbx-01', actorRole: 'BUYER', result: 'PASS' });

    const releaseRes = await EscrowService.releaseToSeller(orderId, 'admin-argus');
    assert.strictEqual(releaseRes.success, true);
    assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
    assert.ok(releaseRes.escrow.released_at);
  });

  await check('4.4 Active dispute strictly freezes escrow and blocks release with TRANSACTION_IN_DISPUTED_STATE', async () => {
    const dispOrd = 'ord-disp-001';
    state.orders.push({
      id: dispOrd,
      ticket_id: 't-disp-01',
      buyer_id: 'buyer-disp',
      seller_id: 'seller-sbx-01',
      total_amount: 500000,
      status: 'PAID'
    });
    state.escrows.push({
      id: `esc-${dispOrd}`,
      order_id: dispOrd,
      amount: 475000,
      status: ESCROW_STATUS.ESCROWED
    });
    state.tickets.push({
      id: 't-disp-01',
      status: 'VERIFIED',
      verification_status: 'VERIFIED'
    });

    await EscrowService.markDisputed(dispOrd, 'buyer-disp', 'Ticket counterfeit claim at venue');

    await assert.rejects(async () => {
      await EscrowService.releaseToSeller(dispOrd, 'admin-argus');
    }, (err) => {
      assert.strictEqual(err.code, 'TRANSACTION_IN_DISPUTED_STATE');
      return true;
    });
  });

  // ---------------------------------------------------------------------------
  // 5. FAILED & EXPIRED TRANSACTION HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n── Step 5: Failed & Expired Transactions ──');

  await check('5.1 Failed payment webhook updates order to CANCELLED and unlocks ticket inventory', async () => {
    const failOrd = 'ord-fail-001';
    state.listings = [{
      id: 'lst-fail-01',
      status: 'RESERVED',
      available_quantity: 0,
      reserved_quantity: 1
    }];
    state.orders.push({
      id: failOrd,
      listing_id: 'lst-fail-01',
      ticket_id: 't-fail-01',
      buyer_id: 'buyer-fail',
      status: 'PENDING_PAYMENT'
    });
    state.tickets.push({
      id: 't-fail-01',
      status: 'RESERVED'
    });
    state.canonical_payments.push({
      order_id: failOrd,
      provider_reference: `INV-DOKU-${failOrd}`,
      status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING
    });

    const failPayload = {
      order: { invoice_number: `INV-DOKU-${failOrd}`, amount: 200000 },
      transaction: { transaction_id: `fail-trx-${failOrd}`, status: 'FAILED' }
    };
    const failRaw = JSON.stringify(failPayload);
    const failDig = crypto.createHash('sha256').update(failRaw).digest('base64');
    const failReqId = `req-fail-${Date.now()}`;
    const failTs = new Date().toISOString().slice(0, 19) + 'Z';
    const failSig = 'HMACSHA256=' + crypto.createHmac('sha256', mockSecretKey)
      .update(`Client-Id:${mockClientId}\nRequest-Id:${failReqId}\nRequest-Timestamp:${failTs}\nRequest-Target:/api/v1/payments/webhook/doku\nDigest:${failDig}`)
      .digest('base64');

    const result = await PaymentService.handleWebhook({
      providerName: 'doku',
      headers: {
        'client-id': mockClientId,
        'request-id': failReqId,
        'request-timestamp': failTs,
        'signature': failSig
      },
      body: failPayload,
      rawBodyBuffer: Buffer.from(failRaw, 'utf8')
    });

    assert.strictEqual(result.event.status, MONEY_STATE.PAYMENT_FAILED);
    const order = state.orders.find(o => o.id === failOrd);
    assert.strictEqual(order.status, 'CANCELLED');
    const listing = state.listings.find(l => l.id === 'lst-fail-01');
    assert.strictEqual(listing.status, 'ACTIVE'); // Inventory unlocked
    assert.strictEqual(listing.available_quantity, 1);
  });

  // ---------------------------------------------------------------------------
  // 6. TIMEOUT RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log('\n── Step 6: Timeout Reconciliation ──');

  await check('6.1 Automated reconciliation detects matched transactions without variance', async () => {
    const report = await PaymentService.reconcileTransactions({
      date: new Date().toISOString().split('T')[0],
      providerName: 'doku'
    });

    assert.ok(report);
    assert.strictEqual(report.variances_found, 0);
  });

  await check('6.2 Release timeout / network failure safely flags settlement as PENDING_RECONCILIATION', async () => {
    const timeoutOrd = 'ord-tout-001';
    state.orders.push({
      id: timeoutOrd,
      ticket_id: 't-tout-01',
      buyer_id: 'buyer-tout',
      seller_id: 'seller-sbx-01',
      total_amount: 300000,
      status: 'PAID'
    });
    state.tickets.push({ id: 't-tout-01', status: 'VERIFIED', verification_status: 'VERIFIED' });
    state.escrows.push({
      id: `esc-${timeoutOrd}`,
      order_id: timeoutOrd,
      amount: 285000,
      status: ESCROW_STATUS.ESCROWED
    });
    state.canonical_payments.push({
      order_id: timeoutOrd,
      provider: 'doku',
      provider_reference: `INV-DOKU-${timeoutOrd}`,
      gross_amount: 300000,
      status: MONEY_STATE.ESCROW_HELD,
      settlement_status: 'SETTLEMENT_HELD',
      money_state: MONEY_STATE.ESCROW_HELD
    });
    state.entry_verifications.push({
      order_id: timeoutOrd,
      status: 'CONFIRMED',
      verified_by: 'pic-gate-01'
    });

    await TrustPolicyEngine.recordAttestation({ orderId: timeoutOrd, attestationType: 'PLATFORM_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId: timeoutOrd, attestationType: 'TICKET_EVIDENCE_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId: timeoutOrd, attestationType: 'PAYMENT_ATTESTATION', actorId: 'SYS', actorRole: 'SYSTEM', result: 'PASS' });
    await TrustPolicyEngine.recordAttestation({ orderId: timeoutOrd, attestationType: 'BUYER_ATTESTATION', actorId: 'buyer-tout', actorRole: 'BUYER', result: 'PASS' });

    // Mock release failure with timeout
    const doku = paymentManager.getProvider('doku');
    const origExecuteRelease = doku.executeRelease;
    doku.executeRelease = async () => {
      const e = new Error('Gateway network timeout during release call');
      e.code = 'RELEASE_TIMEOUT_PENDING_RECONCILIATION';
      e.status = 504;
      throw e;
    };

    try {
      await assert.rejects(async () => {
        await PaymentService.executeRelease({ orderId: timeoutOrd, actorId: 'admin-argus' });
      }, (err) => {
        assert.strictEqual(err.code, 'RELEASE_TIMEOUT_PENDING_RECONCILIATION');
        return true;
      });

      const payment = state.canonical_payments.find(p => p.order_id === timeoutOrd);
      assert.strictEqual(payment.settlement_status, 'PENDING_RECONCILIATION');
    } finally {
      doku.executeRelease = origExecuteRelease;
    }
  });

  // ---------------------------------------------------------------------------
  // 7. CIRCUIT BREAKER FAILURE AND RECOVERY
  // ---------------------------------------------------------------------------
  console.log('\n── Step 7: Circuit Breaker Failure & Recovery ──');

  await check('7.1 Multi-provider circuit breaker trips after 5 consecutive failures and recovers on success', async () => {
    const { PaymentRoutingService } = require('./src/services/payment/PaymentRoutingService');
    PaymentRoutingService.recordProviderSuccess('doku_direct');

    for (let i = 0; i < 5; i++) {
      PaymentRoutingService.recordProviderFailure('doku_direct');
    }
    const status = PaymentRoutingService.getCircuitBreakerStatus();
    assert.strictEqual(status.circuit_breakers.doku_direct.state, 'OPEN', 'Circuit breaker trips to OPEN after 5 failures');

    PaymentRoutingService.recordProviderSuccess('doku_direct');
    const recovered = PaymentRoutingService.getCircuitBreakerStatus();
    assert.strictEqual(recovered.circuit_breakers.doku_direct.state, 'CLOSED', 'Circuit breaker recovers to CLOSED after successful transaction');
  });

  console.log('\n================================================================================');
  console.log(`  DOKU DIRECT API SANDBOX E2E SUMMARY: ${passed}/${total} PASSED | 0 FAILED`);
  console.log('================================================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:', err);
  process.exitCode = 1;
});
