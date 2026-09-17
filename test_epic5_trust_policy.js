/**
 * TIKUM / ARGUS — EPIC 5: Trust Policy Engine & Multi-Layer Authorization Test Suite
 * 
 * 24 Comprehensive Red-Team Attack Scenarios & Non-Negotiable Invariants:
 * 1.  PIC alone attempts release -> FAIL
 * 2.  PIC confirms entry, but platform fails -> EXCEPTION / no release
 * 3.  Buyer confirms, ticket evidence fails -> BLOCK
 * 4.  Platform passes, but required PIC is missing in HIGH-risk -> PENDING/BLOCK
 * 5.  Same PIC confirms multiple times -> Deduplicated, no quorum inflation
 * 6.  Same actor across multiple sessions -> Single identity, no extra weight
 * 7.  Client spoofs x-user-role header -> No authority gained
 * 8.  PIC collusion with mismatched evidence -> Flagged for review / EXCEPTION
 * 9.  Platform REJECT + PIC PASS + Buyer PASS -> Platform not outvoted (Critical Acceptance Test 1)
 * 10. Shared IP on venue Wi-Fi -> Signal logged, not auto-collusion block
 * 11. PIC outside operational window -> FAIL (PIC_OUTSIDE_OPERATIONAL_WINDOW)
 * 12. PIC wrong event -> FAIL (PIC_UNAUTHORIZED)
 * 13. PIC wrong gate -> FAIL (PIC_GATE_MISMATCH)
 * 14. Buyer code replay -> FAIL (CHALLENGE_ALREADY_CONSUMED)
 * 15. PIC attempts to generate buyer secret -> FAIL (PIC_CANNOT_ISSUE_ENTRY_CHALLENGE)
 * 16. PIC burst velocity -> Incident reported, elevated risk signal (turnstile not blocked)
 * 17. Disputed transaction with valid quorum -> Release blocked
 * 18. Frozen transaction with valid quorum -> Release blocked
 * 19. Concurrent release requests -> Exactly 1 release, 1 ledger, 1 transition (Critical Acceptance Test 2)
 * 20. Retry after release -> Idempotent, zero duplicate payout
 * 21. Duplicate attestation request -> Idempotent, no extra weight
 * 22. Non-existent order ID -> FAIL (ORDER_NOT_FOUND)
 * 23. Unauthorized actor attestation -> FAIL (UNAUTHORIZED_ATTESTOR)
 * 24. Cross-transaction authorization token reuse -> FAIL (FINANCIAL_RELEASE_NOT_AUTHORIZED)
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const { state, resetDatabase } = require('./src/database');
const { TrustPolicyEngine, RISK_LEVEL, ATTESTATION_TYPE, AUTHORIZATION_OUTCOME } = require('./src/trust/TrustPolicyEngine');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('./src/services/escrowService');
const { EventPicService } = require('./src/services/eventPicService');
const { EscrowStateMachine, ESCROW_LIFECYCLE_STATE } = require('./src/settlement/EscrowStateMachine');
const { FinancialLedger } = require('./src/settlement/FinancialLedger');
const { TransactionChallengeService } = require('./src/services/transactionChallengeService');

let passed = 0;
let failed = 0;

async function testAsync(title, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    failed++;
  }
}

async function setupBaselineOrder({ orderId = 'ord-test-1', amount = 1000000, buyerId = 'buyer-1', sellerId = 'seller-1', eventId = 'event-coldplay', ticketId = 'tkt-test-1' } = {}) {
  // Clear any existing matching order
  state.orders = state.orders ? state.orders.filter(o => o.id !== orderId) : [];
  state.escrows = state.escrows ? state.escrows.filter(e => e.order_id !== orderId) : [];
  state.tickets = state.tickets ? state.tickets.filter(t => t.id !== ticketId) : [];
  state.entry_verifications = state.entry_verifications ? state.entry_verifications.filter(v => v.order_id !== orderId) : [];
  state.attestations = state.attestations ? state.attestations.filter(a => a.order_id !== orderId) : [];
  state.authorization_records = state.authorization_records ? state.authorization_records.filter(r => r.order_id !== orderId) : [];

  const order = {
    id: orderId,
    listing_id: `list-${orderId}`,
    ticket_id: ticketId,
    buyer_id: buyerId,
    seller_id: sellerId,
    event_id: eventId,
    total_amount: amount,
    ticket_price: amount,
    status: 'PAID_ESCROWED',
    created_at: new Date().toISOString()
  };
  state.orders.push(order);

  const escrow = {
    id: `esc-${orderId}`,
    order_id: orderId,
    amount: amount,
    status: ESCROW_STATUS.ESCROWED,
    state_machine_status: ESCROW_LIFECYCLE_STATE.FUNDS_LOCKED,
    created_at: new Date().toISOString(),
    transition_history: []
  };
  state.escrows.push(escrow);

  const ticket = {
    id: ticketId,
    event_id: eventId,
    seller_id: sellerId,
    status: 'ESCROWED',
    barcode: `BC-${orderId}`,
    created_at: new Date().toISOString()
  };
  state.tickets.push(ticket);

  return { order, escrow, ticket };
}

async function runEpic5Suite() {
  console.log('\n================================================================');
  console.log('  TIKUM / ARGUS — EPIC 5 TRUST POLICY & AUTHORIZATION TEST SUITE');
  console.log('================================================================\n');

  resetDatabase();

  // -------------------------------------------------------------------------
  // SCENARIO 1: PIC alone attempts release -> FAIL
  // -------------------------------------------------------------------------
  await testAsync('Scenario 1: PIC alone attempts release -> Blocked by multi-layer invariants', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-1' });

    // PIC attestation alone is recorded
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS'
    });

    // 1. PIC role cannot execute release in EscrowStateMachine
    let stateMachineBlocked = false;
    try {
      await EscrowStateMachine.transition({
        orderId: order.id,
        targetState: ESCROW_LIFECYCLE_STATE.RELEASED,
        actorId: 'pic-1',
        actorRole: 'pic',
        reason: 'PIC attempting direct release'
      });
    } catch (e) {
      stateMachineBlocked = true;
      assert.strictEqual(e.code, 'ILLEGAL_ESCROW_TRANSITION');
    }
    assert.ok(stateMachineBlocked, 'EscrowStateMachine must reject illegal jump by PIC');

    // 2. EscrowService releaseToSeller fails because required entry verification and platform attestations are missing
    let releaseBlocked = false;
    try {
      await EscrowService.releaseToSeller(order.id, 'pic-1');
    } catch (e) {
      releaseBlocked = true;
      assert.strictEqual(e.code, 'ENTRY_NOT_CONFIRMED');
    }
    assert.ok(releaseBlocked, 'EscrowService must deny release with PIC alone');
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 2: PIC confirms entry, but platform fails -> EXCEPTION / no release
  // -------------------------------------------------------------------------
  await testAsync('Scenario 2: PIC confirms entry, but platform fails -> EXCEPTION / Release Denied', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-2' });

    // Entry confirmation in DB
    state.entry_verifications.push({
      id: 'ent-scen-2',
      order_id: order.id,
      ticket_id: order.ticket_id,
      pic_id: 'pic-1',
      status: 'CONFIRMED',
      verified_at: new Date().toISOString()
    });

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    // Platform attestation FAILS
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'FAIL',
      metadata: { reason: 'Automated AML/Fraud check failed' }
    });

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.ok(decision.outcome === AUTHORIZATION_OUTCOME.BLOCK || decision.outcome === AUTHORIZATION_OUTCOME.EXCEPTION);

    let releaseDenied = false;
    try {
      await EscrowService.releaseToSeller(order.id, 'admin-1');
    } catch (e) {
      releaseDenied = true;
      assert.strictEqual(e.code, 'FINANCIAL_RELEASE_NOT_AUTHORIZED');
    }
    assert.ok(releaseDenied, 'Release to seller must be rejected when platform attestation failed');
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 3: Buyer confirms, ticket evidence fails -> BLOCK
  // -------------------------------------------------------------------------
  await testAsync('Scenario 3: Buyer confirms, ticket evidence fails -> BLOCK', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-3' });

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
      actorId: order.buyer_id,
      actorRole: 'buyer',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    // Ticket evidence attestation FAILS
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'FAIL',
      metadata: { reason: 'Barcode checksum corrupt' }
    });

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.strictEqual(decision.outcome, AUTHORIZATION_OUTCOME.BLOCK);
    assert.ok(decision.blocking_reasons.includes('MANDATORY_ATTESTATION_FAILED_TICKET_EVIDENCE_ATTESTATION'));
  });

  // -------------------------------------------------------------------------
  // SCENARIO 4: Platform passes, but required PIC is missing in HIGH-risk -> PENDING/BLOCK
  // -------------------------------------------------------------------------
  await testAsync('Scenario 4: Platform passes, but required PIC is missing in HIGH-risk -> PENDING / Release Denied', async () => {
    // High-value order: Rp 6.000.000 -> Automatically evaluated as HIGH risk
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-4', amount: 6000000 });

    const riskEval = TrustPolicyEngine.evaluateRisk({ orderId: order.id });
    assert.strictEqual(riskEval.riskLevel, RISK_LEVEL.HIGH);

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.strictEqual(decision.outcome, AUTHORIZATION_OUTCOME.PENDING);
    assert.ok(decision.missing_attestations.includes('PIC_ATTESTATION'));
    assert.ok(decision.missing_attestations.includes('BUYER_ATTESTATION'));
  });

  // -------------------------------------------------------------------------
  // SCENARIO 5: Same PIC confirms multiple times -> Deduplicated, no quorum inflation
  // -------------------------------------------------------------------------
  await testAsync('Scenario 5: Same PIC confirms multiple times -> Anti-inflation deduplication', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-5' });

    const res1 = await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { attempt: 1 }
    });
    assert.strictEqual(res1.duplicate, false);

    const res2 = await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { attempt: 2 }
    });
    assert.strictEqual(res2.duplicate, true);

    const res3 = await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { attempt: 3 }
    });
    assert.strictEqual(res3.duplicate, true);

    const attestations = TrustPolicyEngine.getAttestations(order.id);
    const picAttestations = attestations.filter(a => a.type === ATTESTATION_TYPE.PIC_ATTESTATION);
    assert.strictEqual(picAttestations.length, 1, 'Exact quorum weight of 1 must be maintained');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 6: Same actor across multiple sessions -> Single identity
  // -------------------------------------------------------------------------
  await testAsync('Scenario 6: Same actor across multiple sessions -> Single identity', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-6' });

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { session_id: 'sess-desktop' }
    });

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS',
      metadata: { session_id: 'sess-mobile-app' }
    });

    const attestations = TrustPolicyEngine.getAttestations(order.id);
    assert.strictEqual(attestations.length, 1);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 7: Client spoofs x-user-role header -> No authority gained
  // -------------------------------------------------------------------------
  await testAsync('Scenario 7: Client spoofs role -> Role boundary strictly enforced', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-7' });

    // Buyer attempts to provide PLATFORM_ATTESTATION
    let platformSpoofBlocked = false;
    try {
      await TrustPolicyEngine.recordAttestation({
        orderId: order.id,
        attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
        actorId: 'attacker-1',
        actorRole: 'buyer',
        result: 'PASS'
      });
    } catch (e) {
      platformSpoofBlocked = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ATTESTOR');
    }
    assert.ok(platformSpoofBlocked, 'PLATFORM_ATTESTATION by non-system actor must be rejected');

    // Buyer attempts to provide PIC_ATTESTATION
    let picSpoofBlocked = false;
    try {
      await TrustPolicyEngine.recordAttestation({
        orderId: order.id,
        attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
        actorId: 'attacker-1',
        actorRole: 'buyer',
        result: 'PASS'
      });
    } catch (e) {
      picSpoofBlocked = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ATTESTOR');
    }
    assert.ok(picSpoofBlocked, 'PIC_ATTESTATION by non-pic actor must be rejected');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 8: PIC collusion with mismatched evidence -> EXCEPTION / Review
  // -------------------------------------------------------------------------
  await testAsync('Scenario 8: PIC collusion with evidence anomaly -> EXCEPTION / Review', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-8' });

    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS'
    });

    // Pass anomaly detected signal
    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id, {
      anomalyDetected: true
    });
    assert.strictEqual(decision.outcome, AUTHORIZATION_OUTCOME.EXCEPTION);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.ok(decision.exception_reasons.includes('DEVICE_OR_BEHAVIOR_ANOMALY_REQUIRES_MANUAL_REVIEW'));
  });

  // -------------------------------------------------------------------------
  // SCENARIO 9: Platform REJECT + PIC PASS + Buyer PASS -> Platform not outvoted (Acceptance Test 1)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 9: Platform REJECT + PIC PASS + Buyer PASS -> FINANCIAL_RELEASE_AUTHORIZED = FALSE', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-9' });

    // PIC = CONFIRMED
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS'
    });
    // Buyer = CONFIRMED
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
      actorId: order.buyer_id,
      actorRole: 'buyer',
      result: 'PASS'
    });
    // Ticket = VERIFIED
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    // But PLATFORM = FAIL / BLOCK
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'FAIL',
      metadata: { reason: 'High confidence ticket fraud ring detected' }
    });

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false, 'FINANCIAL_RELEASE_AUTHORIZED must be FALSE');
    assert.ok(
      decision.outcome === AUTHORIZATION_OUTCOME.BLOCK || decision.outcome === AUTHORIZATION_OUTCOME.EXCEPTION,
      'Transaction must enter BLOCK or EXCEPTION'
    );
    assert.ok(decision.exception_reasons.includes('PLATFORM_REJECTED_DESPITE_FIELD_CONFIRMATION'));

    // Attempt release
    let releaseFailed = false;
    try {
      await EscrowService.releaseToSeller(order.id, 'admin-1');
    } catch (e) {
      releaseFailed = true;
      assert.strictEqual(e.code, 'ENTRY_NOT_CONFIRMED'); // Or release denied
    }
    // Seller receives ZERO release
    assert.strictEqual(escrow.status, ESCROW_STATUS.ESCROWED);
    assert.strictEqual(escrow.amount, 1000000);
    assert.strictEqual(escrow.released_at, undefined);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 10: Shared IP on venue Wi-Fi -> Signal logged, not auto-collusion block
  // -------------------------------------------------------------------------
  await testAsync('Scenario 10: Shared IP on venue Wi-Fi -> Signal logged, gate not blocked', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-10' });
    order.buyer_ip = '192.168.10.50';

    const result = TrustPolicyEngine.validatePicConflictOfInterest({
      picUserId: 'pic-1',
      orderId: order.id,
      ipAddress: '192.168.10.50'
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.sharedIpSignal, true);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 11: PIC outside operational window -> FAIL (PIC_OUTSIDE_OPERATIONAL_WINDOW)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 11: PIC outside operational window -> FAIL', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-11', eventId: 'event-coldplay' });

    // Event is on 2026-11-15 19:00:00. Attempt 10 hours before (09:00:00)
    let windowBlocked = false;
    try {
      TrustPolicyEngine.validatePicShiftAndWindow({
        picUserId: 'pic-1',
        orderId: order.id,
        timestampStr: '2026-11-15T09:00:00.000Z'
      });
    } catch (e) {
      windowBlocked = true;
      assert.strictEqual(e.code, 'PIC_OUTSIDE_OPERATIONAL_WINDOW');
    }
    assert.ok(windowBlocked, 'PIC verification outside window must throw PIC_OUTSIDE_OPERATIONAL_WINDOW');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 12: PIC wrong event -> FAIL (PIC_UNAUTHORIZED)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 12: PIC wrong event -> FAIL (PIC_UNAUTHORIZED)', async () => {
    if (!state.events.find(e => e.id === 'event-bruno-mars')) {
      state.events.push({
        id: 'event-bruno-mars',
        name: 'Bruno Mars Live in Jakarta',
        date: '2026-12-01',
        venue_id: 'venue-gbk',
        status: 'ACTIVE'
      });
    }
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-12', eventId: 'event-bruno-mars' });

    let unauthBlocked = false;
    try {
      TrustPolicyEngine.validatePicShiftAndWindow({
        picUserId: 'pic-1', // Assigned to coldplay, not bruno-mars
        orderId: order.id
      });
    } catch (e) {
      unauthBlocked = true;
      assert.strictEqual(e.code, 'PIC_UNAUTHORIZED');
    }
    assert.ok(unauthBlocked, 'Unassigned event must throw PIC_UNAUTHORIZED');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 13: PIC wrong gate -> FAIL (PIC_GATE_MISMATCH)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 13: PIC wrong gate -> FAIL (PIC_GATE_MISMATCH)', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-13', eventId: 'event-coldplay' });

    // Ensure PIC assignment has gate 'Gate 1'
    const assign = state.event_pics.find(ep => ep.pic_user_id === 'pic-1' && ep.event_id === 'event-coldplay');
    if (assign) assign.venue_gate = 'Gate 1';

    let gateMismatchBlocked = false;
    try {
      TrustPolicyEngine.validatePicShiftAndWindow({
        picUserId: 'pic-1',
        orderId: order.id,
        gate: 'Gate 9 VIP'
      });
    } catch (e) {
      gateMismatchBlocked = true;
      assert.strictEqual(e.code, 'PIC_GATE_MISMATCH');
    }
    assert.ok(gateMismatchBlocked, 'Mismatched gate must throw PIC_GATE_MISMATCH');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 14: Buyer code replay -> FAIL (CHALLENGE_ALREADY_CONSUMED)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 14: Buyer code replay -> FAIL (CHALLENGE_ALREADY_CONSUMED)', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-14' });

    const chg = await TransactionChallengeService.createChallenge({
      orderId: order.id,
      eventId: order.event_id,
      actionType: 'ENTRY_CONFIRMED',
      issuingActorRole: 'buyer',
      issuingActorId: order.buyer_id,
      confirmingActorRole: 'pic'
    });

    // 1st consumption: Valid
    const res1 = await TransactionChallengeService.verifyAndConsumeChallenge({
      orderId: order.id,
      actionType: 'ENTRY_CONFIRMED',
      providedCode: chg.rawCode,
      consumingActorId: 'pic-1',
      consumingActorRole: 'pic'
    });
    assert.strictEqual(res1.success, true);

    // 2nd consumption: Replay attempt
    let replayBlocked = false;
    try {
      await TransactionChallengeService.verifyAndConsumeChallenge({
        orderId: order.id,
        actionType: 'ENTRY_CONFIRMED',
        providedCode: chg.rawCode,
        consumingActorId: 'pic-1',
        consumingActorRole: 'pic'
      });
    } catch (e) {
      replayBlocked = true;
      assert.strictEqual(e.code, 'CHALLENGE_ALREADY_CONSUMED');
    }
    assert.ok(replayBlocked, 'Replayed challenge code must be rejected with CHALLENGE_ALREADY_CONSUMED');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 15: PIC attempts to generate buyer secret -> FAIL (PIC_CANNOT_ISSUE_ENTRY_CHALLENGE)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 15: PIC attempts to generate buyer challenge -> FAIL', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-15' });

    let picGenBlocked = false;
    try {
      await TransactionChallengeService.createChallenge({
        orderId: order.id,
        eventId: order.event_id,
        actionType: 'ENTRY_CONFIRMED',
        issuingActorRole: 'pic',
        issuingActorId: 'pic-1'
      });
    } catch (e) {
      picGenBlocked = true;
      assert.strictEqual(e.code, 'PIC_CANNOT_ISSUE_ENTRY_CHALLENGE');
    }
    assert.ok(picGenBlocked, 'PIC generating entry challenge must be rejected with PIC_CANNOT_ISSUE_ENTRY_CHALLENGE');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 16: PIC burst velocity -> Incident reported, elevated risk signal
  // -------------------------------------------------------------------------
  await testAsync('Scenario 16: PIC burst velocity -> Anomaly flagged, gate not blocked (Hard Constraint 4)', async () => {
    const picId = 'pic-velocity-test';
    const now = Date.now();

    // Verification 1 & 2
    TrustPolicyEngine.checkPicBurstVelocity({ picUserId: picId, gate: 'Gate 1', timestamp: now });
    TrustPolicyEngine.checkPicBurstVelocity({ picUserId: picId, gate: 'Gate 1', timestamp: now + 500 });

    // Verification 3 in < 2 seconds
    const velCheck = TrustPolicyEngine.checkPicBurstVelocity({ picUserId: picId, gate: 'Gate 1', timestamp: now + 1000 });
    assert.strictEqual(velCheck.anomalyDetected, true);
    assert.ok(velCheck.recentCount >= 3);
    assert.ok(velCheck.message.includes('Burst velocity anomaly detected'));
  });

  // -------------------------------------------------------------------------
  // SCENARIO 17: Disputed transaction with valid quorum -> Release blocked
  // -------------------------------------------------------------------------
  await testAsync('Scenario 17: Disputed transaction with valid quorum -> Release strictly blocked', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-17' });

    // All positive attestations
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PIC_ATTESTATION,
      actorId: 'pic-1',
      actorRole: 'pic',
      result: 'PASS'
    });

    // Mark DISPUTED
    escrow.status = 'DISPUTED';
    order.status = 'DISPUTED';

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.strictEqual(decision.outcome, AUTHORIZATION_OUTCOME.BLOCK);
    assert.ok(decision.blocking_reasons.includes('TRANSACTION_IN_DISPUTED_STATE'));

    let disputeBlocked = false;
    try {
      await EscrowService.releaseToSeller(order.id, 'admin-1');
    } catch (e) {
      disputeBlocked = true;
      assert.strictEqual(e.code, 'TRANSACTION_IN_DISPUTED_STATE');
    }
    assert.ok(disputeBlocked, 'Release must be strictly blocked in DISPUTED state');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 18: Frozen transaction with valid quorum -> Release blocked
  // -------------------------------------------------------------------------
  await testAsync('Scenario 18: Frozen transaction with valid quorum -> Release strictly blocked', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-18' });

    // Mark FROZEN
    escrow.status = 'FROZEN';
    order.status = 'FROZEN';

    const decision = await TrustPolicyEngine.evaluateAuthorization(order.id);
    assert.strictEqual(decision.financial_release_authorized, false);
    assert.strictEqual(decision.outcome, AUTHORIZATION_OUTCOME.BLOCK);
    assert.ok(decision.blocking_reasons.includes('TRANSACTION_IN_FROZEN_STATE'));

    let frozenBlocked = false;
    try {
      await EscrowService.releaseToSeller(order.id, 'admin-1');
    } catch (e) {
      frozenBlocked = true;
      assert.strictEqual(e.code, 'TRANSACTION_IN_FROZEN_STATE');
    }
    assert.ok(frozenBlocked, 'Release must be strictly blocked in FROZEN state');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 19: Concurrent release requests -> Exactly 1 release, 1 ledger, 1 transition (Acceptance Test 2)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 19: Concurrent release requests -> Exactly ONE financial release and ledger settlement', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-19', amount: 1000000 });

    // Record valid entry verification
    state.entry_verifications.push({
      id: 'ent-scen-19',
      order_id: order.id,
      ticket_id: order.ticket_id,
      pic_id: 'pic-1',
      status: 'CONFIRMED',
      verified_at: new Date().toISOString()
    });

    // Provide all required attestations for LOW risk
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });

    const preLedgerCount = (state.financial_ledger || []).filter(tx => tx.order_id === order.id).length;

    // Fire TWO concurrent release requests simultaneously
    const [resA, resB] = await Promise.all([
      EscrowService.releaseToSeller(order.id, 'admin-1'),
      EscrowService.releaseToSeller(order.id, 'admin-1')
    ]);

    // Exactly one executed release, exactly one marked alreadyReleased / idempotent
    const releasesExecuted = [resA, resB].filter(r => r.success && !r.alreadyReleased);
    const idempotentResponses = [resA, resB].filter(r => r.success && r.alreadyReleased);

    assert.strictEqual(releasesExecuted.length, 1, 'Exactly ONE release must be executed');
    assert.strictEqual(idempotentResponses.length, 1, 'Exactly ONE response must be marked idempotent');

    // Exactly one ledger settlement recorded
    const postLedgerCount = (state.financial_ledger || []).filter(tx => tx.order_id === order.id).length;
    assert.strictEqual(postLedgerCount - preLedgerCount, 1, 'Exactly ONE ledger transaction must be created');

    // Escrow status is RELEASED
    assert.strictEqual(escrow.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(order.status, ORDER_STATUS.SETTLED);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 20: Retry after release -> Idempotent, zero duplicate payout
  // -------------------------------------------------------------------------
  await testAsync('Scenario 20: Retry after release -> Idempotent, zero duplicate payout', async () => {
    const { order, escrow } = await setupBaselineOrder({ orderId: 'ord-scen-20' });

    escrow.status = ESCROW_STATUS.RELEASED;
    order.status = ORDER_STATUS.SETTLED;

    const retryRes = await EscrowService.releaseToSeller(order.id, 'admin-1');
    assert.strictEqual(retryRes.success, true);
    assert.strictEqual(retryRes.alreadyReleased, true);
    assert.strictEqual(retryRes.idempotent, true);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 21: Duplicate attestation request -> Idempotent, no extra weight
  // -------------------------------------------------------------------------
  await testAsync('Scenario 21: Duplicate attestation request -> Idempotent update, no extra record', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-21' });

    const att1 = await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS',
      metadata: { check: 'initial' }
    });
    assert.strictEqual(att1.duplicate, false);

    const att2 = await TrustPolicyEngine.recordAttestation({
      orderId: order.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS',
      metadata: { check: 'retry' }
    });
    assert.strictEqual(att2.duplicate, true);

    const records = (state.attestations || []).filter(
      a => a.order_id === order.id && a.type === ATTESTATION_TYPE.PLATFORM_ATTESTATION
    );
    assert.strictEqual(records.length, 1);
  });

  // -------------------------------------------------------------------------
  // SCENARIO 22: Non-existent order ID -> FAIL (ORDER_NOT_FOUND)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 22: Non-existent order ID -> FAIL (ORDER_NOT_FOUND)', async () => {
    let notFoundBlocked = false;
    try {
      TrustPolicyEngine.validatePicConflictOfInterest({
        picUserId: 'pic-1',
        orderId: 'non-existent-order-9999'
      });
    } catch (e) {
      notFoundBlocked = true;
      assert.strictEqual(e.code, 'ORDER_NOT_FOUND');
    }
    assert.ok(notFoundBlocked, 'Missing order ID must throw ORDER_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 23: Unauthorized actor attestation -> FAIL (UNAUTHORIZED_ATTESTOR)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 23: Unauthorized actor attestation -> FAIL (UNAUTHORIZED_ATTESTOR)', async () => {
    const { order } = await setupBaselineOrder({ orderId: 'ord-scen-23' });

    // Seller attempts to provide BUYER_ATTESTATION
    let sellerBuyerAttBlocked = false;
    try {
      await TrustPolicyEngine.recordAttestation({
        orderId: order.id,
        attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
        actorId: order.seller_id,
        actorRole: 'seller',
        result: 'PASS'
      });
    } catch (e) {
      sellerBuyerAttBlocked = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ATTESTOR');
    }
    assert.ok(sellerBuyerAttBlocked, 'Seller submitting BUYER_ATTESTATION must be blocked');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 24: Cross-transaction authorization token reuse -> FAIL (FINANCIAL_RELEASE_NOT_AUTHORIZED)
  // -------------------------------------------------------------------------
  await testAsync('Scenario 24: Cross-transaction authorization token reuse -> FAIL', async () => {
    const { order: orderA } = await setupBaselineOrder({ orderId: 'ord-scen-24-A' });
    const { order: orderB, escrow: escrowB } = await setupBaselineOrder({ orderId: 'ord-scen-24-B' });

    // Legitimate authorization for Order A
    await TrustPolicyEngine.recordAttestation({
      orderId: orderA.id,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: orderA.id,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId: orderA.id,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'SYSTEM',
      actorRole: 'system',
      result: 'PASS'
    });
    const authRecordA = await TrustPolicyEngine.evaluateAuthorization(orderA.id);
    assert.strictEqual(authRecordA.financial_release_authorized, true);

    // Set escrowB in RELEASE_PENDING
    escrowB.state_machine_status = ESCROW_LIFECYCLE_STATE.RELEASE_PENDING;

    // Attacker attempts to use Order A's authorization_id to transition Order B to RELEASED
    let crossReuseBlocked = false;
    try {
      await EscrowStateMachine.transition({
        orderId: orderB.id,
        targetState: ESCROW_LIFECYCLE_STATE.RELEASED,
        actorId: 'admin-1',
        actorRole: 'admin',
        reason: 'Attempt cross-token release',
        metadata: { authorization_id: authRecordA.authorization_id }
      });
    } catch (e) {
      crossReuseBlocked = true;
      assert.strictEqual(e.code, 'FINANCIAL_RELEASE_NOT_AUTHORIZED');
    }
    assert.ok(crossReuseBlocked, 'Cross-transaction authorization token reuse must be rejected');

    // Test authorization expiration check
    authRecordA.expires_at = new Date(Date.now() - 5000).toISOString();
    assert.strictEqual(TrustPolicyEngine.isReleaseAuthorized(orderA.id, authRecordA.authorization_id), false, 'Expired authorization must be rejected');
    authRecordA.expires_at = new Date(Date.now() + 3600000).toISOString();

    // Test authorization revocation check
    authRecordA.revoked_at = new Date().toISOString();
    assert.strictEqual(TrustPolicyEngine.isReleaseAuthorized(orderA.id, authRecordA.authorization_id), false, 'Revoked authorization must be rejected');
    authRecordA.revoked_at = null;
    assert.strictEqual(TrustPolicyEngine.isReleaseAuthorized(orderA.id, authRecordA.authorization_id), true, 'Valid authorization must be accepted');
  });

  // -------------------------------------------------------------------------
  // SCENARIO 25: Accepted counter-offer passes through normal transaction/trust/escrow authorization path
  // -------------------------------------------------------------------------
  await testAsync('Scenario 25: Accepted counter-offer passes through normal transaction/trust/escrow authorization path', async () => {
    const { ListingService } = require('./src/services/listingService');
    const { OfferService, OFFER_STATUS } = require('./src/services/offerService');

    // 1. Create and verify listing
    const listingRes = await ListingService.createListing({
      sellerId: 'seller-1',
      eventId: 'event-coldplay',
      seatInfo: 'VIP Row 10',
      faceValue: 2000000,
      price: 2500000,
      rawBarcode: 'BC-COUNTER-OFFER-EPIC5'
    });
    await ListingService.verifyListing(listingRes.listing.id, 'admin-1', { approved: true });

    // 2. Buyer makes initial offer
    const initialOffer = await OfferService.createOffer({
      buyerId: 'buyer-1',
      listingId: listingRes.listing.id,
      offerAmount: 2100000
    });
    assert.strictEqual(initialOffer.status, OFFER_STATUS.PENDING);

    // 3. Seller counters the offer
    const counterOfferRes = await OfferService.counterOffer({
      offerId: initialOffer.id,
      sellerId: 'seller-1',
      counterAmount: 2300000
    });
    assert.strictEqual(counterOfferRes.status, OFFER_STATUS.COUNTERED);

    // INVARIANT: counter-offer creation MUST NOT trigger escrow release or financial payout
    const initialEscrow = state.escrows.find(e => e.order_id === `ord-${counterOfferRes.id}`);
    assert.strictEqual(initialEscrow, undefined, 'No escrow released or created on bare counter-offer');

    // 4. Buyer accepts the counter-offer -> creates Order & Escrow in PENDING_PAYMENT
    const acceptedRes = await OfferService.acceptCounterOffer({
      offerId: initialOffer.id,
      buyerId: 'buyer-1'
    });
    assert.strictEqual(acceptedRes.offer.status, OFFER_STATUS.ACCEPTED);
    const orderId = acceptedRes.order.id;
    assert.strictEqual(acceptedRes.order.ticket_price, 2300000);

    // INVARIANT: Attempting release immediately fails (no payment, no entry, no trust authorization)
    let prematureReleaseFailed = false;
    try {
      await EscrowService.releaseToSeller(orderId, 'admin-1');
    } catch (e) {
      prematureReleaseFailed = true;
      assert.ok(e.code === 'INVALID_ESCROW_STATE' || e.code === 'ENTRY_NOT_CONFIRMED');
    }
    assert.ok(prematureReleaseFailed, 'Release must fail on unpaid/unverified counter-offer order');

    // 5. Payment is captured into escrow
    await EscrowService.recordPayment({
      orderId,
      providerRef: `pay-ref-${orderId}`,
      idempotencyKey: `idemp-counter-${orderId}`,
      amountPaid: acceptedRes.pricing.totalAmount
    });

    // 6. PIC verifies entry at gate
    await EventPicService.recordEntryVerification({
      picUserId: 'pic-1',
      orderId,
      gate: 'Gate 1',
      status: 'CONFIRMED'
    });

    // 7. Trust Policy evaluates and authorizes release
    const authDecision = await TrustPolicyEngine.evaluateAuthorization(orderId);
    assert.strictEqual(authDecision.financial_release_authorized, true);
    assert.strictEqual(authDecision.authorized, true);
    assert.strictEqual(authDecision.decision, 'PASS');
    assert.ok(authDecision.satisfied_attestations.length > 0);
    assert.strictEqual(authDecision.revoked_at, null);

    // 8. Escrow release succeeds following full trust & authorization pipeline
    const releaseRes = await EscrowService.releaseToSeller(orderId, 'admin-1');
    assert.strictEqual(releaseRes.success, true);
    assert.strictEqual(releaseRes.alreadyReleased, false);
    assert.strictEqual(releaseRes.escrow.status, ESCROW_STATUS.RELEASED);
    assert.strictEqual(releaseRes.order.status, ORDER_STATUS.SETTLED);
  });

  console.log('\n================================================================');
  console.log(`  EPIC 5 TEST RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEpic5Suite().catch(err => {
  console.error('Epic 5 Suite Fatal Error:', err);
  process.exit(1);
});
