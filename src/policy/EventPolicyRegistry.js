/**
 * TIKUM / ARGUS — Promoter & Event Policy Registry (Epic Governance Rule 2 & 6)
 * 
 * Strategic asset managing event transferability rules, promoter policies,
 * and 3-tier risk-based transaction routing.
 * 
 * Invariants:
 * 1. Default Safety Rule: Every newly created event defaults to POLICY_UNVERIFIED
 *    and CANNOT accept live transactions until an Admin verifies and sets its policy tier.
 * 2. Risk-Based PIC Routing:
 *    - TIER_A_DIGITAL -> DIGITAL_TRANSFER (No PIC required)
 *    - TIER_B_VENUE_ASSISTED -> VENUE_ASSISTED (Event PIC mandatory)
 *    - TIER_C_RESTRICTED / POLICY_UNVERIFIED / POLICY_RESTRICTED -> Blocked
 */

const { state, recordAuditLog } = require('../database');

const RISK_TIERS = Object.freeze({
  TIER_A_DIGITAL: 'TIER_A_DIGITAL',
  TIER_B_VENUE_ASSISTED: 'TIER_B_VENUE_ASSISTED',
  TIER_C_RESTRICTED: 'TIER_C_RESTRICTED'
});

const POLICY_STATUS = Object.freeze({
  POLICY_UNVERIFIED: 'POLICY_UNVERIFIED',
  POLICY_VERIFIED_ACTIVE: 'POLICY_VERIFIED_ACTIVE',
  POLICY_RESTRICTED: 'POLICY_RESTRICTED'
});

const TRANSFERABILITY = Object.freeze({
  ALLOWED: 'ALLOWED',
  LIMITED: 'LIMITED',
  UNCLEAR: 'UNCLEAR',
  PROHIBITED: 'PROHIBITED'
});

const FULFILLMENT_ROUTING = Object.freeze({
  DIGITAL_TRANSFER: 'DIGITAL_TRANSFER',
  VENUE_ASSISTED: 'VENUE_ASSISTED',
  RESTRICTED_UNVERIFIED: 'RESTRICTED_UNVERIFIED'
});

class EventPolicyRegistry {
  /**
   * Initializes or seeds policies for known events
   */
  static init() {
    if (!state.event_policies) {
      state.event_policies = [];
    }

    if (this._isSeeding || this._seeded) return;

    if (state.event_policies.length === 0) {
      this._isSeeding = true;
      // Seed standard pilot events for 3 tiers
      this.registerEventPolicy({
        eventId: 'coldplay-jkt-2026',
        promoterName: 'PK Entertainment & Third Eye Management',
        officialTicketingPartner: 'Loket.com',
        transferability: TRANSFERABILITY.ALLOWED,
        isNominative: false,
        wristbandExchangeRequired: false,
        policySourceUrl: 'https://coldplayinjakarta.com/terms',
        riskTier: RISK_TIERS.TIER_A_DIGITAL,
        policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
        actorId: 'SYSTEM_BOOTSTRAP'
      });

      this.registerEventPolicy({
        eventId: 'ed-sheeran-jkt-2026',
        promoterName: 'AEG Presents Asia & PK Entertainment',
        officialTicketingPartner: 'Tiket.com',
        transferability: TRANSFERABILITY.LIMITED,
        isNominative: true,
        wristbandExchangeRequired: true,
        originalKtpRequired: true,
        suratKuasaAllowed: true,
        policySourceUrl: 'https://edsheeraninjakarta.com/terms',
        riskTier: RISK_TIERS.TIER_B_VENUE_ASSISTED,
        policyStatus: POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
        actorId: 'SYSTEM_BOOTSTRAP'
      });

      this.registerEventPolicy({
        eventId: 'taylor-swift-unauthorized-2026',
        promoterName: 'Promotor Tidak Resmi',
        officialTicketingPartner: 'Unknown / Black Market',
        transferability: TRANSFERABILITY.PROHIBITED,
        isNominative: true,
        wristbandExchangeRequired: false,
        policySourceUrl: 'https://promoter-notice.com/no-resale',
        riskTier: RISK_TIERS.TIER_C_RESTRICTED,
        policyStatus: POLICY_STATUS.POLICY_RESTRICTED,
        actorId: 'SYSTEM_BOOTSTRAP'
      });

      this._isSeeding = false;
      this._seeded = true;
    }
  }

