/**
 * TIKUM Trust Authority Pages Router
 * Delivers authoritative SSR trust infrastructure pages across 5 canonical locales (id, en, ms, tl, th):
 * - /how-it-works
 * - /buyer-protection (/panduan-pembeli, /how-to-buy)
 * - /seller-protection (/panduan-penjual, /how-to-sell)
 * - /ticket-verification
 * - /escrow
 * - /disputes (/dispute-resolution)
 * - /about, /fees, /seller-terms, /resale-policy, /payment-flow
 *
 * Grounding Invariant:
 * Strictly documents real TIKUM platform-held settlement safeguards, gate verification, and dispute resolution mechanisms.
 * Never invents nonexistent capabilities. Truthful copy without absolute claims.
 */

const express = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const router = express.Router();
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');
const { StructuredDataFactory } = require('../seo/StructuredDataFactory');
const { renderFooterHtml, businessProfile } = require('../config/businessProfile');
const { t, normalizeLocale } = require('../i18n');
const { getTrustCopy } = require('./trustPagesLocales');
const {
  HEADER_VARIANTS,
  renderSharedHeadAssets,
  renderSharedFooterScripts,
  renderSharedHeader,
  resolveRequestLocale
} = require('../ui/sharedHeader');

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveRequestLang(req) {
  return normalizeLocale(resolveRequestLocale(req));
}

function renderPicCoverage(lang) {
  const copy = (tag, key, attrs = '') => `<${tag}${attrs} data-i18n="picCoverage.${key}">${escHtml(t(`picCoverage.${key}`, lang))}</${tag}>`;
  return `<section class="pic-coverage" aria-labelledby="pic-coverage-heading">
    ${copy('h2', 'heading', ' id="pic-coverage-heading"')}
    ${['regular', 'other', 'operation'].map(key => copy('p', key)).join('\n')}
    <a href="${businessProfile.whatsappUrl}" target="_blank" rel="noopener noreferrer">WhatsApp: ${businessProfile.whatsappDisplayNumber}</a>
  </section>`;
}

const termsTemplate = readFileSync(path.join(__dirname, '../../public/terms.html'), 'utf8');
const createTemplate = readFileSync(path.join(__dirname, '../../public/create.html'), 'utf8');
router.get('/terms', (req, res) => {
  const lang = resolveRequestLang(req);
  res.vary('Cookie').type('html').send(termsTemplate
    .replace('<html lang="id"', `<html lang="${lang}"`)
    .replace(/<!-- PIC_COVERAGE_START -->[\s\S]*?<!-- PIC_COVERAGE_END -->/, () => renderPicCoverage(lang)));
});

router.get(['/create', '/deal/create'], (req, res) => {
  const lang = resolveRequestLang(req);
  res.vary('Cookie').type('html').send(createTemplate
    .replace('<html lang="id"', `<html lang="${lang}"`)
    .replace(/(data-i18n="picCoverage\.(\w+)"[^>]*>)[^<]*/g, (_, tag, key) => tag + escHtml(t(`picCoverage.${key}`, lang))));
});

function renderTrustNavHeader(activePath = '', lang = 'id') {
  const loc = normalizeLocale(lang);
  return renderSharedHeader({
    variant: HEADER_VARIANTS.PUBLIC,
    activeNav: activePath === '/blog' ? 'blog' : 'trust',
    locale: loc,
    links: [
      { href: '/events', icon: 'fa-calendar-days', key: 'nav.events', label: escHtml(t('nav.events', loc)) },
      { href: '/blog', icon: 'fa-newspaper', key: 'nav.blog', label: escHtml(t('nav.blog', loc)), active: activePath === '/blog' },
      { href: '/how-it-works', icon: 'fa-circle-nodes', key: 'footer.how', label: escHtml(t('footer.how', loc)), active: activePath === '/how-it-works' },
      { href: '/buyer-protection', icon: 'fa-shield-heart', key: 'footer.buyerProt', label: escHtml(t('footer.buyerProt', loc)), active: activePath === '/buyer-protection' },
      { href: '/ticket-verification', icon: 'fa-qrcode', key: 'footer.verifInfo', label: escHtml(t('footer.verifInfo', loc)), active: activePath === '/ticket-verification' },
      { href: '/create', icon: 'fa-plus-circle', key: 'nav.sellTicket', label: escHtml(t('nav.sellTicket', loc)), cta: true }
    ]
  });
}

