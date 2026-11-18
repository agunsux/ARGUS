/**
 * TIKUM / ARGUS — Anti-Conflict & Behavioral Reputation Service (Epic Governance Rule 7)
 * 
 * Factual, auditable trust records without black-box ML or vanity 5-star ratings.
 * 
 * Invariants:
 * 1. Server-side RBAC and domain enforcement strictly prevents any user from:
 *    - Verifying a listing/ticket where they are the seller or have a declared affiliation.
 *    - Witnessing a handover as PIC where they are buyer, seller, or conflicted.
 *    - Approving financial settlement where they are buyer, seller, or conflicted.
 * 2. Audit Trail: All transitions log actor_id, actor_role, timestamp, and reason_code.
 * 3. Tracks factual counters: completed_transactions_count, cancellations_count,
 *    disputes_lost_count, no_show_count, risk_flags, and declared_affiliations.
 */

const { state, recordAuditLog } = require('../database');

class AntiConflictService {
  /**
   * Initializes or normalizes a user's behavioral ledger record.
   */
  static getUserLedger(userId) {
    if (!state.users) state.users = [];
    let user = state.users.find(u => u.id === userId);
    if (!user) return null;

    if (user.completed_transactions_count === undefined) user.completed_transactions_count = 0;
    if (user.cancellations_count === undefined) user.cancellations_count = 0;
    if (user.disputes_lost_count === undefined) user.disputes_lost_count = 0;
    if (user.no_show_count === undefined) user.no_show_count = 0;
    if (!Array.isArray(user.risk_flags)) user.risk_flags = [];
    if (!Array.isArray(user.declared_affiliations)) user.declared_affiliations = [];

    return user;
  }

