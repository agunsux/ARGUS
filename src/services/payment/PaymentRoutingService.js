/**
 * TIKUM / ARGUS — Payment Routing & Safe Failover Architecture
 *
 * Strategic Architecture:
 * 1. Multi-provider tiering:
 *    - PRIMARY: DOKU (Escrow & Hold & Release Settlement)
 *    - BACKUP #1: MIDTRANS (Snap, Iris, Core API)
 *    - BACKUP #2: XENDIT (xenPlatform, Invoices, Disbursements)
 * 2. Strict failover safety invariants (Section 13):
 *    - Allowed failover: payment initialization / checkout creation fails BEFORE payment submission.
 *    - Unsafe automatic failover: provider timeout, ambiguous status, missing webhook, unconfirmed payment.
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
  EXPIRED: 'EXPIRED'
};

// Regional routing configuration matrix (Indonesia first, ASEAN extensible)
const ROUTING_CONFIG = {
  ID: {
    primary: 'doku',
    backup_1: 'midtrans',
    backup_2: 'xendit',
    backup_3: 'ipaymu',
    secondary: 'midtrans',
    fallback: 'xendit',
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

class PaymentRoutingService {
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
   * Records a deterministic payment attempt in database state & durable disk store
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
  ROUTING_CONFIG
};