function renderTrustLayout({ lang = 'id', title, description, canonicalPath, h1, h1Key, subtitle, subtitleKey, breadcrumbKey, breadcrumbs, faqPairs = [], contentHtml }) {
  const loc = normalizeLocale(lang);
  const breadcrumbJsonLd = StructuredDataFactory.createBreadcrumbSchema(breadcrumbs);
  const faqJsonLd = faqPairs.length > 0 ? StructuredDataFactory.createFAQSchema(faqPairs) : null;
  const jsonLd = faqPairs.length > 0 ? [breadcrumbJsonLd, faqJsonLd] : breadcrumbJsonLd;

  const headMeta = TechnicalSEOService.renderHeadMeta({
    title,
    description,
    canonicalPath,
    jsonLd
  });

  const faqSectionHtml = faqPairs.length > 0 ? `
    <section style="margin-top:40px; background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:32px;">
      <h2 style="font-size:22px; font-weight:800; color:var(--palette-soft-white, #FFFFFF); margin-bottom:20px;"><i class="fa-solid fa-circle-question" style="color:var(--palette-terracotta, #E36F45);"></i> <span data-i18n="trust.faqHeading">${escHtml(t('trust.faqHeading', loc))}</span></h2>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${faqPairs.map(pair => `
          <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.2); border-radius:10px; padding:20px;">
            <h3 style="font-size:16px; font-weight:700; color:var(--palette-soft-white, #FFFFFF); margin:0 0 8px;"${pair.qKey ? ` data-i18n="${pair.qKey}"` : ''}>${pair.q}</h3>
            <p style="font-size:14px; color:var(--palette-secondary-text, #CBD5E1); line-height:1.6; margin:0;"${pair.aKey ? ` data-i18n="${pair.aKey}"` : ''}>${pair.a}</p>
          </div>
        `).join('')}
      </div>
    </section>
  ` : '';

  return `<!DOCTYPE html>
<html lang="${loc}" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMeta}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  ${renderSharedHeadAssets()}
  <link rel="stylesheet" href="/css/style.css">
  ${canonicalPath === '/buyer-protection' || canonicalPath === '/panduan-pembeli' ? '<link rel="stylesheet" href="/css/pic-coverage.css">' : ''}
</head>
<body class="dark-mode">
  ${renderTrustNavHeader(canonicalPath, loc)}
  <main class="container" style="padding-top:40px; padding-bottom:60px; max-width:920px;">
    <nav style="font-size:13px; color:var(--palette-secondary-text, #CBD5E1); margin-bottom:20px;">
      <a href="/" style="color:var(--palette-warm-sand, #F3EBDD); text-decoration:none;" data-i18n="nav.home">${escHtml(t('nav.home', loc))}</a> &rsaquo;
      <span style="color:var(--palette-soft-white, #FFFFFF);"${breadcrumbKey ? ` data-i18n="${breadcrumbKey}"` : ''}>${escHtml(breadcrumbs[breadcrumbs.length - 1].name)}</span>
    </nav>

    <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:36px; margin-bottom:30px;">
      <div class="hero-pill" data-i18n="trust.badge"><i class="fa-solid fa-shield-halved"></i> <span>${escHtml(t('trust.badge', loc))}</span></div>
      <h1 style="font-size:32px; font-weight:800; color:var(--palette-soft-white, #FFFFFF); margin:14px 0 8px;"${h1Key ? ` data-i18n="${h1Key}"` : ''}>${h1}</h1>
      <p style="color:var(--palette-secondary-text, #CBD5E1); font-size:16px; line-height:1.6;"${subtitleKey ? ` data-i18n="${subtitleKey}"` : ''}>${subtitle}</p>
    </div>

    ${contentHtml}
    ${faqSectionHtml}

    <div style="margin-top:40px; background:var(--palette-primary-blue, #15365B); border:1px solid rgba(227,111,69,0.55); border-radius:12px; padding:28px; text-align:center;">
      <h3 style="font-size:20px; font-weight:800; color:var(--palette-soft-white, #FFFFFF); margin-bottom:8px;" data-i18n="trust.readyHeading">${escHtml(t('trust.readyHeading', loc))}</h3>
      <p style="color:var(--palette-secondary-text, #CBD5E1); font-size:14px; margin-bottom:20px;" data-i18n="trust.readySubtitle">${escHtml(t('trust.readySubtitle', loc))}</p>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <a href="/events" class="btn btn-primary"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="trust.browseCatalogBtn">${escHtml(t('trust.browseCatalogBtn', loc))}</span></a>
        <a href="/create" class="btn btn-secondary"><i class="fa-solid fa-plus-circle"></i> <span data-i18n="trust.sellMyTicketBtn">${escHtml(t('trust.sellMyTicketBtn', loc))}</span></a>
      </div>
    </div>
  </main>
  ${renderFooterHtml(loc, { whatsappSectionId: ['/buyer-protection', '/panduan-pembeli'].includes(canonicalPath) ? 'pic-coverage-heading' : undefined })}
  ${renderSharedFooterScripts()}
</body>
</html>`;
}

