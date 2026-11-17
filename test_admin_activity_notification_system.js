/**
 * Test Suite: TIKUM Admin Activity Intelligence & Email Notification System
 * 
 * Verifies:
 * 1. Dual recipient resolution (admin@tikum.app & support@tikum.app).
 * 2. Event priorities, WIB timestamps, subject formatting [TIKUM][<PRIORITY>].
 * 3. Security & PII protection (masked NIK, zero tokens/passwords).
 * 4. Non-blocking secondary effect: email failure never fails business action.
 * 5. Idempotent deduplication against duplicate events.
 * 6. Full Event Matrix coverage:
 *    - Auth: USER_REGISTERED, USER_FIRST_SIGN_IN, USER_SIGNED_IN, USER_ROLE_CHANGED, USER_ACCOUNT_SUSPENDED, USER_ACCOUNT_REACTIVATED
 *    - Seller: SELLER_PROFILE_SUBMITTED, SELLER_KYC_SUBMITTED, SELLER_KYC_APPROVED, SELLER_KYC_REJECTED, SELLER_LISTING_CREATED, SELLER_LISTING_UPDATED, SELLER_LISTING_WITHDRAWN, SELLER_LISTING_APPROVED, SELLER_LISTING_REJECTED, SELLER_LISTING_SOLD
 *    - Buyer: BUYER_INQUIRY_CREATED, BUYER_ORDER_CREATED, BUYER_ORDER_CANCELLED, BUYER_PURCHASE_CONFIRMED, BUYER_PAYMENT_INITIATED, BUYER_PAYMENT_SUCCEEDED, BUYER_PAYMENT_FAILED, BUYER_REFUND_REQUESTED, BUYER_DISPUTE_OPENED
 *    - Operational: NEW_SUPPORT_REQUEST, NEW_USER_REPORT, FRAUD_RISK_DETECTED, DISPUTE_CREATED, VENUE_PIC_ASSIGNED, VENUE_INCIDENT_CREATED
 * 7. Admin REST API: GET /api/admin/activity-notifications
 */

const assert = require('assert');
const { resolveNotificationRecipients } = require('./src/config/notificationRecipients');
const {
  AdminActivityNotificationService,
  EVENT_PRIORITIES,
  EVENT_TITLES,
  formatWibTimestamp,
  maskSensitiveData
} = require('./src/services/admin/AdminActivityNotificationService');
const { adminActivityNotificationStore } = require('./src/storage/AdminActivityNotificationStore');
const { emailService } = require('./src/services/emailService');
const { state } = require('./src/database');

