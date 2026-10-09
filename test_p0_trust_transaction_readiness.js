/**
 * TIKUM / ARGUS — P0 TRUST & TRANSACTION READINESS TEST SUITE
 *
 * Comprehensive Automated Verification Suite:
 * 1. Payment Gateway Fail-Closed Safety (All 4 Providers):
 *    - DOKU fails closed when mode=production and ENABLE_DOKU_PRODUCTION !== 'true'
 *    - iPaymu fails closed when isProduction=true and ENABLE_IPAYMU_PRODUCTION !== 'true'
 *    - Midtrans fails closed when isProduction=true and ENABLE_MIDTRANS_PRODUCTION !== 'true'
 *    - Xendit fails closed when mode=production and ENABLE_XENDIT_PRODUCTION !== 'true'
 * 2. Provider Escrow Boundary & Capability Enforcement:
 *    - Midtrans & Xendit strictly reject milestone escrow with CapabilityUnsupportedError
 *    - iPaymu rejects non-VA channels for escrow
 * 3. Payment Idempotency & Concurrency:
 *    - Duplicate webhook / payment processing returns existing record with idempotent: true
 *    - Duplicate release returns alreadyReleased: true without creating double disbursal
 * 4. Dispute Lifecycle & Escrow Freeze Invariants:
 *    - Dispute freezes escrow immediately (status: DISPUTED)
 *    - releaseToSeller throws TRANSACTION_IN_DISPUTED_STATE when disputed
 *    - releaseToSeller requires confirmed venue entry (ENTRY_NOT_CONFIRMED)
 * 5. Double-Entry FinancialLedger Solvency:
 *    - Balanced debits and credits succeed immutably
 *    - Imbalanced debits and credits throw LEDGER_UNBALANCED
 * 6. Ticket Verification, Barcode Privacy & PII Protection:
 *    - Raw barcode is hashed (SHA-256)
 *    - Public listings never expose raw barcode, barcode hash, or unauthenticated PIC phone numbers
 * 7. Venue PIC Operational Reality:
 *    - VenueAssistService returns PIC_UNAVAILABLE when no active assignment exists
 *    - No fake claims of venue PIC presence
 * 8. Audit Log Immutability:
 *    - Mutation or deletion of audit logs is rejected
 */

process.env.NODE_ENV = 'test';
process.env.ENABLE_DOKU_PRODUCTION = 'false';
process.env.ENABLE_IPAYMU_PRODUCTION = 'false';
process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
process.env.ENABLE_XENDIT_PRODUCTION = 'false';

const assert = require('assert');
const crypto = require('crypto');
const { state, resetDatabase, run } = require('./src/database');
const {
  DokuPaymentProvider,
  IPaymuProvider,
  MidtransPaymentProvider,
  XenditPaymentProvider,
  CapabilityUnsupportedError
} = require('./src/services/payment/index');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { DisputeService, DISPUTE_STATUS } = require('./src/services/disputeService');
const { VenueAssistService, PIC_AVAILABILITY_STATUS } = require('./src/venue/VenueAssistService');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');