// -------------------------------------------------------------
// 1. /how-it-works
// -------------------------------------------------------------
router.get('/how-it-works', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('howItWorks', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${copy.steps.map((step, idx) => `
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:12px; padding:24px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:50%; ${idx === 3 ? 'background:#10b981;' : 'background:var(--palette-primary-blue, #15365B); border:1px solid rgba(227,111,69,0.55);'} color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; flex-shrink:0;">${idx + 1}</div>
          <div>
            <h3 style="font-size:18px; font-weight:700; color:#f8fafc; margin:0 0 6px;">${step.title}</h3>
            <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">${step.desc}</p>
          </div>
        </div>
      </div>
      `).join('')}
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/how-it-works',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/how-it-works' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 2. /buyer-protection, /panduan-pembeli & /how-to-buy
// -------------------------------------------------------------
router.get(['/buyer-protection', '/panduan-pembeli', '/how-to-buy'], (req, res) => {
  const lang = resolveRequestLang(req);
  const bp = (key) => t(`buyerProtectionPage.${key}`, lang);
  const bpEsc = (key) => escHtml(bp(key));

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">

      <!-- 1. Legal Entity & Brand Profile -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <span style="background:var(--palette-primary-blue, #15365B); color:#F3EBDD; border:1px solid rgba(203,213,225,0.28); font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; letter-spacing:0.5px; text-transform:uppercase;" data-i18n="buyerProtectionPage.entityBadge">${bpEsc('entityBadge')}</span>
          <span style="color:#CBD5E1; font-size:13px;" data-i18n="buyerProtectionPage.operatedBy">${bpEsc('operatedBy')}</span>
        </div>
        <h2 style="color:#FFFFFF; font-size:22px; font-weight:800; margin:0 0 10px;" data-i18n="buyerProtectionPage.entityHeading">${bpEsc('entityHeading')}</h2>
        <p style="color:#CBD5E1; font-size:14px; line-height:1.7; margin:0 0 16px;" data-i18n="buyerProtectionPage.entityDescHtml" data-i18n-html="1">
          ${bp('entityDescHtml')}
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px;">
          <div>
            <div style="font-size:12px; color:#CBD5E1; font-weight:700; text-transform:uppercase; margin-bottom:4px;" data-i18n="buyerProtectionPage.addressLabel">${bpEsc('addressLabel')}</div>
            <div style="color:#FFFFFF; font-size:13px; font-weight:600;">PT SHINERVA PRAJNA TEJAS</div>
            <div style="color:#CBD5E1; font-size:13px; line-height:1.5;">Jl. Pasirluyu No. 79<br>Bandung 40254, Indonesia</div>
          </div>
          <div>
            <div style="font-size:12px; color:#CBD5E1; font-weight:700; text-transform:uppercase; margin-bottom:4px;" data-i18n="buyerProtectionPage.supportLabel">${bpEsc('supportLabel')}</div>
            <div style="color:#CBD5E1; font-size:13px; line-height:1.6;">
              <span data-i18n="buyerProtectionPage.emailLabel">${bpEsc('emailLabel')}</span> <a href="mailto:support@tikum.app" style="color:#E36F45; text-decoration:none; font-weight:600;">support@tikum.app</a><br>
              <a href="#pic-coverage-heading">WhatsApp Support</a><br>
              <span data-i18n="buyerProtectionPage.hoursLabel">${bpEsc('hoursLabel')}</span> <span data-i18n="buyerProtectionPage.hoursValue">${bpEsc('hoursValue')}</span>
            </div>
          </div>
        </div>
      </div>

      ${renderPicCoverage(lang)}
      <!-- 2. Products & Services -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 16px;"><i class="fa-solid fa-list-check" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.servicesHeading">${bpEsc('servicesHeading')}</span></h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
          <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px;">
            <h3 style="color:#F3EBDD; font-size:16px; font-weight:700; margin:0 0 8px;"><i class="fa-solid fa-ticket" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.service1Title">${bpEsc('service1Title')}</span></h3>
            <p style="color:#CBD5E1; font-size:13px; line-height:1.6; margin:0;" data-i18n="buyerProtectionPage.service1Desc">${bpEsc('service1Desc')}</p>
          </div>
          <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px;">
            <h3 style="color:#F3EBDD; font-size:16px; font-weight:700; margin:0 0 8px;"><i class="fa-solid fa-shield-check" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.service2Title">${bpEsc('service2Title')}</span></h3>
            <p style="color:#CBD5E1; font-size:13px; line-height:1.6; margin:0;" data-i18n="buyerProtectionPage.service2Desc">${bpEsc('service2Desc')}</p>
          </div>
          <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px;">
            <h3 style="color:#F3EBDD; font-size:16px; font-weight:700; margin:0 0 8px;"><i class="fa-solid fa-user-shield" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.service3Title">${bpEsc('service3Title')}</span></h3>
            <p style="color:#CBD5E1; font-size:13px; line-height:1.6; margin:0;" data-i18n="buyerProtectionPage.service3Desc">${bpEsc('service3Desc')}</p>
          </div>
        </div>
      </div>

      <!-- 3. How It Works -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 16px;"><i class="fa-solid fa-circle-nodes" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.howHeading">${bpEsc('howHeading')}</span></h2>
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <div style="background:#15365B; border:1px solid rgba(227,111,69,0.55); color:#FFFFFF; font-weight:800; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px;">1</div>
            <div>
              <strong style="color:#FFFFFF; font-size:14px;" data-i18n="buyerProtectionPage.step1Title">${bpEsc('step1Title')}</strong>
              <div style="color:#CBD5E1; font-size:13px; line-height:1.5;" data-i18n="buyerProtectionPage.step1DescHtml" data-i18n-html="1">${bp('step1DescHtml')}</div>
            </div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <div style="background:#15365B; border:1px solid rgba(227,111,69,0.55); color:#FFFFFF; font-weight:800; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px;">2</div>
            <div>
              <strong style="color:#FFFFFF; font-size:14px;" data-i18n="buyerProtectionPage.step2Title">${bpEsc('step2Title')}</strong>
              <div style="color:#CBD5E1; font-size:13px; line-height:1.5;" data-i18n="buyerProtectionPage.step2Desc">${bpEsc('step2Desc')}</div>
            </div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <div style="background:#15365B; border:1px solid rgba(227,111,69,0.55); color:#FFFFFF; font-weight:800; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px;">3</div>
            <div>
              <strong style="color:#FFFFFF; font-size:14px;" data-i18n="buyerProtectionPage.step3Title">${bpEsc('step3Title')}</strong>
              <div style="color:#CBD5E1; font-size:13px; line-height:1.5;" data-i18n="buyerProtectionPage.step3DescHtml" data-i18n-html="1">${bp('step3DescHtml')}</div>
            </div>
          </div>
          <div style="display:flex; gap:14px; align-items:flex-start;">
            <div style="background:#E36F45; color:#FFFFFF; font-weight:800; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px;">4</div>
            <div>
              <strong style="color:#FFFFFF; font-size:14px;" data-i18n="buyerProtectionPage.step4Title">${bpEsc('step4Title')}</strong>
              <div style="color:#CBD5E1; font-size:13px; line-height:1.5;" data-i18n="buyerProtectionPage.step4Desc">${bpEsc('step4Desc')}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Transparent Dual-Tier V2 Pricing Policy -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;" id="pricing-details">
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 8px;"><i class="fa-solid fa-tags" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.pricingHeading">${bpEsc('pricingHeading')}</span></h2>
        <p style="color:#CBD5E1; font-size:13px; margin:0 0 16px;" data-i18n="buyerProtectionPage.pricingLead">${bpEsc('pricingLead')}</p>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; color:#CBD5E1; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid rgba(203,213,225,0.25); color:#F3EBDD;">
                <th style="padding:10px 12px;" data-i18n="buyerProtectionPage.colComponent">${bpEsc('colComponent')}</th>
                <th style="padding:10px 12px;" data-i18n="buyerProtectionPage.colRate">${bpEsc('colRate')}</th>
                <th style="padding:10px 12px;" data-i18n="buyerProtectionPage.colDesc">${bpEsc('colDesc')}</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:10px 12px; font-weight:700; color:#FFFFFF;" data-i18n="buyerProtectionPage.tierBName">${bpEsc('tierBName')}</td>
                <td style="padding:10px 12px; color:#F3EBDD; font-weight:700;" data-i18n="buyerProtectionPage.tierBRate">${bpEsc('tierBRate')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.tierBDesc">${bpEsc('tierBDesc')}</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:10px 12px; font-weight:700; color:#FFFFFF;" data-i18n="buyerProtectionPage.tierAName">${bpEsc('tierAName')}</td>
                <td style="padding:10px 12px; color:#E36F45; font-weight:700;" data-i18n="buyerProtectionPage.tierARate">${bpEsc('tierARate')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.tierADesc">${bpEsc('tierADesc')}</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:10px 12px; font-weight:700; color:#FFFFFF;" data-i18n="buyerProtectionPage.listingFeeName">${bpEsc('listingFeeName')}</td>
                <td style="padding:10px 12px; color:#F3EBDD; font-weight:700;" data-i18n="buyerProtectionPage.listingFeeRate">${bpEsc('listingFeeRate')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.listingFeeDesc">${bpEsc('listingFeeDesc')}</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:10px 12px; font-weight:700; color:#FFFFFF;" data-i18n="buyerProtectionPage.minPriceName">${bpEsc('minPriceName')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.minPriceRate">${bpEsc('minPriceRate')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.minPriceDesc">${bpEsc('minPriceDesc')}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px; font-weight:700; color:#FFFFFF;" data-i18n="buyerProtectionPage.markupCapName">${bpEsc('markupCapName')}</td>
                <td style="padding:10px 12px; color:#E36F45; font-weight:700;" data-i18n="buyerProtectionPage.markupCapRate">${bpEsc('markupCapRate')}</td>
                <td style="padding:10px 12px;" data-i18n="buyerProtectionPage.markupCapDesc">${bpEsc('markupCapDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Checkout & DOKU Sandbox Integration -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(227,111,69,0.45); border-radius:14px; padding:28px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <span style="background:var(--palette-primary-blue, #15365B); color:#F3EBDD; border:1px solid rgba(203,213,225,0.28); font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; text-transform:uppercase;" data-i18n="buyerProtectionPage.dokuBadge">${bpEsc('dokuBadge')}</span>
        </div>
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 10px;"><i class="fa-solid fa-cash-register" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.dokuHeading">${bpEsc('dokuHeading')}</span></h2>
        <p style="color:#CBD5E1; font-size:14px; line-height:1.7; margin:0 0 16px;" data-i18n="buyerProtectionPage.dokuDescHtml" data-i18n-html="1">
          ${bp('dokuDescHtml')}
        </p>
        <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:16px; font-size:13px; color:#CBD5E1; line-height:1.6;">
          <strong style="color:#F3EBDD;"><i class="fa-solid fa-triangle-exclamation" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.reviewerNoticeTitle">${bpEsc('reviewerNoticeTitle')}</span></strong><br>
          <span data-i18n="buyerProtectionPage.reviewerNoticeDescHtml" data-i18n-html="1">${bp('reviewerNoticeDescHtml')}</span>
        </div>
      </div>

      <!-- 6. Refund & Dispute Policies -->
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-rotate-left" style="color:#E36F45;"></i> <span data-i18n="buyerProtectionPage.refundHeading">${bpEsc('refundHeading')}</span></h2>
        <p style="color:#CBD5E1; font-size:13px; line-height:1.6; margin:0 0 16px;" data-i18n="buyerProtectionPage.refundLeadHtml" data-i18n-html="1">
          ${bp('refundLeadHtml')}
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
          <div style="background:var(--palette-midnight-navy, #172333); border-left:4px solid #10b981; border-radius:8px; padding:16px;">
            <strong style="color:#10b981; font-size:14px; display:block; margin-bottom:6px;" data-i18n="buyerProtectionPage.eligibleTitle">${bpEsc('eligibleTitle')}</strong>
            <ul style="color:#CBD5E1; font-size:12.5px; line-height:1.6; margin:0; padding-left:18px;">
              <li data-i18n="buyerProtectionPage.eligible1">${bpEsc('eligible1')}</li>
              <li data-i18n="buyerProtectionPage.eligible2">${bpEsc('eligible2')}</li>
              <li data-i18n="buyerProtectionPage.eligible3">${bpEsc('eligible3')}</li>
              <li data-i18n="buyerProtectionPage.eligible4">${bpEsc('eligible4')}</li>
            </ul>
          </div>
          <div style="background:var(--palette-midnight-navy, #172333); border-left:4px solid #ef4444; border-radius:8px; padding:16px;">
            <strong style="color:#ef4444; font-size:14px; display:block; margin-bottom:6px;" data-i18n="buyerProtectionPage.nonEligibleTitle">${bpEsc('nonEligibleTitle')}</strong>
            <ul style="color:#CBD5E1; font-size:12.5px; line-height:1.6; margin:0; padding-left:18px;">
              <li data-i18n="buyerProtectionPage.nonEligible1">${bpEsc('nonEligible1')}</li>
              <li data-i18n="buyerProtectionPage.nonEligible2">${bpEsc('nonEligible2')}</li>
              <li data-i18n="buyerProtectionPage.nonEligible3">${bpEsc('nonEligible3')}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 7. Quick Links Navigation -->
      <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:24px; text-align:center;">
        <h3 style="color:#FFFFFF; font-size:18px; font-weight:800; margin:0 0 12px;" data-i18n="buyerProtectionPage.quickNavHeading">${bpEsc('quickNavHeading')}</h3>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          <a href="/" class="btn btn-secondary btn-sm"><i class="fa-solid fa-house"></i> <span data-i18n="buyerProtectionPage.quickHome">${bpEsc('quickHome')}</span></a>
          <a href="/events" class="btn btn-secondary btn-sm"><i class="fa-solid fa-calendar-days"></i> <span data-i18n="buyerProtectionPage.quickEvents">${bpEsc('quickEvents')}</span></a>
          <a href="/pay" class="btn btn-secondary btn-sm"><i class="fa-solid fa-cash-register"></i> <span data-i18n="buyerProtectionPage.quickCheckout">${bpEsc('quickCheckout')}</span></a>
          <a href="/terms" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-contract"></i> <span data-i18n="buyerProtectionPage.quickTerms">${bpEsc('quickTerms')}</span></a>
          <a href="/refund-policy" class="btn btn-secondary btn-sm"><i class="fa-solid fa-rotate-left"></i> <span data-i18n="buyerProtectionPage.quickRefund">${bpEsc('quickRefund')}</span></a>
          <a href="/contact" class="btn btn-secondary btn-sm"><i class="fa-solid fa-address-book"></i> <span data-i18n="buyerProtectionPage.quickContact">${bpEsc('quickContact')}</span></a>
        </div>
      </div>

    </div>
  `;

  const faqPairs = [
    { q: bpEsc('faq1Q'), a: bpEsc('faq1A'), qKey: 'buyerProtectionPage.faq1Q', aKey: 'buyerProtectionPage.faq1A' },
    { q: bpEsc('faq2Q'), a: bpEsc('faq2A'), qKey: 'buyerProtectionPage.faq2Q', aKey: 'buyerProtectionPage.faq2A' },
    { q: bpEsc('faq3Q'), a: bpEsc('faq3A'), qKey: 'buyerProtectionPage.faq3Q', aKey: 'buyerProtectionPage.faq3A' },
    { q: bpEsc('faq4Q'), a: bpEsc('faq4A'), qKey: 'buyerProtectionPage.faq4Q', aKey: 'buyerProtectionPage.faq4A' }
  ];

  const canonicalPath = req.path === '/buyer-protection' ? '/buyer-protection' : '/panduan-pembeli';

  const html = renderTrustLayout({
    lang,
    title: bp('metaTitle'),
    description: bp('metaDesc'),
    canonicalPath,
    h1: bpEsc('h1'),
    h1Key: 'buyerProtectionPage.h1',
    subtitle: bpEsc('subtitle'),
    subtitleKey: 'buyerProtectionPage.subtitle',
    breadcrumbKey: 'buyerProtectionPage.breadcrumb',
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: bp('breadcrumb'), url: canonicalPath }
    ],
    faqPairs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 3. /seller-protection, /panduan-penjual & /how-to-sell
// -------------------------------------------------------------
router.get(['/seller-protection', '/panduan-penjual', '/how-to-sell'], (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('sellerProtection', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${copy.cards.map((c, idx) => `
      <div style="background:var(--palette-surface, #24364D); border:1px solid ${idx === 0 ? 'rgba(227,111,69,0.45)' : 'rgba(203,213,225,0.22)'}; border-radius:12px; padding:24px;">
        <h3 style="color:${c.color}; font-size:18px; margin:0 0 8px;"><i class="fa-solid ${c.icon}"></i> ${c.title}</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">${c.body}</p>
      </div>
      `).join('')}
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/seller-protection',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/seller-protection' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 4. /ticket-verification
// -------------------------------------------------------------
router.get('/ticket-verification', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('ticketVerification', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${copy.cards.map(c => `
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:12px; padding:24px;">
        <h3 style="color:${c.color}; font-size:18px; margin:0 0 8px;"><i class="fa-solid ${c.icon}"></i> ${c.title}</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">${c.body}</p>
      </div>
      `).join('')}
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/ticket-verification',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/ticket-verification' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 5. /escrow
// -------------------------------------------------------------
router.get('/escrow', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('escrow', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${copy.cards.map(c => `
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:12px; padding:24px;">
        <h3 style="color:${c.color}; font-size:18px; margin:0 0 8px;"><i class="fa-solid ${c.icon}"></i> ${c.title}</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">${c.body}</p>
      </div>
      `).join('')}
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/escrow',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/escrow' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 6. /disputes & /dispute-resolution
// -------------------------------------------------------------
router.get(['/disputes', '/dispute-resolution'], (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('disputes', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      ${copy.cards.map(c => `
      <div style="background:var(--palette-surface, #24364D); border:1px solid ${c.border || 'rgba(203,213,225,0.22)'}; border-radius:12px; padding:24px;">
        <h3 style="color:${c.color}; font-size:18px; margin:0 0 8px;"><i class="fa-solid ${c.icon}"></i> ${c.title}</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0;">${c.body}</p>
      </div>
      `).join('')}
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/disputes',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/disputes' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 7. /about — Official Business Identity & Operational Disclosures
// -------------------------------------------------------------
router.get('/about', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('about', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(227,111,69,0.45); border-radius:14px; padding:28px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; letter-spacing:0.5px; text-transform:uppercase;">${copy.entityBadge}</span>
          <span style="color:#CBD5E1; font-size:13px;">${copy.operatedBy}</span>
        </div>
        <h2 style="color:#f8fafc; font-size:22px; font-weight:800; margin:0 0 10px;">${copy.heading}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 16px;">${copy.body}</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px; background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px;">
          <div>
            <div style="font-size:12px; color:#CBD5E1; font-weight:700; text-transform:uppercase; margin-bottom:4px;">${copy.addressLabel}</div>
            <div style="color:#f8fafc; font-size:13px; font-weight:600;">PT SHINERVA PRAJNA TEJAS</div>
            <div style="color:#cbd5e1; font-size:13px; line-height:1.5;">Jl. Pasirluyu No. 79<br>Bandung 40254, Indonesia</div>
          </div>
          <div>
            <div style="font-size:12px; color:#CBD5E1; font-weight:700; text-transform:uppercase; margin-bottom:4px;">${copy.contactLabel}</div>
            <div style="color:#cbd5e1; font-size:13px; line-height:1.6;">
              Email: <a href="mailto:support@tikum.app" style="color:#38bdf8; text-decoration:none; font-weight:600;">support@tikum.app</a><br>
              WhatsApp: <a href="${businessProfile.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="color:#34d399; text-decoration:none; font-weight:600;">${businessProfile.whatsappDisplayNumber}</a><br>
              ${copy.hours}
            </div>
          </div>
        </div>
      </div>

      <div style="background:var(--palette-surface, #24364D); border:1px solid #f59e0b; border-radius:14px; padding:28px;">
        <h3 style="color:#f59e0b; font-size:18px; font-weight:700; margin:0 0 10px;"><i class="fa-solid fa-triangle-exclamation"></i> ${copy.disclaimerTitle}</h3>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0;">${copy.disclaimerBody}</p>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:18px;">
        ${copy.pillars.map(p => `
        <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:12px; padding:22px;">
          <h3 style="color:${p.color}; font-size:16px; margin:0 0 8px;"><i class="fa-solid ${p.icon}"></i> ${p.title}</h3>
          <p style="color:#cbd5e1; font-size:13px; line-height:1.6; margin:0;">${p.body}</p>
        </div>
        `).join('')}
      </div>
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/about',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/about' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 8. /fees — Platform Fees & Transparent Pricing Structure
// -------------------------------------------------------------
router.get('/fees', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('fees', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#FFFFFF; font-size:20px; font-weight:800; margin:0 0 16px;"><i class="fa-solid fa-receipt" style="color:#E36F45;"></i> ${copy.heading}</h2>
        <p style="color:#CBD5E1; font-size:14px; line-height:1.6; margin:0 0 20px;">${copy.lead}</p>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13.5px; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid rgba(203,213,225,0.25); color:#F3EBDD;">
                <th style="padding:12px;">${copy.cols[0]}</th>
                <th style="padding:12px;">${copy.cols[1]}</th>
                <th style="padding:12px;">${copy.cols[2]}</th>
              </tr>
            </thead>
            <tbody>
              ${copy.rows.map((r, i) => `
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:12px; color:#FFFFFF; font-weight:700;">${r[0]}</td>
                <td style="padding:12px; color:${(i === 2 || i === 3) ? '#E36F45' : '#F3EBDD'}; font-weight:700;">${r[1]}</td>
                <td style="padding:12px; color:#CBD5E1;">${r[2]}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:20px; background:var(--palette-midnight-navy, #172333); border:1px solid rgba(227,111,69,0.45); border-radius:10px; padding:18px;">
          <h3 style="color:#E36F45; font-size:15px; margin:0 0 6px;"><i class="fa-solid fa-money-bill-transfer"></i> ${copy.flowHeading}</h3>
          <p style="color:#CBD5E1; font-size:13px; line-height:1.6; margin:0;">${copy.flowBodyHtml}</p>
        </div>
      </div>
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/fees',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/fees' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 9. /seller-terms — Seller Obligations & Listing Requirements
// -------------------------------------------------------------
router.get('/seller-terms', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('sellerTerms', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 16px;"><i class="fa-solid fa-handshake" style="color:#10b981;"></i> ${copy.heading}</h2>
        <div style="display:flex; flex-direction:column; gap:16px;">
          ${copy.items.map(it => `
          <div style="background:var(--palette-midnight-navy, #172333); border:1px solid ${it.border || 'rgba(203,213,225,0.22)'}; border-radius:10px; padding:20px;">
            <h3 style="color:${it.color}; font-size:16px; margin:0 0 8px;">${it.title}</h3>
            <p style="color:#cbd5e1; font-size:13.5px; line-height:1.6; margin:0;">${it.body}</p>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/seller-terms',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/seller-terms' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 10. /resale-policy — Secondary Ticket Resale & Organizer Policy
// -------------------------------------------------------------
router.get('/resale-policy', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('resalePolicy', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-circle-nodes" style="color:#38bdf8;"></i> ${copy.roleTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">${copy.roleBody}</p>
      </div>
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-scale-balanced" style="color:#10b981;"></i> ${copy.capTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">${copy.capLead}</p>
        <ul style="color:#cbd5e1; font-size:13.5px; line-height:1.8; margin:0; padding-left:20px;">
          ${copy.capBullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>
      <div style="background:var(--palette-surface, #24364D); border:1px solid #f59e0b; border-radius:14px; padding:28px;">
        <h2 style="color:#f59e0b; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-triangle-exclamation"></i> ${copy.restrictTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">${copy.restrictBody}</p>
        <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px; font-size:13px; color:#cbd5e1; line-height:1.6;">
          <strong>${copy.restrictNoticeTitle}</strong><br>${copy.restrictNoticeBody}
        </div>
      </div>
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-truck-ramp-box" style="color:#38bdf8;"></i> ${copy.methodsTitle}</h2>
        <ul style="color:#cbd5e1; font-size:13.5px; line-height:1.8; margin:0; padding-left:20px;">
          ${copy.methods.map(m => `<li>${m}</li>`).join('')}
        </ul>
      </div>
      <div style="background:var(--palette-surface, #24364D); border:1px solid #ef4444; border-radius:14px; padding:28px;">
        <h2 style="color:#f87171; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-ban"></i> ${copy.prohibitedTitle}</h2>
        <ul style="color:#cbd5e1; font-size:13.5px; line-height:1.8; margin:0; padding-left:20px;">
          ${copy.prohibited.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/resale-policy',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/resale-policy' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

// -------------------------------------------------------------
// 11. /payment-flow — Funds Flow & Double-Entry Ledger Truth
// -------------------------------------------------------------
router.get('/payment-flow', (req, res) => {
  const lang = resolveRequestLang(req);
  const copy = getTrustCopy('paymentFlow', lang);

  const contentHtml = `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(227,111,69,0.45); border-radius:14px; padding:28px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; font-size:11px; padding:4px 10px; border-radius:6px; text-transform:uppercase;">${copy.badge}</span>
        </div>
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-vault" style="color:#10b981;"></i> ${copy.archTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 16px;">${copy.archBody}</p>
        <div style="background:var(--palette-midnight-navy, #172333); border:1px solid rgba(203,213,225,0.22); border-radius:10px; padding:18px; font-size:13.5px; color:#f8fafc; line-height:1.6;">
          <strong style="color:#f59e0b;"><i class="fa-solid fa-circle-exclamation"></i> ${copy.nonBankTitle}</strong><br>${copy.nonBankBody}
        </div>
      </div>

      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 16px;"><i class="fa-solid fa-book-journal-whills" style="color:#38bdf8;"></i> ${copy.ledgerTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.6; margin:0 0 16px;">${copy.ledgerLead}</p>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid #334155; color:#94a3b8;">
                <th style="padding:10px;">${copy.ledgerCols[0]}</th>
                <th style="padding:10px;">${copy.ledgerCols[1]}</th>
                <th style="padding:10px;">${copy.ledgerCols[2]}</th>
              </tr>
            </thead>
            <tbody>
              ${copy.ledgerRows.map(r => `
              <tr style="border-bottom:1px solid rgba(203,213,225,0.16);">
                <td style="padding:10px; color:${r[1]}; font-family:monospace; font-weight:700;">${r[0]}</td>
                <td style="padding:10px; color:#cbd5e1;">${r[2]}</td>
                <td style="padding:10px; color:#cbd5e1;">${r[3]}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-clock-rotate-left" style="color:#38bdf8;"></i> ${copy.releaseTitle}</h2>
        <ul style="color:#cbd5e1; font-size:13.5px; line-height:1.8; margin:0; padding-left:20px;">
          ${copy.releaseItems.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>

      <div style="background:var(--palette-surface, #24364D); border:1px solid rgba(203,213,225,0.22); border-radius:14px; padding:28px;">
        <h2 style="color:#f8fafc; font-size:20px; font-weight:800; margin:0 0 12px;"><i class="fa-solid fa-rotate-left" style="color:#f43f5e;"></i> ${copy.refundTitle}</h2>
        <p style="color:#cbd5e1; font-size:14px; line-height:1.7; margin:0 0 14px;">${copy.refundLead}</p>
        <ul style="color:#cbd5e1; font-size:13.5px; line-height:1.8; margin:0; padding-left:20px;">
          ${copy.refundItems.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>

      <div style="background:var(--palette-surface, #24364D); border:1px solid #334155; border-radius:14px; padding:24px;">
        <h3 style="color:#facc15; font-size:16px; margin:0 0 8px;"><i class="fa-solid fa-gavel"></i> ${copy.regTitle}</h3>
        <p style="color:#cbd5e1; font-size:13px; line-height:1.6; margin:0;">${copy.regBody}</p>
      </div>
    </div>
  `;

  const html = renderTrustLayout({
    lang,
    title: copy.title,
    description: copy.description,
    canonicalPath: '/payment-flow',
    h1: copy.h1,
    subtitle: copy.subtitle,
    breadcrumbs: [
      { name: t('nav.home', lang), url: '/' },
      { name: copy.breadcrumb, url: '/payment-flow' }
    ],
    faqPairs: copy.faqs,
    contentHtml
  });

  res.type('html').send(html);
});

module.exports = router;
