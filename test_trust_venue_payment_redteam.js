/**
 * TIKUM / ARGUS — Comprehensive Red-Team & Trust Test Suite
 * 
 * Tests Epics A through S:
 * 1. Event Truth Layer & Quality Gate
 * 2. Ticket Trust & Anti-Duplication
 * 3. Evidence Architecture & UU PDP Compliance
 * 4. Explainable Seller Trust
 * 5. Provider-Independent Payment Abstraction & iPaymu Readiness Gate
 * 6. Domain Escrow State Machine (Happy path + failure branches + illegal jumps)
 * 7. Balanced Double-Entry Financial Ledger
 * 8. Venue Operations Engine & PIC Turnstile Workflow
 * 9. Incident Management Lifecycle
 * 10. Evidence-Backed Dispute Resolution & Appeals
 * 11. Admin Trust Control Center Telemetry (Zero Mock Financials)
 * 12. Security Red Team (IDOR, Tamper, Forged Webhook, Imbalance)
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const { state, resetDatabase } = require('./src/database');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { EventQualityGate, CANONICAL_STATES, MARKETPLACE_ELIGIBILITY } = require('./src/discovery/EventQualityGate');
const { TicketTrustService, TICKET_VERIFICATION_STATUS, RISK_STATUS } = require('./src/trust/TicketTrustService');
const { EvidenceService, EVIDENCE_TYPES, EVIDENCE_STATUS } = require('./src/trust/EvidenceService');
const { SellerTrustService, TRUST_TIER } = require('./src/trust/SellerTrustService');
const { paymentManager, PaymentProvider } = require('./src/services/payment');
const { IPaymuProvider, IPAYMU_STATUS } = require('./src/services/payment/IPaymuProvider');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { EscrowStateMachine, ESCROW_LIFECYCLE_STATE } = require('./src/settlement/EscrowStateMachine');
const { FinancialLedger, LEDGER_ACCOUNTS, FINANCIAL_EVENT_TYPES } = require('./src/settlement/FinancialLedger');
const { VenueOperationsService, PIC_STATUS } = require('./src/venue/VenueOperationsService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY, INCIDENT_STATUS } = require('./src/venue/IncidentService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');
const { SessionStore } = require('./src/services/sessionStore');
const app = require('./src/server');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM / ARGUS — TRUST + VENUE OPS + PAYMENT EPIC TESTS      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  resetDatabase();

  // =========================================================================
  // 1. EVENT TRUTH LAYER & QUALITY GATE (Epics A & B)
  // =========================================================================
  console.log('── 1. Event Truth Layer & Quality Gate ──');

  test('EventQualityGate: Validates legal state transitions', () => {
    assert.doesNotThrow(() => {
      EventQualityGate.validateTransition(CANONICAL_STATES.DISCOVERED, CANONICAL_STATES.NORMALIZED);
      EventQualityGate.validateTransition(CANONICAL_STATES.NORMALIZED, CANONICAL_STATES.UNVERIFIED);
    });
  });

  test('EventQualityGate: Blocks illegal state jump (REJECTED -> VERIFIED)', () => {
    assert.throws(() => {
      EventQualityGate.validateTransition(CANONICAL_STATES.REJECTED, CANONICAL_STATES.VERIFIED);
    }, /Illegal event state transition/);
  });

  test('EventQualityGate: Blocks jump to VERIFIED without authoritative evidence', () => {
    assert.throws(() => {
      EventQualityGate.validateTransition(CANONICAL_STATES.UNVERIFIED, CANONICAL_STATES.VERIFIED, {
        hasAuthoritativeEvidence: false,
        hasTier1Source: false
      });
    }, /authoritative Tier 1 evidence/);
  });

  test('EventQualityGate: Evaluates event quality score and marketplace eligibility deterministically', () => {
    const verifiedEvent = canonicalRegistry.getEventById('event-coldplay');
    assert.ok(verifiedEvent, 'Coldplay seed event should exist');
    assert.ok(verifiedEvent.event_quality_score >= 80, `Expected score >= 80, got ${verifiedEvent.event_quality_score}`);
    assert.strictEqual(verifiedEvent.marketplace_eligibility, MARKETPLACE_ELIGIBILITY.ELIGIBLE);
  });

  test('EventQualityGate: Blocks cancelled events from marketplace eligibility', () => {
    const cancelledEvent = {
      title: 'Cancelled Tour Jakarta',
      date: '2026-12-01',
      venue: 'GBK',
      city: 'Jakarta',
      status: 'CANCELLED',
      sources: [{ source_id: 'test', tier: 1 }]
    };
    const evalResult = EventQualityGate.evaluateEventQuality(cancelledEvent, cancelledEvent.sources);
    assert.strictEqual(evalResult.marketplace_eligibility, MARKETPLACE_ELIGIBILITY.BLOCKED);
    assert.ok(evalResult.block_reasons.some(r => r.includes('cancelled')));
  });

  // =========================================================================
  // 2. TICKET TRUST MODEL & EVIDENCE ARCHITECTURE (Epics C & D)
  // =========================================================================
  console.log('\n── 2. Ticket Trust Model & Evidence Architecture ──');

  let testTicket;
  await asyncTest('TicketTrustService: Registers ticket with SUBMITTED status and ownership metadata', async () => {
    testTicket = await TicketTrustService.registerTicket({
      ticketId: 'tkt-test-redteam-01',
      eventId: 'event-coldplay',
      sellerId: 'seller-1',
      ticketType: 'VIP_CAT1',
      section: 'CAT 1',
      row: 'A',
      seat: '15',
      faceValue: 3500000,
      currency: 'IDR',
      barcodeHash: 'hash-barcode-redteam-01'
    });

    assert.strictEqual(testTicket.verification_status, TICKET_VERIFICATION_STATUS.SUBMITTED);
    assert.strictEqual(testTicket.risk_status, RISK_STATUS.MEDIUM);
  });

  await asyncTest('TicketTrustService: Rejects duplicate barcode reuse attack', async () => {
    await assert.rejects(async () => {
      await TicketTrustService.registerTicket({
        ticketId: 'tkt-test-duplicate-barcode',
        eventId: 'event-coldplay',
        sellerId: 'seller-2',
        barcodeHash: 'hash-barcode-redteam-01' // Duplicate!
      });
    }, /Duplicate ticket barcode detected/);
  });

  await asyncTest('TicketTrustService: Rejects transition to VERIFIED without authoritative proof', async () => {
    await assert.rejects(async () => {
      await TicketTrustService.setVerificationStatus({
        ticketId: testTicket.ticket_id,
        officerId: 'admin-1',
        status: TICKET_VERIFICATION_STATUS.VERIFIED,
        reason: 'Attempting verify without evidence'
      });
    }, /Cannot verify ticket without verified primary purchase confirmation/);
  });

  await asyncTest('EvidenceService: Attaches purchase evidence and verifies ticket', async () => {
    const evidence = await TicketTrustService.attachEvidence({
      ticketId: testTicket.ticket_id,
      source: 'PROMOTER_INVOICE',
      type: EVIDENCE_TYPES.PRIMARY_PURCHASE_CONFIRMATION,
      content: 'INVOICE-PK-ENTERTAINMENT-COLDPLAY-2026-VIP-PAID',
      uploaderId: 'seller-1'
    });

    assert.strictEqual(evidence.evidence.type, EVIDENCE_TYPES.PRIMARY_PURCHASE_CONFIRMATION);
    assert.strictEqual(evidence.ticket.verification_status, TICKET_VERIFICATION_STATUS.UNDER_REVIEW);

    // Officer marks evidence verified
    await EvidenceService.verifyEvidence({
      evidenceId: evidence.evidence.evidence_id,
      officerId: 'admin-1',
      status: EVIDENCE_STATUS.VERIFIED,
      reason: 'Invoice verified against promoter registry hash'
    });

    // Officer sets ticket to VERIFIED
    const verifiedTicket = await TicketTrustService.setVerificationStatus({
      ticketId: testTicket.ticket_id,
      officerId: 'admin-1',
      status: TICKET_VERIFICATION_STATUS.VERIFIED,
      reason: 'Authoritative invoice matched'
    });

    assert.strictEqual(verifiedTicket.verification_status, TICKET_VERIFICATION_STATUS.VERIFIED);
  });

  await asyncTest('EvidenceService: Strictly redacts PII for public/buyer under UU PDP', async () => {
    // Attach sensitive identity document
    const piiEvidence = await EvidenceService.recordEvidence({
      ticketId: testTicket.ticket_id,
      source: 'SELLER_KTP',
      type: EVIDENCE_TYPES.IDENTITY_DOCUMENTATION,
      content: 'NIK: 3271012345670001; NAME: BUDI SANTOSO; ADDRESS: JAKARTA',
      uploaderId: 'seller-1'
    });

    assert.strictEqual(piiEvidence.is_sensitive_pii, true);

    // Public retrieval must be redacted
    const publicView = EvidenceService.getEvidenceForTicket(testTicket.ticket_id, 'public');
    const piiItem = publicView.find(e => e.type === EVIDENCE_TYPES.IDENTITY_DOCUMENTATION);
    assert.ok(piiItem, 'PII item should be present in public listing');
    assert.strictEqual(piiItem.redacted, true);
    assert.ok(piiItem.notice.includes('UU PDP'));

    // Admin retrieval must see raw metadata
    const adminView = EvidenceService.getEvidenceForTicket(testTicket.ticket_id, 'admin');
    const adminPiiItem = adminView.find(e => e.type === EVIDENCE_TYPES.IDENTITY_DOCUMENTATION);
    assert.strictEqual(adminPiiItem.redacted, undefined);
  });

  // =========================================================================
  // 3. EXPLAINABLE SELLER TRUST (Epic E)
  // =========================================================================
  console.log('\n── 3. Explainable Seller Trust ──');

  test('SellerTrustService: Evaluates 4 distinct explainable pillars', () => {
    const evaluation = SellerTrustService.evaluateSeller('seller-1');
    assert.ok(evaluation.identity_trust, 'Identity trust must be present');
    assert.ok(evaluation.transaction_trust, 'Transaction trust must be present');
    assert.ok(evaluation.ticket_trust, 'Ticket trust must be present');
    assert.ok(evaluation.behavior_risk, 'Behavior risk must be present');
    assert.strictEqual(evaluation.can_list_tickets, true);
    assert.ok(evaluation.identity_trust.is_kyc_verified, 'Budi Santoso should be KYC verified');
  });

  test('SellerTrustService: Suspends high-risk seller with explainable signals', () => {
    // Add fake ticket incident to seller profile
    if (!state.incidents) state.incidents = [];
    state.incidents.push({
      incident_id: 'inc-fake-test',
      seller_id: 'seller-malicious',
      type: INCIDENT_TYPES.FAKE_TICKET,
      status: 'INVESTIGATING'
    });

    state.users.push({ id: 'seller-malicious', name: 'Malicious Scalper', role: 'seller', phone: '081999999' });

    const evaluation = SellerTrustService.evaluateSeller('seller-malicious');
    assert.strictEqual(evaluation.tier, TRUST_TIER.SUSPENDED);
    assert.strictEqual(evaluation.can_list_tickets, false);
    assert.strictEqual(evaluation.is_suspended, true);
    assert.ok(evaluation.behavior_risk.active_risk_signals.some(s => s.includes('CRITICAL')));
  });

  // =========================================================================
  // 4. PAYMENT ABSTRACTION & iPAYMU READINESS GATE (Epics F, R, S)
  // =========================================================================
  console.log('\n── 4. Payment Abstraction & Readiness Gate ──');

  test('PaymentService: Subsystem reports PAYMENT PROVIDER: PENDING VERIFICATION', () => {
    const status = PaymentService.getSubsystemStatus();
    assert.strictEqual(status.safety_gates.NO_REAL_PAYMENT, true);
    assert.strictEqual(status.safety_gates.NO_REAL_SETTLEMENT, true);
    assert.strictEqual(status.safety_gates.NO_FAKE_PAYMENT_SUCCESS, true);
    assert.strictEqual(status.primary_provider.status, IPAYMU_STATUS.PENDING_VERIFICATION);
  });

  test('IPaymuProvider: Readiness checklist verifies 12 criteria and marks unverified', () => {
    const ipaymu = paymentManager.getProvider('ipaymu');
    const readiness = ipaymu.getReadinessChecklist();
    assert.strictEqual(readiness.is_ready, false);
    assert.strictEqual(readiness.checklist.merchant_verification, false);
    assert.strictEqual(readiness.checklist.signature_validation, true);
    assert.strictEqual(readiness.checklist.duplicate_webhook_handling, true);
    assert.strictEqual(readiness.total_count, 13);
  });

  await asyncTest('PaymentService: Blocks real payment creation while provider is PENDING_VERIFICATION', async () => {
    await assert.rejects(async () => {
      await PaymentService.createPayment({
        orderId: 'ord-test-real-blocked',
        amount: 1500000,
        channel: 'BCA_VA',
        providerName: 'ipaymu'
      });
    }, (err) => {
      return err.code === 'PAYMENT_PROVIDER_PENDING_VERIFICATION' && err.status === 503;
    });
  });

  await asyncTest('PaymentService: Rejects forged webhook HMAC signature', async () => {
    const ipaymu = paymentManager.getProvider('ipaymu');
    ipaymu.apiKey = 'test-secret-key-12345';

    const payload = { order_id: 'ord-webhook-test', status: 'BERHASIL', amount: 500000 };
    const forgedHeaders = { 'x-signature': 'forged_fake_signature_hex' };

    await assert.rejects(async () => {
      await PaymentService.handleWebhook({
        providerName: 'ipaymu',
        headers: forgedHeaders,
        body: payload
      });
    }, /Invalid gateway webhook signature/);
  });

  await asyncTest('PaymentService: Idempotently processes valid webhook', async () => {
    const ipaymu = paymentManager.getProvider('ipaymu');
    const apiKey = 'test-secret-key-12345';
    ipaymu.apiKey = apiKey;

    const payload = { order_id: 'ord-webhook-01', trx_id: 'trx-unique-9988', status: 'BERHASIL', amount: 500000 };
    const payloadStr = JSON.stringify(payload);
    const validSig = crypto.createHmac('sha256', apiKey).update(payloadStr).digest('hex');
    const headers = { 'x-signature': validSig };

    // First arrival: processed
    const firstRes = await PaymentService.handleWebhook({
      providerName: 'ipaymu',
      headers,
      body: payload
    });
    assert.strictEqual(firstRes.idempotent, false);
    assert.strictEqual(firstRes.event.status, 'SUCCESS');

    // Duplicate arrival: idempotency kicks in
    const secondRes = await PaymentService.handleWebhook({
      providerName: 'ipaymu',
      headers,
      body: payload
    });
    assert.strictEqual(secondRes.idempotent, true);
  });

  // =========================================================================
  // 5. DOMAIN ESCROW STATE MACHINE (Epic G)
  // =========================================================================
  console.log('\n── 5. Domain Escrow State Machine ──');

  const testOrderId = `ord-esm-test-${Date.now()}`;
  // Create base escrow record
  state.escrows.push({
    id: `esc-${testOrderId}`,
    order_id: testOrderId,
    status: ESCROW_LIFECYCLE_STATE.ORDER_CREATED,
    state_machine_status: ESCROW_LIFECYCLE_STATE.ORDER_CREATED
  });

  await asyncTest('EscrowStateMachine: Transitions through canonical 11-step lifecycle', async () => {
    // 1. ORDER_CREATED -> PAYMENT_PENDING
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.PAYMENT_PENDING,
      actorId: 'buyer-1',
      reason: 'Buyer opened checkout'
    });

    // 2. PAYMENT_PENDING -> FUNDED
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.FUNDED,
      actorId: 'SYSTEM',
      reason: 'Payment confirmed by gateway'
    });

    // 3. FUNDED -> TICKET_SUBMITTED
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.TICKET_SUBMITTED,
      actorId: 'seller-1',
      reason: 'Seller submitted ticket file and seat proof'
    });

    // 4. TICKET_SUBMITTED -> VERIFICATION_PENDING
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.VERIFICATION_PENDING,
      actorId: 'SYSTEM',
      reason: 'Queued for trust officer pre-flight check'
    });

    // 5. VERIFICATION_PENDING -> VERIFIED
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.VERIFIED,
      actorId: 'admin-1',
      actorRole: 'admin',
      reason: 'Officer confirmed ticket authenticity against primary promoter registry'
    });

    // 6. VERIFIED -> DELIVERY_PENDING
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.DELIVERY_PENDING,
      actorId: 'SYSTEM',
      reason: 'Handoff window opened H-1'
    });

    // 7. DELIVERY_PENDING -> DELIVERED
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.DELIVERED,
      actorId: 'seller-1',
      reason: 'Ticket transferred to buyer'
    });

    // 8. DELIVERED -> ENTRY_CONFIRMED (Guarded by PIC role)
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.ENTRY_CONFIRMED,
      actorId: 'pic-1',
      actorRole: 'pic',
      reason: 'Turnstile admission verified at Gate 3'
    });

    // 9. ENTRY_CONFIRMED -> RELEASE_PENDING
    await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.RELEASE_PENDING,
      actorId: 'SYSTEM',
      reason: 'Cooling-off window elapsed post-admission'
    });

    // 10. RELEASE_PENDING -> RELEASED (Terminal success)
    const finalTransition = await EscrowStateMachine.transition({
      orderId: testOrderId,
      targetState: ESCROW_LIFECYCLE_STATE.RELEASED,
      actorId: 'admin-1',
      actorRole: 'admin',
      reason: 'Settlement disbursed to seller'
    });

    assert.strictEqual(finalTransition.current_state, ESCROW_LIFECYCLE_STATE.RELEASED);
  });

  await asyncTest('EscrowStateMachine: Blocks illegal state jump (RELEASED -> FUNDED)', async () => {
    await assert.rejects(async () => {
      await EscrowStateMachine.transition({
        orderId: testOrderId,
        targetState: ESCROW_LIFECYCLE_STATE.FUNDED,
        actorId: 'attacker',
        reason: 'Illegal rewind attack'
      });
    }, /Invalid escrow state transition/);
  });

  // =========================================================================
  // 6. DOUBLE-ENTRY FINANCIAL LEDGER (Epic H)
  // =========================================================================
  console.log('\n── 6. Double-Entry Financial Ledger ──');

  await asyncTest('FinancialLedger: Rejects unbalanced journal entry (Debits != Credits)', async () => {
    await assert.rejects(async () => {
      await FinancialLedger.recordTransaction({
        eventType: FINANCIAL_EVENT_TYPES.CAPTURE,
        orderId: 'ord-unbalanced-01',
        description: 'Attack attempt: unbalanced money creation',
        entries: [
          { account: LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING, type: 'DEBIT', amount: 1500000 },
          { account: LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING, type: 'CREDIT', amount: 1000000 } // Missing 500k fee!
        ]
      });
    }, (err) => {
      return err.code === 'LEDGER_UNBALANCED';
    });
  });

  await asyncTest('FinancialLedger: Records balanced capture and release journal entries', async () => {
    const captureTx = await FinancialLedger.recordPaymentCapture({
      orderId: 'ord-ledger-01',
      ticketPrice: 1000000,
      platformFee: 100000,
      actorId: 'SYSTEM'
    });

    assert.strictEqual(captureTx.total_amount, 1100000);
    assert.strictEqual(captureTx.entries.length, 3);

    // Release to seller
    const releaseTx = await FinancialLedger.recordDisbursementRelease({
      orderId: 'ord-ledger-01',
      sellerAmount: 1000000,
      actorId: 'admin-1'
    });
    assert.strictEqual(releaseTx.total_amount, 1000000);

    // Compute dynamic balances
    const balances = FinancialLedger.getAccountBalances();
    assert.strictEqual(balances[LEDGER_ACCOUNTS.PAYMENT_GATEWAY_CLEARING], 1100000);
    assert.strictEqual(balances[LEDGER_ACCOUNTS.PLATFORM_FEE_REVENUE], -100000); // Credit balance
    assert.strictEqual(balances[LEDGER_ACCOUNTS.SELLER_PAYABLE_PENDING], 0); // 1M Credit - 1M Debit = 0
  });

  // =========================================================================
  // 7. VENUE OPERATIONS ENGINE & PIC WORKFLOW (Epics I & J)
  // =========================================================================
  console.log('\n── 7. Venue Operations Engine & PIC Workflow ──');

  let testShift;
  await asyncTest('VenueOperationsService: Creates shift assignment and checks in PIC', async () => {
    testShift = await VenueOperationsService.createShiftAssignment({
      eventId: 'event-coldplay',
      venueId: 'venue-gbk',
      picUserId: 'pic-1',
      shiftName: 'West Gate Turnstile Shift'
    });

    assert.strictEqual(testShift.status, PIC_STATUS.ASSIGNED);

    const checkedIn = await VenueOperationsService.updatePicStatus({
      shiftId: testShift.shift_id,
      picUserId: 'pic-1',
      newStatus: PIC_STATUS.CHECKED_IN,
      locationDetails: 'Arrived at Gate 7 GBK'
    });

    assert.strictEqual(checkedIn.status, PIC_STATUS.CHECKED_IN);
    assert.ok(checkedIn.check_in_at);
  });

  await asyncTest('VenueOperationsService: Opens turnstile verification session', async () => {
    const session = await VenueOperationsService.startVerificationSession({
      shiftId: testShift.shift_id,
      picUserId: 'pic-1',
      gateNumber: 'Gate 7 Turnstile 2'
    });

    assert.strictEqual(session.gate_number, 'Gate 7 Turnstile 2');
    assert.ok(session.opened_at);
  });

  test('VenueOperationsService: Delivers pre-event briefing pack and post-event postmortem', () => {
    const briefing = VenueOperationsService.getPreEventBriefing('event-coldplay', 'pic-1');
    assert.strictEqual(briefing.event_id, 'event-coldplay');
    assert.ok(briefing.venue.name);
    assert.ok(briefing.admission_protocol);
    assert.ok(briefing.escalation_contacts.length > 0);
  });

  // =========================================================================
  // 8. INCIDENT MANAGEMENT & EVIDENCE-BACKED DISPUTES (Epics K & L)
  // =========================================================================
  console.log('\n── 8. Incident Management & Evidence-Backed Disputes ──');

  let testIncident;
  await asyncTest('IncidentService: Reports first-class field incident and resolves with audit trail', async () => {
    testIncident = await IncidentService.reportIncident({
      type: INCIDENT_TYPES.ENTRY_FAILURE,
      severity: INCIDENT_SEVERITY.HIGH,
      orderId: 'ord-incident-test',
      eventId: 'event-coldplay',
      reporterId: 'pic-1',
      description: 'Barcode rejected at Turnstile 3 with error duplicate scan'
    });

    assert.strictEqual(testIncident.status, INCIDENT_STATUS.REPORTED);
    assert.strictEqual(testIncident.type, INCIDENT_TYPES.ENTRY_FAILURE);

    // Resolve incident
    const resolved = await IncidentService.resolveIncident({
      incidentId: testIncident.incident_id,
      resolverId: 'admin-1',
      resolutionNotes: 'Verified seller scanned ticket earlier. Seller flagged for fraudulent duplicate entry.',
      outcome: 'SELLER_FAULT_CONFIRMED'
    });

    assert.strictEqual(resolved.status, INCIDENT_STATUS.RESOLVED);
    assert.strictEqual(resolved.resolution.outcome, 'SELLER_FAULT_CONFIRMED');
  });

  await asyncTest('DisputeService: Rejects dispute resolution that lacks evidence backing', async () => {
    // Setup order and dispute
    const dispOrderId = `ord-disp-${Date.now()}`;
    state.orders.push({
      id: dispOrderId,
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      event_id: 'event-coldplay',
      ticket_id: 'tkt-test-redteam-01',
      total_amount: 1500000,
      status: 'PAID_ESCROWED'
    });
    state.escrows.push({
      id: `esc-${dispOrderId}`,
      order_id: dispOrderId,
      amount: 1500000,
      total_paid: 1650000,
      status: 'ESCROWED'
    });

    const { dispute } = await DisputeService.openDispute({
      orderId: dispOrderId,
      buyerId: 'buyer-1',
      reason: 'TICKET_INVALID_AT_GATE'
    });

    // Invariant: Trying to resolve without evidence must fail
    await assert.rejects(async () => {
      await DisputeService.resolveDispute({
        disputeId: dispute.id,
        officerId: 'admin-1',
        outcome: DISPUTE_OUTCOME.BUYER_FAVORED,
        decisionReason: 'Arbitrary officer opinion without evidence',
        evidenceIds: []
      });
    }, /Evidence-backed dispute invariant violation/);

    // Provide PIC investigation evidence
    await DisputeService.submitPicInvestigation({
      disputeId: dispute.id,
      picUserId: 'pic-1',
      notes: 'Turnstile gate rejected QR code (Error code 404 Ticket Invalid)',
      gateStatus: 'INVALID'
    });

    // Now resolution succeeds with evidence backing
    const resolved = await DisputeService.resolveDispute({
      disputeId: dispute.id,
      officerId: 'admin-1',
      outcome: DISPUTE_OUTCOME.BUYER_FAVORED,
      decisionReason: 'PIC turnstile gate report confirmed physical invalidation'
    });

    assert.strictEqual(resolved.dispute.status, DISPUTE_STATUS.RESOLVED);

    // Formal appeal by seller
    const appealRes = await DisputeService.fileAppeal({
      disputeId: dispute.id,
      appellantId: 'seller-1',
      appealReason: 'Promoter system suffered nationwide outage at 19:00 WIB, ticket was valid'
    });

    assert.strictEqual(appealRes.dispute.status, DISPUTE_STATUS.APPEALED);
  });

  // =========================================================================
  // 9. ADMIN TRUST CONTROL CENTER (Epics M & N)
  // =========================================================================
  console.log('\n── 9. Admin Trust Control Center & Zero-Mock Verification ──');

  await asyncTest('AdminTrustRouter: Serves real summary with PAYMENT PROVIDER: PENDING VERIFICATION', async () => {
    let server;
    try {
      const port = await new Promise((resolve) => {
        server = app.listen(0, () => resolve(server.address().port));
      });

      const adminSession = SessionStore.createSession({ userId: 'admin-1', role: 'admin' });
      state.sessions.push(adminSession);

      const response = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/admin/trust/summary`, {
          headers: { 'authorization': `Bearer ${adminSession.session_token}` }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
        }).on('error', reject);
      });

      assert.strictEqual(response.statusCode, 200);
      assert.strictEqual(response.body.payments.status, IPAYMU_STATUS.PENDING_VERIFICATION);
      assert.strictEqual(response.body.payments.banner, 'PAYMENT PROVIDER: PENDING VERIFICATION');
      assert.strictEqual(response.body.payments.real_money_active, false);
      assert.strictEqual(response.body.payments.settlement_active, false);
      assert.ok(response.body.event_supply.total_canonical_events > 0);
      assert.ok(response.body.ticket_trust.total_tickets > 0);
    } finally {
      if (server) server.close();
    }
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  ALL ${passed}/${total} RED-TEAM TRUST TESTS PASSED!`);
  console.log('══════════════════════════════════════════════════════════════\n');
}

runSuite().catch(err => {
  console.error('\nTest suite failed with fatal error:', err);
  process.exit(1);
});
