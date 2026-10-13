/**
 * TIKUM / ARGUS — Automated Test Suite: Official Ticket Affiliate & Resale Hybrid Marketplace
 *
 * Verifies:
 * 1. Partner Registry & Domain Allowlisting (Open Redirect Protection)
 * 2. Secure Outbound Link Resolution (/go/:partnerSlug/:offerId)
 * 3. Event-to-Partner Offer Mapping & Multiple Destinations
 * 4. Privacy-Safe Outbound Click Tracking (Clicks are NOT conversions)
 * 5. Authenticated Conversion Webhook, Idempotency & State Transitions
 * 6. Strict Marketplace & Financial Isolation (Zero Escrow/Order Pollution)
 * 7. Admin Control Center APIs & Truthful Analytics (No Fabricated Sales)
 * 8. Public SSR Discovery UI: Clear Separation of Official & Resale Channels
 */

const assert = require('assert');
const { resetDatabase, state } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { PartnerService, PARTNER_TYPES, INTEGRATION_TYPES, PARTNER_STATUS, OFFER_AVAILABILITY, CONVERSION_STATUS } = require('./src/services/partner/PartnerService');
const { EventSEOService } = require('./src/discovery/EventSEOService');

console.log('================================================================');
console.log('  TIKUM — OFFICIAL TICKET AFFILIATE + RESALE HYBRID TEST SUITE  ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}\n`);
    throw err;
  }
}

