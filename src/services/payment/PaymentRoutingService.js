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
  PRIMARY: 'PRIMARY_PROVIDER',
  BACKUP_1: 'BACKUP_1_PROVIDER',
  BACKUP_2: 'BACKUP_2_PROVIDER',
  BACKUP_3: 'BACKUP_3_PROVIDER',
  SECONDARY: 'BACKUP_1_PROVIDER',
  FALLBACK: 'BACKUP_2_PROVIDER'
};

const PAYMENT_ATTEMPT_STATUS = {
  UNKNOWN: 'UNKNOWN',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  SUPERSEDED: 'SUPERSEDED'
};

// Regional routing configuration matrix (Priority: DOKU -> iPaymu -> Midtrans -> Xendit)
const ROUTING_CONFIG = {
  ID: {
    primary: 'doku',
    backup_1: 'ipaymu',
    backup_2: 'midtrans',
    backup_3: 'xendit',
    secondary: 'ipaymu',
    fallback: 'midtrans',
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
    primary: 'xendit',
    secondary: null,
    fallback: null,
    allowedCurrencies: ['PHP']
  }
};

// Circuit Breakers state per provider
const circuitBreakers = {
  doku: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  ipaymu: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  midtrans: { failures: 0, state: 'CLOSED', nextProbe: 0 },
  xendit: { failures: 0, state: 'CLOSED', nextProbe: 0 }
};

// Ops kill-switches per provider (can be toggled at runtime or via environment)
const opsKillSwitches = {
  doku: false,
  ipaymu: false,
  midtrans: false,
  xendit: false
};

class PaymentRoutingService {
  /**
   * Toggles operational kill-switch for a specific provider
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
  static recordProviderFailure(providerName) {
    const p = (providerName || '').toLowerCase();
    const cb = circuitBreakers[p];
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
  static recordProviderSuccess(providerName) {
    const p = (providerName || '').toLowerCase();
    const cb = circuitBreakers[p];
    if (!cb) return;

    cb.failures = 0;
    cb.state = 'CLOSED';
    cb.nextProbe = 0;
  }

  /**
   * Checks whether a provider is operational and available
   */
  static isProviderAvailable(providerName) {
    const p = (providerName || '').toLowerCase();
    if (opsKillSwitches[p] || process.env[`KILL_SWITCH_${p.toUpperCase()}`] === 'true') {
      return false;
    }

    const cb = circuitBreakers[p];
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
    if (tier === 'BACKUP_1' || tier === 'SECONDARY') {
      targetName = marketConfig.backup_1 || marketConfig.secondary || marketConfig.primary;
    } else if (tier === 'BACKUP_2' || tier === 'FALLBACK') {
      targetName = marketConfig.backup_2 || marketConfig.fallback || marketConfig.primary;
    } else if (tier === 'BACKUP_3') {
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

    const tiers = ['PRIMARY', 'BACKUP_1', 'BACKUP_2', 'BACKUP_3'];
    for (const tier of tiers) {
      try {
        const resolved = this.resolveProvider({ countryCode, currency, tier, requiresEscrow });
        if (this.isProviderAvailable(resolved.providerName)) {
          return resolved;
        }
      } catch (err) {
        if (err.code === 'ESCROW_CAPABILITY_REQUIRED') {
          // Escrow required cannot route to non-escrow rail; stop failover
          throw err;
        }
      }
    }

    throw new Error('All configured payment providers are currently unavailable or circuit-broken.');
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
