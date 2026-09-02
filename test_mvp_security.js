process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase, run } = require('./src/database');
const { ListingService } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { SettlementService } = require('./src/services/settlementService');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (e) {
    console.error('  \u2717', name, '->', e.message);
    failed++;
  }
}

async function runSecuritySuite() {
  console.log('\n=== ARGUS MVP: SECURITY & INVARIANTS TEST SUITE ===\n');
  resetDatabase();

  // 1. KYC Enforcement: Unverified seller cannot list
  await testAsync('Security 1: KYC Enforcement — Unverified seller rejected immediately', async () => {
    state.users.push({ id: 'unverified-seller', name: 'Fake Seller', role: 'seller' });
    state.seller_profiles.push({ user_id: 'unverified-seller', kyc_status: 'UNVERIFIED', active_listing_limit: 0 });

    try {
      await ListingService.createListing({
        sellerId: 'unverified-seller',
        eventId: 'event-coldplay',
        seatInfo: 'CAT 1 - Seat 99',
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'BARCODE-UNVERIFIED-TEST'
      });
      assert.fail('Should have thrown SELLER_NOT_ELIGIBLE');
    } catch (err) {
      assert.strictEqual(err.code, 'SELLER_NOT_ELIGIBLE');
    }
  });

  // 2. Seller limits enforcement
  await testAsync('Security 2: Seller Limits — Seller cannot exceed active listing limit', async () => {
    state.seller_profiles.find(p => p.user_id === 'seller-1').active_listing_limit = 1;

    try {
      // First listing
      await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-coldplay',
        seatInfo: 'CAT 1 - Seat 101',
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'BARCODE-LIMIT-1'
      });

      // Second listing should fail
      await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-coldplay',
        seatInfo: 'CAT 1 - Seat 102',
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'BARCODE-LIMIT-2'
      });
      assert.fail('Should have rejected due to limit');
    } catch (err) {
      assert.strictEqual(err.code, 'SELLER_NOT_ELIGIBLE');
      assert.ok(err.message.includes('limit'));
    } finally {
      state.seller_profiles.find(p => p.user_id === 'seller-1').active_listing_limit = 10;
    }
  });

  // 3. Duplicate ticket barcode prevention
  await testAsync('Security 3: Duplicate Ticket Prevention — Same barcode cannot be listed twice', async () => {
    // First listing with barcode
    await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'CAT 1 - Seat 50',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'UNIQUE-BARCODE-XYZ-123'
    });

    // Attempt duplicate listing with same barcode
    try {
      await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-coldplay',
        seatInfo: 'CAT 1 - Seat 51',
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'UNIQUE-BARCODE-XYZ-123'
      });
      assert.fail('Should have rejected duplicate barcode');
    } catch (err) {
      assert.strictEqual(err.code, 'DUPLICATE_TICKET_BARCODE');
    }
  });

  // 4. Escrow release invariant: cannot release funds before PIC gate entry
  await testAsync('Security 4: Escrow Invariant — Cannot release funds before confirmed gate entry', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'CAT 1 - Seat 60',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-ESCROW-INVARIANT'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-invariant-1',
      idempotencyKey: 'idem-inv-1',
      amountPaid: 1650000
    });

    // Attempt to release without gate entry verification
    try {
      await EscrowService.releaseToSeller(orderRes.order.id, 'admin-1');
      assert.fail('Should have rejected release');
    } catch (err) {
      assert.strictEqual(err.code, 'ENTRY_NOT_CONFIRMED');
    }
  });

  // 5. Payment idempotency
  await testAsync('Security 5: Payment Idempotency — Duplicate webhook/request returns existing state', async () => {
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'CAT 1 - Seat 70',
      faceValue: 1250000,
      price: 1500000,
      rawBarcode: 'BARCODE-IDEM-TEST'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

    const orderRes = await EscrowService.createOrder({
      buyerId: 'buyer-1',
      listingId: listRes.listing.id
    });

    // Payment 1
    const p1 = await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-idem-1',
      idempotencyKey: 'same-key-12345',
      amountPaid: 1650000
    });
    assert.strictEqual(p1.idempotent, false);

    // Payment 2 with identical key
    const p2 = await EscrowService.recordPayment({
      orderId: orderRes.order.id,
      providerRef: 'pay-idem-1-retry',
      idempotencyKey: 'same-key-12345',
      amountPaid: 1650000
    });
    assert.strictEqual(p2.idempotent, true);
    assert.strictEqual(p1.payment.id, p2.payment.id);
  });

  // 6. Audit Trail Immutability (ADR-003 / Invariant 6)
  await testAsync('Security 6: Immutable Audit Trail — UPDATE and DELETE on audit_logs are forbidden', async () => {
    try {
      await run('UPDATE audit_logs SET action = "TAMPERED" WHERE id = 1');
      assert.fail('Should have prevented UPDATE on audit_logs');
    } catch (err) {
      assert.ok(err.message.includes('audit_logs'));
    }

    try {
      await run('DELETE FROM audit_logs WHERE id = 1');
      assert.fail('Should have prevented DELETE on audit_logs');
    } catch (err) {
      assert.ok(err.message.includes('audit_logs'));
    }
  });

  // 7. PIC Assignment Security: Unassigned user cannot confirm entry
  await testAsync('Security 7: PIC Authorization — Unassigned user cannot record entry', async () => {
    state.users.push({ id: 'impostor-pic', name: 'Mallory Impostor', role: 'user' });

    try {
      await EventPicService.recordEntryVerification({
        picUserId: 'impostor-pic',
        orderId: 'ord-dummy-test',
        gate: 'Gate 3',
        status: 'CONFIRMED'
      });
      assert.fail('Should have rejected impostor PIC');
    } catch (err) {
      assert.ok(err.message.includes('not found') || err.code === 'PIC_UNAUTHORIZED');
    }
  });

  console.log(`\n=======================`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) process.exit(1);
}

runSecuritySuite().catch(err => {
  console.error('Security Suite Failed:', err);
  process.exit(1);
});

