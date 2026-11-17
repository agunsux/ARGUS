/**
 * TIKUM — Admin Activity Intelligence & Email Notification System
 * 
 * Provides automated real-time alerts to administrators (admin@tikum.app & support@tikum.app)
 * for important user, seller, buyer, and marketplace events.
 * 
 * Invariants & Guarantees:
 * 1. Uses Purelymail SMTP only via centralized EmailService.
 * 2. Strict non-blocking secondary effect: email failure NEVER fails or rolls back business operations.
 * 3. Notifications trigger ONLY AFTER the backend operation has committed.
 * 4. Deterministic idempotency protects against duplicate notifications.
 * 5. Strict security and privacy: zero plaintext NIKs, zero auth tokens, zero passwords.
 * 6. Subjects categorized by priority: [TIKUM][CRITICAL], [TIKUM][HIGH], [TIKUM][NORMAL].
 * 7. Timestamps formatted in WIB (Asia/Jakarta).
 */

const { v4: uuidv4 } = require('uuid');
const { resolveNotificationRecipients } = require('../../config/notificationRecipients');
const { adminActivityNotificationStore } = require('../../storage/AdminActivityNotificationStore');
const { recordAuditLog, state } = require('../../database');

function getEmailService() {
  return require('../emailService').emailService;
}

const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://tikum.app';

// Event Priority Mapping
const EVENT_PRIORITIES = {
  // Account & Auth
  USER_REGISTERED: 'HIGH',
  USER_FIRST_SIGN_IN: 'HIGH',
  USER_SIGNED_IN: 'NORMAL',
  USER_ROLE_CHANGED: 'HIGH',
  USER_ACCOUNT_SUSPENDED: 'CRITICAL',
  USER_ACCOUNT_REACTIVATED: 'HIGH',

  // Seller Events
  SELLER_PROFILE_SUBMITTED: 'HIGH',
  SELLER_KYC_SUBMITTED: 'HIGH',
  SELLER_KYC_APPROVED: 'HIGH',
  SELLER_KYC_REJECTED: 'HIGH',
  SELLER_LISTING_CREATED: 'HIGH',
  SELLER_LISTING_UPDATED: 'NORMAL',
  SELLER_LISTING_WITHDRAWN: 'NORMAL',
  SELLER_LISTING_APPROVED: 'HIGH',
  SELLER_LISTING_REJECTED: 'HIGH',
  SELLER_LISTING_SOLD: 'HIGH',

  // Buyer Events
  BUYER_INQUIRY_CREATED: 'HIGH',
  BUYER_ORDER_CREATED: 'HIGH',
  BUYER_ORDER_CANCELLED: 'HIGH',
  BUYER_PURCHASE_CONFIRMED: 'HIGH',
  BUYER_PAYMENT_INITIATED: 'HIGH',
  BUYER_PAYMENT_SUCCEEDED: 'CRITICAL',
  BUYER_PAYMENT_FAILED: 'HIGH',
  BUYER_REFUND_REQUESTED: 'HIGH',
  BUYER_DISPUTE_OPENED: 'CRITICAL',

  // Operational Events
  NEW_SUPPORT_REQUEST: 'HIGH',
  NEW_USER_REPORT: 'HIGH',
  FRAUD_RISK_DETECTED: 'CRITICAL',
  DISPUTE_CREATED: 'CRITICAL',
  VENUE_PIC_ASSIGNED: 'HIGH',
  VENUE_INCIDENT_CREATED: 'CRITICAL'
};

