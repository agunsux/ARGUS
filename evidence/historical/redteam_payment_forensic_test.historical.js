/**
 * ============================================================================
 * HISTORICAL RCB FORENSIC AUDIT — ARCHIVED ARTIFACT (IMMUTABLE RECORD)
 * ============================================================================
 * STATUS: RETIRED / ARCHIVED FOR AUDIT INTEGRITY
 * REASON: RCB was permanently removed from live Tikum architecture in favor of:
 *         - DOKU Primary Rail (Hold & Release Settlement / Escrow gated by KYC)
 *         - Midtrans Backup #1
 *         - Xendit Backup #2
 * This file is preserved strictly for governance and forensic proof.
 * DO NOT EXECUTE AGAINST LIVE PRODUCTION SYSTEMS.
 * ============================================================================
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const { state, resetDatabase, recordAuditLog } = require('../src/database');
const { EscrowService, ESCROW_STATUS, ORDER_STATUS } = require('../src/services/escrowService');
const { SettlementService } = require('../src/services/settlementService');
const { FinancialLedger, LEDGER_ACCOUNTS, FINANCIAL_EVENT_TYPES } = require('../src/settlement/FinancialLedger');
const { PaymentService } = require('../src/services/payment/PaymentService');
const { paymentManager } = require('../src/services/payment/index');
const { RCBPaymentProvider } = require('../src/services/payment/RCBPaymentProvider');
const { ListingService } = require('../src/services/listingService');
const { EventPicService } = require('../src/services/eventPicService');
const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../src/trust/TrustPolicyEngine');
const app = require('../src/server');

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function stopServer() {
  if (server) {
    return new Promise((resolve) => server.close(resolve));
  }
}

async function apiRequest(method, path, body = null, headers = {}) {
  const url = new URL(path, baseUrl);
  const bodyStr = body ? JSON.stringify(body) : null;
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (bodyStr) {
    reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          rawBody: data
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Helper to setup a valid upcoming event and verified listing
async function setupUpcomingTestOrder({
  price = 1000000,
  sellerId = 'seller-1',
  buyerId = 'buyer-1',
  eventId = 'event-joyland-2026' // Future event in Nov 2026
} = {}) {
  const barcode = `TEST-BC-${Date.now()}-${Math.random()}`;
  const listRes = await ListingService.createListing({
    sellerId,
    eventId,
    seatInfo: 'VIP West Gate Row A',
    faceValue: price,
    price,
    rawBarcode: barcode,
    evidenceBundleId: 'bdl-test-auto'
  });

  await ListingService.verifyListing(listRes.listing.id, 'admin-1', {
    approved: true,
    reason: 'Forensic test fixture'
  });

  const orderRes = await EscrowService.createOrder({
    buyerId,
    listingId: listRes.listing.id
  });

  return {
    listing: listRes.listing,
    ticket: listRes.ticket,
    order: orderRes.order,
    escrow: orderRes.escrow,
    pricing: orderRes.pricing
  };
}

async function runRedTeamAttacks() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  TIKUM — POST-RCB PAYMENT FORENSIC RED-TEAM AUDIT & ADVERSARIAL HARNESS      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  await startServer();
  resetDatabase();

  const results = [];

  function recordFinding(id, name, pass, severity, details) {
    results.push({ id, name, pass, severity, details });
    const mark = pass ? '✅ [PASS]' : `❌ [FAIL - ${severity}]`;
    console.log(`${mark} ${id}: ${name}`);
    if (!pass) {
      console.log(`     Evidence: ${details}`);
    }
  }

  // ---------------------------------------------------------------------------
  // ATTACK 1: Fake payment success via client /api/mvp/buyer/pay
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder();
    
    // In test environment (or without production env), client attempts to simulate payment
    const res = await apiRequest('POST', '/api/mvp/buyer/pay', {
      orderId: order.id,
      providerRef: 'fake-proof-123',
      idempotencyKey: `idemp-fake-${Date.now()}`,
      amountPaid: order.buyer_total
    });

    if (res.statusCode === 200 && res.data.success) {
      // It succeeds when NODE_ENV != production!
      recordFinding(
        'ATTACK-1',
        'Fake client payment confirmation endpoint (/api/mvp/buyer/pay)',
        false,
        'CRITICAL',
        `Endpoint accepted client-side payment confirmation without gateway webhook. order status changed to ${state.orders.find(o => o.id === order.id).status}. Gated only by NODE_ENV === 'production' check.`
      );
    } else {
      recordFinding(
        'ATTACK-1',
        'Fake client payment confirmation endpoint (/api/mvp/buyer/pay)',
        true,
        'INFO',
        'Direct payment was blocked'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-1', 'Fake client payment confirmation endpoint', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 2: Forged Webhook HMAC Signature
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder();
    const forgedPayload = {
      order_id: order.id,
      amount: order.buyer_total,
      status: 'PAID',
      transaction_id: 'tx-forged-999'
    };

    const res = await apiRequest('POST', '/api/v1/payments/webhook/rcb', forgedPayload, {
      'x-rcb-signature': 'badc0de1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    });

    if (res.statusCode === 401 || res.statusCode === 400) {
      recordFinding(
        'ATTACK-2',
        'Forged Webhook HMAC Signature rejection',
        true,
        'INFO',
        `Correctly rejected with HTTP ${res.statusCode}: ${res.data.error || res.data.message}`
      );
    } else {
      recordFinding(
        'ATTACK-2',
        'Forged Webhook HMAC Signature rejection',
        false,
        'CRITICAL',
        `Accepted forged signature with HTTP ${res.statusCode}!`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-2', 'Forged Webhook HMAC Signature', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 3: Webhook Replay & Timestamp Expiration Check
  // ---------------------------------------------------------------------------
  try {
    const rcb = paymentManager.getProvider('rcb');
    const secret = 'rcb-test-secret-key-123';
    rcb.webhookSecret = secret;

    const { order } = await setupUpcomingTestOrder();
    const stalePayload = {
      order_id: order.id,
      amount: order.buyer_total,
      status: 'PAID',
      transaction_id: `tx-stale-${Date.now()}`
    };

    const payloadStr = JSON.stringify(stalePayload);
    const validHmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

    // Send webhook with timestamp 24 hours in the past
    const staleTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await apiRequest('POST', '/api/v1/payments/webhook/rcb', stalePayload, {
      'x-rcb-signature': validHmac,
      'x-rcb-timestamp': staleTimestamp
    });

    if (res.statusCode === 200) {
      recordFinding(
        'ATTACK-3',
        'Webhook Replay Protection & Timestamp Window Validation',
        false,
        'HIGH',
        'Webhook accepted with timestamp from 24 hours ago! No timestamp expiration window (300s) is enforced in code.'
      );
    } else {
      recordFinding(
        'ATTACK-3',
        'Webhook Replay Protection & Timestamp Window Validation',
        true,
        'INFO',
        'Rejected stale webhook'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-3', 'Webhook Replay Protection', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 4: Duplicate Webhook Storm (Concurrent 1x, 2x, 10x, 50x)
  // ---------------------------------------------------------------------------
  try {
    const rcb = paymentManager.getProvider('rcb');
    const secret = 'rcb-test-secret-key-123';
    rcb.webhookSecret = secret;

    const { order } = await setupUpcomingTestOrder();
    const payload = {
      order_id: order.id,
      amount: order.buyer_total,
      status: 'PAID',
      transaction_id: `tx-storm-${Date.now()}`
    };
    const payloadStr = JSON.stringify(payload);
    const validHmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

    const ledgerBeforeCount = (state.financial_ledger || []).length;

    // Dispatch 20 concurrent requests
    const stormPromises = [];
    for (let i = 0; i < 20; i++) {
      stormPromises.push(apiRequest('POST', '/api/v1/payments/webhook/rcb', payload, {
        'x-rcb-signature': validHmac
      }));
    }

    const stormResponses = await Promise.all(stormPromises);
    const ledgerAfterCount = (state.financial_ledger || []).length;
    const addedEntries = ledgerAfterCount - ledgerBeforeCount;

    if (addedEntries === 1) {
      recordFinding(
        'ATTACK-4',
        'Duplicate Webhook Storm Deduplication (20 concurrent)',
        true,
        'INFO',
        `Exactly 1 ledger transaction booked across 20 concurrent identical webhooks.`
      );
    } else {
      recordFinding(
        'ATTACK-4',
        'Duplicate Webhook Storm Deduplication (20 concurrent)',
        false,
        'CRITICAL',
        `Race condition! ${addedEntries} financial ledger transactions were booked from 20 identical concurrent webhooks!`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-4', 'Duplicate Webhook Storm', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 5: Duplicate Refund (Sequential & Double Ledgers)
  // ---------------------------------------------------------------------------
  try {
    const { order, escrow } = await setupUpcomingTestOrder();
    await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `pay-${Date.now()}`,
      idempotencyKey: `idemp-pay-${order.id}`,
      amountPaid: order.buyer_total
    });

    const ledgerCountBefore = (state.financial_ledger || []).length;

    // First refund
    const refund1 = await EscrowService.refundToBuyer(order.id, 'admin-1', 'Initial refund');
    const ledgerCountMid = (state.financial_ledger || []).length;

    // Second refund attempt on same order!
    let refund2 = null;
    let refund2Threw = false;
    try {
      refund2 = await EscrowService.refundToBuyer(order.id, 'admin-1', 'Duplicate second refund');
    } catch (err) {
      refund2Threw = true;
    }
    const ledgerCountAfter = (state.financial_ledger || []).length;

    if (refund2Threw) {
      recordFinding(
        'ATTACK-5',
        'Duplicate Refund Prevention on Already Refunded Escrow',
        true,
        'INFO',
        'Second refund correctly blocked.'
      );
    } else {
      recordFinding(
        'ATTACK-5',
        'Duplicate Refund Prevention on Already Refunded Escrow',
        false,
        'CRITICAL',
        `Vulnerability: refundToBuyer does NOT check if status === REFUNDED! Second refund executed! Ledger transactions booked: ${ledgerCountAfter - ledgerCountBefore} (Expected: 1). Financial ledger double-reversed!`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-5', 'Duplicate Refund Prevention', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 6: Duplicate Payout via SettlementService
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder();
    await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `pay-${Date.now()}`,
      idempotencyKey: `idemp-pay-${order.id}`,
      amountPaid: order.buyer_total
    });

    // Simulate entry confirmation
    state.entry_verifications.push({
      order_id: order.id,
      pic_user_id: 'pic-1',
      status: 'CONFIRMED',
      created_at: new Date().toISOString()
    });

    await EscrowService.releaseToSeller(order.id, 'admin-1');

    // First settlement
    const res1 = await SettlementService.executeSettlement({
      orderId: order.id,
      sellerId: order.seller_id,
      officerId: 'admin-1',
      idempotencyKey: `key-settle-1-${order.id}`
    });

    // Second settlement with DIFFERENT idempotency key!
    const res2 = await SettlementService.executeSettlement({
      orderId: order.id,
      sellerId: order.seller_id,
      officerId: 'admin-1',
      idempotencyKey: `key-settle-2-${order.id}`
    });

    if (res2.duplicatePrevented || res2.idempotent) {
      const recordsForOrder = (state.settlements || []).filter(s => s.order_id === order.id);
      if (recordsForOrder.length === 1) {
        recordFinding(
          'ATTACK-6',
          'Duplicate Payout Prevention (different idempotency key)',
          true,
          'INFO',
          'Blocked duplicate settlement for same order.'
        );
      } else {
        recordFinding(
          'ATTACK-6',
          'Duplicate Payout Prevention',
          false,
          'CRITICAL',
          `Multiple settlement records created: ${recordsForOrder.length}`
        );
      }
    } else {
      recordFinding(
        'ATTACK-6',
        'Duplicate Payout Prevention',
        false,
        'CRITICAL',
        'Settlement executed twice!'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-6', 'Duplicate Payout Prevention', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 7: Refund After Payout (Sequential)
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder();
    await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `pay-${Date.now()}`,
      idempotencyKey: `idemp-pay-${order.id}`,
      amountPaid: order.buyer_total
    });

    state.entry_verifications.push({
      order_id: order.id,
      pic_user_id: 'pic-1',
      status: 'CONFIRMED',
      created_at: new Date().toISOString()
    });

    await EscrowService.releaseToSeller(order.id, 'admin-1');

    let threw = false;
    try {
      await EscrowService.refundToBuyer(order.id, 'admin-1', 'Late refund attempt');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.code, 'ALREADY_RELEASED');
    }

    if (threw) {
      recordFinding(
        'ATTACK-7',
        'Sequential Refund After Payout blocked',
        true,
        'INFO',
        'refundToBuyer threw ALREADY_RELEASED.'
      );
    } else {
      recordFinding(
        'ATTACK-7',
        'Sequential Refund After Payout blocked',
        false,
        'CRITICAL',
        'Refund succeeded after funds released to seller!'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-7', 'Sequential Refund After Payout', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 8: Payout Before Ticket / Venue Verification
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder();
    await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `pay-${Date.now()}`,
      idempotencyKey: `idemp-pay-${order.id}`,
      amountPaid: order.buyer_total
    });

    let threw = false;
    try {
      // No entry verification in state
      await EscrowService.releaseToSeller(order.id, 'admin-1');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.code, 'ENTRY_NOT_CONFIRMED');
    }

    if (threw) {
      recordFinding(
        'ATTACK-8',
        'Payout Before Venue Verification blocked',
        true,
        'INFO',
        'releaseToSeller correctly required ENTRY_CONFIRMED.'
      );
    } else {
      recordFinding(
        'ATTACK-8',
        'Payout Before Venue Verification blocked',
        false,
        'CRITICAL',
        'Escrow released to seller without verified venue entry!'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-8', 'Payout Before Venue Verification', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 9: IDOR / Anonymous Payment Intent Creation Bypass (/v1/payments/create)
  // ---------------------------------------------------------------------------
  try {
    const { order } = await setupUpcomingTestOrder({ buyerId: 'buyer-1' });

    // Attacker sends request with NO authorization header for buyer-1's order
    const res = await apiRequest('POST', '/api/v1/payments/create', {
      orderId: order.id,
      channel: 'QRIS'
    }, {}); // NO x-user-id, NO authorization header!

    if (res.statusCode === 200 && res.data.success) {
      recordFinding(
        'ATTACK-9',
        'Unauthenticated / Anonymous Access to /api/v1/payments/create (Ownership Check Bypass)',
        false,
        'HIGH',
        `Unauthenticated user can create payment intent for arbitrary order '${order.id}'. Code has: if (buyerId && order.buyer_id !== buyerId) check, which skips validation when buyerId is null!`
      );
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      recordFinding(
        'ATTACK-9',
        'Unauthenticated Access to /api/v1/payments/create blocked',
        true,
        'INFO',
        'Correctly blocked unauthenticated request'
      );
    } else {
      recordFinding(
        'ATTACK-9',
        'Unauthenticated Access to /api/v1/payments/create',
        false,
        'MEDIUM',
        `Unexpected status: ${res.statusCode}`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-9', 'Unauthenticated Access to /api/v1/payments/create', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 10: Concurrency Race Condition: REFUND vs PAYOUT SIMULTANEOUSLY (Double-Spend)
  // ---------------------------------------------------------------------------
  try {
    const { order, escrow } = await setupUpcomingTestOrder();
    await EscrowService.recordPayment({
      orderId: order.id,
      providerRef: `pay-${Date.now()}`,
      idempotencyKey: `idemp-pay-${order.id}`,
      amountPaid: order.buyer_total
    });

    state.entry_verifications.push({
      order_id: order.id,
      pic_user_id: 'pic-1',
      status: 'CONFIRMED',
      created_at: new Date().toISOString()
    });

    // Concurrently dispatch releaseToSeller AND refundToBuyer
    const [payoutResult, refundResult] = await Promise.allSettled([
      EscrowService.releaseToSeller(order.id, 'admin-1'),
      EscrowService.refundToBuyer(order.id, 'admin-1', 'Concurrent dispute refund')
    ]);

    const bothSucceeded = payoutResult.status === 'fulfilled' && refundResult.status === 'fulfilled';
    if (bothSucceeded) {
      recordFinding(
        'ATTACK-10',
        'Concurrent Race: Payout + Refund Simultaneously (DOUBLE SPEND)',
        false,
        'CRITICAL',
        `CRITICAL RACE CONDITION! Both releaseToSeller and refundToBuyer SUCCEEDED simultaneously on order ${order.id}! Escrow status is now ${escrow.status}. Financial ledger has both release AND refund booked!`
      );
    } else {
      recordFinding(
        'ATTACK-10',
        'Concurrent Race: Payout + Refund Simultaneously',
        true,
        'INFO',
        'One of the concurrent operations was safely rejected.'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-10', 'Concurrent Race: Payout + Refund', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 11: Real Money Inbound Live Network Execution
  // ---------------------------------------------------------------------------
  try {
    const rcb = paymentManager.getProvider('rcb');
    let liveExecutionBlocked = false;
    let liveExecutionError = null;

    try {
      // Force allowSimulation to false to simulate production live mode
      rcb.allowSimulation = false;
      rcb.enableProduction = true;
      rcb.contractVerified = true;
      rcb.kycVerified = true;
      rcb.apiKey = 'live-key';
      rcb.secretKey = 'live-secret';
      rcb.sandboxTested = true;

      await rcb.createPayment({
        orderId: 'ord-live-test',
        amount: 500000,
        channel: 'QRIS'
      });
    } catch (err) {
      liveExecutionBlocked = true;
      liveExecutionError = err.message;
    }

    if (liveExecutionBlocked && liveExecutionError.includes('Live RCB API network client not active')) {
      recordFinding(
        'ATTACK-11',
        'Real-Money Live Gateway Network Client Readiness',
        false,
        'CRITICAL',
        `No live network client exists! Throws: '${liveExecutionError}'. Tikum cannot process real money transactions because no actual payment gateway HTTP client or SDK is implemented.`
      );
    } else {
      recordFinding(
        'ATTACK-11',
        'Real-Money Live Gateway Network Client Readiness',
        true,
        'INFO',
        'Live client executed'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-11', 'Real-Money Live Gateway', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 12: Chargeback Lifecycle Check
  // ---------------------------------------------------------------------------
  try {
    const hasChargebackService = typeof state.chargebacks !== 'undefined';
    const rcbCaps = paymentManager.getProvider('rcb').getCapabilities();
    
    recordFinding(
      'ATTACK-12',
      'Chargeback Lifecycle Implementation',
      false,
      'HIGH',
      'Chargeback handling is NOT IMPLEMENTED. No webhook handler, no state table, no clawback mechanism, no recovery logic.'
    );
  } catch (e) {
    recordFinding('ATTACK-12', 'Chargeback Lifecycle', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 13: Financial Ledger Double-Entry Balancing & Debit/Credit Invariants
  // ---------------------------------------------------------------------------
  try {
    const balances = FinancialLedger.getAccountBalances();
    let totalDebit = 0;
    let totalCredit = 0;

    for (const tx of state.financial_ledger) {
      for (const entry of tx.entries) {
        if (entry.type === 'DEBIT') totalDebit += entry.amount;
        else totalCredit += entry.amount;
      }
    }

    const isBalanced = totalDebit === totalCredit;
    if (isBalanced) {
      recordFinding(
        'ATTACK-13',
        'Financial Ledger Mathematical Balancing (Sum Debits === Sum Credits)',
        true,
        'INFO',
        `Ledger balanced: Total Debits (Rp ${totalDebit}) === Total Credits (Rp ${totalCredit}) across ${state.financial_ledger.length} transactions.`
      );
    } else {
      recordFinding(
        'ATTACK-13',
        'Financial Ledger Mathematical Balancing',
        false,
        'CRITICAL',
        `Double-entry imbalance! Debits (${totalDebit}) !== Credits (${totalCredit})`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-13', 'Financial Ledger Balancing', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 14: Escrow / Custody Reality Check (Where is customer money?)
  // ---------------------------------------------------------------------------
  try {
    const rcbCaps = paymentManager.getProvider('rcb').getCapabilities();
    const isNativeEscrow = rcbCaps.hold && rcbCaps.release;

    if (!isNativeEscrow) {
      recordFinding(
        'ATTACK-14',
        'Real Financial Escrow vs Internal Database State',
        false,
        'HIGH',
        'Tikum has NO native banking or gateway escrow hold API. Money resides in Tikum\'s general merchant account (or simulated). The "escrow" is purely an internal database status flag in state.escrows and FinancialLedger.'
      );
    } else {
      recordFinding(
        'ATTACK-14',
        'Real Financial Escrow',
        true,
        'INFO',
        'Native gateway escrow hold supported.'
      );
    }
  } catch (e) {
    recordFinding('ATTACK-14', 'Escrow Custody Reality', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 15: Money Calculation & Floating-Point Arithmetic Forensics
  // ---------------------------------------------------------------------------
  try {
    const { CanonicalFeeEngine } = require('../src/pricing/CanonicalFeeEngine');
    const testPrices = [1, 10, 99, 100, 999, 1000, 10000, 150000, 999999, 1000000];
    let allIntegers = true;
    let equationHolds = true;

    for (const p of testPrices) {
      const pricing = EscrowService.calculatePricing(p);
      if (
        !Number.isInteger(pricing.buyer_total) ||
        !Number.isInteger(pricing.platformFee) ||
        !Number.isInteger(pricing.seller_net_payout)
      ) {
        allIntegers = false;
      }
      
      const expectedBuyerTotal = pricing.gross_ticket_value + pricing.buyer_fee + (pricing.buyer_tax || 0);
      if (pricing.buyer_total !== expectedBuyerTotal) {
        equationHolds = false;
      }
    }

    if (allIntegers && equationHolds) {
      recordFinding(
        'ATTACK-15',
        'Money Calculation Integer Minor Units & Equation Invariants',
        true,
        'INFO',
        'All price points enforce strictly integer rupiah and exact balancing equations.'
      );
    } else {
      recordFinding(
        'ATTACK-15',
        'Money Calculation Forensics',
        false,
        'HIGH',
        `Floating point numbers or equation violation detected! Integers: ${allIntegers}, Equation: ${equationHolds}`
      );
    }
  } catch (e) {
    recordFinding('ATTACK-15', 'Money Calculation Forensics', false, 'HIGH', e.message);
  }

  // ---------------------------------------------------------------------------
  // ATTACK 16: In-Memory Database Persistence Volatility (Vercel Cold Start Loss)
  // ---------------------------------------------------------------------------
  try {
    recordFinding(
      'ATTACK-16',
      'Database Persistence Boundary (In-Memory State Volatility)',
      false,
      'CRITICAL',
      'All financial records (orders, payments, escrows, settlements, financial_ledger) reside in memory (src/database.js state object). Any process restart or Vercel serverless cold restart instantly wipes all financial data.'
    );
  } catch (e) {
    recordFinding('ATTACK-16', 'Database Persistence Boundary', false, 'HIGH', e.message);
  }

  await stopServer();

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  RED TEAM HARNESS COMPLETE');
  console.log(`  Total Checks: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.pass).length}`);
  console.log(`  Failed: ${results.filter(r => !r.pass).length}`);
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  return results;
}

if (require.main === module) {
  runRedTeamAttacks().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Red team suite error:', err);
    process.exit(1);
  });
}

module.exports = { runRedTeamAttacks };

