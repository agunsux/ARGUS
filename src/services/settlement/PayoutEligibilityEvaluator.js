/**
 * TIKUM / ARGUS — Payout Eligibility Evaluator (Epic: Transaction Control Center)
 *
 * Authoritative Server-Side Decision Engine for Seller Payouts.
 * Evaluates orders against strict trust, verification, event lifecycle,
 * and ledger safety invariants.
 *
 * Three-Color Status Model:
 * - RED:       HOLD / ACTION REQUIRED (Dispute, Incident, KYC Suspension, Ticket Failure, Admin Hold)
 * - YELLOW:    IN PROGRESS / PENDING (Payment Pending, KYC Pending, Delivery Pending, Event In Future)
 * - GREEN:     READY FOR PAYOUT (All criteria satisfied; eligible for disburse; GREEN !== PAID)
 * - PAID_OUT:  DISBURSED / TERMINAL (Durable settlement record exists with payout reference)
 *
 * CRITICAL INVARIANT: Evaluator output is authoritative. Frontend cannot override color.
 */

const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('../../discovery/EventTemporalLifecycleEngine');

const COLOR_STATUS = {
  RED: 'RED',
  YELLOW: 'YELLOW',
  GREEN: 'GREEN',
  PAID_OUT: 'PAID_OUT'
};

const BADGE_LABEL = {
  [COLOR_STATUS.RED]: 'Hold / Action Required',
  [COLOR_STATUS.YELLOW]: 'In Progress',
  [COLOR_STATUS.GREEN]: 'Ready for Payout',
  [COLOR_STATUS.PAID_OUT]: 'Paid Out'
};

class PayoutEligibilityEvaluator {
  static COLOR_STATUS = COLOR_STATUS;
  static BADGE_LABEL = BADGE_LABEL;