  /**
   * Registers or updates policy for an event.
   * By default, new policies initialize as POLICY_UNVERIFIED unless created with explicit verified admin flag.
   */
  static registerEventPolicy({
    eventId,
    promoterName = 'Promotor Terdaftar',
    officialTicketingPartner = 'Loket.com',
    transferability = TRANSFERABILITY.UNCLEAR,
    isNominative = false,
    wristbandExchangeRequired = false,
    wristbandExchangeRules = null,
    originalKtpRequired = false,
    suratKuasaAllowed = true,
    policySourceUrl = null,
    riskTier = RISK_TIERS.TIER_C_RESTRICTED,
    policyStatus = POLICY_STATUS.POLICY_UNVERIFIED,
    actorId = 'SYSTEM'
  }) {
    this.init();
    if (!eventId) {
      const err = new Error('eventId is mandatory to register event policy');
      err.code = 'INVALID_EVENT_ID';
      throw err;
    }

    const now = new Date().toISOString();
    let existing = state.event_policies.find(p => p.event_id === eventId);

    const record = {
      event_id: eventId,
      promoter_name: promoterName,
      official_ticketing_partner: officialTicketingPartner,
      transferability: transferability || TRANSFERABILITY.UNCLEAR,
      is_nominative: Boolean(isNominative),
      wristband_exchange_required: Boolean(wristbandExchangeRequired),
      wristband_exchange_rules: wristbandExchangeRules || (wristbandExchangeRequired ? 'Penukaran wristband fisik wajib di lokasi sebelum open gate.' : null),
      original_ktp_required: Boolean(originalKtpRequired),
      surat_kuasa_allowed: Boolean(suratKuasaAllowed),
      policy_source_url: policySourceUrl || null,
      risk_tier: riskTier || RISK_TIERS.TIER_C_RESTRICTED,
      policy_status: policyStatus || POLICY_STATUS.POLICY_UNVERIFIED,
      last_verified_at: (policyStatus === POLICY_STATUS.POLICY_VERIFIED_ACTIVE) ? now : (existing?.last_verified_at || null),
      verified_by: (policyStatus === POLICY_STATUS.POLICY_VERIFIED_ACTIVE) ? actorId : (existing?.verified_by || null),
      updated_at: now
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      state.event_policies.push(record);
      existing = record;
    }

    // Sync risk tier and transfer policy onto state.events object for backward compatibility
    if (state.events) {
      const ev = state.events.find(e => e.id === eventId || e.canonical_id === eventId);
      if (ev) {
        ev.promoter_name = record.promoter_name;
        ev.official_ticketing_partner = record.official_ticketing_partner;
        ev.risk_tier = record.risk_tier;
        ev.policy_status = record.policy_status;
        ev.wristband_exchange_required = record.wristband_exchange_required;
      }
    }

    return existing;
  }

  /**
   * Retrieves policy for an event. If none exists, creates default POLICY_UNVERIFIED entry.
   */
  static getEventPolicy(eventId) {
    this.init();
    let policy = state.event_policies.find(p => p.event_id === eventId);
    if (!policy) {
      // Find event metadata if available
      const ev = state.events ? state.events.find(e => e.id === eventId || e.canonical_id === eventId) : null;
      policy = this.registerEventPolicy({
        eventId,
        promoterName: ev?.promoter_name || ev?.promoter || 'Promotor Belum Diverifikasi',
        officialTicketingPartner: ev?.ticketing_partner || ev?.official_ticketing_partner || 'Loket.com',
        transferability: TRANSFERABILITY.UNCLEAR,
        policyStatus: POLICY_STATUS.POLICY_UNVERIFIED,
        riskTier: RISK_TIERS.TIER_C_RESTRICTED
      });
    }
    return policy;
  }