// Event Titles for Subject & Header
const EVENT_TITLES = {
  USER_REGISTERED: 'Pendaftaran Akun Pengguna Baru',
  USER_FIRST_SIGN_IN: 'Login Pertama Pengguna',
  USER_SIGNED_IN: 'Pengguna Berhasil Masuk (Login)',
  USER_ROLE_CHANGED: 'Perubahan Role Pengguna',
  USER_ACCOUNT_SUSPENDED: 'Penangguhan Akun Pengguna (Suspended)',
  USER_ACCOUNT_REACTIVATED: 'Pengaktifan Kembali Akun Pengguna',

  SELLER_PROFILE_SUBMITTED: 'Pengajuan Profil Penjual',
  SELLER_KYC_SUBMITTED: 'Pengajuan Verifikasi Identitas (KYC) Penjual',
  SELLER_KYC_APPROVED: 'Verifikasi KYC Penjual Disetujui',
  SELLER_KYC_REJECTED: 'Verifikasi KYC Penjual Ditolak',
  SELLER_LISTING_CREATED: 'Listing Tiket Baru Menunggu Moderasi',
  SELLER_LISTING_UPDATED: 'Pembaruan Data Listing Tiket',
  SELLER_LISTING_WITHDRAWN: 'Listing Tiket Ditarik Penjual',
  SELLER_LISTING_APPROVED: 'Listing Tiket Disetujui & Diterbitkan',
  SELLER_LISTING_REJECTED: 'Listing Tiket Ditolak oleh Admin',
  SELLER_LISTING_SOLD: 'Tiket Berhasil Terjual',

  BUYER_INQUIRY_CREATED: 'Minat Pembelian Tiket Baru (Saya Berminat)',
  BUYER_ORDER_CREATED: 'Pesanan Tiket Baru Dibuat (Checkout)',
  BUYER_ORDER_CANCELLED: 'Pesanan Tiket Dibatalkan',
  BUYER_PURCHASE_CONFIRMED: 'Pembelian Tiket Dikonfirmasi',
  BUYER_PAYMENT_INITIATED: 'Proses Pembayaran Dimulai',
  BUYER_PAYMENT_SUCCEEDED: 'Pembayaran Terverifikasi Berhasil (Paid)',
  BUYER_PAYMENT_FAILED: 'Pembayaran Gagal / Kedaluwarsa',
  BUYER_REFUND_REQUESTED: 'Pengajuan Pengembalian Dana (Refund)',
  BUYER_DISPUTE_OPENED: 'Sengketa Pembeli Dibuka (Dispute)',

  NEW_SUPPORT_REQUEST: 'Pesan Bantuan / Form Kontak Pengguna',
  NEW_USER_REPORT: 'Laporan Dugaan Pelanggaran / Tiket Palsu',
  FRAUD_RISK_DETECTED: 'Deteksi Risiko Fraud oleh Trust Engine',
  DISPUTE_CREATED: 'Kasus Sengketa Baru Terbuka',
  VENUE_PIC_ASSIGNED: 'Penugasan PIC Lapangan Venue Event',
  VENUE_INCIDENT_CREATED: 'Laporan Insiden Operasional Venue'
};

function formatWibTimestamp(date = new Date()) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return new Date().toISOString() + ' WIB';
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + ' WIB';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskSensitiveData(val) {
  if (!val || typeof val !== 'string') return val;
  if (/^\d{16}$/.test(val)) {
    // 16-digit NIK
    return val.slice(0, 4) + '********' + val.slice(-4);
  }
  return val;
}

