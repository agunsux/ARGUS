/**
 * TIKUM Transactional Email Templates
 * 
 * Branded transactional templates for TIKUM (tikum.app) by SHINERVA HQ.
 * Every template provides both HTML and Plain-Text representations,
 * compliant with anti-spam, DKIM/SPF standards, and canonical brand footer.
 */

const { businessProfile } = require('../config/businessProfile');

const BRAND_NAME = 'TIKUM';
const CANONICAL_ORIGIN = businessProfile.canonicalOrigin || 'https://tikum.app';
const SUPPORT_EMAIL = businessProfile.supportEmail || 'support@tikum.app';
const ADMIN_EMAIL = businessProfile.adminEmail || 'admin@tikum.app';
const HELLO_EMAIL = businessProfile.helloEmail || 'hello@tikum.app';
const NO_REPLY_EMAIL = process.env.EMAIL_NO_REPLY || 'no-reply@tikum.app';

/**
 * Sanitize and escape HTML strings to prevent HTML / XSS injection into emails
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared HTML wrapper providing consistent styling and legal footer
 */
function wrapHtml({ title, preheader, content, actionButton = null, locale = 'id' }) {
  const isEn = locale === 'en';
  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'id'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; margin-top: 24px; margin-bottom: 24px; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 32px; border-bottom: 1px solid #334155; text-align: left; }
    .brand-title { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; margin: 0; }
    .brand-subtitle { font-size: 11px; color: #06b6d4; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; font-weight: 600; }
    .body-content { padding: 32px; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 4px; margin-bottom: 16px; }
    .badge-success { background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-info { background-color: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
    .badge-warning { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .info-card { background-color: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 18px 20px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #2d3748; font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #94a3b8; font-weight: 500; }
    .info-value { color: #f8fafc; font-weight: 600; text-align: right; }
    .btn-action { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 20px 0 10px; }
    .footer { background-color: #0b0f19; padding: 24px 32px; border-top: 1px solid #1e293b; color: #64748b; font-size: 11px; line-height: 1.6; }
    .footer a { color: #06b6d4; text-decoration: none; }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${preheader || title}</div>
  <div class="email-container">
    <div class="header">
      <div class="brand-title">TIKUM</div>
      <div class="brand-subtitle">${isEn ? 'Verified Ticket Marketplace • Transactions Protected' : 'Verified Ticket Marketplace &bull; Transaksi Terlindungi'}</div>
    </div>
    <div class="body-content">
      ${content}
      ${actionButton ? `<div style="text-align: center;"><a href="${actionButton.url}" class="btn-action">${actionButton.text}</a></div>` : ''}
    </div>
    <div class="footer">
      <div style="font-weight: 700; color: #94a3b8; margin-bottom: 4px;">TIKUM &mdash; Verified Ticket Marketplace by SHINERVA</div>
      <div>${isEn ? 'Official website:' : 'Website resmi:'} <a href="${CANONICAL_ORIGIN}">${CANONICAL_ORIGIN}</a></div>
      <div>${isEn ? 'Help & Support:' : 'Bantuan &amp; Dukungan:'} <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
      <div style="margin-top: 8px;">${isEn ? 'Operational Office:' : 'Kantor Operasional:'} ${businessProfile.address?.entity || 'SHINERVA HQ'}, ${businessProfile.address?.street || 'Jl. Pasirluyu No. 79'}, ${businessProfile.address?.city || 'Bandung'} ${businessProfile.address?.postalCode || '40254'}, Indonesia.</div>
      <div style="margin-top: 8px; color: #475569;">${isEn ? 'This email was sent automatically by the TIKUM system regarding your account or transaction activity.' : 'Email ini dikirim otomatis oleh sistem TIKUM terkait aktivitas akun atau transaksi Anda.'}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Shared Plain-Text wrapper providing consistent layout and legal footer
 */
function wrapText({ title, content, actionUrl = null, locale = 'id' }) {
  const isEn = locale === 'en';
  return `[TIKUM — VERIFIED TICKET MARKETPLACE]
${title}
==================================================

${content}

${actionUrl ? `${isEn ? 'View Details' : 'Lihat Detail'}: ${actionUrl}\n\n` : ''}==================================================
TIKUM — Verified Ticket Marketplace by SHINERVA
${isEn ? 'Official website' : 'Website resmi'}: ${CANONICAL_ORIGIN}
${isEn ? 'Support' : 'Bantuan'}: ${SUPPORT_EMAIL}
${isEn ? 'Operational Office' : 'Kantor Operasional'}: ${businessProfile.address?.entity || 'SHINERVA HQ'}, ${businessProfile.address?.street || 'Jl. Pasirluyu No. 79'}, ${businessProfile.address?.city || 'Bandung'} ${businessProfile.address?.postalCode || '40254'}, Indonesia.
`;
}

const TEMPLATES = {
  // ===========================================================================
  // ACCOUNT / AUTH
  // ===========================================================================
  ACCOUNT_WELCOME: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Welcome to TIKUM, ${d.name || 'User'}!`
      : `Selamat Datang di TIKUM, ${d.name || 'Pengguna'}!`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Welcome to TIKUM' : 'Selamat Datang di TIKUM';
      const content = isEn ? `
        <span class="badge badge-success">Account Created Successfully</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Hello, ${d.name || 'User'}!</h2>
        <p>Your TIKUM account is now active. You can now discover verified secondary tickets protected by an internal escrow vault and physical gate assistance.</p>
        <p>Always prioritize your account security and never share your passwords or OTPs with anyone.</p>
      ` : `
        <span class="badge badge-success">Akun Berhasil Dibuat</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Halo, ${d.name || 'Pengguna'}!</h2>
        <p>Akun TIKUM Anda telah aktif. Anda kini dapat mencari tiket sekunder terverifikasi dengan jaminan rekening bersama (escrow) dan pendampingan fisik di venue.</p>
        <p>Prioritaskan selalu keamanan akun Anda dan jangan pernah membagikan password atau OTP kepada siapa pun.</p>
      `;
      const textContent = isEn
        ? `Hello ${d.name || 'User'},\n\nYour TIKUM account is now active. You can now discover verified tickets protected by escrow and on-site gate assistance.`
        : `Halo ${d.name || 'Pengguna'},\n\nAkun TIKUM Anda telah aktif. Anda kini dapat mencari tiket terverifikasi dengan proteksi escrow dan verifikasi gate fisik.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? 'Your TIKUM account is now active' : 'Akun TIKUM Anda telah aktif', content, actionButton: { text: isEn ? 'Explore Events' : 'Jelajahi Event', url: `${CANONICAL_ORIGIN}/events` }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events`, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  ACCOUNT_VERIFICATION: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en')) ? 'TIKUM Account Verification Code' : 'Kode Verifikasi Akun TIKUM',
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'TIKUM Email Verification' : 'Verifikasi Email TIKUM';
      const content = isEn ? `
        <span class="badge badge-info">Security Verification</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Your Verification Code</h2>
        <p>Use the verification code below to complete your TIKUM sign up or account verification process:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #22d3ee; background: #1e293b; padding: 12px 24px; border-radius: 6px; border: 1px solid #334155;">${d.code || '------'}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">This code is valid for 15 minutes. If you did not request this code, you can safely ignore this email.</p>
      ` : `
        <span class="badge badge-info">Verifikasi Keamanan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Kode Verifikasi Anda</h2>
        <p>Gunakan kode verifikasi di bawah ini untuk menyelesaikan proses pendaftaran atau verifikasi akun TIKUM Anda:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #22d3ee; background: #1e293b; padding: 12px 24px; border-radius: 6px; border: 1px solid #334155;">${d.code || '------'}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Kode ini berlaku selama 15 menit. Jika Anda tidak merasa meminta kode ini, abaikan email ini.</p>
      `;
      const textContent = isEn
        ? `Your TIKUM verification code is: ${d.code || '------'}\n\nThis code is valid for 15 minutes.`
        : `Kode verifikasi akun TIKUM Anda adalah: ${d.code || '------'}\n\nKode ini berlaku selama 15 menit.`;
      return {
        html: wrapHtml({ title, preheader: `${isEn ? 'TIKUM Verification Code:' : 'Kode Verifikasi TIKUM:'} ${d.code}`, content, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  PASSWORD_RESET: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? 'TIKUM Account Password Reset Request'
      : 'Permintaan Reset Password Akun TIKUM',
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Account Password Reset' : 'Reset Password Akun';
      const resetUrl = d.resetUrl || `${CANONICAL_ORIGIN}/auth/reset-password?token=${d.token || ''}`;
      const content = isEn ? `
        <span class="badge badge-warning">Security Notice</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Password Reset Request</h2>
        <p>We received a request to reset your TIKUM account password. Click the button below to set a new password:</p>
        <p style="color: #94a3b8; font-size: 12px;">This reset link is valid for 30 minutes for your account security.</p>
      ` : `
        <span class="badge badge-warning">Pemberitahuan Keamanan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Permintaan Reset Password</h2>
        <p>Kami menerima permintaan untuk mereset password akun TIKUM Anda. Klik tombol di bawah ini untuk membuat password baru:</p>
        <p style="color: #94a3b8; font-size: 12px;">Tautan reset ini hanya berlaku selama 30 menit demi keamanan akun Anda.</p>
      `;
      const textContent = isEn
        ? `TIKUM account password reset request received.\n\nPlease visit the following link to create a new password:\n${resetUrl}\n\nLink is valid for 30 minutes.`
        : `Permintaan reset password akun TIKUM diterima.\n\nSilakan kunjungi tautan berikut untuk membuat password baru:\n${resetUrl}\n\nTautan berlaku selama 30 menit.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? 'Reset your TIKUM account password' : 'Reset password akun TIKUM Anda', content, actionButton: { text: isEn ? 'Reset Password' : 'Reset Password', url: resetUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: resetUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // MARKETPLACE / ORDER
  // ===========================================================================
  ORDER_CREATED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Order Created #${d.orderId || ''} — Awaiting Payment`
      : `Pesanan Dibuat #${d.orderId || ''} — Menunggu Pembayaran`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `Order #${d.orderId || ''} Created` : `Pesanan #${d.orderId || ''} Dibuat`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-warning">Awaiting Payment</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Your Order Has Been Recorded</h2>
        <p>The ticket is held temporarily in reserved status. Please complete payment to lock funds securely into the TIKUM Escrow Vault.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Ticket Category:</span><span class="info-value">${d.ticketCategory || '-'}</span></div>
          <div class="info-row"><span class="info-label">Total Payment:</span><span class="info-value" style="color: #34d399;">Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}</span></div>
        </div>
      ` : `
        <span class="badge badge-warning">Menunggu Pembayaran</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Pesanan Anda Telah Dicatat</h2>
        <p>Tiket telah diamankan sementara dalam status reservasi. Silakan selesaikan pembayaran untuk mengunci dana ke dalam Rekening Bersama (Escrow) TIKUM.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Kategori Tiket:</span><span class="info-value">${d.ticketCategory || '-'}</span></div>
          <div class="info-row"><span class="info-label">Total Pembayaran:</span><span class="info-value" style="color: #34d399;">Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}</span></div>
        </div>
      `;
      const textContent = isEn
        ? `Order #${d.orderId || ''} successfully created.\nEvent: ${d.eventTitle || '-'}\nTotal: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}\nStatus: Awaiting Payment.`
        : `Pesanan #${d.orderId || ''} berhasil dibuat.\nEvent: ${d.eventTitle || '-'}\nTotal: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}\nStatus: Menunggu Pembayaran.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Order #${d.orderId} created. Total: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}` : `Pesanan #${d.orderId} dibuat. Total: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}`, content, actionButton: { text: isEn ? 'Proceed to Payment' : 'Lanjut ke Pembayaran', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  ORDER_STATUS_CHANGED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Order Status Update #${d.orderId || ''}: ${d.status || ''}`
      : `Update Status Pesanan #${d.orderId || ''}: ${d.status || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `Order #${d.orderId || ''} Update` : `Update Pesanan #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-info">Status Update</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Order Status Changed</h2>
        <p>Your order status has changed to: <strong>${d.status || ''}</strong>.</p>
        ${d.notes ? `<p style="color: #94a3b8; font-size: 13px;">Notes: ${d.notes}</p>` : ''}
      ` : `
        <span class="badge badge-info">Status Update</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Status Pesanan Berubah</h2>
        <p>Pesanan Anda telah mengalami perubahan status menjadi: <strong>${d.status || ''}</strong>.</p>
        ${d.notes ? `<p style="color: #94a3b8; font-size: 13px;">Keterangan: ${d.notes}</p>` : ''}
      `;
      const textContent = isEn
        ? `Order #${d.orderId || ''} status has been updated to: ${d.status || ''}.\n${d.notes ? `Notes: ${d.notes}\n` : ''}`
        : `Status pesanan #${d.orderId || ''} telah diperbarui menjadi: ${d.status || ''}.\n${d.notes ? `Catatan: ${d.notes}\n` : ''}`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Order #${d.orderId} status: ${d.status}` : `Status pesanan #${d.orderId}: ${d.status}`, content, actionButton: { text: isEn ? 'Track Order' : 'Pantau Pesanan', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // OFFERS
  // ===========================================================================
  OFFER_RECEIVED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `New Offer Received: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}`
      : `Tawaran Baru Diterima: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'New Offer Received' : 'Tawaran Baru Diterima';
      const offerUrl = `${CANONICAL_ORIGIN}/offers`;
      const content = isEn ? `
        <span class="badge badge-info">Incoming Offer</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">You Have an Offer for Your Ticket</h2>
        <p>A prospective buyer has submitted a structured offer for your ticket listing:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Original Price:</span><span class="info-value">Rp ${(d.originalPrice || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Offered Price:</span><span class="info-value" style="color: #38bdf8;">Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}</span></div>
        </div>
        <p>You can accept, reject, or submit a counter offer before it expires.</p>
      ` : `
        <span class="badge badge-info">Penawaran Masuk</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Ada Tawaran untuk Tiket Anda</h2>
        <p>Seorang calon pembeli telah mengajukan tawaran terstruktur untuk listing tiket Anda:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Harga Listing Asli:</span><span class="info-value">Rp ${(d.originalPrice || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Harga Ditawar:</span><span class="info-value" style="color: #38bdf8;">Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}</span></div>
        </div>
        <p>Anda dapat menerima, menolak, atau memberikan tawaran balik (counter offer) sebelum tawaran kedaluwarsa.</p>
      `;
      const textContent = isEn
        ? `New offer for your ticket!\nEvent: ${d.eventTitle || '-'}\nOffered price: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}\nOpen dashboard to respond.`
        : `Tawaran baru untuk tiket Anda!\nEvent: ${d.eventTitle || '-'}\nHarga ditawar: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}\nBuka dashboard untuk merespons.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `New offer Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} received` : `Tawaran baru Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} masuk`, content, actionButton: { text: isEn ? 'Open Offers Dashboard' : 'Buka Dashboard Tawaran', url: offerUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: offerUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  OFFER_ACCEPTED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Your Offer was Accepted! Order #${d.orderId || ''}`
      : `Tawaran Anda Diterima! Pesanan #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Offer Accepted' : 'Tawaran Diterima';
      const payUrl = `${CANONICAL_ORIGIN}/pay/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Offer Accepted by Seller</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Congratulations! The Seller Accepted Your Offer</h2>
        <p>Your offer of <strong>Rp ${(d.finalPrice || 0).toLocaleString('id-ID')}</strong> has been approved. Please complete payment to secure your ticket.</p>
      ` : `
        <span class="badge badge-success">Tawaran Diterima Penjual</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Selamat! Penjual Menerima Tawaran Anda</h2>
        <p>Tawaran Anda sebesar <strong>Rp ${(d.finalPrice || 0).toLocaleString('id-ID')}</strong> telah disetujui penjual. Silakan selesaikan pembayaran untuk mengamankan tiket Anda.</p>
      `;
      const textContent = isEn
        ? `Your offer of Rp ${(d.finalPrice || 0).toLocaleString('id-ID')} has been accepted!\nPlease complete payment to secure your ticket.`
        : `Tawaran Anda sebesar Rp ${(d.finalPrice || 0).toLocaleString('id-ID')} telah disetujui!\nSegera lakukan pembayaran untuk mengamankan tiket.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? 'Your offer was accepted by the seller' : 'Tawaran Anda diterima oleh penjual', content, actionButton: { text: isEn ? 'Pay Now' : 'Bayar Sekarang', url: payUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: payUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  OFFER_REJECTED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? 'Ticket Offer Update'
      : 'Pemberitahuan Tawaran Tiket',
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Offer Declined / Cancelled' : 'Tawaran Ditolak / Dibatalkan';
      const content = isEn ? `
        <span class="badge badge-warning">Offer Closed</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Offer Did Not Proceed</h2>
        <p>Your offer for <strong>${d.eventTitle || 'Event'}</strong> of Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} was declined or the listing was purchased at full price.</p>
      ` : `
        <span class="badge badge-warning">Tawaran Selesai</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Tawaran Tidak Dilanjutkan</h2>
        <p>Tawaran Anda untuk tiket <strong>${d.eventTitle || 'Event'}</strong> sebesar Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} telah ditolak atau dibatalkan karena listing terjual dengan harga penuh.</p>
      `;
      const textContent = isEn
        ? `Your offer for ${d.eventTitle || 'Event'} was declined or the listing was sold to another buyer.`
        : `Tawaran Anda untuk ${d.eventTitle || 'Event'} telah ditolak atau listing telah terjual ke pembeli lain.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? 'Ticket offer update' : 'Update tawaran tiket Anda', content, actionButton: { text: isEn ? 'Explore Events' : 'Cari Tiket Lain', url: `${CANONICAL_ORIGIN}/events` }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events`, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  COUNTER_OFFER: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Counter Offer from Seller: Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}`
      : `Tawaran Balik dari Penjual: Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Counter Offer Received' : 'Tawaran Balik Diterima';
      const offerUrl = `${CANONICAL_ORIGIN}/offers`;
      const content = isEn ? `
        <span class="badge badge-info">Counter Offer</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Seller Made a Counter Offer</h2>
        <p>The seller for <strong>${d.eventTitle || 'Event'}</strong> proposed a counter price of <strong>Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}</strong>.</p>
        <p>You can accept or decline this counter offer via the TIKUM application.</p>
      ` : `
        <span class="badge badge-info">Counter Offer</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Penjual Mengajukan Tawaran Balik</h2>
        <p>Penjual tiket <strong>${d.eventTitle || 'Event'}</strong> mengajukan penawaran harga sebesar <strong>Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}</strong>.</p>
        <p>Anda dapat menerima atau menolak tawaran balik ini melalui aplikasi TIKUM.</p>
      `;
      const textContent = isEn
        ? `The seller proposed a counter offer of Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} for ${d.eventTitle || 'Event'}.`
        : `Penjual mengajukan tawaran balik sebesar Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} untuk ${d.eventTitle || 'Event'}.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Counter offer Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} from seller` : `Tawaran balik Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} dari penjual`, content, actionButton: { text: isEn ? 'View Counter Offer' : 'Lihat Tawaran Balik', url: offerUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: offerUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // PAYMENT & ESCROW
  // ===========================================================================
  PAYMENT_INITIATED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Payment Instructions for Order #${d.orderId || ''}`
      : `Instruksi Pembayaran Pesanan #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Payment Instructions' : 'Instruksi Pembayaran';
      const payUrl = `${CANONICAL_ORIGIN}/pay/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-info">Awaiting Payment</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Complete Your Payment</h2>
        <p>Please complete payment via the official gateway before the time limit expires:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Amount:</span><span class="info-value" style="color: #34d399;">Rp ${(d.amount || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Method:</span><span class="info-value">${d.channel || 'iPaymu'}</span></div>
        </div>
      ` : `
        <span class="badge badge-info">Menunggu Pembayaran</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Selesaikan Pembayaran Anda</h2>
        <p>Silakan lakukan pembayaran melalui gateway pembayaran resmi iPaymu sebelum batas waktu habis:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Nominal:</span><span class="info-value" style="color: #34d399;">Rp ${(d.amount || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Metode:</span><span class="info-value">${d.channel || 'iPaymu'}</span></div>
        </div>
      `;
      const textContent = isEn
        ? `Payment instructions for order #${d.orderId || ''}.\nAmount: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nPay via: ${payUrl}`
        : `Instruksi pembayaran pesanan #${d.orderId || ''}.\nNominal: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nLakukan pembayaran via: ${payUrl}`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Payment instructions for order #${d.orderId}` : `Instruksi pembayaran pesanan #${d.orderId}`, content, actionButton: { text: isEn ? 'Pay Now' : 'Bayar Sekarang', url: payUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: payUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  PAYMENT_SUCCESSFUL: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Payment Received #${d.orderId || ''} — Funds Locked in Escrow`
      : `Pembayaran Diterima #${d.orderId || ''} — Dana Terkunci di Escrow`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Payment Successfully Received' : 'Pembayaran Berhasil Diterima';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Funds Safe in Escrow</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Your Payment Was Successful</h2>
        <p>Payment of <strong>Rp ${(d.amount || 0).toLocaleString('id-ID')}</strong> has been verified and securely locked in the TIKUM Escrow Vault.</p>
        <p>Funds will NOT be released to the seller before your successful entry at the venue with our Person in Charge (PIC).</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Escrow Status:</span><span class="info-value" style="color: #38bdf8;">ESCROWED (LOCKED)</span></div>
        </div>
      ` : `
        <span class="badge badge-success">Dana Aman di Escrow</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Pembayaran Anda Berhasil</h2>
        <p>Pembayaran sebesar <strong>Rp ${(d.amount || 0).toLocaleString('id-ID')}</strong> telah diverifikasi dan aman terkunci di Rekening Bersama (Escrow) TIKUM.</p>
        <p>Dana TIDAK AKAN dicairkan ke penjual sebelum Anda terbukti berhasil masuk ke venue event bersama Person in Charge (PIC) kami.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${d.eventTitle || '-'}</span></div>
          <div class="info-row"><span class="info-label">Status Escrow:</span><span class="info-value" style="color: #38bdf8;">ESCROWED (TERKUNCI)</span></div>
        </div>
      `;
      const textContent = isEn
        ? `Payment for order #${d.orderId || ''} verified.\nAmount: Rp ${(d.amount || 0).toLocaleString('id-ID')} safely held in TIKUM Escrow.\nEscrow Status: ESCROWED.`
        : `Pembayaran pesanan #${d.orderId || ''} berhasil diverifikasi.\nDana sebesar Rp ${(d.amount || 0).toLocaleString('id-ID')} aman tersimpan di Rekening Bersama TIKUM.\nStatus Escrow: ESCROWED.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Payment for order #${d.orderId} verified. Funds locked in Escrow.` : `Pembayaran pesanan #${d.orderId} diverifikasi. Dana terkunci di Escrow.`, content, actionButton: { text: isEn ? 'View Ticket & Entry Guide' : 'Buka Tiket & Panduan Masuk', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  PAYMENT_FAILED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Payment Failed / Expired #${d.orderId || ''}`
      : `Pembayaran Gagal / Kedaluwarsa #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Payment Unsuccessful' : 'Pembayaran Tidak Berhasil';
      const content = isEn ? `
        <span class="badge badge-warning">Payment Cancelled</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Payment Window Expired</h2>
        <p>Payment for order #${d.orderId || ''} was not verified or the time window expired. The ticket reservation has been released.</p>
      ` : `
        <span class="badge badge-warning">Pembayaran Batal</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Waktu Pembayaran Telah Habis</h2>
        <p>Pembayaran untuk pesanan #${d.orderId || ''} tidak berhasil diverifikasi atau telah melewati batas waktu yang ditentukan. Reservasi tiket telah dilepas kembali.</p>
      `;
      const textContent = isEn
        ? `Payment for order #${d.orderId || ''} unsuccessful or expired. Ticket reservation has been cancelled.`
        : `Pembayaran pesanan #${d.orderId || ''} tidak berhasil atau kedaluwarsa. Reservasi tiket telah dibatalkan.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Payment for order #${d.orderId} cancelled` : `Pembayaran pesanan #${d.orderId} batal`, content, actionButton: { text: isEn ? 'Browse Other Tickets' : 'Cari Tiket Lain', url: `${CANONICAL_ORIGIN}/events` }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events`, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // SELLER / BUYER OPERATIONAL
  // ===========================================================================
  SELLER_TICKET_SOLD: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Ticket Sold! Prepare Handover #${d.orderId || ''}`
      : `Tiket Terjual! Siapkan Penyerahan #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Your Ticket Has Been Sold' : 'Tiket Anda Telah Terjual';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Ticket Sold &amp; Escrow Locked</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Buyer Paid into Escrow</h2>
        <p>Your ticket for <strong>${d.eventTitle || '-'}</strong> has been purchased. Payment is locked securely in the TIKUM Escrow Vault.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Net Seller Earnings:</span><span class="info-value" style="color: #34d399;">Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}</span></div>
        </div>
        <p>Please prepare the ticket and coordinate with our Event PIC at the venue before showtime.</p>
      ` : `
        <span class="badge badge-success">Tiket Terjual & Escrow Terkunci</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Pembeli Telah Membayar ke Escrow</h2>
        <p>Tiket Anda untuk event <strong>${d.eventTitle || '-'}</strong> telah dibeli. Pembayaran telah terkunci di Rekening Bersama TIKUM.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Hasil Penjualan Bersih:</span><span class="info-value" style="color: #34d399;">Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}</span></div>
        </div>
        <p>Harap siapkan tiket dan koordinasikan dengan Event PIC di lokasi sebelum jadwal konser dimulai.</p>
      `;
      const textContent = isEn
        ? `Your ticket for ${d.eventTitle || '-'} has been sold!\nBuyer payment is securely locked in Escrow.\nNet earnings: Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}.`
        : `Tiket Anda untuk ${d.eventTitle || '-'} telah terjual!\nPembayaran pembeli aman terkunci di Escrow.\nHasil bersih: Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Ticket sold! Buyer funds locked in TIKUM Escrow.` : `Tiket terjual! Dana pembeli terkunci di Escrow TIKUM.`, content, actionButton: { text: isEn ? 'Handover Details' : 'Detail Penyerahan', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  BUYER_ENTRY_READY: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Venue Entry Guide #${d.orderId || ''} — TIKUM PIC Standby`
      : `Panduan Masuk Venue #${d.orderId || ''} — PIC TIKUM Standby`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Venue Entry Preparation' : 'Persiapan Masuk Venue';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-info">PIC Assistance Active</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Person in Charge (PIC) Ready at Gate</h2>
        <p>To ensure your ticket scans smoothly at the turnstile, a TIKUM PIC is stationed at the venue:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Venue:</span><span class="info-value">${d.venueName || '-'}</span></div>
          <div class="info-row"><span class="info-label">Gate Info:</span><span class="info-value">${d.gateInfo || '-'}</span></div>
          <div class="info-row"><span class="info-label">PIC Contact:</span><span class="info-value" style="color: #22d3ee;">${d.picContact || '-'}</span></div>
        </div>
        <p>Meet our PIC at the gate before scanning your ticket.</p>
      ` : `
        <span class="badge badge-info">Pendampingan PIC Aktif</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Person in Charge (PIC) Siap di Gate</h2>
        <p>Untuk memastikan tiket Anda 100% valid dan dapat discan di gerbang, PIC TIKUM telah ditugaskan di venue:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Venue:</span><span class="info-value">${d.venueName || '-'}</span></div>
          <div class="info-row"><span class="info-label">Gate Info:</span><span class="info-value">${d.gateInfo || '-'}</span></div>
          <div class="info-row"><span class="info-label">Kontak PIC:</span><span class="info-value" style="color: #22d3ee;">${d.picContact || '-'}</span></div>
        </div>
        <p>Temui PIC kami di gate sebelum melakukan scan tiket.</p>
      `;
      const textContent = isEn
        ? `Venue entry guide for order #${d.orderId || ''}.\nVenue: ${d.venueName || '-'}\nGate: ${d.gateInfo || '-'}\nPIC Contact: ${d.picContact || '-'}.`
        : `Panduan masuk venue untuk pesanan #${d.orderId || ''}.\nVenue: ${d.venueName || '-'}\nGate: ${d.gateInfo || '-'}\nKontak PIC: ${d.picContact || '-'}.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Venue entry guide with TIKUM PIC assistance` : `Panduan masuk venue dengan pendampingan PIC TIKUM`, content, actionButton: { text: isEn ? 'Open Entry Pass' : 'Buka Challenge Masuk', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // DISPUTE
  // ===========================================================================
  DISPUTE_OPENED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Dispute Notice #${d.orderId || ''} — Investigation Started`
      : `Pemberitahuan Sengketa #${d.orderId || ''} — Investigasi Dimulai`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Issue / Dispute Notice' : 'Laporan Kendala / Sengketa';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-warning">Escrow Frozen</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Gate Issue Report Received</h2>
        <p>A ticket issue was reported for order #${d.orderId || ''}. Funds in the Escrow Vault have been FROZEN automatically.</p>
        <p>Reason: <strong>${d.reason || 'Gate scan failure'}</strong></p>
        <p>Our Event PIC and Trust Officer Team are collecting physical turnstile logs and proof before a final determination.</p>
      ` : `
        <span class="badge badge-warning">Escrow Dibekukan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Laporan Masalah di Gate Diterima</h2>
        <p>Kendala tiket telah dilaporkan untuk pesanan #${d.orderId || ''}. Dana di Rekening Bersama (Escrow) telah DIBEKUKAN otomatis.</p>
        <p>Alasan: <strong>${d.reason || 'Kendala scan gate venue'}</strong></p>
        <p>Event PIC dan Tim Trust Officer TIKUM sedang mengumpulkan bukti fisik dan log turnstile sebelum keputusan diambil.</p>
      `;
      const textContent = isEn
        ? `Dispute opened for order #${d.orderId || ''}.\nEscrow funds frozen.\nReason: ${d.reason || 'Gate scan failure'}.\nInvestigation in progress.`
        : `Sengketa dibuka untuk pesanan #${d.orderId || ''}.\nDana escrow dibekukan.\nAlasan: ${d.reason || 'Kendala scan gate venue'}.\nInvestigasi sedang berlangsung.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Dispute opened for order #${d.orderId}. Escrow frozen.` : `Sengketa dibuka untuk pesanan #${d.orderId}. Escrow dibekukan.`, content, actionButton: { text: isEn ? 'View Dispute Status' : 'Lihat Status Sengketa', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  DISPUTE_STATUS_CHANGED: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Dispute Decision #${d.orderId || ''}: ${d.outcome || ''}`
      : `Keputusan Sengketa #${d.orderId || ''}: ${d.outcome || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Dispute Resolution' : 'Penyelesaian Sengketa';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-info">Final Decision</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Dispute Investigation Outcome</h2>
        <p>The investigation for dispute on order #${d.orderId || ''} has been resolved by the Trust Officer:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Outcome:</span><span class="info-value" style="color: #38bdf8;">${d.outcome || '-'}</span></div>
          <div class="info-row"><span class="info-label">Notes:</span><span class="info-value">${d.decisionNotes || '-'}</span></div>
        </div>
      ` : `
        <span class="badge badge-info">Keputusan Final</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Hasil Investigasi Sengketa</h2>
        <p>Investigasi atas sengketa pesanan #${d.orderId || ''} telah diselesaikan oleh Trust Officer:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Keputusan:</span><span class="info-value" style="color: #38bdf8;">${d.outcome || '-'}</span></div>
          <div class="info-row"><span class="info-label">Catatan:</span><span class="info-value">${d.decisionNotes || '-'}</span></div>
        </div>
      `;
      const textContent = isEn
        ? `Dispute decision for order #${d.orderId || ''}: ${d.outcome || '-'}.\nNotes: ${d.decisionNotes || '-'}.`
        : `Keputusan sengketa pesanan #${d.orderId || ''}: ${d.outcome || '-'}.\nCatatan: ${d.decisionNotes || '-'}.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Dispute decision for order #${d.orderId}: ${d.outcome}` : `Keputusan sengketa pesanan #${d.orderId}: ${d.outcome}`, content, actionButton: { text: isEn ? 'View Details' : 'Lihat Detail', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // SYSTEM & ADMIN
  // ===========================================================================
  SYSTEM_ALERT: {
    subject: (d) => `[TIKUM ALERT] ${d.title || 'Pemberitahuan Sistem'}`,
    render: (d) => {
      const title = d.title || 'Pemberitahuan Sistem';
      const content = `
        <span class="badge badge-warning">System Alert</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">${d.title || 'Pemberitahuan Operasional'}</h2>
        <p>${d.message || 'Pemberitahuan otomatis dari sistem TIKUM.'}</p>
        ${d.details ? `<pre style="background: #1e293b; padding: 12px; border-radius: 4px; font-size: 12px; color: #94a3b8; overflow-x: auto;">${JSON.stringify(d.details, null, 2)}</pre>` : ''}
      `;
      const textContent = `[TIKUM ALERT] ${d.title || 'Pemberitahuan Sistem'}\n\n${d.message || ''}\n\n${d.details ? JSON.stringify(d.details, null, 2) : ''}`;
      return {
        html: wrapHtml({ title, preheader: d.title, content }),
        text: wrapText({ title, content: textContent })
      };
    }
  },

  ADMIN_TEST: {
    subject: () => `[TIKUM TEST] Uji Pengiriman Email Operasional`,
    render: (d) => {
      const title = 'Uji Pengiriman Email Operasional';
      const content = `
        <span class="badge badge-success">Live Diagnostic Test</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Uji Coba Pengiriman Berhasil</h2>
        <p>Email ini dikirimkan melalui permintaan pengujian resmi oleh administrator TIKUM:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Diuji Oleh:</span><span class="info-value">${escapeHtml(d.adminId || 'admin-1')}</span></div>
          <div class="info-row"><span class="info-label">Waktu:</span><span class="info-value">${escapeHtml(new Date().toISOString())}</span></div>
          <div class="info-row"><span class="info-label">Provider Outbound:</span><span class="info-value">Resend Free (Zero-Cost)</span></div>
        </div>
      `;
      const textContent = `[TIKUM TEST] Uji Coba Pengiriman Berhasil.\nDiuji oleh: ${d.adminId || 'admin-1'}\nWaktu: ${new Date().toISOString()}`;
      return {
        html: wrapHtml({ title, preheader: 'Uji coba pengiriman email TIKUM berhasil', content }),
        text: wrapText({ title, content: textContent })
      };
    }
  },

  ADMIN_PASSWORD_RESET: {
    subject: () => `[TIKUM ADMIN] Permintaan Reset Password Administrator`,
    render: (d) => {
      const title = 'Reset Password Administrator';
      const resetUrl = d.resetUrl || `${CANONICAL_ORIGIN}/admin/login?reset_token=${d.token || d.resetToken || ''}`;
      const content = `
        <span class="badge badge-warning" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Akses Khusus Administrator</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Permintaan Reset Password Admin</h2>
        <p>Kami menerima permintaan untuk mereset kredensial akun administrator TIKUM (<strong>${escapeHtml(d.adminEmail || ADMIN_EMAIL)}</strong>).</p>
        <p>Klik tombol di bawah ini untuk mengatur ulang password administrator Anda:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Identitas Admin:</span><span class="info-value">${escapeHtml(d.adminEmail || ADMIN_EMAIL)}</span></div>
          <div class="info-row"><span class="info-label">Waktu Permintaan:</span><span class="info-value">${escapeHtml(d.requestedAt || new Date().toISOString())}</span></div>
          <div class="info-row"><span class="info-label">Masa Berlaku:</span><span class="info-value" style="color: #fbbf24;">30 Menit</span></div>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">PENTING: Jangan pernah membagikan tautan ini. Jika Anda tidak mengajukan permintaan ini, segera hubungi tim sekuritas.</p>
      `;
      const textContent = `[TIKUM ADMIN] Permintaan Reset Password Administrator\n\nIdentitas: ${d.adminEmail || ADMIN_EMAIL}\nBuka tautan berikut untuk mereset password:\n${resetUrl}\n\nTautan ini berlaku selama 30 menit.`;
      return {
        html: wrapHtml({ title, preheader: 'Reset password akun administrator TIKUM', content, actionButton: { text: 'Reset Password Admin', url: resetUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: resetUrl })
      };
    }
  },

  ADMIN_SECURITY_ALERT: {
    subject: (d) => `[TIKUM SECURITY ALERT] ${d.title || 'Peringatan Keamanan Administrator'}`,
    render: (d) => {
      const title = d.title || 'Peringatan Keamanan Administrator';
      const severity = (d.severity || 'CRITICAL').toUpperCase();
      const content = `
        <span class="badge" style="background-color: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444;">${escapeHtml(severity)} ALERT</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">${escapeHtml(d.title || 'Pemberitahuan Keamanan Sistem')}</h2>
        <p>${escapeHtml(d.message || 'Terdeteksi aktivitas kritis atau anomali pada sistem operasional TIKUM.')}</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Level Keparahan:</span><span class="info-value" style="color: #f87171;">${escapeHtml(severity)}</span></div>
          <div class="info-row"><span class="info-label">Waktu Deteksi:</span><span class="info-value">${escapeHtml(d.timestamp || new Date().toISOString())}</span></div>
          ${d.ip ? `<div class="info-row"><span class="info-label">IP Address:</span><span class="info-value">${escapeHtml(d.ip)}</span></div>` : ''}
          ${d.action ? `<div class="info-row"><span class="info-label">Tindakan:</span><span class="info-value">${escapeHtml(d.action)}</span></div>` : ''}
        </div>
        ${d.details ? `<pre style="background: #1e293b; padding: 12px; border-radius: 4px; font-size: 12px; color: #94a3b8; overflow-x: auto;">${escapeHtml(typeof d.details === 'string' ? d.details : JSON.stringify(d.details, null, 2))}</pre>` : ''}
      `;
      const textContent = `[TIKUM SECURITY ALERT] ${d.title || 'Peringatan Keamanan'}\nKeparahan: ${severity}\nWaktu: ${d.timestamp || new Date().toISOString()}\n\n${d.message || ''}\n\n${d.details ? (typeof d.details === 'string' ? d.details : JSON.stringify(d.details, null, 2)) : ''}`;
      return {
        html: wrapHtml({ title, preheader: `[ALERT] ${d.title || 'Security Alert'}`, content, actionButton: { text: 'Buka Admin Control Plane', url: `${CANONICAL_ORIGIN}/admin` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/admin` })
      };
    }
  },

  TICKET_DELIVERY: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Your Ticket is Ready for Download #${d.orderId || ''} — ${d.eventTitle || 'TIKUM Event'}`
      : `Tiket Anda Siap Diunduh #${d.orderId || ''} — ${d.eventTitle || 'Event TIKUM'}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `E-Ticket Ready for Download #${d.orderId || ''}` : `E-Ticket Siap Diunduh #${d.orderId || ''}`;
      const downloadUrl = d.downloadUrl || `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Ticket Ready &amp; Verified</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Your E-Ticket is Now Available</h2>
        <p>The e-ticket for order <strong>#${escapeHtml(d.orderId || '')}</strong> has been issued and is ready for download.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Category:</span><span class="info-value">${escapeHtml(d.ticketCategory || d.category || 'General Admission')}</span></div>
          <div class="info-row"><span class="info-label">Seat:</span><span class="info-value">${escapeHtml(d.seatInfo || 'Free Standing')}</span></div>
          <div class="info-row"><span class="info-label">Venue:</span><span class="info-value">${escapeHtml(d.venueName || '-')}</span></div>
        </div>
        <p>Save this e-ticket on your phone and present it to our TIKUM Event PIC at the venue gate for turnstile assistance.</p>
      ` : `
        <span class="badge badge-success">Tiket Siap &amp; Terverifikasi</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">E-Ticket Anda Telah Tersedia</h2>
        <p>E-Ticket untuk pesanan <strong>#${escapeHtml(d.orderId || '')}</strong> telah berhasil diterbitkan dan siap diunduh.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Kategori:</span><span class="info-value">${escapeHtml(d.ticketCategory || d.category || 'General Admission')}</span></div>
          <div class="info-row"><span class="info-label">Nomor Kursi:</span><span class="info-value">${escapeHtml(d.seatInfo || 'Free Standing')}</span></div>
          <div class="info-row"><span class="info-label">Venue:</span><span class="info-value">${escapeHtml(d.venueName || '-')}</span></div>
        </div>
        <p>Simpan e-ticket ini di ponsel Anda dan tunjukkan kepada Event PIC TIKUM saat berada di gerbang venue untuk pendampingan scan.</p>
      `;
      const textContent = isEn
        ? `E-Ticket Ready for Download!\nOrder ID: #${d.orderId || ''}\nEvent: ${d.eventTitle || '-'}\nCategory: ${d.ticketCategory || d.category || 'General Admission'}\nSeat: ${d.seatInfo || 'Free Standing'}\nDownload ticket at: ${downloadUrl}`
        : `E-Ticket Siap Diunduh!\nID Pesanan: #${d.orderId || ''}\nEvent: ${d.eventTitle || '-'}\nKategori: ${d.ticketCategory || d.category || 'General Admission'}\nKursi: ${d.seatInfo || 'Free Standing'}\nUnduh tiket di: ${downloadUrl}`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `E-Ticket for order #${d.orderId} ready for download` : `E-Ticket pesanan #${d.orderId} siap diunduh`, content, actionButton: { text: isEn ? 'Download E-Ticket' : 'Unduh E-Ticket', url: downloadUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: downloadUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  DELIVERY_CONFIRMATION: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Ticket Handover Confirmed #${d.orderId || ''}`
      : `Konfirmasi Penyerahan Tiket Selesai #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `Ticket Handover Completed #${d.orderId || ''}` : `Penyerahan Tiket Selesai #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Ticket Handover Validated</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Handover Successfully Validated</h2>
        <p>Ticket handover for order <strong>#${escapeHtml(d.orderId || '')}</strong> has been verified by the TIKUM system.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${escapeHtml(d.orderId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Verification Time:</span><span class="info-value">${escapeHtml(d.verifiedAt || new Date().toISOString())}</span></div>
          <div class="info-row"><span class="info-label">Escrow Status:</span><span class="info-value" style="color: #34d399;">READY FOR RELEASE TO SELLER</span></div>
        </div>
        <p>Thank you for transacting safely through the TIKUM platform.</p>
      ` : `
        <span class="badge badge-success">Tiket Berhasil Diserahkan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Serah Terima Tiket Berhasil Divalidasi</h2>
        <p>Penyerahan tiket untuk pesanan <strong>#${escapeHtml(d.orderId || '')}</strong> telah diverifikasi oleh sistem TIKUM.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${escapeHtml(d.orderId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Waktu Verifikasi:</span><span class="info-value">${escapeHtml(d.verifiedAt || new Date().toISOString())}</span></div>
          <div class="info-row"><span class="info-label">Status Escrow:</span><span class="info-value" style="color: #34d399;">SIAP DILEPAS KE PENJUAL</span></div>
        </div>
        <p>Terima kasih telah bertransaksi secara aman melalui platform TIKUM.</p>
      `;
      const textContent = isEn
        ? `Ticket Handover Confirmed #${d.orderId || ''}.\nEvent: ${d.eventTitle || '-'}\nTime: ${d.verifiedAt || new Date().toISOString()}\nEscrow Status: Ready for release.`
        : `Konfirmasi Penyerahan Tiket Selesai #${d.orderId || ''}.\nEvent: ${d.eventTitle || '-'}\nWaktu: ${d.verifiedAt || new Date().toISOString()}\nStatus Escrow: Siap dilepas.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Ticket handover for order #${d.orderId} verified` : `Penyerahan tiket pesanan #${d.orderId} selesai diverifikasi`, content, actionButton: { text: isEn ? 'View Transaction Status' : 'Lihat Status Transaksi', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  EVENT_CANCELLATION: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Event Cancellation Notice: ${d.eventTitle || 'TIKUM Event'}`
      : `Pemberitahuan Pembatalan Event: ${d.eventTitle || 'Event TIKUM'}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `Event Cancellation: ${d.eventTitle || 'Event'}` : `Pembatalan Event: ${d.eventTitle || 'Event'}`;
      const content = isEn ? `
        <span class="badge badge-warning" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Event Cancelled</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Event Officially Cancelled by Promoter</h2>
        <p>The official organizer has announced the cancellation of <strong>${escapeHtml(d.eventTitle || 'TIKUM Event')}</strong>.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Reason:</span><span class="info-value">${escapeHtml(d.cancellationReason || d.reason || 'Official promoter decision / force majeure')}</span></div>
          ${d.orderId ? `<div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${escapeHtml(d.orderId)}</span></div>` : ''}
          ${d.refundAmount ? `<div class="info-row"><span class="info-label">Refund Estimate:</span><span class="info-value" style="color: #34d399;">Rp ${(d.refundAmount || 0).toLocaleString('id-ID')}</span></div>` : ''}
        </div>
        <p>Under the <strong>TIKUM Buyer Protection Policy</strong>, ticket funds remaining in the Escrow Vault will be processed for a 100% refund to buyers.</p>
      ` : `
        <span class="badge badge-warning" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">Event Dibatalkan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Event Resmi Dibatalkan oleh Promotor</h2>
        <p>Penyelenggara resmi telah mengumumkan pembatalan untuk event <strong>${escapeHtml(d.eventTitle || 'Event TIKUM')}</strong>.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Event:</span><span class="info-value">${escapeHtml(d.eventTitle || '-')}</span></div>
          <div class="info-row"><span class="info-label">Alasan:</span><span class="info-value">${escapeHtml(d.cancellationReason || d.reason || 'Keputusan resmi promotor / force majeure')}</span></div>
          ${d.orderId ? `<div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${escapeHtml(d.orderId)}</span></div>` : ''}
          ${d.refundAmount ? `<div class="info-row"><span class="info-label">Estimasi Refund:</span><span class="info-value" style="color: #34d399;">Rp ${(d.refundAmount || 0).toLocaleString('id-ID')}</span></div>` : ''}
        </div>
        <p>Sesuai dengan <strong>Kebijakan Perlindungan Konsumen TIKUM</strong>, dana tiket yang masih berada di Rekening Bersama (Escrow) akan diproses untuk pengembalian 100% kepada pembeli.</p>
      `;
      const textContent = isEn
        ? `Event Cancellation Notice: ${d.eventTitle || 'Event'}\nReason: ${d.cancellationReason || d.reason || 'Promoter decision'}\nEscrow funds will be refunded in accordance with TIKUM policies.`
        : `Pemberitahuan Pembatalan Event: ${d.eventTitle || 'Event'}\nAlasan: ${d.cancellationReason || d.reason || 'Keputusan resmi promotor'}\nDana di Escrow akan dikembalikan 100% sesuai kebijakan TIKUM.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Event ${d.eventTitle || ''} officially cancelled` : `Event ${d.eventTitle || ''} resmi dibatalkan`, content, actionButton: { text: isEn ? 'Refund Information & Policy' : 'Informasi Refund & Kebijakan', url: `${CANONICAL_ORIGIN}/refund-policy` }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/refund-policy`, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  REFUND_CONFIRMATION: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Refund Successful #${d.orderId || ''}`
      : `Pengembalian Dana (Refund) Berhasil #${d.orderId || ''}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? `Refund Completed #${d.orderId || ''}` : `Refund Selesai #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = isEn ? `
        <span class="badge badge-success">Refund Successful</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Funds Returned to Your Account</h2>
        <p>The refund for order <strong>#${escapeHtml(d.orderId || '')}</strong> has been processed successfully through the payment gateway.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Order ID:</span><span class="info-value">${escapeHtml(d.orderId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Refund Amount:</span><span class="info-value" style="color: #34d399;">Rp ${(d.amount || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Payment Channel:</span><span class="info-value">${escapeHtml(d.channel || 'Original Payment Method')}</span></div>
          <div class="info-row"><span class="info-label">Refund Reason:</span><span class="info-value">${escapeHtml(d.reason || 'Dispute approved / Event cancelled')}</span></div>
        </div>
        <p>Posting time to your original payment method depends on your issuing bank or e-wallet provider (1&ndash;3 business days).</p>
      ` : `
        <span class="badge badge-success">Refund Berhasil</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Dana Telah Dikembalikan ke Rekening Anda</h2>
        <p>Pengembalian dana untuk pesanan <strong>#${escapeHtml(d.orderId || '')}</strong> telah berhasil diproses melalui gateway pembayaran resmi.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${escapeHtml(d.orderId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Nominal Refund:</span><span class="info-value" style="color: #34d399;">Rp ${(d.amount || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Metode Pembayaran:</span><span class="info-value">${escapeHtml(d.channel || 'Metode Pembayaran Asli')}</span></div>
          <div class="info-row"><span class="info-label">Alasan Refund:</span><span class="info-value">${escapeHtml(d.reason || 'Sengketa disetujui / Event dibatalkan')}</span></div>
        </div>
        <p>Waktu efektif dana masuk ke rekening Anda bergantung pada kebijakan bank atau penyedia e-wallet terkait (1&ndash;3 hari kerja).</p>
      `;
      const textContent = isEn
        ? `Refund Successful #${d.orderId || ''}.\nAmount: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nReason: ${d.reason || 'Refund approved'}\nFunds returned to original payment channel.`
        : `Pengembalian Dana (Refund) Berhasil #${d.orderId || ''}.\nNominal: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nAlasan: ${d.reason || 'Refund disetujui'}\nDana dikembalikan ke saluran pembayaran asal.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Refund of Rp ${(d.amount || 0).toLocaleString('id-ID')} processed successfully` : `Refund sebesar Rp ${(d.amount || 0).toLocaleString('id-ID')} berhasil diproses`, content, actionButton: { text: isEn ? 'View Refund Receipt' : 'Lihat Bukti Refund', url: trackUrl }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl, locale: isEn ? 'en' : 'id' })
      };
    }
  },

  // ===========================================================================
  // CONTACT & HUMAN INBOX CORRESPONDENCE
  // ===========================================================================
  CONTACT_INQUIRY_NOTIFICATION: {
    subject: (d) => `[TIKUM INQUIRY] ${d.subject || 'Pertanyaan Pengguna'} #${(d.inquiryId || '').slice(-6)}`,
    render: (d) => {
      const title = `Pesan Masuk: ${d.subject || 'Pertanyaan Pengguna'}`;
      const content = `
        <span class="badge badge-info">Pesan Masuk / Form Kontak</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Inquiry dari: ${escapeHtml(d.name || 'Pengunjung')}</h2>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Inquiry:</span><span class="info-value mono">${escapeHtml(d.inquiryId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Pengirim:</span><span class="info-value">${escapeHtml(d.name || '-')}</span></div>
          <div class="info-row"><span class="info-label">Email Pengirim:</span><span class="info-value">${escapeHtml(d.email || '-')}</span></div>
          <div class="info-row"><span class="info-label">Perihal:</span><span class="info-value">${escapeHtml(d.subject || '-')}</span></div>
        </div>
        <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 16px; margin: 16px 0; font-size: 13px; line-height: 1.6; color: #e2e8f0; white-space: pre-wrap;">${escapeHtml(d.message || '-')}</div>
        <p style="color: #94a3b8; font-size: 12px;">Balas langsung email ini atau buka Admin Inbox untuk menindaklanjuti pesan ini.</p>
      `;
      const textContent = `[TIKUM INQUIRY] Pesan Masuk #${d.inquiryId || ''}\nDari: ${d.name || '-'} (${d.email || '-'})Perihal: ${d.subject || '-'}\n\nPesan:\n${d.message || '-'}`;
      return {
        html: wrapHtml({ title, preheader: `Inquiry baru dari ${d.name || 'Pengunjung'}: ${d.subject || ''}`, content, actionButton: { text: 'Buka Admin Inbox', url: `${CANONICAL_ORIGIN}/admin?tab=inbox` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/admin?tab=inbox` })
      };
    }
  },

  CONTACT_CONFIRMATION_RECEIPT: {
    subject: (d) => (d && (d.locale === 'en' || d.lang === 'en'))
      ? `Inquiry Received: ${d.subject || 'TIKUM Support'}`
      : `Konfirmasi Penerimaan Pesan: ${d.subject || 'Layanan Tikum'}`,
    render: (d) => {
      const isEn = Boolean(d && (d.locale === 'en' || d.lang === 'en'));
      const title = isEn ? 'Your Message Has Been Received' : 'Pesan Anda Telah Kami Terima';
      const content = isEn ? `
        <span class="badge badge-success">Message Received</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Hello, ${escapeHtml(d.name || 'Customer')}!</h2>
        <p>Thank you for reaching out to TIKUM. Your message regarding <strong>"${escapeHtml(d.subject || 'Inquiry')}"</strong> has been received under ticket ID <code class="mono" style="color: #22d3ee;">#${escapeHtml(d.inquiryId || '')}</code>.</p>
        <p>Our operations and customer support team will review your message and provide a response via this email within 1&times;24 hours.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Ticket ID:</span><span class="info-value mono">${escapeHtml(d.inquiryId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Subject:</span><span class="info-value">${escapeHtml(d.subject || '-')}</span></div>
          <div class="info-row"><span class="info-label">Status:</span><span class="info-value" style="color: #34d399;">RECEIVED &bull; IN QUEUE</span></div>
        </div>
      ` : `
        <span class="badge badge-success">Pesan Diterima</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Halo, ${escapeHtml(d.name || 'Pelanggan')}!</h2>
        <p>Terima kasih telah menghubungi TIKUM. Pesan Anda mengenai <strong>"${escapeHtml(d.subject || 'Pertanyaan')}"</strong> telah berhasil kami terima dengan nomor tiket <code class="mono" style="color: #22d3ee;">#${escapeHtml(d.inquiryId || '')}</code>.</p>
        <p>Tim operasional dan customer support TIKUM akan meninjau pesan Anda dan memberikan tanggapan melalui email ini dalam waktu 1&times;24 jam.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">No. Tiket:</span><span class="info-value mono">${escapeHtml(d.inquiryId || '-')}</span></div>
          <div class="info-row"><span class="info-label">Perihal:</span><span class="info-value">${escapeHtml(d.subject || '-')}</span></div>
          <div class="info-row"><span class="info-label">Status:</span><span class="info-value" style="color: #34d399;">DITERIMA &bull; DALAM ANTREAN</span></div>
        </div>
      `;
      const textContent = isEn
        ? `Hello ${d.name || 'Customer'},\n\nThank you for reaching out to TIKUM. Your message regarding "${d.subject || ''}" (#${d.inquiryId || ''}) has been received.\nOur support team will respond within 24 hours.`
        : `Halo ${d.name || 'Pelanggan'},\n\nTerima kasih telah menghubungi TIKUM. Pesan Anda terkait "${d.subject || ''}" (#${d.inquiryId || ''}) telah kami terima.\nTim support kami akan merespons dalam waktu 1x24 jam.`;
      return {
        html: wrapHtml({ title, preheader: isEn ? `Confirmation of inquiry received #${d.inquiryId || ''}` : `Konfirmasi pesan diterima #${d.inquiryId || ''}`, content, actionButton: { text: isEn ? 'TIKUM Help Center' : 'Pusat Bantuan TIKUM', url: `${CANONICAL_ORIGIN}/faq` }, locale: isEn ? 'en' : 'id' }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/faq`, locale: isEn ? 'en' : 'id' })
      };
    }
  },

    INBOX_REPLY: {
    subject: (d) => d.subject ? (d.subject.startsWith('Re:') ? d.subject : `Re: ${d.subject}`) : 'Tanggapan dari Tim Support TIKUM',
    render: (d) => {
      const title = 'Tanggapan dari Tim Support TIKUM';
      const content = `
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Halo, ${escapeHtml(d.recipientName || 'Pengguna')}</h2>
        <div style="background-color: #0f172a; border-left: 3px solid #0284c7; padding: 14px 18px; margin: 16px 0; font-size: 14px; line-height: 1.6; color: #f8fafc; white-space: pre-wrap;">${escapeHtml(d.replyText || '')}</div>
        ${d.originalMessage ? `
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
            <div style="color: #64748b; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Pesan Anda Sebelumnya:</div>
            <div style="color: #94a3b8; font-size: 12px; font-style: italic; white-space: pre-wrap;">${escapeHtml(d.originalMessage)}</div>
          </div>
        ` : ''}
      `;
      const textContent = `Halo ${d.recipientName || 'Pengguna'},\n\n${d.replyText || ''}\n\n---\nPesan Sebelumnya:\n${d.originalMessage || ''}`;
      return {
        html: wrapHtml({ title, preheader: `Tanggapan Support TIKUM untuk: ${d.subject || ''}`, content, actionButton: { text: 'Kunjungi TIKUM', url: CANONICAL_ORIGIN } }),
        text: wrapText({ title, content: textContent, actionUrl: CANONICAL_ORIGIN })
      };
    }
  }
};

// Aliases for template lookup flexibility
TEMPLATES.TICKET_DELIVERED = TEMPLATES.TICKET_DELIVERY;
TEMPLATES.EVENT_CANCELLED = TEMPLATES.EVENT_CANCELLATION;
TEMPLATES.REFUND_CONFIRMED = TEMPLATES.REFUND_CONFIRMATION;
TEMPLATES.CRITICAL_OPERATIONAL_ALERT = TEMPLATES.SYSTEM_ALERT;

/**
 * Render email content given template name and payload data
 */
function renderTemplate(templateName, data = {}) {
  const tpl = TEMPLATES[templateName];
  if (!tpl) {
    throw new Error(`Email template '${templateName}' not found`);
  }
  const subject = typeof tpl.subject === 'function' ? tpl.subject(data) : tpl.subject;
  const rendered = tpl.render(data);
  return {
    subject,
    html: rendered.html,
    text: rendered.text
  };
}

module.exports = {
  TEMPLATES,
  renderTemplate,
  escapeHtml,
  BRAND_NAME,
  SUPPORT_EMAIL,
  ADMIN_EMAIL,
  HELLO_EMAIL,
  NO_REPLY_EMAIL,
  CANONICAL_ORIGIN
};