  /**
   * Admin verifies an event policy, setting risk tier and activating live transactions.
   */
  static async verifyEventPolicy({
    eventId,
    adminUserId,
    riskTier,
    policyStatus = POLICY_STATUS.POLICY_VERIFIED_ACTIVE,
    promoterName,
    officialTicketingPartner,
    transferability,
    isNominative,
    wristbandExchangeRequired,
    wristbandExchangeRules,
    originalKtpRequired,
    suratKuasaAllowed,
    policySourceUrl
  }) {
    this.init();
    if (!adminUserId) {
      const err = new Error('adminUserId is required for policy verification');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const current = this.getEventPolicy(eventId);
    const now = new Date().toISOString();

    if (riskTier && !RISK_TIERS[riskTier]) {
      const err = new Error(`Invalid riskTier: ${riskTier}. Allowed: ${Object.keys(RISK_TIERS).join(', ')}`);
      err.code = 'INVALID_RISK_TIER';
      throw err;
    }

    if (policyStatus && !POLICY_STATUS[policyStatus]) {
      const err = new Error(`Invalid policyStatus: ${policyStatus}. Allowed: ${Object.keys(POLICY_STATUS).join(', ')}`);
      err.code = 'INVALID_POLICY_STATUS';
      throw err;
    }

    const previousRiskTier = current.risk_tier;
    const previousPolicyStatus = current.policy_status;
    const targetRiskTier = riskTier || current.risk_tier;
    const targetPolicyStatus = policyStatus || current.policy_status;
    const targetSourceUrl = policySourceUrl !== undefined ? policySourceUrl : current.policy_source_url;

    // Strict validation: cannot promote to tradeable tier (TIER_A or TIER_B) or POLICY_VERIFIED_ACTIVE
    // without an official, verifiable source URL (must be valid http:// or https://)
    const isTradeable = targetRiskTier === RISK_TIERS.TIER_A_DIGITAL || targetRiskTier === RISK_TIERS.TIER_B_VENUE_PIC;
    const isVerifiedActive = targetPolicyStatus === POLICY_STATUS.POLICY_VERIFIED_ACTIVE;

    if ((isTradeable || isVerifiedActive) && (!targetSourceUrl || typeof targetSourceUrl !== 'string' || !/^https?:\/\/.+/i.test(targetSourceUrl.trim()))) {
      const err = new Error('Official policy source URL (valid http/https link) is mandatory to verify and activate event policy');
      err.code = 'POLICY_SOURCE_REQUIRED';
      err.status = 400;
      throw err;
    }

    current.risk_tier = targetRiskTier;
    current.policy_status = targetPolicyStatus;
    if (promoterName !== undefined) current.promoter_name = promoterName;
    if (officialTicketingPartner !== undefined) current.official_ticketing_partner = officialTicketingPartner;
    if (transferability !== undefined) current.transferability = transferability;
    if (isNominative !== undefined) current.is_nominative = Boolean(isNominative);
    if (wristbandExchangeRequired !== undefined) current.wristband_exchange_required = Boolean(wristbandExchangeRequired);
    if (wristbandExchangeRules !== undefined) current.wristband_exchange_rules = wristbandExchangeRules;
    if (originalKtpRequired !== undefined) current.original_ktp_required = Boolean(originalKtpRequired);
    if (suratKuasaAllowed !== undefined) current.surat_kuasa_allowed = Boolean(suratKuasaAllowed);
    if (policySourceUrl !== undefined) current.policy_source_url = policySourceUrl;
    current.last_verified_at = now;
    current.verified_by = adminUserId;
    current.updated_at = now;

    // Sync to state.events
    if (state.events) {
      const ev = state.events.find(e => e.id === eventId || e.canonical_id === eventId);
      if (ev) {
        ev.risk_tier = current.risk_tier;
        ev.policy_status = current.policy_status;
        ev.wristband_exchange_required = current.wristband_exchange_required;
        ev.promoter_name = current.promoter_name;
      }
    }

    await recordAuditLog('EVENT_POLICY', eventId, 'VERIFIED', adminUserId, {
      previous_risk_tier: previousRiskTier,
      new_risk_tier: current.risk_tier,
      previous_policy_status: previousPolicyStatus,
      new_policy_status: current.policy_status,
      policy_source_url: current.policy_source_url,
      verified_by: adminUserId,
      verified_at: now,
      promoter_name: current.promoter_name
    });

    return current;
  }

  /**
   * Evaluates whether live transactions / deal creation can proceed for an event.
   * Default safety rule: Blocks if POLICY_UNVERIFIED or TIER_C_RESTRICTED.
   *
   * @param {string} eventId
   * @returns {{ allowed: boolean, reason?: string, code?: string, policy: Object }}
   */
  static canTransact(eventId) {
    const policy = this.getEventPolicy(eventId);

    // 1. Check policy status
    if (policy.policy_status === POLICY_STATUS.POLICY_UNVERIFIED) {
      return {
        allowed: false,
        reason: 'Event ini belum diverifikasi kebijakan promotornya oleh Admin TIKUM (POLICY_UNVERIFIED). Transaksi dan pembuatan deal link sementara diblokir demi keamanan pembeli dan penjual.',
        code: 'EVENT_POLICY_UNVERIFIED',
        policy
      };
    }

    if (policy.policy_status === POLICY_STATUS.POLICY_RESTRICTED) {
      return {
        allowed: false,
        reason: 'Kebijakan promotor untuk acara ini berstatus RESTRICTED. Promotor melarang pemindahtanganan tiket sekunder atau memiliki risiko pembatalan barcode sepihak.',
        code: 'EVENT_POLICY_RESTRICTED',
        policy
      };
    }

    // 2. Check risk tier
    if (policy.risk_tier === RISK_TIERS.TIER_C_RESTRICTED) {
      return {
        allowed: false,
        reason: 'Acara ini masuk dalam Kategori Risiko C (RESTRICTED). Tiket tidak memiliki kanal serah terima yang aman atau terverifikasi resmi.',
        code: 'EVENT_TIER_RESTRICTED',
        policy
      };
    }

    // 3. Allowed: either TIER_A_DIGITAL or TIER_B_VENUE_ASSISTED
    return {
      allowed: true,
      riskTier: policy.risk_tier,
      policy
    };
  }

  /**
   * Evaluates event risk tier, policy status, and fulfillment mode
   * @param {string} eventId
   * @returns {{ can_transact: boolean, risk_tier: string, policy_status: string, reason: string, handover_type: string, pic_required: boolean, wristband_exchange_required: boolean }}
   */
  static evaluateEventRisk(eventId) {
    const routing = this.resolveFulfillmentRouting(eventId);
    const policy = routing.policy;
    return {
      can_transact: routing.isAllowed,
      risk_tier: policy.risk_tier,
      policy_status: policy.policy_status,
      handover_type: routing.routing,
      pic_required: routing.picRequired,
      wristband_exchange_required: policy.wristband_exchange_required || false,
      reason: routing.reason || 'Kebijakan promotor valid dan terverifikasi.',
      policy
    };
  }

  /**
   * Resolves the fulfillment routing mode based on Event Policy Risk Tier:
   * - TIER_A_DIGITAL -> DIGITAL_TRANSFER
   * - TIER_B_VENUE_ASSISTED -> VENUE_ASSISTED
   * - TIER_C_RESTRICTED / UNVERIFIED -> RESTRICTED_UNVERIFIED
   */
  static resolveFulfillmentRouting(eventId) {
    const check = this.canTransact(eventId);
    if (!check.allowed) {
      return {
        routing: FULFILLMENT_ROUTING.RESTRICTED_UNVERIFIED,
        isAllowed: false,
        picRequired: false,
        reason: check.reason,
        policy: check.policy
      };
    }

    if (check.policy.risk_tier === RISK_TIERS.TIER_A_DIGITAL) {
      return {
        routing: FULFILLMENT_ROUTING.DIGITAL_TRANSFER,
        isAllowed: true,
        picRequired: false,
        policy: check.policy
      };
    }

    // TIER_B_VENUE_ASSISTED
    return {
      routing: FULFILLMENT_ROUTING.VENUE_ASSISTED,
      isAllowed: true,
      picRequired: true,
      policy: check.policy
    };
  }

  /**
   * List all policies
   */
  static listPolicies() {
    this.init();
    return [...state.event_policies];
  }
}

module.exports = {
  EventPolicyRegistry,
  RISK_TIERS,
  POLICY_STATUS,
  TRANSFERABILITY,
  FULFILLMENT_ROUTING
};
