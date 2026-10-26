/**
 * TIKUM / ARGUS — Comprehensive Test Suite:
 * Trusted Secondary Ticket Marketplace, Payment Control, Verified Inventory,
 * H-7 / H-14 Listing Window & Admin Transaction Control Center
 */

const assert = require('assert');
const { state } = require('./src/database');
const { ListingWindowPolicy, WINDOW_TYPE, OPERATIONAL_DISCLAIMER } = require('./src/policy/ListingWindowPolicy');
const { DisputeRefundMatrix, RESOLUTION_CODE, SELLER_ACTION } = require('./src/policy/DisputeRefundMatrix');
const { PayoutEligibilityEvaluator, COLOR_STATUS } = require('./src/services/settlement/PayoutEligibilityEvaluator');
const { TransactionControlCenterService } = require('./src/services/admin/TransactionControlCenterService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('./src/venue/IncidentService');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('================================================================');
  console.log('TIKUM / ARGUS: TRANSACTION CONTROL CENTER & SAFETY SUITE');
  console.log('================================================================\n');

  // ==========================================================================
  // SUITE 1: H-7 / H-14 LISTING WINDOW POLICY & TRUTH-IN-ADVERTISING
  // ==========================================================================
  console.log('--- 1. Listing Window Policy (H-7 / H-14 & Truth-in-Advertising) ---');

  runTest('Listing Window: rejects concluded / expired events with EVENT_CONCLUDED', () => {
    const expiredEvent = {
      id: 'event-concluded-1',
      title: 'Konser Nostalgia 2024',
      date: '2024-01-01',
      event_start_at: '2024-01-01T19:00:00+07:00',
      event_end_at: '2024-01-01T23:00:00+07:00',
      status: 'COMPLETED'
    };
    const res = ListingWindowPolicy.evaluateListingWindow({
      event: expiredEvent,
      now: new Date('2026-10-26T10:00:00+07:00')
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'EVENT_CONCLUDED');
    assert.ok(res.operationalDisclaimer.includes('bukan jaminan escrow perbankan pihak ketiga'));
  });

  runTest('Listing Window: event 30 days away is rejected under standard H-7 window', () => {
    const futureEvent = {
      id: 'event-future-30',
      title: 'Konser Megah 2026',
      date: '2026-11-26',
      event_start_at: '2026-11-26T19:00:00+07:00',
      event_end_at: '2026-11-26T23:00:00+07:00',
      status: 'UPCOMING'
    };
    const res = ListingWindowPolicy.evaluateListingWindow({
      event: futureEvent,
      isPilotVerified: false,
      now: new Date('2026-10-26T10:00:00+07:00')
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'LISTING_WINDOW_NOT_OPEN');
    assert.strictEqual(res.windowType, WINDOW_TYPE.H7_STANDARD);
    assert.strictEqual(res.windowDays, 7);
    assert.ok(res.remainingMs > 0);
    assert.ok(res.daysRemaining > 0);
  });

  runTest('Listing Window: event 10 days away is rejected under standard H-7, but allowed under H-14 pilot', () => {
    const event10Days = {
      id: 'event-future-10',
      title: 'Konser Java Jazz Pilot 2026',
      date: '2026-11-05',
      event_start_at: '2026-11-05T19:00:00+07:00',
      event_end_at: '2026-11-05T23:00:00+07:00',
      is_pilot: true,
      status: 'UPCOMING'
    };
    const now = new Date('2026-10-26T19:00:00+07:00'); // Exactly 10 days before

    // 1. Standard seller (no pilot) -> Rejected
    const stdRes = ListingWindowPolicy.evaluateListingWindow({
      event: { ...event10Days, is_pilot: false },
      isPilotVerified: false,
      now
    });
    assert.strictEqual(stdRes.allowed, false);
    assert.strictEqual(stdRes.code, 'LISTING_WINDOW_NOT_OPEN');
    assert.strictEqual(stdRes.windowType, WINDOW_TYPE.H7_STANDARD);

    // 2. Pilot verified seller/event -> Allowed under H-14
    const pilotRes = ListingWindowPolicy.evaluateListingWindow({
      event: event10Days,
      isPilotVerified: true,
      now
    });
    assert.strictEqual(pilotRes.allowed, true);
    assert.strictEqual(pilotRes.windowType, WINDOW_TYPE.H14_PILOT);
    assert.strictEqual(pilotRes.windowDays, 14);
  });

  runTest('Listing Window: event 4 days away is allowed under standard H-7 window', () => {
    const event4Days = {
      id: 'event-future-4',
      title: 'Konser Sheila on 7 2026',
      date: '2026-10-30',
      event_start_at: '2026-10-30T19:00:00+07:00',
      event_end_at: '2026-10-30T23:00:00+07:00',
      status: 'UPCOMING'
    };
    const now = new Date('2026-10-26T10:00:00+07:00');
    const res = ListingWindowPolicy.evaluateListingWindow({
      event: event4Days,
      isPilotVerified: false,
      now
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.windowType, WINDOW_TYPE.H7_STANDARD);
  });

  runTest('Listing Window: event already started rejects new listings with EVENT_ALREADY_STARTED', () => {
    const startedEvent = {
      id: 'event-live-now',
      title: 'Konser Sedang Berlangsung',
      date: '2026-10-26',
      event_start_at: '2026-10-26T14:00:00+07:00',
      event_end_at: '2026-10-26T22:00:00+07:00',
      status: 'LIVE'
    };
    const now = new Date('2026-10-26T16:00:00+07:00'); // 2 hours after start
    const res = ListingWindowPolicy.evaluateListingWindow({
      event: startedEvent,
      now
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'EVENT_ALREADY_STARTED');
  });

  // ==========================================================================
  // SUITE 2: DISPUTE & REFUND MATRIX
  // ==========================================================================
  console.log('\n--- 2. Dispute, Refund & Liability Matrix ---');

  runTest('Dispute Matrix: Promoter cancellation resolves to 100% buyer refund and 0 seller payout', () => {
    const policy = DisputeRefundMatrix.getPolicy('PROMOTER_CANCELLED');
    assert.strictEqual(policy.buyerOutcome, RESOLUTION_CODE.FULL_REFUND_BUYER);
    assert.strictEqual(policy.buyerRefundPercentage, 100);
    assert.strictEqual(policy.sellerAction, SELLER_ACTION.NO_PAYOUT);
    assert.strictEqual(policy.sellerPayoutPercentage, 0);
  });

  runTest('Dispute Matrix: Fake ticket resolves to 100% buyer refund and seller penalty', () => {
    const policy = DisputeRefundMatrix.getPolicy('FAKE_TICKET');
    assert.strictEqual(policy.buyerOutcome, RESOLUTION_CODE.FULL_REFUND_BUYER);
    assert.strictEqual(policy.buyerRefundPercentage, 100);
    assert.strictEqual(policy.sellerAction, SELLER_ACTION.PENALTY_AND_SUSPEND);
  });

  runTest('Dispute Matrix: Buyer no-show resolves to full seller payout and 0 buyer refund', () => {
    const policy = DisputeRefundMatrix.getPolicy('BUYER_NO_SHOW');
    assert.strictEqual(policy.buyerOutcome, RESOLUTION_CODE.FULL_PAYOUT_SELLER);
    assert.strictEqual(policy.buyerRefundPercentage, 0);
    assert.strictEqual(policy.sellerPayoutPercentage, 100);
    assert.strictEqual(policy.platformFeeRefunded, false);
  });

  // ==========================================================================
  // SUITE 3: PAYOUT ELIGIBILITY EVALUATOR (RED, YELLOW, GREEN, PAID_OUT)
  // ==========================================================================
  console.log('\n--- 3. Payout Eligibility Evaluator (Four Triage States) ---');

  runTest('Evaluator: Order with unconfirmed payment evaluates to YELLOW (In Progress)', () => {
    const order = {
      id: 'ord-yellow-1',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAYMENT_PENDING',
      buyer_total: 1500000,
      seller_payout: 1350000
    };
    const res = PayoutEligibilityEvaluator.evaluate({ order });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.YELLOW);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.evaluationReasons.some(r => r.includes('Payment pending')));
  });

  runTest('Evaluator: Order with payment confirmed but unverified seller KYC evaluates to YELLOW', () => {
    const order = {
      id: 'ord-yellow-2',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAID',
      buyer_total: 1000000,
      seller_payout: 900000
    };
    const sellerProfile = {
      user_id: 'seller-1',
      kyc_status: 'PENDING_REVIEW'
    };
    const res = PayoutEligibilityEvaluator.evaluate({ order, sellerProfile });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.YELLOW);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.evaluationReasons.some(r => r.includes('Seller KYC is not yet verified')));
  });

  runTest('Evaluator: Active dispute immediately forces transaction into RED (Hold)', () => {
    const order = {
      id: 'ord-red-dispute',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAID',
      buyer_total: 1000000,
      seller_payout: 900000
    };
    const sellerProfile = { user_id: 'seller-1', kyc_status: 'VERIFIED' };
    const disputes = [{
      id: 'dsp-1',
      order_id: 'ord-red-dispute',
      status: 'OPEN',
      reason: 'DUPLICATE_BARCODE',
      claim_details: 'Barcode already scanned at gate'
    }];
    const res = PayoutEligibilityEvaluator.evaluate({ order, sellerProfile, disputes });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.RED);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.blockingIssues.includes('ACTIVE_DISPUTE'));
  });

  runTest('Evaluator: Unresolved field incident forces transaction into RED (Hold)', () => {
    const order = {
      id: 'ord-red-incident',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAID',
      buyer_total: 1000000,
      seller_payout: 900000
    };
    const sellerProfile = { user_id: 'seller-1', kyc_status: 'VERIFIED' };
    const incidents = [{
      id: 'inc-1',
      order_id: 'ord-red-incident',
      type: 'FAKE_TICKET',
      status: 'REPORTED',
      description: 'Physical wristband counterfeit suspected by venue security'
    }];
    const res = PayoutEligibilityEvaluator.evaluate({ order, sellerProfile, incidents });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.RED);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.blockingIssues.includes('INCIDENT_FAKE_TICKET'));
  });

  runTest('Evaluator: Administrative hold forces transaction into RED (Hold)', () => {
    const order = {
      id: 'ord-red-hold',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAID',
      admin_hold: true,
      hold_reason: 'High velocity account flagged for manual review'
    };
    const sellerProfile = { user_id: 'seller-1', kyc_status: 'VERIFIED' };
    const res = PayoutEligibilityEvaluator.evaluate({ order, sellerProfile });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.RED);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.blockingIssues.includes('ADMIN_HOLD_ACTIVE'));
  });

  runTest('Evaluator: Suspended seller account forces transaction into RED (Hold)', () => {
    const order = {
      id: 'ord-red-seller-susp',
      buyer_id: 'buyer-1',
      seller_id: 'seller-bad',
      status: 'PAID'
    };
    const sellerProfile = { user_id: 'seller-bad', kyc_status: 'SUSPENDED', suspended: true };
    const res = PayoutEligibilityEvaluator.evaluate({ order, sellerProfile });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.RED);
    assert.strictEqual(res.payoutEligible, false);
    assert.ok(res.blockingIssues.includes('SELLER_SUSPENDED'));
  });

  runTest('Evaluator: All criteria met simultaneously evaluates to GREEN (Ready for Payout)', () => {
    const order = {
      id: 'ord-green-ready',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'PAID',
      buyer_total: 2000000,
      seller_payout: 1800000
    };
    const escrow = {
      id: 'esc-green',
      order_id: 'ord-green-ready',
      amount: 1800000,
      status: 'FUNDED',
      funded_at: '2026-10-25T10:00:00Z'
    };
    const ticket = {
      id: 'tkt-green',
      status: 'TRANSFERRED',
      transferred_at: '2026-10-25T11:00:00Z'
    };
    const sellerProfile = {
      user_id: 'seller-1',
      kyc_status: 'VERIFIED'
    };
    const entryVerification = {
      id: 'ent-green',
      order_id: 'ord-green-ready',
      status: 'CONFIRMED',
      gate: 'VIP Gate 2'
    };

    const res = PayoutEligibilityEvaluator.evaluate({
      order,
      escrow,
      ticket,
      sellerProfile,
      entryVerification,
      disputes: [],
      incidents: []
    });

    assert.strictEqual(res.colorStatus, COLOR_STATUS.GREEN);
    assert.strictEqual(res.badgeLabel, 'Ready for Payout');
    assert.strictEqual(res.payoutEligible, true);
    assert.strictEqual(res.isPaidOut, false);
    assert.strictEqual(res.grossAmount, 2000000);
    assert.strictEqual(res.netSellerPayout, 1800000);
    assert.strictEqual(res.platformFee, 200000);
  });

  runTest('Evaluator: Executed settlement evaluates to PAID_OUT (Terminal State)', () => {
    const order = {
      id: 'ord-paid-out',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      status: 'SETTLED',
      buyer_total: 1000000,
      seller_payout: 900000
    };
    const settlement = {
      id: 'stl-1',
      order_id: 'ord-paid-out',
      amount: 900000,
      status: 'EXECUTED',
      payout_ref: 'bca-disburse-998811',
      executed_at: '2026-10-25T12:00:00Z'
    };

    const res = PayoutEligibilityEvaluator.evaluate({ order, settlement });
    assert.strictEqual(res.colorStatus, COLOR_STATUS.PAID_OUT);
    assert.strictEqual(res.badgeLabel, 'Paid Out');
    assert.strictEqual(res.payoutEligible, false);
    assert.strictEqual(res.isPaidOut, true);
    assert.strictEqual(res.payoutReference, 'bca-disburse-998811');
  });

  // ==========================================================================
  // SUITE 4: TRANSACTION CONTROL CENTER SERVICE & AUDIT TIMELINE
  // ==========================================================================
  console.log('\n--- 4. Transaction Control Center Service & Timeline ---');

  await runAsyncTest('TCC Service: Retrieves paginated transactions and truthful aggregates', async () => {
    // Populate isolated test fixtures
    state.orders = [
      { id: 'tcc-ord-1', buyer_id: 'u-b1', seller_id: 'u-s1', status: 'PAYMENT_PENDING', buyer_total: 500000, seller_payout: 450000 },
      { id: 'tcc-ord-2', buyer_id: 'u-b2', seller_id: 'u-s2', status: 'PAID', buyer_total: 1000000, seller_payout: 900000, admin_hold: true, hold_reason: 'Fraud check' },
      { id: 'tcc-ord-3', ticket_id: 'tkt-tcc-3', buyer_id: 'u-b3', seller_id: 'u-s3', status: 'PAID', buyer_total: 1500000, seller_payout: 1350000 }
    ];
    state.users = [
      { id: 'u-b1', name: 'Buyer Satu', email: 'b1@tikum.id', role: 'BUYER' },
      { id: 'u-s1', name: 'Seller Satu', email: 's1@tikum.id', role: 'SELLER' },
      { id: 'u-b2', name: 'Buyer Dua', email: 'b2@tikum.id', role: 'BUYER' },
      { id: 'u-s2', name: 'Seller Dua', email: 's2@tikum.id', role: 'SELLER' },
      { id: 'u-b3', name: 'Buyer Tiga', email: 'b3@tikum.id', role: 'BUYER' },
      { id: 'u-s3', name: 'Seller Tiga', email: 's3@tikum.id', role: 'SELLER' },
      { id: 'finance-officer-1', name: 'Finance Lead', email: 'finance@tikum.id', role: 'FINANCE' }
    ];
    state.seller_profiles = [
      { user_id: 'u-s1', kyc_status: 'UNVERIFIED' },
      { user_id: 'u-s2', kyc_status: 'VERIFIED' },
      { user_id: 'u-s3', kyc_status: 'VERIFIED' }
    ];
    state.tickets = [
      { id: 'tkt-tcc-3', ticket_id: 'tkt-tcc-3', status: 'TRANSFERRED', seller_id: 'u-s3' }
    ];
    state.entry_verifications = [
      { order_id: 'tcc-ord-3', status: 'CONFIRMED', gate: 'Gate A', pic_id: 'pic-officer-1' }
    ];
    state.escrows = [
      { id: 'esc-tcc-3', order_id: 'tcc-ord-3', amount: 1350000, status: 'FUNDED', funded_at: '2026-10-25T10:00:00Z' }
    ];
    state.settlements = [];
    state.disputes = [];
    state.incidents = [];

    const overview = await TransactionControlCenterService.getControlCenterOverview({ page: 1, limit: 10 });
    assert.strictEqual(overview.summary.total_transactions, 3);
    assert.strictEqual(overview.summary.count_red, 1); // ord-2 (admin hold)
    assert.strictEqual(overview.summary.count_yellow, 1); // ord-1 (payment pending)
    assert.strictEqual(overview.summary.count_green, 1); // ord-3 (all verified)
    assert.strictEqual(overview.summary.count_paid_out, 0);

    assert.strictEqual(overview.transactions.length, 3);
  });

  await runAsyncTest('TCC Service: Chronological timeline unifies order, payment, ticket, and gate entry', async () => {
    const timelineData = await TransactionControlCenterService.getTransactionTimeline('tcc-ord-3');
    assert.strictEqual(timelineData.orderId, 'tcc-ord-3');
    assert.strictEqual(timelineData.currentEvaluation.colorStatus, COLOR_STATUS.GREEN);
    assert.ok(timelineData.timeline.length >= 2);

    const categories = timelineData.timeline.map(t => t.category);
    assert.ok(categories.includes('ORDER'));
    assert.ok(categories.includes('VENUE_ENTRY'));
  });

  await runAsyncTest('TCC Service: Placing admin hold forces order immediately to RED', async () => {
    const holdRes = await TransactionControlCenterService.placeAdminHold({
      orderId: 'tcc-ord-3',
      reason: 'Suspected chargeback inquiry from bank',
      operatorId: 'admin-ops-1'
    });
    assert.strictEqual(holdRes.success, true);
    assert.strictEqual(holdRes.evaluation.colorStatus, COLOR_STATUS.RED);

    // Releasing hold restores GREEN status
    const releaseRes = await TransactionControlCenterService.releaseAdminHold({
      orderId: 'tcc-ord-3',
      reason: 'Bank inquiry cleared, legitimate transaction',
      operatorId: 'admin-ops-1'
    });
    assert.strictEqual(releaseRes.success, true);
    assert.strictEqual(releaseRes.evaluation.colorStatus, COLOR_STATUS.GREEN);
  });

  await runAsyncTest('TCC Service: Payout execution fails if order is NOT GREEN', async () => {
    let thrownError = null;
    try {
      await TransactionControlCenterService.executePayout({
        orderId: 'tcc-ord-1', // ord-1 is YELLOW
        operatorId: 'finance-officer-1'
      });
    } catch (err) {
      thrownError = err;
    }
    assert.ok(thrownError);
    assert.strictEqual(thrownError.code, 'PAYOUT_NOT_ELIGIBLE');
    assert.strictEqual(thrownError.colorStatus, COLOR_STATUS.YELLOW);
  });

  await runAsyncTest('TCC Service: Payout execution succeeds on GREEN and prevents double payout', async () => {
    const payoutRes = await TransactionControlCenterService.executePayout({
      orderId: 'tcc-ord-3', // ord-3 is GREEN
      operatorId: 'finance-officer-1',
      idempotencyKey: 'idemp-tcc-ord-3-test-1',
      bankAccount: 'BCA 9876543210 (a.n Seller Tiga)'
    });
    assert.strictEqual(payoutRes.success, true);
    assert.strictEqual(payoutRes.evaluation.colorStatus, COLOR_STATUS.PAID_OUT);
    assert.ok(payoutRes.settlement.payout_ref);

    // Second execution is blocked because order is already in terminal PAID_OUT status
    let duplicateBlocked = false;
    try {
      await TransactionControlCenterService.executePayout({
        orderId: 'tcc-ord-3',
        operatorId: 'finance-officer-1',
        idempotencyKey: 'idemp-tcc-ord-3-test-1'
      });
    } catch (err) {
      if (err.code === 'PAYOUT_NOT_ELIGIBLE' && err.colorStatus === COLOR_STATUS.PAID_OUT) {
        duplicateBlocked = true;
      }
    }
    assert.strictEqual(duplicateBlocked, true);
  });

  // ==========================================================================
  // SUITE 5: VENUE PIC INCIDENT REPORTING & AUTOMATIC ESCALATION
  // ==========================================================================
  console.log('\n--- 5. Venue PIC Incident Reporting & Escalation ---');

  await runAsyncTest('Venue Incident: Reporting FAKE_TICKET escalates to RED and prevents payout', async () => {
    // Create new order in GREEN state
    state.orders.push({
      id: 'ord-pic-incident-test',
      buyer_id: 'u-b1',
      seller_id: 'u-s2',
      status: 'PAID',
      buyer_total: 1200000,
      seller_payout: 1080000
    });
    state.tickets.push({
      id: 'tkt-pic-test',
      ticket_id: 'tkt-pic-test',
      status: 'TRANSFERRED',
      seller_id: 'u-s2'
    });

    // Before incident: check status
    const preIncidentData = await TransactionControlCenterService.getTransactionTimeline('ord-pic-incident-test');
    assert.strictEqual(preIncidentData.currentEvaluation.factors.hasIncidents, false);

    // PIC reports incident
    await IncidentService.reportIncident({
      type: INCIDENT_TYPES.FAKE_TICKET,
      severity: INCIDENT_SEVERITY.HIGH,
      orderId: 'ord-pic-incident-test',
      eventId: 'event-pic-test',
      reporterId: 'pic-gate-officer-1',
      reporterRole: 'venue_pic',
      description: 'Physical badge does not match hologram spec'
    });

    // After incident: Transaction triage must be RED
    const postIncidentData = await TransactionControlCenterService.getTransactionTimeline('ord-pic-incident-test');
    assert.strictEqual(postIncidentData.currentEvaluation.colorStatus, COLOR_STATUS.RED);
    assert.strictEqual(postIncidentData.currentEvaluation.payoutEligible, false);
    assert.ok(postIncidentData.currentEvaluation.blockingIssues.includes('INCIDENT_FAKE_TICKET'));

    // Payout attempt MUST fail
    let payoutErr = null;
    try {
      await TransactionControlCenterService.executePayout({
        orderId: 'ord-pic-incident-test',
        operatorId: 'finance-officer-1'
      });
    } catch (err) {
      payoutErr = err;
    }
    assert.ok(payoutErr);
    assert.strictEqual(payoutErr.code, 'PAYOUT_NOT_ELIGIBLE');
  });

  console.log('\n================================================================');
  console.log(`ALL TESTS FINISHED: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
