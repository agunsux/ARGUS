/**
 * Test Suite: TIKUM EPIC P0.8 — Admin Self-Login Notification Suppression
 * 
 * Verifies all 12 scenarios in the Section 4 Required Test Matrix:
 * 1. admin@tikum.app logs in to Admin Panel -> No self-login email sent (status: SUPPRESSED)
 * 2. Another admin logs in -> Existing notification email sent to dual recipients
 * 3. Normal user signs in -> Email sent to dual recipients
 * 4. New user registers -> Email sent to dual recipients
 * 5. Seller submits KYC -> Email sent to dual recipients
 * 6. Buyer creates inquiry -> Email sent to dual recipients
 * 7. Buyer creates order -> Email sent to dual recipients
 * 8. Dispute is opened -> Email sent to dual recipients
 * 9. Fraud risk is detected -> Email sent to dual recipients
 * 10. Venue incident is created -> Email sent to dual recipients
 * 11. Admin performs other operational actions -> Existing notification behavior preserved
 * 12. Unauthenticated request -> Existing authentication protection preserved
 * 
 * Plus Invariants:
 * 13. Admin self-login remains recorded in the security/audit log.
 * 14. Email normalization handles whitespace, casing, and prevents subdomain attacks.
 * 15. Dual notification recipients (admin@tikum.app, support@tikum.app) remain intact.
 */

