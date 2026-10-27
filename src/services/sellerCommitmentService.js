/**
 * TIKUM / ARGUS — Seller Commitment & Cancellation Service
 *
 * Enforces seller integrity and accountability post-binding transaction:
 * 1. Track seller cancellations after a binding transaction has been established.
 * 2. Record cancellation reason, timestamp, evidence, and buyer impact.
 * 3. Evaluate buyer impact based on proximity to event start (Critical <= 24h, High <= 72h, Medium > 72h).
 * 4. Maintain configurable seller strikes without assuming a hardcoded permanent suspension rule.
 * 5. Strictly enforce zero seller bonds or unauthorized fund holds in accordance with legal and PG compliance.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const BUYER_IMPACT_LEVEL = {
  CRITICAL: 'CRITICAL', // <= 24 hours to event
  HIGH: 'HIGH',         // 24 - 72 hours to event
  MEDIUM: 'MEDIUM'      // > 72 hours to event
};

const DEFAULT_STRIKE_CONFIG = {
  WARNING_THRESHOLD: 1,
  PROBATION_THRESHOLD: 2,
  SUSPENSION_REVIEW_THRESHOLD: 3,
  CRITICAL_CANCELLATION_WEIGHT: 2, // Immediate double-strike if within 24h of showtime
  STANDARD_CANCELLATION_WEIGHT: 1
};

class SellerCommitmentService {
  /**
   * Evaluates buyer impact level based on hours remaining until event start.
   *
   * @param {number} hoursToEvent - Hours remaining until event start
   * @returns {string} One of BUYER_IMPACT_LEVEL
   */
  static evaluateBuyerImpact(hoursToEvent) {
    if (typeof hoursToEvent !== 'number' || isNaN(hoursToEvent)) {
      return BUYER_IMPACT_LEVEL.MEDIUM;
    }
    if (hoursToEvent <= 24) {
      return BUYER_IMPACT_LEVEL.CRITICAL;
    }
    if (hoursToEvent <= 72) {
      return BUYER_IMPACT_LEVEL.HIGH;
    }
    return BUYER_IMPACT_LEVEL.MEDIUM;
  }

  /**
   * Records a seller-initiated cancellation after a binding transaction has commenced.
   *
   * Invariants:
   * - Must record full operational audit trail with timing, reason, and impact.
   * - Calculates strike increment weighted by buyer impact.
   * - Never deducts financial bond from seller without separate legal authorization.
   *
   * @param {Object} params
   * @param {string} params.orderId - Cancelled order ID
   * @param {string} params.sellerId - Seller ID
   * @param {string} params.reason - Declared cancellation reason
   * @param {number} [params.hoursToEvent=96] - Hours remaining until event
   * @param {string} [params.evidenceRef=null] - Reference to evidence or documentation
   * @param {string} [params.actorId='SYSTEM'] - Operator or seller user ID
   * @param {Object} [params.strikeConfig=DEFAULT_STRIKE_CONFIG] - Configurable strike parameters
   * @returns {Object} Cancellation record and updated seller strike status
   */
  static async recordSellerCancellation({
    orderId,
    sellerId,
    reason,
    hoursToEvent = 96,
    evidenceRef = null,
    actorId = 'SYSTEM',
    strikeConfig = DEFAULT_STRIKE_CONFIG
  }) {
    if (!orderId || !sellerId || !reason) {
      const err = new Error('orderId, sellerId, and reason are required to record seller cancellation');
      err.code = 'INVALID_SELLER_CANCELLATION_PAYLOAD';
      throw err;
    }

    if (!state.seller_cancellations) {
      state.seller_cancellations = [];
    }

    // Idempotency guard: duplicate requests for same order do not double-increment strikes
    const existing = state.seller_cancellations.find(c => c.order_id === orderId && c.seller_id === sellerId);
    if (existing) {
      const profile = (state.seller_profiles || []).find(p => p.user_id === sellerId);
      return {
        idempotent: true,
        cancellation: existing,
        profile: {
          seller_id: sellerId,
          strikes: profile?.strikes || 0,
          cancellation_count: profile?.cancellation_count || 0,
          status: profile?.status || 'ACTIVE',
          buyer_impact: existing.buyer_impact
        },
        appeal_guidance: {
          appeal_allowed: true,
          notice: 'Penjual berhak mengajukan banding atas strike jika pembatalan disebabkan oleh force majeure atau penundaan promotor resmi.'
        }
      };
    }

    const impact = this.evaluateBuyerImpact(hoursToEvent);
    const weight = impact === BUYER_IMPACT_LEVEL.CRITICAL
      ? (strikeConfig.CRITICAL_CANCELLATION_WEIGHT || 2)
      : (strikeConfig.STANDARD_CANCELLATION_WEIGHT || 1);

    const cancellationId = `scanc-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    const cancellationRecord = {
      id: cancellationId,
      cancellation_id: cancellationId,
      order_id: orderId,
      seller_id: sellerId,
      reason,
      hours_to_event: hoursToEvent,
      buyer_impact: impact,
      strike_weight: weight,
      evidence_ref: evidenceRef,
      recorded_by: actorId,
      created_at: now
    };

    state.seller_cancellations.push(cancellationRecord);

    // Update seller profile strikes in database state
    if (!state.seller_profiles) {
      state.seller_profiles = [];
    }
    let profile = state.seller_profiles.find(p => p.user_id === sellerId);
    if (!profile) {
      profile = {
        user_id: sellerId,
        strikes: 0,
        cancellation_count: 0,
        status: 'ACTIVE',
        created_at: now
      };
      state.seller_profiles.push(profile);
    }

    profile.strikes = (profile.strikes || 0) + weight;
    profile.cancellation_count = (profile.cancellation_count || 0) + 1;
    profile.last_cancellation_at = now;
    profile.updated_at = now;

    // Evaluate strike tier against configurable threshold
    let newStatus = profile.status || 'ACTIVE';
    if (profile.strikes >= (strikeConfig.SUSPENSION_REVIEW_THRESHOLD || 3)) {
      newStatus = 'SUSPENDED_PENDING_REVIEW';
    } else if (profile.strikes >= (strikeConfig.PROBATION_THRESHOLD || 2)) {
      newStatus = 'PROBATION';
    } else if (profile.strikes >= (strikeConfig.WARNING_THRESHOLD || 1)) {
      newStatus = 'WARNING';
    }
    profile.status = newStatus;

    try {
      const { DurableFinancialStore } = require('../settlement/DurableFinancialStore');
      DurableFinancialStore.persist('seller_cancellations', state.seller_cancellations);
      DurableFinancialStore.persist('seller_profiles', state.seller_profiles);
    } catch (_) {}

    await recordAuditLog('SELLER_COMMITMENT', cancellationId, 'SELLER_CANCELLATION_RECORDED', actorId, {
      order_id: orderId,
      seller_id: sellerId,
      buyer_impact: impact,
      strikes_added: weight,
      total_strikes: profile.strikes,
      seller_status: profile.status,
      reason
    });

    return {
      cancellation: cancellationRecord,
      profile: {
        seller_id: sellerId,
        strikes: profile.strikes,
        cancellation_count: profile.cancellation_count,
        status: profile.status,
        buyer_impact: impact
      }
    };
  }

  /**
   * Retrieves active seller strike evaluation.
   *
   * @param {string} sellerId - Seller user ID
   * @param {Object} [strikeConfig=DEFAULT_STRIKE_CONFIG]
   * @returns {Object} Strike metrics and status
   */
  static getSellerStrikeStatus(sellerId, strikeConfig = DEFAULT_STRIKE_CONFIG) {
    const profile = (state.seller_profiles || []).find(p => p.user_id === sellerId);
    const strikes = profile?.strikes || 0;
    const cancellations = (state.seller_cancellations || []).filter(c => c.seller_id === sellerId);

    const isSuspensionReview = strikes >= (strikeConfig.SUSPENSION_REVIEW_THRESHOLD || 3);
    const isProbation = strikes >= (strikeConfig.PROBATION_THRESHOLD || 2);
    const isWarning = strikes >= (strikeConfig.WARNING_THRESHOLD || 1);

    return {
      seller_id: sellerId,
      strikes,
      cancellations_count: cancellations.length,
      history: cancellations,
      status: isSuspensionReview ? 'SUSPENDED_PENDING_REVIEW' : (isProbation ? 'PROBATION' : (isWarning ? 'WARNING' : 'ACTIVE')),
      can_list: !isSuspensionReview,
      strike_thresholds: strikeConfig
    };
  }
}

module.exports = {
  SellerCommitmentService,
  BUYER_IMPACT_LEVEL,
  DEFAULT_STRIKE_CONFIG
};
