/**
 * TIKUM Shared Header Architecture (6 Variants, 5 Languages, Dark Mode Locked)
 * Renders consistent SSR chrome and brand logo slots for Express routes without a frontend framework.
 * Zero customer-facing ARGUS references (ARGUS Trust Engine strictly isolated to admin variant).
 */

const { normalizeLocale, resolveRequestLocale } = require('../i18n');

const HEADER_VARIANTS = {
  PUBLIC: 'public',
  MARKETPLACE: 'marketplace',
  AUTH: 'auth',
  BUYER_DASHBOARD: 'buyer-dashboard',
  SELLER_DASHBOARD: 'seller-dashboard',
  ADMIN: 'admin'
};

function renderSharedHeadAssets(options = {}) {
  const { includeI18n = false } = options;
  return `<meta name="theme-color" content="#172333">
  <link rel="icon" type="image/svg+xml" href="/images/tikum-brand-symbol.svg">
  <link rel="stylesheet" href="/css/tikum-tokens.css">
  <link rel="stylesheet" href="/css/header-shared.css">
  <script src="/js/theme.js"></script>${includeI18n ? '\n  <script src="/js/i18n.js"></script>' : ''}`;
}

function renderSharedFooterScripts(options = {}) {
  const { includeI18n = true } = options;
  const parts = [];
  if (includeI18n) parts.push('<script src="/js/i18n.js"></script>');
  parts.push('<script src="/js/header-shared.js"></script>');
  return parts.join('\n  ');
}

function renderLogoSlot(variant = HEADER_VARIANTS.PUBLIC) {
  const slotClass = variant === HEADER_VARIANTS.AUTH
    ? 'tikum-logo-slot tikum-logo-slot--auth'
    : variant === HEADER_VARIANTS.BUYER_DASHBOARD || variant === HEADER_VARIANTS.SELLER_DASHBOARD
      ? 'tikum-logo-slot tikum-logo-slot--dash'
      : variant === HEADER_VARIANTS.ADMIN
        ? 'tikum-logo-slot tikum-logo-slot--admin'
        : 'tikum-logo-slot';

  return `<span class="${slotClass}" aria-label="TIKUM">
    <img src="/images/tikum-brand-horizontal.svg" class="tikum-logo-img" alt="TIKUM" width="196" height="42">
  </span>`;
}

function renderSymbolSlot() {
  return `<span class="tikum-symbol-slot" aria-hidden="true">
    <img src="/images/tikum-brand-symbol.svg" class="tikum-logo-img" alt="" width="36" height="36">
  </span>`;
}

const SSR_NAV_LABELS = {
  id: {
    events: 'Katalog Event',
    offers: 'Tawaran Tiket',
    blog: 'Panduan',
    how: 'Cara Kerja',
    sell: 'Jual Tiket',
    track: 'Lacak',
    deal: 'Buka Deal',
    venues: 'Venue',
    cities: 'Kota',
    promoters: 'Promotor APMI',
    buyerProt: 'Perlindungan Pembeli',
    verification: 'Verifikasi Tiket',
    escrow: 'Dana Terlindungi',
    disputes: 'Resolusi Sengketa',
    buyerDash: 'Dasbor Pembeli',
    sellerDash: 'Dasbor Penjual',
    signIn: 'Masuk / Daftar',
    adminTitle: 'TIKUM Operations Console — ARGUS Trust Engine',
    menu: 'Buka Menu Navigasi',
    close: 'Tutup Menu'
  },
  en: {
    events: 'Events',
    offers: 'Offers',
    blog: 'Guides',
    how: 'How It Works',
    sell: 'Sell Ticket',
    track: 'Track',
    deal: 'Open Deal',
    venues: 'Venues',
    cities: 'Cities',
    promoters: 'APMI Promoters',
    buyerProt: 'Buyer Protection',
    verification: 'Ticket Verification',
    escrow: 'Protected Settlement',
    disputes: 'Dispute Resolution',
    buyerDash: 'Buyer Dashboard',
    sellerDash: 'Seller Dashboard',
    signIn: 'Sign In / Sign Up',
    adminTitle: 'TIKUM Operations Console — ARGUS Trust Engine',
    menu: 'Open Navigation Menu',
    close: 'Close Menu'
  },
  ms: {
    events: 'Katalog Acara',
    offers: 'Tawaran Tiket',
    blog: 'Panduan',
    how: 'Cara Berfungsi',
    sell: 'Jual Tiket',
    track: 'Jejak',
    deal: 'Buka Transaksi',
    venues: 'Lokasi',
    cities: 'Bandar',
    promoters: 'Penganjur APMI',
    buyerProt: 'Perlindungan Pembeli',
    verification: 'Pengesahan Tiket',
    escrow: 'Dana Terlindung',
    disputes: 'Penyelesaian Pertikaian',
    buyerDash: 'Papan Pemuka Pembeli',
    sellerDash: 'Papan Pemuka Penjual',
    signIn: 'Log Masuk / Daftar',
    adminTitle: 'TIKUM Operations Console — ARGUS Trust Engine',
    menu: 'Buka Menu Navigasi',
    close: 'Tutup Menu'
  },
  tl: {
    events: 'Mga Kaganapan',
    offers: 'Mga Alok',
    blog: 'Mga Gabay',
    how: 'Paano Ito Gumagana',
    sell: 'Magbenta ng Tiket',
    track: 'Subaybayan',
    deal: 'Buksan ang Deal',
    venues: 'Mga Venue',
    cities: 'Mga Lungsod',
    promoters: 'APMI Promoters',
    buyerProt: 'Proteksyon ng Mamimili',
    verification: 'Beripikasyon ng Tiket',
    escrow: 'Protektadong Escrow',
    disputes: 'Pagresolba ng Alitan',
    buyerDash: 'Dashboard ng Mamimili',
    sellerDash: 'Dashboard ng Nagbebenta',
    signIn: 'Mag-sign In / Magparehistro',
    adminTitle: 'TIKUM Operations Console — ARGUS Trust Engine',
    menu: 'Buksan ang Menu',
    close: 'Isara ang Menu'
  },
  th: {
    events: 'แคตตาล็อกงานอีเวนต์',
    offers: 'ข้อเสนอราคา',
    blog: 'คู่มือ',
    how: 'วิธีการทำงาน',
    sell: 'ขายบัตร',
    track: 'ติดตามดีล',
    deal: 'เปิดห้องดีล',
    venues: 'สถานที่จัดงาน',
    cities: 'เมือง',
    promoters: 'ผู้จัดงาน APMI',
    buyerProt: 'การคุ้มครองผู้ซื้อ',
    verification: 'การตรวจสอบบัตร',
    escrow: 'การคุ้มครองเอสโครว์',
    disputes: 'การระงับข้อพิพาท',
    buyerDash: 'แดชบอร์ดผู้ซื้อ',
    sellerDash: 'แดชบอร์ดผู้ขาย',
    signIn: 'เข้าสู่ระบบ / สมัครสมาชิก',
    adminTitle: 'TIKUM Operations Console — ARGUS Trust Engine',
    menu: 'เปิดเมนูนำทาง',
    close: 'ปิดเมนู'
  }
};

