/**
 * TIKUM / ARGUS — Explainable Seller Trust Infrastructure (Epic E)
 * 
 * Multi-dimensional, transparent trust assessment.
 * Replaces arbitrary single "magic scores" with 4 explainable pillars:
 * 1. IDENTITY TRUST
 * 2. TRANSACTION TRUST
 * 3. TICKET TRUST
 * 4. BEHAVIOR RISK
 * 
 * Prevents permanent condemnation from a single false positive by providing
 * distinct signal categorization and operational review states.
 */

const { state, recordAuditLog } = require('../database');

const TRUST_TIER = {
  VERIFIED_MERCHANT: 'VERIFIED_MERCHANT',
  TRUSTED_COMMUNITY: 'TRUSTED_COMMUNITY',
  STANDARD_SELLER: 'STANDARD_SELLER',
  PROBATIONARY: 'PROBATIONARY',
  SUSPENDED: 'SUSPENDED'
};

class SellerTrustService {
  /**
   * Computes an explainable, 4-pillar trust evaluation for a seller.
   */
  static evaluateSeller(sellerId) {
    const user = state.users.find(u => u.id === sellerId);
    if (!user) {
      const err = new Error(`Seller '${sellerId}' not found`);
      err.code = 'SELLER_NOT_FOUND';
      throw err;
    }

    const sellerProfile = (state.seller_profiles && state.seller_profiles.find(p => p.user_id === sellerId)) || {};

    // 1. IDENTITY TRUST
    const isKycVerified = sellerProfile.kyc_status === 'VERIFIED';
    const hasPhone = !!user.phone;
    const hasEmail = !!user.email;
    const accountAgeDays = user.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)))
      : 30;

    const identityTrust = {
      kyc_status: sellerProfile.kyc_status || 'UNVERIFIED',
      is_kyc_verified: isKycVerified,
      phone_verified: hasPhone,
      email_verified: hasEmail,
      account_age_days: accountAgeDays,
      score: (isKycVerified ? 50 : 10) + (hasPhone ? 25 : 0) + (hasEmail ? 25 : 0),
      explanation: isKycVerified
        ? 'Identitas KTP/KYC terverifikasi resmi oleh Trust Officer ARGUS.'
        : 'Verifikasi identitas belum lengkap (KYC diperlukan untuk listing volume tinggi).'
    };

    // 2. TRANSACTION TRUST
    const sellerOrders = state.orders ? state.orders.filter(o => o.seller_id === sellerId) : [];
    const successfulOrders = sellerOrders.filter(o => o.status === 'SETTLED' || o.status === 'ENTRY_CONFIRMED');
    const refundedOrders = sellerOrders.filter(o => o.status === 'REFUNDED');
    const totalTransactions = sellerOrders.length;
    const completionRate = totalTransactions > 0 ? (successfulOrders.length / totalTransactions) * 100 : 100;

    const transactionTrust = {
      total_orders: totalTransactions,
      successful_orders: successfulOrders.length,
      refunded_orders: refundedOrders.length,
      completion_rate_percent: Math.round(completionRate),
      score: totalTransactions === 0 ? 50 : Math.min(100, Math.round(completionRate)),
      explanation: totalTransactions === 0
        ? 'Penjual baru tanpa riwayat transaksi sebelumnya.'
        : `${successfulOrders.length} dari ${totalTransactions} transaksi berhasil diselesaikan tanpa kendala.`
    };

    // 3. TICKET TRUST
    const sellerTickets = state.tickets ? state.tickets.filter(t => t.seller_id === sellerId || t.current_owner_id === sellerId) : [];
    const verifiedTickets = sellerTickets.filter(t => t.verification_status === 'VERIFIED' || t.status === 'VERIFIED');
    const rejectedTickets = sellerTickets.filter(t => t.verification_status === 'REJECTED');

    const ticketTrust = {
      total_registered_tickets: sellerTickets.length,
      verified_tickets: verifiedTickets.length,
      rejected_tickets: rejectedTickets.length,
      ticket_verification_rate: sellerTickets.length > 0 ? Math.round((verifiedTickets.length / sellerTickets.length) * 100) : 100,
      score: sellerTickets.length === 0 ? 50 : Math.max(0, 100 - (rejectedTickets.length * 35)),
      explanation: rejectedTickets.length > 0
        ? `Perhatian: Terdapat ${rejectedTickets.length} tiket yang ditolak oleh sistem verifikasi ARGUS.`
        : 'Semua tiket yang diajukan memiliki bukti kepemilikan yang valid.'
    };

    // 4. BEHAVIOR RISK
    const sellerDisputes = state.disputes ? state.disputes.filter(d => d.seller_id === sellerId) : [];
    const sellerLostDisputes = sellerDisputes.filter(d => d.outcome === 'REFUND_BUYER');
    const incidents = state.incidents ? state.incidents.filter(i => i.seller_id === sellerId) : [];

    const riskSignals = [];
    if (sellerLostDisputes.length > 0) {
      riskSignals.push(`DISPUTE_BUYER_FAVORED_${sellerLostDisputes.length}`);
    }
    if (rejectedTickets.length >= 2) {
      riskSignals.push('MULTIPLE_REJECTED_TICKETS');
    }
    if (incidents.some(i => i.type === 'FAKE_TICKET')) {
      riskSignals.push('CRITICAL_FAKE_TICKET_FLAG');
    }

    const behaviorRisk = {
      total_disputes: sellerDisputes.length,
      lost_disputes: sellerLostDisputes.length,
      incidents_count: incidents.length,
      risk_level: riskSignals.some(s => s.includes('CRITICAL')) ? 'CRITICAL' : (riskSignals.length > 0 ? 'HIGH' : 'LOW'),
      active_risk_signals: riskSignals,
      explanation: riskSignals.length === 0
        ? 'Perilaku normal tanpa sinyal risiko kecurangan.'
        : `Terdeteksi sinyal risiko operasional: ${riskSignals.join(', ')}`
    };

    // Determine Overall Tier without arbitrary magic score
    let tier;
    if (behaviorRisk.risk_level === 'CRITICAL' || sellerProfile.suspended) {
      tier = TRUST_TIER.SUSPENDED;
    } else if (behaviorRisk.risk_level === 'HIGH' || rejectedTickets.length > 0) {
      tier = TRUST_TIER.PROBATIONARY;
    } else if (isKycVerified && successfulOrders.length >= 3 && rejectedTickets.length === 0) {
      tier = TRUST_TIER.VERIFIED_MERCHANT;
    } else if (successfulOrders.length >= 1) {
      tier = TRUST_TIER.TRUSTED_COMMUNITY;
    } else {
      tier = TRUST_TIER.STANDARD_SELLER;
    }

    return {
      seller_id: sellerId,
      tier,
      is_suspended: tier === TRUST_TIER.SUSPENDED,
      can_list_tickets: tier !== TRUST_TIER.SUSPENDED,
      identity_trust: identityTrust,
      transaction_trust: transactionTrust,
      ticket_trust: ticketTrust,
      behavior_risk: behaviorRisk,
      appeal_available: tier === TRUST_TIER.PROBATIONARY || tier === TRUST_TIER.SUSPENDED,
      evaluated_at: new Date().toISOString()
    };
  }

  /**
   * Officer applies administrative review or suspension adjustment.
   */
  static async adjustSellerStatus({ sellerId, officerId, status, reason }) {
    let profile = state.seller_profiles && state.seller_profiles.find(p => p.user_id === sellerId);
    if (!profile) {
      profile = { user_id: sellerId, kyc_status: 'UNVERIFIED', active_listing_limit: 5 };
      if (!state.seller_profiles) state.seller_profiles = [];
      state.seller_profiles.push(profile);
    }

    const previousStatus = profile.status || 'ACTIVE';
    profile.status = status;
    profile.suspended = status === 'SUSPENDED';
    profile.status_reason = reason;
    profile.updated_at = new Date().toISOString();

    await recordAuditLog('SELLER_TRUST', sellerId, status, officerId, {
      previous_status: previousStatus,
      new_status: status,
      reason
    });

    return profile;
  }
}

module.exports = {
  SellerTrustService,
  TRUST_TIER
};
