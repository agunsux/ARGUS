/**
 * Tikum Canonical Brand & Business Profile Configuration
 *
 * BRAND ARCHITECTURE:
 * SHINERVA (Parent Company)
 *    ↓
 * TIKUM (Consumer Brand — Verified Ticket Marketplace)
 *    ↓
 * ARGUS Trust Engine (Internal Trust, Security & Operations Infrastructure)
 *
 * CANONICAL SOURCE OF TRUTH for iPaymu Compliance & Public Trust Pages.
 */

const businessProfile = {
  brandName: 'Tikum',
  brandTagline: 'Verified Ticket Marketplace',
  brandSlogan: 'Tiket terverifikasi. Transaksi terlindungi.',
  legalEntity: 'PT SHINERVA PRAJNA TEJAS',
  legalName: 'PT SHINERVA PRAJNA TEJAS',
  parentCompany: 'PT SHINERVA PRAJNA TEJAS',
  parentEntity: 'PT SHINERVA PRAJNA TEJAS',
  engineName: 'ARGUS Trust Engine',
  canonicalRelationship: 'Tikum — Verified Ticket Marketplace by PT SHINERVA PRAJNA TEJAS',
  primaryDomain: 'tikum.app',
  canonicalDomain: 'https://tikum.app',
  canonicalOrigin: 'https://tikum.app',

  // Official Business Entity for underwriting and regulatory compliance
  name: 'PT SHINERVA PRAJNA TEJAS',
  email: 'support@tikum.app',
  phone: '081299927378',
  whatsappNumber: '081299927378',
  whatsappUrl: 'https://wa.me/6281299927378',
  emailUrl: 'mailto:support@tikum.app',

  // Xendit Merchant Verification & Business Identity Attributes
  businessLegalName: 'PT SHINERVA PRAJNA TEJAS',
  businessTradingName: 'TIKUM',
  businessBrandName: 'TIKUM',
  businessEntityStatus: 'REGISTERED_PT',
  businessWebsiteUrl: 'https://tikum.app/',
  businessContactEmail: 'support@tikum.app',
  businessContactPhone: '081299927378',
  businessAddress: 'Jl. Pasirluyu No. 79, Bandung 40254, Indonesia',
  legalDocumentStatus: {
    aktaPendirian: 'OWNER_VERIFIED_PT_SHINERVA_PRAJNA_TEJAS',
    nib: 'OWNER_VERIFIED_PT_SHINERVA_PRAJNA_TEJAS',
    npwp: 'OWNER_VERIFIED_PT_SHINERVA_PRAJNA_TEJAS',
    merchantAccountAlignment: 'PT_SHINERVA_PRAJNA_TEJAS_REQUIRED'
  },

  // Official Business & Transactional Email Routing Identities (Cloudflare Email Routing)
  supportEmail: 'support@tikum.app',
  helloEmail: 'hello@tikum.app',
  adminEmail: 'admin@tikum.app',
  picEmail: 'pic@tikum.app',
  address: {
    entity: 'PT SHINERVA PRAJNA TEJAS',
    street: 'Jl. Pasirluyu No. 79',
    city: 'Bandung',
    postalCode: '40254',
    country: 'Indonesia',
    formattedText: 'PT SHINERVA PRAJNA TEJAS\nJl. Pasirluyu No. 79\nBandung 40254\nIndonesia',
    inlineText: 'PT SHINERVA PRAJNA TEJAS, Jl. Pasirluyu No. 79, Bandung 40254, Indonesia',
    htmlBlock: '<strong>PT SHINERVA PRAJNA TEJAS</strong><br>Jl. Pasirluyu No. 79<br>Bandung 40254<br>Indonesia'
  },
  legalLinks: {
    about: '/about',
    howItWorks: '/how-it-works',
    howToBuy: '/how-to-buy',
    howToSell: '/how-to-sell',
    buyerGuide: '/panduan-pembeli',
    buyerProtection: '/buyer-protection',
    ticketVerification: '/ticket-verification',
    fees: '/fees',
    checkout: '/pay',
    faq: '/faq',
    terms: '/terms',
    sellerTerms: '/seller-terms',
    refundPolicy: '/refund-policy',
    refunds: '/refunds',
    disputes: '/disputes',
    contact: '/contact',
    privacy: '/privacy'
  }
};

