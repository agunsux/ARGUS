/**
 * TIKUM / ARGUS — Four-Provider Payment Orchestration & Tier Routing Acceptance Suite
 *
 * Verifies:
 * 1. Exact 4-Tier Hierarchy:
 *    - Tier 1A: DOKU (Primary)
 *    - Tier 1B: iPaymu (Secondary Tier 1)
 *    - Tier 2A: Midtrans (Fallback Tier 2A)
 *    - Tier 2B: Xendit (Fallback Tier 2B)
 * 2. Provider HTTP Client Realism & Capability Gates:
 *    - Midtrans & Xendit strictly reject milestone escrow with CapabilityUnsupportedError
 *    - iPaymu restricts escrow holding to Virtual Account only (rejects QRIS/Card)
 * 3. In-flight Payment Attempt Pinning:
 *    - PENDING / UNKNOWN state blocks cross-gateway failover (prevents double charging)
 * 4. Circuit Breaker & Ops Kill-Switch Failover:
 *    - Deterministic progression: DOKU -> iPaymu -> Midtrans -> Xendit
 * 5. Escrow Downgrade Prevention:
 *    - Escrow-required orders cannot fail over to non-escrow rails
 * 6. Double-Entry Ledger Solvency:
 *    - sum(debits) === sum(credits)
 */

process.env.NODE_ENV = 'test';
process.env.ENABLE_DOKU_PRODUCTION = 'false';

