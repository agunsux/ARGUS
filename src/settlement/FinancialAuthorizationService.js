/**
 * TIKUM / ARGUS — Financial Maker-Checker Authorization Service
 *
 * Enforces dual authorization for high-risk manual financial operations:
 * 1. An action must be initiated by a Maker (e.g., Ops Officer / Finance Staff).
 * 2. An action must be reviewed and approved by an independent Checker (e.g., Finance Lead / Super Admin).
 * 3. NON-NEGOTIABLE INVARIANT: The Maker CANNOT approve their own request (maker_id !== checker_id).
 * 4. Payout execution and high-risk dispute overrides cannot complete without approved dual authorization.
 * 5. Persistent storage backed by PostgreSQL (MoneyRepository) and DurableFinancialStore across restarts.
 * 6. Consumed upon execution: cannot be reused once payout is executed.
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { DurableFinancialStore } = require('./DurableFinancialStore');

const AUTHORIZATION_ACTION = {
  EXECUTE_PAYOUT: 'EXECUTE_PAYOUT',
  DISPUTE_OVERRIDE: 'DISPUTE_OVERRIDE',
  FORCE_REFUND: 'FORCE_REFUND',
  RELEASE_HOLD: 'RELEASE_HOLD'
};

const AUTHORIZATION_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONSUMED: 'CONSUMED',
  REVOKED: 'REVOKED'
};

function getRepo() {
  try {
    const { getMoneyRepository } = require('../storage');
    return getMoneyRepository();
  } catch (_) {
    return null;
  }
}

class FinancialAuthorizationService {
  /**
   * Maker initiates a high-risk financial authorization request.
   * Bound to orderId, amount, currency, and payoutDestination.
   */
  static async requestAuthorization({
    orderId,
    actionType,
    makerId,
    amount = 0,
    currency = 'IDR',
    payoutDestination = null,
    reason,
    metadata = {}
  }) {
    if (!orderId || !actionType || !makerId) {
      const err = new Error('orderId, actionType, and makerId are mandatory for financial authorization');
      err.code = 'INVALID_AUTHORIZATION_PARAMS';
      err.status = 400;
      throw err;
    }

    if (!AUTHORIZATION_ACTION[actionType]) {
      const err = new Error(`Unsupported authorization action type: '${actionType}'`);
      err.code = 'INVALID_ACTION_TYPE';
      err.status = 400;
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      const err = new Error('A detailed reason is mandatory for financial authorization requests (minimum 5 characters)');
      err.code = 'REASON_REQUIRED';
      err.status = 400;
      throw err;
    }

    const effectiveAmount = parseInt(amount || 0, 10);
    const effectiveDestination = payoutDestination || (metadata && metadata.bankAccount) || null;

    if (!state.financial_authorizations) {
      state.financial_authorizations = [];
    }

    // Check repository for pending authorization
    const repo = getRepo();
    if (repo && typeof repo.getPendingFinancialAuthorization === 'function') {
      try {
        const dbPending = await repo.getPendingFinancialAuthorization(orderId, actionType);
        if (dbPending) {
          // Sync to state
          const existingIdx = state.financial_authorizations.findIndex(a => a.id === dbPending.id);
          if (existingIdx >= 0) state.financial_authorizations[existingIdx] = dbPending;
          else state.financial_authorizations.push(dbPending);
          return { authorization: dbPending, idempotent: true };
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
      }
    }

    // Check in-memory state
    const existing = state.financial_authorizations.find(
      a => a.order_id === orderId && a.action_type === actionType && a.status === AUTHORIZATION_STATUS.PENDING_APPROVAL
    );
    if (existing) {
      return { authorization: existing, idempotent: true };
    }

    const authId = `fauth-${uuidv4()}`;
    const now = new Date().toISOString();

    const authData = {
      id: authId,
      authorization_id: authId,
      order_id: orderId,
      action_type: actionType,
      maker_id: makerId,
      checker_id: null,
      status: AUTHORIZATION_STATUS.PENDING_APPROVAL,
      amount: effectiveAmount,
      currency: currency || 'IDR',
      payout_destination: effectiveDestination,
      reason: reason.trim(),
      approval_notes: null,
      rejection_reason: null,
      metadata: {
        ...(metadata || {}),
        bankAccount: effectiveDestination
      },
      created_at: now,
      approved_at: null,
      rejected_at: null,
      consumed_at: null,
      consumed_by_settlement_id: null
    };

    let authorization = authData;

    // Persist via PostgresMoneyRepository
    if (repo && typeof repo.createFinancialAuthorization === 'function') {
      try {
        const repoRes = await repo.createFinancialAuthorization(authData);
        if (repoRes && repoRes.authorization) {
          authorization = repoRes.authorization;
          if (repoRes.idempotent) {
            return { authorization, idempotent: true };
          }
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
      }
    }

    // Sync to memory and DurableFinancialStore
    state.financial_authorizations.push(authorization);
    DurableFinancialStore.persist('financial_authorizations', state.financial_authorizations);

    await recordAuditLog('FINANCIAL_AUTHORIZATION', authorization.id || authId, 'REQUESTED', makerId, {
      order_id: orderId,
      action_type: actionType,
      amount: authorization.amount,
      currency: authorization.currency,
      payout_destination: authorization.payout_destination,
      reason: authorization.reason
    });

    return { authorization, idempotent: false };
  }

  /**
   * Checker approves the authorization request.
   * INVARIANT: maker_id must NOT equal checker_id.
   */
  static async approveAuthorization({ authorizationId, checkerId, notes = null }) {
    if (!authorizationId || !checkerId) {
      const err = new Error('authorizationId and checkerId are mandatory to approve authorization');
      err.code = 'INVALID_PARAMS';
      err.status = 400;
      throw err;
    }

    let auth = null;
    const repo = getRepo();

    if (repo && typeof repo.approveFinancialAuthorization === 'function') {
      try {
        const repoRes = await repo.approveFinancialAuthorization(authorizationId, checkerId, notes);
        if (repoRes && repoRes.authorization) {
          auth = repoRes.authorization;
        }
      } catch (repoErr) {
        if (repoErr.code === 'MAKER_CHECKER_VIOLATION' || repoErr.code === 'AUTHORIZATION_NOT_PENDING' || repoErr.code === 'AUTHORIZATION_NOT_FOUND') {
          throw repoErr;
        }
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
      }
    }

    if (!auth) {
      auth = (state.financial_authorizations || []).find(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (!auth) {
        const err = new Error(`Financial authorization request '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (auth.status !== AUTHORIZATION_STATUS.PENDING_APPROVAL) {
        const err = new Error(`Cannot approve: authorization request is already ${auth.status}`);
        err.code = 'AUTHORIZATION_NOT_PENDING';
        err.status = 400;
        throw err;
      }

      // STRICT MAKER-CHECKER ENFORCEMENT
      if (auth.maker_id === checkerId) {
        const err = new Error('Maker-Checker violation: Initiator (Maker) cannot approve their own financial authorization request');
        err.code = 'MAKER_CHECKER_VIOLATION';
        err.status = 403;
        throw err;
      }

      const now = new Date().toISOString();
      auth.status = AUTHORIZATION_STATUS.APPROVED;
      auth.checker_id = checkerId;
      auth.approved_at = now;
      if (notes) {
        auth.approval_notes = notes;
      }
    } else {
      // Sync to in-memory state
      const idx = (state.financial_authorizations || []).findIndex(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (idx >= 0) {
        state.financial_authorizations[idx] = auth;
      } else {
        if (!state.financial_authorizations) state.financial_authorizations = [];
        state.financial_authorizations.push(auth);
      }
    }

    DurableFinancialStore.persist('financial_authorizations', state.financial_authorizations);

    await recordAuditLog('FINANCIAL_AUTHORIZATION', auth.id || authorizationId, 'APPROVED', checkerId, {
      order_id: auth.order_id,
      maker_id: auth.maker_id,
      action_type: auth.action_type,
      amount: auth.amount,
      notes
    });

    return { success: true, authorization: auth };
  }

  /**
   * Checker rejects the authorization request.
   */
  static async rejectAuthorization({ authorizationId, checkerId, rejectionReason }) {
    if (!authorizationId || !checkerId || !rejectionReason) {
      const err = new Error('authorizationId, checkerId, and rejectionReason are required');
      err.code = 'INVALID_PARAMS';
      err.status = 400;
      throw err;
    }

    let auth = null;
    const repo = getRepo();

    if (repo && typeof repo.rejectFinancialAuthorization === 'function') {
      try {
        const repoRes = await repo.rejectFinancialAuthorization(authorizationId, checkerId, rejectionReason);
        if (repoRes && repoRes.authorization) {
          auth = repoRes.authorization;
        }
      } catch (repoErr) {
        if (repoErr.code === 'AUTHORIZATION_NOT_PENDING' || repoErr.code === 'AUTHORIZATION_NOT_FOUND') {
          throw repoErr;
        }
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
      }
    }

    if (!auth) {
      auth = (state.financial_authorizations || []).find(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (!auth) {
        const err = new Error(`Financial authorization request '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (auth.status !== AUTHORIZATION_STATUS.PENDING_APPROVAL) {
        const err = new Error(`Cannot reject: authorization request is already ${auth.status}`);
        err.code = 'AUTHORIZATION_NOT_PENDING';
        err.status = 400;
        throw err;
      }

      const now = new Date().toISOString();
      auth.status = AUTHORIZATION_STATUS.REJECTED;
      auth.checker_id = checkerId;
      auth.rejection_reason = rejectionReason;
      auth.rejected_at = now;
    } else {
      const idx = (state.financial_authorizations || []).findIndex(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (idx >= 0) state.financial_authorizations[idx] = auth;
    }

    DurableFinancialStore.persist('financial_authorizations', state.financial_authorizations);

    await recordAuditLog('FINANCIAL_AUTHORIZATION', auth.id || authorizationId, 'REJECTED', checkerId, {
      order_id: auth.order_id,
      rejection_reason: rejectionReason
    });

    return { success: true, authorization: auth };
  }

  /**
   * Consumes an approved authorization upon execution of payout/disbursement.
   * Atomically locks against reuse.
   */
  static async consumeAuthorization(arg1, arg2) {
    const authorizationId = (typeof arg1 === 'object' && arg1 !== null) ? arg1.authorizationId : arg1;
    const settlementId = (typeof arg1 === 'object' && arg1 !== null) ? arg1.settlementId : arg2;
    if (!authorizationId || !settlementId) {
      throw new Error('authorizationId and settlementId are required to consume authorization');
    }

    let auth = null;
    const repo = getRepo();

    if (repo && typeof repo.consumeFinancialAuthorization === 'function') {
      try {
        const repoRes = await repo.consumeFinancialAuthorization(authorizationId, settlementId);
        if (repoRes && repoRes.authorization) {
          auth = repoRes.authorization;
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw repoErr;
      }
    }

    if (!auth) {
      auth = (state.financial_authorizations || []).find(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (!auth) {
        const err = new Error(`Financial authorization '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (auth.status !== AUTHORIZATION_STATUS.APPROVED) {
        const err = new Error(`Cannot consume authorization: status is ${auth.status} (must be APPROVED)`);
        err.code = 'AUTHORIZATION_NOT_APPROVED';
        err.status = 400;
        throw err;
      }
      auth.status = AUTHORIZATION_STATUS.CONSUMED;
      auth.consumed_at = new Date().toISOString();
      auth.consumed_by_settlement_id = settlementId;
    } else {
      const idx = (state.financial_authorizations || []).findIndex(
        a => a.id === authorizationId || a.authorization_id === authorizationId
      );
      if (idx >= 0) state.financial_authorizations[idx] = auth;
    }

    DurableFinancialStore.persist('financial_authorizations', state.financial_authorizations);

    await recordAuditLog('FINANCIAL_AUTHORIZATION', auth.id || authorizationId, 'CONSUMED', auth.checker_id || 'SYSTEM', {
      order_id: auth.order_id,
      settlement_id: settlementId,
      amount: auth.amount
    });

    return { success: true, authorization: auth };
  }

  /**
   * Retrieves authorization record by ID.
   */
  static async getAuthorizationById(authorizationId) {
    if (!authorizationId) return null;
    const repo = getRepo();
    if (repo && typeof repo.getFinancialAuthorizationById === 'function') {
      try {
        const dbAuth = await repo.getFinancialAuthorizationById(authorizationId);
        if (dbAuth) return dbAuth;
      } catch (_) {}
    }
    return (state.financial_authorizations || []).find(
      a => a.id === authorizationId || a.authorization_id === authorizationId
    ) || null;
  }

  /**
   * List authorizations with optional filter.
   */
  static async listAuthorizations(filter = {}) {
    const repo = getRepo();
    if (repo && typeof repo.listFinancialAuthorizations === 'function') {
      try {
        const dbList = await repo.listFinancialAuthorizations(filter);
        if (Array.isArray(dbList) && dbList.length > 0) return dbList;
      } catch (_) {}
    }

    const list = state.financial_authorizations || [];
    if (!filter || Object.keys(filter).length === 0) return list;
    return list.filter(a => {
      if (filter.status && a.status !== filter.status) return false;
      if (filter.orderId && a.order_id !== filter.orderId) return false;
      if (filter.actionType && a.action_type !== filter.actionType) return false;
      return true;
    });
  }
}

module.exports = {
  FinancialAuthorizationService,
  AUTHORIZATION_ACTION,
  AUTHORIZATION_STATUS
};
