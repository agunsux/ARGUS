/**
 * TIKUM / ARGUS — Settlement Mode & State Axis Controller (Epic Governance Rule 5)
 * 
 * Enforces decoupling of Payment Provider assumptions, authorized settlement modes,
 * pilot payment channels, and four distinct transaction lifecycle axes.
 * 
 * Safety Invariants:
 * 1. MODE_1_PROTECTED_SETTLEMENT can ONLY be active when PAYMENT_PROVIDER_CUSTODY_APPROVED === 'true'
 * 2. In MODE_2_ASSISTED_DIRECT_PAYMENT, TIKUM never custodies principal funds.
 *    UI copy and T&C MUST suppress escrow/custody language.
 * 3. Credit Card is strictly disabled during pilot (QRIS & Virtual Account only).
 * 4. Four orthogonal axes MUST NOT be conflated.
 */

const SETTLEMENT_MODES = Object.freeze({
  MODE_1_PROTECTED_SETTLEMENT: 'MODE_1_PROTECTED_SETTLEMENT',
  MODE_2_ASSISTED_DIRECT_PAYMENT: 'MODE_2_ASSISTED_DIRECT_PAYMENT'
});

const PILOT_PAYMENT_CHANNELS = Object.freeze({
  QRIS: 'QRIS',
  VIRTUAL_ACCOUNT: 'VIRTUAL_ACCOUNT',
  CREDIT_CARD: 'CREDIT_CARD' // Disabled in pilot
});

// Four strictly decoupled state axes
const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PAYMENT_CONFIRMED_PROVIDER: 'PAYMENT_CONFIRMED_PROVIDER',
  FEE_ONLY_PAID: 'FEE_ONLY_PAID',
  REFUNDED: 'REFUNDED'
});

const TICKET_VERIFICATION_STATUS = Object.freeze({
  UNREVIEWED: 'UNREVIEWED',
  OWNERSHIP_EVIDENCE_REVIEWED: 'OWNERSHIP_EVIDENCE_REVIEWED',
  FULFILLMENT_DOCUMENT_VERIFIED: 'FULFILLMENT_DOCUMENT_VERIFIED',
  INVALID_FLAGGED: 'INVALID_FLAGGED'
});

const HANDOVER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SCHEDULED_AT_VENUE: 'SCHEDULED_AT_VENUE',
  PIC_HANDOVER_WITNESSED: 'PIC_HANDOVER_WITNESSED',
  DIGITAL_TRANSFERRED: 'DIGITAL_TRANSFERRED',
  BUYER_CONFIRMED: 'BUYER_CONFIRMED',
  NO_SHOW_REVIEW: 'NO_SHOW_REVIEW'
});

const SETTLEMENT_STATUS = Object.freeze({
  NOT_APPLICABLE_DIRECT: 'NOT_APPLICABLE_DIRECT',
  HELD_PENDING_CONDITIONS: 'HELD_PENDING_CONDITIONS',
  ELIGIBLE_FOR_PAYOUT: 'ELIGIBLE_FOR_PAYOUT',
  SETTLED: 'SETTLED',
  DISPUTE_FROZEN: 'DISPUTE_FROZEN'
});

/**
 * Mode 2 Merchant Activity Governance
 * Mode 2 avoids holding ticket principal, but TIKUM Platform Service Fee collection
 * must still strictly match approved merchant activity under payment gateway rules.
 * 
 * CRITICAL COMPLIANCE INVARIANT:
 * Proposed MCC classification (e.g. 7372 SaaS) is NOT provider-approved until formal
 * written confirmation is issued by the payment provider (DOKU/iPaymu).
 */
const MODE_2_MERCHANT_GOVERNANCE = Object.freeze({
  proposed_merchant_category_code: '7372', // Proposed: SaaS & Ticketing Software Facilitator
  business_activity_title: 'Software Platform Layanan Penyelenggara Transaksi Tiket (SaaS Technology Facilitator)',
  authorized_charge_type: 'PLATFORM_SERVICE_FEE_ONLY',
  collects_ticket_principal: false,
  is_provider_confirmed: false, // Strict governance: NEVER claim provider approval without written proof
  compliance_advisory: 'Mode 2 eliminates ticket principal custody liability. However, separate collection of TIKUM Platform Service Fees (6% min Rp35k, max Rp500k) through payment gateway QRIS/VA is a PROPOSED classification and CANNOT be treated as pre-approved without written underwriting confirmation from the payment provider (DOKU/iPaymu).'
});