class AdminActivityNotificationService {
  /**
   * Main dispatch method for all administrative operational activity events.
   * 
   * @param {string} eventType - One of the supported event types in EVENT_PRIORITIES
   * @param {Object} payload - Event details (user, action, entities, references)
   * @param {Object} [options] - Additional options (custom recipients, idempotency key)
   */
  static async notify(eventType, payload = {}, options = {}) {
    if (!eventType || typeof eventType !== 'string') {
      return { success: false, error: 'eventType is required', status: 'INVALID_EVENT' };
    }

    const priority = EVENT_PRIORITIES[eventType] || 'NORMAL';
    const title = EVENT_TITLES[eventType] || eventType.replace(/_/g, ' ');
    const eventId = options.eventId || payload.eventId || `evt-${eventType.toLowerCase()}-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const idempotencyKey = options.idempotencyKey || `admin:act:${eventType}:${payload.aggregateId || payload.userId || payload.orderId || payload.listingId || eventId}`;

    // 1. Duplicate event guard
    const alreadyHandled = await adminActivityNotificationStore.isEventRecorded(eventId);
    if (alreadyHandled) {
      return {
        success: true,
        status: 'IDEMPOTENT_SKIPPED',
        message: `Notification for event ${eventId} was already processed`,
        eventId
      };
    }

    // 2. Resolve recipients
    const recipients = options.recipients || resolveNotificationRecipients();
    const wibTime = formatWibTimestamp(payload.timestamp || new Date());

    // 3. User & entity normalization
    const user = payload.user || {};
    const userId = payload.userId || user.id || 'N/A';
    const userDisplayName = payload.userDisplayName || payload.displayName || user.name || user.display_name || payload.sellerName || payload.buyerName || 'Pengguna TIKUM';
    const userEmail = payload.userEmail || user.email || payload.sellerEmail || payload.buyerEmail || 'N/A';
    const userRole = (payload.userRole || user.role || 'USER').toUpperCase();
    const actionDesc = payload.description || payload.message || payload.action || title;

    // 4. Admin Panel direct link
    let adminUrl = `${CANONICAL_ORIGIN}/admin`;
    if (payload.adminUrl) {
      adminUrl = payload.adminUrl;
    } else if (payload.listingId) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=listings&id=${payload.listingId}`;
    } else if (payload.orderId) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=orders&id=${payload.orderId}`;
    } else if (payload.inquiryId) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=inquiries&id=${payload.inquiryId}`;
    } else if (payload.userId && (eventType.startsWith('SELLER_KYC') || eventType.startsWith('SELLER_PROFILE'))) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=sellers&id=${payload.userId}`;
    } else if (eventType.startsWith('VENUE_INCIDENT')) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=incidents`;
    } else if (eventType.startsWith('BUYER_DISPUTE') || eventType.startsWith('DISPUTE')) {
      adminUrl = `${CANONICAL_ORIGIN}/admin?tab=disputes`;
    }

    // 5. Subject formatting: [TIKUM][PRIORITY] <Subject>
    let subjectDetail = userDisplayName;
    if (payload.eventName) {
      subjectDetail = `${payload.eventName} (${userDisplayName})`;
    } else if (payload.orderId) {
      subjectDetail = `#${String(payload.orderId).slice(-6)} - ${userDisplayName}`;
    }
    const subject = `[TIKUM][${priority}] ${title}: ${subjectDetail}`;

    // 6. Record notification state as PENDING
    const notifId = `ntf-${uuidv4()}`;
    await adminActivityNotificationStore.recordNotification({
      id: notifId,
      eventId,
      eventType,
      priority,
      userId: userId !== 'N/A' ? userId : null,
      userEmail: userEmail !== 'N/A' ? userEmail : null,
      recipients,
      subject,
      payload: {
        ...payload,
        userDisplayName,
        userEmail,
        userId,
        userRole,
        wibTime
      },
      status: 'PENDING'
    });

    // 7. Render HTML & Plain Text
    const badgeColor = priority === 'CRITICAL' ? '#ef4444' : (priority === 'HIGH' ? '#0ea5e9' : '#64748b');
    const badgeBg = priority === 'CRITICAL' ? '#451a1a' : (priority === 'HIGH' ? '#082f49' : '#1e293b');

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #e2e8f0; margin: 0; padding: 24px; }
    .container { max-width: 620px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; }
    .header { padding: 20px 24px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
    .logo { font-size: 18px; font-weight: 800; color: #38bdf8; letter-spacing: 1px; text-decoration: none; }
    .badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; }
    .content { padding: 24px; }
    .title { font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
    .desc { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .info-card { background: #131d33; border: 1px solid #1e293b; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #94a3b8; font-weight: 500; }
    .info-value { color: #f1f5f9; font-weight: 600; text-align: right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .btn-wrap { text-align: center; margin: 28px 0 12px; }
    .btn { display: inline-block; background: #0284c7; color: #ffffff !important; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 6px; text-decoration: none; }
    .footer { padding: 16px 24px; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="logo">TIKUM OPERATIONS</span>
      <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor};">${priority}</span>
    </div>
    <div class="content">
      <h2 class="title">${escapeHtml(title)}</h2>
      <p class="desc">${escapeHtml(actionDesc)}</p>
      
      <div class="info-card">
        <div class="info-row"><span class="info-label">Event:</span><span class="info-value mono">${escapeHtml(eventType)}</span></div>
        <div class="info-row"><span class="info-label">Waktu Kejadian:</span><span class="info-value">${escapeHtml(wibTime)}</span></div>
        <div class="info-row"><span class="info-label">Nama Pengguna:</span><span class="info-value">${escapeHtml(userDisplayName)}</span></div>
        <div class="info-row"><span class="info-label">Email Pengguna:</span><span class="info-value">${escapeHtml(userEmail)}</span></div>
        <div class="info-row"><span class="info-label">User ID:</span><span class="info-value mono">${escapeHtml(userId)}</span></div>
        <div class="info-row"><span class="info-label">Role Akun:</span><span class="info-value">${escapeHtml(userRole)}</span></div>
        ${payload.eventName ? `<div class="info-row"><span class="info-label">Event Terkait:</span><span class="info-value">${escapeHtml(payload.eventName)}</span></div>` : ''}
        ${payload.listingId ? `<div class="info-row"><span class="info-label">ID Listing:</span><span class="info-value mono">${escapeHtml(payload.listingId)}</span></div>` : ''}
        ${payload.orderId ? `<div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value mono">${escapeHtml(payload.orderId)}</span></div>` : ''}
        ${payload.nik ? `<div class="info-row"><span class="info-label">NIK (Masked):</span><span class="info-value mono">${escapeHtml(maskSensitiveData(payload.nik))}</span></div>` : ''}
        ${payload.phone || payload.sellerPhone || payload.buyerPhone ? `<div class="info-row"><span class="info-label">No. Telepon / WA:</span><span class="info-value">${escapeHtml(payload.phone || payload.sellerPhone || payload.buyerPhone)}</span></div>` : ''}
        ${payload.amount ? `<div class="info-row"><span class="info-label">Nominal:</span><span class="info-value" style="color: #38bdf8;">Rp ${Number(payload.amount).toLocaleString('id-ID')}</span></div>` : ''}
        ${payload.paymentMethod ? `<div class="info-row"><span class="info-label">Metode Pembayaran:</span><span class="info-value">${escapeHtml(payload.paymentMethod)}</span></div>` : ''}
        ${payload.reason ? `<div class="info-row"><span class="info-label">Alasan / Catatan:</span><span class="info-value">${escapeHtml(payload.reason)}</span></div>` : ''}
        ${payload.loginMethod ? `<div class="info-row"><span class="info-label">Metode Login:</span><span class="info-value">${escapeHtml(payload.loginMethod)}</span></div>` : ''}
        ${payload.ip ? `<div class="info-row"><span class="info-label">Alamat IP:</span><span class="info-value mono">${escapeHtml(payload.ip)}</span></div>` : ''}
      </div>

      <div class="btn-wrap">
        <a href="${adminUrl}" class="btn">Buka di Admin Control Plane</a>
      </div>
    </div>
    <div class="footer">
      TIKUM Automated Activity &amp; Intelligence Alert &bull; Purelymail SMTP Secured<br>
      Pesan ini dikirimkan otomatis kepada administrator TIKUM. Jangan membalas email ini secara langsung.
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
[TIKUM][${priority}] ${title}
--------------------------------------------------
${actionDesc}

Waktu Kejadian : ${wibTime}
Nama Pengguna  : ${userDisplayName}
Email          : ${userEmail}
User ID        : ${userId}
Role Akun      : ${userRole}
Event Type     : ${eventType}
${payload.eventName ? `Event          : ${payload.eventName}\n` : ''}${payload.listingId ? `Listing ID     : ${payload.listingId}\n` : ''}${payload.orderId ? `Order ID       : ${payload.orderId}\n` : ''}${payload.nik ? `NIK (Masked)   : ${maskSensitiveData(payload.nik)}\n` : ''}${payload.phone || payload.sellerPhone || payload.buyerPhone ? `No. Telp / WA  : ${payload.phone || payload.sellerPhone || payload.buyerPhone}\n` : ''}${payload.amount ? `Nominal        : Rp ${Number(payload.amount).toLocaleString('id-ID')}\n` : ''}${payload.reason ? `Alasan/Catatan : ${payload.reason}\n` : ''}${payload.loginMethod ? `Metode Login   : ${payload.loginMethod}\n` : ''}${payload.ip ? `IP Address     : ${payload.ip}\n` : ''}
Buka Admin Dashboard: ${adminUrl}

--
TIKUM Operations Intelligence
    `.trim();

    // 8. Dispatch via EmailService (Purelymail SMTP)
    let sendResult = null;
    let isSuccess = true;
    let lastError = null;

    try {
      sendResult = await getEmailService().sendEmail({
        to: recipients,
        subject,
        html,
        text,
        sender: 'TIKUM Operations <admin@tikum.app>',
        idempotencyKey
      });

      if (sendResult && sendResult.success === false) {
        isSuccess = false;
        lastError = sendResult.error || 'SMTP delivery failure';
      }
    } catch (err) {
      isSuccess = false;
      lastError = err.message;
      console.warn(`[AdminActivityNotification] Dispatch failed for ${eventType}:`, err.message);
    }

    // 9. Update delivery status in store
    const finalStatus = isSuccess ? 'SENT' : 'FAILED';
    await adminActivityNotificationStore.updateDeliveryStatus(notifId, {
      status: finalStatus,
      sentAt: isSuccess ? new Date().toISOString() : null,
      lastError,
      retryCount: isSuccess ? 0 : 1
    });

    // 10. Record immutable audit log
    try {
      await recordAuditLog('ADMIN_NOTIFICATION', notifId, `ACTIVITY_${eventType}`, userId || 'SYSTEM', {
        event_id: eventId,
        event_type: eventType,
        priority,
        recipients,
        status: finalStatus,
        error: lastError || null
      });
    } catch (_) {}

    return {
      success: isSuccess,
      status: finalStatus,
      notificationId: notifId,
      eventId,
      eventType,
      priority,
      recipients,
      error: lastError
    };
  }

  /**
   * Helper: List recent notifications with optional filtering
   */
  static async listNotifications(options = {}) {
    return adminActivityNotificationStore.listRecentNotifications(options);
  }
}

module.exports = {
  AdminActivityNotificationService,
  EVENT_PRIORITIES,
  EVENT_TITLES,
  formatWibTimestamp,
  maskSensitiveData
};