const assert = require('assert');
const {
  paymentManager,
  DokuPaymentProvider,
  IPaymuProvider,
  MidtransPaymentProvider,
  XenditPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');

const {
  PaymentRoutingService,
  PAYMENT_ATTEMPT_STATUS,
  opsKillSwitches,
  circuitBreakers
} = require('./src/services/payment/PaymentRoutingService');

const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { state, resetDatabase } = require('./src/database');

async function runOrchestrationSuite() {
  console.log('================================================================');
  console.log('  TIKUM — 4-PROVIDER ORCHESTRATION & ROUTING SUITE');
  console.log('================================================================\n');

  resetDatabase();

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Section 1: Hierarchy & Tier Resolution
  // ─────────────────────────────────────────────────────────────
  console.log('── Section 1: Hierarchy & Tier Resolution ──');

  test('1.1 Tier 1A resolves to DOKU', () => {
    const res = PaymentRoutingService.resolveProvider({ tier: 'TIER_1A', requiresEscrow: false });
    assert.strictEqual(res.providerName, 'doku');
    assert.ok(res.provider instanceof DokuPaymentProvider);
  });

  test('1.2 Tier 1B resolves to iPaymu', () => {
    const res = PaymentRoutingService.resolveProvider({ tier: 'TIER_1B', requiresEscrow: false });
    assert.strictEqual(res.providerName, 'ipaymu');
    assert.ok(res.provider instanceof IPaymuProvider);
  });

  test('1.3 Tier 2A resolves to Midtrans', () => {
    const res = PaymentRoutingService.resolveProvider({ tier: 'TIER_2A', requiresEscrow: false });
    assert.strictEqual(res.providerName, 'midtrans');
    assert.ok(res.provider instanceof MidtransPaymentProvider);
  });

  test('1.4 Tier 2B resolves to Xendit', () => {
    const res = PaymentRoutingService.resolveProvider({ tier: 'TIER_2B', requiresEscrow: false });
    assert.strictEqual(res.providerName, 'xendit');
    assert.ok(res.provider instanceof XenditPaymentProvider);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 2: Capability Gates & Escrow Protection
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 2: Capability Gates & Escrow Protection ──');

  await testAsync('2.1 Midtrans rejects milestone escrow with CapabilityUnsupportedError', async () => {
    const midtrans = paymentManager.getProvider('midtrans');
    await assert.rejects(async () => {
      await midtrans.createPayment({
        orderId: 'ord-test-mt-1',
        amount: 100000,
        channel: 'QRIS',
        requiresEscrow: true
      });
    }, (err) => {
      return err instanceof CapabilityUnsupportedError && err.code === 'CAPABILITY_UNSUPPORTED';
    });
  });

  await testAsync('2.2 Xendit rejects milestone escrow with CapabilityUnsupportedError', async () => {
    const xendit = paymentManager.getProvider('xendit');
    await assert.rejects(async () => {
      await xendit.createPayment({
        orderId: 'ord-test-xen-1',
        amount: 100000,
        channel: 'QRIS',
        requiresEscrow: true
      });
    }, (err) => {
      return err instanceof CapabilityUnsupportedError && err.code === 'CAPABILITY_UNSUPPORTED';
    });
  });

  await testAsync('2.3 iPaymu rejects milestone escrow on non-VA channels (QRIS/Card)', async () => {
    const ipaymu = paymentManager.getProvider('ipaymu');
    await assert.rejects(async () => {
      await ipaymu.createPayment({
        orderId: 'ord-test-ip-1',
        amount: 100000,
        channel: 'QRIS',
        requiresEscrow: true
      });
    }, (err) => {
      return err.code === 'ESCROW_CHANNEL_UNSUPPORTED' || err.code === 'UNSUPPORTED_ESCROW_CHANNEL';
    });
  });

  test('2.4 Escrow-required transaction strictly blocks routing to non-escrow providers', () => {
    assert.throws(() => {
      PaymentRoutingService.resolveProvider({ tier: 'TIER_2A', requiresEscrow: true });
    }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED');

    assert.throws(() => {
      PaymentRoutingService.resolveProvider({ tier: 'TIER_2B', requiresEscrow: true });
    }, (err) => err.code === 'ESCROW_CAPABILITY_REQUIRED');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 3: Attempt Pinning & Unknown Outcome Protection
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 3: Attempt Pinning & Unknown Outcome Protection ──');

  test('3.1 In-flight payment attempt is pinned to provider; failover is strictly blocked', () => {
    const testOrderId = 'ord-pin-test-001';
    PaymentRoutingService.recordPaymentAttempt({
      paymentAttemptId: 'att-001',
      orderId: testOrderId,
      provider: 'doku',
      status: PAYMENT_ATTEMPT_STATUS.PENDING
    });

    // Try resolving next available provider for this order
    const nextProv = PaymentRoutingService.resolveNextAvailableProvider({
      orderId: testOrderId,
      requiresEscrow: false
    });

    assert.strictEqual(nextProv.isPinned, true, 'Active attempt must be pinned');
    assert.strictEqual(nextProv.providerName, 'doku', 'Must remain pinned to DOKU');
  });

  test('3.2 Unknown outcome attempt blocks gateway failover', () => {
    const testOrderId = 'ord-unknown-test-002';
    PaymentRoutingService.recordPaymentAttempt({
      paymentAttemptId: 'att-002',
      orderId: testOrderId,
      provider: 'doku',
      status: PAYMENT_ATTEMPT_STATUS.UNKNOWN
    });

    const nextProv = PaymentRoutingService.resolveNextAvailableProvider({
      orderId: testOrderId,
      requiresEscrow: false
    });

    assert.strictEqual(nextProv.isPinned, true, 'Unknown state must pin provider to prevent double charge');
    assert.strictEqual(nextProv.providerName, 'doku');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 4: Circuit Breaker & Ops Kill-Switch Failover
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 4: Circuit Breaker & Kill-Switch Progression ──');

  test('4.1 Default healthy state routes to DOKU (Tier 1A)', () => {
    PaymentRoutingService.setKillSwitch('doku', false);
    PaymentRoutingService.setKillSwitch('ipaymu', false);
    PaymentRoutingService.setKillSwitch('midtrans', false);
    PaymentRoutingService.setKillSwitch('xendit', false);

    const prov = PaymentRoutingService.resolveNextAvailableProvider({ requiresEscrow: false });
    assert.strictEqual(prov.providerName, 'doku');
  });

  test('4.2 Disabling DOKU kill-switch fails over to iPaymu (Tier 1B)', () => {
    PaymentRoutingService.setKillSwitch('doku', true);
    try {
      const prov = PaymentRoutingService.resolveNextAvailableProvider({ requiresEscrow: false });
      assert.strictEqual(prov.providerName, 'ipaymu');
    } finally {
      PaymentRoutingService.setKillSwitch('doku', false);
    }
  });

  test('4.3 Disabling DOKU + iPaymu fails over to Midtrans (Tier 2A)', () => {
    PaymentRoutingService.setKillSwitch('doku', true);
    PaymentRoutingService.setKillSwitch('ipaymu', true);
    try {
      const prov = PaymentRoutingService.resolveNextAvailableProvider({ requiresEscrow: false });
      assert.strictEqual(prov.providerName, 'midtrans');
    } finally {
      PaymentRoutingService.setKillSwitch('doku', false);
      PaymentRoutingService.setKillSwitch('ipaymu', false);
    }
  });

  test('4.4 Disabling DOKU + iPaymu + Midtrans fails over to Xendit (Tier 2B)', () => {
    PaymentRoutingService.setKillSwitch('doku', true);
    PaymentRoutingService.setKillSwitch('ipaymu', true);
    PaymentRoutingService.setKillSwitch('midtrans', true);
    try {
      const prov = PaymentRoutingService.resolveNextAvailableProvider({ requiresEscrow: false });
      assert.strictEqual(prov.providerName, 'xendit');
    } finally {
      PaymentRoutingService.setKillSwitch('doku', false);
      PaymentRoutingService.setKillSwitch('ipaymu', false);
      PaymentRoutingService.setKillSwitch('midtrans', false);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Section 5: Double-Entry Ledger Solvency
  // ─────────────────────────────────────────────────────────────
  console.log('\n── Section 5: Double-Entry Ledger Solvency ──');

  await testAsync('5.1 Double-entry financial transactions balance mathematically: sum(debit) === sum(credit)', async () => {
    const tx = await FinancialLedger.recordTransaction({
      eventType: 'CAPTURE',
      orderId: 'ord-orch-001',
      description: 'Payment capture escrow funding',
      entries: [
        {
          account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING,
          type: 'DEBIT',
          amount: 500000
        },
        {
          account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING,
          type: 'CREDIT',
          amount: 475000
        },
        {
          account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE,
          type: 'CREDIT',
          amount: 25000
        }
      ]
    });

    assert.ok(tx);
    const solvency = FinancialLedger.assertSolvency();
    assert.strictEqual(solvency.solvent, true, 'Ledger must be solvent');
    assert.strictEqual(solvency.grandDebits, solvency.grandCredits, 'Debits must equal credits');
  });

  console.log(`\n================================================================`);
  console.log(`  ALL ${passed}/${total} 4-PROVIDER ORCHESTRATION TESTS PASSED!`);
  console.log(`================================================================\n`);
}

runOrchestrationSuite().catch(err => {
  console.error('4-Provider Orchestration Suite Failed:', err);
  process.exit(1);
});