  /**
   * Evaluates an order and its associated entities to compute payout readiness.
   *
   * @param {Object} context
   * @param {Object} context.order - Financial order
   * @param {Object} [context.escrow] - Associated financial escrow
   * @param {Object} [context.ticket] - Associated ticket asset
   * @param {Object} [context.event] - Associated canonical event
   * @param {Object} [context.sellerProfile] - Seller user or seller profile
   * @param {Array} [context.disputes=[]] - Disputes associated with this order
   * @param {Array} [context.incidents=[]] - Incidents associated with this order
   * @param {Object} [context.entryVerification] - Gate entry record
   * @param {Object} [context.settlement] - Durable settlement record (if already executed)
   * @param {Object} [context.adminHold] - Administrative hold flag/record
   * @param {Date|string|number} [context.now=new Date()] - Evaluation time
   * @returns {Object} Comprehensive evaluation result
   */
  static evaluate({
    order,
    escrow = null,
    ticket = null,
    event = null,
    sellerProfile = null,
    disputes = [],
    incidents = [],
    entryVerification = null,
    settlement = null,
    adminHold = null,
    now = new Date()
  }) {
    if (!order || !order.id) {
      return {
        orderId: null,
        colorStatus: COLOR_STATUS.RED,
        badgeLabel: BADGE_LABEL[COLOR_STATUS.RED],
        payoutEligible: false,
        isPaidOut: false,
        factors: {},
        evaluationReasons: ['Invalid order context'],
        blockingIssues: ['ORDER_MISSING'],
        actionRequired: 'Verify order existence in repository',
        grossAmount: 0,
        netSellerPayout: 0,
        platformFee: 0,
        currency: 'IDR',
        evaluatedAt: new Date().toISOString()
      };
    }

    const orderId = order.id;
    const nowMs = new Date(now).getTime();

    // Financial sums
    const grossAmount = parseInt(order.buyer_total || order.total_amount || order.gross_amount || 0, 10);
    let netSellerPayout = parseInt(order.seller_payout || 0, 10);
    if (!netSellerPayout && order.ticket_price) {
      netSellerPayout = parseInt(order.ticket_price, 10);
    }
    if (!netSellerPayout && escrow && escrow.amount) {
      netSellerPayout = parseInt(escrow.amount, 10);
    }
    const platformFee = Math.max(0, grossAmount - netSellerPayout);

    // 1. TERMINAL STATE CHECK: Already Paid Out?
    const isDisbursed = settlement && (
      settlement.status === 'EXECUTED' ||
      settlement.status === 'DISBURSED' ||
      settlement.status === 'COMPLETED'
    ) && Boolean(settlement.payout_ref);

    if (isDisbursed) {
      return {
        orderId,
        colorStatus: COLOR_STATUS.PAID_OUT,
        badgeLabel: BADGE_LABEL[COLOR_STATUS.PAID_OUT],
        payoutEligible: false,
        isPaidOut: true,
        payoutReference: settlement.payout_ref,
        disbursedAt: settlement.disbursed_at || settlement.executed_at || settlement.updated_at,
        grossAmount,
        netSellerPayout,
        platformFee,
        currency: order.currency || 'IDR',
        factors: {
          paymentConfirmed: true,
          sellerKycVerified: true,
          ticketDelivered: true,
          eventConcludedOrEntryConfirmed: true,
          hasDisputes: false,
          hasIncidents: false,
          hasAdminHold: false,
          settlementExecuted: true
        },
        evaluationReasons: [`Payout successfully disbursed via reference ${settlement.payout_ref}`],
        blockingIssues: [],
        actionRequired: null,
        evaluatedAt: new Date().toISOString()
      };
    }

    // 2. RED CRITERIA EVALUATION (Any single RED factor forces overall RED)
    const redReasons = [];
    const blockingIssues = [];

    // 2.1 Administrative Hold
    const hasAdminHold = Boolean(
      adminHold && (adminHold.active === true || adminHold.status === 'ACTIVE') ||
      order.admin_hold === true ||
      order.hold === true
    );
    if (hasAdminHold) {
      const holdNote = (adminHold && adminHold.reason) || order.hold_reason || 'Administrative hold applied by operations';
      redReasons.push(`Administrative hold active: ${holdNote}`);
      blockingIssues.push('ADMIN_HOLD_ACTIVE');
    }

    // 2.2 Active Disputes
    const activeDisputes = (disputes || []).filter(d =>
      d && ['OPEN', 'INVESTIGATING', 'DECISION_PENDING', 'APPEALED'].includes(String(d.status).toUpperCase())
    );
    if (activeDisputes.length > 0) {
      const dispute = activeDisputes[0];
      redReasons.push(`Active dispute [${dispute.reason || 'UNSPECIFIED'}]: ${dispute.claim_details || 'Pending review'}`);
      blockingIssues.push('ACTIVE_DISPUTE');
    }

    // 2.3 Unresolved Incidents
    const unresolvedIncidents = (incidents || []).filter(inc => {
      if (!inc) return false;
      const status = String(inc.status || '').toUpperCase();
      const type = String(inc.type || '').toUpperCase();
      const isUnresolvedStatus = ['REPORTED', 'INVESTIGATING', 'ESCALATED', 'CONTAINED'].includes(status);
      const isCriticalType = ['FAKE_TICKET', 'DUPLICATE_TICKET', 'ENTRY_FAILURE', 'GATE_REJECTION', 'TICKET_PROBLEM', 'SELLER_NO_SHOW'].includes(type);
      return isUnresolvedStatus || (isCriticalType && status !== 'RESOLVED');
    });
    if (unresolvedIncidents.length > 0) {
      const inc = unresolvedIncidents[0];
      redReasons.push(`Incident logged [${inc.type}]: ${inc.description || 'Action required'}`);
      blockingIssues.push(`INCIDENT_${inc.type}`);
    }

    // 2.4 Entry Verification Rejection / Incident at Gate
    if (entryVerification) {
      const entryStatus = String(entryVerification.status || '').toUpperCase();
      if (['INVALID', 'DUPLICATE_ENTRY', 'GATE_REJECTION', 'TICKET_PROBLEM', 'NO_SHOW_SELLER'].includes(entryStatus)) {
        redReasons.push(`Gate admission failed: ${entryStatus} at ${entryVerification.gate || 'gate'}`);
        blockingIssues.push('GATE_ENTRY_FAILED');
      }
    }

    // 2.5 Ticket Status Rejected / Invalid
    if (ticket) {
      const ticketStatus = String(ticket.status || '').toUpperCase();
      if (ticketStatus === 'REJECTED' || ticketStatus === 'CANCELLED') {
        redReasons.push(`Ticket status is ${ticketStatus}`);
        blockingIssues.push('TICKET_REJECTED');
      }
    }

    // 2.6 Seller KYC Suspended / Prohibited
    if (sellerProfile) {
      const kycStatus = String(sellerProfile.kyc_status || '').toUpperCase();
      const isSuspended = Boolean(sellerProfile.suspended || sellerProfile.status === 'SUSPENDED');
      if (isSuspended || kycStatus === 'SUSPENDED' || kycStatus === 'REJECTED') {
        redReasons.push(`Seller account or KYC is ${isSuspended ? 'SUSPENDED' : kycStatus}`);
        blockingIssues.push('SELLER_SUSPENDED');
      }
    }

    // 2.7 Order / Escrow in Terminal Non-Payable or Frozen State
    const orderStatus = String(order.status || '').toUpperCase();
    if (['CANCELLED', 'REFUNDED', 'CHARGEBACK', 'REJECTED', 'DISPUTED'].includes(orderStatus)) {
      redReasons.push(`Order is in non-payable state: ${orderStatus}`);
      blockingIssues.push(`ORDER_STATUS_${orderStatus}`);
    }

    const escrowStatus = escrow ? String(escrow.status || '').toUpperCase() : null;
    if (escrow && ['DISPUTED', 'FROZEN', 'REFUNDED', 'CANCELLED', 'REJECTED'].includes(escrowStatus)) {
      redReasons.push(`Escrow is in locked/hold state: ${escrowStatus}`);
      blockingIssues.push(`ESCROW_STATUS_${escrowStatus}`);
    }

    if (redReasons.length > 0) {
      return {
        orderId,
        colorStatus: COLOR_STATUS.RED,
        badgeLabel: BADGE_LABEL[COLOR_STATUS.RED],
        payoutEligible: false,
        isPaidOut: false,
        grossAmount,
        netSellerPayout,
        platformFee,
        currency: order.currency || 'IDR',
        factors: {
          paymentConfirmed: ['PAID', 'FUNDED', 'COMPLETED', 'SETTLED', 'ENTRY_CONFIRMED'].includes(orderStatus),
          sellerKycVerified: Boolean(sellerProfile && sellerProfile.kyc_status === 'VERIFIED'),
          ticketDelivered: Boolean(ticket && ['TRANSFERRED', 'DELIVERED', 'REDEEMED', 'USED'].includes(String(ticket.status).toUpperCase())),
          eventConcludedOrEntryConfirmed: Boolean(entryVerification && entryVerification.status === 'CONFIRMED'),
          hasDisputes: activeDisputes.length > 0,
          hasIncidents: unresolvedIncidents.length > 0,
          hasAdminHold,
          settlementExecuted: false
        },
        evaluationReasons: redReasons,
        blockingIssues,
        actionRequired: 'Resolve active disputes, incidents, or administrative holds before payout can proceed',
        payoutReference: null,
        disbursedAt: null,
        evaluatedAt: new Date().toISOString()
      };
    }

    // 3. YELLOW CRITERIA EVALUATION (In Progress / Pending milestones)
    const yellowReasons = [];
    const pendingFactors = [];

    // 3.1 Payment Confirmation
    const isPaymentCaptured = [
      'PAID',
      'FUNDED',
      'COMPLETED',
      'SETTLED',
      'ENTRY_CONFIRMED',
      'DELIVERED',
      'DELIVERY_PENDING',
      'TRANSFER_PENDING'
    ].includes(orderStatus) || (escrow && ['FUNDED', 'VERIFIED', 'DELIVERY_PENDING', 'DELIVERED', 'ENTRY_CONFIRMED', 'RELEASE_PENDING'].includes(escrowStatus));

    if (!isPaymentCaptured) {
      yellowReasons.push(`Payment pending capture (order status: ${orderStatus})`);
      pendingFactors.push('PAYMENT_UNCONFIRMED');
    }

    // 3.2 Seller KYC Verification
    const isSellerVerified = Boolean(
      sellerProfile && (sellerProfile.kyc_status === 'VERIFIED' || sellerProfile.is_verified)
    );
    if (!isSellerVerified) {
      const curStatus = sellerProfile ? (sellerProfile.kyc_status || 'UNVERIFIED') : 'NO_PROFILE';
      yellowReasons.push(`Seller KYC is not yet verified (status: ${curStatus})`);
      pendingFactors.push('SELLER_KYC_PENDING');
    }

    // 3.3 Ticket Delivery / Transfer to Buyer
    const ticketStatus = ticket ? String(ticket.status || '').toUpperCase() : '';
    const isTicketTransferred = [
      'TRANSFERRED',
      'DELIVERED',
      'REDEEMED',
      'USED',
      'VERIFIED_AT_VENUE'
    ].includes(ticketStatus) || [
      'ENTRY_CONFIRMED',
      'DELIVERED',
      'COMPLETED'
    ].includes(orderStatus);

    if (!isTicketTransferred) {
      yellowReasons.push(`Ticket transfer to buyer is pending (ticket status: ${ticketStatus || 'UNKNOWN'})`);
      pendingFactors.push('TICKET_TRANSFER_PENDING');
    }

    // 3.4 Event Conclusion OR Confirmed Gate Entry
    const isGateEntryConfirmed = Boolean(
      entryVerification && String(entryVerification.status).toUpperCase() === 'CONFIRMED'
    ) || orderStatus === 'ENTRY_CONFIRMED';

    let isEventFinished = false;
    if (event) {
      try {
        const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(event);
        if (temporal && temporal.event_end_at) {
          const endMs = new Date(temporal.event_end_at).getTime();
          isEventFinished = nowMs >= endMs;
        }
      } catch (_) {
        isEventFinished = false;
      }
    }

    if (!isGateEntryConfirmed && !isEventFinished) {
      yellowReasons.push('Event is still in the future and physical gate admission has not yet occurred');
      pendingFactors.push('EVENT_NOT_CONCLUDED');
    }

    if (yellowReasons.length > 0) {
      return {
        orderId,
        colorStatus: COLOR_STATUS.YELLOW,
        badgeLabel: BADGE_LABEL[COLOR_STATUS.YELLOW],
        payoutEligible: false,
        isPaidOut: false,
        grossAmount,
        netSellerPayout,
        platformFee,
        currency: order.currency || 'IDR',
        factors: {
          paymentConfirmed: isPaymentCaptured,
          sellerKycVerified: isSellerVerified,
          ticketDelivered: isTicketTransferred,
          eventConcludedOrEntryConfirmed: isGateEntryConfirmed || isEventFinished,
          hasDisputes: false,
          hasIncidents: false,
          hasAdminHold: false,
          settlementExecuted: false
        },
        evaluationReasons: yellowReasons,
        blockingIssues: pendingFactors,
        actionRequired: 'Awaiting operational milestones (payment capture, KYC verification, ticket handoff, or venue gate entry)',
        payoutReference: null,
        disbursedAt: null,
        evaluatedAt: new Date().toISOString()
      };
    }

    // 4. GREEN STATE: All Criteria Satisfied Simultaneously!
    return {
      orderId,
      colorStatus: COLOR_STATUS.GREEN,
      badgeLabel: BADGE_LABEL[COLOR_STATUS.GREEN],
      payoutEligible: true,
      isPaidOut: false,
      grossAmount,
      netSellerPayout,
      platformFee,
      currency: order.currency || 'IDR',
      factors: {
        paymentConfirmed: true,
        sellerKycVerified: true,
        ticketDelivered: true,
        eventConcludedOrEntryConfirmed: true,
        hasDisputes: false,
        hasIncidents: false,
        hasAdminHold: false,
        settlementExecuted: false
      },
      evaluationReasons: [
        'Payment captured and verified in platform ledger',
        'Seller KYC is verified',
        'Ticket successfully transferred to buyer',
        isGateEntryConfirmed
          ? 'Physical gate admission confirmed by venue PIC'
          : 'Event concluded with zero recorded claims',
        'Zero open disputes, incidents, or administrative holds'
      ],
      blockingIssues: [],
      actionRequired: 'Ready for operator payout execution (Disburse Seller Payout)',
      payoutReference: null,
      disbursedAt: null,
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  PayoutEligibilityEvaluator,
  COLOR_STATUS,
  BADGE_LABEL
};