function renderFooterHtml() {
  return `
  <footer class="site-footer" style="background: rgba(10, 15, 29, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 48px 24px 32px; margin-top: 60px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div class="footer-container" style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.4fr 1fr 1fr 1.2fr; gap: 32px;">
      <div class="footer-col footer-business">
        <div style="font-weight: 800; font-size: 16px; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-shield-halved" style="color: #06b6d4;"></i> TIKUM — by PT SHINERVA PRAJNA TEJAS
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 12px;" data-i18n="footer.aboutBrand">
          Marketplace tiket sekunder terverifikasi di Indonesia. Transaksi aman dengan perlindungan penahanan pembayaran bersyarat dan verifikasi keabsahan tiket.
        </p>
        <div class="footer-address" style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
          <div style="font-weight: 700; color: #cbd5e1;" data-i18n="footer.operationalOffice">Badan Usaha &amp; Alamat Operasional:</div>
          <div>${businessProfile.address.entity}</div>
          <div>${businessProfile.address.street}</div>
          <div>${businessProfile.address.city} ${businessProfile.address.postalCode}</div>
          <div>${businessProfile.address.country}</div>
        </div>
      </div>

      <div class="footer-col footer-contact-col">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 14px;" data-i18n="footer.officialContact">Kontak Resmi</div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <div>
            <span style="color: #64748b;" data-i18n="footer.customerSupport">Layanan Pengguna:</span>
            <a href="mailto:support@tikum.app" style="color: #06b6d4; text-decoration: none; margin-left: 6px; font-weight: 600;">support@tikum.app</a>
          </div>
          <div>
            <span style="color: #64748b;" data-i18n="footer.legalCorrespondence">Korespondensi Legal:</span>
            <a href="${businessProfile.emailUrl}" style="color: #94a3b8; text-decoration: none; margin-left: 6px;">${businessProfile.email}</a>
          </div>
          <div>
            <span style="color: #64748b;">WhatsApp:</span>
            <a href="${businessProfile.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="color: #34d399; text-decoration: none; margin-left: 6px;"><i class="fa-brands fa-whatsapp"></i> ${businessProfile.phone}</a>
          </div>
          <div style="color: #64748b; font-size: 12px; margin-top: 4px;">
            Jam Operasional: Senin – Minggu: 09:00 – 21:00 WIB
          </div>
        </div>
      </div>

      <div class="footer-col footer-trust-col">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 14px;">Infrastruktur Kepercayaan</div>
        <div class="footer-links" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <a href="/about" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-circle-info"></i> Tentang TIKUM</a>
          <a href="/how-it-works" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-circle-nodes"></i> Cara Kerja Transaksi</a>
          <a href="/how-to-buy" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-basket-shopping"></i> Panduan Pembeli</a>
          <a href="/how-to-sell" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-tags"></i> Panduan Penjual</a>
          <a href="/ticket-verification" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-qrcode"></i> Verifikasi Tiket</a>
          <a href="/buyer-protection" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-shield-heart"></i> Perlindungan Pembeli</a>
          <a href="/fees" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-receipt"></i> Struktur Biaya Platform</a>
        </div>
      </div>

      <div class="footer-col footer-links-col">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 14px;" data-i18n="footer.servicesAndLegal">Layanan &amp; Legalitas</div>
        <div class="footer-links" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <a href="/pay" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-cash-register"></i> Simulasi Checkout (/pay)</a>
          <a href="/terms" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-file-contract"></i> Syarat &amp; Ketentuan</a>
          <a href="/seller-terms" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-handshake"></i> Ketentuan Penjual</a>
          <a href="/refund-policy" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-rotate-left"></i> Kebijakan Pengembalian (Refund)</a>
          <a href="/disputes" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-scale-balanced"></i> Prosedur Sengketa (Disputes)</a>
          <a href="/faq" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-circle-question"></i> FAQ / Pertanyaan Umum</a>
          <a href="/privacy" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-user-shield"></i> Kebijakan Privasi (UU PDP)</a>
          <a href="/contact" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-address-book"></i> Kontak Kami</a>
        </div>
      </div>
    </div>
    <div style="max-width: 1200px; margin: 32px auto 0; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center; font-size: 12px; color: #64748b;" data-i18n="footer.allRightsReserved">
      &copy; 2026 PT SHINERVA PRAJNA TEJAS. Seluruh hak cipta dilindungi undang-undang. TIKUM adalah merek marketplace tiket sekunder berizin yang dioperasikan oleh PT SHINERVA PRAJNA TEJAS.
    </div>
  </footer>
  `;
}

module.exports = {
  businessProfile,
  renderFooterHtml
};
