/**
 * TIKUM & ARGUS — Unified Email, Contact Form, Webhook & Inbox Router
 * 
 * Implements:
 * 1. POST /api/contact - Public contact form submission (anti-spam, rate limiting, persistence, notifications)
 * 2. POST /api/email/webhook - Inbound email receiver & delivery event webhook (delivered, bounced, complained)
 * 3. GET /api/admin/inbox - Admin human inbox message list (protected)
 * 4. GET /api/admin/inbox/:id - Admin read message details & mark read (protected)
 * 5. POST /api/admin/inbox/:id/reply - Admin reply to customer via @tikum.app (protected)
 * 6. POST /api/admin/inbox/:id/archive - Admin archive message (protected)
 * 7. POST /api/admin/inbox/:id/status - Admin update message read/unread status (protected)
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { emailService, validateRecipient, sanitizeHeader } = require('../services/emailService');
const { SUPPORT_EMAIL, ADMIN_EMAIL } = require('../services/emailTemplates');
const { resolveUser, isAdminRole } = require('../middleware/auth');

const router = express.Router();

// -----------------------------------------------------------------------------
// Rate Limiter for Public Contact Form (In-Memory Sliding Window)
// -----------------------------------------------------------------------------
const contactRateLimits = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CONTACT_SUBMISSIONS_PER_WINDOW = 5;

function isContactRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const timestamps = (contactRateLimits.get(ip) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_CONTACT_SUBMISSIONS_PER_WINDOW) {
    return true;
  }
  timestamps.push(now);
  contactRateLimits.set(ip, timestamps);
  return false;
}

// -----------------------------------------------------------------------------
// 1. PUBLIC CONTACT FORM: POST /api/contact
// -----------------------------------------------------------------------------
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message, hp_website } = req.body || {};

    // Anti-Spam Honeypot Gate: silently absorb bot submissions
    if (hp_website && String(hp_website).trim().length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Pesan Anda telah berhasil dikirim. Tim Support TIKUM akan segera merespons.',
        inquiry_id: `inq-hp-${Date.now()}`
      });
    }

    // Rate Limiting Gate
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (isContactRateLimited(clientIp)) {
      return res.status(429).json({
        success: false,
        error: 'Terlalu banyak permintaan pengiriman pesan dari perangkat Anda. Silakan coba kembali dalam 15 menit.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // Input Validation & Sanitization
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Nama lengkap wajib diisi (minimal 2 karakter, maksimal 100 karakter).',
        code: 'INVALID_NAME'
      });
    }

    if (!email || !validateRecipient(email)) {
      return res.status(400).json({
        success: false,
        error: 'Alamat email tidak valid. Pastikan format email benar.',
        code: 'INVALID_EMAIL'
      });
    }

    if (!subject || typeof subject !== 'string' || subject.trim().length < 3 || subject.trim().length > 200 || /[\r\n]/.test(subject)) {
      return res.status(400).json({
        success: false,
        error: 'Subjek / perihal pesan wajib diisi (3-200 karakter, tanpa baris baru).',
        code: 'INVALID_SUBJECT'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Isi pesan wajib diisi (minimal 10 karakter, maksimal 5000 karakter).',
        code: 'INVALID_MESSAGE'
      });
    }

    const cleanName = sanitizeHeader(name);
    const cleanEmail = email.trim().toLowerCase();
    const cleanSubject = sanitizeHeader(subject);
    const cleanMessage = message.trim();
    const inquiryId = `inq-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // 1. Persist to state.contact_inquiries
    if (!state.contact_inquiries) {
      state.contact_inquiries = [];
    }
    const inquiryRecord = {
      id: inquiryId,
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
      ip: clientIp,
      status: 'UNREAD',
      created_at: nowIso
    };
    state.contact_inquiries.push(inquiryRecord);

    // 2. Persist to state.inbox_messages (real correspondence entry)
    if (!state.inbox_messages) {
      state.inbox_messages = [];
    }
    const inboxEntry = {
      id: inquiryId,
      inquiry_id: inquiryId,
      from: `${cleanName} <${cleanEmail}>`,
      sender_name: cleanName,
      sender_email: cleanEmail,
      to: SUPPORT_EMAIL,
      subject: cleanSubject,
      body: cleanMessage,
      text: cleanMessage,
      source: 'CONTACT_FORM',
      status: 'UNREAD',
      replies: [],
      created_at: nowIso
    };
    state.inbox_messages.push(inboxEntry);

    // 3. Dispatch operational notification to support@tikum.app
    // (FROM: support@tikum.app, REPLY-TO: cleanEmail)
    emailService.sendSupportNotification({
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
      inquiryId
    }).catch(err => {
      console.error('[EmailRouter:Contact] Support notification error:', err.message);
    });

    // 4. Dispatch confirmation receipt to visitor
    // (FROM: support@tikum.app, REPLY-TO: support@tikum.app)
    emailService.sendContactConfirmationEmail({
      to: cleanEmail,
      name: cleanName,
      subject: cleanSubject,
      inquiryId
    }).catch(err => {
      console.error('[EmailRouter:Contact] Receipt dispatch error:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Pesan Anda telah berhasil dikirim. Tim Support TIKUM akan segera merespons.',
      inquiry_id: inquiryId
    });

  } catch (err) {
    console.error('[EmailRouter:Contact] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan sistem saat memproses pesan Anda. Silakan hubungi kami via WhatsApp.',
      code: 'SERVER_ERROR'
    });
  }
});

// -----------------------------------------------------------------------------
// 2. WEBHOOK: POST /api/email/webhook (Resend Delivery Events & Inbound)
// -----------------------------------------------------------------------------
router.post('/email/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;

    // Cryptographic signature check if webhookSecret configured
    if (webhookSecret) {
      const svixSignature = req.headers['svix-signature'] || req.headers['x-resend-signature'];
      if (!svixSignature) {
        return res.status(401).json({ error: 'Missing webhook signature header', code: 'UNAUTHORIZED' });
      }
      // Basic token / HMAC verification
      const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
      const computedHmac = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (!svixSignature.includes(computedHmac) && svixSignature !== webhookSecret) {
        return res.status(401).json({ error: 'Invalid webhook signature', code: 'SIGNATURE_MISMATCH' });
      }
    }

    const payload = req.body || {};
    const eventType = payload.type || payload.event;
    const eventData = payload.data || payload;

    if (!eventType) {
      return res.status(400).json({ error: 'Invalid webhook payload: type is required' });
    }

    const emailId = eventData.email_id || eventData.id;
    const nowIso = new Date().toISOString();

    // 1. Inbound Received Email (email.received)
    if (eventType === 'email.received' || eventType === 'inbound') {
      const fromRaw = eventData.from || 'anonymous@unknown.com';
      const toRaw = Array.isArray(eventData.to) ? eventData.to.join(', ') : (eventData.to || SUPPORT_EMAIL);
      const subject = sanitizeHeader(eventData.subject || 'Pesan Baru (Tanpa Subjek)');
      const textBody = eventData.text || (typeof eventData.html === 'string' ? eventData.html.replace(/<[^>]+>/g, '') : '');
      const htmlBody = eventData.html || null;

      // Extract sender name and email
      const fromMatch = String(fromRaw).match(/^(.*?)\s*<([^>]+)>$/) || [null, fromRaw, fromRaw];
      const senderName = sanitizeHeader(fromMatch[1] || fromMatch[2] || 'Pengguna');
      const senderEmail = (fromMatch[2] || fromRaw).trim().toLowerCase();
      const messageId = `msg-${uuidv4().substring(0, 8)}`;

      if (!state.inbox_messages) {
        state.inbox_messages = [];
      }

      state.inbox_messages.push({
        id: messageId,
        inquiry_id: null,
        message_id: eventData.message_id || emailId || null,
        from: fromRaw,
        sender_name: senderName,
        sender_email: senderEmail,
        to: toRaw,
        subject,
        body: textBody,
        html: htmlBody,
        text: textBody,
        source: 'INBOUND_EMAIL',
        status: 'UNREAD',
        attachments: eventData.attachments || [],
        replies: [],
        created_at: nowIso
      });

      return res.status(200).json({ success: true, processed: 'INBOUND_STORED', id: messageId });
    }

    // 2. Delivery status updates (email.delivered, email.bounced, email.complained)
    if (state.email_logs && Array.isArray(state.email_logs)) {
      const match = state.email_logs.find(l => 
        l.message_id === emailId || 
        l.provider_message_id === emailId || 
        l.id === emailId || 
        l.email_id === emailId
      );

      if (match) {
        if (eventType === 'email.delivered') {
          match.status = 'DELIVERED';
          match.delivered_at = nowIso;
        } else if (eventType === 'email.bounced') {
          match.status = 'BOUNCED';
          match.error = eventData.bounce?.message || 'Email delivery bounced';
          match.failure_reason = match.error;
          await recordAuditLog('EMAIL', emailId || 'unknown', 'BOUNCE_DETECTED', 'SYSTEM', { error: match.error }).catch(() => {});
        } else if (eventType === 'email.complained') {
          match.status = 'COMPLAINED';
          match.error = 'Spam complaint recorded';
          match.failure_reason = match.error;
          await recordAuditLog('EMAIL', emailId || 'unknown', 'SPAM_COMPLAINT', 'SYSTEM', { recipient: match.to }).catch(() => {});
        }
      }
    }

    return res.status(200).json({ success: true, processed: eventType });

  } catch (err) {
    console.error('[EmailRouter:Webhook] Error processing webhook:', err);
    return res.status(500).json({ error: 'Internal webhook error' });
  }
});

// -----------------------------------------------------------------------------
// ADMIN INBOX AUTHENTICATION GATE
// -----------------------------------------------------------------------------
function requireAdminAuth(req, res, next) {
  const user = resolveUser(req);
  if (!user || !isAdminRole(user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak: otorisasi Administrator TIKUM diperlukan.',
      code: 'FORBIDDEN'
    });
  }
  req.user = user;
  next();
}

// -----------------------------------------------------------------------------
// 3. GET /api/admin/inbox - List Messages
// -----------------------------------------------------------------------------
router.get('/admin/inbox', requireAdminAuth, (req, res) => {
  const messages = state.inbox_messages || [];
  const statusFilter = (req.query.status || 'ALL').toUpperCase();
  const search = (req.query.search || '').trim().toLowerCase();

  let filtered = [...messages];

  if (statusFilter !== 'ALL') {
    filtered = filtered.filter(m => (m.status || '').toUpperCase() === statusFilter);
  }

  if (search) {
    filtered = filtered.filter(m => 
      (m.subject && m.subject.toLowerCase().includes(search)) ||
      (m.sender_name && m.sender_name.toLowerCase().includes(search)) ||
      (m.sender_email && m.sender_email.toLowerCase().includes(search)) ||
      (m.body && m.body.toLowerCase().includes(search))
    );
  }

  // Sort descending by created_at
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const unreadCount = messages.filter(m => (m.status || '').toUpperCase() === 'UNREAD').length;

  res.json({
    success: true,
    total: messages.length,
    unread_count: unreadCount,
    messages: filtered
  });
});

// -----------------------------------------------------------------------------
// 4. GET /api/admin/inbox/:id - Message Detail & Mark Read
// -----------------------------------------------------------------------------
router.get('/admin/inbox/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const messages = state.inbox_messages || [];
  const message = messages.find(m => m.id === id);

  if (!message) {
    return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan.', code: 'NOT_FOUND' });
  }

  // Mark as read automatically when opened if currently UNREAD
  if ((message.status || '').toUpperCase() === 'UNREAD') {
    message.status = 'READ';
    message.read_at = new Date().toISOString();
  }

  res.json({
    success: true,
    message
  });
});

// -----------------------------------------------------------------------------
// 5. POST /api/admin/inbox/:id/reply - Reply to Customer via @tikum.app
// -----------------------------------------------------------------------------
router.post('/admin/inbox/:id/reply', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { reply_text } = req.body || {};

  if (!reply_text || typeof reply_text !== 'string' || reply_text.trim().length < 3) {
    return res.status(400).json({
      success: false,
      error: 'Teks balasan wajib diisi (minimal 3 karakter).',
      code: 'INVALID_REPLY_TEXT'
    });
  }

  const messages = state.inbox_messages || [];
  const message = messages.find(m => m.id === id);

  if (!message) {
    return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan.', code: 'NOT_FOUND' });
  }

  if (!message.sender_email || !validateRecipient(message.sender_email)) {
    return res.status(400).json({
      success: false,
      error: 'Alamat email pengirim pesan tidak valid untuk dikirimkan balasan.',
      code: 'INVALID_RECIPIENT'
    });
  }

  const cleanReply = reply_text.trim();
  const replyId = `rep-${uuidv4().substring(0, 8)}`;
  const nowIso = new Date().toISOString();

  // Dispatch reply via EmailService
  const sendRes = await emailService.sendInboxReplyEmail({
    to: message.sender_email,
    recipientName: message.sender_name || 'Pengguna',
    subject: message.subject,
    replyText: cleanReply,
    originalMessage: message.body,
    inReplyTo: message.message_id || message.id
  });

  if (!sendRes.success && sendRes.status === 'FAILED') {
    return res.status(500).json({
      success: false,
      error: `Gagal mengirim balasan: ${sendRes.error}`,
      code: 'DISPATCH_FAILED'
    });
  }

  // Record reply in message thread
  if (!message.replies) {
    message.replies = [];
  }

  const replyEntry = {
    id: replyId,
    admin_id: req.user.id || 'admin',
    admin_email: req.user.email || ADMIN_EMAIL,
    text: cleanReply,
    sent_at: nowIso,
    dispatch_id: sendRes.id || null
  };
  message.replies.push(replyEntry);
  message.status = 'REPLIED';
  message.last_replied_at = nowIso;

  res.json({
    success: true,
    message: 'Balasan berhasil dikirim ke pengirim.',
    reply: replyEntry
  });
});

// -----------------------------------------------------------------------------
// 6. POST /api/admin/inbox/:id/archive - Archive Message
// -----------------------------------------------------------------------------
router.post('/admin/inbox/:id/archive', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const messages = state.inbox_messages || [];
  const message = messages.find(m => m.id === id);

  if (!message) {
    return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan.', code: 'NOT_FOUND' });
  }

  message.status = 'ARCHIVED';
  message.archived_at = new Date().toISOString();

  res.json({
    success: true,
    message: 'Pesan berhasil diarsipkan.'
  });
});

// -----------------------------------------------------------------------------
// 7. POST /api/admin/inbox/:id/status - Toggle Status
// -----------------------------------------------------------------------------
router.post('/admin/inbox/:id/status', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const validStatuses = ['UNREAD', 'READ', 'ARCHIVED', 'REPLIED'];

  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}`,
      code: 'INVALID_STATUS'
    });
  }

  const messages = state.inbox_messages || [];
  const message = messages.find(m => m.id === id);

  if (!message) {
    return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan.', code: 'NOT_FOUND' });
  }

  message.status = status.toUpperCase();

  res.json({
    success: true,
    status: message.status
  });
});

module.exports = router;
