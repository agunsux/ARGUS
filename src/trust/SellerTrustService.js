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
   * Async version of evaluateSeller that hydrates user and seller_profile from UserRepository on cold start.
   */
  static async evaluateSellerAsync(sellerId) {
    try {
      const { getUserRepository } = require('../storage');
      const userRepo = getUserRepository();
      if (!state.users.find(u => u.id === sellerId)) {
        const dbUser = await userRepo.getUserById(sellerId);
        if (dbUser) {
          state.users.push(dbUser);
        }
      }
      const dbProfile = await userRepo.getSellerProfile(sellerId);
      if (dbProfile) {
        if (!state.seller_profiles) state.seller_profiles = [];
        const idx = state.seller_profiles.findIndex(p => p.user_id === sellerId);
        if (idx >= 0) {
          state.seller_profiles[idx] = { ...state.seller_profiles[idx], ...dbProfile };
        } else {
          state.seller_profiles.push(dbProfile);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw err;
      }
    }
    return this.evaluateSeller(sellerId);
  }

  /**
   * Authenticated user submits a seller onboarding & KYC verification request.
   * Sets kyc_status to PENDING_REVIEW. Users can NEVER self-set VERIFIED.
   */
  static async submitOnboarding({
    userId,
    displayName = null,
    fullName = null,
    nikHash = null,
    nik = null,
    phone = null,
    payoutBank = null,
    bankName = null,
    payoutAccountMasked = null,
    bankAccountNumber = null,
    ipAddress = '127.0.0.1'
  }) {
    if (!userId) {
      const err = new Error('Authentication required');
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }

    const { getUserRepository } = require('../storage');
    const userRepo = getUserRepository();
    const user = await userRepo.getUserById(userId) || (state.users || []).find(u => u.id === userId);
    if (!user) {
      const err = new Error('User not found');
      err.code = 'USER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const existing = await userRepo.getSellerProfile(userId) ||
      ((state.seller_profiles || []).find(p => p.user_id === userId) || null);

    if (existing && (existing.suspended || existing.status === 'SUSPENDED' || existing.kyc_status === 'SUSPENDED')) {
      const err = new Error('Akun penjual sedang ditangguhkan (SUSPENDED). Hubungi tim operasional TIKUM.');
      err.code = 'SELLER_SUSPENDED';
      err.status = 403;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const isAlreadyVerified = Boolean(existing && existing.kyc_status === 'VERIFIED');
    const nextKycStatus = isAlreadyVerified ? 'VERIFIED' : 'PENDING_REVIEW';

    const resolvedName = displayName || fullName;
    const resolvedNik = nikHash || nik;
    const resolvedBank = payoutBank || bankName;
    const resolvedAcct = payoutAccountMasked || bankAccountNumber;

    const profileUpdates = {
      user_id: userId,
      kyc_status: nextKycStatus,
      active_listing_limit: existing && typeof existing.active_listing_limit === 'number' ? existing.active_listing_limit : 10,
      display_name: resolvedName ? String(resolvedName).trim().slice(0, 120) : (existing?.display_name || user.display_name || user.name || null),
      nik_hash: resolvedNik ? String(resolvedNik).trim().slice(0, 128) : (existing?.nik_hash || null),
      payout_bank: resolvedBank ? String(resolvedBank).trim().slice(0, 60) : (existing?.payout_bank || null),
      payout_account_masked: resolvedAcct ? String(resolvedAcct).trim().slice(0, 60) : (existing?.payout_account_masked || null),
      requested_at: existing?.requested_at || nowIso,
      rejection_reason: null,
      updated_at: nowIso
    };

    const savedProfile = await userRepo.upsertSellerProfile(userId, profileUpdates) || profileUpdates;

    if (phone && typeof userRepo.updateUser === 'function') {
      await userRepo.updateUser(userId, { phone: String(phone).trim().slice(0, 30) }).catch(() => {});
    }

    if (!state.seller_profiles) state.seller_profiles = [];
    const memIdx = state.seller_profiles.findIndex(p => p.user_id === userId);
    if (memIdx >= 0) {
      state.seller_profiles[memIdx] = { ...state.seller_profiles[memIdx], ...savedProfile };
    } else {
      state.seller_profiles.push({ ...savedProfile });
    }

    try {
      await userRepo.recordAuthAudit({
        userId,
        eventType: 'SELLER_ONBOARDING_SUBMITTED',
        success: true,
        ipAddress,
        metadata: {
          kyc_status: savedProfile.kyc_status,
          payout_bank: savedProfile.payout_bank
        }
      });
    } catch (_) {}

    await recordAuditLog('SELLER_ONBOARDING', userId, 'ONBOARDING_SUBMITTED', userId, {
      kyc_status: savedProfile.kyc_status,
      requested_at: savedProfile.requested_at
    });

    return {
      ...savedProfile,
      profile: savedProfile,
      alreadyVerified: isAlreadyVerified
    };
  }

  /**
   * Admin verifies, rejects, or suspends a seller's KYC & onboarding profile.
   */
  static async reviewSellerKyc({
    sellerId,
    adminId,
    kycStatus,
    activeListingLimit = null,
    reason = null,
    ipAddress = '127.0.0.1'
  }) {
    const allowedStatuses = ['VERIFIED', 'REJECTED', 'SUSPENDED', 'PENDING_REVIEW', 'UNVERIFIED'];
    const normStatus = String(kycStatus || '').trim().toUpperCase();
    if (!allowedStatuses.includes(normStatus)) {
      const err = new Error(`Invalid KYC status '${kycStatus}'. Must be one of: ${allowedStatuses.join(', ')}`);
      err.code = 'INVALID_KYC_STATUS';
      err.status = 400;
      throw err;
    }

    if ((normStatus === 'REJECTED' || normStatus === 'SUSPENDED') && (!reason || !String(reason).trim())) {
      const err = new Error(`A reason is required when setting seller status to ${normStatus}`);
      err.code = 'REASON_REQUIRED';
      err.status = 400;
      throw err;
    }

    const { getUserRepository } = require('../storage');
    const userRepo = getUserRepository();
    const user = await userRepo.getUserById(sellerId) || (state.users || []).find(u => u.id === sellerId);
    if (!user) {
      const err = new Error(`Seller user '${sellerId}' not found`);
      err.code = 'USER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const existing = await userRepo.getSellerProfile(sellerId) ||
      ((state.seller_profiles || []).find(p => p.user_id === sellerId) || {});
    const previousKycStatus = existing.kyc_status || 'UNVERIFIED';
    const nowIso = new Date().toISOString();

    const parsedLimit = activeListingLimit !== null && activeListingLimit !== undefined
      ? Math.max(0, parseInt(activeListingLimit, 10) || 10)
      : (typeof existing.active_listing_limit === 'number' ? existing.active_listing_limit : 10);

    const profileUpdates = {
      user_id: sellerId,
      kyc_status: normStatus,
      active_listing_limit: parsedLimit,
      suspended: normStatus === 'SUSPENDED',
      status: normStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      verified_at: normStatus === 'VERIFIED' ? nowIso : (existing.verified_at || null),
      verified_by: normStatus === 'VERIFIED' ? adminId : (existing.verified_by || null),
      rejection_reason: normStatus === 'REJECTED' ? String(reason).trim() : null,
      suspension_reason: normStatus === 'SUSPENDED' ? String(reason).trim() : null,
      updated_at: nowIso
    };

    const savedProfile = await userRepo.upsertSellerProfile(sellerId, profileUpdates) || profileUpdates;

    // If verified, also grant SELLER role in user_roles (and upgrade BUYER -> SELLER primary role)
    if (normStatus === 'VERIFIED') {
      try {
        await userRepo.assignUserRole(sellerId, 'SELLER', adminId);
        if ((user.role || '').toUpperCase() === 'BUYER') {
          await userRepo.updateUser(sellerId, { role: 'SELLER' });
          const memUser = (state.users || []).find(u => u.id === sellerId);
          if (memUser) memUser.role = 'SELLER';
        }
      } catch (_) {}
    }

    if (!state.seller_profiles) state.seller_profiles = [];
    const memIdx = state.seller_profiles.findIndex(p => p.user_id === sellerId);
    if (memIdx >= 0) {
      state.seller_profiles[memIdx] = { ...state.seller_profiles[memIdx], ...savedProfile };
    } else {
      state.seller_profiles.push({ ...savedProfile });
    }

    try {
      await userRepo.recordAuthAudit({
        userId: sellerId,
        eventType: `SELLER_KYC_${normStatus}`,
        success: true,
        ipAddress,
        metadata: {
          reviewed_by: adminId,
          previous_kyc_status: previousKycStatus,
          new_kyc_status: normStatus,
          active_listing_limit: parsedLimit,
          reason: reason || null
        }
      });
    } catch (_) {}

    await recordAuditLog('SELLER_KYC', sellerId, `KYC_${normStatus}`, adminId, {
      previous_kyc_status: previousKycStatus,
      new_kyc_status: normStatus,
      active_listing_limit: parsedLimit,
      reason: reason || null
    });

    return {
      ...savedProfile,
      profile: savedProfile
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

    try {
      const { getUserRepository } = require('../storage');
      const userRepo = getUserRepository();
      await userRepo.upsertSellerProfile(sellerId, {
        status,
        suspended: status === 'SUSPENDED',
        suspension_reason: status === 'SUSPENDED' ? reason : null
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw err;
      }
    }

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
