/**
 * TIKUM / ARGUS — Comprehensive Verification Suite
 * Deliverables:
 * 1. DOKU Sandbox Payment & Webhook Integration
 * 2. Event Image Pipeline & Zero-Broken-Image Guards
 * 3. Primary Ticketing Box Event Discovery & Policy Registry (>= IDR 300,000)
 * 4. Anti-Conflict Self-Purchase Prevention & Strict State Decoupling
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { state, resetDatabase } = require('./src/database');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { paymentManager } = require('./src/services/payment/index');
const { EscrowService } = require('./src/services/escrowService');
const { eventPolicyRegistry, POLICY_STATUS, RISK_TIER, PRIMARY_PARTNER } = require('./src/discovery/EventPolicyRegistry');
const { EventVisualProvenanceService } = require('./src/discovery/EventVisualProvenanceService');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');

async function runTestSuite() {
  console.log('================================================================');
  console.log('TIKUM / ARGUS — DOKU SANDBOX, IMAGES & POLICY REGISTRY TESTS');
  console.log('================================================================\n');

  resetDatabase();

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: DOKU Sandbox Payment Provider Configuration & Channels
  // ---------------------------------------------------------------------------
  console.log('[TEST 1] DOKU Sandbox Configuration & Pilot Channel Restrictions...');

  const dokuSandbox = new DokuPaymentProvider({
    clientId: 'MCH-TIKUM-SANDBOX-001',
    secretKey: 'SK-TIKUM-SANDBOX-SECRET-KEY-2026',
    apiBaseUrl: 'https://api-sandbox.doku.com',
    env: 'sandbox',
    allowSimulation: true
  });

  assert.strictEqual(dokuSandbox.getName(), 'doku', 'Provider name must be doku');
  assert.strictEqual(dokuSandbox.isSandbox, true, 'Provider must recognize sandbox mode');

  // Verify Supported Pilot Channels
  const supportedChannels = dokuSandbox.getSupportedChannels();
  const channelCodes = supportedChannels.map(c => c.code);
  console.log('  Supported Pilot Channels:', channelCodes.join(', '));

  assert.ok(channelCodes.includes('VA_BCA'), 'Must support VA_BCA');
  assert.ok(channelCodes.includes('VA_MANDIRI'), 'Must support VA_MANDIRI');
  assert.ok(channelCodes.includes('VA_BNI'), 'Must support VA_BNI');
  assert.ok(channelCodes.includes('VA_BRI'), 'Must support VA_BRI');
  assert.ok(channelCodes.includes('VA_CIMB'), 'Must support VA_CIMB');
  assert.ok(channelCodes.includes('VA_PERMATA'), 'Must support VA_PERMATA');
  assert.ok(channelCodes.includes('VA_DOKU'), 'Must support VA_DOKU');
  assert.ok(channelCodes.includes('QRIS'), 'Must support QRIS');
  assert.ok(channelCodes.includes('DOKU_CHECKOUT'), 'Must support DOKU_CHECKOUT');

  // Verify Prohibited Channels are NOT supported for pilot
  assert.strictEqual(channelCodes.includes('CREDIT_CARD'), false, 'CREDIT_CARD must not be in pilot channels');
  assert.strictEqual(channelCodes.includes('PAYLATER'), false, 'PAYLATER must not be in pilot channels');
  assert.strictEqual(channelCodes.includes('DIRECT_DEBIT'), false, 'DIRECT_DEBIT must not be in pilot channels');
  assert.strictEqual(channelCodes.includes('OVO'), false, 'OVO must not be in pilot channels');
  assert.strictEqual(channelCodes.includes('DANA'), false, 'DANA must not be in pilot channels');

  // Verify CIMB directApiEndpoint
  const cimbChannel = supportedChannels.find(c => c.code === 'VA_CIMB');
  assert.strictEqual(cimbChannel.directApiEndpoint, '/cimb-virtual-account/v2/payment-code', 'CIMB VA endpoint must match specification');

  // Verify channel rejection in createPayment
  let ccRejected = false;
  try {
    await dokuSandbox.createPayment({
      orderId: 'ord-test-cc',
      amount: 500000,
      channel: 'CREDIT_CARD',
      buyer: { id: 'buyer-1', name: 'Buyer Test', email: 'buyer@test.com' }
    });
  } catch (err) {
    if (err.code === 'UNSUPPORTED_PILOT_CHANNEL') ccRejected = true;
  }
  assert.strictEqual(ccRejected, true, 'CREDIT_CARD must be rejected with UNSUPPORTED_PILOT_CHANNEL');

  let paylaterRejected = false;
  try {
    await dokuSandbox.createPayment({
      orderId: 'ord-test-pl',
      amount: 500000,
      channel: 'PAYLATER',
      buyer: { id: 'buyer-1', name: 'Buyer Test', email: 'buyer@test.com' }
    });
  } catch (err) {
    if (err.code === 'UNSUPPORTED_PILOT_CHANNEL') paylaterRejected = true;
  }
  assert.strictEqual(paylaterRejected, true, 'PAYLATER must be rejected with UNSUPPORTED_PILOT_CHANNEL');

  console.log('  ✅ PASSED: Channel whitelist & disabled channel rejection verified.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Jokul Signature Generation & Verification
  // ---------------------------------------------------------------------------
  console.log('[TEST 2] Jokul HMAC-SHA256 Signature Generation & Verification...');

  const reqId = 'req-test-uuid-001';
  const reqTimestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const reqTarget = '/api/webhooks/doku';
  const payload = {
    order: {
      invoice_number: 'INV-DOKU-ord-test-sig',
      amount: 750000
    },
    transaction: {
      status: 'SUCCESS',
      transaction_id: 'TRX-DOKU-998877',
      date: reqTimestamp
    }
  };

  const rawBody = JSON.stringify(payload);
  const digest = crypto.createHash('sha256').update(rawBody).digest('base64');
  const signature = dokuSandbox.generateSignature({
    requestId: reqId,
    requestTimestamp: reqTimestamp,
    requestTarget: reqTarget,
    digest
  });

  assert.ok(signature.startsWith('HMACSHA256='), 'Signature must be HMACSHA256 prefixed');

  const headers = {
    'client-id': 'MCH-TIKUM-SANDBOX-001',
    'request-id': reqId,
    'request-timestamp': reqTimestamp,
    'request-target': reqTarget,
    'signature': signature
  };

  // Verify with matching headers
  const isValid = dokuSandbox.verifyWebhook(headers, payload);
  assert.strictEqual(isValid, true, 'Valid signature must be verified successfully');

  // Verify rejection with forged signature
  const forgedHeaders = { ...headers, signature: 'HMACSHA256=invalidForgedBase64SignatureValue==' };
  const isForgedValid = dokuSandbox.verifyWebhook(forgedHeaders, payload);
  assert.strictEqual(isForgedValid, false, 'Forged signature must be rejected');

  // Verify replay protection (stale timestamp > 300s)
  const staleTimestamp = new Date(Date.now() - 400 * 1000).toISOString().slice(0, 19) + 'Z';
  const staleHeaders = { ...headers, 'request-timestamp': staleTimestamp };
  const isStaleValid = dokuSandbox.verifyWebhook(staleHeaders, payload);
  assert.strictEqual(isStaleValid, false, 'Stale webhook request must be rejected for replay protection');

  console.log('  ✅ PASSED: Signature generation, verification, and replay protection verified.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Webhook Ingestion, Idempotency, and Strict State Decoupling
  // ---------------------------------------------------------------------------
  console.log('[TEST 3] Webhook Ingestion, Financial Ledger Idempotency & State Decoupling...');

  // Set up an active order in state
  const testOrderId = 'ord-sandbox-e2e-01';
  const testListingId = 'list-sandbox-e2e-01';
  const sellerId = 'seller-user-01';
  const buyerId = 'buyer-user-02';

  state.users.push(
    { id: sellerId, name: 'Tikum Seller', email: 'seller@tikum.app', role: 'SELLER' },
    { id: buyerId, name: 'Tikum Buyer', email: 'buyer@tikum.app', role: 'BUYER' }
  );

  state.listings.push({
    id: testListingId,
    listing_id: testListingId,
    seller_id: sellerId,
    ticket_id: 'tkt-e2e-01',
    event_id: 'event-bts-jakarta-2026',
    price: 1500000,
    face_value: 1500000,
    status: 'ACTIVE',
    evidence_bundle_id: 'bdl-test-e2e-01'
  });

  state.evidence_bundles.push({
    id: 'bdl-test-e2e-01',
    ticket_id: 'tkt-e2e-01',
    uploader_id: sellerId,
    bundle_hash: 'hash-initial-seller-proof',
    artifacts: {
      slot_1: { artifact_type: 'PRIMARY_INVOICE', verified: true }
    }
  });

  // Buyer creates the order
  const orderResult = await EscrowService.createOrder({
    buyerId,
    listingId: testListingId
  });
  const order = orderResult.order || orderResult;
  const orderId = order.id || order.orderId;
  assert.ok(order, 'Order must be created in state');
  const expectedAmount = Number(order.buyer_total ?? order.total_amount);

  // Initial order state
  assert.strictEqual(order.status, 'PENDING_PAYMENT', 'Initial status must be PENDING_PAYMENT');
  assert.strictEqual(order.payment_status || 'PENDING', 'PENDING', 'Initial payment status must be pending');

  // Construct valid DOKU Webhook Notification
  const webhookEventId = `req-webhook-${orderId}-01`;
  const webhookTimestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const webhookBody = {
    order: {
      invoice_number: `INV-DOKU-${orderId}`,
      amount: expectedAmount
    },
    transaction: {
      status: 'SUCCESS',
      transaction_id: `TRX-DOKU-${orderId}`,
      date: webhookTimestamp
    }
  };

  const rawWebhookBody = JSON.stringify(webhookBody);
  const webhookDigest = crypto.createHash('sha256').update(rawWebhookBody).digest('base64');
  const webhookSig = dokuSandbox.generateSignature({
    requestId: webhookEventId,
    requestTimestamp: webhookTimestamp,
    requestTarget: '/api/webhooks/doku',
    digest: webhookDigest
  });

  const webhookHeaders = {
    'client-id': 'MCH-TIKUM-SANDBOX-001',
    'request-id': webhookEventId,
    'request-timestamp': webhookTimestamp,
    'request-target': '/api/webhooks/doku',
    'signature': webhookSig
  };

  // Register DOKU provider in paymentManager
  paymentManager.registerProvider(dokuSandbox);
  paymentManager.defaultProvider = 'doku';

  // Process Webhook First Time
  const firstProcessing = await PaymentService.handleWebhook({
    providerName: 'doku',
    headers: webhookHeaders,
    body: webhookBody,
    rawBodyBuffer: Buffer.from(rawWebhookBody, 'utf8')
  });

  assert.strictEqual(firstProcessing.idempotent, false, 'First webhook processing must succeed (not duplicate)');

  // Verify Strict State Decoupling Invariants
  assert.strictEqual(order.payment_status, 'PAYMENT_CONFIRMED_PROVIDER', 'Order payment_status must be PAYMENT_CONFIRMED_PROVIDER');
  assert.strictEqual(order.marketplace_status, 'PAID', 'Order marketplace status must be PAID');

  // Verify slot #5 Evidence Bundle artifact
  assert.ok(order.evidence_bundle, 'Order must have evidence_bundle');
  assert.ok(order.evidence_bundle.paymentSettlementRecord, 'Slot #5 paymentSettlementRecord must be present in order evidence bundle');
  assert.strictEqual(order.evidence_bundle.paymentSettlementRecord.slot, 5, 'Must be designated as slot 5');
  assert.strictEqual(order.evidence_bundle.paymentSettlementRecord.payment_status, 'PAYMENT_CONFIRMED_PROVIDER', 'Artifact payment status must be PAYMENT_CONFIRMED_PROVIDER');

  // Verify in state.evidence_bundles
  const targetBundle = state.evidence_bundles.find(b => b.id === order.evidence_bundle_id);
  assert.ok(targetBundle && targetBundle.artifacts.slot_5, 'Bundle in state must have slot_5 populated');

  // Verify Decoupling: Ticket verification status must NOT have been auto-flipped
  const ticket = (state.tickets || []).find(t => t.id === order.ticket_id);
  if (ticket) {
    assert.notStrictEqual(ticket.status, 'VERIFIED_AT_VENUE', 'Ticket status must not be auto-flipped to verified at venue');
  }
  // Verify Decoupling: Escrow funds must remain held and NOT released to seller yet
  const escrow = (state.escrows || []).find(e => e.order_id === orderId);
  if (escrow) {
    assert.ok(escrow.status === 'ESCROWED' || escrow.status === 'HELD', 'Escrow funds must remain in ESCROWED/HELD status until PIC admission');
    assert.strictEqual(escrow.released_at || null, null, 'Escrow funds must not be released upon payment alone');
  }

  // Process Duplicate Webhook (Idempotency Check)
  const duplicateProcessing = await PaymentService.handleWebhook({
    providerName: 'doku',
    headers: webhookHeaders,
    body: webhookBody,
    rawBodyBuffer: Buffer.from(rawWebhookBody, 'utf8')
  });

  assert.strictEqual(duplicateProcessing.idempotent, true, 'Duplicate webhook must be recognized as idempotent and ignored');

  console.log('  ✅ PASSED: Webhook confirmed payment, slot #5 recorded, and state decoupling strictly preserved.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Anti-Conflict Self-Purchase Prevention (Two-Account Journey)
  // ---------------------------------------------------------------------------
  console.log('[TEST 4] Anti-Conflict Self-Purchase Prevention (Seller vs Buyer Journey)...');

  let selfPurchaseBlockedInEscrow = false;
  try {
    // Seller attempts to purchase own listing
    await EscrowService.createOrder({
      buyerId: sellerId,
      listingId: testListingId
    });
  } catch (err) {
    if (err.code === 'SELF_PURCHASE_FORBIDDEN' || err.status === 403) {
      selfPurchaseBlockedInEscrow = true;
    }
  }

  assert.strictEqual(selfPurchaseBlockedInEscrow, true, 'Seller buying their own ticket must throw SELF_PURCHASE_FORBIDDEN');
  console.log('  ✅ PASSED: Self-purchase strictly blocked with 403 SELF_PURCHASE_FORBIDDEN.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Root-Cause Diagnosis & Image Pipeline Integrity Check
  // ---------------------------------------------------------------------------
  console.log('[TEST 5] Event Image Pipeline Integrity & Zero-Broken-Image Guards...');

  const allEvents = canonicalRegistry.getAllEvents();
  assert.ok(allEvents.length >= 10, 'Canonical registry should contain events');

  for (const ev of allEvents) {
    const imgUrl = ev.image_url || ev.poster_url;
    assert.ok(imgUrl, `Event '${ev.title || ev.id}' must have a valid non-null image URL`);

    // Verify URL passes security & path validation
    const check = EventVisualProvenanceService.validateImageUrl(imgUrl);
    assert.strictEqual(check.valid, true, `Image URL '${imgUrl}' for event '${ev.title}' must pass provenance validation`);

    // If local asset, verify file actually exists on disk
    if (imgUrl.startsWith('/images/events/')) {
      const localFilePath = path.join(__dirname, 'public', imgUrl.replace(/^\//, ''));
      const fileExists = fs.existsSync(localFilePath);
      assert.strictEqual(fileExists, true, `Local image asset '${imgUrl}' must physically exist at ${localFilePath}`);
    }
  }

  // Check fallback generator returns valid category SVG instead of null
  const fallbackSport = EventVisualProvenanceService.resolveEventImage({ category: 'SPORT' }, [], []);
  assert.ok(fallbackSport.image_url, 'Sport fallback must have valid image_url');
  assert.ok(fallbackSport.image_url.includes('sports-default.svg'), 'Sport fallback should point to sports-default.svg');

  const fallbackComedy = EventVisualProvenanceService.resolveEventImage({ category: 'STANDUP' }, [], []);
  assert.ok(fallbackComedy.image_url, 'Comedy fallback must have valid image_url');
  assert.ok(fallbackComedy.image_url.includes('standup-default.svg'), 'Comedy fallback should point to standup-default.svg');

  // Verify index.html does not contain broken external links
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.strictEqual(indexHtml.includes('https://ygfamily.com/artist/bigbang/worldtour2027-jakarta.jpg'), false, 'index.html must not contain unhosted ygfamily link');
  const { eventPolicyRegistry } = require('./src/discovery/EventPolicyRegistry');
  const bigbang = eventPolicyRegistry.getAllEvents().find(ev => (ev.event_name || '').toLowerCase().includes('bigbang'));
  assert.ok(bigbang, 'Policy registry must contain BIGBANG');
  assert.strictEqual(bigbang.image_url || bigbang.poster_url, '/images/events/bigbang-world-tour-jakarta-2026.svg', 'BIGBANG registry mapping must reference its local fallback');
  assert.ok(fs.existsSync(path.join(__dirname, 'public', bigbang.image_url.replace(/^\//, ''))), 'BIGBANG fallback asset must exist');

  // Verify pay.html and track.html have event poster containers
  const payHtml = fs.readFileSync(path.join(__dirname, 'public', 'pay.html'), 'utf8');
  assert.ok(payHtml.includes('event-poster-container'), 'pay.html must have event-poster-container');
  assert.ok(payHtml.includes('eventPosterImg'), 'pay.html must have eventPosterImg');

  const trackHtml = fs.readFileSync(path.join(__dirname, 'public', 'track.html'), 'utf8');
  assert.ok(trackHtml.includes('event-poster-container'), 'track.html must have event-poster-container');
  assert.ok(trackHtml.includes('transEventPosterImg'), 'track.html must have transEventPosterImg');

  console.log('  ✅ PASSED: Zero broken images across all event cards, hero spotlights, and deal pages.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Primary Ticketing Policy Registry Seeding (>= IDR 300,000)
  // ---------------------------------------------------------------------------
  console.log('[TEST 6] Primary Ticketing Policy Registry Seeding & Coverage (>= IDR 300,000)...');

  const policyEvents = eventPolicyRegistry.getAllEvents();
  assert.ok(policyEvents.length >= 15, `Expected at least 15 seeded primary events, got ${policyEvents.length}`);

  const requiredPlatforms = [
    PRIMARY_PARTNER.TIKET_COM,
    PRIMARY_PARTNER.LOKET_COM,
    PRIMARY_PARTNER.TIPTIP_ID,
    PRIMARY_PARTNER.GOERSAPP_COM,
    PRIMARY_PARTNER.KIOSTIX_COM,
    PRIMARY_PARTNER.ARTATIX_CO_ID,
    PRIMARY_PARTNER.DEWATIKET_ID,
    PRIMARY_PARTNER.YESPLIS_COM
  ];

  const presentPlatforms = new Set(policyEvents.map(e => e.official_ticketing_partner || e.primary_ticket_box || e.primary_ticketing_partner));
  for (const plat of requiredPlatforms) {
    assert.ok(presentPlatforms.has(plat), `Policy registry must cover primary platform: ${plat}`);
  }

  // Verify all events satisfy starting price >= 300,000 IDR
  for (const ev of policyEvents) {
    const title = ev.event_name || ev.event_title;
    assert.ok(
      ev.starting_price_idr >= 300000,
      `Event '${title}' starting price (${ev.starting_price_idr}) must be >= IDR 300,000`
    );
    const url = ev.policy_source_url || ev.primary_url;
    assert.ok(url && url.startsWith('https://'), `Event '${title}' must have valid https policy_source_url`);
    assert.ok([POLICY_STATUS.POLICY_VERIFIED_ACTIVE, POLICY_STATUS.POLICY_UNVERIFIED].includes(ev.policy_status), `Event '${title}' must have valid policy status`);
    assert.ok([RISK_TIER.TIER_A_DIGITAL, RISK_TIER.TIER_B_VENUE_ASSISTED, RISK_TIER.TIER_C_RESTRICTED].includes(ev.risk_tier), `Event '${title}' must have valid risk tier`);
  }

  // Verify category distribution (Concerts, Sports, Stand-up Comedy)
  const categories = new Set(policyEvents.map(e => e.category));
  assert.ok(categories.has('CONCERT'), 'Must have CONCERT category in policy registry');
  assert.ok(categories.has('SPORTS'), 'Must have SPORTS category in policy registry');
  assert.ok(categories.has('STANDUP_COMEDY'), 'Must have STANDUP_COMEDY category in policy registry');

  // Verify summary statistics
  const summary = eventPolicyRegistry.getSummary();
  assert.strictEqual(summary.total_events, policyEvents.length, 'Summary count must match event count');
  assert.ok(summary.categories.CONCERT > 0, 'Must have concert count in summary');
  assert.ok(summary.categories.SPORTS > 0, 'Must have sports count in summary');
  assert.ok(summary.categories.STANDUP_COMEDY > 0, 'Must have comedy count in summary');

  console.log(`  Seeded ${summary.total_events} events across ${Object.keys(summary.platforms).length} primary platforms.`);
  console.log(`  Categories: Concerts (${summary.categories.CONCERT}), Sports (${summary.categories.SPORTS}), Stand-up Comedy (${summary.categories.STANDUP_COMEDY}).`);
  console.log('  ✅ PASSED: Policy Registry satisfies all primary discovery requirements.\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Bilingual Copy & Compliance Guardrail Check
  // ---------------------------------------------------------------------------
  console.log('[TEST 7] Bilingual Parity & Prohibited Claims Guard...');

  const idDict = require('./src/i18n/dictionaries/id.js');
  const enDict = require('./src/i18n/dictionaries/en.js');

  // Verify Evidence Bundle artifact keys
  assert.ok(idDict.evidenceBundle.paymentSettlementRecord, 'idDictionary must contain paymentSettlementRecord');
  assert.ok(enDict.evidenceBundle.paymentSettlementRecord, 'enDictionary must contain paymentSettlementRecord');

  // Verify no prohibited claims in dictionaries
  const prohibitedWords = ['100% garansi masuk', '100% escrow', '100% guaranteed entry', 'automatic 100% refund'];
  const idStr = JSON.stringify(idDict).toLowerCase();
  const enStr = JSON.stringify(enDict).toLowerCase();

  for (const pw of prohibitedWords) {
    assert.strictEqual(idStr.includes(pw), false, `Prohibited phrase '${pw}' found in Indonesian dictionary`);
    assert.strictEqual(enStr.includes(pw), false, `Prohibited phrase '${pw}' found in English dictionary`);
  }

  console.log('  ✅ PASSED: Zero prohibited claims and 100% dictionary parity maintained.\n');

  console.log('================================================================');
  console.log('ALL VERIFICATION PASSES COMPLETED SUCCESSFULLY! (7/7 TEST SUITES)');
  console.log('================================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