async function runTests() {
  await resetDatabase();
  PartnerService.seedDefaults();

  console.log('── Section 1: Partner Registry & Security Validation ──');

  it('1.1 Seeds default verified Indonesian partners (Loket, Live Nation, Tiket.com, etc.)', () => {
    const partners = PartnerService.listPartners();
    assert(partners.length >= 6, `Expected at least 6 partners, got ${partners.length}`);
    const loket = partners.find(p => p.slug === 'loket');
    assert(loket, 'Loket partner must exist');
    assert.strictEqual(loket.status, PARTNER_STATUS.ACTIVE);
    assert.strictEqual(loket.integration_type, INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK);
    assert(Array.isArray(loket.official_domains) && loket.official_domains.includes('loket.com'));
    assert.strictEqual(loket.webhook_secret, undefined, 'Sanitized partner must not leak webhook secret');
  });

  it('1.2 Successfully registers a new authorized partner candidate', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    const newPartner = PartnerService.registerPartner(adminActor, {
      name: 'Ismaya Live Portal',
      slug: 'ismaya-live',
      partner_type: PARTNER_TYPES.PROMOTER,
      official_domains: ['ismayalive.com', 'www.ismayalive.com'],
      integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
      status: PARTNER_STATUS.PENDING,
      affiliate_program_url: 'https://ismayalive.com',
      notes: 'Direct official promoter channel for DWP & We The Fest'
    });

    assert.strictEqual(newPartner.name, 'Ismaya Live Portal');
    assert.strictEqual(newPartner.slug, 'ismaya-live');
    assert.strictEqual(newPartner.status, PARTNER_STATUS.PENDING);
    assert(newPartner.official_domains.includes('ismayalive.com'));
  });

  it('1.3 Rejects registration with duplicate slug or missing official domains', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    assert.throws(() => {
      PartnerService.registerPartner(adminActor, {
        name: 'Duplicate Loket',
        slug: 'loket',
        partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
        official_domains: ['loket.com']
      });
    }, /already exists/);

    assert.throws(() => {
      PartnerService.registerPartner(adminActor, {
        name: 'Invalid Partner',
        slug: 'invalid-partner',
        partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
        official_domains: []
      });
    }, /official domain is required/);
  });

  it('1.4 Updates partner status and domain allowlist with audit logging', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    const initialLogCount = (state.partner_audit_logs || []).length;

    const updated = PartnerService.updatePartner(adminActor, 'ismaya-live', {
      status: PARTNER_STATUS.ACTIVE,
      official_domains: ['ismayalive.com', 'tickets.ismayalive.com']
    });

    assert.strictEqual(updated.status, PARTNER_STATUS.ACTIVE);
    assert(updated.official_domains.includes('tickets.ismayalive.com'));
    assert(state.partner_audit_logs.length > initialLogCount, 'Audit log must record partner update');
  });

  console.log('\n── Section 2: Domain Allowlisting & Open-Redirect Prevention ──');

  it('2.1 Validates allowed destinations and strictly rejects open-redirect attempts', () => {
    const loket = PartnerService.getPartner('loket');
    assert(PartnerService.validateDestinationUrl('https://www.loket.com/event/pestapora-2026', loket), 'Valid loket domain must pass');
    assert(PartnerService.validateDestinationUrl('https://loket.com/o/bosscreator', loket), 'Apex domain must pass');

    // Attack vectors
    assert.strictEqual(PartnerService.validateDestinationUrl('https://evil-phishing-loket.com', loket), false, 'Phishing lookalike domain must fail');
    assert.strictEqual(PartnerService.validateDestinationUrl('https://loket.com.attacker.com/event', loket), false, 'Subdomain attack must fail');
    assert.strictEqual(PartnerService.validateDestinationUrl('javascript:alert(1)', loket), false, 'Javascript scheme must fail');
    assert.strictEqual(PartnerService.validateDestinationUrl('data:text/html,evil', loket), false, 'Data scheme must fail');
  });

  console.log('\n── Section 3: Event-to-Partner Offer Mapping ──');

  it('3.1 Creates verified event offer for a canonical event with domain validation', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    const offer = PartnerService.createOrUpdateOffer(adminActor, {
      id: 'offer-loket-pestapora',
      event_id: 'ev-can-pestapora-2026',
      partner_id: 'partner-loket',
      destination_url: 'https://www.loket.com/event/pestapora-2026_kbgT',
      link_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
      ticket_category: '3-Day Early Bird Pass',
      price_min: 225000,
      price_max: 650000,
      availability_status: OFFER_AVAILABILITY.AVAILABLE
    });

    assert.strictEqual(offer.id, 'offer-loket-pestapora');
    assert.strictEqual(offer.event_id, 'ev-can-pestapora-2026');
    assert.strictEqual(offer.is_affiliate, false, 'Direct official link must NOT be marked affiliate');
    assert.strictEqual(offer.price_min, 225000);
  });

  it('3.2 Rejects offer creation pointing to an unapproved external domain', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    assert.throws(() => {
      PartnerService.createOrUpdateOffer(adminActor, {
        event_id: 'ev-can-pestapora-2026',
        partner_id: 'partner-loket',
        destination_url: 'https://malicious-ticket-scam.com/steal-money',
        ticket_category: 'VIP Pass'
      });
    }, /Destination URL domain is not allowed/);
  });

  it('3.3 Supports multiple official partner offers for the same canonical event', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    PartnerService.createOrUpdateOffer(adminActor, {
      id: 'offer-tiket-pestapora',
      event_id: 'ev-can-pestapora-2026',
      partner_id: 'partner-tiket',
      destination_url: 'https://www.tiket.com/to-do/pestapora-2026',
      link_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
      ticket_category: 'Daily Pass',
      price_min: 250000
    });

    const offers = PartnerService.getOffersForEvent('ev-can-pestapora-2026');
    assert.strictEqual(offers.length, 2, 'Canonical event must support multiple distinct partner offers');
  });

  console.log('\n── Section 4: Outbound Link Resolution & Privacy-Safe Click Tracking ──');

  it('4.1 Resolves direct official link cleanly without fabricated affiliate parameters', () => {
    const initialClicks = (state.affiliate_clicks || []).length;
    const res = PartnerService.resolveOutboundLink('loket', 'offer-loket-pestapora', {
      ip: '202.67.40.10',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      referrer: 'https://tikum.app/events/pestapora-2026'
    });

    assert.strictEqual(res.redirect_url, 'https://www.loket.com/event/pestapora-2026_kbgT');
    assert.strictEqual(res.is_affiliate, false);
    assert(res.click_id.startsWith('clk-'));

    // Verify click record
    assert.strictEqual(state.affiliate_clicks.length, initialClicks + 1);
    const click = state.affiliate_clicks[state.affiliate_clicks.length - 1];
    assert.strictEqual(click.offer_id, 'offer-loket-pestapora');
    assert.strictEqual(click.is_affiliate, false);
    assert(click.ip_hash, 'IP must be safely hashed');
    assert.strictEqual(click.ip_hash.length, 16);
    assert.doesNotMatch(click.ip_hash, /202\.67/, 'Raw IP must never be stored in plain text');
  });

  it('4.2 Resolves approved affiliate offer appending verified sub_id token', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    // Create an approved affiliate partner
    PartnerService.registerPartner(adminActor, {
      name: 'Affiliate Ticketing Partner',
      slug: 'affiliate-tickets',
      partner_type: PARTNER_TYPES.AFFILIATE_NETWORK,
      official_domains: ['affiliatetickets.id', 'www.affiliatetickets.id'],
      integration_type: INTEGRATION_TYPES.APPROVED_AFFILIATE_LINK,
      status: PARTNER_STATUS.ACTIVE,
      commission_config: { type: 'PERCENTAGE', rate_pct: 2.5 }
    });

    PartnerService.createOrUpdateOffer(adminActor, {
      id: 'offer-affiliate-rock',
      event_id: 'ev-can-rock-fest',
      partner_id: 'partner-affiliate-tickets',
      destination_url: 'https://www.affiliatetickets.id/event/rockfest',
      link_type: INTEGRATION_TYPES.APPROVED_AFFILIATE_LINK,
      affiliate_subid_param: 'sub_id'
    });

    const res = PartnerService.resolveOutboundLink('affiliate-tickets', 'offer-affiliate-rock', {
      ip: '114.122.50.2',
      userAgent: 'Chrome Mobile'
    });

    assert.strictEqual(res.is_affiliate, true);
    assert(res.redirect_url.includes('sub_id=' + res.click_id), 'Must append approved opaque click token');
    assert.doesNotMatch(res.redirect_url, /email|phone|nik|user/i, 'Must not leak user personal information in affiliate URL');
  });

  it('4.3 Rejects outbound link resolution when partner is suspended or offer deactivated', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    PartnerService.updatePartner(adminActor, 'affiliate-tickets', { status: PARTNER_STATUS.SUSPENDED });

    assert.throws(() => {
      PartnerService.resolveOutboundLink('affiliate-tickets', 'offer-affiliate-rock');
    }, (err) => err.code === 'PARTNER_SUSPENDED');

    // Reactivate partner, but toggle offer off
    PartnerService.updatePartner(adminActor, 'affiliate-tickets', { status: PARTNER_STATUS.ACTIVE });
    PartnerService.toggleOffer(adminActor, 'offer-affiliate-rock', false);

    assert.throws(() => {
      PartnerService.resolveOutboundLink('affiliate-tickets', 'offer-affiliate-rock');
    }, (err) => err.code === 'OFFER_INACTIVE');
  });

  console.log('\n── Section 5: Authenticated Conversion Webhooks & Idempotency ──');

  it('5.1 Outbound click is strictly NOT recorded as a conversion (Zero fake conversions)', () => {
    const analytics = PartnerService.getAnalytics();
    assert.strictEqual(analytics.total_conversions, 0, 'Clicks must never count as conversions');
    assert.strictEqual(analytics.has_conversion_data, false);
    assert.strictEqual(analytics.empty_state_message, 'Belum ada data konversi partner');
  });

  it('5.2 Ingests authenticated partner conversion webhook and calculates commission', () => {
    const adminActor = { id: 'admin-1', role: 'admin' };
    PartnerService.updatePartner(adminActor, 'affiliate-tickets', {
      webhook_secret: 'sec_test_partner_webhook_secret_123'
    });

    // Valid webhook call
    const payload = {
      order_ref: 'TRX-AFF-9901',
      sub_id: 'clk-sample-1234',
      amount: 1000000,
      currency: 'IDR',
      status: 'APPROVED',
      timestamp: new Date().toISOString()
    };

    const res = PartnerService.recordPartnerConversionWebhook(
      'affiliate-tickets',
      payload,
      'Bearer sec_test_partner_webhook_secret_123'
    );

    assert.strictEqual(res.idempotent, false);
    assert.strictEqual(res.conversion.status, CONVERSION_STATUS.APPROVED);
    assert.strictEqual(res.conversion.amount, 1000000);
    assert.strictEqual(res.conversion.commission_amount, 25000, '2.5% of 1,000,000 must be 25,000');
  });

  it('5.3 Rejects forged webhook authentication header with HTTP 401', () => {
    assert.throws(() => {
      PartnerService.recordPartnerConversionWebhook(
        'affiliate-tickets',
        { order_ref: 'TRX-FORGED-1' },
        'Bearer WRONG_SECRET'
      );
    }, (err) => err.code === 'INVALID_WEBHOOK_SIGNATURE');
  });

  it('5.4 Handles duplicate conversion webhook callbacks idempotently (Zero duplicate commission)', () => {
    const initialConversions = (state.affiliate_conversions || []).length;
    const initialApprovedComm = PartnerService.getAnalytics().approved_commission;

    const payload = {
      order_ref: 'TRX-AFF-9901',
      amount: 1000000,
      currency: 'IDR',
      status: 'APPROVED'
    };

    const replayRes = PartnerService.recordPartnerConversionWebhook(
      'affiliate-tickets',
      payload,
      'Bearer sec_test_partner_webhook_secret_123'
    );

    assert.strictEqual(replayRes.idempotent, true, 'Replayed webhook must return idempotent: true');
    assert.strictEqual(state.affiliate_conversions.length, initialConversions, 'No duplicate record created');
    assert.strictEqual(PartnerService.getAnalytics().approved_commission, initialApprovedComm, 'Commission must not double count');
  });

  it('5.5 Handles refund and reversal state transitions without financial corruption', () => {
    const payloadReversal = {
      order_ref: 'TRX-AFF-9901',
      amount: 1000000,
      currency: 'IDR',
      status: 'REVERSED'
    };

    const reversalRes = PartnerService.recordPartnerConversionWebhook(
      'affiliate-tickets',
      payloadReversal,
      'Bearer sec_test_partner_webhook_secret_123'
    );

    assert.strictEqual(reversalRes.updated, true);
    assert.strictEqual(reversalRes.conversion.status, CONVERSION_STATUS.REVERSED);

    const analytics = PartnerService.getAnalytics();
    assert.strictEqual(analytics.approved_commission, 0, 'Approved commission must reset to 0 after reversal');
    assert.strictEqual(analytics.reversed_commission, 25000, 'Reversed commission must be recorded');
  });

  console.log('\n── Section 6: Strict Marketplace & Financial Isolation ──');

  it('6.1 Affiliate clicks and conversions NEVER create secondary resale orders or escrow balances', () => {
    const initialOrders = (state.orders || []).length;
    const initialEscrows = (state.escrows || []).length;
    const initialListings = (state.listings || []).length;
    const initialTickets = (state.tickets || []).length;

    // Simulate multiple clicks and conversions
    PartnerService.resolveOutboundLink('loket', 'offer-loket-pestapora');
    PartnerService.reconcileManualConversion({ id: 'admin-1' }, {
      partner_id: 'partner-loket',
      order_ref: 'MANUAL-REF-9922',
      amount: 500000,
      commission_amount: 10000,
      status: CONVERSION_STATUS.APPROVED
    });

    assert.strictEqual(state.orders.length, initialOrders, 'state.orders must not be mutated');
    assert.strictEqual(state.escrows.length, initialEscrows, 'state.escrows must not be mutated');
    assert.strictEqual(state.listings.length, initialListings, 'state.listings must not be mutated');
    assert.strictEqual(state.tickets.length, initialTickets, 'state.tickets must not be mutated');
  });

  console.log('\n── Section 7: Public Event Discovery SSR UI Separation ──');

  it('7.1 Event page HTML displays clearly separated Official Tickets and Resale Tickets sections', () => {
    const canonicalEvent = {
      event_id: 'ev-can-pestapora-2026',
      canonical_name: 'Pestapora 2026',
      organizer_name: 'Boss Creator',
      city: 'Jakarta',
      venue_name: 'Gambir Expo Kemayoran',
      date: '2026-11-25',
      start_date: '2026-11-25',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      min_price: 225000,
      max_price: 650000,
      is_verified: true,
      official_ticket_url: 'https://www.loket.com/event/pestapora-2026_kbgT',
      official_ticketing_provider: 'LOKET'
    };

    const html = EventSEOService.renderEventPageHtml(canonicalEvent, [], []);

    // 1. Channel distinction
    assert(html.includes('Tiket Resmi (Kanal Pembelian Utama)'), 'Must render explicit official tickets section');
    assert(html.includes('Tiket Resale Terverifikasi (Pasar Sekunder Tikum)'), 'Must render explicit resale section');

    // 2. Clear external partner disclaimer
    assert(html.includes('Transaksi pembelian berlangsung di platform'), 'Must explain checkout occurs externally on partner platform');
    assert(html.includes('Tikum tidak memproses pembayaran tiket resmi'), 'Must explicitly clarify TIKUM does not process official ticket payments');

    // 3. Outbound action
    assert(html.includes('Beli Tiket Resmi di LOKET') || html.includes('Buka Halaman Tiket Resmi'));
  });

  it('7.2 Renders affiliate disclosure when offer is marked APPROVED_AFFILIATE_LINK', () => {
    const rockEvent = {
      event_id: 'ev-can-rock-fest',
      canonical_name: 'Rock Fest 2026',
      organizer_name: 'Rock Nation',
      city: 'Bandung',
      venue_name: 'Stadion Siliwangi',
      date: '2026-11-28',
      start_date: '2026-11-28',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      min_price: 350000
    };

    // Re-activate offer
    PartnerService.toggleOffer({ id: 'admin-1' }, 'offer-affiliate-rock', true);

    const html = EventSEOService.renderEventPageHtml(rockEvent, [], []);
    assert(html.includes('Mitra Afiliasi Resmi'), 'Must render affiliate badge');
    assert(html.includes('Tikum dapat menerima komisi afiliasi'), 'Must render full affiliate disclosure statement');
  });

  it('7.3 Renders honest unverified state when event lacks official ticket URL', () => {
    const unknownEvent = {
      event_id: 'ev-can-underground-show',
      canonical_name: 'Underground Indie Showcase',
      city: 'Yogyakarta',
      venue_name: 'Jogja National Museum',
      date: '2026-12-05'
    };

    const html = EventSEOService.renderEventPageHtml(unknownEvent, [], []);
    assert(html.includes('Kanal Tiket Resmi Belum Terdaftar'), 'Must render honest unverified notice');
    assert(!html.includes('Beli Tiket Resmi di'), 'Must not display broken or misleading official purchase button');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