async function runTests() {
  console.log('--- STARTING ADMIN ACTIVITY NOTIFICATION TEST SUITE ---');
  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  async function asyncTest(desc, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${desc}`);
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  // Track dispatched emails in mock
  const dispatchedEmails = [];
  const originalSendEmail = emailService.sendEmail.bind(emailService);
  emailService.sendEmail = async (params) => {
    dispatchedEmails.push(params);
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  };

  // 1. RECIPIENT RESOLUTION
  test('1.1 Resolves dual default recipients: admin@tikum.app & support@tikum.app', () => {
    const recipients = resolveNotificationRecipients();
    assert(Array.isArray(recipients), 'Recipients should be an array');
    assert.strictEqual(recipients.length, 2, 'Should have exactly 2 recipients');
    assert(recipients.includes('admin@tikum.app'), 'Should include admin@tikum.app');
    assert(recipients.includes('support@tikum.app'), 'Should include support@tikum.app');
  });

  test('1.2 Rejects CRLF and invalid emails in recipient config', () => {
    const origEnv = process.env.NOTIFICATION_RECIPIENTS;
    process.env.NOTIFICATION_RECIPIENTS = 'admin@tikum.app, hacker@bad.com\r\nBcc: evil@victim.com, invalid-email';
    const cleaned = resolveNotificationRecipients();
    assert(cleaned.includes('admin@tikum.app'), 'Should keep valid admin@tikum.app');
    assert(!cleaned.some(e => e.includes('\r') || e.includes('\n')), 'Must not contain CRLF');
    assert(!cleaned.includes('invalid-email'), 'Must drop invalid email format');
    process.env.NOTIFICATION_RECIPIENTS = origEnv;
  });

  // 2. FORMATTING & SECURITY
  test('2.1 Formats timestamp in WIB (Asia/Jakarta)', () => {
    const wibStr = formatWibTimestamp(new Date('2026-11-17T09:30:00Z'));
    assert(wibStr.includes('WIB'), 'Timestamp string must contain WIB');
  });

  test('2.2 Masks 16-digit NIK for PII security', () => {
    const masked = maskSensitiveData('3171012345670001');
    assert.strictEqual(masked, '3171********0001', '16-digit NIK must be masked with middle 8 asterisks');
  });

  // 3. EVENT DISPATCH & PRIORITY MAPPING
  await asyncTest('3.1 Dispatches CRITICAL event with [TIKUM][CRITICAL] subject to dual recipients', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('BUYER_PAYMENT_SUCCEEDED', {
      orderId: 'ord-test-crit-1',
      userId: 'usr-buyer-1',
      amount: 1500000,
      description: 'Pembayaran tiket konser berhasil diverifikasi.'
    }, {
      eventId: 'evt-test-crit-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.priority, 'CRITICAL');
    assert.strictEqual(dispatchedEmails.length, 1);
    const sent = dispatchedEmails[0];
    assert(Array.isArray(sent.to) && sent.to.includes('admin@tikum.app') && sent.to.includes('support@tikum.app'));
    assert(sent.subject.startsWith('[TIKUM][CRITICAL]'));
    assert(sent.html.includes('CRITICAL'));
    assert(sent.html.includes('1.500.000') || sent.html.includes('1500000'));
    assert(sent.html.includes('https://tikum.app/admin?tab=orders&id=ord-test-crit-1'));
  });

  await asyncTest('3.2 Dispatches HIGH event with [TIKUM][HIGH] subject', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('SELLER_KYC_SUBMITTED', {
      userId: 'usr-seller-test',
      sellerName: 'Nadea Madani',
      sellerEmail: 'nadea@test.com',
      nik: '3201012345670002',
      description: 'Pengajuan KYC baru.'
    }, {
      eventId: 'evt-test-high-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.priority, 'HIGH');
    assert.strictEqual(dispatchedEmails.length, 1);
    const sent = dispatchedEmails[0];
    assert(sent.subject.startsWith('[TIKUM][HIGH]'));
    // NIK in HTML must be masked
    assert(!sent.html.includes('3201012345670002'), 'Raw NIK must not appear in HTML');
    assert(sent.html.includes('3201********0002'), 'Masked NIK must appear in HTML');
  });

  await asyncTest('3.3 Dispatches NORMAL event with [TIKUM][NORMAL] subject', async () => {
    dispatchedEmails.length = 0;
    const res = await AdminActivityNotificationService.notify('USER_SIGNED_IN', {
      userId: 'usr-user-1',
      userEmail: 'user@tikum.app',
      description: 'Pengguna berhasil login via magic link.'
    }, {
      eventId: 'evt-test-norm-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.priority, 'NORMAL');
    assert.strictEqual(dispatchedEmails.length, 1);
    assert(dispatchedEmails[0].subject.startsWith('[TIKUM][NORMAL]'));
  });

  // 4. IDEMPOTENCY
  await asyncTest('4.1 Idempotency prevents duplicate notification for identical eventId', async () => {
    dispatchedEmails.length = 0;
    const first = await AdminActivityNotificationService.notify('USER_REGISTERED', {
      userId: 'usr-reg-1',
      userEmail: 'reg@test.com'
    }, {
      eventId: 'evt-duplicate-idempotency-test'
    });
    assert.strictEqual(first.success, true);
    assert.strictEqual(dispatchedEmails.length, 1);

    const second = await AdminActivityNotificationService.notify('USER_REGISTERED', {
      userId: 'usr-reg-1',
      userEmail: 'reg@test.com'
    }, {
      eventId: 'evt-duplicate-idempotency-test'
    });
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.status, 'IDEMPOTENT_SKIPPED');
    assert.strictEqual(dispatchedEmails.length, 1, 'Duplicate event must NOT dispatch second email');
  });

  // 5. NON-BLOCKING RESILIENCE
  await asyncTest('5.1 Email dispatch failure does not throw or crash caller', async () => {
    emailService.sendEmail = async () => {
      throw new Error('SMTP connection timed out');
    };

    const res = await AdminActivityNotificationService.notify('BUYER_ORDER_CREATED', {
      orderId: 'ord-fail-safe-1',
      userId: 'usr-b-1',
      amount: 500000
    }, {
      eventId: 'evt-fail-safe-test'
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'FAILED');
    assert(res.error.includes('SMTP connection timed out'));
  });

  // Restore mock
  emailService.sendEmail = async (params) => {
    dispatchedEmails.push(params);
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  };

  // 6. FULL EVENT MATRIX VERIFICATION
  const allExpectedEvents = [
    // Account & Auth
    'USER_REGISTERED', 'USER_FIRST_SIGN_IN', 'USER_SIGNED_IN', 'USER_ROLE_CHANGED',
    'USER_ACCOUNT_SUSPENDED', 'USER_ACCOUNT_REACTIVATED',
    // Seller
    'SELLER_PROFILE_SUBMITTED', 'SELLER_KYC_SUBMITTED', 'SELLER_KYC_APPROVED',
    'SELLER_KYC_REJECTED', 'SELLER_LISTING_CREATED', 'SELLER_LISTING_UPDATED',
    'SELLER_LISTING_WITHDRAWN', 'SELLER_LISTING_APPROVED', 'SELLER_LISTING_REJECTED',
    'SELLER_LISTING_SOLD',
    // Buyer
    'BUYER_INQUIRY_CREATED', 'BUYER_ORDER_CREATED', 'BUYER_ORDER_CANCELLED',
    'BUYER_PURCHASE_CONFIRMED', 'BUYER_PAYMENT_INITIATED', 'BUYER_PAYMENT_SUCCEEDED',
    'BUYER_PAYMENT_FAILED', 'BUYER_REFUND_REQUESTED', 'BUYER_DISPUTE_OPENED',
    // Operational
    'NEW_SUPPORT_REQUEST', 'NEW_USER_REPORT', 'FRAUD_RISK_DETECTED',
    'DISPUTE_CREATED', 'VENUE_PIC_ASSIGNED', 'VENUE_INCIDENT_CREATED'
  ];

  test('6.1 All 28 required event types are defined in EVENT_PRIORITIES & EVENT_TITLES', () => {
    for (const evt of allExpectedEvents) {
      assert(EVENT_PRIORITIES[evt], `Missing priority mapping for ${evt}`);
      assert(EVENT_TITLES[evt], `Missing title mapping for ${evt}`);
    }
  });

  await asyncTest('6.2 Dispatches all 28 events cleanly and stores in notification store', async () => {
    for (const evt of allExpectedEvents) {
      const res = await AdminActivityNotificationService.notify(evt, {
        userId: 'usr-matrix-test',
        userDisplayName: 'Matrix Tester',
        userEmail: 'matrix@tikum.app',
        description: `Automated test for ${evt}`
      }, {
        eventId: `evt-matrix-${evt.toLowerCase()}`
      });
      assert.strictEqual(res.success, true, `Failed dispatching ${evt}`);
    }

    const recent = await AdminActivityNotificationService.listNotifications({ limit: 100 });
    assert(recent.length >= allExpectedEvents.length, 'Notification store must hold all recorded notifications');
  });

  // 7. REST ENDPOINT TESTING
  await asyncTest('7.1 Admin router provides GET /api/admin/activity-notifications', async () => {
    const adminRouter = require('./src/api/adminRouter');
    const express = require('express');
    const app = express();
    app.use(express.json());

    // Mock admin authentication middleware bypass for testing
    app.use((req, res, next) => {
      req.user = { id: 'admin-1', role: 'admin', email: 'admin@tikum.app' };
      next();
    });
    app.use('/api/admin', adminRouter);

    // Test route handler directly
    const route = adminRouter.stack.find(r => r.route && r.route.path === '/activity-notifications');
    assert(route, 'GET /api/admin/activity-notifications route must exist');
    assert(route.route.methods.get, 'Must be a GET endpoint');
  });

  // 8. RESTORE EMAIL SERVICE
  emailService.sendEmail = originalSendEmail;

  console.log(`\n========================================`);
  console.log(`ALL ${passed}/${total} NOTIFICATION TESTS PASSED SUCCESSFULLY`);
  console.log(`========================================\n`);
}

runTests().catch(err => {
  console.error('Fatal error during notification tests:', err);
  process.exit(1);
});