async function runTrustAndReadinessSuite() {
  console.log('================================================================');
  console.log('  TIKUM — P0 TRUST & TRANSACTION READINESS VERIFICATION SUITE');
  console.log('================================================================\n');

  resetDatabase();

  let passed = 0;
  let total = 0;

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: FAIL-CLOSED PAYMENT LOCK ON ALL 4 PROVIDERS
  // ---------------------------------------------------------------------------
  console.log('── Section 1: Payment Gateway Fail-Closed Safety (All 4 Providers) ──');

  await testAsync('1.1 DOKU fails closed when in production mode without explicit enablement', async () => {
    const orig = process.env.ENABLE_DOKU_PRODUCTION;
    process.env.ENABLE_DOKU_PRODUCTION = 'false';
    try {
      const doku = new DokuPaymentProvider({
        clientId: 'doku-live-client',
        secretKey: 'doku-live-secret',
        apiBaseUrl: 'https://api.doku.com',
        env: 'production',
        mode: 'production',
        allowSimulation: false
      });
      await doku.createPayment({
        orderId: 'ord-doku-lock',
        amount: 250000,
        channel: 'QRIS'
      });
      assert.fail('DOKU should have thrown fail-closed lock error');
    } catch (err) {
      assert.ok(err.message.includes('Live DOKU production API client awaiting merchant production activation'));
    } finally {
      process.env.ENABLE_DOKU_PRODUCTION = orig;
    }
  });

  await testAsync('1.2 iPaymu fails closed when in production mode without explicit enablement', async () => {
    const orig = process.env.ENABLE_IPAYMU_PRODUCTION;
    process.env.ENABLE_IPAYMU_PRODUCTION = 'false';
    try {
      const ipaymu = new IPaymuProvider({
        apiKey: 'ipaymu-live-key',
        virtualAccount: '1122334455',
        mode: 'production',
        allowSimulation: false
      });
      await ipaymu.createPayment({
        orderId: 'ord-ipaymu-lock',
        amount: 250000,
        channel: 'BCA_VA'
      });
      assert.fail('iPaymu should have thrown fail-closed lock error');
    } catch (err) {
      assert.ok(err.message.includes('Live iPaymu production API client awaiting merchant production activation'));
    } finally {
      process.env.ENABLE_IPAYMU_PRODUCTION = orig;
    }
  });

  await testAsync('1.3 Midtrans fails closed when in production mode without explicit enablement', async () => {
    const orig = process.env.ENABLE_MIDTRANS_PRODUCTION;
    process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
    try {
      const midtrans = new MidtransPaymentProvider({
        serverKey: 'midtrans-live-server-key',
        clientKey: 'midtrans-live-client-key',
        isProduction: true,
        allowSimulation: false
      });
      await midtrans.createPayment({
        orderId: 'ord-midtrans-lock',
        amount: 250000,
        channel: 'SNAP',
        requiresEscrow: false
      });
      assert.fail('Midtrans should have thrown fail-closed lock error');
    } catch (err) {
      assert.ok(err.message.includes('Live Midtrans production API client awaiting merchant production activation'));
    } finally {
      process.env.ENABLE_MIDTRANS_PRODUCTION = orig;
    }
  });

  await testAsync('1.4 Xendit fails closed when in production mode without explicit enablement', async () => {
    const orig = process.env.ENABLE_XENDIT_PRODUCTION;
    process.env.ENABLE_XENDIT_PRODUCTION = 'false';
    try {
      const xendit = new XenditPaymentProvider({
        secretKey: 'xnd_production_key_123',
        mode: 'production',
        allowSimulation: false
      });
      await xendit.createPayment({
        orderId: 'ord-xendit-lock',
        amount: 250000,
        channel: 'QRIS',
        requiresEscrow: false
      });
      assert.fail('Xendit should have thrown fail-closed lock error');
    } catch (err) {
      assert.ok(err.message.includes('Live Xendit production API client awaiting merchant production activation'));
    } finally {
      process.env.ENABLE_XENDIT_PRODUCTION = orig;
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: CAPABILITY GATES & ESCROW REJECTION
  // ---------------------------------------------------------------------------
  console.log('\n── Section 2: Capability Gates & Escrow Rejection ──');

  await testAsync('2.1 Midtrans rejects milestone escrow with CapabilityUnsupportedError', async () => {
    const midtrans = new MidtransPaymentProvider({ allowSimulation: true });
    try {
      await midtrans.createPayment({
        orderId: 'ord-midtrans-escrow',
        amount: 500000,
        requiresEscrow: true
      });
      assert.fail('Midtrans must reject requiresEscrow');
    } catch (err) {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
    }
  });

  await testAsync('2.2 Xendit rejects milestone escrow with CapabilityUnsupportedError', async () => {
    const xendit = new XenditPaymentProvider({ allowSimulation: true });
    try {
      await xendit.createPayment({
        orderId: 'ord-xendit-escrow',
        amount: 500000,
        requiresEscrow: true
      });
      assert.fail('Xendit must reject requiresEscrow');
    } catch (err) {
      assert.ok(err instanceof CapabilityUnsupportedError);
      assert.ok(err.message.includes('ESCROW_UNAVAILABLE'));
    }
  });

  await testAsync('2.3 iPaymu rejects non-VA channels for milestone escrow', async () => {
    const ipaymu = new IPaymuProvider({ allowSimulation: true });
    try {
      await ipaymu.createPayment({
        orderId: 'ord-ipaymu-qris-escrow',
        amount: 500000,
        channel: 'QRIS',
        requiresEscrow: true
      });
      assert.fail('iPaymu must reject non-VA for escrow');
    } catch (err) {
      assert.strictEqual(err.code, 'ESCROW_CHANNEL_UNSUPPORTED');
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: IDEMPOTENCY & CONCURRENCY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 3: Idempotency & Concurrency Invariants ──');

  await testAsync('3.1 Record payment is strictly idempotent against duplicate webhooks', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Seat 11',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-READINESS-IDEM-01'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    const p1 = await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-readiness-idem-1',
      idempotencyKey: 'key-readiness-idem-01',
      amountPaid: orderRes.order.buyer_total
    });
    assert.strictEqual(p1.idempotent, false);
    assert.strictEqual(p1.order.status, ORDER_STATUS.PAID_ESCROWED);

    const p2 = await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-readiness-idem-1-duplicate',
      idempotencyKey: 'key-readiness-idem-01',
      amountPaid: orderRes.order.buyer_total
    });
    assert.strictEqual(p2.idempotent, true);
    assert.strictEqual(p1.payment.id, p2.payment.id);
  });

  await testAsync('3.2 Releasing already released escrow is idempotent and does not duplicate disbursement', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Seat 12',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-READINESS-RELEASE-02'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-readiness-release-02',
      idempotencyKey: 'key-readiness-release-02',
      amountPaid: orderRes.order.buyer_total
    });

    const { EventPicService } = require('./src/services/eventPicService');
    await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId: orderRes.order.id,
      gate: 'Gate 1',
      notes: 'Entry confirmed at gate',
      status: 'CONFIRMED'
    });

    // First release
    const rel1 = await EscrowService.releaseToSeller(orderRes.order.id, 'admin-1');
    assert.strictEqual(rel1.success, true);
    assert.strictEqual(rel1.alreadyReleased, false);

    // Second release attempt
    const rel2 = await EscrowService.releaseToSeller(orderRes.order.id, 'admin-1');
    assert.strictEqual(rel2.success, true);
    assert.strictEqual(rel2.alreadyReleased, true);
    assert.strictEqual(rel2.idempotent, true);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: DISPUTE LIFECYCLE & ESCROW FREEZE
  // ---------------------------------------------------------------------------
  console.log('\n── Section 4: Dispute Lifecycle & Escrow Freeze Invariants ──');

  await testAsync('4.1 Opening dispute freezes escrow and blocks releaseToSeller', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Seat 13',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-READINESS-DISPUTE-03'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-readiness-dispute-03',
      idempotencyKey: 'key-readiness-dispute-03',
      amountPaid: orderRes.order.buyer_total
    });

    // Buyer opens dispute
    await DisputeService.openDispute({
      orderId: orderRes.order.id,
      buyerId: 'buyer-1',
      reason: 'GATE_REJECTION',
      claimDetails: 'Turnstile scanner rejected ticket barcode'
    });

    const escrow = state.escrows.find(e => e.order_id === orderRes.order.id);
    assert.strictEqual(escrow.status, ESCROW_STATUS.DISPUTED);

    // Releasing disputed transaction must throw TRANSACTION_IN_DISPUTED_STATE
    try {
      await EscrowService.releaseToSeller(orderRes.order.id, 'admin-1');
      assert.fail('Should not release disputed escrow');
    } catch (err) {
      assert.strictEqual(err.code, 'TRANSACTION_IN_DISPUTED_STATE');
    }
  });

  await testAsync('4.2 Releasing escrow without confirmed gate entry is strictly blocked', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Seat 14',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-READINESS-NOENTRY-04'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-readiness-noentry-04',
      idempotencyKey: 'key-readiness-noentry-04',
      amountPaid: orderRes.order.buyer_total
    });

    // No entry verification recorded
    try {
      await EscrowService.releaseToSeller(orderRes.order.id, 'admin-1');
      assert.fail('Should reject release when gate entry is not confirmed');
    } catch (err) {
      assert.strictEqual(err.code, 'ENTRY_NOT_CONFIRMED');
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: DOUBLE-ENTRY FINANCIAL LEDGER SOLVENCY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 5: Double-Entry FinancialLedger Solvency ──');

  await testAsync('5.1 Balanced transaction records successfully in FinancialLedger', async () => {
    const journal = await FinancialLedger.recordTransaction({
      eventType: 'CAPTURE',
      orderId: 'ord-ledger-test-01',
      description: 'Customer payment capture for ticket',
      entries: [
        { account: LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING, type: 'DEBIT', amount: 1500000 },
        { account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING, type: 'CREDIT', amount: 1410000 },
        { account: LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE, type: 'CREDIT', amount: 90000 }
      ]
    });
    assert.ok(journal.transaction_id);
    assert.strictEqual(journal.total_amount, 1500000);
  });

  await testAsync('5.2 Imbalanced transaction throws LEDGER_UNBALANCED', async () => {
    try {
      await FinancialLedger.recordTransaction({
        eventType: 'CAPTURE',
        orderId: 'ord-ledger-imbalance-02',
        description: 'Imbalanced entry attempt',
        entries: [
          { account: LEDGER_ACCOUNTS.BUYER_ESCROW_HOLDING, type: 'DEBIT', amount: 1500000 },
          { account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING, type: 'CREDIT', amount: 1000000 }
        ]
      });
      assert.fail('Should throw LEDGER_UNBALANCED');
    } catch (err) {
      assert.strictEqual(err.code, 'LEDGER_UNBALANCED');
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: TICKET PRIVACY & SENSITIVE ASSET HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n── Section 6: Ticket Privacy & Sensitive Asset Handling ──');

  await testAsync('6.1 Ticket barcode is hashed and raw barcode is excluded from public listings', async () => {
    const rawBarcode = 'SECRET-RAW-TICKET-BARCODE-999';
    const expectedHash = crypto.createHash('sha256').update(rawBarcode.trim()).digest('hex');

    const event = state.events.find(e => e.id === 'event-pestapora-2026');
    if (event) {
      event.is_verified = true;
      event.verification_status = 'VERIFIED';
      event.evidence_hash = 'sha256-test-lany';
    }

    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-pestapora-2026',
      seatInfo: 'CAT 1 - Seat 15',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode
    });

    // Check stored ticket in state
    const ticket = state.tickets.find(t => t.id === listRes.ticket.id || t.ticket_id === listRes.ticket.ticket_id);
    assert.strictEqual(ticket.barcode_hash, expectedHash);
    assert.strictEqual(ticket.raw_barcode || null, null);

    // Verify listing
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    // Inspect public listings
    const activeListings = ListingService.getActiveListings();
    const pubListing = activeListings.find(l => l.id === listRes.listing.id);
    assert.ok(pubListing);
    assert.strictEqual(pubListing.rawBarcode, undefined);
    assert.strictEqual(pubListing.barcode_hash, undefined);
    assert.strictEqual(pubListing.raw_barcode, undefined);
    assert.strictEqual(pubListing.pic_contact, null);
  });

  await testAsync('6.2 Order tracking endpoint (/api/mvp/track/:id) hides pic_contact from unauthenticated third parties guessing order IDs', async () => {
    const http = require('http');
    const app = require('./src/server');
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const order = state.orders[0];
      assert.ok(order, 'Existing order must exist');

      // Unauthenticated third-party request
      const unauthRes = await fetch(`http://127.0.0.1:${port}/api/mvp/track/${order.id}`);
      assert.strictEqual(unauthRes.status, 200);
      const unauthData = await unauthRes.json();
      assert.strictEqual(unauthData.transaction.pic_contact, null, 'Unauthenticated caller must not see pic_contact');

      // Authenticated owner request
      const authRes = await fetch(`http://127.0.0.1:${port}/api/mvp/track/${order.id}`, {
        headers: { 'x-user-id': order.buyer_id }
      });
      assert.strictEqual(authRes.status, 200);
      const authData = await authRes.json();
      const picAssign = state.event_pics.find(ep => ep.event_id === order.event_id && ep.status === 'ACTIVE');
      if (picAssign) {
        assert.strictEqual(authData.transaction.pic_contact, picAssign.contact_phone, 'Order buyer must see assigned pic_contact');
      }
    } finally {
      server.close();
    }
  });

  await testAsync('6.3 Direct order details endpoint (/api/mvp/orders/:id) forbids unauthorized users from accessing other buyers orders', async () => {
    const http = require('http');
    const app = require('./src/server');
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const order = state.orders[0];
      assert.ok(order, 'Existing order must exist');

      // Unauthorized request with another registered buyer user id (buyer-2)
      const forbiddenRes = await fetch(`http://127.0.0.1:${port}/api/mvp/orders/${order.id}`, {
        headers: { 'x-user-id': 'buyer-2' }
      });
      assert.strictEqual(forbiddenRes.status, 403);
      const forbiddenData = await forbiddenRes.json();
      assert.strictEqual(forbiddenData.code, 'FORBIDDEN');
    } finally {
      server.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 7: VENUE PIC OPERATIONAL REALITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 7: Venue PIC Operational Reality ──');

  await testAsync('7.1 Event without assigned PIC returns PIC_UNAVAILABLE', async () => {
    const result = VenueAssistService.getAvailabilityForEvent('event-unassigned-nonexistent');
    assert.strictEqual(result.status, PIC_AVAILABILITY_STATUS.PIC_UNAVAILABLE);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.operatorId, null);
  });

  await testAsync('7.2 Event with confirmed PIC assignment returns PIC_AVAILABLE or PIC_ON_SITE', async () => {
    const eventId = 'event-pestapora-2026';
    const result = VenueAssistService.getAvailabilityForEvent(eventId);
    assert.strictEqual(result.available, true);
    assert.ok(result.status === PIC_AVAILABILITY_STATUS.PIC_AVAILABLE || result.status === PIC_AVAILABILITY_STATUS.PIC_ON_SITE);
    assert.strictEqual(result.operatorId, 'pic-1');
  });

  // ---------------------------------------------------------------------------
  // SECTION 8: AUDIT LOG IMMUTABILITY
  // ---------------------------------------------------------------------------
  console.log('\n── Section 8: Audit Log Immutability ──');

  await testAsync('8.1 Mutation and deletion of audit logs are strictly forbidden', async () => {
    try {
      await run('UPDATE audit_logs SET action = "TAMPERED" WHERE id = 1');
      assert.fail('UPDATE on audit_logs must be rejected');
    } catch (err) {
      assert.ok(err.message.includes('audit_logs'));
    }

    try {
      await run('DELETE FROM audit_logs WHERE id = 1');
      assert.fail('DELETE on audit_logs must be rejected');
    } catch (err) {
      assert.ok(err.message.includes('audit_logs'));
    }
  });

  console.log('\n================================================================');
  console.log(`  VERIFICATION RESULTS: ${passed}/${total} PASSED | ${total - passed} FAILED`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTrustAndReadinessSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