function getDefaultLinksForVariant(variant, labels, activeNav = '') {
  if (variant === HEADER_VARIANTS.MARKETPLACE) {
    return [
      { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: labels.events, active: activeNav === 'events' },
      { href: '/deal', icon: 'fa-shield-halved', key: 'nav.dealRoomLookup', label: labels.deal, active: activeNav === 'deal' },
      { href: '/offers', icon: 'fa-handshake', key: 'nav.offers', label: labels.offers, active: activeNav === 'offers' },
      { href: '/track', icon: 'fa-magnifying-glass', key: 'nav.track', label: labels.track, active: activeNav === 'track' },
      { href: '/create', icon: 'fa-plus-circle', key: 'nav.sellTicket', label: labels.sell, cta: true }
    ];
  }
  if (variant === HEADER_VARIANTS.AUTH) {
    return [
      { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: labels.events, active: activeNav === 'events' },
      { href: '/how-it-works', icon: 'fa-circle-nodes', key: 'footer.how', label: labels.how, active: activeNav === 'trust' },
      { href: '/create', icon: 'fa-plus-circle', key: 'nav.sellTicket', label: labels.sell, cta: true }
    ];
  }
  if (variant === HEADER_VARIANTS.BUYER_DASHBOARD || variant === HEADER_VARIANTS.SELLER_DASHBOARD) {
    return [
      { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: labels.events, active: activeNav === 'events' },
      { href: '/offers', icon: 'fa-handshake', key: 'nav.offers', label: labels.offers, active: activeNav === 'offers' },
      { href: '/track', icon: 'fa-magnifying-glass', key: 'nav.track', label: labels.track, active: activeNav === 'track' },
      { href: '/app/buyer', icon: 'fa-ticket', key: 'nav.buyerDashboard', label: labels.buyerDash, active: variant === HEADER_VARIANTS.BUYER_DASHBOARD },
      { href: '/app/seller', icon: 'fa-store', key: 'nav.sellerDashboard', label: labels.sellerDash, active: variant === HEADER_VARIANTS.SELLER_DASHBOARD },
      { href: '/create', icon: 'fa-plus-circle', key: 'nav.sellTicket', label: labels.sell, cta: true }
    ];
  }
  if (variant === HEADER_VARIANTS.ADMIN) {
    return [
      { href: '/admin', icon: 'fa-gauge-high', label: 'Operations Console', active: true },
      { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: labels.events },
      { href: '/track', icon: 'fa-magnifying-glass', key: 'nav.track', label: labels.track }
    ];
  }
  // Default: HEADER_VARIANTS.PUBLIC
  return [
    { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: labels.events, active: activeNav === 'events' },
    { href: '/offers', icon: 'fa-handshake', key: 'nav.offers', label: labels.offers, active: activeNav === 'offers' },
    { href: '/blog', icon: 'fa-newspaper', key: 'nav.blog', label: labels.blog, active: activeNav === 'blog' },
    { href: '/how-it-works', icon: 'fa-circle-nodes', key: 'footer.how', label: labels.how, active: activeNav === 'trust' },
    { href: '/create', icon: 'fa-plus-circle', key: 'nav.sellTicket', label: labels.sell, cta: true }
  ];
}

