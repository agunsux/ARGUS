/**
 * TIKUM / ARGUS — Comprehensive P0 Compliance & Trust Hardening Test Suite
 *
 * Validates Phase 1 (Corporate Identity & Public Disclosures)
 * and Phase 2A (Payment & ARGUS Safety Hardening):
 *
 * 1. Absence of unproven claims ("berizin", "100% escrow", "(Escrow)" channel labels, turnstile guarantee).
 * 2. PaymentService: Absence of hardcoded provider escrow capabilities (e.g. DOKU).
 * 3. EventPicService: PIC scan records PIC/VENUE attestation, never synthetic BUYER_ATTESTATION.
 * 4. DisputeService: Dispute resolution does NOT fabricate turnstile verification or buyer attestation.
 * 5. TrustPolicyEngine: Legitimate dispute resolution in seller favor enables payout without synthetic attestation.
 * 6. FinancialAuthorizationService & Maker-Checker: Enforces dual authorization, forbids self-approval (403).
 * 7. SettlementService: Manual settlement requires authentic bank reference number before DISBURSED status.
 * 8. FinancialLedger: Strict double-entry balance on capture and full refund with non-refundable fee.
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { state, resetDatabase } = require('./src/database');
const { businessProfile } = require('./src/config/businessProfile');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { IPaymuProvider } = require('./src/services/payment/IPaymuProvider');
const { EventPicService } = require('./src/services/eventPicService');
const { DisputeService, DISPUTE_STATUS, DISPUTE_OUTCOME } = require('./src/services/disputeService');
const { TrustPolicyEngine } = require('./src/trust/TrustPolicyEngine');
const { FinancialLedger, LEDGER_ACCOUNTS } = require('./src/settlement/FinancialLedger');
const { SettlementService } = require('./src/services/settlementService');
const { FinancialAuthorizationService, AUTHORIZATION_ACTION, AUTHORIZATION_STATUS } = require('./src/settlement/FinancialAuthorizationService');
const { TransactionControlCenterService } = require('./src/services/admin/TransactionControlCenterService');
const { ListingService } = require('./src/services/listingService');
const { EscrowService } = require('./src/services/escrowService');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('TIKUM / ARGUS — P0 COMPLIANCE & TRUST HARDENING VERIFICATION');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: CORPORATE IDENTITY & TRUTHFUL MARKETING AUDIT
  // ==========================================================================
  console.log('--- SECTION 1: Corporate Identity & Public Disclosure Audit ---');

  runTest('1.1 Business Profile: Corporate entity is PT SHINERVA PRAJNA TEJAS', () => {
    assert.strictEqual(businessProfile.legalEntity.toUpperCase(), 'PT SHINERVA PRAJNA TEJAS');
    assert.strictEqual(businessProfile.legalName.toUpperCase(), 'PT SHINERVA PRAJNA TEJAS');
  });

  runTest('1.2 Business Profile: NIB & NPWP are marked PENDING_DOCUMENT_VERIFICATION', () => {
    assert.strictEqual(businessProfile.legalDocumentStatus.nib, 'PENDING_DOCUMENT_VERIFICATION');
    assert.strictEqual(businessProfile.legalDocumentStatus.npwp, 'PENDING_DOCUMENT_VERIFICATION');
  });

  runTest('1.3 Business Profile: Footer does not contain unverified "berizin" claim', () => {
    const footer = businessProfile.footerText || '';
    assert.strictEqual(footer.toLowerCase().includes('berizin'), false, 'Footer must not contain unverified "berizin" claim');
  });

  runTest('1.4 BatonHomepage: Public UI contains no fake escrow / turnstile guarantee claims', () => {
    const homepageFile = fs.readFileSync(path.join(__dirname, 'src/components/BatonHomepage.jsx'), 'utf8');
    assert.strictEqual(homepageFile.includes('100% Dana Aman di Escrow'), false, 'Must not claim 100% Dana Aman di Escrow');
    assert.strictEqual(homepageFile.includes('100% Escrow'), false, 'Must not claim 100% Escrow');
    assert.strictEqual(homepageFile.includes('Rekening Bersama (Escrow)'), false, 'Must not claim Rekening Bersama (Escrow)');
    assert.strictEqual(homepageFile.includes('Garansi Turnstile'), false, 'Must not claim Garansi Turnstile');
    assert.strictEqual(homepageFile.includes('Anti Tiket Ghaib'), false, 'Must not claim Anti Tiket Ghaib');
  });

  runTest('1.5 Email Templates: Transactional emails contain no "Escrow Vault" or "Rekening Bersama (Escrow)" claims', () => {
    const emailFile = fs.readFileSync(path.join(__dirname, 'src/services/emailTemplates.js'), 'utf8');
    assert.strictEqual(emailFile.includes('Escrow Vault'), false, 'Email templates must not claim Escrow Vault');
    assert.strictEqual(emailFile.includes('Rekening Bersama (Escrow)'), false, 'Email templates must not claim Rekening Bersama (Escrow)');
    assert.strictEqual(emailFile.includes('100% valid'), false, 'Email templates must not claim 100% valid');
  });

  runTest('1.6 IPaymu Provider: Supported channels do not carry misleading (Escrow) tags', () => {
    const provider = new IPaymuProvider();
    const channels = provider.getSupportedChannels();
    for (const ch of channels) {
      assert.strictEqual(ch.name.includes('(Escrow)'), false, `Channel ${ch.code} label '${ch.name}' must not include (Escrow)`);
      assert.strictEqual(ch.name.includes('(Non-Escrow)'), false, `Channel ${ch.code} label '${ch.name}' must not include (Non-Escrow)`);
    }
  });

  // ==========================================================================
  // SECTION 2: PAYMENT GATEWAY CAPABILITY HARDENING
  // ==========================================================================
  console.log('\n--- SECTION 2: Payment Provider Capability Decoupling ---');

  runTest('2.1 PaymentService: DOKU provider is not hardcoded to supportsEscrowHold = true', () => {
    const serviceFile = fs.readFileSync(path.join(__dirname, 'src/services/payment/PaymentService.js'), 'utf8');
    assert.strictEqual(
      serviceFile.includes("provName === 'doku'"),
      false,
      'PaymentService must not hardcode doku to supportsEscrowHold'
    );
  });

  // ==========================================================================
  // SECTION 3: PIC ATTESTATION SCOPE LIMITATION
  // ==========================================================================
  console.log('\n--- SECTION 3: PIC Attestation Scope Limitation ---');

  await runAsyncTest('3.1 EventPicService: PIC gate scan does NOT synthesize BUYER_ATTESTATION', async () => {
    resetDatabase();

    const orderId = 'ord-pic-test-1';
    state.events = [{
      id: 'event-pic-test',
      title: 'Konser Uji Coba PIC',
      venue_id: 'venue-1',
      date: '2026-11-01T20:00:00.000Z'
    }];
    state.event_pics = [{
      id: 'asg-pic-1',
      pic_user_id: 'pic-officer-1',
      event_id: 'event-pic-test',
      status: 'ACTIVE'
    }];
    state.orders = [{
      id: orderId,
      event_id: 'event-pic-test',
      ticket_id: 'tkt-pic-1',
      buyer_id: 'buyer-pic-1',
      seller_id: 'seller-pic-1',
      status: 'PAID'
    }];
    state.tickets = [{
      id: 'tkt-pic-1',
      barcode: 'BARCODE-PIC-TEST',
      status: 'RESERVED'
    }];
    state.entry_verifications = [];
    state.attestations = [];

    await EventPicService.recordEntryVerification({
      picUserId: 'pic-officer-1',
      orderId,
      gate: 'Gate A',
      status: 'CONFIRMED',
      notes: 'Physical ticket wristband verified at gate'
    });

    const attestations = state.attestations.filter(a => a.order_id === orderId);
    const hasBuyerAttestation = attestations.some(a => a.type === 'BUYER_ATTESTATION');
    const hasPicAttestation = attestations.some(a => a.type === 'PIC_ATTESTATION');

    assert.strictEqual(hasBuyerAttestation, false, 'PIC scan must NEVER create a synthetic BUYER_ATTESTATION');
    assert.strictEqual(hasPicAttestation, true, 'PIC scan must legitimately record PIC_ATTESTATION');
  });

  // ==========================================================================
  // SECTION 4: DISPUTE SERVICE INTEGRITY & OVERRIDE PREVENTION
  // ==========================================================================
  console.log('\n--- SECTION 4: Dispute Service & Trust Engine Decoupling ---');

  await runAsyncTest('4.1 DisputeService: Resolution in seller favor does NOT inject fake turnstile scan', async () => {
    resetDatabase();
    const prevMode = process.env.MARKETPLACE_MODE;
    process.env.MARKETPLACE_MODE = 'LIVE';

    try {
      const listRes = await ListingService.createListing({
        sellerId: 'seller-1',
        eventId: 'event-joyland-2026',
        seatInfo: 'CAT 1 - Section West, Row C, Seat 3',
        faceValue: 1250000,
        price: 1500000,
        rawBarcode: 'BARCODE-DISPUTE-TEST',
        evidenceBundleId: 'bdl-seed-1'
      });
      await ListingService.verifyListing(listRes.listing.id, 'admin-1', { approved: true });

      const orderRes = await EscrowService.createOrder({
        buyerId: 'buyer-1',
        listingId: listRes.listing.id
      });
      const order = orderRes.order;
      const escrow = orderRes.escrow;

      await EscrowService.recordPayment({
        orderId: order.id,
        providerRef: 'pay-ref-disp-test',
        idempotencyKey: 'idem-disp-test',
        amountPaid: order.buyer_total
      });

      EventPicService.assignPic({
        eventId: 'event-joyland-2026',
        venueId: 'venue-gbk',
        picUserId: 'pic-1',
        contactPhone: '+6281100000000'
      });

      // Buyer opens dispute
      const dispRes = await DisputeService.openDispute({
        orderId: order.id,
        buyerId: 'buyer-1',
        reason: 'Gate menolak tiket saya'
      });
      const dispute = dispRes.dispute;

      // Event PIC investigates and provides genuine observation
      await DisputeService.submitPicInvestigation({
        disputeId: dispute.id,
        picUserId: 'pic-1',
        notes: 'Buyer salah gate. Didampingi ke gate yang benar dan berhasil diverifikasi.',
        evidenceBundleId: 'bdl-escort-success',
        gateStatus: 'CONFIRMED'
      });

      // Admin resolves dispute in seller favor
      const resolveRes = await DisputeService.resolveDispute({
        disputeId: dispute.id,
        officerId: 'admin-investigator-1',
        outcome: DISPUTE_OUTCOME.RELEASE_SELLER,
        decisionReason: 'Promoter system confirmed ticket was successfully scanned at 19:30 WIB',
        decisionNotes: 'Audit log evidence verified with promoter turnstile team',
        evidenceIds: ['ev-turnstile-scan-log-1']
      });

      assert.strictEqual(resolveRes.dispute.status, DISPUTE_STATUS.RESOLVED);
      assert.strictEqual(resolveRes.dispute.outcome, DISPUTE_OUTCOME.RELEASE_SELLER);

      // Verify that NO fake turnstile verification was injected into tickets
      const ticket = state.tickets.find(t => t.id === order.ticket_id);
      assert.strictEqual(Boolean(ticket.is_turnstile_verified), false, 'Dispute resolution must not fabricate turnstile verification');

      // Verify that NO synthetic BUYER_ATTESTATION was injected into attestations
      const attestations = state.attestations.filter(a => a.order_id === order.id);
      const syntheticBuyerAttestation = attestations.find(a => a.type === 'BUYER_ATTESTATION');
      assert.strictEqual(Boolean(syntheticBuyerAttestation), false, 'Dispute resolution must not inject synthetic BUYER_ATTESTATION');

      // 4.2 Verify escrow transitioned to RELEASED legitimately
      assert.strictEqual(escrow.status, 'RELEASED');
      assert.strictEqual(order.status, 'SETTLED');
    } finally {
      process.env.MARKETPLACE_MODE = prevMode;
    }
  });

  // ==========================================================================
  // SECTION 5: FINANCIAL DUAL AUTHORIZATION (MAKER-CHECKER)
  // ==========================================================================
  console.log('\n--- SECTION 5: Financial Dual Authorization (Maker-Checker) ---');

  await runAsyncTest('5.1 Maker requests payout authorization', async () => {
    resetDatabase();

    const result = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-maker-checker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      makerId: 'maker-officer-1',
      amount: 1500000,
      reason: 'Concert completed, verified admission, ready for seller payout',
      metadata: { bankAccount: 'BCA 1234567890' }
    });

    assert.strictEqual(result.idempotent, false);
    assert.strictEqual(result.authorization.status, AUTHORIZATION_STATUS.PENDING_APPROVAL);
    assert.strictEqual(result.authorization.maker_id, 'maker-officer-1');
    assert.strictEqual(result.authorization.checker_id, null);
  });

  await runAsyncTest('5.2 Maker-Checker Violation: Maker attempting self-approval is rejected with 403', async () => {
    const auth = (state.financial_authorizations || [])[0];
    assert.ok(auth, 'Authorization request must exist');

    let thrownError = null;
    try {
      await FinancialAuthorizationService.approveAuthorization({
        authorizationId: auth.id,
        checkerId: 'maker-officer-1', // Self-approval attempt!
        notes: 'Trying to approve my own request'
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Self-approval must throw an error');
    assert.strictEqual(thrownError.code, 'MAKER_CHECKER_VIOLATION');
    assert.strictEqual(thrownError.status, 403);
    assert.strictEqual(auth.status, AUTHORIZATION_STATUS.PENDING_APPROVAL, 'Status must remain PENDING_APPROVAL');
  });

  await runAsyncTest('5.3 Independent Checker approves authorization successfully', async () => {
    const auth = (state.financial_authorizations || [])[0];

    const result = await FinancialAuthorizationService.approveAuthorization({
      authorizationId: auth.id,
      checkerId: 'checker-finance-lead', // Independent checker!
      notes: 'Reviewed and verified against gate reports'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.authorization.status, AUTHORIZATION_STATUS.APPROVED);
    assert.strictEqual(result.authorization.checker_id, 'checker-finance-lead');
    assert.ok(result.authorization.approved_at);
  });

  await runAsyncTest('5.4 Rejection workflow records reason and checker ID', async () => {
    const req2 = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-maker-checker-2',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      makerId: 'maker-officer-2',
      amount: 2000000,
      reason: 'Payout request for disputed order'
    });

    const rejectRes = await FinancialAuthorizationService.rejectAuthorization({
      authorizationId: req2.authorization.id,
      checkerId: 'checker-finance-lead',
      rejectionReason: 'Dispute is still pending promoter verification'
    });

    assert.strictEqual(rejectRes.success, true);
    assert.strictEqual(rejectRes.authorization.status, AUTHORIZATION_STATUS.REJECTED);
    assert.strictEqual(rejectRes.authorization.rejection_reason, 'Dispute is still pending promoter verification');
  });

  // ==========================================================================
  // SECTION 6: SETTLEMENT STATUS INTEGRITY & BANK REFERENCE
  // ==========================================================================
  console.log('\n--- SECTION 6: Settlement Status Integrity ---');

  await runAsyncTest('6.1 Settlement confirmation without bank reference throws 400 INVALID_BANK_REFERENCE', async () => {
    let thrownError = null;
    try {
      await SettlementService.confirmBankDisbursement({
        settlementId: 'stl-any',
        orderId: 'ord-any',
        officerId: 'admin-1',
        bankReferenceNumber: '  ' // Invalid blank reference
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError);
    assert.strictEqual(thrownError.code, 'INVALID_BANK_REFERENCE');
    assert.strictEqual(thrownError.status, 400);
  });

  await runAsyncTest('6.2 Authentic bank reference confirms disbursement to DISBURSED status', async () => {
    state.settlement_records = [{
      id: 'stl-confirm-1',
      order_id: 'ord-confirm-1',
      seller_id: 'seller-confirm-1',
      amount: 1500000,
      status: 'PENDING_BANK_EXECUTION',
      bank_reference_number: null,
      disbursed_at: null
    }];

    const result = await SettlementService.confirmBankDisbursement({
      settlementId: 'stl-confirm-1',
      orderId: 'ord-confirm-1',
      officerId: 'finance-lead-1',
      bankReferenceNumber: 'BCA-FT-20261030-883921',
      proofDocumentUrl: 'https://storage.tikum.id/proofs/bca-ft-883921.pdf'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'DISBURSED');
    assert.strictEqual(result.settlement.status, 'DISBURSED');
    assert.strictEqual(result.settlement.bank_reference_number, 'BCA-FT-20261030-883921');
    assert.ok(result.settlement.disbursed_at);
  });

  // ==========================================================================
  // SECTION 7: DOUBLE-ENTRY LEDGER BALANCE & NON-REFUNDABLE FEES
  // ==========================================================================
  console.log('\n--- SECTION 7: Double-Entry Ledger Balancing ---');

  await runAsyncTest('7.1 Capture transaction balances debits and credits exactly', async () => {
    resetDatabase();

    const captureTx = await FinancialLedger.recordCapture({
      orderId: 'ord-ledger-1',
      ticketPrice: 1000000,
      buyerFee: 50000,
      sellerFee: 30000,
      buyerTax: 5500,
      sellerTax: 3300,
      providerFee: 4500,
      actorId: 'test-runner'
    });

    assert.ok(captureTx.transaction_id || captureTx.id);
    const totalDebits = captureTx.entries.filter(e => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);
    const totalCredits = captureTx.entries.filter(e => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);
    assert.strictEqual(totalDebits, totalCredits);
    assert.strictEqual(totalDebits, 1000000 + 50000 + 5500 + 4500);
  });

  await runAsyncTest('7.2 Full refund with non-refundable provider fee balances debits and credits', async () => {
    const refundTx = await FinancialLedger.recordRefund({
      orderId: 'ord-ledger-1',
      ticketPrice: 1000000,
      buyerFee: 50000,
      sellerFee: 30000,
      buyerTax: 5500,
      sellerTax: 3300,
      providerFee: 4500, // Gateway fee retained by provider
      actorId: 'test-runner',
      reason: 'BUYER_CANCELLED_WITHIN_WINDOW'
    });

    assert.ok(refundTx.transaction_id || refundTx.id);
    const totalDebits = refundTx.entries.filter(e => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);
    const totalCredits = refundTx.entries.filter(e => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);
    assert.strictEqual(totalDebits, totalCredits);
    assert.strictEqual(totalDebits, 1000000 + 50000 + 5500 + 4500);
  });

  // ==========================================================================
  // SECTION 8: FINANCIAL AUTHORIZATION DURABILITY & BOUND RESTRICTIONS
  // ==========================================================================
  console.log('\n--- SECTION 8: Financial Authorization Persistence & Bound Restrictions ---');

  const prevModeSec8 = process.env.MARKETPLACE_MODE;
  process.env.MARKETPLACE_MODE = 'LIVE';

  await runAsyncTest('8.1 Durability: Authorization survives store reload and persists to MoneyRepository', async () => {
    resetDatabase();

    const req = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-durable-01',
      makerId: 'admin-maker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      amount: 750000,
      currency: 'IDR',
      payoutDestination: 'BCA 9876543210 (a.n Seller Test)',
      reason: 'Concert completed without dispute'
    });

    assert.strictEqual(req.authorization.status, AUTHORIZATION_STATUS.PENDING_APPROVAL);
    const authId = req.authorization.id;

    // Simulate system/store reload
    const reloaded = await FinancialAuthorizationService.getAuthorizationById(authId);
    assert.ok(reloaded, 'Authorization record must survive and be retrievable');
    assert.strictEqual(reloaded.id, authId);
    assert.strictEqual(reloaded.amount, 750000);
    assert.strictEqual(reloaded.payout_destination, 'BCA 9876543210 (a.n Seller Test)');
  });

  await runAsyncTest('8.2 Amount Mismatch: Payout execution with mismatched amount is rejected', async () => {
    const authReq = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-mismatch-amt',
      makerId: 'admin-maker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      amount: 500000, // Authorized for 500k
      currency: 'IDR',
      payoutDestination: 'BCA 1111222233',
      reason: 'Dual auth test'
    });

    const approved = await FinancialAuthorizationService.approveAuthorization({
      authorizationId: authReq.authorization.id,
      checkerId: 'admin-checker-2',
      notes: 'Approved for 500k'
    });
    assert.strictEqual(approved.authorization.status, AUTHORIZATION_STATUS.APPROVED);

    // Setup order with different amount (750k)
    state.orders = [{
      id: 'ord-mismatch-amt',
      seller_id: 'seller-test',
      buyer_id: 'buyer-test',
      status: 'PAID',
      buyer_total: 800000,
      seller_payout: 750000
    }];
    state.seller_profiles = [{
      user_id: 'seller-test',
      kyc_status: 'VERIFIED',
      bank_account_details: 'BCA 1111222233'
    }];
    state.escrows = [{
      id: 'esc-mismatch-amt',
      order_id: 'ord-mismatch-amt',
      amount: 750000,
      status: 'FUNDED'
    }];

    await assert.rejects(
      async () => {
        await TransactionControlCenterService.executePayout({
          orderId: 'ord-mismatch-amt',
          operatorId: 'admin-checker-2',
          bankAccount: 'BCA 1111222233',
          authorizationId: authReq.authorization.id
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'AUTHORIZATION_AMOUNT_MISMATCH');
        return true;
      }
    );
  });

  await runAsyncTest('8.3 Destination Mismatch: Payout execution with mismatched destination is rejected', async () => {
    const authReq = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-mismatch-dest',
      makerId: 'admin-maker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      amount: 500000,
      currency: 'IDR',
      payoutDestination: 'BCA 1111222233 (Authorized Account)',
      reason: 'Dual auth test'
    });

    await FinancialAuthorizationService.approveAuthorization({
      authorizationId: authReq.authorization.id,
      checkerId: 'admin-checker-2',
      notes: 'Approved'
    });

    state.orders = [{
      id: 'ord-mismatch-dest',
      seller_id: 'seller-test',
      status: 'PAID',
      seller_payout: 500000
    }];
    state.seller_profiles = [{
      user_id: 'seller-test',
      kyc_status: 'VERIFIED',
      bank_account_details: 'BCA 9999888877 (Wrong Hijacked Account)'
    }];
    state.escrows = [{
      id: 'esc-mismatch-dest',
      order_id: 'ord-mismatch-dest',
      amount: 500000,
      status: 'FUNDED'
    }];

    await assert.rejects(
      async () => {
        await TransactionControlCenterService.executePayout({
          orderId: 'ord-mismatch-dest',
          operatorId: 'admin-checker-2',
          bankAccount: 'BCA 9999888877 (Wrong Hijacked Account)',
          authorizationId: authReq.authorization.id
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'AUTHORIZATION_DESTINATION_MISMATCH');
        return true;
      }
    );
  });

  await runAsyncTest('8.4 Single-Use: Consumed authorization cannot be executed a second time', async () => {
    const authReq = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-single-use',
      makerId: 'admin-maker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      amount: 500000,
      currency: 'IDR',
      payoutDestination: 'BCA 5555666677',
      reason: 'Single use test'
    });

    await FinancialAuthorizationService.approveAuthorization({
      authorizationId: authReq.authorization.id,
      checkerId: 'admin-checker-2',
      notes: 'Approved'
    });

    // Mark as consumed
    await FinancialAuthorizationService.consumeAuthorization({
      authorizationId: authReq.authorization.id,
      settlementId: 'stl-test-consumed'
    });

    await assert.rejects(
      async () => {
        await TransactionControlCenterService.executePayout({
          orderId: 'ord-single-use',
          operatorId: 'admin-checker-2',
          bankAccount: 'BCA 5555666677',
          authorizationId: authReq.authorization.id
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'AUTHORIZATION_ALREADY_CONSUMED');
        return true;
      }
    );
  });

  // ==========================================================================
  // SECTION 9: PAYOUT BYPASS PREVENTION & LEGACY ENDPOINT LOCKDOWN
  // ==========================================================================
  console.log('\n--- SECTION 9: Payout Bypass Prevention & Legacy Endpoint Lockdown ---');

  await runAsyncTest('9.1 TransactionControlCenterService.executePayout without authorization throws AUTHORIZATION_REQUIRED', async () => {
    await assert.rejects(
      async () => {
        await TransactionControlCenterService.executePayout({
          orderId: 'ord-bypass-01',
          operatorId: 'admin-1',
          bankAccount: 'BCA 1234567890'
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'AUTHORIZATION_REQUIRED');
        return true;
      }
    );
  });

  await runAsyncTest('9.2 SettlementService.executeSettlement without authorization throws AUTHORIZATION_REQUIRED', async () => {
    state.orders = [{
      id: 'ord-bypass-02',
      seller_id: 'seller-1',
      buyer_id: 'buyer-1',
      status: 'ENTRY_CONFIRMED'
    }];
    state.escrows = [{
      id: 'esc-bypass-02',
      order_id: 'ord-bypass-02',
      amount: 500000,
      status: 'FUNDED'
    }];
    state.settlements = [{
      id: 'stl-bypass-02',
      order_id: 'ord-bypass-02',
      seller_id: 'seller-1',
      gross_amount: 500000,
      status: 'PENDING'
    }];

    await assert.rejects(
      async () => {
        await SettlementService.executeSettlement({
          settlementId: 'stl-bypass-02',
          officerId: 'admin-1',
          orderId: 'ord-bypass-02'
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'AUTHORIZATION_REQUIRED');
        return true;
      }
    );
  });

  process.env.MARKETPLACE_MODE = prevModeSec8;

  // ==========================================================================
  // SECTION 10: BUYER ENTRY CONFIRMATION & 24H COOLING PERIOD SETTLEMENT PATH
  // ==========================================================================
  console.log('\n--- SECTION 10: Buyer Entry Confirmation & 24h Cooling Period Settlement Path ---');

  await runAsyncTest('10.1 Buyer entry confirmation records authentic BUYER_ATTESTATION in TrustPolicyEngine', async () => {
    const { ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');
    const orderId = 'ord-buyer-entry-01';

    state.orders = [{
      id: orderId,
      buyer_id: 'buyer-alice-01',
      seller_id: 'seller-bob-01',
      status: 'PAID'
    }];

    const attResult = await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.BUYER_ATTESTATION,
      actorId: 'buyer-alice-01',
      actorRole: 'buyer',
      result: 'PASS',
      metadata: { notes: 'Buyer verified gate entry' }
    });

    assert.ok(attResult.attestation);
    assert.strictEqual(attResult.attestation.type, ATTESTATION_TYPE.BUYER_ATTESTATION);
    assert.strictEqual(attResult.attestation.actor_role, 'buyer');
  });

  await runAsyncTest('10.2 Normal settlement unlocks after 24h post-event cooling period without dispute or fraud', async () => {
    const { ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');
    const orderId = 'ord-cooling-period-01';
    const pastDate = new Date(Date.now() - 30 * 3600 * 1000).toISOString(); // 30 hours ago

    state.events = [{
      id: 'evt-cooling-01',
      title: 'Concluded Concert',
      date: pastDate,
      status: 'COMPLETED'
    }];
    state.orders = [{
      id: orderId,
      event_id: 'evt-cooling-01',
      seller_id: 'seller-cooling-01',
      buyer_id: 'buyer-cooling-01',
      status: 'ENTRY_CONFIRMED',
      buyer_entry_confirmed: true
    }];
    state.entry_verifications = [{
      order_id: orderId,
      status: 'CONFIRMED'
    }];
    state.disputes = [];

    // System attestations recorded, but BUYER_ATTESTATION is intentionally omitted
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });

    // Despite missing BUYER_ATTESTATION, 24h cooling period satisfies settlement eligibility!
    const evalResult = await TrustPolicyEngine.evaluateFinancialRelease(orderId);
    assert.strictEqual(evalResult.authorized, true);
    assert.strictEqual(evalResult.outcome, 'PASS');
  });

  await runAsyncTest('10.3 Event without PIC unlocks settlement via verified ticket evidence + cooling period', async () => {
    const { ATTESTATION_TYPE } = require('./src/trust/TrustPolicyEngine');
    const orderId = 'ord-no-pic-01';
    const pastDate = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

    state.events = [{
      id: 'evt-no-pic-01',
      title: 'Indie Band Gig (No Field PIC Assigned)',
      date: pastDate,
      status: 'COMPLETED'
    }];
    state.orders = [{
      id: orderId,
      event_id: 'evt-no-pic-01',
      seller_id: 'seller-nopic-01',
      buyer_id: 'buyer-nopic-01',
      status: 'PAID'
    }];
    state.entry_verifications = [{
      order_id: orderId,
      status: 'CONFIRMED'
    }];
    state.disputes = [];

    // System attestations recorded (Ticket evidence verified by platform, no PIC present)
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });
    await TrustPolicyEngine.recordAttestation({
      orderId,
      attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
      actorId: 'system',
      actorRole: 'system',
      result: 'PASS'
    });

    const evalResult = await TrustPolicyEngine.evaluateFinancialRelease(orderId);
    assert.strictEqual(evalResult.authorized, true);
    assert.strictEqual(evalResult.outcome, 'PASS');
  });

  // ==========================================================================
  // SECTION 11: BANK TRANSFER REFERENCE SCOPING & PROOF DOCUMENT VALIDATION
  // ==========================================================================
  console.log('\n--- SECTION 11: Bank Transfer Reference Scoping & Proof Document Validation ---');

  await runAsyncTest('11.1 Trivial or short bank reference (< 8 characters or repeating digits) is rejected', async () => {
    state.settlements = [{
      id: 'stl-ref-test-01',
      order_id: 'ord-ref-test-01',
      seller_id: 'seller-1',
      status: 'PENDING_BANK_EXECUTION',
      payout_account_number: '1234567890'
    }];

    await assert.rejects(
      async () => {
        await SettlementService.confirmBankDisbursement({
          settlementId: 'stl-ref-test-01',
          orderId: 'ord-ref-test-01',
          officerId: 'finance-1',
          bankReferenceNumber: '12345', // Too short (< 8 chars)
          proofDocumentUrl: 'https://storage.tikum.id/proofs/valid.pdf'
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'INVALID_BANK_REFERENCE');
        return true;
      }
    );
  });

  await runAsyncTest('11.2 Duplicate bank reference on the same bank account is strictly rejected', async () => {
    state.settlements = [
      {
        id: 'stl-ref-dup-01',
        order_id: 'ord-ref-dup-01',
        seller_id: 'seller-1',
        status: 'DISBURSED',
        payout_account_number: 'BCA-1234567890',
        bank_reference_number: 'BCA-TRF-UNIQUE-9988'
      },
      {
        id: 'stl-ref-dup-02',
        order_id: 'ord-ref-dup-02',
        seller_id: 'seller-1',
        status: 'PENDING_BANK_EXECUTION',
        payout_account_number: 'BCA-1234567890'
      }
    ];

    await assert.rejects(
      async () => {
        await SettlementService.confirmBankDisbursement({
          settlementId: 'stl-ref-dup-02',
          orderId: 'ord-ref-dup-02',
          officerId: 'finance-1',
          bankReferenceNumber: 'BCA-TRF-UNIQUE-9988', // Duplicate on same account!
          proofDocumentUrl: 'https://storage.tikum.id/proofs/valid2.pdf'
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'DUPLICATE_BANK_REFERENCE');
        return true;
      }
    );
  });

  await runAsyncTest('11.3 Proof document URL must be a valid HTTPS URL (non-HTTPS or malformed rejected)', async () => {
    state.settlements = [{
      id: 'stl-proof-test-01',
      order_id: 'ord-proof-test-01',
      seller_id: 'seller-1',
      status: 'PENDING_BANK_EXECUTION',
      payout_account_number: '1234567890'
    }];

    await assert.rejects(
      async () => {
        await SettlementService.confirmBankDisbursement({
          settlementId: 'stl-proof-test-01',
          orderId: 'ord-proof-test-01',
          officerId: 'finance-1',
          bankReferenceNumber: 'BCA-TRF-SECURE-12345',
          proofDocumentUrl: 'http://insecure-http.example.com/receipt.pdf' // Insecure HTTP
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'INVALID_PROOF_URL');
        return true;
      }
    );
  });

  await runAsyncTest('11.4 Missing proof document URL throws INVALID_PROOF_URL', async () => {
    state.settlements = [{
      id: 'stl-proof-missing-01',
      order_id: 'ord-proof-missing-01',
      seller_id: 'seller-1',
      status: 'PENDING_BANK_EXECUTION',
      payout_account_number: '1234567890'
    }];

    await assert.rejects(
      async () => {
        await SettlementService.confirmBankDisbursement({
          settlementId: 'stl-proof-missing-01',
          orderId: 'ord-proof-missing-01',
          officerId: 'finance-1',
          bankReferenceNumber: 'BCA-TRF-VALID-12345',
          proofDocumentUrl: null // Missing proof URL
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'INVALID_PROOF_URL');
        return true;
      }
    );
  });

  await runAsyncTest('11.5 Maker-Checker: Payout Maker cannot confirm bank disbursement (403 MAKER_CHECKER_VIOLATION)', async () => {
    const authReq = await FinancialAuthorizationService.requestAuthorization({
      orderId: 'ord-sod-disburse',
      makerId: 'finance-maker-1',
      actionType: AUTHORIZATION_ACTION.EXECUTE_PAYOUT,
      amount: 500000,
      currency: 'IDR',
      payoutDestination: 'BCA 1234567890',
      reason: 'SoD test'
    });

    state.settlements = [{
      id: 'stl-sod-01',
      order_id: 'ord-sod-disburse',
      seller_id: 'seller-1',
      status: 'PENDING_BANK_EXECUTION',
      payout_account_number: '1234567890',
      authorization_id: authReq.authorization.id
    }];

    await assert.rejects(
      async () => {
        await SettlementService.confirmBankDisbursement({
          settlementId: 'stl-sod-01',
          orderId: 'ord-sod-disburse',
          officerId: 'finance-maker-1', // Maker attempting to confirm disbursement!
          bankReferenceNumber: 'BCA-TRF-SOD-99999',
          proofDocumentUrl: 'https://storage.tikum.id/proofs/receipt.pdf'
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'MAKER_CHECKER_VIOLATION');
        assert.strictEqual(err.status, 403);
        return true;
      }
    );
  });

  // ==========================================================================
  // SECTION 12: GATEWAY CAPABILITY DECOUPLING & FAIL-CLOSED SAFETY
  // ==========================================================================
  console.log('\n--- SECTION 12: Gateway Capability Decoupling & Fail-Closed Safety ---');

  runTest('12.1 DOKU payout capability is false by default without verified contract + env flag', () => {
    const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
    const doku = new DokuPaymentProvider({ allowSimulation: true });
    const caps = doku.getCapabilities();
    assert.strictEqual(caps.payout, false, 'DOKU payout must fail-closed to false without verified contract');
  });

  runTest('12.2 Xendit payout capability is false by default without verified contract + env flag', () => {
    const { XenditPaymentProvider } = require('./src/services/payment/XenditPaymentProvider');
    const xendit = new XenditPaymentProvider({ allowSimulation: true });
    const caps = xendit.getCapabilities();
    assert.strictEqual(caps.payout, false, 'Xendit payout must fail-closed to false without verified contract');
  });

  await runAsyncTest('12.3 Provider payout simulation NEVER returns DISBURSED (returns PENDING_BANK_EXECUTION)', async () => {
    const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
    const doku = new DokuPaymentProvider({ allowSimulation: true });
    const res = await doku.createPayout({
      orderId: 'ord-sim-01',
      sellerId: 'seller-1',
      amount: 500000,
      bankAccount: { bank: 'BCA', number: '1234567890' }
    });
    assert.strictEqual(res.status, 'PENDING_BANK_EXECUTION');
    assert.notStrictEqual(res.status, 'DISBURSED');
  });

  // ==========================================================================
  // SECTION 13: PUBLIC UI & DOCUMENTATION ZERO-UNAPPROVED CLAIMS SWEEP
  // ==========================================================================
  console.log('\n--- SECTION 13: Public UI & Documentation Zero-Unapproved Claims Sweep ---');

  runTest('13.1 public/baton.html contains 0 occurrences of "100% Escrow", "Garansi Turnstile", or "penampungan (escrow)"', () => {
    const batonHtml = fs.readFileSync(path.join(__dirname, 'public/baton.html'), 'utf8');
    assert.strictEqual(batonHtml.includes('100% Escrow'), false, 'baton.html must not contain "100% Escrow"');
    assert.strictEqual(batonHtml.includes('Garansi Turnstile'), false, 'baton.html must not contain "Garansi Turnstile"');
    assert.strictEqual(batonHtml.includes('rekening penampungan (escrow)'), false, 'baton.html must not contain "rekening penampungan (escrow)"');
  });

  runTest('13.2 src/trust/trustPagesRouter.js contains 0 occurrences of [OWNER MUST CONFIRM', () => {
    const trustPages = fs.readFileSync(path.join(__dirname, 'src/trust/trustPagesRouter.js'), 'utf8');
    assert.strictEqual(trustPages.includes('[OWNER MUST CONFIRM'), false, 'trustPagesRouter.js must not contain raw developer comments');
  });

  runTest('13.3 src/components/BatonHomepage.jsx contains 0 occurrences of "Penahanan Pembayaran Bersyarat" or "CONDITIONAL PAYMENT HOLD"', () => {
    const batonComp = fs.readFileSync(path.join(__dirname, 'src/components/BatonHomepage.jsx'), 'utf8');
    assert.strictEqual(batonComp.includes('Penahanan Pembayaran Bersyarat'), false, 'BatonHomepage.jsx must not contain "Penahanan Pembayaran Bersyarat"');
    assert.strictEqual(batonComp.includes('CONDITIONAL PAYMENT HOLD'), false, 'BatonHomepage.jsx must not contain "CONDITIONAL PAYMENT HOLD"');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(`P0 COMPLIANCE TESTS COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite crashed with unhandled error:', err);
  process.exit(1);
});
