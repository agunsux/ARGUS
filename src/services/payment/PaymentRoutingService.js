/**
 * TIKUM / ARGUS — Payment Routing & Safe Failover Architecture
 *
 * Strategic Architecture:
 * 1. Multi-provider tiering (Decided Priority Order):
 *    - 1) PRIMARY: DOKU (Escrow & Hold & Release Settlement)
 *    - 2) BACKUP #1: IPAYMU (Verified payment rail)
 *    - 3) BACKUP #2: MIDTRANS (Snap, Iris, Core API)
 *    - 4) BACKUP #3: XENDIT (xenPlatform, Invoices, Disbursements)
 *    - REMOVED: RCB (Completely deleted from architecture)
 *
 * 2. Strict failover safety invariants (Section 13):
 *    - A payment attempt is PINNED to one provider for its lifetime (provider + provider_ref stored).
 *    - Never silently re-route an in-flight payment.
 *    - Failover only when creating a NEW attempt, driven by circuit breaker (failures/timeouts/5xx)
 *      or explicit ops kill-switch per provider.
 *    - INVARIANT: Never fail over if previous attempt is in PENDING, UNKNOWN, or SUCCESS state.
 *    - INVARIANT: Never silently downgrade an escrow-required transaction to an ordinary non-escrow rail.
 *    - Zero double-charging.
 * 3. Durable payment attempt audit trail persisted to disk.
 */

const { paymentManager } = require('./index');
const { isMarketActive, getMarket } = require('../../config/markets');
const { state, recordAuditLog } = require('../../database');
const { DurableFinancialStore } = require('../../settlement/DurableFinancialStore');

const PROVIDER_TIER = {
  PRIMARY: 'TIER_1A_PRIMARY',
  TIER_1A: 'TIER_1A_PRIMARY',
  TIER_1B: 'TIER_1B_BACKUP',
  BACKUP_1: 'TIER_1B_BACKUP',
  SECONDARY: 'TIER_1B_BACKUP',
  TIER_2A: 'TIER_2A_BACKUP',
  BACKUP_2: 'TIER_2A_BACKUP',
  FALLBACK: 'TIER_2A_BACKUP',
  TIER_2B: 'TIER_2B_BACKUP',
  BACKUP_3: 'TIER_2B_BACKUP'
};

const PAYMENT_ATTEMPT_STATUS = {
  UNKNOWN: 'UNKNOWN',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  SUPERSEDED: 'SUPERSEDED'
};

// Regional routing configuration matrix (EPIC P1.0: DOKU sole active Sandbox & Development gateway)
const ROUTING_CONFIG = {
  ID: {
    primary: 'doku',
    backup_1: null,
    backup_2: null,
    backup_3: null,
    secondary: null,
    fallback: null,
    allowedCurrencies: ['IDR']
  },
  SG: {
    primary: 'doku',
    secondary: null,
    fallback: null,
    allowedCurrencies: ['SGD']
  },
  MY: {
    primary: 'doku',
    secondary: null,
    fallback: null,
    allowedCurrencies: ['MYR']
  },
  PH: {
    primary: 'doku',
    secondary: null,
    fallback: null,
    allowedCurrencies: ['PHP']
  }
};

// Circuit Breakers state per provider
const circuitBreakers = {
  doku: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  doku_direct: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  doku_checkout: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  ipaymu: { failures: 0, state: 'FROZEN', nextProbe: Infinity },
  midtrans: { failures: 0, state: 'REMOVED', nextProbe: Infinity },
  xendit: { failures: 0, state: 'REMOVED', nextProbe: Infinity }
};

// Ops kill-switches per provider (can be toggled at runtime or via environment)
const opsKillSwitches = {
  doku: false,
  doku_direct: false,
  doku_checkout: false,
  ipaymu: true,
  midtrans: true,
  xendit: true
};

class PaymentRoutingService {
  /**
   * Toggles operational kill-switch for a specific provider or sub-integration
   */
  static setKillSwitch(providerName, disabled = true) {
    const p = (providerName || '').toLowerCase();
    if (opsKillSwitches[p] !== undefined) {
      opsKillSwitches[p] = Boolean(disabled);
    }
  }