function renderSharedHeader(options = {}) {
  const {
    variant = HEADER_VARIANTS.PUBLIC,
    activeNav = '',
    locale = 'id',
    langBtnId = 'btnLangToggle',
    links = null,
    homeHref = '/',
    showAuthLink = false,
    drawerId = 'tikumSsrDrawer'
  } = options;

  const lang = normalizeLocale(locale);
  const labels = SSR_NAV_LABELS[lang] || SSR_NAV_LABELS.id;
  const navItems = Array.isArray(links) && links.length ? links : getDefaultLinksForVariant(variant, labels, activeNav);

  const headerClass = variant === HEADER_VARIANTS.AUTH
    ? 'auth-header tikum-shared-header'
    : (variant === HEADER_VARIANTS.BUYER_DASHBOARD || variant === HEADER_VARIANTS.SELLER_DASHBOARD)
      ? 'site-header dash-header tikum-shared-header'
      : variant === HEADER_VARIANTS.ADMIN
        ? 'site-header ops-header tikum-shared-header'
        : 'site-header tikum-shared-header';

  const desktopLinksHtml = navItems.map((item) => {
    const cls = ['nav-link', item.active ? 'active' : '', item.cta ? 'nav-link-cta' : ''].filter(Boolean).join(' ');
    const i18nAttr = item.key ? ` data-i18n="${item.key}"` : '';
    const iconHtml = item.icon ? `<i class="fa-solid ${item.icon}" aria-hidden="true"></i> ` : '';
    return `<a href="${item.href}" class="${cls}">${iconHtml}<span${i18nAttr}>${item.label}</span></a>`;
  }).join('\n        ');

  const drawerLinksHtml = navItems.map((item) => {
    const cls = ['tikum-mobile-drawer__link', item.active ? 'active' : ''].filter(Boolean).join(' ');
    const i18nAttr = item.key ? ` data-i18n="${item.key}"` : '';
    const iconHtml = item.icon ? `<i class="fa-solid ${item.icon}" aria-hidden="true"></i> ` : '';
    return `<a href="${item.href}" class="${cls}">${iconHtml}<span${i18nAttr}>${item.label}</span></a>`;
  }).join('\n        ');

  const authBtnHtml = showAuthLink
    ? `<a href="/login" class="btn-auth-header" data-i18n="nav.signInSignUp">${labels.signIn}</a>`
    : '';

  const adminPillHtml = variant === HEADER_VARIANTS.ADMIN
    ? `<span style="font-size:12px; color:var(--palette-warm-sand, #F3EBDD); font-weight:700; margin-left:6px;">ARGUS Trust Engine</span>`
    : '';

  return `
  <header class="${headerClass}" data-header-variant="${variant}">
    <div class="header-container">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        <button type="button" class="tikum-mobile-toggle" aria-controls="${drawerId}" aria-expanded="false" aria-label="${labels.menu}">
          <i class="fa-solid fa-bars" aria-hidden="true"></i>
        </button>
        <a href="${homeHref}" class="brand">
          ${renderLogoSlot(variant)}
          <div class="brand-title">Tikum</div>
        </a>
        ${adminPillHtml}
      </div>
      <nav class="main-nav" aria-label="Main navigation">
        ${desktopLinksHtml}
      </nav>
      <div class="nav-controls" style="display:inline-flex; align-items:center; gap:8px;">
        ${authBtnHtml}
        <button id="${langBtnId}" type="button" class="lang-toggle-btn tikum-lang-btn" aria-label="Select Language">${lang.toUpperCase()}</button>
      </div>
    </div>
  </header>
  <div id="${drawerId}" class="tikum-mobile-drawer" aria-label="Mobile Navigation">
    <div class="tikum-mobile-drawer__backdrop"></div>
    <div class="tikum-mobile-drawer__panel">
      <div class="tikum-mobile-drawer__head">
        <a href="${homeHref}" class="brand" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;">
          ${renderLogoSlot(variant)}
        </a>
        <button type="button" class="tikum-header-control" data-drawer-close aria-label="${labels.close}">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div class="tikum-mobile-drawer__links">
        ${drawerLinksHtml}
      </div>
    </div>
  </div>`;
}

function renderSharedPublicHeader(options = {}) {
  return renderSharedHeader({ variant: HEADER_VARIANTS.PUBLIC, ...options });
}

module.exports = {
  HEADER_VARIANTS,
  SSR_NAV_LABELS,
  resolveRequestLocale,
  renderSharedHeadAssets,
  renderSharedFooterScripts,
  renderLogoSlot,
  renderSymbolSlot,
  renderSharedHeader,
  renderSharedPublicHeader
};
