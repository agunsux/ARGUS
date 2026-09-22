/**
 * ARGUS EPIC 3.5: RED TEAM SECURITY & ATTACK RESISTANCE TEST SUITE
 * 
 * Verifies all 10 attack vectors against the Phase 3.5 architecture:
 * 1. Replay of handshake challenge
 * 2. Cross-action challenge reuse
 * 3. IDOR / cross-user access
 * 4. PIC self-confirms entry unilaterally
 * 5. PIC duplicate entry confirmation
 * 6. Double-settlement (sequential & concurrent)
 * 7. Admin irreversible action without step-up auth
 * 8. State jump without ticket verification
 * 9. PII evidence access under Indonesia UU PDP
 * 10. Timed-out request retry idempotency
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { state, resetDatabase, recordAuditLog } = require('./src/database');
const app = require('./src/server');
const { ListingService } = require('./src/services/listingService');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { SettlementService } = require('./src/services/settlementService');
const { TransactionChallengeService } = require('./src/services/transactionChallengeService');
const { EvidenceStorageService } = require('./src/verification/evidenceStorage');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

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

// Helper to make HTTP JSON requests to test server
async function apiRequest(endpoint, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body && typeof body === 'object' ? JSON.stringify(body) : body
  });

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

// Helper to seed a standard verified listing and paid escrow order
async function setupPaidOrder({ sellerId = 'seller-1', buyerId = 'buyer-1', barcode = 'BC-TEST-' + uuidv4() } = {}) {
  const listingRes = await ListingService.createListing({
    sellerId,
    eventId: 'event-pestapora-2026',
    seatInfo: 'CAT 1 - Gate Test',
    faceValue: 1250000,
    price: 1500000,
    rawBarcode: barcode
  });

  await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

  const orderRes = await EscrowService.createOrder({
    buyerId,
    listingId: listingRes.listing.id
  });

  await EscrowService.recordPayment({
    orderId: orderRes.order.id,
    providerRef: 'midtrans-mock-' + uuidv4(),
    idempotencyKey: 'idem-' + orderRes.order.id,
    amountPaid: orderRes.order.total_amount
  });

  return {
    listing: listingRes.listing,
    order: orderRes.order,
    escrow: orderRes.escrow
  };
}

async function runRedTeamSuite() {
  console.log('\n=== ARGUS EPIC 3.5: RED TEAM SECURITY & ATTACK SUITE ===\n');

  // Start HTTP server on random port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    resetDatabase();

    // =========================================================================
    // ATTACK 1: REPLAY OF HANDSHAKE CHALLENGE
    // =========================================================================
    await testAsync('Attack 1: Replay of Handshake Challenge (Reuse same 6-digit code fails safely)', async () => {
      const { order } = await setupPaidOrder();

      // First do ticket verification so order moves to TICKET_VERIFIED
      await EventPicService.recordTicketVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        photoFile: true
      });

      // Step 1: BUYER requests entry challenge (displayed on Buyer's phone)
      const challengeRes = await apiRequest(`/api/mvp/buyer/orders/${order.id}/entry-challenge`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { buyerId: 'buyer-1' }
      });
      assert.strictEqual(challengeRes.status, 200, 'Buyer generates entry challenge');
      const code = challengeRes.data.code;
      assert.ok(code && code.length === 6, '6-digit challenge code generated for Buyer');

      // Step 2: PIC at turnstile inputs buyer's code with mandatory photo
      const firstUse = await apiRequest('/api/mvp/pic/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: { picUserId: 'pic-1', orderId: order.id, code, photoFile: true, gate: 'Gate 3 Utara' }
      });
      assert.strictEqual(firstUse.status, 200, 'First confirmation by PIC should succeed');
      assert.strictEqual(firstUse.data.success, true);
      assert.strictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);

      // Second use (REPLAY ATTACK): Attacker or PIC resubmits identical code
      const replayAttempt = await apiRequest('/api/mvp/pic/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: { picUserId: 'pic-1', orderId: order.id, code, photoFile: true, gate: 'Gate 3 Utara' }
      });
      assert.strictEqual(replayAttempt.status, 409, 'Replay must be rejected with 409 Conflict');
      assert.strictEqual(replayAttempt.data.code, 'CHALLENGE_ALREADY_CONSUMED');

      // Verify challenge state in DB
      const challengeInDb = state.transaction_challenges.find(c => c.order_id === order.id && c.action_type === 'ENTRY_CONFIRMED');
      assert.strictEqual(challengeInDb.status, 'consumed');
    });

    // =========================================================================
    // ATTACK 2: CROSS-ACTION CHALLENGE REUSE
    // =========================================================================
    await testAsync('Attack 2: Cross-Action Challenge Reuse (HANDOFF_READY code cannot be used for ENTRY_CONFIRMED)', async () => {
      const { order } = await setupPaidOrder();

      // Ticket verification
      await EventPicService.recordTicketVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        photoFile: true
      });

      // Seller generates challenge for HANDOFF_READY
      const sellerChallenge = await TransactionChallengeService.createChallenge({
        orderId: order.id,
        eventId: order.event_id,
        actionType: 'HANDOFF_READY',
        expectedActorRole: 'seller',
        expectedActorId: order.seller_id
      });
      const handoffCode = sellerChallenge.rawCode;

      // Attacker attempts to use this HANDOFF code for ENTRY_CONFIRMED at gate
      const attackRes = await apiRequest('/api/mvp/pic/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: { picUserId: 'pic-1', orderId: order.id, code: handoffCode, photoFile: true }
      });

      // Must be rejected: no pending challenge exists for ENTRY_CONFIRMED
      assert.strictEqual(attackRes.ok, false);
      assert.strictEqual(attackRes.data.code, 'CHALLENGE_NOT_FOUND');
      assert.notStrictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);
    });

    // =========================================================================
    // ATTACK 3: IDOR / CROSS-USER ACCESS
    // =========================================================================
    await testAsync('Attack 3A: IDOR — Buyer A attempts to generate entry challenge for Buyer B order', async () => {
      // Setup Order 1 for buyer-1, Order 2 for buyer-2
      const order1Setup = await setupPaidOrder({ buyerId: 'buyer-1' });
      const order2Setup = await setupPaidOrder({ buyerId: 'buyer-2' });

      // Verify ticket for order 2
      await EventPicService.recordTicketVerification({
        picUserId: 'pic-1',
        orderId: order2Setup.order.id,
        photoFile: true
      });

      // Buyer 1 attempts to generate entry challenge for Buyer 2's order
      const idorAttempt = await apiRequest(`/api/mvp/buyer/orders/${order2Setup.order.id}/entry-challenge`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { buyerId: 'buyer-1' }
      });

      assert.strictEqual(idorAttempt.status, 403, 'Cross-buyer entry challenge generation must return 403');
      assert.strictEqual(idorAttempt.data.code, 'BUYER_MISMATCH');
    });

    await testAsync('Attack 3B: IDOR — PIC A attempts to operate on Event B they are not assigned to', async () => {
      // Create second event
      state.events.push({
        id: 'event-metallica',
        title: 'Metallica Live in Jakarta',
        venue_id: 'venue-gbk',
        date: '2026-11-20',
        doors_open: '17:00'
      });

      // pic-1 is NOT assigned to event-metallica
      const unassignedPicAttempt = await apiRequest('/api/mvp/pic/events/event-metallica/dashboard?picUserId=pic-1', {
        method: 'GET',
        headers: { 'x-user-id': 'pic-1' }
      });

      assert.strictEqual(unassignedPicAttempt.status, 403, 'Unassigned PIC must be rejected with 403');
      assert.strictEqual(unassignedPicAttempt.data.code, 'PIC_NOT_ACTIVE');
    });

    // =========================================================================
    // ATTACK 4: PIC UNILATERALLY SELF-CONFIRMS ENTRY & DIRECTION GUARDS
    // =========================================================================
    await testAsync('Attack 4: PIC Self-Confirms Entry & Direction Guards Enforced', async () => {
      const { order } = await setupPaidOrder();

      // 4A: PIC attempts to call verify-entry with CONFIRMED status directly (bypassing buyer)
      const unilateralAttempt = await apiRequest('/api/mvp/pic/verify-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: {
          picUserId: 'pic-1',
          orderId: order.id,
          gate: 'Gate 3 Utara',
          status: 'CONFIRMED'
        }
      });
      assert.strictEqual(unilateralAttempt.status, 403, 'Unilateral PIC entry confirmation must be blocked');
      assert.strictEqual(unilateralAttempt.data.code, 'DUAL_CONFIRMATION_REQUIRED');

      // 4B: PIC attempts to generate entry challenge directly -> Forbidden
      const picPrepareAttempt = await apiRequest('/api/mvp/pic/prepare-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: { picUserId: 'pic-1', orderId: order.id }
      });
      assert.strictEqual(picPrepareAttempt.status, 403, 'PIC cannot issue entry challenge');
      assert.strictEqual(picPrepareAttempt.data.code, 'PIC_CANNOT_ISSUE_ENTRY_CHALLENGE');

      // 4C: Buyer attempts to unilaterally confirm entry -> Forbidden
      const buyerConfirmAttempt = await apiRequest('/api/mvp/buyer/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { orderId: order.id, buyerId: 'buyer-1', code: '123456' }
      });
      assert.strictEqual(buyerConfirmAttempt.status, 403, 'Buyer cannot confirm entry directly');
      assert.strictEqual(buyerConfirmAttempt.data.code, 'BUYER_CANNOT_CONFIRM_ENTRY');

      assert.notStrictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);
    });

    // =========================================================================
    // ATTACK 5: PIC CONFIRMS ENTRY TWICE FOR SAME ORDER
    // =========================================================================
    await testAsync('Attack 5: Duplicate Entry Confirmation Rejected', async () => {
      const { order } = await setupPaidOrder();

      // First legit entry
      await EventPicService.recordEntryVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        gate: 'Gate 3',
        status: 'CONFIRMED'
      });
      assert.strictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);

      // Second entry attempt on same order
      try {
        await EventPicService.recordEntryVerification({
          picUserId: 'pic-1',
          orderId: order.id,
          gate: 'Gate 3',
          status: 'CONFIRMED'
        });
        assert.fail('Should have rejected duplicate entry confirmation');
      } catch (err) {
        assert.strictEqual(err.code, 'DUPLICATE_ENTRY_CONFIRMATION');
      }
    });

    // =========================================================================
    // ATTACK 6: DOUBLE-SETTLEMENT OF SAME ORDER (CONCURRENT & SEQUENTIAL)
    // =========================================================================
    await testAsync('Attack 6: Double-Settle Same Order (Idempotent payout, zero double disbursement)', async () => {
      const { order } = await setupPaidOrder();

      // Confirm entry first
      await EventPicService.recordEntryVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        gate: 'Gate 1',
        status: 'CONFIRMED'
      });
      await EscrowService.releaseToSeller(order.id, 'admin-1');

      // Initial settlement
      const firstSettle = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: order.seller_id,
        officerId: 'admin-1',
        idempotencyKey: 'settle-key-' + order.id
      });
      assert.strictEqual(firstSettle.settlement.status, 'EXECUTED');

      // Count settlements in database
      const settlementsBefore = state.settlements.filter(s => s.order_id === order.id);
      assert.strictEqual(settlementsBefore.length, 1);

      // Sequential duplicate attempt (same idempotency key)
      const duplicateSequential = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: order.seller_id,
        officerId: 'admin-1',
        idempotencyKey: 'settle-key-' + order.id
      });
      assert.strictEqual(duplicateSequential.idempotent, true, 'Must return idempotent true');
      assert.strictEqual(duplicateSequential.settlement.id, firstSettle.settlement.id);

      // Concurrent duplicate attempt (different idempotency key)
      const duplicateConcurrent = await SettlementService.executeSettlement({
        orderId: order.id,
        sellerId: order.seller_id,
        officerId: 'admin-1',
        idempotencyKey: 'settle-different-key-' + order.id
      });
      assert.strictEqual(duplicateConcurrent.duplicatePrevented, true, 'Must prevent duplicate payout');

      // Invariant verify: Exactly 1 settlement record exists
      const settlementsAfter = state.settlements.filter(s => s.order_id === order.id);
      assert.strictEqual(settlementsAfter.length, 1);
    });

    // =========================================================================
    // ATTACK 7: ADMIN IRREVERSIBLE ACTION WITHOUT STEP-UP AUTH
    // =========================================================================
    await testAsync('Attack 7: Admin Irreversible Action Without Step-Up Auth', async () => {
      const { order } = await setupPaidOrder();
      await EventPicService.recordEntryVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        gate: 'Gate 1',
        status: 'CONFIRMED'
      });

      // Subcase 7A: Settlement attempt without password or token
      const noAuthSettle = await apiRequest('/api/mvp/admin/settlements/execute', {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
        body: {
          officerId: 'admin-1',
          orderId: order.id,
          sellerId: order.seller_id,
          reason: 'Valid turnstile entry completed'
        }
      });
      assert.strictEqual(noAuthSettle.status, 403);
      assert.strictEqual(noAuthSettle.data.code, 'STEP_UP_AUTH_REQUIRED');

      // Subcase 7B: Settlement attempt with WRONG password
      const wrongPasswordSettle = await apiRequest('/api/mvp/admin/settlements/execute', {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
        body: {
          officerId: 'admin-1',
          orderId: order.id,
          sellerId: order.seller_id,
          stepUpPassword: 'WRONG_PASSWORD_123',
          reason: 'Valid turnstile entry completed'
        }
      });
      assert.strictEqual(wrongPasswordSettle.status, 403);
      assert.strictEqual(wrongPasswordSettle.data.code, 'STEP_UP_AUTH_REQUIRED');

      // Subcase 7C: Settlement attempt with correct password but reason < 10 characters
      const shortReasonSettle = await apiRequest('/api/mvp/admin/settlements/execute', {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
        body: {
          officerId: 'admin-1',
          orderId: order.id,
          sellerId: order.seller_id,
          stepUpPassword: 'pilot123',
          reason: 'Short' // Only 5 characters!
        }
      });
      assert.strictEqual(shortReasonSettle.status, 403);
      assert.strictEqual(shortReasonSettle.data.code, 'STEP_UP_REASON_REQUIRED');

      // Subcase 7D: Valid step-up authentication -> Succeeds
      const validSettle = await apiRequest('/api/mvp/admin/settlements/execute', {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
        body: {
          officerId: 'admin-1',
          orderId: order.id,
          sellerId: order.seller_id,
          stepUpPassword: 'pilot123',
          reason: 'Physical inspection and turnstile barcode validated' // >= 10 chars
        }
      });
      assert.strictEqual(validSettle.status, 200);
      assert.strictEqual(validSettle.data.success, true);
    });

    // =========================================================================
    // ATTACK 8: STATE JUMP (SKIP TICKET VERIFICATION)
    // =========================================================================
    await testAsync('Attack 8: State Jump (Skip Ticket Verification Straight to Entry Rejected)', async () => {
      const { order } = await setupPaidOrder();

      // Order is in PAID_ESCROWED, but ticket has NOT been verified yet (order.ticket_verified is falsy)
      assert.ok(!order.ticket_verified);

      // Subcase 8A: Service method throws TICKET_NOT_YET_VERIFIED
      try {
        await EventPicService.generateBuyerEntryChallenge({
          buyerId: 'buyer-1',
          orderId: order.id
        });
        assert.fail('Should have rejected state jump without prior ticket verification');
      } catch (err) {
        assert.strictEqual(err.code, 'TICKET_NOT_YET_VERIFIED');
        assert.ok(err.message.includes('State jump rejected'));
      }

      // Subcase 8B: HTTP Buyer challenge endpoint returns 403 TICKET_NOT_YET_VERIFIED
      const buyerJumpAttempt = await apiRequest(`/api/mvp/buyer/orders/${order.id}/entry-challenge`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { buyerId: 'buyer-1' }
      });
      assert.strictEqual(buyerJumpAttempt.status, 403);
      assert.strictEqual(buyerJumpAttempt.data.code, 'TICKET_NOT_YET_VERIFIED');

      // Subcase 8C: HTTP PIC confirm-entry returns 403 TICKET_NOT_YET_VERIFIED
      const picJumpAttempt = await apiRequest('/api/mvp/pic/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: { picUserId: 'pic-1', orderId: order.id, code: '123456', photoFile: true }
      });
      assert.strictEqual(picJumpAttempt.status, 403);
      assert.strictEqual(picJumpAttempt.data.code, 'TICKET_NOT_YET_VERIFIED');
      assert.notStrictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);
    });

    // =========================================================================
    // ATTACK 9: PII EVIDENCE ACCESS UNDER INDONESIA UU PDP
    // =========================================================================
    await testAsync('Attack 9: PII Evidence Access Under Indonesia UU PDP (No. 27/2022)', async () => {
      const { order } = await setupPaidOrder();

      // Create an encrypted mock KTP evidence file
      const dummyKtpData = Buffer.from('SENSITIVE_KTP_IDENTITY_DATA_NIK_317101234567890');
      const tempEncPath = path.resolve(__dirname, `test_ktp_${uuidv4()}.enc`);
      EvidenceStorageService.encryptAndStore(dummyKtpData, tempEncPath);

      const bundleId = `bundle-ktp-${uuidv4()}`;
      state.evidence_bundles.push({
        id: bundleId,
        claim_id: `claim-${order.id}`,
        uploader_id: order.seller_id,
        files_json: JSON.stringify([{
          originalname: 'ktp.jpg',
          mimetype: 'image/jpeg',
          path: tempEncPath,
          encrypted: true
        }]),
        created_at: new Date().toISOString()
      });

      try {
        // Subcase 9A: Unauthorized buyer attempts to generate signed URL for seller's KTP
        const unauthorizedReq = await apiRequest('/api/mvp/evidence/signed-url', {
          method: 'POST',
          headers: { 'x-user-id': 'buyer-2' }, // Unrelated buyer
          body: { requesterId: 'buyer-2', evidenceId: bundleId, orderId: order.id }
        });
        assert.strictEqual(unauthorizedReq.status, 403);
        assert.strictEqual(unauthorizedReq.data.code, 'EVIDENCE_ACCESS_DENIED');

        // Subcase 9B: Requesting direct file download without signed token
        const noTokenReq = await apiRequest(`/api/mvp/evidence/${bundleId}/file`, {
          method: 'GET'
        });
        assert.strictEqual(noTokenReq.status, 401);
        assert.strictEqual(noTokenReq.data.code, 'AUTH_REQUIRED');

        // Subcase 9C: Expired or tampered signed URL
        const forgedToken = 'fakePayload.fakeSignature1234567890';
        const tamperedReq = await apiRequest(`/api/mvp/evidence/${bundleId}/file?token=${forgedToken}`, {
          method: 'GET'
        });
        assert.strictEqual(tamperedReq.status, 403);
        assert.strictEqual(tamperedReq.data.code, 'EVIDENCE_ACCESS_DENIED');

        // Subcase 9D: Authorized Admin generates signed URL and accesses file -> Log recorded
        const adminSigned = EvidenceStorageService.generateSignedToken({
          evidenceId: bundleId,
          userId: 'admin-1',
          role: 'admin',
          orderId: order.id
        });
        const authorizedReq = await apiRequest(`/api/mvp/evidence/${bundleId}/file?token=${adminSigned.token}`, {
          method: 'GET'
        });
        assert.strictEqual(authorizedReq.status, 200);

        // Verify UU PDP audit logging
        const logs = state.evidence_access_logs.filter(l => l.evidence_id === bundleId);
        assert.ok(logs.length >= 1, 'Evidence access log must be recorded');
        assert.strictEqual(logs[0].accessed_by, 'admin-1');
      } finally {
        if (fs.existsSync(tempEncPath)) fs.unlinkSync(tempEncPath);
      }
    });

    // =========================================================================
    // ATTACK 10: TIMED-OUT REQUEST RETRY IDEMPOTENCY
    // =========================================================================
    await testAsync('Attack 10: Retrying a Timed-Out Request (Network timeout recovery is strictly idempotent)', async () => {
      const { order } = await setupPaidOrder();

      const idempotencyKey = 'retry-test-key-' + order.id;

      // Simulate client paying: Request 1 succeeds on server
      const payAttempt1 = await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: 'midtrans-first-ack-1',
        idempotencyKey,
        amountPaid: order.total_amount
      });
      assert.strictEqual(payAttempt1.order.status, ORDER_STATUS.PAID_ESCROWED);
      assert.strictEqual(payAttempt1.idempotent, false);

      const escrowsBefore = state.escrows.filter(e => e.order_id === order.id);
      assert.strictEqual(escrowsBefore.length, 1);

      // Simulate client experiencing network timeout / disconnect, and sending identical retry
      const payAttempt2 = await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: 'midtrans-retry-ack-2',
        idempotencyKey,
        amountPaid: order.total_amount
      });

      // Must be recognized as idempotent retry without duplicate escrow entry or error
      assert.strictEqual(payAttempt2.idempotent, true);

      // Verify no duplicate escrow records created in DB
      const escrowsAfter = state.escrows.filter(e => e.order_id === order.id);
      assert.strictEqual(escrowsAfter.length, 1, 'Escrow record count must remain exactly 1');
    });

    // =========================================================================
    // ATTACK 11: PRODUCTION IDENTITY SPOOFING REJECTION
    // =========================================================================
    await testAsync('Attack 11: Production Mode Rejects x-user-id Spoofing Without Session', async () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        // Attacker attempts to access protected endpoint using x-user-id header in production
        const spoofAttempt = await apiRequest('/api/mvp/auth/me', {
          method: 'GET',
          headers: { 'x-user-id': 'buyer-1' }
        });

        assert.strictEqual(spoofAttempt.status, 401, 'x-user-id must be rejected in production with 401');
        assert.strictEqual(spoofAttempt.data.code, 'AUTH_REQUIRED');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    // =========================================================================
    // ATTACK 12: PRODUCTION HARDCODED CREDENTIAL REJECTION
    // =========================================================================
    await testAsync('Attack 12: Production Mode Rejects pilot123 Default Password', async () => {
      // 1. Setup order while in test environment
      const { order } = await setupPaidOrder();
      await EventPicService.recordTicketVerification({
        picUserId: 'pic-1',
        orderId: order.id,
        photoFile: true,
        currentDateStr: '2026-09-25'
      });

      const prevEnv = process.env.NODE_ENV;
      const prevPass = process.env.ARGUS_ADMIN_PASSWORD;
      try {
        process.env.NODE_ENV = 'production';
        process.env.ARGUS_ADMIN_PASSWORD = 'super-secret-production-admin-pass-2026';

        const adminUser = state.users.find(u => u.id === 'admin-1');
        const prevAdminPass = adminUser.password;
        adminUser.password = process.env.ARGUS_ADMIN_PASSWORD;

        // Subcase 12A: Attacker attempts to login as admin with default 'pilot123' password in production
        const loginDefaultAttempt = await apiRequest('/api/mvp/auth/login', {
          method: 'POST',
          body: { usernameOrId: 'admin-1', password: 'pilot123' }
        });
        assert.strictEqual(loginDefaultAttempt.status, 401, 'Default pilot123 login must be rejected in production');
        assert.strictEqual(loginDefaultAttempt.data.code, 'AUTH_FAILED');

        // Subcase 12B: Login with production password succeeds
        const adminSession = await apiRequest('/api/mvp/auth/login', {
          method: 'POST',
          body: { usernameOrId: 'admin-1', password: 'super-secret-production-admin-pass-2026' }
        });
        assert.strictEqual(adminSession.status, 200);
        assert.ok(adminSession.data.session_token);

        // Subcase 12C: Attacker attempts step-up action using default 'pilot123' password -> Rejected
        const defaultPassAttempt = await apiRequest('/api/mvp/admin/settlements/execute', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminSession.data.session_token}`
          },
          body: {
            officerId: 'admin-1',
            orderId: order.id,
            sellerId: order.seller_id,
            stepUpPassword: 'pilot123', // Attempting default pilot password!
            reason: 'Administrative override for valid delivery'
          }
        });

        assert.strictEqual(defaultPassAttempt.status, 403, 'Default password must be rejected with 403 in production');
        assert.strictEqual(defaultPassAttempt.data.code, 'STEP_UP_AUTH_REQUIRED');

        adminUser.password = prevAdminPass;
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevPass) {
          process.env.ARGUS_ADMIN_PASSWORD = prevPass;
        } else {
          delete process.env.ARGUS_ADMIN_PASSWORD;
        }
      }
    });

    // =========================================================================
    // ATTACK 13: SESSION STORE RESTART PERSISTENCE
    // =========================================================================
    await testAsync('Attack 13: Session Store Survives Server / Memory Restarts', async () => {
      const { SessionStore } = require('./src/services/sessionStore');
      
      // Create a persistent session
      const created = SessionStore.createSession({ userId: 'pic-1', role: 'pic' });
      assert.ok(created.session_token);

      // Simulate process crash / in-memory state wipe
      state.sessions = [];

      // Verify that SessionStore retrieves the session from disk (data/sessions.json)
      const found = SessionStore.findSession(created.session_token);
      assert.ok(found, 'Session must survive memory wipe');
      assert.strictEqual(found.user_id, 'pic-1');
      assert.strictEqual(found.role, 'pic');

      // Test session revocation
      const revoked = SessionStore.revokeSession(created.session_token);
      assert.strictEqual(revoked, true);
      const afterRevoke = SessionStore.findSession(created.session_token);
      assert.strictEqual(afterRevoke, null, 'Revoked session must not be active');
    });

    // =========================================================================
    // ATTACK 14: MANDATORY GATE PHOTO EVIDENCE AT TURNSTILE
    // =========================================================================
    await testAsync('Attack 14: Mandatory Gate Photo Enforced for Entry Confirmation', async () => {
      const { order } = await setupPaidOrder();

      // Ticket verification
      await EventPicService.recordTicketVerification({ picUserId: 'pic-1', orderId: order.id, photoFile: true });

      // Buyer generates entry code
      const challengeRes = await apiRequest(`/api/mvp/buyer/orders/${order.id}/entry-challenge`, {
        method: 'POST',
        headers: { 'x-user-id': 'buyer-1' },
        body: { buyerId: 'buyer-1' }
      });
      const code = challengeRes.data.code;

      // PIC attempts confirm-entry WITHOUT photo (photoFile: false, no evidenceBundleId)
      const noPhotoAttempt = await apiRequest('/api/mvp/pic/confirm-entry', {
        method: 'POST',
        headers: { 'x-user-id': 'pic-1' },
        body: {
          picUserId: 'pic-1',
          orderId: order.id,
          code,
          gate: 'Gate 1'
          // no files and no evidenceBundleId
        }
      });

      assert.strictEqual(noPhotoAttempt.status, 400, 'Entry confirmation without photo must return 400');
      assert.strictEqual(noPhotoAttempt.data.code, 'GATE_PHOTO_MANDATORY');
      assert.notStrictEqual(order.status, ORDER_STATUS.ENTRY_CONFIRMED);
    });

    // =========================================================================
    // ATTACK 15: PRODUCTION EVIDENCE ENCRYPTION KEY ENFORCEMENT
    // =========================================================================
    await testAsync('Attack 15: Production Evidence Encryption Key Required', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.ARGUS_EVIDENCE_ENCRYPTION_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ARGUS_EVIDENCE_ENCRYPTION_KEY;

        const dummyData = Buffer.from('TEST_DATA');
        const testPath = path.resolve(__dirname, `test_enc_${uuidv4()}.enc`);

        try {
          EvidenceStorageService.encryptAndStore(dummyData, testPath);
          assert.fail('Should have failed due to missing encryption key in production');
        } catch (err) {
          assert.strictEqual(err.code, 'ENCRYPTION_KEY_NOT_CONFIGURED');
        } finally {
          if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevKey) {
          process.env.ARGUS_EVIDENCE_ENCRYPTION_KEY = prevKey;
        } else {
          delete process.env.ARGUS_EVIDENCE_ENCRYPTION_KEY;
        }
      }
    });

    console.log(`\n=======================`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`=======================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (server) {
      server.close();
    }
  }
}

runRedTeamSuite().catch(err => {
  console.error('Fatal Red Team Test Error:', err);
  process.exit(1);
});