/**
 * Formal Provider Custody Agreement Registry (Auditable Governance Requirement)
 * An environment variable ALONE (e.g. PAYMENT_PROVIDER_CUSTODY_APPROVED=true) cannot enable
 * Mode 1 Protected Settlement. Activation strictly requires a formal, registered written agreement
 * fulfilling all 6 criteria:
 * 1. Provider Identity ('DOKU' | 'IPAYMU' | 'XENDIT') & Merchant ID
 * 2. Approved Product ('MARKETPLACE_ESCROW_DISBURSEMENT')
 * 3. Written Agreement Reference & Scope
 * 4. Valid Effective Date (<= now) & Expiry Date (> now)
 * 5. Document Audit Hash (SHA-256 of signed contract)
 * 6. Dual Authorized Internal Sign-offs (e.g. Legal Counsel & Compliance Director)
 */
class ProviderCustodyAgreementRegistry {
  static agreements = [];

  static reset() {
    this.agreements = [];
  }

  static registerAgreement({
    providerId,
    merchantId,
    approvedProduct,
    writtenAgreementRef,
    agreementScope,
    effectiveDate,
    expiryDate,
    documentAuditHash,
    authorizedInternalSignoffs
  }) {
    if (!providerId || !merchantId || !approvedProduct || !writtenAgreementRef) {
      const err = new Error('Incomplete agreement registration: providerId, merchantId, approvedProduct, and writtenAgreementRef are mandatory.');
      err.code = 'INCOMPLETE_CUSTODY_AGREEMENT';
      throw err;
    }

    if (!effectiveDate || !expiryDate) {
      const err = new Error('Validity period mandatory: effectiveDate and expiryDate required.');
      err.code = 'INVALID_AGREEMENT_DATES';
      throw err;
    }

    const now = new Date();
    const eff = new Date(effectiveDate);
    const exp = new Date(expiryDate);
    if (eff > now || exp <= now) {
      const err = new Error('Agreement is not active or has expired.');
      err.code = 'AGREEMENT_DATE_EXPIRED_OR_FUTURE';
      throw err;
    }

    if (!documentAuditHash || typeof documentAuditHash !== 'string' || documentAuditHash.length < 32) {
      const err = new Error('Auditable document hash (SHA-256) is mandatory.');
      err.code = 'MISSING_DOCUMENT_AUDIT_HASH';
      throw err;
    }

    if (!Array.isArray(authorizedInternalSignoffs) || authorizedInternalSignoffs.length < 2) {
      const err = new Error('Dual internal executive sign-off required (minimum 2 distinct authorized officers).');
      err.code = 'INSUFFICIENT_INTERNAL_SIGNOFFS';
      throw err;
    }

    const officerIds = new Set(authorizedInternalSignoffs.map(s => s.officerId || s.officer_id));
    if (officerIds.size < 2) {
      const err = new Error('Sign-offs must be from at least two distinct authorized officers.');
      err.code = 'DUPLICATE_INTERNAL_SIGNOFF_OFFICER';
      throw err;
    }

    const record = {
      agreement_id: `AGR-${Date.now()}-${providerId}`,
      provider_id: providerId,
      merchant_id: merchantId,
      approved_product: approvedProduct,
      written_agreement_ref: writtenAgreementRef,
      agreement_scope: agreementScope,
      effective_date: effectiveDate,
      expiry_date: expiryDate,
      document_audit_hash: documentAuditHash,
      authorized_internal_signoffs: authorizedInternalSignoffs,
      registered_at: new Date().toISOString(),
      is_valid: true
    };

    this.agreements.push(record);
    return record;
  }

  static getActiveCustodyAgreement(providerId = null) {
    const now = new Date();
    return this.agreements.find(a => {
      if (providerId && a.provider_id !== providerId) return false;
      const eff = new Date(a.effective_date);
      const exp = new Date(a.expiry_date);
      return a.is_valid && eff <= now && exp > now;
    }) || null;
  }
}

let testSettlementModeOverride = null;

class PaymentModeController {
  /**
   * Resolves current settlement mode with strict fail-safe to MODE_2_ASSISTED_DIRECT_PAYMENT.
   * An environment variable ALONE is rejected as insufficient governance proof;
   * Mode 1 activation strictly requires a verified written custody agreement in ProviderCustodyAgreementRegistry.
   */
  static getSettlementMode() {
    if (testSettlementModeOverride) {
      return testSettlementModeOverride;
    }

    const requestedMode = (process.env.SETTLEMENT_MODE || '').trim().toUpperCase();

    // Guard: MODE_1 requires verified written custody agreement
    if (requestedMode === SETTLEMENT_MODES.MODE_1_PROTECTED_SETTLEMENT) {
      const activeAgreement = ProviderCustodyAgreementRegistry.getActiveCustodyAgreement();
      if (activeAgreement && activeAgreement.is_valid) {
        return SETTLEMENT_MODES.MODE_1_PROTECTED_SETTLEMENT;
      }
      // Fail closed to Mode 2 if unapproved or agreement missing
      return SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT;
    }

    // Default: Fallback assisted direct payment
    return SETTLEMENT_MODES.MODE_2_ASSISTED_DIRECT_PAYMENT;
  }