  /**
   * Sets declared affiliation between a seller/user and a PIC officer or affiliate.
   */
  static setDeclaredAffiliation(userId, affiliatedUserId, relationship = 'DECLARED_PARTNER') {
    const user = this.getUserLedger(userId);
    const affiliated = this.getUserLedger(affiliatedUserId);
    if (!user || !affiliated) {
      const err = new Error('Both users must exist to declare affiliation');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    if (!user.declared_affiliations.includes(affiliatedUserId)) {
      user.declared_affiliations.push(affiliatedUserId);
    }
    if (!affiliated.declared_affiliations.includes(userId)) {
      affiliated.declared_affiliations.push(userId);
    }

    recordAuditLog('ANTI_CONFLICT', userId, 'AFFILIATION_DECLARED', 'admin', {
      user_id: userId,
      affiliated_user_id: affiliatedUserId,
      relationship
    });

    return { success: true, user_id: userId, affiliated_user_id: affiliatedUserId };
  }

  /**
   * Alias for setDeclaredAffiliation
   */
  static recordDeclaredAffiliation(userId, affiliatedUserId, relationship = 'DECLARED_PARTNER') {
    return this.setDeclaredAffiliation(userId, affiliatedUserId, relationship);
  }

  /**
   * Checks if a conflict exists between an actor and a transaction's parties (buyer, seller).
   */
  static hasConflict(actorId, { sellerId = null, buyerId = null }) {
    if (!actorId) return false;

    // Direct match check
    if (sellerId && actorId === sellerId) return true;
    if (buyerId && actorId === buyerId) return true;

    // Check declared affiliations
    const actor = this.getUserLedger(actorId);
    if (actor && Array.isArray(actor.declared_affiliations)) {
      if (sellerId && actor.declared_affiliations.includes(sellerId)) return true;
      if (buyerId && actor.declared_affiliations.includes(buyerId)) return true;
    }

    // Check seller's declared affiliations
    if (sellerId) {
      const seller = this.getUserLedger(sellerId);
      if (seller && Array.isArray(seller.declared_affiliations) && seller.declared_affiliations.includes(actorId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Enforces that an actor can verify a ticket/listing.
   * Rejects if actor is the seller or affiliated.
   */
  static assertCanVerifyListing(actorId, listingOrTicket) {
    if (!actorId) {
      const err = new Error('actorId is required for verification');
      err.code = 'ACTOR_REQUIRED';
      throw err;
    }

    const sellerId = listingOrTicket.seller_id || listingOrTicket.seller_user_id || listingOrTicket.current_owner_id;
    const buyerId = listingOrTicket.buyer_id || listingOrTicket.buyer_user_id;
    if (this.hasConflict(actorId, { sellerId, buyerId })) {
      const err = new Error('Conflict of Interest: Verifier cannot verify a ticket or listing where they are the seller, buyer, or have a declared affiliation');
      err.code = 'CONFLICT_OF_INTEREST_VERIFIER';
      err.status = 403;
      recordAuditLog('CONFLICT_BLOCKED', listingOrTicket.id, 'SELF_VERIFICATION_REJECTED', actorId, { seller_id: sellerId, buyer_id: buyerId });
      throw err;
    }
    return true;
  }

  /**
   * Enforces that an actor can act as PIC for an order.
   * Rejects if actor is buyer, seller, or affiliated.
   */
  static assertCanWitnessHandoff(picUserId, order) {
    if (!picUserId) {
      const err = new Error('picUserId is required for witnessing handover');
      err.code = 'ACTOR_REQUIRED';
      throw err;
    }

    const sellerId = order.seller_id || order.seller_user_id;
    const buyerId = order.buyer_id || order.buyer_user_id;

    if (this.hasConflict(picUserId, { sellerId, buyerId })) {
      const err = new Error('Conflict of Interest: PIC officer cannot witness handover for a transaction where they are the Buyer, Seller, or have a declared affiliation');
      err.code = 'CONFLICT_OF_INTEREST_PIC';
      err.status = 403;
      recordAuditLog('CONFLICT_BLOCKED', order.id, 'PIC_CONFLICT_REJECTED', picUserId, {
        seller_id: sellerId,
        buyer_id: buyerId
      });
      throw err;
    }
    return true;
  }

  /**
   * Alias for assertCanWitnessHandoff
   */
  static assertCanActAsPic(picUserId, order) {
    return this.assertCanWitnessHandoff(picUserId, order);
  }

  /**
   * Enforces that an actor can approve settlement or resolution for an order.
   * Rejects if actor is buyer, seller, or affiliated.
   */
  static assertCanApproveSettlement(actorId, order) {
    if (!actorId) {
      const err = new Error('actorId is required for settlement approval');
      err.code = 'ACTOR_REQUIRED';
      throw err;
    }

    const sellerId = order.seller_id || order.seller_user_id;
    const buyerId = order.buyer_id || order.buyer_user_id;

    if (this.hasConflict(actorId, { sellerId, buyerId })) {
      const err = new Error('Conflict of Interest: Settlement approver cannot approve release for a transaction where they are the Buyer, Seller, or have a declared affiliation');
      err.code = 'CONFLICT_OF_INTEREST_SETTLEMENT_APPROVER';
      err.status = 403;
      recordAuditLog('CONFLICT_BLOCKED', order.id, 'SETTLEMENT_CONFLICT_REJECTED', actorId, {
        seller_id: sellerId,
        buyer_id: buyerId
      });
      throw err;
    }
    return true;
  }

  /**
   * Asserts complete independence across the 3 distinct roles of Buyer No-Show Quorum:
   * 1. PIC Officer at venue (field presence witness)
   * 2. Trust Admin reviewer (evidence & ticket check)
   * 3. Compliance Admin approver (independent sign-off on release)
   * 
   * Invariants:
   * - All 3 roles must be filled by 3 distinct user IDs.
   * - No single person can satisfy multiple roles through aliases, duplicate accounts, or shared credentials.
   * - None of the 3 can be the seller or buyer.
   * - Quorum members cannot have declared affiliations with each other or the seller/buyer.
   */
  static assertQuorumIndependence({ picUserId, trustAdminUserId, complianceAdminUserId, order }) {
    if (!picUserId || !trustAdminUserId || !complianceAdminUserId) {
      const err = new Error('Quorum Incomplete: picUserId, trustAdminUserId, and complianceAdminUserId are all mandatory for Buyer No-Show resolution.');
      err.code = 'QUORUM_INCOMPLETE';
      err.status = 400;
      throw err;
    }

    // Role Separation Invariant: All 3 actors must be distinct user IDs
    const userIds = [picUserId, trustAdminUserId, complianceAdminUserId];
    const uniqueIds = new Set(userIds);
    if (uniqueIds.size !== 3) {
      const err = new Error('Collusion Prevention: A single person or identical user ID cannot occupy multiple approval roles in the Buyer No-Show quorum. PIC, Trust Admin, and Compliance Admin must all be distinct individuals.');
      err.code = 'COLLUSION_PREVENTION_DUPLICATE_ROLE_SLOT';
      err.status = 403;
      recordAuditLog('COLLUSION_ATTEMPT_BLOCKED', order?.id || 'NO_ORDER', 'DUPLICATE_ROLE_SLOT', picUserId, {
        roles: { picUserId, trustAdminUserId, complianceAdminUserId }
      });
      throw err;
    }

    // Check shared identity / alias / phone / email / NIK across the 3 actors
    if (state.users) {
      const u1 = state.users.find(u => u.id === picUserId);
      const u2 = state.users.find(u => u.id === trustAdminUserId);
      const u3 = state.users.find(u => u.id === complianceAdminUserId);
      const users = [u1, u2, u3].filter(Boolean);

      const emails = users.map(u => (u.email || '').toLowerCase().trim()).filter(Boolean);
      const phones = users.map(u => (u.phone || '').trim()).filter(Boolean);
      const niki = users.map(u => (u.nik || '').trim()).filter(Boolean);

      if (new Set(emails).size < emails.length || new Set(phones).size < phones.length || new Set(niki).size < niki.length) {
        const err = new Error('Collusion Prevention: Quorum members share identical email, phone, or NIK credentials (suspected alias/duplicate account).');
        err.code = 'COLLUSION_PREVENTION_SHARED_IDENTITY';
        err.status = 403;
        recordAuditLog('COLLUSION_ATTEMPT_BLOCKED', order?.id || 'NO_ORDER', 'SHARED_CREDENTIALS_ALIAS', picUserId, {
          shared_users: users.map(u => u.id)
        });
        throw err;
      }
    }

    // Check cross-affiliations among quorum members
    if (this.hasConflict(picUserId, { sellerId: trustAdminUserId, buyerId: complianceAdminUserId }) ||
        this.hasConflict(trustAdminUserId, { sellerId: picUserId, buyerId: complianceAdminUserId }) ||
        this.hasConflict(complianceAdminUserId, { sellerId: picUserId, buyerId: trustAdminUserId })) {
      const err = new Error('Collusion Prevention: Quorum members have declared commercial or personal affiliations with each other.');
      err.code = 'COLLUSION_PREVENTION_MUTUAL_AFFILIATION';
      err.status = 403;
      recordAuditLog('COLLUSION_ATTEMPT_BLOCKED', order?.id || 'NO_ORDER', 'QUORUM_MUTUAL_AFFILIATION', picUserId, {
        picUserId,
        trustAdminUserId,
        complianceAdminUserId
      });
      throw err;
    }

    // Check individual conflicts against order parties
    if (order) {
      this.assertCanWitnessHandoff(picUserId, order);
      this.assertCanVerifyListing(trustAdminUserId, order);
      this.assertCanApproveSettlement(complianceAdminUserId, order);
    }

    return true;
  }

  /**
   * Increments behavioral counter upon verifiable event
   */
  static recordOutcome(userId, outcomeType) {
    const user = this.getUserLedger(userId);
    if (!user) return;

    if (outcomeType === 'COMPLETED') user.completed_transactions_count = (user.completed_transactions_count || 0) + 1;
    if (outcomeType === 'CANCELLED') user.cancellations_count = (user.cancellations_count || 0) + 1;
    if (outcomeType === 'DISPUTE_LOST') user.disputes_lost_count = (user.disputes_lost_count || 0) + 1;
    if (outcomeType === 'NO_SHOW') user.no_show_count = (user.no_show_count || 0) + 1;
  }
}

module.exports = {
  AntiConflictService
};
