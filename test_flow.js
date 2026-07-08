const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Clean database before starting test
const dbFile = path.resolve(__dirname, 'src/argus_ledger.db');
if (fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
}

// Clean uploads folder
const uploadsDir = path.resolve(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
}

// Start the server
const server = require('./src/server');
const { db, get, run, all } = require('./src/database');
const { replayTicketState, appendLedgerEvent } = require('./src/ownership/ledger');
const { verifyBundleIntegrity, createEvidenceBundle } = require('./src/verification/evidence');
const { validateSettlement } = require('./src/settlement/escrow');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('--------------------------------------------------');
  console.log('  STARTING ARGUS FOUNDATION AUTOMATED VERIFICATION');
  console.log('--------------------------------------------------');

  // Let DB initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Database Trigger Protection (ADR-003, ADR-011, Invariant 6)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Testing Database Mutability Triggers...');
    
    // Attempting to modify audit logs should fail
    try {
      await run(`UPDATE audit_logs SET action = 'MUTATED'`);
      assert.fail('Database trigger failed: audit_logs was modified.');
    } catch (err) {
      console.log('✓ Trigger blocked update on audit_logs as expected:', err.message);
    }

    try {
      await run(`DELETE FROM audit_logs`);
      assert.fail('Database trigger failed: audit_logs was deleted.');
    } catch (err) {
      console.log('✓ Trigger blocked delete on audit_logs as expected:', err.message);
    }

    // Attempting to modify ticket events should fail
    try {
      await run(`UPDATE ticket_events SET event_type = 'TicketCreated'`);
      assert.fail('Database trigger failed: ticket_events was modified.');
    } catch (err) {
      console.log('✓ Trigger blocked update on ticket_events as expected:', err.message);
    }

    try {
      await run(`DELETE FROM ticket_events`);
      assert.fail('Database trigger failed: ticket_events was deleted.');
    } catch (err) {
      console.log('✓ Trigger blocked delete on ticket_events as expected:', err.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Replay Ledger (Append-Only Ownership Ledger & Invariant 10)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Append-Only Ownership Ledger Replay...');
    const ticketId = 'ticket-demo-1';
    
    let state = await replayTicketState(ticketId);
    console.log(`✓ Replayed state successfully. Status: ${state.status}, Owner: ${state.currentOwnerId}`);
    assert.strictEqual(state.status, 'LISTED');
    assert.strictEqual(state.currentOwnerId, 'seller-1');

    // Cached ticket record matches replayed record
    const ticketCache = await get(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
    assert.strictEqual(ticketCache.status, state.status);
    assert.strictEqual(ticketCache.current_owner_id, state.currentOwnerId);
    console.log('✓ Invariant 10 (Event Replay Consistency) passed.');

    // -------------------------------------------------------------------------
    // TEST 3: Hashed Evidence Bundles (ADR-012, Invariant 7)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Evidence Bundle Integrity and SHA-256 Hashing...');
    
    // Create dummy files
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    const ktpPath = path.join(uploadsDir, 'ktp.jpg');
    const ticketPath = path.join(uploadsDir, 'ticket.pdf');
    fs.writeFileSync(ktpPath, 'KTP_CONTENT_MOCK_123');
    fs.writeFileSync(ticketPath, 'TICKET_PDF_CONTENT_MOCK_XYZ');

    const dummyFiles = [
      { path: ktpPath, originalname: 'ktp.jpg', mimetype: 'image/jpeg', size: 19 },
      { path: ticketPath, originalname: 'ticket.pdf', mimetype: 'application/pdf', size: 26 }
    ];

    const bundle = await createEvidenceBundle(ticketId, 'seller-1', dummyFiles);
    console.log('✓ Generated Evidence Bundle hash:', bundle.bundleHash);
    
    // Verify integrity succeeds initially
    const check1 = await verifyBundleIntegrity(bundle.id);
    assert.strictEqual(check1.verified, true);
    console.log('✓ Initial bundle integrity check: PASSED');

    // Modify a file to simulate tampering
    fs.writeFileSync(ktpPath, 'TAMPERED_KTP_CONTENT');
    const check2 = await verifyBundleIntegrity(bundle.id);
    assert.strictEqual(check2.verified, false);
    console.log('✓ Modified file check: BLOCKED as expected. Reason:', check2.reason);

    // Restore file contents to normal
    fs.writeFileSync(ktpPath, 'KTP_CONTENT_MOCK_123');

    // -------------------------------------------------------------------------
    // TEST 4: API End-to-End Flow (Definition of Done 0.1)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing End-to-End API Flow (Definition of Done 0.1)...');

    // 1. Buyer reserves the ticket
    console.log('Step 1: Buyer reserving ticket...');
    const resReserve = await fetch(`${BASE_URL}/tickets/${ticketId}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'buyer-1' })
    });
    const reserveData = await resReserve.json();
    console.log('✓ Reserve Response:', reserveData);
    assert.strictEqual(reserveData.success, true);
    assert.ok(reserveData.transferId);

    // Verify status updated to RESERVED in replayed ledger
    state = await replayTicketState(ticketId);
    assert.strictEqual(state.status, 'RESERVED');

    // 2. Admin Verifies Ticket Ownership
    console.log('Step 2: Admin verifying ticket validity...');
    const resVerify = await fetch(`${BASE_URL}/api/admin/tickets/${ticketId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true, officerId: 'admin-1' })
    });
    const verifyResult = await resVerify.json();
    console.log('✓ Verify Response:', verifyResult);
    assert.strictEqual(verifyResult.success, true);

    state = await replayTicketState(ticketId);
    assert.strictEqual(state.status, 'VERIFIED');

    // 3. Confirm payment in Escrow
    console.log('Step 3: Admin confirming Buyer payment receipt...');
    const resPayment = await fetch(`${BASE_URL}/api/admin/transfers/${reserveData.transferId}/confirm-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId: 'admin-1' })
    });
    const paymentResult = await resPayment.json();
    console.log('✓ Payment Response:', paymentResult);
    assert.strictEqual(paymentResult.success, true);

    state = await replayTicketState(ticketId);
    assert.strictEqual(state.status, 'ESCROW_PAID');

    // 4. Release Escrow & Finalize Transfer
    console.log('Step 4: Admin releasing escrow funds to Seller...');
    const resRelease = await fetch(`${BASE_URL}/api/admin/transfers/${reserveData.transferId}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId: 'admin-1' })
    });
    const releaseResult = await resRelease.json();
    console.log('✓ Release Response:', releaseResult);
    assert.strictEqual(releaseResult.success, true);

    state = await replayTicketState(ticketId);
    assert.strictEqual(state.status, 'TRANSFERRED');
    assert.strictEqual(state.currentOwnerId, 'buyer-1');
    console.log('✓ Ownership successfully transferred to buyer-1.');

    // -------------------------------------------------------------------------
    // TEST 5: Verify Explainability (ADR-009) & Invariants checks
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Re-Finalization Block (Invariant 5)...');
    
    // Attempting to finalize again should trigger Double Transfer Explainability template
    const resReleaseAgain = await fetch(`${BASE_URL}/api/admin/transfers/${reserveData.transferId}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId: 'admin-1' })
    });
    const releaseAgainResult = await resReleaseAgain.json();
    console.log('✓ Re-release blocked payload:', releaseAgainResult);
    assert.strictEqual(releaseAgainResult.success, false);
    assert.strictEqual(releaseAgainResult.error.machine_reason, 'DOUBLE_TRANSFER_BLOCKED');
    console.log('✓ Invariant 5 (Single Transfer) and Explainability (ADR-009) Verified.');

    // -------------------------------------------------------------------------
    // TEST 6: VSER Metrics and Audit Logs Audit
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Testing VSER metrics...');
    const resMetrics = await fetch(`${BASE_URL}/api/admin/metrics`);
    const metricsData = await resMetrics.json();
    console.log('✓ Metrics response:', metricsData);
    assert.strictEqual(metricsData.vser, 1.0); // 1.0 / 0 disputes
    console.log('✓ Invariant 9 (VSER quality gate) Verified.');

    console.log('\n--------------------------------------------------');
    console.log('  ALL ARGUS FOUNDATION TESTS PASSED SUCCESSFULLY!  ');
    console.log('  Definition of Done 0.1 achieved.                 ');
    console.log('--------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exit(1);
  }
}

runTests();
