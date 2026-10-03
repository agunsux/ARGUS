/**
 * TIKUM / ARGUS — Payment Routing & Failover Architecture (Sections 2 & 3)
 *
 * Strategic Architecture:
 * 1. Configuration-driven payment provider routing decoupled from specific rails.
 * 2. Multi-provider tiering: PRIMARY_PROVIDER, SECONDARY_PROVIDER, FALLBACK_PROVIDER.
 * 3. Strict failover guard: Never fail over automatically if existing financial state is uncertain.
 * 4. Deterministic payment attempt audit trail:
 *    - paymentAttemptId
 *    - orderId
 *    - provider
 *    - providerTransactionId
 *    - idempotencyKey
 *    - status: UNKNOWN / PENDING / SUCCESS / FAILED / EXPIRED
 *    - createdAt
 *    - updatedAt
 * 5. Reconcile before retrying any financial attempt (zero duplicate charges).
 */

const { paymentManager } = require('./index');
const { isMarketActive, getMarket } = require('../../config/markets');
const { state, recordAuditLog } = require('../../database');

const PROVIDER_TIER = {
  PRIMARY: 'PRIMARY_PROVIDER',
  SECONDARY: 'SECONDARY_PROVIDER',
  FALLBACK: 'FALLBACK_PROVIDER'
};

const PAYMENT_ATTEMPT_STATUS = {
  UNKNOWN: 'UNKNOWN',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
};

// Regional routing configuration matrix
const ROUTING_CONFIG = {
  ID: {
    primary: 'rcb',
    secondary: 'ipaymu',
    fallback: process.env.NODE_ENV === 'test' ? 'test' : 'ipaymu',
    allowedCurrencies: ['IDR']
  },
  SG: {
    primary: null,
    secondary: null,
    fallback: null,
    allowedCurrencies: ['SGD']
  },
  MY: {
    primary: null,
    secondary: null,
    fallback: null,
    allowedCurrencies: ['MYR']
  }
};

class PaymentRoutingService {
  /**
   * Resolves appropriate provider deterministically based on country, currency, and channel
   * @param {object} params
   * @param {string} [params.countryCode='ID']
   * @param {string} [params.currency='IDR']
   * @param {string} [params.channel]
   * @param {string} [params.tier='PRIMARY']
   * @returns {{ providerName: string, tier: string, provider: object }}
   */
  static resolveProvider({
    countryCode = 'ID',
    currency = 'IDR',
    channel = null,
    tier = 'PRIMARY'
  } = {}) {
    const code = (countryCode || 'ID').toUpperCase().trim();

    // Verify market is active
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
    if (tier === 'SECONDARY') {
      targetName = marketConfig.secondary || marketConfig.primary;
    } else if (tier === 'FALLBACK') {
      targetName = marketConfig.fallback || marketConfig.secondary || marketConfig.primary;
    } else {
      targetName = marketConfig.primary || marketConfig.fallback || 'rcb';
    }

    // In test environment, allow deterministic test provider
    if (process.env.NODE_ENV === 'test' && paymentManager.hasProvider('test')) {
      targetName = targetName || 'test';
    }

    const provider = paymentManager.getProvider(targetName);
    return {
      providerName: targetName,
      tier: PROVIDER_TIER[tier] || PROVIDER_TIER.PRIMARY,
      provider
    };
  }

  /**
   * Records a deterministic payment attempt in database state
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
      provider,
      providerTransactionId,
      idempotencyKey,
      status,
      createdAt: now,
      updatedAt: now
    };

    state.payment_attempts.push(attempt);
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
    return attempt;
  }

  /**
   * Asserts whether failover to another provider is safely permissible.
   * INVARIANT: Never failover if prior attempt status is UNKNOWN or PENDING!
   */
  static assertFailoverAllowed(orderId) {
    if (!state.payment_attempts) return true;
    const attempts = state.payment_attempts.filter(a => a.orderId === orderId);
    for (const a of attempts) {
      if (a.status === PAYMENT_ATTEMPT_STATUS.PENDING || a.status === PAYMENT_ATTEMPT_STATUS.UNKNOWN) {
        const err = new Error(
          `Cannot failover payment for order '${orderId}': prior attempt '${a.paymentAttemptId}' is in uncertain state '${a.status}'. Reconcile before retrying.`
        );
        err.code = 'FAILOVER_UNCERTAIN_STATE_BLOCKED';
        err.status = 409;
        throw err;
      }
      if (a.status === PAYMENT_ATTEMPT_STATUS.SUCCESS) {
        const err = new Error(
          `Cannot failover payment for order '${orderId}': payment already succeeded on attempt '${a.paymentAttemptId}'.`
        );
        err.code = 'PAYMENT_ALREADY_SUCCEEDED';
        err.status = 400;
        throw err;
      }
    }
    return true;
  }
}

module.exports = {
  PaymentRoutingService,
  PROVIDER_TIER,
  PAYMENT_ATTEMPT_STATUS,
  ROUTING_CONFIG
};

