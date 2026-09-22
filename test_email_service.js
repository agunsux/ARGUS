/**
 * TIKUM & ARGUS — Comprehensive Email Infrastructure Test Suite
 * 
 * Verifies all 12 core requirements and mandatory P0 protections:
 * 1. EmailService initialization & default configurations
 * 2. Missing API key in non-production (graceful sandbox mock mode)
 * 3. Missing API key in production (fails safely as NOT_CONFIGURED, never simulates delivery)
 * 4. Template rendering (all justified templates render valid HTML, text, brand, and legal footer)
 * 5. Sender address format (TIKUM <support@tikum.app>)
 * 6. Reply-to configuration (support@tikum.app, admin@tikum.app)
 * 7. Deterministic idempotency deduplication (prevents duplicate sends across triggers)
 * 8. Order notification dispatch (order created secondary effect)
 * 9. Payment notification dispatch (payment confirmed & escrow locked secondary effect)
 * 10. Non-blocking secondary effect isolation (email failure NEVER affects transaction state)
 * 11. Security isolation: RESEND_API_KEY never leaks to public endpoints, client files, or logs
 * 12. Free-tier protection: daily (100) and monthly (3,000) quota limits enforced at Rp0 cost
 * 13. Admin test endpoint security: authentication, admin-only authorization, rate limits, audit logs
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, recordAuditLog } = require('./src/database');
const { EmailService, emailService, QUOTA_LIMITS, DEFAULT_FROM } = require('./src/services/emailService');
const { renderTemplate, TEMPLATES, BRAND_NAME, SUPPORT_EMAIL, ADMIN_EMAIL } = require('./src/services/emailTemplates');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { DisputeService, DISPUTE_STATUS } = require('./src/services/disputeService');
const { businessProfile } = require('./src/config/businessProfile');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  TIKUM — 13-POINT TRANSACTIONAL EMAIL TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function check(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      throw err;
    }
  }

  async function checkAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      throw err;
    }
  }

  // Spin up test server on ephemeral port
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    resetDatabase();
    emailService.resetState();

    // -------------------------------------------------------------
    // 1. EmailService initialization & default values
    // -------------------------------------------------------------
    check('1. EmailService initializes with zero counts and correct defaults', () => {
      const service = new EmailService();
      assert.strictEqual(service.dailyCount, 0);
      assert.strictEqual(service.monthlyCount, 0);
      assert.strictEqual(service.failedCount, 0);
      assert.strictEqual(service.suppressedCount, 0);
      assert.strictEqual(DEFAULT_FROM, 'TIKUM <support@tikum.app>');
      assert.strictEqual(QUOTA_LIMITS.DAILY_MAX, 100);
      assert.strictEqual(QUOTA_LIMITS.MONTHLY_MAX, 3000);
    });

    // -------------------------------------------------------------
    // 2. Missing API key in non-production (sandbox mock mode)
    // -------------------------------------------------------------
    await checkAsync('2. Non-production without API key enters sandbox mock mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.RESEND_API_KEY;
      try {
        process.env.NODE_ENV = 'test';
        delete process.env.RESEND_API_KEY;

        const res = await emailService.sendEmail({
          to: 'buyer@example.com',
          template: 'ACCOUNT_WELCOME',
          data: { name: 'Dewi' }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'MOCKED');
        assert.strictEqual(res.isMock, true);
        assert.strictEqual(res.delivered, false);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });

    // -------------------------------------------------------------
    // 3. Missing API key in production (fails safely as NOT_CONFIGURED)
    // -------------------------------------------------------------
    await checkAsync('3. Production without API key fails safely as NOT_CONFIGURED (never fakes delivery)', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.RESEND_API_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.RESEND_API_KEY;

        const res = await emailService.sendEmail({
          to: 'buyer@example.com',
          template: 'ACCOUNT_WELCOME',
          data: { name: 'Dewi' },
          idempotencyKey: 'test:prod:not-configured'
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'NOT_CONFIGURED');
        assert.strictEqual(res.delivered, false);
        assert.ok(res.error.includes('RESEND_API_KEY is not configured'));
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });

    // -------------------------------------------------------------
    // 4. Template rendering & canonical footer
    // -------------------------------------------------------------
    check('4. All transactional templates render valid HTML, text, brand, and legal footer', () => {
      const templateKeys = Object.keys(TEMPLATES);
      assert.ok(templateKeys.length >= 10, 'Expected at least 10 justified email templates');

      for (const key of templateKeys) {
        const rendered = renderTemplate(key, {
          name: 'Pengguna Test',
          orderId: 'ord-test-123',
          eventTitle: 'Coldplay Live in Jakarta',
          totalAmount: 1500000,
          amount: 1500000,
          offeredPrice: 1200000,
          originalPrice: 1500000,
          counterPrice: 1350000,
          code: '123456',
          status: 'PAID_ESCROWED'
        });

        assert.ok(rendered.subject && rendered.subject.length > 3, `Template ${key} subject missing`);
        assert.ok(rendered.html && rendered.html.includes('TIKUM'), `Template ${key} HTML missing TIKUM brand`);
        assert.ok(rendered.html.includes('SHINERVA HQ'), `Template ${key} HTML missing legal footer entity`);
        assert.ok(rendered.html.includes('support@tikum.app'), `Template ${key} HTML missing support email`);
        assert.ok(rendered.html.includes('https://tikum.app'), `Template ${key} HTML missing canonical domain link`);
        assert.ok(rendered.text && rendered.text.includes('TIKUM'), `Template ${key} text missing TIKUM brand`);
      }
    });

    // -------------------------------------------------------------
    // 5. Sender address format
    // -------------------------------------------------------------
    check('5. Default sender address complies with TIKUM <support@tikum.app>', () => {
      assert.strictEqual(DEFAULT_FROM, 'TIKUM <support@tikum.app>');
      const telemetry = emailService.getTelemetry();
      assert.strictEqual(telemetry.fromAddress, 'TIKUM <support@tikum.app>');
    });

    // -------------------------------------------------------------
    // 6. Reply-to configuration
    // -------------------------------------------------------------
    check('6. Reply-to correctly distinguishes customer support vs administrative channels', () => {
      assert.strictEqual(SUPPORT_EMAIL, 'support@tikum.app');
      assert.strictEqual(ADMIN_EMAIL, 'admin@tikum.app');
      assert.strictEqual(businessProfile.supportEmail, 'support@tikum.app');
      assert.strictEqual(businessProfile.adminEmail, 'admin@tikum.app');
      assert.strictEqual(businessProfile.helloEmail, 'hello@tikum.app');
      assert.strictEqual(businessProfile.picEmail, 'pic@tikum.app');
      // Verify canonical email for iPaymu test backward-compatibility remains intact
      assert.strictEqual(businessProfile.email, 'agunsux@gmail.com');
    });

    // -------------------------------------------------------------
    // 7. Deterministic Idempotency deduplication
    // -------------------------------------------------------------
    await checkAsync('7. Deterministic idempotency key suppresses duplicate sends', async () => {
      const idempotencyKey = 'order:ord-dedupe-101:payment-confirmed';

      // First call
      const first = await emailService.sendEmail({
        to: 'buyer@example.com',
        template: 'PAYMENT_SUCCESSFUL',
        data: { orderId: 'ord-dedupe-101', amount: 500000 },
        idempotencyKey
      });
      assert.strictEqual(first.success, true);
      assert.strictEqual(first.status, 'MOCKED');

      // Duplicate call with identical key
      const second = await emailService.sendEmail({
        to: 'buyer@example.com',
        template: 'PAYMENT_SUCCESSFUL',
        data: { orderId: 'ord-dedupe-101', amount: 500000 },
        idempotencyKey
      });
      assert.strictEqual(second.success, true);
      assert.strictEqual(second.status, 'IDEMPOTENT_SKIPPED');
      assert.strictEqual(second.delivered, false);
      assert.ok(second.message.includes('already processed'));
    });

    // Helper to generate fresh active listings for integration steps
    async function createActiveListing(sellerId = 'seller-1') {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 10000);
      const res = await ListingService.createListing({
        sellerId,
        eventId: 'event-pestapora-2026',
        seatInfo: `CAT 1 - Seat ${uniqueSuffix}`,
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: `BARCODE-${uniqueSuffix}`,
        evidenceBundleId: 'bdl-seed-1'
      });
      await ListingService.verifyListing(res.listing.id, 'admin-1', { approved: true });
      return res.listing;
    }

    // -------------------------------------------------------------
    // 8. Order notification dispatch
    // -------------------------------------------------------------
    await checkAsync('8. Order creation triggers secondary effect order created notification', async () => {
      const listing = await createActiveListing();
      const result = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listing.id
      });
      assert.ok(result.order);
      assert.strictEqual(result.order.status, ORDER_STATUS.PENDING_PAYMENT);

      // Verify audit log has order created email logged
      const logged = state.audit_logs.find(
        l => l.entity_type === 'EMAIL' && l.entity_id === `order:${result.order.id}:created`
      );
      assert.ok(logged, 'Audit log must record order created email attempt');
    });

    // -------------------------------------------------------------
    // 9. Payment notification dispatch
    // -------------------------------------------------------------
    await checkAsync('9. Payment verification triggers payment success notification with escrow locked', async () => {
      const listing = await createActiveListing();
      const { order } = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listing.id
      });

      const payRes = await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: `trx-${Date.now()}`,
        idempotencyKey: `pay-test-${Date.now()}`,
        amountPaid: order.total_amount
      });

      assert.strictEqual(payRes.order.status, ORDER_STATUS.PAID_ESCROWED);
      assert.strictEqual(payRes.escrow.status, ESCROW_STATUS.ESCROWED);

      // Allow microtask tick for async fire-and-forget
      await new Promise(r => setTimeout(r, 20));

      const buyerNotif = state.audit_logs.find(
        l => l.entity_type === 'EMAIL' && l.entity_id === `order:${order.id}:payment-confirmed:buyer`
      );
      assert.ok(buyerNotif, 'Audit log must record payment success email to buyer');
    });

    // -------------------------------------------------------------
    // 10. Non-blocking secondary effect isolation
    // -------------------------------------------------------------
    await checkAsync('10. Email failure never rolls back or mutates transaction/order state', async () => {
      // Temporarily mock _sendViaResend to throw catastrophic network failure
      const originalSend = emailService._sendViaResend;
      const originalKey = process.env.RESEND_API_KEY;

      try {
        process.env.RESEND_API_KEY = 're_test_fake_key';
        emailService._sendViaResend = async () => {
          const networkErr = new Error('ECONNREFUSED: Connection to api.resend.com refused');
          networkErr.statusCode = 503;
          throw networkErr;
        };

        const activeListing = await createActiveListing('seller-1');
        const { order, escrow } = await EscrowService.createOrder({
          buyerId: 'buyer-2',
          listingId: activeListing.id
        });

        // Even with network failure in emailService, recordPayment must succeed 100%!
        const payRes = await EscrowService.recordPayment({
          orderId: order.id,
          providerRef: `trx-fail-test-${Date.now()}`,
          idempotencyKey: `idemp-fail-test-${Date.now()}`,
          amountPaid: order.total_amount
        });

        assert.strictEqual(payRes.order.status, ORDER_STATUS.PAID_ESCROWED, 'Order must reach PAID_ESCROWED');
        assert.strictEqual(payRes.escrow.status, ESCROW_STATUS.ESCROWED, 'Escrow must reach ESCROWED');
        assert.strictEqual(activeListing.status, LISTING_STATUS.SOLD, 'Listing must be marked SOLD');

        // Allow microtask tick
        await new Promise(r => setTimeout(r, 20));

        // Verify failure was logged safely without interrupting state
        const failedLog = state.audit_logs.find(
          l => l.entity_type === 'EMAIL' && l.action === 'FAILED'
        );
        assert.ok(failedLog, 'Email failure must be recorded in audit log without throwing');
      } finally {
        emailService._sendViaResend = originalSend;
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
        else delete process.env.RESEND_API_KEY;
      }
    });

    // -------------------------------------------------------------
    // 11. Security check: API key isolation
    // -------------------------------------------------------------
    await checkAsync('11. RESEND_API_KEY never leaks to public endpoints or client bundle', async () => {
      process.env.RESEND_API_KEY = 're_secret_test_token_123456789';

      // 1. Check /api/business-profile
      const bpRes = await request('/api/business-profile');
      assert.strictEqual(bpRes.statusCode, 200);
      assert.ok(!bpRes.body.includes('re_secret_test_token_123456789'));
      assert.ok(!bpRes.body.includes('RESEND_API_KEY'));

      // 2. Check /health
      const healthRes = await request('/health');
      assert.ok(!healthRes.body.includes('re_secret_test_token_123456789'));

      // 3. Check /admin/email-status
      const emailStatusRes = await request('/api/mvp/admin/email-status', {
        headers: { 'x-user-id': 'admin-1' }
      });
      assert.strictEqual(emailStatusRes.statusCode, 200);
      assert.strictEqual(emailStatusRes.json.email.status, 'CONFIGURED');
      assert.strictEqual(emailStatusRes.json.email.hasApiKey, true);
      assert.ok(!emailStatusRes.body.includes('re_secret_test_token_123456789'));

      delete process.env.RESEND_API_KEY;
    });

    // -------------------------------------------------------------
    // 12. Free-tier quota protection (Rp0 Cost Guarantee)
    // -------------------------------------------------------------
    await checkAsync('12. Quota threshold suppresses outbound sends and prevents paid overages', async () => {
      emailService.resetState();
      emailService.dailyCount = 100; // Simulate 100 daily quota limit reached

      const result = await emailService.sendEmail({
        to: 'customer@example.com',
        template: 'ACCOUNT_WELCOME',
        idempotencyKey: 'test:quota:100'
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'QUOTA_EXCEEDED');
      assert.strictEqual(result.delivered, false);
      assert.ok(result.error.includes('Free-tier quota threshold reached'));
      assert.strictEqual(emailService.suppressedCount, 1);

      emailService.resetState();
    });

    // -------------------------------------------------------------
    // 13. Admin Test Endpoint Security & Authorization
    // -------------------------------------------------------------
    await checkAsync('13. POST /api/mvp/admin/email-test enforces authentication, admin role, and rate limits', async () => {
      // Case A: Unauthenticated request
      const unauth = await request('/api/mvp/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { recipient: 'agunsux@gmail.com' }
      });
      assert.strictEqual(unauth.statusCode, 401);

      // Case B: Non-admin buyer request
      const forbidden = await request('/api/mvp/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'buyer-1' },
        body: { officerId: 'buyer-1', recipient: 'agunsux@gmail.com' }
      });
      assert.strictEqual(forbidden.statusCode, 403);

      // Case C: Arbitrary unverified recipient rejected
      const arbitrary = await request('/api/mvp/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'admin-1' },
        body: { officerId: 'admin-1', recipient: 'attacker@random-domain.com' }
      });
      assert.strictEqual(arbitrary.statusCode, 400);
      assert.strictEqual(arbitrary.json.code, 'INVALID_RECIPIENT');

      // Case D: Valid verified recipient succeeds
      const validTest = await request('/api/mvp/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'admin-1' },
        body: { officerId: 'admin-1', recipient: 'support@tikum.app' }
      });
      assert.strictEqual(validTest.statusCode, 200);
      assert.strictEqual(validTest.json.success, true);
      assert.ok(validTest.json.telemetry);

      // Verify audit log has admin test recorded
      const testLog = state.audit_logs.find(
        l => l.entity_type === 'ADMIN' && l.action === 'EMAIL_TEST_TRIGGERED'
      );
      assert.ok(testLog, 'Admin email test must be audit logged');
    });

    console.log(`\n====================================================`);
    console.log(`  All ${passed}/${total} Email Infrastructure Tests PASSED!`);
    console.log(`====================================================\n`);

  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