  static setSettlementModeForTesting(mode) {
    testSettlementModeOverride = mode;
  }

  static resetSettlementModeForTesting() {
    testSettlementModeOverride = null;
  }

  /**
   * Checks if payment channel is permitted during pilot.
   * QRIS and VA are allowed. Credit Card is strictly rejected.
   */
  static validatePaymentChannel(channel) {
    const norm = (channel || '').toUpperCase().trim();
    if (norm === PILOT_PAYMENT_CHANNELS.CREDIT_CARD) {
      return {
        allowed: false,
        code: 'PAYMENT_CHANNEL_DISABLED_IN_PILOT',
        reason: 'Kanal pembayaran Kartu Kredit dinonaktifkan selama masa pilot untuk perlindungan margin dan pencegahan risiko chargeback. Silakan gunakan QRIS atau Virtual Account (VA).'
      };
    }

    if (norm === PILOT_PAYMENT_CHANNELS.QRIS || norm === PILOT_PAYMENT_CHANNELS.VIRTUAL_ACCOUNT || norm === 'VA') {
      return {
        allowed: true,
        channel: norm === 'VA' ? PILOT_PAYMENT_CHANNELS.VIRTUAL_ACCOUNT : norm
      };
    }

    return {
      allowed: false,
      code: 'UNSUPPORTED_PAYMENT_CHANNEL',
      reason: `Kanal pembayaran '${channel}' tidak didukung. Kanal resmi yang aktif: QRIS dan Virtual Account.`
    };
  }

  /**
   * Returns copy text guidance for the active settlement mode to ensure truthfulness.
   */
  static getModeTerminology() {
    const mode = this.getSettlementMode();
    if (mode === SETTLEMENT_MODES.MODE_1_PROTECTED_SETTLEMENT) {
      return {
        mode,
        isCustodial: true,
        badgeText: 'Penyelesaian Terlindungi (Protected Settlement)',
        description: 'Dana ditampung secara aman oleh gerbang pembayaran berizin resmi hingga serah terima tiket terverifikasi.',
        disclaimer: 'Penyelesaian transaksi dilakukan melalui rekening penampungan resmi mitra berizin.'
      };
    }

    return {
      mode,
      isCustodial: false,
      badgeText: 'Transaksi Langsung Terdampingi (Assisted Direct Payment)',
      description: 'TIKUM tidak menampung pokok dana tiket Anda. Pembayaran tiket dilakukan langsung antara pembeli dan penjual, didampingi verifikasi bukti dan PIC TIKUM.',
      disclaimer: 'TIKUM hanya memproses Biaya Layanan Platform. TIKUM bukan lembaga escrow perbankan.'
    };
  }

  /**
   * Initializes decoupled four state axes on an order/deal record
   */
  static initializeDecoupledAxes({
    paymentStatus = PAYMENT_STATUS.UNPAID,
    ticketVerificationStatus = TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED,
    handoverStatus = HANDOVER_STATUS.PENDING,
    settlementStatus = null
  } = {}) {
    const mode = this.getSettlementMode();
    const resolvedSettlementStatus = settlementStatus || (
      mode === SETTLEMENT_MODES.MODE_1_PROTECTED_SETTLEMENT
        ? SETTLEMENT_STATUS.HELD_PENDING_CONDITIONS
        : SETTLEMENT_STATUS.NOT_APPLICABLE_DIRECT
    );

    return {
      payment_status: paymentStatus,
      ticket_verification_status: ticketVerificationStatus,
      handover_status: handoverStatus,
      settlement_status: resolvedSettlementStatus,
      settlement_mode: mode
    };
  }
}

module.exports = {
  SETTLEMENT_MODES,
  PILOT_PAYMENT_CHANNELS,
  PAYMENT_STATUS,
  TICKET_VERIFICATION_STATUS,
  HANDOVER_STATUS,
  SETTLEMENT_STATUS,
  PaymentModeController,
  ProviderCustodyAgreementRegistry,
  MODE_2_MERCHANT_GOVERNANCE,
  PAYMENT_MODES: SETTLEMENT_MODES,
  getPaymentMode: PaymentModeController.getSettlementMode.bind(PaymentModeController),
  validatePaymentChannel: PaymentModeController.validatePaymentChannel.bind(PaymentModeController),
  DECOUPLED_STATE_AXES: {
    PAYMENT_STATUS,
    TICKET_VERIFICATION_STATUS,
    HANDOVER_STATUS,
    SETTLEMENT_STATUS
  }
};
