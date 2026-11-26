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
  whatsappDisplayNumber: '+62 812-9992-7378',
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
    nib: 'PENDING_DOCUMENT_VERIFICATION',
    npwp: 'PENDING_DOCUMENT_VERIFICATION',
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
    resalePolicy: '/resale-policy',
    paymentFlow: '/payment-flow',
    refundPolicy: '/refund-policy',
    refunds: '/refunds',
    disputes: '/disputes',
    contact: '/contact',
    privacy: '/privacy'
  }
};

function escFooter(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFooterHtml(lang = 'id') {
  const { t, normalizeLocale } = require('../i18n');
  const loc = normalizeLocale(lang);
  const f = (key, idText, enText) => {
    if (loc === 'id' && idText !== undefined) return idText;
    if (loc === 'en' && enText !== undefined) return enText;
    return escFooter(t(key, loc));
  };
  return `
  <footer id="appFooter" class="site-footer" style="background: var(--palette-midnight-navy, #172333); border-top: 1px solid rgba(203, 213, 225, 0.22); padding: 48px 24px 32px; margin-top: 60px; font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: var(--palette-soft-white, #FFFFFF);">
    <div class="footer-container" style="max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px;">
      <div class="footer-col footer-business">
        <div class="tikum-logo-slot tikum-logo-slot--footer" style="margin-bottom: 12px;">
          <img src="/images/tikum-brand-horizontal.svg" class="tikum-logo-img" alt="TIKUM" width="192" height="40">
        </div>
        <div style="font-weight: 800; font-size: 14px; color: var(--palette-warm-sand, #F3EBDD); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-shield-halved" style="color: var(--palette-terracotta, #E36F45);"></i> TIKUM — by PT SHINERVA PRAJNA TEJAS
        </div>
        <p style="color: var(--palette-secondary-text, #CBD5E1); font-size: 13px; line-height: 1.6; margin-bottom: 12px;" data-i18n="footer.aboutBrand">
          ${f('footer.aboutBrand', 'Marketplace tiket sekunder terverifikasi di Indonesia. Transaksi aman dengan perlindungan penahanan pembayaran bersyarat dan verifikasi keabsahan tiket.', 'Verified secondary ticket marketplace. Secure transactions with internal escrow repository and physical assistance at the venue gate.')}
        </p>
        <div class="footer-address" style="color: var(--palette-secondary-text, #CBD5E1); font-size: 13px; line-height: 1.6;">
          <div style="font-weight: 700; color: var(--palette-soft-white, #FFFFFF);" data-i18n="footer.operationalOffice">${f('footer.operationalOffice', 'Badan Usaha &amp; Alamat Operasional:', 'Operational Office & Mailing Address:')}</div>
          <div>${businessProfile.address.entity}</div>
          <div>${businessProfile.address.street}</div>
          <div>${businessProfile.address.city} ${businessProfile.address.postalCode}</div>
          <div>${businessProfile.address.country}</div>
        </div>
      </div>

      <div class="footer-col footer-contact-col">
        <div style="font-weight: 700; color: var(--palette-soft-white, #FFFFFF); margin-bottom: 12px; font-size: 14px;" data-i18n="footer.officialContact">${f('footer.officialContact', 'Kontak Resmi', 'Official Contact')}</div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <div>
            <span style="color: var(--palette-secondary-text, #CBD5E1);" data-i18n="footer.customerSupport">${f('footer.customerSupport', 'Layanan Pengguna:', 'Customer Support:')}</span>
            <a href="mailto:support@tikum.app" style="color: var(--palette-terracotta, #E36F45); text-decoration: none; margin-left: 6px; font-weight: 600;">support@tikum.app</a>
          </div>
          <div>
            <span style="color: var(--palette-secondary-text, #CBD5E1);" data-i18n="footer.legalCorrespondence">${f('footer.legalCorrespondence', 'Korespondensi Legal:', 'Legal Correspondence:')}</span>
            <a href="${businessProfile.emailUrl}" style="color: var(--palette-warm-sand, #F3EBDD); text-decoration: none; margin-left: 6px;">${businessProfile.email}</a>
          </div>
          <div>
            <span style="color: var(--palette-secondary-text, #CBD5E1);">WhatsApp:</span>
            <a href="${businessProfile.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="color: #34d399; text-decoration: none; margin-left: 6px;"><i class="fa-brands fa-whatsapp"></i> ${businessProfile.whatsappDisplayNumber}</a>
          </div>
          <div style="color: var(--palette-secondary-text, #CBD5E1); font-size: 12px; margin-top: 4px;" data-i18n="footer.supportHoursValue">
            ${f('footer.supportHoursValue', 'Jam Operasional: Senin – Minggu: 09:00 – 21:00 WIB', 'Operating Hours: Monday – Sunday: 09:00 – 21:00 WIB')}
          </div>
        </div>
      </div>

      <div class="footer-col footer-trust-col">
        <div style="font-weight: 700; color: var(--palette-soft-white, #FFFFFF); margin-bottom: 12px; font-size: 14px;" data-i18n="footer.trust">${f('footer.trust', 'Infrastruktur Kepercayaan', 'Trust Infrastructure')}</div>
        <div class="footer-links" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <a href="/about" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-circle-info"></i> <span data-i18n="footer.aboutTikum">${f('footer.aboutTikum', 'Tentang TIKUM', 'About TIKUM')}</span></a>
          <a href="/how-it-works" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-circle-nodes"></i> <span data-i18n="footer.how">${f('footer.how', 'Cara Kerja Transaksi', 'How It Works')}</span></a>
          <a href="/how-to-buy" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-basket-shopping"></i> <span data-i18n="footer.buyerGuide">${f('footer.buyerGuide', 'Panduan Pembeli', 'Buyer Guide')}</span></a>
          <a href="/how-to-sell" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-tags"></i> <span data-i18n="footer.sellerGuide">${f('footer.sellerGuide', 'Panduan Penjual', 'Seller Guide')}</span></a>
          <a href="/ticket-verification" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-qrcode"></i> <span data-i18n="footer.ticketVerification">${f('footer.ticketVerification', 'Verifikasi Tiket', 'Ticket Verification')}</span></a>
          <a href="/buyer-protection" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-shield-heart"></i> <span data-i18n="footer.buyerProt">${f('footer.buyerProt', 'Perlindungan Pembeli', 'Buyer Protection')}</span></a>
          <a href="/fees" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-receipt"></i> <span data-i18n="footer.feeStructure">${f('footer.feeStructure', 'Struktur Biaya Platform', 'Pricing & Fee Structure')}</span></a>
          <a href="/payment-flow" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-money-bill-transfer"></i> <span data-i18n="footer.fundsFlow">${f('footer.fundsFlow', 'Alur Dana & Penahanan Transaksi', 'Funds Flow & Holding')}</span></a>
        </div>
      </div>

      <div class="footer-col footer-links-col">
        <div style="font-weight: 700; color: var(--palette-soft-white, #FFFFFF); margin-bottom: 12px; font-size: 14px;" data-i18n="footer.servicesAndLegal">${f('footer.servicesAndLegal', 'Layanan & Legalitas', 'Services & Legal')}</div>
        <div class="footer-links" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <a href="/pay" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-cash-register"></i> <span data-i18n="footer.checkoutDemo">${f('footer.checkoutDemo', 'Simulasi Checkout (/pay)', 'Checkout Simulation (/pay)')}</span></a>
          <a href="/terms" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-file-contract"></i> <span data-i18n="footer.terms">${f('footer.terms', 'Syarat & Ketentuan', 'Terms of Service')}</span></a>
          <a href="/seller-terms" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-handshake"></i> <span data-i18n="footer.sellerTerms">${f('footer.sellerTerms', 'Ketentuan Penjual', 'Seller Terms')}</span></a>
          <a href="/resale-policy" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-ticket-simple"></i> <span data-i18n="footer.resalePolicy">${f('footer.resalePolicy', 'Kebijakan Penjualan Kembali', 'Secondary Resale Policy')}</span></a>
          <a href="/refund-policy" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-rotate-left"></i> <span data-i18n="footer.refundPolicy">${f('footer.refundPolicy', 'Kebijakan Pengembalian (Refund)', 'Refund Policy')}</span></a>
          <a href="/disputes" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-scale-balanced"></i> <span data-i18n="footer.disputes">${f('footer.disputes', 'Prosedur Sengketa (Disputes)', 'Dispute Resolution')}</span></a>
          <a href="/faq" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-circle-question"></i> <span data-i18n="footer.faq">${f('footer.faq', 'FAQ / Pertanyaan Umum', 'FAQ / Help')}</span></a>
          <a href="/privacy" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-user-shield"></i> <span data-i18n="footer.privacyPolicy">${f('footer.privacyPolicy', 'Kebijakan Privasi (UU PDP)', 'Privacy Policy (PDP Law)')}</span></a>
          <a href="/contact" style="color: var(--palette-secondary-text, #CBD5E1); text-decoration: none;"><i class="fa-solid fa-address-book"></i> <span data-i18n="footer.contactUs">${f('footer.contactUs', 'Kontak Kami', 'Contact Us')}</span></a>
        </div>
      </div>
    </div>
    <div style="max-width: 1240px; margin: 32px auto 0; padding-top: 16px; border-top: 1px solid rgba(203, 213, 225, 0.18); text-align: center; font-size: 12px; color: var(--palette-secondary-text, #CBD5E1);" data-i18n="footer.allRightsReserved">
      ${f('footer.allRightsReserved', '&copy; 2026 PT SHINERVA PRAJNA TEJAS. Seluruh hak cipta dilindungi undang-undang. TIKUM adalah platform marketplace tiket sekunder yang dioperasikan oleh PT SHINERVA PRAJNA TEJAS.', '&copy; 2026 PT SHINERVA PRAJNA TEJAS. All rights reserved. TIKUM is a verified secondary ticket marketplace operated by PT SHINERVA PRAJNA TEJAS.')}
    </div>
  </footer>
  `;
}

module.exports = {
  businessProfile,
  renderFooterHtml
};
