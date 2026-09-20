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
function wrapHtml({ title, preheader, content, actionButton = null }) {
  return `<!DOCTYPE html>
<html lang="id">
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
      <div class="brand-subtitle">Verified Ticket Marketplace &bull; Transaksi Terlindungi</div>
    </div>
    <div class="body-content">
      ${content}
      ${actionButton ? `<div style="text-align: center;"><a href="${actionButton.url}" class="btn-action">${actionButton.text}</a></div>` : ''}
    </div>
    <div class="footer">
      <div style="font-weight: 700; color: #94a3b8; margin-bottom: 4px;">TIKUM &mdash; Verified Ticket Marketplace by SHINERVA</div>
      <div>Website resmi: <a href="${CANONICAL_ORIGIN}">${CANONICAL_ORIGIN}</a></div>
      <div>Bantuan &amp; Dukungan: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></div>
      <div style="margin-top: 8px;">Kantor Operasional: ${businessProfile.address?.entity || 'SHINERVA HQ'}, ${businessProfile.address?.street || 'Jl. Pasirluyu No. 79'}, ${businessProfile.address?.city || 'Bandung'} ${businessProfile.address?.postalCode || '40254'}, Indonesia.</div>
      <div style="margin-top: 8px; color: #475569;">Email ini dikirim otomatis oleh sistem TIKUM terkait aktivitas akun atau transaksi Anda.</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Shared Plain-Text wrapper providing consistent layout and legal footer
 */
function wrapText({ title, content, actionUrl = null }) {
  return `[TIKUM — VERIFIED TICKET MARKETPLACE]
${title}
==================================================

${content}

${actionUrl ? `Lihat Detail: ${actionUrl}\n\n` : ''}==================================================
TIKUM — Verified Ticket Marketplace by SHINERVA
Website resmi: ${CANONICAL_ORIGIN}
Bantuan: ${SUPPORT_EMAIL}
Kantor Operasional: ${businessProfile.address?.entity || 'SHINERVA HQ'}, ${businessProfile.address?.street || 'Jl. Pasirluyu No. 79'}, ${businessProfile.address?.city || 'Bandung'} ${businessProfile.address?.postalCode || '40254'}, Indonesia.
`;
}

const TEMPLATES = {
  // ===========================================================================
  // ACCOUNT / AUTH
  // ===========================================================================
  ACCOUNT_WELCOME: {
    subject: (d) => `Selamat Datang di TIKUM, ${d.name || 'Pengguna'}!`,
    render: (d) => {
      const title = 'Selamat Datang di TIKUM';
      const content = `
        <span class="badge badge-success">Akun Berhasil Dibuat</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Halo, ${d.name || 'Pengguna'}!</h2>
        <p>Akun TIKUM Anda telah aktif. Anda kini dapat mencari tiket sekunder terverifikasi dengan jaminan rekening bersama (escrow) dan pendampingan fisik di venue.</p>
        <p>Prioritaskan selalu keamanan akun Anda dan jangan pernah membagikan password atau OTP kepada siapa pun.</p>
      `;
      const textContent = `Halo ${d.name || 'Pengguna'},\n\nAkun TIKUM Anda telah aktif. Anda kini dapat mencari tiket terverifikasi dengan proteksi escrow dan verifikasi gate fisik.`;
      return {
        html: wrapHtml({ title, preheader: 'Akun TIKUM Anda telah aktif', content, actionButton: { text: 'Jelajahi Event', url: `${CANONICAL_ORIGIN}/events` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events` })
      };
    }
  },

  ACCOUNT_VERIFICATION: {
    subject: () => `Kode Verifikasi Akun TIKUM`,
    render: (d) => {
      const title = 'Verifikasi Email TIKUM';
      const content = `
        <span class="badge badge-info">Verifikasi Keamanan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Kode Verifikasi Anda</h2>
        <p>Gunakan kode verifikasi di bawah ini untuk menyelesaikan proses pendaftaran atau verifikasi akun TIKUM Anda:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #22d3ee; background: #1e293b; padding: 12px 24px; border-radius: 6px; border: 1px solid #334155;">${d.code || '------'}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Kode ini berlaku selama 15 menit. Jika Anda tidak merasa meminta kode ini, abaikan email ini.</p>
      `;
      const textContent = `Kode verifikasi akun TIKUM Anda adalah: ${d.code || '------'}\n\nKode ini berlaku selama 15 menit.`;
      return {
        html: wrapHtml({ title, preheader: `Kode Verifikasi TIKUM: ${d.code}`, content }),
        text: wrapText({ title, content: textContent })
      };
    }
  },

  PASSWORD_RESET: {
    subject: () => `Permintaan Reset Password Akun TIKUM`,
    render: (d) => {
      const title = 'Reset Password Akun';
      const resetUrl = d.resetUrl || `${CANONICAL_ORIGIN}/auth/reset-password?token=${d.token || ''}`;
      const content = `
        <span class="badge badge-warning">Pemberitahuan Keamanan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Permintaan Reset Password</h2>
        <p>Kami menerima permintaan untuk mereset password akun TIKUM Anda. Klik tombol di bawah ini untuk membuat password baru:</p>
        <p style="color: #94a3b8; font-size: 12px;">Tautan reset ini hanya berlaku selama 30 menit demi keamanan akun Anda.</p>
      `;
      const textContent = `Permintaan reset password akun TIKUM diterima.\n\nSilakan kunjungi tautan berikut untuk membuat password baru:\n${resetUrl}\n\nTautan berlaku selama 30 menit.`;
      return {
        html: wrapHtml({ title, preheader: 'Reset password akun TIKUM Anda', content, actionButton: { text: 'Reset Password', url: resetUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: resetUrl })
      };
    }
  },

  // ===========================================================================
  // MARKETPLACE / ORDER
  // ===========================================================================
  ORDER_CREATED: {
    subject: (d) => `Pesanan Dibuat #${d.orderId || ''} — Menunggu Pembayaran`,
    render: (d) => {
      const title = `Pesanan #${d.orderId || ''} Dibuat`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `Pesanan #${d.orderId || ''} berhasil dibuat.\nEvent: ${d.eventTitle || '-'}\nTotal: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}\nStatus: Menunggu Pembayaran.`;
      return {
        html: wrapHtml({ title, preheader: `Pesanan #${d.orderId} dibuat. Total: Rp ${(d.totalAmount || 0).toLocaleString('id-ID')}`, content, actionButton: { text: 'Lanjut ke Pembayaran', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  ORDER_STATUS_CHANGED: {
    subject: (d) => `Update Status Pesanan #${d.orderId || ''}: ${d.status || ''}`,
    render: (d) => {
      const title = `Update Pesanan #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-info">Status Update</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Status Pesanan Berubah</h2>
        <p>Pesanan Anda telah mengalami perubahan status menjadi: <strong>${d.status || ''}</strong>.</p>
        ${d.notes ? `<p style="color: #94a3b8; font-size: 13px;">Keterangan: ${d.notes}</p>` : ''}
      `;
      const textContent = `Status pesanan #${d.orderId || ''} telah diperbarui menjadi: ${d.status || ''}.\n${d.notes ? `Catatan: ${d.notes}\n` : ''}`;
      return {
        html: wrapHtml({ title, preheader: `Status pesanan #${d.orderId}: ${d.status}`, content, actionButton: { text: 'Pantau Pesanan', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  // ===========================================================================
  // OFFERS
  // ===========================================================================
  OFFER_RECEIVED: {
    subject: (d) => `Tawaran Baru Diterima: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}`,
    render: (d) => {
      const title = 'Tawaran Baru Diterima';
      const offerUrl = `${CANONICAL_ORIGIN}/offers`;
      const content = `
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
      const textContent = `Tawaran baru untuk tiket Anda!\nEvent: ${d.eventTitle || '-'}\nHarga ditawar: Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')}\nBuka dashboard untuk merespons.`;
      return {
        html: wrapHtml({ title, preheader: `Tawaran baru Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} masuk`, content, actionButton: { text: 'Buka Dashboard Tawaran', url: offerUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: offerUrl })
      };
    }
  },

  OFFER_ACCEPTED: {
    subject: (d) => `Tawaran Anda Diterima! Pesanan #${d.orderId || ''}`,
    render: (d) => {
      const title = 'Tawaran Diterima';
      const payUrl = `${CANONICAL_ORIGIN}/pay/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-success">Tawaran Diterima Penjual</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Selamat! Penjual Menerima Tawaran Anda</h2>
        <p>Tawaran Anda sebesar <strong>Rp ${(d.finalPrice || 0).toLocaleString('id-ID')}</strong> telah disetujui penjual. Silakan selesaikan pembayaran untuk mengamankan tiket Anda.</p>
      `;
      const textContent = `Tawaran Anda sebesar Rp ${(d.finalPrice || 0).toLocaleString('id-ID')} telah disetujui!\nSegera lakukan pembayaran untuk mengamankan tiket.`;
      return {
        html: wrapHtml({ title, preheader: 'Tawaran Anda diterima oleh penjual', content, actionButton: { text: 'Bayar Sekarang', url: payUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: payUrl })
      };
    }
  },

  OFFER_REJECTED: {
    subject: () => `Pemberitahuan Tawaran Tiket`,
    render: (d) => {
      const title = 'Tawaran Ditolak / Dibatalkan';
      const content = `
        <span class="badge badge-warning">Tawaran Selesai</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Tawaran Tidak Dilanjutkan</h2>
        <p>Tawaran Anda untuk tiket <strong>${d.eventTitle || 'Event'}</strong> sebesar Rp ${(d.offeredPrice || 0).toLocaleString('id-ID')} telah ditolak atau dibatalkan karena listing terjual dengan harga penuh.</p>
      `;
      const textContent = `Tawaran Anda untuk ${d.eventTitle || 'Event'} telah ditolak atau listing telah terjual ke pembeli lain.`;
      return {
        html: wrapHtml({ title, preheader: 'Update tawaran tiket Anda', content, actionButton: { text: 'Cari Tiket Lain', url: `${CANONICAL_ORIGIN}/events` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events` })
      };
    }
  },

  COUNTER_OFFER: {
    subject: (d) => `Tawaran Balik dari Penjual: Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}`,
    render: (d) => {
      const title = 'Tawaran Balik Diterima';
      const offerUrl = `${CANONICAL_ORIGIN}/offers`;
      const content = `
        <span class="badge badge-info">Counter Offer</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Penjual Mengajukan Tawaran Balik</h2>
        <p>Penjual tiket <strong>${d.eventTitle || 'Event'}</strong> mengajukan penawaran harga sebesar <strong>Rp ${(d.counterPrice || 0).toLocaleString('id-ID')}</strong>.</p>
        <p>Anda dapat menerima atau menolak tawaran balik ini melalui aplikasi TIKUM.</p>
      `;
      const textContent = `Penjual mengajukan tawaran balik sebesar Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} untuk ${d.eventTitle || 'Event'}.`;
      return {
        html: wrapHtml({ title, preheader: `Tawaran balik Rp ${(d.counterPrice || 0).toLocaleString('id-ID')} dari penjual`, content, actionButton: { text: 'Lihat Tawaran Balik', url: offerUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: offerUrl })
      };
    }
  },

  // ===========================================================================
  // PAYMENT & ESCROW
  // ===========================================================================
  PAYMENT_INITIATED: {
    subject: (d) => `Instruksi Pembayaran Pesanan #${d.orderId || ''}`,
    render: (d) => {
      const title = 'Instruksi Pembayaran';
      const payUrl = `${CANONICAL_ORIGIN}/pay/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-info">Menunggu Pembayaran</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Selesaikan Pembayaran Anda</h2>
        <p>Silakan lakukan pembayaran melalui gateway pembayaran resmi iPaymu sebelum batas waktu habis:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Nominal:</span><span class="info-value" style="color: #34d399;">Rp ${(d.amount || 0).toLocaleString('id-ID')}</span></div>
          <div class="info-row"><span class="info-label">Metode:</span><span class="info-value">${d.channel || 'iPaymu'}</span></div>
        </div>
      `;
      const textContent = `Instruksi pembayaran pesanan #${d.orderId || ''}.\nNominal: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nLakukan pembayaran via: ${payUrl}`;
      return {
        html: wrapHtml({ title, preheader: `Instruksi pembayaran pesanan #${d.orderId}`, content, actionButton: { text: 'Bayar Sekarang', url: payUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: payUrl })
      };
    }
  },

  PAYMENT_SUCCESSFUL: {
    subject: (d) => `Pembayaran Diterima #${d.orderId || ''} — Dana Terkunci di Escrow`,
    render: (d) => {
      const title = 'Pembayaran Berhasil Diterima';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `Pembayaran pesanan #${d.orderId || ''} berhasil diverifikasi.\nDana sebesar Rp ${(d.amount || 0).toLocaleString('id-ID')} aman tersimpan di Rekening Bersama TIKUM.\nStatus Escrow: ESCROWED.`;
      return {
        html: wrapHtml({ title, preheader: `Pembayaran pesanan #${d.orderId} diverifikasi. Dana terkunci di Escrow.`, content, actionButton: { text: 'Buka Tiket & Panduan Masuk', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  PAYMENT_FAILED: {
    subject: (d) => `Pembayaran Gagal / Kedaluwarsa #${d.orderId || ''}`,
    render: (d) => {
      const title = 'Pembayaran Tidak Berhasil';
      const content = `
        <span class="badge badge-warning">Pembayaran Batal</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Waktu Pembayaran Telah Habis</h2>
        <p>Pembayaran untuk pesanan #${d.orderId || ''} tidak berhasil diverifikasi atau telah melewati batas waktu yang ditentukan. Reservasi tiket telah dilepas kembali.</p>
      `;
      const textContent = `Pembayaran pesanan #${d.orderId || ''} tidak berhasil atau kedaluwarsa. Reservasi tiket telah dibatalkan.`;
      return {
        html: wrapHtml({ title, preheader: `Pembayaran pesanan #${d.orderId} batal`, content, actionButton: { text: 'Cari Tiket Lain', url: `${CANONICAL_ORIGIN}/events` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/events` })
      };
    }
  },

  // ===========================================================================
  // SELLER / BUYER OPERATIONAL
  // ===========================================================================
  SELLER_TICKET_SOLD: {
    subject: (d) => `Tiket Terjual! Siapkan Penyerahan #${d.orderId || ''}`,
    render: (d) => {
      const title = 'Tiket Anda Telah Terjual';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-success">Tiket Terjual & Escrow Terkunci</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Pembeli Telah Membayar ke Escrow</h2>
        <p>Tiket Anda untuk event <strong>${d.eventTitle || '-'}</strong> telah dibeli. Pembayaran telah terkunci di Rekening Bersama TIKUM.</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">ID Pesanan:</span><span class="info-value">${d.orderId || '-'}</span></div>
          <div class="info-row"><span class="info-label">Hasil Penjualan Bersih:</span><span class="info-value" style="color: #34d399;">Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}</span></div>
        </div>
        <p>Harap siapkan tiket dan koordinasikan dengan Event PIC di lokasi sebelum jadwal konser dimulai.</p>
      `;
      const textContent = `Tiket Anda untuk ${d.eventTitle || '-'} telah terjual!\nPembayaran pembeli aman terkunci di Escrow.\nHasil bersih: Rp ${(d.sellerEarnings || 0).toLocaleString('id-ID')}.`;
      return {
        html: wrapHtml({ title, preheader: `Tiket terjual! Dana pembeli terkunci di Escrow TIKUM.`, content, actionButton: { text: 'Detail Penyerahan', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  BUYER_ENTRY_READY: {
    subject: (d) => `Panduan Masuk Venue #${d.orderId || ''} — PIC TIKUM Standby`,
    render: (d) => {
      const title = 'Persiapan Masuk Venue';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `Panduan masuk venue untuk pesanan #${d.orderId || ''}.\nVenue: ${d.venueName || '-'}\nGate: ${d.gateInfo || '-'}\nKontak PIC: ${d.picContact || '-'}.`;
      return {
        html: wrapHtml({ title, preheader: `Panduan masuk venue dengan pendampingan PIC TIKUM`, content, actionButton: { text: 'Buka Challenge Masuk', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  // ===========================================================================
  // DISPUTE
  // ===========================================================================
  DISPUTE_OPENED: {
    subject: (d) => `Pemberitahuan Sengketa #${d.orderId || ''} — Investigasi Dimulai`,
    render: (d) => {
      const title = 'Laporan Kendala / Sengketa';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-warning">Escrow Dibekukan</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Laporan Masalah di Gate Diterima</h2>
        <p>Kendala tiket telah dilaporkan untuk pesanan #${d.orderId || ''}. Dana di Rekening Bersama (Escrow) telah DIBEKUKAN otomatis.</p>
        <p>Alasan: <strong>${d.reason || 'Kendala scan gate venue'}</strong></p>
        <p>Event PIC dan Tim Trust Officer TIKUM sedang mengumpulkan bukti fisik dan log turnstile sebelum keputusan diambil.</p>
      `;
      const textContent = `Sengketa dibuka untuk pesanan #${d.orderId || ''}.\nDana escrow dibekukan.\nAlasan: ${d.reason || 'Kendala scan gate venue'}.\nInvestigasi sedang berlangsung.`;
      return {
        html: wrapHtml({ title, preheader: `Sengketa dibuka untuk pesanan #${d.orderId}. Escrow dibekukan.`, content, actionButton: { text: 'Lihat Status Sengketa', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  DISPUTE_STATUS_CHANGED: {
    subject: (d) => `Keputusan Sengketa #${d.orderId || ''}: ${d.outcome || ''}`,
    render: (d) => {
      const title = 'Penyelesaian Sengketa';
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
        <span class="badge badge-info">Keputusan Final</span>
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 8px;">Hasil Investigasi Sengketa</h2>
        <p>Investigasi atas sengketa pesanan #${d.orderId || ''} telah diselesaikan oleh Trust Officer:</p>
        <div class="info-card">
          <div class="info-row"><span class="info-label">Keputusan:</span><span class="info-value" style="color: #38bdf8;">${d.outcome || '-'}</span></div>
          <div class="info-row"><span class="info-label">Catatan:</span><span class="info-value">${d.decisionNotes || '-'}</span></div>
        </div>
      `;
      const textContent = `Keputusan sengketa pesanan #${d.orderId || ''}: ${d.outcome || '-'}.\nCatatan: ${d.decisionNotes || '-'}.`;
      return {
        html: wrapHtml({ title, preheader: `Keputusan sengketa pesanan #${d.orderId}: ${d.outcome}`, content, actionButton: { text: 'Lihat Detail', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
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
    subject: (d) => `Tiket Anda Siap Diunduh #${d.orderId || ''} — ${d.eventTitle || 'Event TIKUM'}`,
    render: (d) => {
      const title = `E-Ticket Siap Diunduh #${d.orderId || ''}`;
      const downloadUrl = d.downloadUrl || `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `E-Ticket Siap Diunduh!\nID Pesanan: #${d.orderId || ''}\nEvent: ${d.eventTitle || '-'}\nKategori: ${d.ticketCategory || d.category || 'General Admission'}\nKursi: ${d.seatInfo || 'Free Standing'}\nUnduh tiket di: ${downloadUrl}`;
      return {
        html: wrapHtml({ title, preheader: `E-Ticket pesanan #${d.orderId} siap diunduh`, content, actionButton: { text: 'Unduh E-Ticket', url: downloadUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: downloadUrl })
      };
    }
  },

  DELIVERY_CONFIRMATION: {
    subject: (d) => `Konfirmasi Penyerahan Tiket Selesai #${d.orderId || ''}`,
    render: (d) => {
      const title = `Penyerahan Tiket Selesai #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `Konfirmasi Penyerahan Tiket Selesai #${d.orderId || ''}.\nEvent: ${d.eventTitle || '-'}\nWaktu: ${d.verifiedAt || new Date().toISOString()}\nStatus Escrow: Siap dilepas.`;
      return {
        html: wrapHtml({ title, preheader: `Penyerahan tiket pesanan #${d.orderId} selesai diverifikasi`, content, actionButton: { text: 'Lihat Status Transaksi', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
      };
    }
  },

  EVENT_CANCELLATION: {
    subject: (d) => `Pemberitahuan Pembatalan Event: ${d.eventTitle || 'Event TIKUM'}`,
    render: (d) => {
      const title = `Pembatalan Event: ${d.eventTitle || 'Event'}`;
      const content = `
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
      const textContent = `Pemberitahuan Pembatalan Event: ${d.eventTitle || 'Event'}\nAlasan: ${d.cancellationReason || d.reason || 'Keputusan resmi promotor'}\nDana di Escrow akan dikembalikan 100% sesuai kebijakan TIKUM.`;
      return {
        html: wrapHtml({ title, preheader: `Event ${d.eventTitle || ''} resmi dibatalkan`, content, actionButton: { text: 'Informasi Refund & Kebijakan', url: `${CANONICAL_ORIGIN}/refund-policy` } }),
        text: wrapText({ title, content: textContent, actionUrl: `${CANONICAL_ORIGIN}/refund-policy` })
      };
    }
  },

  REFUND_CONFIRMATION: {
    subject: (d) => `Pengembalian Dana (Refund) Berhasil #${d.orderId || ''}`,
    render: (d) => {
      const title = `Refund Selesai #${d.orderId || ''}`;
      const trackUrl = `${CANONICAL_ORIGIN}/track/${d.orderId || ''}`;
      const content = `
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
      const textContent = `Pengembalian Dana (Refund) Berhasil #${d.orderId || ''}.\nNominal: Rp ${(d.amount || 0).toLocaleString('id-ID')}\nAlasan: ${d.reason || 'Refund disetujui'}\nDana dikembalikan ke saluran pembayaran asal.`;
      return {
        html: wrapHtml({ title, preheader: `Refund sebesar Rp ${(d.amount || 0).toLocaleString('id-ID')} berhasil diproses`, content, actionButton: { text: 'Lihat Bukti Refund', url: trackUrl } }),
        text: wrapText({ title, content: textContent, actionUrl: trackUrl })
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
