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
  parentCompany: 'Shinerva',
  parentEntity: 'SHINERVA HQ',
  engineName: 'ARGUS Trust Engine',
  canonicalRelationship: 'Tikum — Verified Ticket Marketplace by Shinerva',
  primaryDomain: 'tikum.app',
  canonicalDomain: 'https://tikum.app',
  canonicalOrigin: 'https://tikum.app',

  // Official Business Entity for iPaymu compliance
  name: 'SHINERVA HQ',
  email: 'agunsux@gmail.com',
  phone: '081299927378',
  whatsappNumber: '081299927378',
  whatsappUrl: 'https://wa.me/6281299927378',
  emailUrl: 'mailto:agunsux@gmail.com',

  // Official Business & Transactional Email Routing Identities (Cloudflare Email Routing)
  supportEmail: 'support@tikum.app',
  helloEmail: 'hello@tikum.app',
  adminEmail: 'admin@tikum.app',
  picEmail: 'pic@tikum.app',
  address: {
    entity: 'SHINERVA HQ',
    street: 'Jl. Pasirluyu No. 79',
    city: 'Bandung',
    postalCode: '40254',
    country: 'Indonesia',
    formattedText: 'SHINERVA HQ\nJl. Pasirluyu No. 79\nBandung 40254\nIndonesia',
    inlineText: 'SHINERVA HQ, Jl. Pasirluyu No. 79, Bandung 40254, Indonesia',
    htmlBlock: '<strong>SHINERVA HQ</strong><br>Jl. Pasirluyu No. 79<br>Bandung 40254<br>Indonesia'
  },
  legalLinks: {
    faq: '/faq',
    terms: '/terms',
    refundPolicy: '/refund-policy',
    contact: '/contact',
    privacy: '/privacy'
  }
};

function renderFooterHtml() {
  return `
  <footer class="site-footer" style="background: rgba(10, 15, 29, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 48px 24px 32px; margin-top: 60px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div class="footer-container" style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 40px;">
      <div class="footer-col footer-business">
        <div style="font-weight: 800; font-size: 16px; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-shield-halved" style="color: #06b6d4;"></i> TIKUM — by SHINERVA
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 12px; max-width: 380px;">
          Marketplace tiket sekunder terverifikasi. Transaksi aman dengan rekening penampungan internal (escrow) dan pendampingan fisik di gerbang venue.
        </p>
        <div class="footer-address" style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
          <div style="font-weight: 700; color: #cbd5e1;">Kantor Operasional &amp; Surat:</div>
          <div>${businessProfile.address.entity}</div>
          <div>${businessProfile.address.street}</div>
          <div>${businessProfile.address.city} ${businessProfile.address.postalCode}</div>
          <div>${businessProfile.address.country}</div>
        </div>
      </div>

      <div class="footer-col footer-contact-col">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 14px;">Kontak Resmi</div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <div>
            <span style="color: #64748b;">Email:</span>
            <a href="${businessProfile.emailUrl}" style="color: #06b6d4; text-decoration: none; margin-left: 6px;">${businessProfile.email}</a>
          </div>
          <div>
            <span style="color: #64748b;">WhatsApp:</span>
            <a href="${businessProfile.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="color: #34d399; text-decoration: none; margin-left: 6px;"><i class="fa-brands fa-whatsapp"></i> ${businessProfile.phone}</a>
          </div>
        </div>
      </div>

      <div class="footer-col footer-links-col">
        <div style="font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 14px;">Layanan &amp; Legalitas</div>
        <div class="footer-links" style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <a href="${businessProfile.legalLinks.faq}" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-circle-question"></i> FAQ / Pertanyaan Umum</a>
          <a href="${businessProfile.legalLinks.terms}" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-file-contract"></i> Syarat &amp; Ketentuan</a>
          <a href="${businessProfile.legalLinks.refundPolicy}" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-rotate-left"></i> Kebijakan Pengembalian Dana (Refund)</a>
          <a href="${businessProfile.legalLinks.contact}" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-address-book"></i> Kontak Kami</a>
          <a href="${businessProfile.legalLinks.privacy}" style="color: #94a3b8; text-decoration: none;"><i class="fa-solid fa-user-shield"></i> Kebijakan Privasi (UU PDP)</a>
        </div>
      </div>
    </div>
    <div style="max-width: 1200px; margin: 32px auto 0; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center; font-size: 12px; color: #64748b;">
      &copy; 2026 SHINERVA HQ. Seluruh hak cipta dilindungi undang-undang. TIKUM — by SHINERVA.
    </div>
  </footer>
  `;
}

module.exports = {
  businessProfile,
  renderFooterHtml
};