const assert = require('assert');
const {
  AdminActivityNotificationService,
  isAdminSelfLoginEvent
} = require('./src/services/admin/AdminActivityNotificationService');
const { resolveNotificationRecipients } = require('./src/config/notificationRecipients');
const { emailService } = require('./src/services/emailService');
const { state } = require('./src/database');
const { AdminMagicLinkService } = require('./src/services/adminMagicLinkService');
const { adminSecurityStore } = require('./src/storage/AdminSecurityStore');

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM EPIC P0.8 — ADMIN SELF-LOGIN SUPPRESSION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m [PASS] ${desc}`);
    } catch (err) {
      console.error(`  \x1b[31m✗\x1b[0m [FAIL] ${desc}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  async function asyncTest(desc, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m [PASS] ${desc}`);
    } catch (err) {
      console.error(`  \x1b[31m✗\x1b[0m [FAIL] ${desc}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  // Intercept and monitor SMTP emails dispatched
  const dispatchedEmails = [];
  const originalSendEmail = emailService.sendEmail.bind(emailService);
  emailService.sendEmail = async (params) => {
    dispatchedEmails.push(params);
    return { success: true, messageId: `msg-${Date.now()}` };
  };

  console.log('── Section 1: Helper Normalization & Identity Guards ──');
  test('1.1 isAdminSelfLoginEvent correctly matches admin@tikum.app sign-in', () => {
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'admin@tikum.app'), true);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', '  admin@tikum.app  '), true);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'ADMIN@TIKUM.APP'), true);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', '  Admin@Tikum.App  '), true);
    assert.strictEqual(isAdminSelfLoginEvent('USER_FIRST_SIGN_IN', 'admin@tikum.app'), true);
  });

  test('1.2 isAdminSelfLoginEvent strictly rejects other emails and spoofing attempts', () => {
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'otheradmin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'support@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'admin@tikum.app.evil.com'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'notadmin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', 'buyer@gmail.com'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', null), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_SIGNED_IN', ''), false);
  });

  test('1.3 isAdminSelfLoginEvent does NOT match non-login event types for admin@tikum.app', () => {
    assert.strictEqual(isAdminSelfLoginEvent('SELLER_KYC_APPROVED', 'admin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('SELLER_LISTING_APPROVED', 'admin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('VENUE_PIC_ASSIGNED', 'admin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('USER_REGISTERED', 'admin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('DISPUTE_CREATED', 'admin@tikum.app'), false);
    assert.strictEqual(isAdminSelfLoginEvent('FRAUD_RISK_DETECTED', 'admin@tikum.app'), false);
  });

  console.log('\n── Section 2: Required Test Matrix (12 Scenarios) ──');

  await asyncTest('2.1 Scenario 1: admin@tikum.app signs in -> NO email sent (SUPPRESSED)', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('USER_SIGNED_IN', {
      userId: 'usr-admin-owner',
      userEmail: 'admin@tikum.app',
      userDisplayName: 'TIKUM Administrator',
      userRole: 'ADMIN',
      loginMethod: 'ADMIN_MAGIC_LINK'
    }, {
      eventId: 'evt-test-self-login-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SUPPRESSED');
    assert.strictEqual(res.suppressed, true);
    assert.strictEqual(res.suppressionReason, 'ADMIN_SELF_LOGIN_SUPPRESSED');
    assert.strictEqual(dispatchedEmails.length, 0, 'No SMTP email should be dispatched for admin self-login');
  });

  await asyncTest('2.2 Scenario 2: Another admin signs in -> Existing notification email sent', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('USER_SIGNED_IN', {
      userId: 'usr-admin-sec',
      userEmail: 'superadmin@tikum.app',
      userDisplayName: 'Secondary Admin',
      userRole: 'ADMIN',
      loginMethod: 'ADMIN_MAGIC_LINK'
    }, {
      eventId: 'evt-test-other-admin-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1, 'Email must be dispatched for other admin');
    assert(dispatchedEmails[0].to.includes('admin@tikum.app') && dispatchedEmails[0].to.includes('support@tikum.app'));
  });

  await asyncTest('2.3 Scenario 3: Normal user signs in -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('USER_SIGNED_IN', {
      userId: 'usr-normal-buyer',
      userEmail: 'buyer.budi@gmail.com',
      userDisplayName: 'Budi Santoso',
      userRole: 'BUYER',
      loginMethod: 'MAGIC_LINK'
    }, {
      eventId: 'evt-test-buyer-login-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
    assert(dispatchedEmails[0].to.includes('admin@tikum.app'));
    assert(dispatchedEmails[0].to.includes('support@tikum.app'));
  });

  await asyncTest('2.4 Scenario 4: New user registers -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('USER_REGISTERED', {
      userId: 'usr-new-reg',
      userEmail: 'citra.permata@gmail.com',
      userDisplayName: 'Citra Permata',
      userRole: 'BUYER'
    }, {
      eventId: 'evt-test-user-reg-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
    assert(dispatchedEmails[0].subject.includes('Pendaftaran Akun Pengguna Baru'));
  });

  await asyncTest('2.5 Scenario 5: Seller submits KYC -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('SELLER_KYC_SUBMITTED', {
      userId: 'usr-seller-nadea',
      sellerName: 'NADEA NUR SOFIA MADANI',
      sellerEmail: 'nadea.madani@gmail.com',
      nik: '3201012345670002'
    }, {
      eventId: 'evt-test-kyc-sub-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
    assert(dispatchedEmails[0].subject.includes('KYC'));
  });

  await asyncTest('2.6 Scenario 6: Buyer creates inquiry -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('BUYER_INQUIRY_CREATED', {
      inquiryId: 'inq-991',
      buyerName: 'Rian Dwi',
      buyerEmail: 'rian@gmail.com',
      eventName: 'DWP 2026'
    }, {
      eventId: 'evt-test-inq-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
  });

  await asyncTest('2.7 Scenario 7: Buyer creates order -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('BUYER_ORDER_CREATED', {
      orderId: 'ord-8812',
      buyerName: 'Maya Sari',
      amount: 1700000,
      eventName: 'Maroon 5 Asia 2027 in Jakarta'
    }, {
      eventId: 'evt-test-ord-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
  });

  await asyncTest('2.8 Scenario 8: Dispute is opened -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('DISPUTE_CREATED', {
      orderId: 'ord-dispute-1',
      reason: 'Tiket tidak dapat di-scan di venue pintu A',
      buyerEmail: 'buyer.dispute@gmail.com'
    }, {
      eventId: 'evt-test-dispute-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
  });

  await asyncTest('2.9 Scenario 9: Fraud risk is detected -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('FRAUD_RISK_DETECTED', {
      userId: 'usr-fraud-suspect',
      riskScore: 92,
      reason: 'Multiple rapid duplicate ticket listings detected across distinct IPs'
    }, {
      eventId: 'evt-test-fraud-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
  });

  await asyncTest('2.10 Scenario 10: Venue incident is created -> Email sent to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('VENUE_INCIDENT_CREATED', {
      venueName: 'Gelora Bung Karno',
      eventName: "Guns N' Roses — Jakarta 2026",
      severity: 'CRITICAL',
      reason: 'Gate 3 Turnstile scanner offline'
    }, {
      eventId: 'evt-test-incident-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1);
  });

  await asyncTest('2.11 Scenario 11: Admin performs other operational actions -> Existing behavior preserved', async () => {
    dispatchedEmails.length = 0;
    // admin@tikum.app approves a KYC
    const res = await AdminActivityNotificationService.notify('SELLER_KYC_APPROVED', {
      userId: 'usr-seller-approved',
      sellerName: 'Andre Kevin',
      performedBy: 'admin@tikum.app',
      userEmail: 'admin@tikum.app' // Even if userEmail is set to admin@tikum.app, action is KYC_APPROVED
    }, {
      eventId: 'evt-test-op-action-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'SENT');
    assert.strictEqual(dispatchedEmails.length, 1, 'Operational action by admin must still trigger email alert');
  });

  await asyncTest('2.12 Scenario 12: Unauthenticated request to admin endpoint is protected', async () => {
    const app = require('./src/server');
    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/activity-notifications`);
      // Must be 401 Unauthorized or 403 Forbidden
      assert(res.status === 401 || res.status === 403, `Unauthenticated request must be rejected (got ${res.status})`);
    } finally {
      server.close();
    }
  });

  console.log('\n── Section 3: Audit Log & Invariant Verification ──');

  test('3.1 Admin self-login is recorded in state.audit_logs', () => {
    const suppressedLogs = (state.audit_logs || []).filter(l =>
      l.action === 'ACTIVITY_USER_SIGNED_IN_SUPPRESSED' ||
      (l.metadata && l.metadata.includes('ADMIN_SELF_LOGIN_SUPPRESSED'))
    );
    assert(suppressedLogs.length > 0, 'Suppressed self-login must be recorded in audit logs');
  });

  test('3.2 Dual notification recipients list is never altered', () => {
    const recipients = resolveNotificationRecipients();
    assert.strictEqual(recipients.length, 2);
    assert(recipients.includes('admin@tikum.app'));
    assert(recipients.includes('support@tikum.app'));
  });

  test('3.3 Payment gateway frozen invariant preserved', () => {
    assert.strictEqual(process.env.ENABLE_DOKU_PRODUCTION, undefined, 'DOKU prod must not be enabled');
    assert.strictEqual(process.env.ENABLE_MIDTRANS_PRODUCTION, undefined, 'Midtrans prod must not be enabled');
    assert.strictEqual(process.env.ENABLE_XENDIT_PRODUCTION, undefined, 'Xendit prod must not be enabled');
    assert.strictEqual(process.env.ENABLE_IPAYMU_PRODUCTION, undefined, 'iPaymu prod must not be enabled');
  });

  // Restore emailService
  emailService.sendEmail = originalSendEmail;

  console.log('\n================================================================');
  console.log(`ALL ${passed}/${total} P0.8 TESTS PASSED SUCCESSFULLY`);
  console.log('================================================================');
}

runSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
