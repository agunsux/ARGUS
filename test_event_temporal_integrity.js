/**
 * TIKUM / ARGUS — Event Temporal Integrity & Canonical Lifecycle Suite
 * 
 * Absolute Business Invariant:
 * AN EVENT MUST NEVER APPEAR IN UPCOMING/HOMEPAGE IF ITS EVENT HAS ALREADY ENDED.
 * 
 * Tests:
 * 1. 16-Case Temporal Test Matrix (Cases 1 - 16)
 * 2. 6 Core Property Invariants (Invariants A - F)
 * 3. Regression Fixtures:
 *    - Sheila On 7 — Bandung (2024-09-28) -> ARCHIVED
 *    - Coldplay — GBK (2023-11-15) -> ARCHIVED
 *    - Raditya Dika — TIM (2026-09-19 when evaluated at 2026-09-22) -> ARCHIVED
 * 4. Red-Team Resurrection Scenarios:
 *    - Source re-ingestion claiming ON_SALE/UPCOMING cannot resurrect ended event
 *    - Re-verification / observation updates cannot resurrect ended event
 *    - Listing creation rejected on ended events
 * 5. Dry-Run / Audit Report Verification
 */

const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const {
  EventTemporalLifecycleEngine,
  LIFECYCLE_STATUS
} = require('./src/discovery/EventTemporalLifecycleEngine');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { ListingService } = require('./src/services/listingService');
const { MarketplaceListingService } = require('./src/services/marketplace/MarketplaceListingService');
const { EventSEOService } = require('./src/discovery/EventSEOService');
const { TechnicalSEOService } = require('./src/seo/TechnicalSEOService');
const { EventSourceObservation } = require('./src/discovery/models/EventSourceObservation');
const fs = require('fs');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`  ❌ [FAIL] ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM — EVENT TEMPORAL INTEGRITY & CANONICAL LIFECYCLE     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  resetDatabase();

  const referenceNow = new Date('2026-09-22T12:00:00+07:00');

  // ================================================================
  // SECTION 1: 16-CASE TEMPORAL TEST MATRIX
  // ================================================================
  console.log('── Part 1: 16-Case Temporal Test Matrix ──');

  // Case 1: Standard upcoming single-day event with start_time
  runTest('Case 1: Standard upcoming single-day with start_time (start_date > now)', () => {
    const event = {
      id: 'case-1',
      date: '2026-10-15',
      time: '19:00',
      city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.UPCOMING);
    assert.strictEqual(upcoming, true);
    assert.ok(temporal.event_start_at.includes('2026-10-15T19:00:00+07:00'));
  });

  // Case 2: Standard upcoming single-day without start_time (defaults 19:00 WIB)
  runTest('Case 2: Standard upcoming single-day without start_time (defaults 19:00)', () => {
    const event = {
      id: 'case-2',
      date: '2026-11-01',
      city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.UPCOMING);
    assert.strictEqual(upcoming, true);
    assert.ok(temporal.event_start_at.includes('19:00:00+07:00'));
    assert.ok(new Date(temporal.event_end_at).getTime() > new Date(temporal.event_start_at).getTime());
  });

  // Case 3: Upcoming multi-day festival (start_date in future)
  runTest('Case 3: Upcoming multi-day festival (start_date in future)', () => {
    const event = {
      id: 'case-3',
      start_date: '2026-12-10',
      end_date: '2026-12-12',
      city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.UPCOMING);
    assert.strictEqual(upcoming, true);
    assert.ok(temporal.event_end_at.includes('2026-12-12T23:59:59+07:00'));
  });

  // Case 4: Event currently live / in-progress (start_at <= now <= end_at)
  runTest('Case 4: Event currently live / in-progress (start_at <= now <= end_at)', () => {
    const event = {
      id: 'case-4',
      event_start_at: '2026-09-22T10:00:00+07:00',
      event_end_at: '2026-09-22T15:00:00+07:00',
      city: 'Jakarta'
    };
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.LIVE);
    assert.strictEqual(upcoming, false, 'Live events are NOT upcoming in discovery feed');
  });

  // Case 5: Concluded event in H+48 grace period (end_at < now < end_at + 48h), no open ops
  runTest('Case 5: Concluded event in H+48 grace period (end_at < now < archive_at)', () => {
    const event = {
      id: 'case-5',
      event_start_at: '2026-09-21T18:00:00+07:00',
      event_end_at: '2026-09-21T22:00:00+07:00', // Ended 14 hours ago relative to referenceNow
      city: 'Jakarta'
    };
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.COMPLETED);
    assert.strictEqual(upcoming, false, 'Concluded event must NEVER be upcoming');
  });

  // Case 6: Concluded event past H+48 (now >= end_at + 48h), no open ops -> ARCHIVED
  runTest('Case 6: Concluded event past H+48 without open ops -> ARCHIVED', () => {
    const event = {
      id: 'case-6',
      event_start_at: '2026-09-15T18:00:00+07:00',
      event_end_at: '2026-09-15T22:00:00+07:00', // Ended 7 days ago
      city: 'Jakarta'
    };
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(upcoming, false);
  });

  // Case 7: Concluded event past H+48 with open order (PAID_ESCROWED)
  runTest('Case 7: Concluded event past H+48 with open order -> ARCHIVED_WITH_OPEN_OPERATIONS', () => {
    const eventId = 'case-7-event';
    const event = {
      id: eventId,
      event_id: eventId,
      event_start_at: '2026-09-15T18:00:00+07:00',
      event_end_at: '2026-09-15T22:00:00+07:00',
      city: 'Jakarta'
    };
    // Seed an open order
    state.orders.push({
      id: 'ord-case-7',
      event_id: eventId,
      status: 'PAID_ESCROWED',
      marketplace_status: 'PAID_ESCROWED'
    });

    const hasOps = EventTemporalLifecycleEngine.hasOpenPostEventOperations(eventId);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(hasOps, true);
    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS);
    assert.strictEqual(upcoming, false, 'Must never be upcoming despite open operations');
  });

  // Case 8: Concluded event past H+48 with open escrow (DELIVERY_PENDING)
  runTest('Case 8: Concluded event past H+48 with open escrow -> ARCHIVED_WITH_OPEN_OPERATIONS', () => {
    const eventId = 'case-8-event';
    const event = {
      id: eventId,
      event_id: eventId,
      event_start_at: '2026-09-10T18:00:00+07:00',
      event_end_at: '2026-09-10T22:00:00+07:00',
      city: 'Jakarta'
    };
    state.escrows.push({
      id: 'esc-case-8',
      event_id: eventId,
      status: 'DELIVERY_PENDING'
    });

    const hasOps = EventTemporalLifecycleEngine.hasOpenPostEventOperations(eventId);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(hasOps, true);
    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS);
    assert.strictEqual(upcoming, false);
  });

  // Case 9: Concluded event past H+48 with open dispute
  runTest('Case 9: Concluded event past H+48 with open dispute -> ARCHIVED_WITH_OPEN_OPERATIONS', () => {
    const eventId = 'case-9-event';
    const event = {
      id: eventId,
      event_id: eventId,
      event_start_at: '2026-09-10T18:00:00+07:00',
      event_end_at: '2026-09-10T22:00:00+07:00',
      city: 'Jakarta'
    };
    state.disputes.push({
      id: 'disp-case-9',
      event_id: eventId,
      status: 'OPEN'
    });

    const hasOps = EventTemporalLifecycleEngine.hasOpenPostEventOperations(eventId);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(hasOps, true);
    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED_WITH_OPEN_OPERATIONS);
    assert.strictEqual(upcoming, false);
  });

  // Case 10: Concluded event past H+48 with resolved orders/escrows -> transitions cleanly to ARCHIVED
  runTest('Case 10: Concluded event with resolved terminal ops -> transitions cleanly to ARCHIVED', () => {
    const eventId = 'case-10-event';
    const event = {
      id: eventId,
      event_id: eventId,
      event_start_at: '2026-09-10T18:00:00+07:00',
      event_end_at: '2026-09-10T22:00:00+07:00',
      city: 'Jakarta'
    };
    // Seed terminal records
    state.orders.push({
      id: 'ord-case-10',
      event_id: eventId,
      status: 'SETTLED',
      marketplace_status: 'SETTLED'
    });
    state.escrows.push({
      id: 'esc-case-10',
      event_id: eventId,
      status: 'RELEASED'
    });
    state.disputes.push({
      id: 'disp-case-10',
      event_id: eventId,
      status: 'RESOLVED'
    });

    const hasOps = EventTemporalLifecycleEngine.hasOpenPostEventOperations(eventId);
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(hasOps, false, 'Terminal records must not block archive');
    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(upcoming, false);
  });

  // Case 11: Multi-day festival spanning midnight rollover
  runTest('Case 11: Multi-day festival spanning midnight rollover ends at 23:59:59 on end_date', () => {
    const event = {
      id: 'case-11',
      start_date: '2026-09-20',
      end_date: '2026-09-23',
      city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    // At referenceNow (2026-09-22 12:00), the festival is LIVE
    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(event, referenceNow);
    const upcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.LIVE);
    assert.strictEqual(upcoming, false, 'Festival in progress is LIVE, not upcoming');
    assert.ok(temporal.event_end_at.includes('2026-09-23T23:59:59+07:00'));
  });

  // Case 12: Late night start rolling past midnight (e.g. 22:00 start, ends at 02:00 next day)
  runTest('Case 12: Late night start rolling past midnight ensures end_at > start_at', () => {
    const event = {
      id: 'case-12',
      date: '2026-10-31',
      time: '23:00',
      end_time: '03:00', // 3 AM next day
      city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    const startMs = new Date(temporal.event_start_at).getTime();
    const endMs = new Date(temporal.event_end_at).getTime();

    assert.ok(endMs > startMs, 'End datetime must be strictly after start datetime');
  });

  // Case 13: Timezone conversion WITA (Bali / Denpasar +08:00)
  runTest('Case 13: Timezone conversion WITA (Bali / Denpasar +08:00)', () => {
    const event = {
      id: 'case-13',
      date: '2026-11-20',
      time: '20:00',
      city: 'Denpasar',
      venue_city: 'Denpasar'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Makassar');
    assert.ok(temporal.event_start_at.includes('+08:00'), 'Must contain +08:00 offset');
  });

  // Case 14: Timezone conversion WIT (Jayapura +09:00)
  runTest('Case 14: Timezone conversion WIT (Jayapura +09:00)', () => {
    const event = {
      id: 'case-14',
      date: '2026-11-25',
      time: '19:00',
      city: 'Jayapura',
      venue_city: 'Jayapura'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Jayapura');
    assert.ok(temporal.event_start_at.includes('+09:00'), 'Must contain +09:00 offset');
  });

  // Case 15: Timezone conversion WIB (Jakarta / Bandung +07:00)
  runTest('Case 15: Timezone conversion WIB (Jakarta / Bandung +07:00)', () => {
    const event = {
      id: 'case-15',
      date: '2026-11-10',
      time: '19:00',
      city: 'Bandung',
      venue_city: 'Bandung'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Jakarta');
    assert.ok(temporal.event_start_at.includes('+07:00'), 'Must contain +07:00 offset');
  });

  // Case 16: Cancelled / Postponed administrative branch
  runTest('Case 16: Cancelled / Postponed events are never upcoming', () => {
    const cancelledEvent = {
      id: 'case-16-a',
      date: '2026-12-01',
      status: 'CANCELLED',
      city: 'Jakarta'
    };
    const postponedEvent = {
      id: 'case-16-b',
      date: '2026-12-01',
      status: 'POSTPONED',
      city: 'Jakarta'
    };

    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(cancelledEvent, referenceNow), false);
    assert.strictEqual(EventTemporalLifecycleEngine.resolveLifecycleStatus(cancelledEvent, referenceNow), LIFECYCLE_STATUS.CANCELLED);

    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(postponedEvent, referenceNow), false);
    assert.strictEqual(EventTemporalLifecycleEngine.resolveLifecycleStatus(postponedEvent, referenceNow), LIFECYCLE_STATUS.POSTPONED);
  });

  // ================================================================
  // SECTION 2: 6 CORE PROPERTY INVARIANTS
  // ================================================================
  console.log('\n── Part 2: 6 Core Property Invariants ──');

  // Invariant A: Temporal Monotonicity
  runTest('Invariant A: Temporal Monotonicity — Concluded event can never revert to UPCOMING/LIVE', () => {
    const pastEvent = {
      id: 'inv-a-event',
      event_start_at: '2026-09-01T19:00:00+07:00',
      event_end_at: '2026-09-01T23:00:00+07:00',
      city: 'Jakarta'
    };
    const statusAtT0 = EventTemporalLifecycleEngine.resolveLifecycleStatus(pastEvent, referenceNow);
    assert.ok(statusAtT0 === LIFECYCLE_STATUS.ARCHIVED || statusAtT0 === LIFECYCLE_STATUS.COMPLETED);

    // Attempt to evaluate status in even further future
    const futureNow = new Date('2026-10-01T12:00:00+07:00');
    const statusAtT1 = EventTemporalLifecycleEngine.resolveLifecycleStatus(pastEvent, futureNow);
    assert.strictEqual(statusAtT1, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(pastEvent, futureNow), false);
  });

  // Invariant B: Absolute Upcoming Exclusion
  runTest('Invariant B: Absolute Upcoming Exclusion — event_end_at <= now strictly excluded', () => {
    const testCases = [
      { event_end_at: '2026-09-22T11:59:59+07:00' }, // 1 second in past
      { event_end_at: '2026-09-22T12:00:00+07:00' }, // Exactly now
      { event_end_at: '2025-01-01T00:00:00+07:00' }  // Year in past
    ];

    for (const tc of testCases) {
      const isUp = EventTemporalLifecycleEngine.isEventUpcoming({
        id: 'inv-b-tc',
        event_start_at: '2025-01-01T00:00:00+07:00',
        event_end_at: tc.event_end_at
      }, referenceNow);
      assert.strictEqual(isUp, false, `Event ending at ${tc.event_end_at} must be excluded`);
    }
  });

  // Invariant C: Non-Destructive Archival
  await runAsyncTest('Invariant C: Non-Destructive Archival — Zero deletions of historical records', async () => {
    const historicalEventId = 'inv-c-event';
    const ev = {
      id: historicalEventId,
      event_id: historicalEventId,
      canonical_name: 'Historical Concert 2025',
      event_start_at: '2025-05-10T19:00:00+07:00',
      event_end_at: '2025-05-10T23:00:00+07:00'
    };
    state.events.push(ev);
    canonicalRegistry.events.set(historicalEventId, ev);

    // Attach historical records
    state.orders.push({ id: 'ord-hist-1', event_id: historicalEventId, status: 'SETTLED' });
    state.escrows.push({ id: 'esc-hist-1', event_id: historicalEventId, status: 'RELEASED' });
    state.disputes.push({ id: 'disp-hist-1', event_id: historicalEventId, status: 'RESOLVED' });

    const orderCountBefore = state.orders.length;
    const escrowCountBefore = state.escrows.length;

    // Run reconciliation
    await EventTemporalLifecycleEngine.reconcileEvent(ev, referenceNow);

    // Verify event is ARCHIVED
    assert.strictEqual(ev.lifecycle_status, LIFECYCLE_STATUS.ARCHIVED);

    // Verify zero data deletion
    assert.strictEqual(state.orders.length, orderCountBefore, 'Orders must remain intact');
    assert.strictEqual(state.escrows.length, escrowCountBefore, 'Escrows must remain intact');
    const foundOrder = state.orders.find(o => o.event_id === historicalEventId);
    assert.ok(foundOrder, 'Historical order must remain queryable');
  });

  // Invariant D: Idempotent Lifecycle Evaluation
  await runAsyncTest('Invariant D: Idempotent Lifecycle Evaluation — Consecutive runs produce identical state', async () => {
    const run1 = await EventTemporalLifecycleEngine.reconcileAllEvents(referenceNow);
    const run2 = await EventTemporalLifecycleEngine.reconcileAllEvents(referenceNow);
    const run3 = await EventTemporalLifecycleEngine.reconcileAllEvents(referenceNow);

    assert.strictEqual(run2.transitions.length, 0, 'Second run must have 0 transitions (fully converged)');
    assert.strictEqual(run3.transitions.length, 0, 'Third run must have 0 transitions');
  });

  // Invariant E: Financial & Transactional Firewall
  await runAsyncTest('Invariant E: Financial Firewall — Ended event expires listings and blocks new listings', async () => {
    const concludedEventId = 'inv-e-event';
    const concludedEvent = {
      id: concludedEventId,
      event_id: concludedEventId,
      canonical_name: 'Concluded Test Event',
      event_start_at: '2026-09-01T19:00:00+07:00',
      event_end_at: '2026-09-01T23:00:00+07:00',
      city: 'Jakarta'
    };
    state.events.push(concludedEvent);

    // Seed active listing on this event
    const activeListing = {
      id: 'listing-to-expire',
      event_id: concludedEventId,
      ticket_id: 'tkt-to-expire',
      status: 'ACTIVE'
    };
    state.listings.push(activeListing);
    state.tickets.push({ id: 'tkt-to-expire', status: 'LISTED', listing_id: 'listing-to-expire' });

    // Seed listable tickets for seller
    const testSeller = state.users.find(u => u.id === 'seller-1') || state.users[0];
    assert.ok(testSeller, 'Test seller must exist');

    state.tickets.push({
      id: 'tkt-new',
      ticket_id: 'tkt-new',
      seller_id: testSeller.id,
      current_owner_id: testSeller.id,
      event_id: concludedEventId,
      canonical_event_id: concludedEventId,
      status: 'VERIFIED'
    });
    state.tickets.push({
      id: 'tkt-new-2',
      ticket_id: 'tkt-new-2',
      seller_id: testSeller.id,
      current_owner_id: testSeller.id,
      event_id: concludedEventId,
      canonical_event_id: concludedEventId,
      status: 'VERIFIED'
    });

    // Reconcile event
    await EventTemporalLifecycleEngine.reconcileEvent(concludedEvent, referenceNow);

    // Verify existing listing is expired
    assert.strictEqual(activeListing.status, 'EXPIRED');
    assert.ok(activeListing.rejection_reason.includes('concluded'));

    // Attempt to create new listing on concluded event via MarketplaceListingService
    let rejected = false;
    try {
      await MarketplaceListingService.createListing({
        sellerId: testSeller.id,
        ticketId: 'tkt-new',
        price: 500000
      });
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes('ended') || err.message.includes('concluded'));
    }
    assert.strictEqual(rejected, true, 'MarketplaceListingService must reject listing on concluded event');

    // Attempt to create new listing via ListingService.createListing
    let listingServiceRejected = false;
    try {
      await ListingService.createListing({
        sellerId: testSeller.id,
        eventId: concludedEventId,
        faceValue: 500000,
        price: 500000,
        rawBarcode: 'BARCODE-CONCLUDED-1'
      });
    } catch (err) {
      listingServiceRejected = true;
      assert.ok(err.message.includes('ended') || err.message.includes('concluded'));
    }
    assert.strictEqual(listingServiceRejected, true, 'ListingService must reject listing on concluded event');
  });

  // Invariant F: Cache & Edge Consistency
  runTest('Invariant F: Cache & Edge Consistency — Completed events get Schema.org EventCompleted & no active offers', () => {
    const completedEvent = {
      id: 'inv-f-event',
      event_id: 'inv-f-event',
      canonical_name: 'Past Concert 2026',
      slug: 'past-concert-2026',
      verification_status: 'VERIFIED',
      is_verified: true,
      event_start_at: '2026-09-10T19:00:00+07:00',
      event_end_at: '2026-09-10T23:00:00+07:00'
    };
    canonicalRegistry.events.set('inv-f-event', completedEvent);

    const schema = EventSEOService.buildStructuredData(completedEvent);
    assert.strictEqual(schema.eventStatus, 'https://schema.org/EventCompleted');
    assert.strictEqual(schema.offers, undefined, 'Must not expose active offers for completed event');

    // Sitemaps lower priority
    const sitemapXml = TechnicalSEOService.generateSitemapXml();
    assert.ok(sitemapXml.includes('/events/past-concert-2026'));
    assert.ok(sitemapXml.includes('<priority>0.4</priority>'));
  });

  // ================================================================
  // SECTION 3: REGRESSION FIXTURES (NO HARDCODING)
  // ================================================================
  console.log('\n── Part 3: Regression Fixtures ──');

  runTest('Fixture 1: Sheila On 7 — Bandung (2024-09-28) -> ARCHIVED & Not Upcoming', () => {
    const sheilaEvent = {
      id: 'reg-sheila-bandung',
      canonical_name: 'Sheila On 7 - Tunggu Aku Di Bandung',
      date: '2024-09-28',
      time: '19:00',
      venue_name: 'Stadion Si Jalak Harupat',
      city: 'Bandung'
    };

    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(sheilaEvent, referenceNow);
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(sheilaEvent, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(isUpcoming, false, 'Sheila On 7 historical concert must NEVER be Upcoming');
  });

  runTest('Fixture 2: Coldplay — GBK (2023-11-15) -> ARCHIVED & Not Upcoming', () => {
    const coldplayEvent = {
      id: 'reg-coldplay-gbk',
      canonical_name: 'Coldplay: Music of the Spheres World Tour Jakarta',
      date: '2023-11-15',
      time: '20:00',
      venue_name: 'Gelora Bung Karno',
      city: 'Jakarta'
    };

    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(coldplayEvent, referenceNow);
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(coldplayEvent, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(isUpcoming, false, 'Coldplay GBK historical concert must NEVER be Upcoming');
  });

  runTest('Fixture 3: Raditya Dika — TIM (2026-09-19) -> ARCHIVED & Not Upcoming relative to 2026-09-22', () => {
    const radityaEvent = state.events.find(e => e.id === 'event-raditya-dika-standup');
    assert.ok(radityaEvent, 'Raditya Dika event fixture must exist in seeded events');

    const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(radityaEvent, referenceNow);
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(radityaEvent, referenceNow);

    assert.strictEqual(status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(isUpcoming, false, 'Raditya Dika fixture (Sept 19) must be ARCHIVED relative to Sept 22');
  });

  // Verify zero hardcoding of event names in business logic
  runTest('Integrity Check: Zero hardcoded name exceptions in EventTemporalLifecycleEngine', () => {
    const engineCode = fs.readFileSync('./src/discovery/EventTemporalLifecycleEngine.js', 'utf8');
    assert.strictEqual(engineCode.includes('Sheila'), false, 'Must not hardcode "Sheila" in engine');
    assert.strictEqual(engineCode.includes('Coldplay'), false, 'Must not hardcode "Coldplay" in engine');
    assert.strictEqual(engineCode.includes('Raditya'), false, 'Must not hardcode "Raditya" in engine');
  });

  // ================================================================
  // SECTION 4: RED-TEAM RESURRECTION SCENARIOS
  // ================================================================
  console.log('\n── Part 4: Red-Team Resurrection Scenarios ──');

  runTest('Red-Team Attack 1: Source observation claiming ON_SALE cannot resurrect expired event', () => {
    const pastEventId = 'redteam-resurrect-1';
    const pastCanonicalEvent = {
      event_id: pastEventId,
      canonical_name: 'Past Concert 2024',
      date: '2024-05-01',
      start_date: '2024-05-01',
      event_start_at: '2024-05-01T19:00:00+07:00',
      event_end_at: '2024-05-01T23:00:00+07:00',
      lifecycle_status: LIFECYCLE_STATUS.ARCHIVED,
      status: LIFECYCLE_STATUS.ARCHIVED,
      sources: [],
      field_provenance: {}
    };
    canonicalRegistry.events.set(pastEventId, pastCanonicalEvent);

    // Malicious or stale source claims event is ON_SALE / UPCOMING
    const maliciousObservation = new EventSourceObservation({
      source_id: 'src-stubborn-crawler',
      external_event_id: 'ext-999',
      raw_payload: {
        title: 'Past Concert 2024',
        status: 'ON_SALE',
        date: '2024-05-01'
      }
    });

    canonicalRegistry.updateEventFromObservation(pastCanonicalEvent, maliciousObservation);

    // Verify canonical lifecycle status did NOT resurrect to UPCOMING
    assert.strictEqual(pastCanonicalEvent.lifecycle_status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(
      EventTemporalLifecycleEngine.isEventUpcoming(pastCanonicalEvent, referenceNow),
      false,
      'Source status must NEVER resurrect an expired canonical event'
    );
  });

  runTest('Red-Team Attack 2: Secondary observation update with future expires_at on ended event', () => {
    const pastEventId = 'redteam-resurrect-2';
    const pastCanonicalEvent = {
      event_id: pastEventId,
      canonical_name: 'Past Tour 2025',
      date: '2025-01-01',
      start_date: '2025-01-01',
      event_start_at: '2025-01-01T19:00:00+07:00',
      event_end_at: '2025-01-01T23:00:00+07:00',
      lifecycle_status: LIFECYCLE_STATUS.ARCHIVED,
      status: LIFECYCLE_STATUS.ARCHIVED,
      sources: [],
      field_provenance: {}
    };
    canonicalRegistry.events.set(pastEventId, pastCanonicalEvent);

    const maliciousObservation = new EventSourceObservation({
      source_id: 'src-bad-ticketing',
      external_event_id: 'ext-bad-1',
      raw_payload: {
        title: 'Past Tour 2025',
        date: '2025-01-01',
        status: 'AVAILABLE',
        expires_at: '2099-01-01T00:00:00Z'
      }
    });

    canonicalRegistry.updateEventFromObservation(pastCanonicalEvent, maliciousObservation);

    assert.strictEqual(pastCanonicalEvent.lifecycle_status, LIFECYCLE_STATUS.ARCHIVED);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(pastCanonicalEvent, referenceNow), false);
  });

  // ================================================================
  // SECTION 5: CONTROLLED DRY-RUN & HISTORICAL AUDIT
  // ================================================================
  console.log('\n── Part 5: Controlled Dry-Run & Historical Audit ──');

  runTest('Historical Audit: Inspects currently registered events and verifies zero Upcoming leaks', () => {
    const audit = EventTemporalLifecycleEngine.auditHistoricalEvents(referenceNow);

    console.log(`     Total Audited: ${audit.total_audited}`);
    console.log(`     Expired Events Detected: ${audit.expired_count}`);
    console.log(`     Mismatched Status Count: ${audit.mismatched_count}`);

    assert.ok(audit.total_audited > 0, 'Audit must inspect registered events');

    // Confirm that every expired event has homepage_visibility === false
    for (const item of audit.report) {
      if (item.is_past) {
        assert.strictEqual(
          item.homepage_visibility,
          false,
          `Event "${item.event_name}" (${item.event_id}) is past but homepage_visibility is true!`
        );
      }
    }
  });

  // Case 30: actual homepage inventory verification at 2026-09-22 21:32 WIB
  runTest('Case 30: actual homepage inventory verification at 2026-09-22 21:32 WIB', () => {
    resetDatabase();
    const nowMs = referenceNow.getTime();

    // Replicate homepage loadEvents filtering logic
    const upcomingEvents = state.events.filter(e => {
      if (['LIVE', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS', 'CANCELLED'].includes(e.lifecycle_status)) return false;
      if (['COMPLETED', 'ARCHIVED', 'CANCELLED'].includes(e.status)) return false;
      if (e.event_end_at && new Date(e.event_end_at).getTime() <= nowMs) return false;
      if (e.event_start_at && new Date(e.event_start_at).getTime() <= nowMs) return false;
      return EventTemporalLifecycleEngine.isEventUpcoming(e, referenceNow);
    });

    assert.ok(upcomingEvents.length > 0, 'Homepage must have upcoming events');

    for (const ev of upcomingEvents) {
      const endMs = new Date(ev.event_end_at || ev.date).getTime();
      const startMs = new Date(ev.event_start_at || ev.date).getTime();
      assert.ok(endMs > nowMs, `Event "${ev.name}" endMs (${endMs}) must be > nowMs (${nowMs})`);
      assert.ok(startMs > nowMs, `Event "${ev.name}" startMs (${startMs}) must be > nowMs (${nowMs})`);
      assert.notStrictEqual(ev.id, 'event-coldplay', 'Coldplay must NEVER appear in upcoming events');
      assert.notStrictEqual(ev.id, 'event-so7-bandung', 'Sheila On 7 Bandung 2024 must NEVER appear in upcoming events');
      assert.notStrictEqual(ev.id, 'event-raditya-dika-standup', 'Raditya Dika Sept 19 must NEVER appear in upcoming events');
      assert.notStrictEqual(ev.id, 'event-ibl-finals-2026', 'IBL Finals Sept 22 must NEVER appear in upcoming events');
    }

    // Replicate homepage loadListings filtering logic under Zero-Trust Seed Data:
    // Unverified seed events must NOT expose active public listings (Criterion 1 & 8).
    const unverifiedListings = ListingService.getActiveListings();
    assert.strictEqual(unverifiedListings.length, 0, 'Zero-trust seed data: unverified event listing must NOT leak publicly');

    // When an event independently obtains verified authoritative evidence, its listing becomes eligible:
    const pestapora = state.events.find(e => e.id === 'event-pestapora-2026');
    pestapora.is_verified = true;
    pestapora.verification_status = 'VERIFIED';
    pestapora.source_url = 'https://pestapora.com';
    pestapora.evidence_hash = 'sha256-verified-pestapora-test-proof';
    pestapora.verified_at = referenceNow.toISOString();

    const verifiedListings = ListingService.getActiveListings().filter(l => {
      const ev = state.events.find(e => e.id === l.event_id);
      if (!ev) return false;
      return EventTemporalLifecycleEngine.isEventUpcoming(ev, referenceNow);
    });

    assert.strictEqual(verifiedListings.length, 1, 'Verified event listing is present');
    assert.strictEqual(verifiedListings[0].event_id, 'event-pestapora-2026');
  });

  // Case 31: Timezone midnight WIB (+07:00) parsed and offset correctly
  runTest('Case 31: Timezone midnight WIB (+07:00) parsed and offset correctly', () => {
    const event = {
      id: 'matrix-case-31',
      date: '2026-10-15',
      time: '00:00',
      city: 'Jakarta',
      venue_city: 'Jakarta'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Jakarta');
    assert.ok(temporal.event_start_at.includes('2026-10-15T00:00:00+07:00'));
  });

  // Case 32: Timezone midnight WITA (+08:00) parsed and offset correctly
  runTest('Case 32: Timezone midnight WITA (+08:00) parsed and offset correctly', () => {
    const event = {
      id: 'matrix-case-32',
      date: '2026-10-15',
      time: '00:00',
      city: 'Denpasar',
      venue_city: 'Denpasar'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Makassar');
    assert.ok(temporal.event_start_at.includes('2026-10-15T00:00:00+08:00'));
  });

  // Case 33: Timezone midnight WIT (+09:00) parsed and offset correctly
  runTest('Case 33: Timezone midnight WIT (+09:00) parsed and offset correctly', () => {
    const event = {
      id: 'matrix-case-33',
      date: '2026-10-15',
      time: '00:00',
      city: 'Jayapura',
      venue_city: 'Jayapura'
    };
    const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
    assert.strictEqual(temporal.event_timezone, 'Asia/Jayapura');
    assert.ok(temporal.event_start_at.includes('2026-10-15T00:00:00+09:00'));
  });

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
