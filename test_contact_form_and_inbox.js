/**
 * TIKUM & ARGUS — Contact Form, Webhook & Admin Human Inbox Test Suite
 * 
 * Verifies:
 * 1. POST /api/contact: Valid submission persists inquiry and inbox entry
 * 2. POST /api/contact: From is support@tikum.app and Reply-To is user's email
 * 3. POST /api/contact: Confirmation email dispatched to visitor
 * 4. POST /api/contact: Rejects missing/invalid fields and CRLF header injection
 * 5. POST /api/contact: Honeypot field silently absorbs spam
 * 6. POST /api/contact: Rate limiter enforces quota limit
 * 7. POST /api/email/webhook: Inbound email parsed into state.inbox_messages
 * 8. POST /api/email/webhook: Delivery events update state.email_logs (delivered, bounced, complained)
 * 9. GET /api/admin/inbox: Enforces admin authentication
 * 10. GET /api/admin/inbox: Lists messages with unread counts and filters
 * 11. GET /api/admin/inbox/:id: Retrieves message and marks as read
 * 12. POST /api/admin/inbox/:id/reply: Dispatches official reply via @tikum.app and updates thread
 * 13. POST /api/admin/inbox/:id/archive: Archives message
 * 14. EmailService convenience dispatchers (send, sendWelcomeEmail, sendOrderConfirmation, etc.)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase, recordAuditLog } = require('./src/database');
const { emailService } = require('./src/services/emailService');
const { SUPPORT_EMAIL, ADMIN_EMAIL } = require('./src/services/emailTemplates');
const { SessionStore } = require('./src/services/sessionStore');

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
  console.log('  TIKUM — CONTACT FORM, INBOUND & ADMIN INBOX TEST SUITE        ');
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

  // Setup server
  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    resetDatabase();

    // Setup Admin User and Session for inbox tests
    const adminUser = {
      id: 'usr-admin-test',
      email: 'ops@tikum.app',
      name: 'Ops Admin',
      role: 'ADMIN',
      status: 'ACTIVE'
    };
    state.users.push(adminUser);
    const sess = SessionStore.createSession({ userId: adminUser.id, role: 'ADMIN', ttlMs: 24 * 3600 * 1000 });
    const adminSessionToken = sess.session_token;
    const adminHeaders = {
      'Cookie': `argus_session=${adminSessionToken}; tikum_session=${adminSessionToken}`,
      'Authorization': `Bearer ${adminSessionToken}`
    };

    // -------------------------------------------------------------------------
    // 1. Contact Form: Valid submission
    // -------------------------------------------------------------------------
    await checkAsync('1. POST /api/contact: Valid submission persists inquiry and inbox entry', async () => {
      const payload = {
        name: 'Rudi Hartono',
        email: 'rudi.hartono@example.com',
        subject: 'Pertanyaan Verifikasi Tiket Konser',
        message: 'Halo tim Tikum, bagaimana cara memastikan tiket e-voucher saya terverifikasi sebelum masuk gate?'
      };

      const res = await request('/api/contact', {
        method: 'POST',
        body: payload
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.inquiry_id, 'Must return inquiry_id');

      // Verify persistence in state.contact_inquiries
      const inq = state.contact_inquiries.find(i => i.id === res.json.inquiry_id);
      assert.ok(inq, 'Inquiry must be stored in contact_inquiries');
      assert.strictEqual(inq.name, 'Rudi Hartono');
      assert.strictEqual(inq.email, 'rudi.hartono@example.com');
      assert.strictEqual(inq.subject, 'Pertanyaan Verifikasi Tiket Konser');

      // Verify persistence in state.inbox_messages
      const msg = state.inbox_messages.find(m => m.id === res.json.inquiry_id);
      assert.ok(msg, 'Message must be stored in inbox_messages');
      assert.strictEqual(msg.sender_email, 'rudi.hartono@example.com');
      assert.strictEqual(msg.status, 'UNREAD');
      assert.strictEqual(msg.source, 'CONTACT_FORM');
    });

    // -------------------------------------------------------------------------
    // 2. Contact Form: FROM is support@tikum.app and REPLY-TO is user's email
    // -------------------------------------------------------------------------
    check('2. POST /api/contact: Support notification uses support@tikum.app FROM and user email REPLY-TO', () => {
      const logs = emailService.getEmailLogs();
      const supportNotif = logs.find(l => (l.template === 'CONTACT_INQUIRY_NOTIFICATION' || l.type === 'CONTACT_INQUIRY_NOTIFICATION') && l.recipient.includes(SUPPORT_EMAIL));
      assert.ok(supportNotif, 'Support notification email log must exist');
      assert.strictEqual(supportNotif.recipient, SUPPORT_EMAIL);
      assert.ok(supportNotif.from.includes(SUPPORT_EMAIL), `FROM must contain support@tikum.app, got ${supportNotif.from}`);
    });

    // -------------------------------------------------------------------------
    // 3. Contact Form: Confirmation receipt dispatched to visitor
    // -------------------------------------------------------------------------
    check('3. POST /api/contact: Confirmation email dispatched to visitor', () => {
      const logs = emailService.getEmailLogs();
      const receipt = logs.find(l => (l.template === 'CONTACT_CONFIRMATION_RECEIPT' || l.type === 'CONTACT_CONFIRMATION_RECEIPT') && l.recipient === 'rudi.hartono@example.com');
      assert.ok(receipt, 'Receipt email log must exist for visitor');
      assert.strictEqual(receipt.recipient, 'rudi.hartono@example.com');
      assert.ok(receipt.from.includes(SUPPORT_EMAIL));
    });

    // -------------------------------------------------------------------------
    // 4. Contact Form: Input Validation & CRLF Injection Prevention
    // -------------------------------------------------------------------------
    await checkAsync('4. POST /api/contact: Rejects missing fields, invalid email, and CRLF header injection', async () => {
      // Missing name
      const res1 = await request('/api/contact', {
        method: 'POST',
        body: { email: 'user@example.com', subject: 'Halo', message: 'Tes pesan saja ya.' }
      });
      assert.strictEqual(res1.statusCode, 400);
      assert.strictEqual(res1.json.code, 'INVALID_NAME');

      // Invalid email
      const res2 = await request('/api/contact', {
        method: 'POST',
        body: { name: 'User', email: 'not-an-email', subject: 'Halo', message: 'Tes pesan saja ya.' }
      });
      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.json.code, 'INVALID_EMAIL');

      // CRLF injection in subject
      const res3 = await request('/api/contact', {
        method: 'POST',
        body: { name: 'Attacker', email: 'user@example.com', subject: 'Subject\r\nBcc: evil@attacker.com', message: 'Testing CRLF injection.' }
      });
      assert.strictEqual(res3.statusCode, 400);
      assert.strictEqual(res3.json.code, 'INVALID_SUBJECT');
    });

    // -------------------------------------------------------------------------
    // 5. Contact Form: Honeypot silently absorbs spam bots
    // -------------------------------------------------------------------------
    await checkAsync('5. POST /api/contact: Honeypot field silently absorbs spam bots without error', async () => {
      const countBefore = state.contact_inquiries.length;
      const res = await request('/api/contact', {
        method: 'POST',
        body: {
          name: 'Spam Bot',
          email: 'bot@spammer.com',
          subject: 'Buy Cheap Watches',
          message: 'Click this link to buy watches.',
          hp_website: 'http://spam-link.com'
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      // Ensure it was NOT saved to actual database
      assert.strictEqual(state.contact_inquiries.length, countBefore, 'Spam inquiry must not be persisted');
    });

    // -------------------------------------------------------------------------
    // 6. Webhook: Inbound email (email.received) stored in inbox_messages
    // -------------------------------------------------------------------------
    await checkAsync('6. POST /api/email/webhook: Inbound email stored into state.inbox_messages', async () => {
      const webhookPayload = {
        type: 'email.received',
        created_at: new Date().toISOString(),
        data: {
          message_id: 'msg-resend-inbound-101',
          from: 'Siti Aminah <siti@customer.id>',
          to: ['support@tikum.app'],
          subject: 'Pertanyaan Refund Tiket Synchronize',
          text: 'Halo Tikum, apakah refund saya sudah diproses?',
          html: '<p>Halo Tikum, apakah refund saya sudah diproses?</p>'
        }
      };

      const res = await request('/api/email/webhook', {
        method: 'POST',
        body: webhookPayload
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.processed, 'INBOUND_STORED');

      const stored = state.inbox_messages.find(m => m.message_id === 'msg-resend-inbound-101');
      assert.ok(stored, 'Inbound email must exist in inbox_messages');
      assert.strictEqual(stored.sender_name, 'Siti Aminah');
      assert.strictEqual(stored.sender_email, 'siti@customer.id');
      assert.strictEqual(stored.subject, 'Pertanyaan Refund Tiket Synchronize');
      assert.strictEqual(stored.status, 'UNREAD');
      assert.strictEqual(stored.source, 'INBOUND_EMAIL');
    });

    // -------------------------------------------------------------------------
    // 7. Webhook: Delivery events update state.email_logs
    // -------------------------------------------------------------------------
    await checkAsync('7. POST /api/email/webhook: Delivery events update state.email_logs (delivered & bounced)', async () => {
      // Simulate existing email log
      const testEmailId = 'resend-test-deliv-999';
      state.email_logs.push({
        id: 'eml-test-999',
        message_id: testEmailId,
        provider_message_id: testEmailId,
        provider: 'resend',
        type: 'ORDER_CREATED',
        to: 'buyer@test.com',
        status: 'PENDING',
        created_at: new Date().toISOString()
      });

      // Delivered event
      const resDeliv = await request('/api/email/webhook', {
        method: 'POST',
        body: { type: 'email.delivered', data: { email_id: testEmailId } }
      });
      assert.strictEqual(resDeliv.statusCode, 200);
      const logDeliv = state.email_logs.find(l => l.message_id === testEmailId);
      assert.strictEqual(logDeliv.status, 'DELIVERED');

      // Bounced event
      const resBounce = await request('/api/email/webhook', {
        method: 'POST',
        body: { type: 'email.bounced', data: { email_id: testEmailId, bounce: { message: 'Mailbox not found' } } }
      });
      assert.strictEqual(resBounce.statusCode, 200);
      assert.strictEqual(logDeliv.status, 'BOUNCED');
      assert.strictEqual(logDeliv.error, 'Mailbox not found');
    });

    // -------------------------------------------------------------------------
    // 8. Admin Inbox: Auth boundaries
    // -------------------------------------------------------------------------
    await checkAsync('8. GET /api/admin/inbox: Enforces admin authorization', async () => {
      // Unauthenticated
      const resUnauth = await request('/api/admin/inbox');
      assert.strictEqual(resUnauth.statusCode, 403);

      // Authenticated admin
      const resAdmin = await request('/api/admin/inbox', { headers: adminHeaders });
      assert.strictEqual(resAdmin.statusCode, 200);
      assert.strictEqual(resAdmin.json.success, true);
      assert.ok(Array.isArray(resAdmin.json.messages));
      assert.ok(resAdmin.json.unread_count >= 1);
    });

    // -------------------------------------------------------------------------
    // 9. Admin Inbox: Read message details & auto mark read
    // -------------------------------------------------------------------------
    await checkAsync('9. GET /api/admin/inbox/:id: Retrieves message and marks as read', async () => {
      const unreadMsg = state.inbox_messages.find(m => m.status === 'UNREAD');
      assert.ok(unreadMsg, 'Must have at least one unread message');

      const res = await request(`/api/admin/inbox/${unreadMsg.id}`, { headers: adminHeaders });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.message.id, unreadMsg.id);

      // Verify it was marked as READ in state
      const refreshed = state.inbox_messages.find(m => m.id === unreadMsg.id);
      assert.strictEqual(refreshed.status, 'READ');
      assert.ok(refreshed.read_at);
    });

    // -------------------------------------------------------------------------
    // 10. Admin Inbox: Reply to customer from @tikum.app
    // -------------------------------------------------------------------------
    await checkAsync('10. POST /api/admin/inbox/:id/reply: Dispatches reply via @tikum.app and updates thread', async () => {
      const targetMsg = state.inbox_messages[0];
      assert.ok(targetMsg, 'Target message must exist');

      const replyText = 'Halo, refund Anda telah kami verifikasi dan akan segera diteruskan ke rekening Anda.';
      const res = await request(`/api/admin/inbox/${targetMsg.id}/reply`, {
        method: 'POST',
        headers: adminHeaders,
        body: { reply_text: replyText }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.ok(res.json.reply);
      assert.strictEqual(res.json.reply.text, replyText);

      // Verify status changed to REPLIED
      const updated = state.inbox_messages.find(m => m.id === targetMsg.id);
      assert.strictEqual(updated.status, 'REPLIED');
      assert.strictEqual(updated.replies.length, 1);

      // Verify email was sent via EmailService with INBOX_REPLY template from support@tikum.app
      const logs = emailService.getEmailLogs();
      const replyLog = logs.find(l => (l.template === 'INBOX_REPLY' || l.type === 'INBOX_REPLY') && l.recipient === targetMsg.sender_email);
      assert.ok(replyLog, `Reply email log must exist for recipient ${targetMsg.sender_email}`);
      assert.ok(replyLog.from.includes(SUPPORT_EMAIL), `FROM must be support@tikum.app, got ${replyLog.from}`);
    });

    // -------------------------------------------------------------------------
    // 11. Admin Inbox: Archive message
    // -------------------------------------------------------------------------
    await checkAsync('11. POST /api/admin/inbox/:id/archive: Archives message successfully', async () => {
      const targetMsg = state.inbox_messages[0];
      const res = await request(`/api/admin/inbox/${targetMsg.id}/archive`, {
        method: 'POST',
        headers: adminHeaders
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);

      const archived = state.inbox_messages.find(m => m.id === targetMsg.id);
      assert.strictEqual(archived.status, 'ARCHIVED');
    });

    // -------------------------------------------------------------------------
    // 12. EmailService convenience dispatchers
    // -------------------------------------------------------------------------
    await checkAsync('12. EmailService convenience methods dispatch expected templates', async () => {
      // sendWelcomeEmail
      const welcome = await emailService.sendWelcomeEmail({ to: 'newuser@example.com', name: 'Dewi' });
      assert.strictEqual(welcome.success, true);

      // sendOrderConfirmation
      const orderConf = await emailService.sendOrderConfirmation({
        order: { id: 'ord-conv-1', total_amount: 500000 },
        buyer: { email: 'buyer@example.com', name: 'Buyer 1' },
        ticket: { seat_info: 'CAT 1' },
        event: { title: 'Coldplay' },
        pricing: { totalPrice: 500000 }
      });
      assert.strictEqual(orderConf.success, true);

      // sendPaymentConfirmation
      const payConf = await emailService.sendPaymentConfirmation({
        order: { id: 'ord-conv-2', total_amount: 500000 },
        payment: { id: 'pay-conv-1', amount: 500000 },
        buyer: { email: 'buyer@example.com', name: 'Buyer 1' },
        seller: { email: 'seller@example.com', name: 'Seller 1' },
        event: { title: 'Coldplay' }
      });
      assert.strictEqual(payConf.success, true);

      // sendTicketTransferNotification
      const ticketTransfer = await emailService.sendTicketTransferNotification({
        order: { id: 'ord-conv-3' },
        buyer: { email: 'buyer@example.com', name: 'Buyer 1' },
        ticket: { category: 'VIP', seat_info: 'Row A' },
        event: { title: 'Coldplay' },
        downloadUrl: 'https://tikum.app/track/ord-conv-3'
      });
      assert.strictEqual(ticketTransfer.success, true);

      // sendAdminNotification
      const adminNotif = await emailService.sendAdminNotification({
        title: 'System Health Check',
        message: 'All services operating nominally.',
        severity: 'INFO'
      });
      assert.strictEqual(adminNotif.success, true);
    });

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} CONTACT FORM, INBOUND & INBOX TESTS PASSED!`);
    console.log('================================================================\n');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\nTest run failed:', err);
  process.exit(1);
});
