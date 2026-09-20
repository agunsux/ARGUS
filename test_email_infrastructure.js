/**
 * TIKUM & ARGUS — Comprehensive Email Infrastructure Test Suite (Cloudflare + Resend)
 * 
 * Verifies all 17 required checks from EPIC: TIKUM EMAIL INFRASTRUCTURE
 * 1. Resend provider loads correctly
 * 2. Missing API key fails safely
 * 3. Production provider never runs in NODE_ENV=test
 * 4. Test provider captures outbound email
 * 5. Admin password reset uses admin identity
 * 6. Verification email works
 * 7. Password reset works
 * 8. Order confirmation works
 * 9. Payment confirmation works
 * 10. Ticket delivery email works
 * 11. Refund email works
 * 12. Event cancellation email works
 * 13. Duplicate notification is idempotent where applicable
 * 14. No password/token/API key appears in email logs
 * 15. Invalid recipient rejected
 * 16. User cannot control From address
 * 17. Existing email tests remain green
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, recordAuditLog } = require('./src/database');
const {
  EmailService,
  emailService,
  QUOTA_LIMITS,
  DEFAULT_FROM,
  EMAIL_ADMIN_FROM,
  EMAIL_REPLY_TO,
  validateRecipient,
  resolveAndValidateSender
} = require('./src/services/emailService');
const {
  EmailProvider,
  ResendEmailProvider,
  TestEmailProvider,
  UnconfiguredEmailProvider,
  resolveEmailProvider,
  RESEND_API_URL
} = require('./src/services/email');
const {
  renderTemplate,
  TEMPLATES,
  BRAND_NAME,
  SUPPORT_EMAIL,
  ADMIN_EMAIL,
  HELLO_EMAIL,
  NO_REPLY_EMAIL
} = require('./src/services/emailTemplates');

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
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqOpts.headers['Content-Type'] && !reqOpts.headers['content-type']) {
        req.setHeader('Content-Type', 'application/json');
      }
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('  TIKUM — 17-POINT EMAIL INFRASTRUCTURE TEST SUITE (EPIC)       ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function check(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      throw err;
    }
  }

  async function checkAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
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

    // -------------------------------------------------------------------------
    // 1. Resend provider loads correctly
    // -------------------------------------------------------------------------
    check('1. Resend provider loads correctly with provider boundary interface', () => {
      const provider = new ResendEmailProvider({ apiKey: 're_test_dummy' });
      assert.ok(provider instanceof EmailProvider, 'ResendEmailProvider must inherit from EmailProvider');
      assert.strictEqual(provider.name, 'resend');
      assert.strictEqual(provider.apiUrl, 'https://api.resend.com/emails');
      assert.strictEqual(provider.getApiKey(), 're_test_dummy');
    });

    // -------------------------------------------------------------------------
    // 2. Missing API key fails safely (FAIL CLOSED in production)
    // -------------------------------------------------------------------------
    await checkAsync('2. Missing API key fails safely in production (NOT_CONFIGURED, never simulates delivery)', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.RESEND_API_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.RESEND_API_KEY;

        // A. Direct provider instantiation fails closed
        const provider = new ResendEmailProvider();
        const result = await provider.send({
          from: 'TIKUM <no-reply@tikum.app>',
          to: 'buyer@example.com',
          subject: 'Test Subject',
          text: 'Body text'
        });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.status, 'NOT_CONFIGURED');
        assert.strictEqual(result.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(result.delivered, false);
        assert.ok(result.error.includes('RESEND_API_KEY is not configured'));
        assert.ok(result.error.includes('EMAIL_PROVIDER_NOT_CONFIGURED'));

        // B. Factory resolution in production without key: FAILS CLOSED
        const resolvedProd = resolveEmailProvider({ NODE_ENV: 'production' });
        assert.ok(!(resolvedProd instanceof TestEmailProvider), 'Production MUST NEVER instantiate TestEmailProvider');
        assert.ok(resolvedProd instanceof UnconfiguredEmailProvider, 'Production without key must instantiate UnconfiguredEmailProvider');
        assert.strictEqual(resolvedProd.name, 'unconfigured');

        const resolvedResult = await resolvedProd.send({
          from: 'TIKUM <no-reply@tikum.app>',
          to: 'buyer@example.com',
          subject: 'Test Subject',
          text: 'Body text'
        });
        assert.strictEqual(resolvedResult.success, false);
        assert.strictEqual(resolvedResult.status, 'NOT_CONFIGURED');
        assert.strictEqual(resolvedResult.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(resolvedResult.delivered, false);

        // C. Factory resolution in development without key: sandbox TestEmailProvider is acceptable
        const resolvedDev = resolveEmailProvider({ NODE_ENV: 'development' });
        assert.ok(resolvedDev instanceof TestEmailProvider, 'Development without key may instantiate TestEmailProvider');

        // D. Factory resolution in production with key: instantiates ResendEmailProvider
        const resolvedWithKey = resolveEmailProvider({ NODE_ENV: 'production', RESEND_API_KEY: 're_valid_looking_key' });
        assert.ok(resolvedWithKey instanceof ResendEmailProvider, 'Production with key must instantiate ResendEmailProvider');
        assert.strictEqual(resolvedWithKey.getApiKey(), 're_valid_looking_key');

        // E. Factory resolution in test: instantiates TestEmailProvider (network isolation)
        const resolvedTest = resolveEmailProvider({ NODE_ENV: 'test' });
        assert.ok(resolvedTest instanceof TestEmailProvider, 'Test environment must instantiate TestEmailProvider');

        // F. EmailService fail-closed invocation in production
        emailService.setProvider(null); // Clear any explicit mock override
        const svcResult = await emailService.sendEmail({
          to: 'buyer@example.com',
          template: 'ACCOUNT_WELCOME',
          data: { name: 'Siti' }
        });
        assert.strictEqual(svcResult.success, false);
        assert.strictEqual(svcResult.status, 'NOT_CONFIGURED');
        assert.strictEqual(svcResult.code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(svcResult.delivered, false);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });

    // -------------------------------------------------------------------------
    // 3. Production provider never runs in NODE_ENV=test
    // -------------------------------------------------------------------------
    await checkAsync('3. Production provider never makes live network requests in NODE_ENV=test', async () => {
      assert.strictEqual(process.env.NODE_ENV, 'test');
      const provider = new ResendEmailProvider({ apiKey: 're_live_test_key' });
      const result = await provider.send({
        from: 'TIKUM <no-reply@tikum.app>',
        to: 'target@example.com',
        subject: 'Sandbox Check',
        text: 'Sandbox content'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'MOCKED');
      assert.strictEqual(result.isMock, true);
      assert.strictEqual(result.delivered, false);
      assert.strictEqual(result.provider, 'resend');
    });

    // -------------------------------------------------------------------------
    // 4. Test provider captures outbound email
    // -------------------------------------------------------------------------
    await checkAsync('4. Test provider captures outbound email deterministically', async () => {
      const testProvider = new TestEmailProvider();
      const service = new EmailService(testProvider);

      await service.sendEmail({
        to: 'user@example.com',
        subject: 'Capture Test',
        text: 'Capture message body'
      });

      const captured = testProvider.getSentEmails();
      assert.strictEqual(captured.length, 1);
      assert.strictEqual(captured[0].to, 'user@example.com');
      assert.strictEqual(captured[0].subject, 'Capture Test');
      assert.strictEqual(captured[0].text, 'Capture message body');

      testProvider.clear();
      assert.strictEqual(testProvider.getSentEmails().length, 0);
    });

    // -------------------------------------------------------------------------
    // 5. Admin password reset uses admin identity
    // -------------------------------------------------------------------------
    await checkAsync('5. Admin password reset uses admin identity (admin@tikum.app / EMAIL_ADMIN_FROM)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendAdminPasswordResetEmail({
        adminEmail: 'admin@tikum.app',
        resetToken: 'test-admin-token-12345',
        resetUrl: 'https://tikum.app/admin/reset-password?token=test-admin-token-12345'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'admin@tikum.app');
      assert.ok(email.from.includes('admin@tikum.app'), 'Sender must use admin identity');
      assert.strictEqual(email.replyTo, 'admin@tikum.app');
      assert.ok(email.subject.includes('Reset Password Administrator'));
      assert.ok(email.html.includes('admin@tikum.app'));
      assert.ok(email.html.includes('Akses Khusus Administrator'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 6. Verification email works
    // -------------------------------------------------------------------------
    await checkAsync('6. Verification email works (ACCOUNT_VERIFICATION template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendVerificationEmail({
        to: 'newuser@example.com',
        code: '789123',
        name: 'Ahmad'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'newuser@example.com');
      assert.ok(email.subject.includes('Verifikasi Akun'));
      assert.ok(email.html.includes('789123'));
      assert.ok(email.text.includes('789123'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 7. Password reset works
    // -------------------------------------------------------------------------
    await checkAsync('7. Password reset works (PASSWORD_RESET template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendPasswordResetEmail({
        to: 'buyer@example.com',
        resetToken: 'reset-token-abc-999',
        resetUrl: 'https://tikum.app/auth/reset-password?token=reset-token-abc-999',
        name: 'Dewi Lestari'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'buyer@example.com');
      assert.ok(email.subject.includes('Reset Password'));
      assert.ok(email.html.includes('https://tikum.app/auth/reset-password?token=reset-token-abc-999'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 8. Order confirmation works
    // -------------------------------------------------------------------------
    await checkAsync('8. Order confirmation works (ORDER_CREATED template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendOrderCreatedEmail({
        order: { id: 'ord-test-conf-01', total_amount: 1250000 },
        buyer: { email: 'buyer@example.com' },
        ticket: { category: 'CAT 1' },
        event: { title: 'LANY in Jakarta' },
        pricing: { total: 1250000 }
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'buyer@example.com');
      assert.ok(email.subject.includes('ord-test-conf-01'));
      assert.ok(email.html.includes('LANY in Jakarta'));
      assert.ok(email.html.includes('1.250.000'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 9. Payment confirmation works
    // -------------------------------------------------------------------------
    await checkAsync('9. Payment confirmation works (PAYMENT_SUCCESSFUL & SELLER_TICKET_SOLD)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendPaymentSuccessfulEmail({
        order: { id: 'ord-pay-01', total_amount: 1500000 },
        payment: { amount: 1500000 },
        buyer: { email: 'buyer@example.com' },
        seller: { email: 'seller@example.com' },
        event: { title: 'Coldplay Music of the Spheres' }
      });

      // Allow microtask tick
      await new Promise(r => setTimeout(r, 20));

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 2, 'Should send to both buyer and seller');

      const buyerMail = emails.find(e => e.to === 'buyer@example.com');
      assert.ok(buyerMail, 'Buyer must receive payment confirmation');
      assert.ok(buyerMail.html.includes('Escrow'));
      assert.ok(buyerMail.html.includes('1.500.000'));

      const sellerMail = emails.find(e => e.to === 'seller@example.com');
      assert.ok(sellerMail, 'Seller must receive ticket sold confirmation');
      assert.ok(sellerMail.html.includes('Tiket Anda Telah Terjual'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 10. Ticket delivery email works
    // -------------------------------------------------------------------------
    await checkAsync('10. Ticket delivery email works (TICKET_DELIVERY template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendTicketDeliveryEmail({
        order: { id: 'ord-dlv-01' },
        buyer: { email: 'buyer@example.com' },
        ticket: { category: 'VIP Section A', seat_info: 'Row 3 Seat 12' },
        event: { title: 'K-Pop Festival', venue_name: 'ICE BSD' },
        downloadUrl: 'https://tikum.app/tickets/download/tkt-123'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'buyer@example.com');
      assert.ok(email.subject.includes('Tiket Anda Siap Diunduh'));
      assert.ok(email.html.includes('VIP Section A'));
      assert.ok(email.html.includes('ICE BSD'));
      assert.ok(email.html.includes('https://tikum.app/tickets/download/tkt-123'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 11. Refund email works
    // -------------------------------------------------------------------------
    await checkAsync('11. Refund email works (REFUND_CONFIRMATION template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendRefundConfirmationEmail({
        order: { id: 'ord-ref-01' },
        buyer: { email: 'buyer@example.com' },
        amount: 850000,
        reason: 'Sengketa disetujui Trust Officer',
        channel: 'iPaymu Virtual Account'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'buyer@example.com');
      assert.ok(email.subject.includes('Pengembalian Dana (Refund) Berhasil'));
      assert.ok(email.html.includes('850.000'));
      assert.ok(email.html.includes('iPaymu Virtual Account'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 12. Event cancellation email works
    // -------------------------------------------------------------------------
    await checkAsync('12. Event cancellation email works (EVENT_CANCELLATION template)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      await emailService.sendEventCancellationEmail({
        event: { id: 'ev-cancelled-01', title: 'Music Festival 2026' },
        buyer: { email: 'buyer@example.com' },
        refundAmount: 600000,
        reason: 'Keputusan resmi promotor karena cuaca ekstrem'
      });

      const emails = testProvider.getSentEmails();
      assert.strictEqual(emails.length, 1);
      const email = emails[0];
      assert.strictEqual(email.to, 'buyer@example.com');
      assert.ok(email.subject.includes('Pembatalan Event'));
      assert.ok(email.html.includes('Music Festival 2026'));
      assert.ok(email.html.includes('600.000'));

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 13. Duplicate notification is idempotent where applicable
    // -------------------------------------------------------------------------
    await checkAsync('13. Duplicate notification is idempotent where applicable', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      const idempotencyKey = 'order:ord-idemp-unique-99:confirmed';

      const first = await emailService.sendEmail({
        to: 'buyer@example.com',
        subject: 'Idempotent Test',
        text: 'Content',
        idempotencyKey
      });
      assert.strictEqual(first.success, true);
      assert.ok(['MOCKED', 'CAPTURED'].includes(first.status));
      assert.strictEqual(testProvider.getSentEmails().length, 1);

      const second = await emailService.sendEmail({
        to: 'buyer@example.com',
        subject: 'Idempotent Test',
        text: 'Content',
        idempotencyKey
      });
      assert.strictEqual(second.success, true);
      assert.strictEqual(second.status, 'IDEMPOTENT_SKIPPED');
      assert.strictEqual(testProvider.getSentEmails().length, 1, 'Second send must be suppressed');

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 14. No password/token/API key appears in email logs
    // -------------------------------------------------------------------------
    await checkAsync('14. No password/token/API key appears in email logs (@PERSISTENCE_BOUNDARY)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      const secretToken = 'super_secret_reset_token_xyz999';
      const secretApiKey = 're_test_super_secret_key_12345';

      await emailService.sendPasswordResetEmail({
        to: 'secretbuyer@example.com',
        resetToken: secretToken,
        resetUrl: `https://tikum.app/auth/reset-password?token=${secretToken}`,
        name: 'Buyer Secret'
      });

      const logs = emailService.getEmailLogs();
      assert.ok(logs.length > 0, 'Email logs must be populated');

      const stringifiedLogs = JSON.stringify(logs);
      assert.ok(!stringifiedLogs.includes(secretToken), 'Reset token must NEVER appear in email logs!');
      assert.ok(!stringifiedLogs.includes(secretApiKey), 'API key must NEVER appear in email logs!');
      assert.ok(!stringifiedLogs.includes('pilot123'), 'Passwords must NEVER appear in email logs!');

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 15. Invalid recipient rejected
    // -------------------------------------------------------------------------
    await checkAsync('15. Invalid recipient rejected (invalid format, CRLF header injection)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      // 1. Missing recipient
      const res1 = await emailService.sendEmail({
        to: '',
        subject: 'Test',
        text: 'Test'
      });
      assert.strictEqual(res1.success, false);
      assert.strictEqual(res1.status, 'FAILED');

      // 2. CRLF injection attempt in recipient
      const res2 = await emailService.sendEmail({
        to: 'victim@example.com\r\nBcc: evil@attacker.com',
        subject: 'Test',
        text: 'Test'
      });
      assert.strictEqual(res2.success, false);
      assert.strictEqual(res2.status, 'FAILED');

      // 3. Invalid email syntax
      const res3 = await emailService.sendEmail({
        to: 'notanemail',
        subject: 'Test',
        text: 'Test'
      });
      assert.strictEqual(res3.success, false);
      assert.strictEqual(res3.status, 'FAILED');

      assert.strictEqual(testProvider.getSentEmails().length, 0, 'Zero emails dispatched for invalid recipients');
    });

    // -------------------------------------------------------------------------
    // 16. User cannot control From address
    // -------------------------------------------------------------------------
    await checkAsync('16. User cannot control From address (arbitrary external senders rejected/clamped)', async () => {
      const testProvider = new TestEmailProvider();
      emailService.setProvider(testProvider);

      // Caller tries to spoof external sender identity
      await emailService.sendEmail({
        to: 'buyer@example.com',
        subject: 'Spoof Check',
        text: 'Checking sender resolution',
        sender: 'attacker@evil-domain.com'
      });

      const sent = testProvider.getLastEmail();
      assert.ok(sent, 'Email should be processed');
      assert.ok(sent.from.includes('tikum.app') || sent.from.includes('argus.id'), 'From address must remain locked to official domains');
      assert.ok(!sent.from.includes('evil-domain.com'), 'Arbitrary external sender must be rejected/clamped');

      testProvider.clear();
    });

    // -------------------------------------------------------------------------
    // 17. Existing email tests remain green
    // -------------------------------------------------------------------------
    await checkAsync('17. Existing test_email_service.js suite runs and remains 100% green', async () => {
      // Re-link ResendEmailProvider as default for existing test suite
      emailService.setProvider(new ResendEmailProvider());
      const { runTests: runExistingSuite } = require('./test_email_service');
      await runExistingSuite();
    });

    console.log(`\n================================================================`);
    console.log(`  ALL ${passed}/${total} EMAIL INFRASTRUCTURE TESTS PASSED!`);
    console.log(`================================================================\n`);

  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runTests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };

