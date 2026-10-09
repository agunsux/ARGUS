/**
 * TIKUM — Multi-Instance Cold-Start Durable Persistence Verification
 * 
 * Demonstrates that across separate simulated serverless instances (cold memory cache),
 * all financial entities hydrate seamlessly and reliably from Neon PostgreSQL.
 */

process.env.NODE_ENV = 'test';
process.env.DEFAULT_PAYMENT_PROVIDER = 'doku';
process.env.ENABLE_DOKU_PRODUCTION = 'false';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { state, resetDatabase } = require('./src/database');
const { EscrowService } = require('./src/services/escrowService');
const { ListingService } = require('./src/services/listingService');
const { getMoneyRepository, getMarketplaceRepository } = require('./src/storage');

async function runTest() {
  console.log('================================================================');
  console.log('  TIKUM — MULTI-INSTANCE COLD-START REPLICATION SUITE');
  console.log('================================================================\n');

  const moneyRepo = getMoneyRepository();
  const marketplaceRepo = getMarketplaceRepository();
  await moneyRepo.ensureInitialized();
  await marketplaceRepo.ensureInitialized();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function request({ method = 'GET', path, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const serialized = body ? JSON.stringify(body) : null;
      const reqHeaders = { ...headers, host: url.host };
      if (serialized && !reqHeaders['content-type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      if (serialized && !reqHeaders['content-length']) {
        reqHeaders['Content-Length'] = Buffer.byteLength(serialized);
      }
      const req = http.request(url, { method, headers: reqHeaders }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ statusCode: res.statusCode, headers: res.headers, raw, json });
        });
      });
      req.on('error', reject);
      if (serialized) req.write(serialized);
      req.end();
    });
  }

  try {
    // --- STEP 1: INSTANCE A CREATES LISTING AND ORDER ---
    console.log('--> [Instance A] Creating listing and order in persistent Neon database...');
    resetDatabase();
    
    const uniqueId = Date.now();
    const listRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-joyland-2026',
      seatInfo: 'VIP Area A',
      faceValue: 500000,
      price: 500000,
      rawBarcode: `BC-COLD-${uniqueId}`,
      evidenceBundleId: 'bdl-cold-1'
    });
    await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });
    
    const orderRes = await EscrowService.createOrder({
      listingId: listRes.listing.id,
      buyerId: 'buyer-1'
    });
    const orderId = orderRes.order.id;
    console.log(`    Created Order ID: ${orderId}`);

    // Verify order exists in PostgreSQL
    const pgOrder = await moneyRepo.getOrderById(orderId);
    assert.ok(pgOrder, 'Order must be physically present in PostgreSQL');
    assert.strictEqual(pgOrder.id, orderId);
    console.log('    [PASS] Physical PostgreSQL order row confirmed.');

    // --- STEP 2: SIMULATE INSTANCE B (COLD START - PURGE MEMORY) ---
    console.log('\n--> [Instance B - Cold Start] Wiping all memory state...');
    resetDatabase(); // Completely clears state.orders, state.escrows, state.listings, state.tickets
    assert.strictEqual(state.orders.length, 0, 'state.orders must be empty in new instance');
    assert.strictEqual(state.escrows.length, 0, 'state.escrows must be empty in new instance');

    // Instance B receives payment creation request via HTTP
    console.log('--> [Instance B] Calling POST /api/v1/payments/create on cold instance...');
    const payRes = await request({
      method: 'POST',
      path: '/api/v1/payments/create',
      headers: { 'x-user-id': 'buyer-1' },
      body: {
        orderId: orderId,
        channel: 'QRIS',
        buyerId: 'buyer-1'
      }
    });

    assert.strictEqual(payRes.statusCode, 200, `Expected 200, got ${payRes.statusCode}: ${payRes.raw}`);
    assert.ok(payRes.json.payment, 'Payment session must be returned');
    console.log(`    Payment ID: ${payRes.json.payment.paymentId}`);
    console.log('    [PASS] Instance B hydrated order from PostgreSQL and created payment.');

    // Verify payment exists in PostgreSQL
    const pgPayment = await moneyRepo.getPaymentByOrderId(orderId);
    assert.ok(pgPayment, 'Payment must be physically present in PostgreSQL');
    assert.strictEqual(pgPayment.order_id, orderId);
    console.log('    [PASS] Physical PostgreSQL payment row confirmed.');

    // --- STEP 3: SIMULATE INSTANCE C (COLD START - PURGE MEMORY AGAIN) ---
    console.log('\n--> [Instance C - Cold Start] Wiping memory again for escrow timeline inspect...');
    resetDatabase();
    assert.strictEqual(state.escrows.length, 0, 'state.escrows must be empty in Instance C');

    const pgEscrow = await moneyRepo.getEscrowByOrderId(orderId);
    assert.ok(pgEscrow, 'Escrow must be physically present in PostgreSQL');
    assert.strictEqual(pgEscrow.order_id, orderId);
    console.log('    [PASS] Physical PostgreSQL escrow row confirmed.');

    console.log('\n================================================================');
    console.log('  ALL MULTI-INSTANCE COLD-START REPLICATION CHECKS PASSED!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTest().catch(err => {
  console.error('Multi-instance test failed:', err);
  process.exit(1);
});
