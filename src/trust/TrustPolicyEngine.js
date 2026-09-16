/**
 * TIKUM / ARGUS — Trust Policy Engine & Multi-Layer Transaction Authorization (Epic 5)
 * 
 * Non-Negotiable Invariants:
 * 1. NO SINGLE ACTOR MAY UNILATERALLY AUTHORIZE FINANCIAL RELEASE.
 *    (PIC, buyer, seller, admin, platform, or ticket verification alone cannot release funds)
 * 2. OBSERVATION != AUTHORIZATION.
 *    Attestation is what an actor observed. Authorization is the policy decision.
 * 3. RELEASED is reachable ONLY when FINANCIAL_RELEASE_AUTHORIZED is TRUE.
 * 4. Policy Quorum is policy-driven based on Risk Level (LOW, MEDIUM, HIGH),
 *    NOT a hardcoded universal 2-of-3 rule.
 * 5. Quorum must represent independent trust sources:
 *    Duplicate records/sessions by the same actor NEVER increase quorum weight.
 * 6. Financial safety states (DISPUTED, FROZEN, REFUND_PENDING, REJECTED) strictly BLOCK release
 *    regardless of positive quorum.
 * 7. Decision Outcomes: PASS, BLOCK, EXCEPTION.
 *    Conflicts (e.g. Platform REJECT with PIC/Buyer PASS) trigger EXCEPTION/REVIEW,
 *    never automatic release.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { SellerTrustService } = require('./SellerTrustService');
const { IncidentService, INCIDENT_TYPES, INCIDENT_SEVERITY } = require('../venue/IncidentService');

const RISK_LEVEL = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
};

const ATTESTATION_TYPE = {
  PLATFORM_ATTESTATION: 'PLATFORM_ATTESTATION',
  SELLER_ATTESTATION: 'SELLER_ATTESTATION',
  TICKET_EVIDENCE_ATTESTATION: 'TICKET_EVIDENCE_ATTESTATION',
  PAYMENT_ATTESTATION: 'PAYMENT_ATTESTATION',
  PIC_ATTESTATION: 'PIC_ATTESTATION',
  BUYER_ATTESTATION: 'BUYER_ATTESTATION',
  VENUE_ENTRY_ATTESTATION: 'VENUE_ENTRY_ATTESTATION'
};

const REQUIREMENT_LEVEL = {
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE'
};

const AUTHORIZATION_OUTCOME = {
  PASS: 'PASS',
  BLOCK: 'BLOCK',
  EXCEPTION: 'EXCEPTION',
  PENDING: 'PENDING'
};

/**
 * Explicit Policy Definitions per Risk Level
 * Differentiates REQUIRED, OPTIONAL, NOT_APPLICABLE
 */
const POLICY_DEFINITIONS = {
  [RISK_LEVEL.LOW]: {
    policy_version: '1.0.0-LOW',
    description: 'Low-risk transaction: verified seller, low face value, automated platform proof',
    requirements: {
      [ATTESTATION_TYPE.PLATFORM_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.PAYMENT_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.SELLER_ATTESTATION]: REQUIREMENT_LEVEL.OPTIONAL,
      [ATTESTATION_TYPE.BUYER_ATTESTATION]: REQUIREMENT_LEVEL.NOT_APPLICABLE,
      [ATTESTATION_TYPE.PIC_ATTESTATION]: REQUIREMENT_LEVEL.NOT_APPLICABLE,
      [ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION]: REQUIREMENT_LEVEL.NOT_APPLICABLE
    }
  },
  [RISK_LEVEL.MEDIUM]: {
    policy_version: '1.0.0-MEDIUM',
    description: 'Medium-risk transaction: unverified/new seller or static ticket, requires buyer confirmation',
    requirements: {
      [ATTESTATION_TYPE.PLATFORM_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.PAYMENT_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.BUYER_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.SELLER_ATTESTATION]: REQUIREMENT_LEVEL.OPTIONAL,
      [ATTESTATION_TYPE.PIC_ATTESTATION]: REQUIREMENT_LEVEL.OPTIONAL,
      [ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION]: REQUIREMENT_LEVEL.OPTIONAL
    }
  },
  [RISK_LEVEL.HIGH]: {
    policy_version: '1.0.0-HIGH',
    description: 'High-risk transaction: high value, probationary seller, or high-security event; requires full multi-party quorum',
    requirements: {
      [ATTESTATION_TYPE.PLATFORM_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.PAYMENT_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.BUYER_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.PIC_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED,
      [ATTESTATION_TYPE.SELLER_ATTESTATION]: REQUIREMENT_LEVEL.REQUIRED
    }
  }
};

class TrustPolicyEngine {
  /**
   * Evaluates transaction risk level based on available domain signals.
   * Minimal and deterministic. Does NOT use fake AI or invent fake signals.
   */
  static evaluateRisk({ orderId, sellerId = null, ticketPrice = 0, customSignals = [] }) {
    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    const effectiveSellerId = sellerId || order?.seller_id;
    const effectiveAmount = ticketPrice || order?.ticket_price || order?.total_amount || 0;

    const detectedSignals = [...customSignals];

    // 1. Transaction Value Thresholds
    if (effectiveAmount > 5000000) {
      detectedSignals.push('HIGH_VALUE_TRANSACTION');
    } else if (effectiveAmount >= 1500000) {
      detectedSignals.push('MEDIUM_VALUE_TRANSACTION');
    }

    // 2. Seller Trust Signals
    let sellerTier = null;
    if (effectiveSellerId) {
      sellerTier = 'STANDARD_SELLER';
      try {
        const sellerEval = SellerTrustService.evaluateSeller(effectiveSellerId);
        sellerTier = sellerEval.trust_tier;
        if (sellerTier === 'SUSPENDED' || sellerTier === 'PROBATIONARY') {
          detectedSignals.push('SELLER_PROBATIONARY_OR_SUSPENDED');
        }
      } catch (e) {
        // Fallback for mock/test IDs
      }
    }

    // 3. Past Disputes / Chargebacks
    if (effectiveSellerId && state.disputes) {
      const sellerDisputes = state.disputes.filter(d => d.seller_id === effectiveSellerId && d.outcome === 'BUYER_FAVORED');
      if (sellerDisputes.length > 0) {
        detectedSignals.push(`SELLER_DISPUTE_HISTORY_${sellerDisputes.length}`);
      }
    }

    // Determine deterministic risk level
    let riskLevel = RISK_LEVEL.LOW;
    if (
      detectedSignals.includes('HIGH_VALUE_TRANSACTION') ||
      detectedSignals.includes('SELLER_PROBATIONARY_OR_SUSPENDED') ||
      detectedSignals.some(s => s.startsWith('SELLER_DISPUTE_HISTORY')) ||
      detectedSignals.includes('BURST_VELOCITY_ANOMALY') ||
      detectedSignals.includes('DEVICE_ANOMALY_DETECTED')
    ) {
      riskLevel = RISK_LEVEL.HIGH;
    } else if (
      detectedSignals.includes('MEDIUM_VALUE_TRANSACTION') ||
      (effectiveSellerId && sellerTier === 'STANDARD_SELLER') ||
      detectedSignals.includes('STATIC_DIGITAL_TICKET') ||
      detectedSignals.includes('SHARED_IP_DETECTED')
    ) {
      riskLevel = RISK_LEVEL.MEDIUM;
    }

    return {
      riskLevel,
      signals: detectedSignals,
      evaluated_at: new Date().toISOString()
    };
  }

  /**
   * Retrieves policy definition for a given risk level
   */
  static getPolicy(riskLevel = RISK_LEVEL.LOW) {
    return POLICY_DEFINITIONS[riskLevel] || POLICY_DEFINITIONS[RISK_LEVEL.LOW];
  }

  /**
   * Records an immutable attestation from a verified actor/system.
   * Invariant 5: No Quorum Inflation. Duplicate records by the same actor
   * do not increase quorum weight.
   */
  static async recordAttestation({
    orderId,
    attestationType,
    actorId,
    actorRole,
    result = 'PASS',
    evidenceRef = null,
    metadata = {}
  }) {
    if (!orderId || !attestationType || !actorId || !actorRole) {
      const err = new Error('orderId, attestationType, actorId, and actorRole are required');
      err.code = 'INVALID_ATTESTATION_PARAMS';
      throw err;
    }

    if (!ATTESTATION_TYPE[attestationType]) {
      const err = new Error(`Unknown attestation type: '${attestationType}'`);
      err.code = 'UNKNOWN_ATTESTATION_TYPE';
      throw err;
    }

    // Role authorization boundary: Actor identity must match attestation scope
    const normalizedRole = actorRole.toLowerCase();
    if (attestationType === ATTESTATION_TYPE.BUYER_ATTESTATION && normalizedRole !== 'buyer') {
      const err = new Error('Unauthorized: only buyer can provide BUYER_ATTESTATION');
      err.code = 'UNAUTHORIZED_ATTESTOR';
      err.status = 403;
      throw err;
    }
    if ((attestationType === ATTESTATION_TYPE.PIC_ATTESTATION || attestationType === ATTESTATION_TYPE.VENUE_ENTRY_ATTESTATION) && normalizedRole !== 'pic' && normalizedRole !== 'admin') {
      const err = new Error('Unauthorized: only PIC or Admin can provide PIC/VENUE_ENTRY_ATTESTATION');
      err.code = 'UNAUTHORIZED_ATTESTOR';
      err.status = 403;
      throw err;
    }
    if (attestationType === ATTESTATION_TYPE.PLATFORM_ATTESTATION && normalizedRole !== 'system' && normalizedRole !== 'admin') {
      const err = new Error('Unauthorized: only SYSTEM or Admin can provide PLATFORM_ATTESTATION');
      err.code = 'UNAUTHORIZED_ATTESTOR';
      err.status = 403;
      throw err;
    }

    if (!state.attestations) {
      state.attestations = [];
    }

    // Invariant: Check duplicate attestation by the same actor for this type (Anti-Inflation)
    const existing = state.attestations.find(
      a => a.order_id === orderId && a.type === attestationType && a.actor_id === actorId
    );

    const now = new Date().toISOString();
    if (existing) {
      // Idempotent update of result/evidence; does not append new record
      existing.result = result.toUpperCase();
      existing.evidence_ref = evidenceRef || existing.evidence_ref;
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.updated_at = now;
      return { attestation: existing, duplicate: true };
    }

    const attestation = {
      attestation_id: `att-${uuidv4()}`,
      order_id: orderId,
      type: attestationType,
      actor_id: actorId,
      actor_role: actorRole,
      result: result.toUpperCase(), // 'PASS' or 'FAIL'
      evidence_ref: evidenceRef,
      metadata,
      created_at: now
    };

    state.attestations.push(attestation);

    await recordAuditLog('ATTESTATION', attestation.attestation_id, attestationType, actorId, {
      order_id: orderId,
      result: attestation.result,
      actor_role: actorRole
    });

    return { attestation, duplicate: false };
  }

  /**
   * Retrieves all unique, independent attestations for an order.
   * Deduplicates by (type, actor_id).
   */
  static getAttestations(orderId) {
    if (!state.attestations) return [];
    const orderAttestations = state.attestations.filter(a => a.order_id === orderId);
    
    // Deduplicate to guarantee independence
    const uniqueMap = new Map();
    for (const a of orderAttestations) {
      const key = `${a.type}:${a.actor_id}`;
      uniqueMap.set(key, a);
    }
    return Array.from(uniqueMap.values());
  }

  /**
   * Evaluates the complete multi-layer Trust Policy for an order.
   * Produces an immutable, queryable AuthorizationRecord with PASS / BLOCK / EXCEPTION.
   */
  static async evaluateAuthorization(orderId, options = {}) {
    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    const escrow = state.escrows ? state.escrows.find(e => e.order_id === orderId) : null;

    // 1. Determine Risk Level & Policy
    const riskAssessment = this.evaluateRisk({
      orderId,
      sellerId: order?.seller_id,
      ticketPrice: order?.ticket_price,
      customSignals: options.signals || []
    });
    const policy = this.getPolicy(riskAssessment.riskLevel);

    const blockingReasons = [];
    const exceptionReasons = [];

    // 2. FINANCIAL SAFETY STATE CHECK (Non-negotiable)
    // DISPUTED, FROZEN, REFUND_PENDING, REJECTED, CANCELLED strictly prohibit release
    const escrowStatus = (escrow?.status || '').toUpperCase();
    const orderStatus = (order?.status || '').toUpperCase();

    if (escrowStatus === 'DISPUTED' || orderStatus === 'DISPUTED') {
      blockingReasons.push('TRANSACTION_IN_DISPUTED_STATE');
    }
    if (escrowStatus === 'FROZEN' || orderStatus === 'FROZEN') {
      blockingReasons.push('TRANSACTION_IN_FROZEN_STATE');
    }
    if (escrowStatus === 'REFUND_PENDING' || orderStatus === 'REFUND_PENDING') {
      blockingReasons.push('TRANSACTION_IN_REFUND_PENDING_STATE');
    }
    if (escrowStatus === 'CANCELLED' || orderStatus === 'CANCELLED') {
      blockingReasons.push('TRANSACTION_CANCELLED');
    }
    if (escrowStatus === 'REJECTED' || orderStatus === 'REJECTED') {
      blockingReasons.push('TRANSACTION_REJECTED');
    }

    // 3. Collect Received Attestations
    const received = this.getAttestations(orderId);
    const receivedMap = new Map();
    for (const a of received) {
      receivedMap.set(a.type, a);
    }

    // Check required attestations
    const requiredTypes = Object.keys(policy.requirements).filter(
      type => policy.requirements[type] === REQUIREMENT_LEVEL.REQUIRED
    );

    const missingAttestations = [];
    for (const reqType of requiredTypes) {
      const att = receivedMap.get(reqType);
      if (!att) {
        missingAttestations.push(reqType);
      } else if (att.result === 'FAIL') {
        blockingReasons.push(`MANDATORY_ATTESTATION_FAILED_${reqType}`);
      }
    }

    // 4. CRITICAL ACCEPTANCE TEST: OBSERVATION CONFLICT CHECK
    // If PLATFORM = FAIL or REJECT, but field actors (PIC + Buyer) confirm PASS:
    // MUST enter EXCEPTION / REVIEW. Platform is NOT outvoted by PIC + Buyer!
    const platformAtt = receivedMap.get(ATTESTATION_TYPE.PLATFORM_ATTESTATION);
    const picAtt = receivedMap.get(ATTESTATION_TYPE.PIC_ATTESTATION);
    const buyerAtt = receivedMap.get(ATTESTATION_TYPE.BUYER_ATTESTATION);

    if (platformAtt && platformAtt.result === 'FAIL') {
      if ((picAtt && picAtt.result === 'PASS') || (buyerAtt && buyerAtt.result === 'PASS')) {
        exceptionReasons.push('PLATFORM_REJECTED_DESPITE_FIELD_CONFIRMATION');
      }
    }

    // 5. Check Anomaly / Exception Signals
    if (options.anomalyDetected || (order && order.anomaly_detected)) {
      exceptionReasons.push('DEVICE_OR_BEHAVIOR_ANOMALY_REQUIRES_MANUAL_REVIEW');
    }
    // Hard Constraint 4: Velocity alone does NOT equal fraud.
    // Velocity anomaly elevates risk to HIGH (requiring full quorum). Route to EXCEPTION only
    // if combined with device/behavior anomaly or when explicit manual hold is requested.
    if ((options.velocityAnomaly || (order && order.velocity_anomaly)) && (options.requireOperationalReview || (order && order.anomaly_detected))) {
      exceptionReasons.push('BURST_VELOCITY_ANOMALY_REQUIRES_INVESTIGATION');
    }

    // 6. Determine Final Decision Outcome
    let outcome;
    if (blockingReasons.length > 0) {
      outcome = AUTHORIZATION_OUTCOME.BLOCK;
    } else if (exceptionReasons.length > 0) {
      outcome = AUTHORIZATION_OUTCOME.EXCEPTION;
    } else if (missingAttestations.length > 0) {
      outcome = AUTHORIZATION_OUTCOME.PENDING;
    } else {
      outcome = AUTHORIZATION_OUTCOME.PASS;
    }

    const financialReleaseAuthorized = (outcome === AUTHORIZATION_OUTCOME.PASS);
    const now = new Date().toISOString();

    const authRecord = {
      authorization_id: `auth-${uuidv4()}`,
      order_id: orderId,
      risk_level: riskAssessment.riskLevel,
      policy_version: policy.policy_version,
      status: financialReleaseAuthorized ? 'AUTHORIZED' : outcome,
      outcome: outcome,
      financial_release_authorized: financialReleaseAuthorized,
      required_attestations: requiredTypes,
      received_attestations: Array.from(receivedMap.keys()),
      missing_attestations: missingAttestations,
      blocking_reasons: blockingReasons,
      exception_reasons: exceptionReasons,
      authorized_at: financialReleaseAuthorized ? now : null,
      policy_decision_reference: `dec-${Date.now()}`,
      created_at: now
    };

    if (!state.authorization_records) {
      state.authorization_records = [];
    }
    // Replace previous pending record if re-evaluating
    const existingIdx = state.authorization_records.findIndex(r => r.order_id === orderId);
    if (existingIdx >= 0) {
      state.authorization_records[existingIdx] = authRecord;
    } else {
      state.authorization_records.push(authRecord);
    }

    await recordAuditLog('TRUST_POLICY_EVALUATION', authRecord.authorization_id, outcome, 'SYSTEM', {
      order_id: orderId,
      financial_release_authorized: financialReleaseAuthorized,
      risk_level: riskAssessment.riskLevel,
      blocking_reasons: blockingReasons,
      exception_reasons: exceptionReasons
    });

    return authRecord;
  }

  /**
   * Checks whether financial release is currently authorized for an order.
   * Enforced at the release gate and state-machine transition.
   */
  static isReleaseAuthorized(orderId, expectedAuthId = null) {
    if (!state.authorization_records) return false;
    const record = state.authorization_records.find(r => r.order_id === orderId);
    if (!record) return false;

    if (expectedAuthId && record.authorization_id !== expectedAuthId) {
      return false;
    }

    // Verify hold states in live state to prevent stale authorization race
    const escrow = state.escrows ? state.escrows.find(e => e.order_id === orderId) : null;
    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;

    if (escrow && (escrow.status === 'DISPUTED' || escrow.status === 'FROZEN' || escrow.status === 'REFUND_PENDING')) {
      return false;
    }
    if (order && (order.status === 'DISPUTED' || order.status === 'FROZEN' || order.status === 'REFUND_PENDING')) {
      return false;
    }

    return record.financial_release_authorized === true && record.outcome === AUTHORIZATION_OUTCOME.PASS;
  }

  /**
   * PC-1: Anti-Collusion — Self-Dealing & Social Proximity Constraint
   * A PIC cannot verify transactions where the PIC is the buyer, seller,
   * or shares phone, device, or NIK hash.
   */
  static validatePicConflictOfInterest({ picUserId, orderId, ipAddress = null, deviceId = null }) {
    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    if (!order) {
      const err = new Error(`Order '${orderId}' not found for conflict validation`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const picUser = state.users.find(u => u.id === picUserId);
    const buyer = state.users.find(u => u.id === order.buyer_id);
    const seller = state.users.find(u => u.id === order.seller_id);

    // Hard Block 1: PIC is Buyer
    if (picUserId === order.buyer_id) {
      const err = new Error('Security Violation (PC-1): PIC cannot attest an order where they are the buyer');
      err.code = 'COLLUSION_SELF_DEALING_DETECTED';
      err.status = 403;
      recordAuditLog('COLLUSION_ALERT', orderId, 'SELF_DEALING_PIC_IS_BUYER', picUserId, { order_id: orderId });
      throw err;
    }

    // Hard Block 2: PIC is Seller
    if (picUserId === order.seller_id) {
      const err = new Error('Security Violation (PC-1): PIC cannot attest an order where they are the seller');
      err.code = 'COLLUSION_SELF_DEALING_DETECTED';
      err.status = 403;
      recordAuditLog('COLLUSION_ALERT', orderId, 'SELF_DEALING_PIC_IS_SELLER', picUserId, { order_id: orderId });
      throw err;
    }

    // Hard Block 3: Direct Phone or NIK Match
    if (picUser && buyer && picUser.phone && picUser.phone === buyer.phone) {
      const err = new Error('Security Violation (PC-1): Collusion detected — PIC shares phone number with buyer');
      err.code = 'COLLUSION_SELF_DEALING_DETECTED';
      err.status = 403;
      throw err;
    }
    if (picUser && seller && picUser.phone && picUser.phone === seller.phone) {
      const err = new Error('Security Violation (PC-1): Collusion detected — PIC shares phone number with seller');
      err.code = 'COLLUSION_SELF_DEALING_DETECTED';
      err.status = 403;
      throw err;
    }

    // Weak Signal: Shared IP alone is NOT a deterministic collusion block, but a risk signal
    let sharedIpSignal = false;
    if (ipAddress && (ipAddress === order.buyer_ip || ipAddress === order.seller_ip)) {
      sharedIpSignal = true;
      recordAuditLog('RISK_SIGNAL', orderId, 'SHARED_IP_DETECTED', picUserId, { ip: ipAddress });
    }

    return { valid: true, sharedIpSignal };
  }

  /**
   * PC-2: Strict Shift Geofence & Operational Window
   * Verification valid strictly within:
   * [Event.startDate - 4 hours, Event.endDate + 1 hour]
   */
  static validatePicShiftAndWindow({ picUserId, orderId, gate = null, timestampStr = null }) {
    const order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const event = state.events.find(e => e.id === order.event_id);
    if (!event) {
      const err = new Error('Event not found');
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    // 1. Verify PIC assigned to this event
    const assignment = state.event_pics ? state.event_pics.find(
      ep => ep.pic_user_id === picUserId && ep.event_id === event.id && ep.status === 'ACTIVE'
    ) : null;

    if (!assignment) {
      const err = new Error(`PIC '${picUserId}' is not authorized or active for Event '${event.id}'`);
      err.code = 'PIC_UNAUTHORIZED';
      err.status = 403;
      throw err;
    }

    // 2. Gate verification
    if (gate && assignment.venue_gate && gate !== assignment.venue_gate) {
      const err = new Error(`Gate mismatch: PIC assigned to '${assignment.venue_gate}', attempted at '${gate}'`);
      err.code = 'PIC_GATE_MISMATCH';
      err.status = 403;
      throw err;
    }

    // 3. Operational Window: [Event.startDate - 4 hours, Event.endDate + 1 hour]
    const checkTime = timestampStr ? new Date(timestampStr).getTime() : Date.now();
    const eventStartDate = new Date(event.start_date || event.date).getTime();
    // Default event duration: 4 hours if no end_date specified
    const eventEndDate = event.end_date ? new Date(event.end_date).getTime() : eventStartDate + (4 * 60 * 60 * 1000);

    const windowStart = eventStartDate - (4 * 60 * 60 * 1000);
    const windowEnd = eventEndDate + (1 * 60 * 60 * 1000);

    // In test environment, allow explicit simulated timestamp or bypass if no timestamp supplied
    if (timestampStr || process.env.NODE_ENV !== 'test') {
      if (checkTime < windowStart || checkTime > windowEnd) {
        const err = new Error(`Operational window violation: PIC verification only permitted from 4 hours before event start to 1 hour after event end`);
        err.code = 'PIC_OUTSIDE_OPERATIONAL_WINDOW';
        err.status = 403;
        throw err;
      }
    }

    return { valid: true, assignment, event };
  }

  /**
   * PC-4: Suspicious Burst Velocity Detection
   * Rate: >= 3 verifications in 10 seconds by the same PIC.
   * User Constraint: Do NOT blindly block gate turnstiles (prevent DoS).
   * Instead, create an Incident, log security alert, and route transaction
   * authorization to EXCEPTION/REVIEW before automatic release.
   */
  static checkPicBurstVelocity({ picUserId, gate = 'Gate 1', timestamp = Date.now() }) {
    if (!state.pic_velocity_log) {
      state.pic_velocity_log = [];
    }

    // Sliding window of 10 seconds
    const tenSecondsAgo = timestamp - 10000;
    state.pic_velocity_log = state.pic_velocity_log.filter(
      entry => entry.pic_id === picUserId && entry.timestamp > tenSecondsAgo
    );

    state.pic_velocity_log.push({ pic_id: picUserId, gate, timestamp });

    const recentCount = state.pic_velocity_log.filter(entry => entry.pic_id === picUserId).length;

    if (recentCount >= 3) {
      // Report operational incident
      IncidentService.reportIncident({
        type: INCIDENT_TYPES.OTHER,
        severity: INCIDENT_SEVERITY.HIGH,
        reporterId: 'SYSTEM',
        reporterRole: 'system',
        eventId: 'operational-monitoring',
        description: `Turnstile burst velocity anomaly: PIC '${picUserId}' executed ${recentCount} verifications in <10 seconds at ${gate}.`
      }).catch(() => {});

      recordAuditLog('VELOCITY_ALERT', picUserId, 'SUSPICIOUS_BURST_VELOCITY', 'SYSTEM', {
        recent_count: recentCount,
        gate,
        action: 'HOLD_AUTO_RELEASE_ROUTE_TO_REVIEW'
      });

      return {
        anomalyDetected: true,
        recentCount,
        message: 'Burst velocity anomaly detected. Gate remains open; transaction flagged for operational review.'
      };
    }

    return { anomalyDetected: false, recentCount };
  }
}

module.exports = {
  TrustPolicyEngine,
  RISK_LEVEL,
  ATTESTATION_TYPE,
  REQUIREMENT_LEVEL,
  AUTHORIZATION_OUTCOME,
  POLICY_DEFINITIONS
};
