/**
 * ARGUS CANONICAL MARKETPLACE MODEL ALIGNMENT TEST SUITE
 * 
 * Verifies:
 * 1. Marketplace ticket listings return all 10 canonical attributes (Event, Venue, Date, Category, Seat, Face Value, Asking Price, Buyer Total, Verif Status, PIC Availability).
 * 2. Negotiation / Counter-Offer flow:
 *    - Seller can counter a pending offer with a valid structured price
 *    - Counter-offer rejects free-text chat/notes (Anti-Chat)
 *    - Counter-offer must be > buyer offer and <= listing asking price
 *    - Buyer can accept counter-offer -> becomes Order at counter price, locks listing to RESERVED, supersedes other offers
 * 3. Payment Provider Abstraction (iPaymu):
 *    - Differentiates escrow-supported methods (VA Escrow, QRIS Escrow) from non-escrow methods (Direct Transfer)
 *    - Rejecting non-escrow methods when escrow is required
 *    - Generating escrow-capable payment session
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { ListingService } = require('./src/services/listingService');
const { OfferService, OFFER_STATUS } = require('./src/services/offerService');
const { EscrowService } = require('./src/services/escrowService');
const { paymentManager, IPaymuProvider } = require('./src/services/payment');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log('  \u2713', name);
    passed++;
  } catch (err) {
    console.error('  \u2717', name, '->', err.message);
    failed++;
  }
}

async function runAll() {
  console.log('\n=== ARGUS CANONICAL MARKETPLACE MODEL ALIGNMENT TEST SUITE ===\n');

  resetDatabase();

  // ---------------------------------------------------------------------------
  // TEST 1: Listing Attributes
  // ---------------------------------------------------------------------------
  await runTest('Test 1: Marketplace listings return all 10 canonical attributes', async () => {
    // Create a listing
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'CAT 1 - Tribune Barat Row 12',
      faceValue: 1500000,
      price: 1800000,
      rawBarcode: 'BC-CANONICAL-TEST-001'
    });

    await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

    const activeListings = ListingService.getActiveListings();
    const l = activeListings.find(item => item.id === listingRes.listing.id);

    assert.ok(l, 'Listing must be returned in active listings');
    assert.ok(l.event_title.includes('Coldplay'), 'Event title must match Coldplay');
    assert.ok(l.venue_name, 'Venue must be present');
    assert.ok(l.event_date, 'Date/time must be present');
    assert.strictEqual(l.ticket_category, 'CAT 1', 'Ticket category must be extracted');
    assert.strictEqual(l.seat_info, 'CAT 1 - Tribune Barat Row 12');
    assert.strictEqual(l.face_value, 1500000);
    assert.strictEqual(l.seller_asking_price, 1800000);
    assert.strictEqual(l.verification_status, 'VERIFIED');
    assert.strictEqual(typeof l.pic_available, 'boolean');
    assert.strictEqual(l.pic_available, true, 'pic-1 is assigned to event-coldplay');

    // Pricing calculation
    const pricing = EscrowService.calculatePricing(l.price);
    assert.strictEqual(pricing.totalAmount, 1980000, 'Buyer total price must include transparent 10% platform fee');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Counter-Offer Lifecycle
  // ---------------------------------------------------------------------------
  await runTest('Test 2: Seller can counter-offer with strict boundary & anti-chat enforcement', async () => {
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'VIP - Row 1',
      faceValue: 3000000,
      price: 3500000,
      rawBarcode: 'BC-CANONICAL-TEST-002'
    });
    await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

    // Buyer makes offer 2,500,000
    const offer = await OfferService.createOffer({
      buyerId: 'buyer-1',
      listingId: listingRes.listing.id,
      offerAmount: 2500000
    });
    assert.strictEqual(offer.status, OFFER_STATUS.PENDING);

    // Subcase 2A: Anti-chat check on counter-offer
    try {
      await OfferService.counterOffer({
        offerId: offer.id,
        sellerId: 'seller-1',
        counterAmount: 3000000,
        message: 'Bisa nego dikit kak'
      });
      assert.fail('Should have rejected free-text message in counter-offer');
    } catch (err) {
      assert.strictEqual(err.code, 'FREE_TEXT_NOT_ALLOWED');
    }

    // Subcase 2B: Counter amount <= buyer offer is rejected
    try {
      await OfferService.counterOffer({
        offerId: offer.id,
        sellerId: 'seller-1',
        counterAmount: 2400000
      });
      assert.fail('Should have rejected counter <= buyer offer');
    } catch (err) {
      assert.strictEqual(err.code, 'COUNTER_AMOUNT_TOO_LOW');
    }

    // Subcase 2C: Counter amount > listing price is rejected
    try {
      await OfferService.counterOffer({
        offerId: offer.id,
        sellerId: 'seller-1',
        counterAmount: 3800000
      });
      assert.fail('Should have rejected counter > listing price');
    } catch (err) {
      assert.strictEqual(err.code, 'COUNTER_AMOUNT_EXCEEDS_LISTING');
    }

    // Subcase 2D: Valid counter-offer succeeds
    const countered = await OfferService.counterOffer({
      offerId: offer.id,
      sellerId: 'seller-1',
      counterAmount: 3200000
    });
    assert.strictEqual(countered.status, OFFER_STATUS.COUNTERED);
    assert.strictEqual(countered.counter_amount, 3200000);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Buyer Accepts Counter-Offer -> Order Created at Counter Price
  // ---------------------------------------------------------------------------
  await runTest('Test 3: Buyer accepts counter-offer -> Order created & listing locked', async () => {
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'CAT 2 - Row 5',
      faceValue: 1000000,
      price: 1500000,
      rawBarcode: 'BC-CANONICAL-TEST-003'
    });
    await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

    // Buyer 1 offers 1,100,000
    const offer1 = await OfferService.createOffer({
      buyerId: 'buyer-1',
      listingId: listingRes.listing.id,
      offerAmount: 1100000
    });

    // Buyer 2 offers 1,200,000 (competing offer)
    const offer2 = await OfferService.createOffer({
      buyerId: 'buyer-2',
      listingId: listingRes.listing.id,
      offerAmount: 1200000
    });

    // Seller counters Buyer 1 with 1,350,000
    await OfferService.counterOffer({
      offerId: offer1.id,
      sellerId: 'seller-1',
      counterAmount: 1350000
    });

    // Buyer 1 accepts the counter-offer
    const result = await OfferService.acceptCounterOffer({
      offerId: offer1.id,
      buyerId: 'buyer-1'
    });

    assert.strictEqual(result.offer.status, OFFER_STATUS.ACCEPTED);
    assert.strictEqual(result.order.ticket_price, 1350000, 'Order price must match agreed counter amount');
    assert.strictEqual(result.pricing.ticketPrice, 1350000);
    assert.strictEqual(result.pricing.platformFee, 135000); // 10% fee
    assert.strictEqual(result.pricing.totalAmount, 1485000); // Total buyer pay

    // Listing must be RESERVED
    const listing = state.listings.find(l => l.id === listingRes.listing.id);
    assert.strictEqual(listing.status, 'RESERVED');

    // Competing offer 2 must be auto-superseded
    const competing = state.offers.find(o => o.id === offer2.id);
    assert.strictEqual(competing.status, OFFER_STATUS.SUPERSEDED);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Payment Provider Abstraction (iPaymu Escrow Validation)
  // ---------------------------------------------------------------------------
  await runTest('Test 4: iPaymu distinguishes escrow-capable vs direct methods and rejects non-escrow', async () => {
    const provider = paymentManager.getProvider('ipaymu');
    assert.strictEqual(provider.getName(), 'ipaymu');
    assert.strictEqual(provider.getCountry(), 'ID');

    // Check channels
    const channels = provider.getSupportedChannels();
    const vaBca = channels.find(c => c.code === 'BCA_VA');
    assert.ok(vaBca);
    assert.strictEqual(vaBca.isEscrowSupported, true);

    const directTransfer = channels.find(c => c.code === 'DIRECT_BANK_TRANSFER');
    assert.ok(directTransfer);
    assert.strictEqual(directTransfer.isEscrowSupported, false);

    // Subcase 4A: Attempting non-escrow channel on escrow order is rejected
    try {
      await provider.createPayment({
        orderId: 'ord-test-escrow',
        amount: 500000,
        channel: 'DIRECT_BANK_TRANSFER',
        requiresEscrow: true
      });
      assert.fail('Should have rejected non-escrow channel when escrow is required');
    } catch (err) {
      assert.strictEqual(err.code, 'ESCROW_CHANNEL_UNSUPPORTED');
    }

    // Subcase 4B: Escrow VA succeeds
    const session = await provider.createPayment({
      orderId: 'ord-test-escrow',
      amount: 500000,
      channel: 'BCA_VA',
      requiresEscrow: true
    });

    assert.strictEqual(session.provider, 'ipaymu');
    assert.strictEqual(session.channel, 'BCA_VA');
    assert.strictEqual(session.isEscrowCapable, true);
    assert.strictEqual(session.escrowHoldStatus, 'ESCROW_HOLD_RESERVED');
    assert.ok(session.paymentDetails.vaNumber, 'VA number must be generated');
  });

  console.log(`\n=======================`);
  console.log(`Marketplace Alignment Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