  /**
   * Records a provider failure (5xx, timeout, network error) for circuit breaker
   */
  static recordProviderFailure(providerName, subType = null) {
    const key = subType ? `${providerName}_${subType}`.toLowerCase() : (providerName || '').toLowerCase();
    const cb = circuitBreakers[key] || circuitBreakers[(providerName || '').toLowerCase()];
    if (!cb) return;

    cb.failures += 1;
    if (cb.failures >= 5) {
      cb.state = 'OPEN';
      cb.nextProbe = Date.now() + 30000; // 30s probe window
    }
  }

  /**
   * Records a provider success, resetting the circuit breaker
   */
  static recordProviderSuccess(providerName, subType = null) {
    const key = subType ? `${providerName}_${subType}`.toLowerCase() : (providerName || '').toLowerCase();
    const cb = circuitBreakers[key] || circuitBreakers[(providerName || '').toLowerCase()];
    if (!cb) return;

    cb.failures = 0;
    cb.state = 'CLOSED';
    cb.nextProbe = 0;
  }

  /**
   * Checks whether a provider or sub-integration is operational and available
   */
  static isProviderAvailable(providerName, subType = null) {
    const key = subType ? `${providerName}_${subType}`.toLowerCase() : (providerName || '').toLowerCase();
    const parentKey = (providerName || '').toLowerCase();

    // iPaymu is frozen; Midtrans & Xendit are removed from active operations
    if (parentKey === 'ipaymu' || parentKey === 'midtrans' || parentKey === 'xendit') {
      return false;
    }

    // Check parent kill-switch first
    if (opsKillSwitches[parentKey] || process.env[`KILL_SWITCH_${parentKey.toUpperCase()}`] === 'true') {
      return false;
    }

    // Check specific sub-integration kill-switch
    if (key !== parentKey && (opsKillSwitches[key] || process.env[`KILL_SWITCH_${key.toUpperCase()}`] === 'true')) {
      return false;
    }

    // Check circuit breaker
    const cb = circuitBreakers[key] || circuitBreakers[parentKey];
    if (!cb) return true;

    if (cb.state === 'OPEN') {
      if (Date.now() >= cb.nextProbe) {
        cb.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Resolves multi-provider fallback resilience within DOKU and to emergency alternatives:
   * Rule A: Direct API healthy -> use DOKU Direct API.
   * Rule B: Direct API unavailable before creation -> allow DOKU Checkout fallback.
   * Rule C/D: Ambiguous timeout -> transaction inquiry first, never blind second charge.
   * Rule F: Both DOKU integrations unavailable -> offer controlled emergency alternative (iPaymu).
   */
  static resolveResilientChannelOrFallback({ channel = 'VA_DOKU', requiresEscrow = true, orderId = null } = {}) {
    const ch = (channel || 'VA_DOKU').toUpperCase();
    const isDirectVA = ch.startsWith('VA') || ch.includes('VIRTUAL_ACCOUNT');
    const isDirectQRIS = ch === 'QRIS' || ch === 'QRIS_DOKU';
    const isDirect = isDirectVA || isDirectQRIS;

    // Invariant: If order already has an active pinned attempt, check it
    if (orderId && state.payment_attempts) {
      const activeAttempt = state.payment_attempts.find(
        a => a.orderId === orderId && (a.status === PAYMENT_ATTEMPT_STATUS.PENDING || a.status === PAYMENT_ATTEMPT_STATUS.UNKNOWN)
      );
      if (activeAttempt) {
        return {
          provider: activeAttempt.provider,
          channel: ch,
          integrationType: 'PINNED',
          fallbackApplied: false,
          isPinned: true
        };
      }
    }

    // Rule A: Direct API healthy -> use DOKU Direct API
    if (isDirect && this.isProviderAvailable('doku_direct') && this.isProviderAvailable('doku')) {
      return {
        provider: 'doku',
        channel: ch,
        integrationType: 'DOKU_DIRECT_API',
        fallbackApplied: false
      };
    }

    // Rule B: Direct API unavailable before transaction creation -> allow DOKU Checkout fallback if eligible
    if (this.isProviderAvailable('doku_checkout') && this.isProviderAvailable('doku')) {
      return {
        provider: 'doku',
        channel: 'DOKU_CHECKOUT',
        integrationType: 'DOKU_CHECKOUT_FALLBACK',
        fallbackApplied: true,
        originalChannel: ch,
        reason: 'DOKU_DIRECT_UNAVAILABLE_FALLBACK_TO_CHECKOUT'
      };
    }

    // DOKU is the sole gateway; no failover to iPaymu or other gateways
    throw new Error('All configured DOKU payment channels (DOKU Direct API, DOKU Checkout) are currently unavailable or circuit-broken.');
  }

  static getCircuitBreakerStatus() {
    return {
      circuit_breakers: { ...circuitBreakers },
      kill_switches: { ...opsKillSwitches }
    };
  }

  /**
   * Resolves appropriate provider deterministically based on country, currency, channel, and tier
   */
  static resolveProvider({
    countryCode = 'ID',
    currency = 'IDR',
    channel = null,
    tier = 'PRIMARY',
    requiresEscrow = false
  } = {}) {
    const code = (countryCode || 'ID').toUpperCase().trim();

    if (!isMarketActive(code)) {
      const err = new Error(`Market for country '${code}' is not currently active for commercial checkout`);
      err.code = 'MARKET_NOT_ACTIVE';
      err.status = 400;
      throw err;
    }

    const marketConfig = ROUTING_CONFIG[code] || ROUTING_CONFIG.ID;
    if (!marketConfig.allowedCurrencies.includes(currency.toUpperCase())) {
      const err = new Error(`Currency '${currency}' is not supported for country '${code}'`);
      err.code = 'CURRENCY_NOT_SUPPORTED';
      err.status = 400;
      throw err;
    }

    let targetName;
    const tUpper = (tier || 'PRIMARY').toUpperCase();
    if (tUpper === 'TIER_1B' || tUpper === 'BACKUP_1' || tUpper === 'SECONDARY') {
      targetName = marketConfig.backup_1 || marketConfig.secondary || marketConfig.primary;
    } else if (tUpper === 'TIER_2A' || tUpper === 'BACKUP_2' || tUpper === 'FALLBACK') {
      targetName = marketConfig.backup_2 || marketConfig.fallback || marketConfig.primary;
    } else if (tUpper === 'TIER_2B' || tUpper === 'BACKUP_3') {
      targetName = marketConfig.backup_3 || marketConfig.primary;
    } else {
      targetName = marketConfig.primary || 'doku';
    }

    // In test environment, allow deterministic test provider if explicitly registered
    if (process.env.NODE_ENV === 'test' && paymentManager.hasProvider('test')) {
      targetName = targetName || 'test';
    }

    const provider = paymentManager.getProvider(targetName);

    // Escrow compatibility check
    if (requiresEscrow && !provider.getCapabilities().hold) {
      const err = new Error(
        `ESCROW_CAPABILITY_REQUIRED: Provider '${targetName}' does not support native escrow holding. Escrow-required transactions cannot be routed to non-escrow providers.`
      );
      err.code = 'ESCROW_CAPABILITY_REQUIRED';
      err.status = 422;
      throw err;
    }

    return {
      providerName: targetName,
      tier: PROVIDER_TIER[tier] || PROVIDER_TIER.PRIMARY,
      provider
    };
  }

  /**
   * Resolves the next available provider taking circuit breakers and kill switches into account.
   * Priority: DOKU -> iPaymu -> Midtrans -> Xendit
   */
  static resolveNextAvailableProvider({
    countryCode = 'ID',
    currency = 'IDR',
    requiresEscrow = false,
    orderId = null
  } = {}) {
    // If order already has an active pinned attempt, check it first
    if (orderId && state.payment_attempts) {
      const activeAttempt = state.payment_attempts.find(
        a => a.orderId === orderId && (a.status === PAYMENT_ATTEMPT_STATUS.PENDING || a.status === PAYMENT_ATTEMPT_STATUS.UNKNOWN)
      );
      if (activeAttempt) {
        const pinnedProvider = paymentManager.getProvider(activeAttempt.provider);
        return {
          providerName: activeAttempt.provider,
          tier: 'PINNED',
          provider: pinnedProvider,
          isPinned: true,
          attempt: activeAttempt
        };
      }
    }

    // DOKU is the sole primary gateway; automatic failover is disabled
    const resolved = this.resolveProvider({ countryCode, currency, tier: 'PRIMARY', requiresEscrow });
    if (this.isProviderAvailable(resolved.providerName)) {
      return resolved;
    }

    throw new Error('DOKU payment gateway is currently unavailable or circuit-broken. Automatic failover is disabled.');
  }

  /**
   * Records a deterministic payment attempt in database state & durable disk store.
   * Enforces provider pinning for the attempt's lifetime.
   */
  static recordPaymentAttempt({
    paymentAttemptId,
    orderId,
    provider,
    providerTransactionId = null,
    idempotencyKey,
    status = PAYMENT_ATTEMPT_STATUS.PENDING
  }) {
    if (!state.payment_attempts) {
      state.payment_attempts = [];
    }

    const now = new Date().toISOString();
    const attempt = {
      paymentAttemptId,
      orderId,
      provider: provider.toLowerCase(),
      providerTransactionId,
      idempotencyKey,
      status,
      createdAt: now,
      updatedAt: now
    };

    state.payment_attempts.push(attempt);
    DurableFinancialStore.persist('payment_attempts', state.payment_attempts);
    return attempt;
  }

  /**
   * Updates an existing payment attempt status
   */
  static updateAttemptStatus(paymentAttemptId, newStatus, providerTransactionId = null) {
    if (!state.payment_attempts) return null;
    const attempt = state.payment_attempts.find(a => a.paymentAttemptId === paymentAttemptId);
    if (!attempt) return null;

    attempt.status = newStatus;
    if (providerTransactionId) {
      attempt.providerTransactionId = providerTransactionId;
    }
    attempt.updatedAt = new Date().toISOString();

    DurableFinancialStore.persist('payment_attempts', state.payment_attempts);
    return attempt;
  }

  /**
   * Asserts whether failover to another provider is safely permissible.
   * INVARIANT: Never failover if prior attempt status is UNKNOWN or PENDING!
   * A payment attempt is PINNED to one provider for its lifetime.
   */
  static assertFailoverAllowed(orderId, requiresEscrow = false, targetProvider = null) {
    if (requiresEscrow && targetProvider) {
      try {
        const provider = paymentManager.getProvider(targetProvider);
        if (provider && !provider.getCapabilities().hold) {
          const { CapabilityUnsupportedError } = require('./PaymentProvider');
          const err = new CapabilityUnsupportedError(
            targetProvider,
            'hold',
            `ESCROW_CAPABILITY_REQUIRED: Cannot route or failover escrow-required order '${orderId}' to provider '${targetProvider}' which lacks native milestone escrow holding capability.`
          );
          err.code = 'CAPABILITY_UNSUPPORTED';
          err.status = 422;
          throw err;
        }
      } catch (provErr) {
        if (provErr.code === 'CAPABILITY_UNSUPPORTED' || provErr.name === 'CapabilityUnsupportedError') throw provErr;
      }
    }

    if (!state.payment_attempts) return true;
    const attempts = state.payment_attempts.filter(a => a.orderId === orderId);
    for (const a of attempts) {
      if (a.status === PAYMENT_ATTEMPT_STATUS.SUCCESS) {
        const err = new Error(
          `Cannot create payment for order '${orderId}': payment already succeeded on attempt '${a.paymentAttemptId}'.`
        );
        err.code = 'PAYMENT_ALREADY_SUCCEEDED';
        err.status = 400;
        throw err;
      }
      // If targeting the same provider, idempotency or retry handles it, not failover
      if (targetProvider && a.provider === targetProvider.toLowerCase()) {
        continue;
      }
      if (a.status === PAYMENT_ATTEMPT_STATUS.PENDING || a.status === PAYMENT_ATTEMPT_STATUS.UNKNOWN) {
        const err = new Error(
          `Cannot failover payment for order '${orderId}': prior attempt '${a.paymentAttemptId}' on provider '${a.provider}' is in uncertain state '${a.status}'. Reconcile before retrying.`
        );
        err.code = 'FAILOVER_UNCERTAIN_STATE_BLOCKED';
        err.status = 409;
        throw err;
      }
    }
    return true;
  }

  /**
   * Safely selects next failover provider tier
   */
  static getNextFailoverTier(currentTier = 'PRIMARY') {
    if (currentTier === 'PRIMARY') return 'BACKUP_1';
    if (currentTier === 'BACKUP_1' || currentTier === 'SECONDARY') return 'BACKUP_2';
    if (currentTier === 'BACKUP_2' || currentTier === 'FALLBACK') return 'BACKUP_3';
    return null;
  }
}

module.exports = {
  PaymentRoutingService,
  PROVIDER_TIER,
  PAYMENT_ATTEMPT_STATUS,
  ROUTING_CONFIG,
  circuitBreakers,
  opsKillSwitches
};
