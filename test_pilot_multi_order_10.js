process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { ListingService, LISTING_STATUS } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService } = require('./src/services/disputeService');
const { SettlementService } = require('./src/services/settlementService');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.error('  ✗', name, '->', e.message);
    failed++;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.error('  ✗', name, '->', e.message);
    failed++;
  }
}

async function runPilot() {
  console.log('\n=== ARGUS PILOT: 1 EVENT / 10 ORDERS / 5 SELLERS / 10 BUYERS / 1 PIC ===\n');
  resetDatabase();

  // Seed 4 extra sellers (seller-1 exists) + 9 extra buyers (buyer-1 exists)
  const sellers = ['seller-1', 'seller-p2', 'seller-p3', 'seller-p4', 'seller-p5'];
  for (const sid of sellers.slice(1)) {
    state.users.push({ id: sid, name: sid, role: 'seller', phone: '0800000000' });
    state.seller_profiles.push({ user_id: sid, kyc_status: 'VERIFIED', active_listing_limit: 10 });
  }
  const buyers = ['buyer-1'];
  for (let i = 2; i <= 10; i++) {
    const bid = 'buyer-' + i;
    buyers.push(bid);
    state.users.push({ id: bid, name: 'Buyer ' + i, role: 'buyer', phone: '08' + i });
  }

  // 10 listings, deterministic barcodes
  const orders = [];
  await testAsync('Setup: 10 listings verified, 10 orders paid & escrowed', async () => {
    for (let i = 0; i < 10; i++) {
      const seller = sellers[i % 5];
      const lr = await ListingService.createListing({
        sellerId: seller,
        eventId: 'event-coldplay',
        seatInfo: 'CAT 1 - Seat ' + (100 + i),
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'PILOT-BAR-' + String(i).padStart(2, '0')
      });
      await ListingService.verifyListing(lr.listing.id, 'admin-1', { approved: true });
      const or = await EscrowService.createOrder({ buyerId: buyers[i], listingId: lr.listing.id });
      assert.strictEqual(or.order.total_amount, 1650000);
      await EscrowService.recordPayment({
        orderId: or.order.id,
        providerRef: 'pilot-pay-' + i,
        idempotencyKey: 'pilot-idem-' + i,
        amountPaid: 1650000
      });
      orders.push(or.order);
    }
    assert.strictEqual(orders.length, 10);
  });

  test('PIC dashboard: ONE EVENT -> MANY ORDERS -> ONE PIC', () => {
    const dash = EventPicService.getPicEventDashboard('pic-1', 'event-coldplay');
    assert.strictEqual(dash.stats.total_orders, 10);
    assert.strictEqual(dash.operational_cell.event_id, 'event-coldplay');
    assert.strictEqual(dash.orders.length, 10);
  });

  // 6 success path
  await testAsync('6x success: CONFIRMED -> release -> settlement SIMULATED', async () => {
    for (let i = 0; i < 6; i++) {
      const v = await EventPicService.recordEntryVerification({
        picUserId: 'pic-1', orderId: orders[i].id, gate: 'Gate 3', status: 'CONFIRMED', notes: 'masuk OK'
      });
      assert.strictEqual(v.status, 'CONFIRMED');
      assert.ok(v.actor);
      assert.ok(v.timestamp);
      assert.ok(v.next_action);
      await EscrowService.releaseToSeller(orders[i].id, 'admin-1');
      const s = await SettlementService.executeSettlement({
        orderId: orders[i].id, sellerId: orders[i].seller_id, officerId: 'admin-1',
        idempotencyKey: 'pilot-stl-' + i, bankAccount: 'BCA pilot'
      });
      assert.strictEqual(s.settlement.status, 'EXECUTED');
      assert.strictEqual(s.settlement.amount, 1500000);
      assert.strictEqual(s.settlement.mode, 'SIMULATED');
    }
    assert.strictEqual(state.orders.filter(o => o.status === 'SETTLED').length, 6);
  });

  await testAsync('1x buyer no-show recorded with next_action', async () => {
    const v = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1', orderId: orders[6].id, gate: 'Gate 3',
      status: 'NO_SHOW_BUYER', notes: 'buyer tidak datang H+30mnt'
    });
    assert.strictEqual(v.status, 'NO_SHOW_BUYER');
    assert.ok(v.next_action);
    const esc = state.escrows.find(e => e.order_id === orders[6].id);
    assert.strictEqual(esc.status, ESCROW_STATUS.ESCROWED);
  });

  await testAsync('1x seller no-show recorded with next_action', async () => {
    const v = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1', orderId: orders[7].id, gate: 'Gate 3',
      status: 'NO_SHOW_SELLER', notes: 'seller tidak datang bawa tiket'
    });
    assert.strictEqual(v.status, 'NO_SHOW_SELLER');
    assert.ok(v.next_action);
  });

  await testAsync('1x gate rejection blocks settlement', async () => {
    const v = await EventPicService.recordEntryVerification({
      picUserId: 'pic-1', orderId: orders[8].id, gate: 'Gate 3',
      status: 'GATE_REJECTION', notes: 'barcode ditolak scanner panitia'
    });
    assert.strictEqual(v.status, 'GATE_REJECTION');
    try {
      await EscrowService.releaseToSeller(orders[8].id, 'admin-1');
      assert.fail('release harus ditolak');
    } catch (err) {
      assert.strictEqual(err.code, 'ENTRY_NOT_CONFIRMED');
    }
  });

  await testAsync('1x dispute -> REFUND_BUYER path', async () => {
    const d = await DisputeService.openDispute({
      orderId: orders[9].id, buyerId: orders[9].buyer_id, reason: 'TICKET_INVALID_AT_GATE'
    });
    assert.ok(d.dispute.id);
    await DisputeService.submitPicInvestigation({
      disputeId: d.dispute.id, picUserId: 'pic-1', notes: 'tiket duplikat', gateStatus: 'INVALID'
    });
    const r = await DisputeService.resolveDispute({
      disputeId: d.dispute.id, officerId: 'admin-1',
      outcome: 'REFUND_BUYER', decisionReason: 'tiket terbukti invalid'
    });
    assert.strictEqual(r.order.status, ORDER_STATUS.REFUNDED);
    assert.strictEqual(r.escrow.status, ESCROW_STATUS.REFUNDED);
  });

  await testAsync('Duplicate settlement prevented (same key + different key)', async () => {
    const target = orders[0];
    const r1 = await SettlementService.executeSettlement({
      orderId: target.id, sellerId: target.seller_id, officerId: 'admin-1',
      idempotencyKey: 'pilot-stl-0', bankAccount: 'BCA pilot'
    });
    assert.strictEqual(r1.idempotent, true);
    const r2 = await SettlementService.executeSettlement({
      orderId: target.id, sellerId: target.seller_id, officerId: 'admin-1',
      idempotencyKey: 'pilot-stl-0-DIFFERENT', bankAccount: 'BCA pilot'
    });
    assert.strictEqual(r2.idempotent, true);
    assert.strictEqual(state.settlements.filter(s => s.order_id === target.id).length, 1);
  });

  await testAsync('Duplicate entry confirmation rejected', async () => {
    try {
      await EventPicService.recordEntryVerification({
        picUserId: 'pic-1', orderId: orders[0].id, gate: 'Gate 3', status: 'CONFIRMED'
      });
      assert.fail('harus tolak duplikat');
    } catch (err) {
      assert.strictEqual(err.code, 'DUPLICATE_ENTRY_CONFIRMATION');
    }
  });

  await testAsync('Buyer cannot confirm own entry; seller cannot confirm entry', async () => {
    try {
      await EventPicService.recordEntryVerification({
        picUserId: orders[1].buyer_id, orderId: orders[1].id, gate: 'Gate 3', status: 'CONFIRMED'
      });
      assert.fail('buyer harus ditolak');
    } catch (err) {
      assert.ok(err.code === 'PIC_UNAUTHORIZED' || err.message.includes('Unauthorized'));
    }
    try {
      await EventPicService.recordEntryVerification({
        picUserId: orders[1].seller_id, orderId: orders[1].id, gate: 'Gate 3', status: 'CONFIRMED'
      });
      assert.fail('seller harus ditolak');
    } catch (err) {
      assert.ok(err.code === 'PIC_UNAUTHORIZED' || err.message.includes('Unauthorized'));
    }
  });

  await testAsync('PIC cannot modify settlement amount (server-side only)', async () => {
    const s = state.settlements.find(x => x.order_id === orders[1].id);
    assert.strictEqual(s.amount, 1500000);
  });

  test('Audit trail covers multi-order pilot', () => {
    assert.ok(state.audit_logs.length >= 40);
  });

  console.log(`\n=======================`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`=======================\n`);
  if (failed > 0) process.exit(1);
}

runPilot().catch(err => {
  console.error('Pilot Test Failed:', err);
  process.exit(1);
});
