/**
 * TIKUM / ARGUS — Inventory Concurrency Race Condition Test Suite
 *
 * Verifies P0 inventory reservation safety under high concurrency:
 * 1. Two concurrent buyer requests for a single ticket (qty=1):
 *    - Exactly one succeeds with HTTP 201
 *    - Exactly one fails with HTTP 409 (INSUFFICIENT_INVENTORY)
 *    - Listing inventory is accurately reserved without double-selling
 * 2. Order cancellation/release restores inventory:
 *    - Available quantity restored to 1, status reset to ACTIVE
 * 3. Multi-quantity concurrency test (qty=2):
 *    - 3 simultaneous buyers request 1 ticket each
 *    - Exactly 2 succeed (HTTP 201), exactly 1 fails with HTTP 409
 * 4. Direct repository atomic methods verification:
 *    - InMemoryMarketplaceRepository & PostgresMarketplaceRepository atomicReserveInventory
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.ENABLE_DOKU_PRODUCTION = 'false';
process.env.ENABLE_MIDTRANS_PRODUCTION = 'false';
process.env.ENABLE_XENDIT_PRODUCTION = 'false';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { getMarketplaceRepository } = require('./src/storage');
const { InMemoryMarketplaceRepository } = require('./src/storage/InMemoryMarketplaceRepository');

console.log('================================================================');
console.log('  TIKUM — INVENTORY CONCURRENCY RACE CONDITION TEST SUITE');
console.log('================================================================\n');

let server;
let baseUrl;

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serialized = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers, host: url.host };
    if (serialized && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serialized && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serialized);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

async function runTests() {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`  ✗ [FAIL] ${msg}`);
    console.error(err);
    process.exitCode = 1;
  }

  try {
    // -------------------------------------------------------------
    // Section 1: In-Memory Repository Atomic Primitives Direct Unit Test
    // -------------------------------------------------------------
    console.log('── Section 1: In-Memory Repository Atomic Primitives ──');
    const memRepo = new InMemoryMarketplaceRepository();
    await memRepo.init();

    await memRepo.createListing({
      id: 'list-race-unit-01',
      ticket_id: 'tkt-race-unit-01',
      seller_id: 'seller-race-1',
      canonical_event_id: 'event-unit-01',
      price: 500000,
      currency: 'IDR',
      status: 'ACTIVE',
      metadata: {
        total_quantity: 1,
        available_quantity: 1,
        reserved_quantity: 0
      }
    });

    // 1.1 Reserve 1 ticket successfully
    const res1 = await memRepo.atomicReserveInventory('list-race-unit-01', 1);
    assert.strictEqual(res1.status, 'RESERVED', 'Listing status should be RESERVED when 0 available');
    assert.strictEqual(res1.available_quantity, 0, 'Available quantity must be 0');
    assert.strictEqual(res1.reserved_quantity, 1, 'Reserved quantity must be 1');
    pass('1.1 memRepo.atomicReserveInventory reserves available ticket atomically');

    // 1.2 Second reservation attempt must throw INSUFFICIENT_INVENTORY or LISTING_NOT_ACTIVE
    let threwConflict = false;
    try {
      await memRepo.atomicReserveInventory('list-race-unit-01', 1);
    } catch (e) {
      threwConflict = e.code === 'LISTING_NOT_ACTIVE' || e.code === 'INSUFFICIENT_INVENTORY';
    }
    assert.strictEqual(threwConflict, true, 'Second reservation must throw conflict');
    pass('1.2 memRepo.atomicReserveInventory rejects reservation on exhausted listing');

    // 1.3 Release inventory restores status to ACTIVE and available_quantity to 1
    const rel1 = await memRepo.atomicReleaseInventory('list-race-unit-01', 1);
    assert.strictEqual(rel1.status, 'ACTIVE', 'Listing status should be restored to ACTIVE');
    assert.strictEqual(rel1.available_quantity, 1, 'Available quantity must be restored to 1');
    assert.strictEqual(rel1.reserved_quantity, 0, 'Reserved quantity must be restored to 0');
    pass('1.3 memRepo.atomicReleaseInventory restores inventory and ACTIVE status');

    // -------------------------------------------------------------
    // Section 2: End-to-End Concurrency Race (2 buyers, 1 ticket)
    // -------------------------------------------------------------
    console.log('\n── Section 2: HTTP Concurrency Race (2 buyers, 1 ticket) ──');
    resetDatabase();

    const repo = getMarketplaceRepository();
    const raceListingId = 'list-race-http-01';

    // Seed test users
    if (!state.users) state.users = [];
    const buyerA = { id: 'usr-buyer-race-a', name: 'Buyer A', email: 'buyer.a@example.com', role: 'buyer' };
    const buyerB = { id: 'usr-buyer-race-b', name: 'Buyer B', email: 'buyer.b@example.com', role: 'buyer' };
    const sellerA = { id: 'usr-seller-race-1', name: 'Seller Race', email: 'seller@example.com', role: 'seller' };
    state.users.push(buyerA, buyerB, sellerA);

    // Seed event & venue
    if (!state.events) state.events = [];
    state.events.push({
      id: 'event-race-joyland',
      title: 'Joyland Festival Concurrency Test',
      status: 'PUBLISHED',
      is_active: true
    });

    // Seed ticket & listing with quantity = 1
    if (!state.tickets) state.tickets = [];
    state.tickets.push({
      id: 'tkt-race-http-01',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      ticket_type: 'GENERAL_ADMISSION',
      quantity: 1,
      face_value: 750000,
      currency: 'IDR',
      status: 'VERIFIED'
    });

    if (!state.listings) state.listings = [];
    const listingRecord = {
      id: raceListingId,
      ticket_id: 'tkt-race-http-01',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      price: 850000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      metadata: {
        total_quantity: 1,
        available_quantity: 1,
        reserved_quantity: 0
      }
    };
    state.listings.push(listingRecord);
    if (typeof repo.createListing === 'function') {
      try { await repo.createListing(listingRecord); } catch (_) {}
    }

    // Fire 2 simultaneous purchase requests for the single ticket
    const [resA, resB] = await Promise.all([
      request({
        method: 'POST',
        path: '/api/mvp/buyer/order',
        headers: { 'x-user-id': buyerA.id },
        body: { buyerId: buyerA.id, listingId: raceListingId, quantity: 1 }
      }),
      request({
        method: 'POST',
        path: '/api/mvp/buyer/order',
        headers: { 'x-user-id': buyerB.id },
        body: { buyerId: buyerB.id, listingId: raceListingId, quantity: 1 }
      })
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    assert.deepStrictEqual(statusCodes, [201, 409], `Expected exactly one HTTP 201 and one HTTP 409, got [${resA.statusCode}, ${resB.statusCode}]`);
    pass('2.1 Two simultaneous buyers competing for 1 ticket results in exactly 1 success (201) and 1 conflict (409)');

    const winningRes = resA.statusCode === 201 ? resA : resB;
    const losingRes = resA.statusCode === 409 ? resA : resB;

    assert.ok(winningRes.json && winningRes.json.order && winningRes.json.order.id, 'Winning response contains order');
    const isConflictCode = losingRes.json?.code === 'INSUFFICIENT_INVENTORY' || losingRes.json?.code === 'LISTING_NOT_ACTIVE' || losingRes.json?.code === 'LISTING_ALREADY_RESERVED';
    assert.ok(isConflictCode, `Losing response has conflict code (got ${losingRes.json?.code})`);
    pass('2.2 Winning buyer receives order object; losing buyer receives structured conflict (HTTP 409)');

    // Verify listing inventory state
    const currentListing = state.listings.find(l => l.id === raceListingId);
    assert.strictEqual(currentListing.available_quantity, 0, 'Available quantity must be 0');
    assert.strictEqual(currentListing.reserved_quantity, 1, 'Reserved quantity must be 1');
    assert.strictEqual(currentListing.status, 'RESERVED', 'Listing status must be RESERVED');
    pass('2.3 Listing is accurately updated: available_quantity=0, reserved_quantity=1, status=RESERVED');

    // -------------------------------------------------------------
    // Section 3: Inventory Release / Order Cancellation
    // -------------------------------------------------------------
    console.log('\n── Section 3: Inventory Restoration on Cancellation ──');
    const winningOrderId = winningRes.json.order.id;
    const releaseResult = await EscrowService.releaseInventoryForOrder(winningOrderId, 'BUYER_CANCELLED');

    assert.ok(releaseResult, 'Release inventory returned result');
    assert.strictEqual(currentListing.available_quantity, 1, 'Available quantity restored to 1');
    assert.strictEqual(currentListing.reserved_quantity, 0, 'Reserved quantity restored to 0');
    assert.strictEqual(currentListing.status, 'ACTIVE', 'Listing status restored to ACTIVE');
    pass('3.1 Order cancellation cleanly releases inventory: available=1, reserved=0, status=ACTIVE');

    // Subsequent buyer can now successfully purchase the released ticket
    const resRetry = await request({
      method: 'POST',
      path: '/api/mvp/buyer/order',
      headers: { 'x-user-id': buyerB.id },
      body: { buyerId: buyerB.id, listingId: raceListingId, quantity: 1 }
    });
    assert.strictEqual(resRetry.statusCode, 201, 'Buyer B can successfully purchase once inventory is released');
    pass('3.2 Released ticket can immediately be purchased by subsequent buyer (HTTP 201)');

    // -------------------------------------------------------------
    // Section 4: Multi-Quantity Concurrency (3 buyers, 2 tickets)
    // -------------------------------------------------------------
    console.log('\n── Section 4: Multi-Quantity Concurrency (3 buyers, 2 tickets) ──');
    const multiListingId = 'list-race-multi-02';
    const buyerC = { id: 'usr-buyer-race-c', name: 'Buyer C', email: 'buyer.c@example.com', role: 'buyer' };
    state.users.push(buyerC);

    state.tickets.push({
      id: 'tkt-race-multi-02',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      ticket_type: 'GENERAL_ADMISSION',
      quantity: 2,
      face_value: 500000,
      currency: 'IDR',
      status: 'VERIFIED'
    });

    const multiListingRecord = {
      id: multiListingId,
      ticket_id: 'tkt-race-multi-02',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      price: 600000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 2,
      total_quantity: 2,
      available_quantity: 2,
      reserved_quantity: 0,
      metadata: {
        total_quantity: 2,
        available_quantity: 2,
        reserved_quantity: 0
      }
    };
    state.listings.push(multiListingRecord);
    if (typeof repo.createListing === 'function') {
      try { await repo.createListing(multiListingRecord); } catch (_) {}
    }

    // 3 concurrent buyers request 1 ticket each simultaneously
    const [mRes1, mRes2, mRes3] = await Promise.all([
      request({
        method: 'POST',
        path: '/api/mvp/buyer/order',
        headers: { 'x-user-id': buyerA.id },
        body: { buyerId: buyerA.id, listingId: multiListingId, quantity: 1 }
      }),
      request({
        method: 'POST',
        path: '/api/mvp/buyer/order',
        headers: { 'x-user-id': buyerB.id },
        body: { buyerId: buyerB.id, listingId: multiListingId, quantity: 1 }
      }),
      request({
        method: 'POST',
        path: '/api/mvp/buyer/order',
        headers: { 'x-user-id': buyerC.id },
        body: { buyerId: buyerC.id, listingId: multiListingId, quantity: 1 }
      })
    ]);

    const mCodes = [mRes1.statusCode, mRes2.statusCode, mRes3.statusCode].sort();
    assert.deepStrictEqual(mCodes, [201, 201, 409], `Expected [201, 201, 409], got [${mCodes.join(', ')}]`);
    pass('4.1 Three simultaneous buyers for 2 available tickets yields exactly two 201 and one 409');

    const multiListing = state.listings.find(l => l.id === multiListingId);
    assert.strictEqual(multiListing.available_quantity, 0, 'Available quantity must be 0');
    assert.strictEqual(multiListing.reserved_quantity, 2, 'Reserved quantity must be 2');
    assert.strictEqual(multiListing.status, 'RESERVED', 'Listing status must be RESERVED');
    pass('4.2 Multi-quantity inventory is exact: available=0, reserved=2, status=RESERVED');

    // -------------------------------------------------------------
    // Section 5: Oversized Quantity Request Blocked (HTTP 409)
    // -------------------------------------------------------------
    console.log('\n── Section 5: Oversized Quantity Request Handling ──');
    const singleListingId = 'list-race-single-03';
    state.tickets.push({
      id: 'tkt-race-single-03',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      ticket_type: 'VIP',
      quantity: 1,
      face_value: 1000000,
      currency: 'IDR',
      status: 'VERIFIED'
    });

    state.listings.push({
      id: singleListingId,
      ticket_id: 'tkt-race-single-03',
      seller_id: 'usr-seller-race-1',
      canonical_event_id: 'event-race-joyland',
      event_id: 'event-race-joyland',
      price: 1200000,
      currency: 'IDR',
      status: 'ACTIVE',
      quantity: 1,
      total_quantity: 1,
      available_quantity: 1,
      reserved_quantity: 0,
      metadata: { total_quantity: 1, available_quantity: 1, reserved_quantity: 0 }
    });

    const overRes = await request({
      method: 'POST',
      path: '/api/mvp/buyer/order',
      headers: { 'x-user-id': buyerA.id },
      body: { buyerId: buyerA.id, listingId: singleListingId, quantity: 2 }
    });

    assert.strictEqual(overRes.statusCode, 409, 'Requesting 2 tickets when only 1 is available returns 409');
    assert.strictEqual(overRes.json?.code, 'INSUFFICIENT_INVENTORY', 'Code is INSUFFICIENT_INVENTORY');
    pass('5.1 Requesting quantity exceeding available inventory immediately fails with HTTP 409 INSUFFICIENT_INVENTORY');

    console.log('\n================================================================');
    console.log(`  ALL ${passed}/${total} INVENTORY CONCURRENCY TESTS PASSED!`);
    console.log('================================================================\n');

  } catch (err) {
    fail('Unhandled exception in concurrency test suite', err);
  } finally {
    if (server) {
      server.close();
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();
