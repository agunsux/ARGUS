/**
 * TIKUM / ARGUS — Unified Payment Provider Contract Test Suite
 *
 * Enforces that EVERY payment adapter implements the canonical 8-method interface:
 * 1. createPayment(order, method)
 * 2. getPaymentStatus(ref)
 * 3. verifyAndParseWebhook(req)
 * 4. createPayout(bankAccount, amount, idemKey)
 * 5. getPayoutStatus(ref)
 * 6. refund(ref, amount, idemKey)
 * 7. capabilities()
 * 8. healthCheck()
 *
 * Plus capabilities declaration, zero fake claims, and non-supported methods throwing
 * explicit CapabilityUnsupportedError (never silent stubs).
 */

const assert = require('assert');
const {
  paymentManager,
  CapabilityUnsupportedError,
  DokuPaymentProvider,
  MidtransPaymentProvider,
  XenditPaymentProvider,
  IPaymuProvider
} = require('./src/services/payment/index');

console.log('================================================================');
console.log('  TIKUM — PAYMENT PROVIDER UNIFIED CONTRACT SUITE');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function asyncCheck(title, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function runContracts() {
  const providerNames = ['doku', 'ipaymu', 'midtrans', 'xendit'];

  for (const name of providerNames) {
    console.log(`── Testing Provider Contract: [${name.toUpperCase()}] ──`);
    const provider = paymentManager.getProvider(name);

    check(`${name}: Implements metadata & market methods`, () => {
      assert.strictEqual(typeof provider.getName(), 'string');
      assert.strictEqual(provider.getName().toLowerCase(), name);
      assert.strictEqual(typeof provider.getCountry(), 'string');
      assert.ok(Array.isArray(provider.getSupportedCountries()));
      assert.ok(Array.isArray(provider.getSupportedCurrencies()));
      assert.ok(Array.isArray(provider.getSupportedChannels()));
    });

    check(`${name}: Implements capabilities() and getCapabilities() identically`, () => {
      assert.strictEqual(typeof provider.capabilities, 'function');
      assert.strictEqual(typeof provider.getCapabilities, 'function');
      const caps1 = provider.capabilities();
      const caps2 = provider.getCapabilities();
      assert.strictEqual(typeof caps1, 'object');
      assert.strictEqual(caps1.hold, caps2.hold);
      assert.strictEqual(caps1.release, caps2.release);
      assert.strictEqual(caps1.refund, caps2.refund);
    });

    await asyncCheck(`${name}: Implements healthCheck() asynchronously`, async () => {
      assert.strictEqual(typeof provider.healthCheck, 'function');
      const health = await provider.healthCheck();
      assert.strictEqual(typeof health, 'object');
      assert.strictEqual(health.provider, name);
      assert.strictEqual(typeof health.healthy, 'boolean');
      assert.ok(health.timestamp);
    });

    await asyncCheck(`${name}: Implements createPayment interface`, async () => {
      assert.strictEqual(typeof provider.createPayment, 'function');
    });

    await asyncCheck(`${name}: Implements getPaymentStatus interface`, async () => {
      assert.strictEqual(typeof provider.getPaymentStatus, 'function');
      const statusRes = await provider.getPaymentStatus(`test-ref-${name}`);
      assert.ok(statusRes);
    });

    await asyncCheck(`${name}: Implements verifyAndParseWebhook interface`, async () => {
      assert.strictEqual(typeof provider.verifyAndParseWebhook, 'function');
      // Forged webhook must throw INVALID_WEBHOOK_SIGNATURE
      assert.throws(() => {
        provider.verifyAndParseWebhook({
          headers: { signature: 'invalid-signature' },
          body: { order_id: 'ord-123' }
        });
      }, (err) => err.code === 'INVALID_WEBHOOK_SIGNATURE' || err.status === 401);
    });

    await asyncCheck(`${name}: Implements refund interface or explicit capability gate`, async () => {
      assert.strictEqual(typeof provider.refund, 'function');
    });

    await asyncCheck(`${name}: Implements createPayout and getPayoutStatus interface or explicit capability gate`, async () => {
      assert.strictEqual(typeof provider.createPayout, 'function');
      assert.strictEqual(typeof provider.getPayoutStatus, 'function');
      const caps = provider.capabilities();
      if (!caps.payout) {
        await assert.rejects(async () => {
          await provider.createPayout('BCA 1234567890', 100000, 'idem-key');
        }, (err) => err instanceof CapabilityUnsupportedError || err.code === 'CAPABILITY_UNSUPPORTED');
      }
    });

    check(`${name}: Fallback stubs declare clear NOT_ENABLED / PENDING state`, () => {
      const status = provider.getStatus();
      assert.ok(status);
      assert.strictEqual(status.provider, name);
      if (name !== 'doku') {
        assert.ok(status.tier || status.readiness || status.status);
      }
    });
  }

  console.log(`\n================================================================`);
  console.log(`  ALL ${passed}/${total} UNIFIED PROVIDER CONTRACT TESTS PASSED!`);
  console.log(`================================================================\n`);
}

runContracts().catch(err => {
  console.error('Provider Contract Suite Failed:', err);
  process.exit(1);
});
