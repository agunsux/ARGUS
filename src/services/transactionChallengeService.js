const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

const CHALLENGE_STATUS = {
  PENDING: 'pending',
  CONSUMED: 'consumed',
  EXPIRED: 'expired',
  INVALIDATED: 'invalidated'
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const MAX_ATTEMPTS = 5;

class TransactionChallengeService {
  /**
   * Generates a 6-digit cryptographically secure challenge code
   * Salted SHA-256 hash is stored. Raw code is returned ONLY to caller for authenticated display.
   */
  static async createChallenge({ orderId, eventId, actionType, expectedActorRole, expectedActorId }) {
    if (!orderId || !eventId || !actionType || !expectedActorRole || !expectedActorId) {
      const err = new Error('Missing required challenge parameters (orderId, eventId, actionType, expectedActorRole, expectedActorId)');
      err.code = 'INVALID_CHALLENGE_PARAMS';
      throw err;
    }

    // Invalidate any existing pending challenge for same order and action type
    const existing = state.transaction_challenges.filter(
      c => c.order_id === orderId && c.action_type === actionType && c.status === CHALLENGE_STATUS.PENDING
    );
    for (const c of existing) {
      c.status = CHALLENGE_STATUS.INVALIDATED;
    }

    // Cryptographically secure 6-digit numeric code
    const rawCode = crypto.randomInt(100000, 1000000).toString();

    // 16-byte cryptographic salt
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = this.hashWithSalt(rawCode, salt);

    const now = Date.now();
    const challengeId = `chg-${uuidv4()}`;

    const challenge = {
      challenge_id: challengeId,
      order_id: orderId,
      event_id: eventId,
      action_type: actionType,
      expected_actor_role: expectedActorRole,
      expected_actor_id: expectedActorId,
      code_hash: codeHash,
      salt: salt,
      status: CHALLENGE_STATUS.PENDING,
      attempt_count: 0,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + CHALLENGE_TTL_MS).toISOString(),
      consumed_at: null,
      consumed_by: null
    };

    state.transaction_challenges.push(challenge);

    // Audit log: NEVER log the raw code, only challenge_id, action_type, and actor
    await recordAuditLog('TRANSACTION_CHALLENGE', challengeId, 'CHALLENGE_ISSUED', expectedActorId, {
      order_id: orderId,
      event_id: eventId,
      action_type: actionType,
      expected_actor_role: expectedActorRole,
      expires_at: challenge.expires_at
    });

    return {
      challengeId,
      orderId,
      actionType,
      expiresAt: challenge.expires_at,
      rawCode // Returned strictly to authenticated caller for in-app display
    };
  }

  /**
   * Hashes code with salt using SHA-256
   */
  static hashWithSalt(code, salt) {
    return crypto.createHash('sha256').update(salt + code.trim()).digest('hex');
  }

  /**
   * Constant-time comparison between stored hash and computed candidate hash
   */
  static constantTimeCompare(hashA, hashB) {
    const bufA = Buffer.from(hashA, 'hex');
    const bufB = Buffer.from(hashB, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Verifies and atomically consumes a challenge
   * Enforces:
   * - order, event, and action_type binding
   * - single-use (no replay)
   * - 5-minute TTL expiry
   * - max 5 attempts lockout
   */
  static async verifyAndConsumeChallenge({ orderId, actionType, providedCode, consumingActorId, consumingActorRole }) {
    if (!orderId || !actionType || !providedCode) {
      const err = new Error('orderId, actionType, and providedCode are required');
      err.code = 'INVALID_CHALLENGE_INPUT';
      throw err;
    }

    // Find pending challenge for this order and action type
    const challenge = state.transaction_challenges.find(
      c => c.order_id === orderId && c.action_type === actionType && c.status === CHALLENGE_STATUS.PENDING
    );

    if (!challenge) {
      // Check if it was already consumed, expired, or invalidated
      const historical = state.transaction_challenges
        .filter(c => c.order_id === orderId && c.action_type === actionType)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (historical && historical.status === CHALLENGE_STATUS.CONSUMED) {
        const err = new Error('Challenge already consumed (replay rejected)');
        err.code = 'CHALLENGE_ALREADY_CONSUMED';
        throw err;
      }
      if (historical && historical.status === CHALLENGE_STATUS.INVALIDATED) {
        const err = new Error('Challenge was invalidated due to excessive failed attempts. Please request a new code.');
        err.code = 'CHALLENGE_INVALIDATED';
        throw err;
      }
      const err = new Error('No active challenge found for this action');
      err.code = 'CHALLENGE_NOT_FOUND';
      throw err;
    }

    // Check TTL
    const now = new Date();
    if (new Date(challenge.expires_at) < now) {
      challenge.status = CHALLENGE_STATUS.EXPIRED;
      await recordAuditLog('TRANSACTION_CHALLENGE', challenge.challenge_id, 'CHALLENGE_EXPIRED', consumingActorId || 'SYSTEM', {
        order_id: orderId,
        action_type: actionType
      });
      const err = new Error('Challenge expired. Please request a new code.');
      err.code = 'CHALLENGE_EXPIRED';
      throw err;
    }

    // Check attempts limit
    if (challenge.attempt_count >= MAX_ATTEMPTS) {
      challenge.status = CHALLENGE_STATUS.INVALIDATED;
      await recordAuditLog('TRANSACTION_CHALLENGE', challenge.challenge_id, 'CHALLENGE_INVALIDATED_MAX_ATTEMPTS', consumingActorId || 'SYSTEM', {
        order_id: orderId,
        action_type: actionType,
        attempt_count: challenge.attempt_count
      });
      const err = new Error('Maximum verification attempts exceeded. Challenge invalidated.');
      err.code = 'CHALLENGE_MAX_ATTEMPTS';
      throw err;
    }

    // Compute candidate hash with stored salt and constant-time compare
    const candidateHash = this.hashWithSalt(providedCode.toString().trim(), challenge.salt);
    const matches = this.constantTimeCompare(candidateHash, challenge.code_hash);

    if (!matches) {
      challenge.attempt_count += 1;
      await recordAuditLog('TRANSACTION_CHALLENGE', challenge.challenge_id, 'CHALLENGE_FAILED_ATTEMPT', consumingActorId || 'SYSTEM', {
        order_id: orderId,
        action_type: actionType,
        attempt_count: challenge.attempt_count,
        remaining_attempts: MAX_ATTEMPTS - challenge.attempt_count
      });

      if (challenge.attempt_count >= MAX_ATTEMPTS) {
        challenge.status = CHALLENGE_STATUS.INVALIDATED;
        await recordAuditLog('TRANSACTION_CHALLENGE', challenge.challenge_id, 'CHALLENGE_INVALIDATED_MAX_ATTEMPTS', consumingActorId || 'SYSTEM', {
          order_id: orderId,
          action_type: actionType,
          attempt_count: challenge.attempt_count
        });
        const err = new Error('Maximum verification attempts exceeded. Challenge invalidated.');
        err.code = 'CHALLENGE_MAX_ATTEMPTS';
        throw err;
      }

      const err = new Error(`Invalid code. ${MAX_ATTEMPTS - challenge.attempt_count} attempts remaining.`);
      err.code = 'INVALID_CHALLENGE_CODE';
      err.remainingAttempts = MAX_ATTEMPTS - challenge.attempt_count;
      throw err;
    }

    // Atomic Consumption
    challenge.status = CHALLENGE_STATUS.CONSUMED;
    challenge.consumed_at = new Date().toISOString();
    challenge.consumed_by = consumingActorId || 'UNKNOWN';

    await recordAuditLog('TRANSACTION_CHALLENGE', challenge.challenge_id, 'CHALLENGE_CONSUMED', consumingActorId, {
      order_id: orderId,
      action_type: actionType,
      consuming_role: consumingActorRole
    });

    return {
      success: true,
      challengeId: challenge.challenge_id,
      orderId,
      actionType,
      consumedAt: challenge.consumed_at
    };
  }

  /**
   * Read active challenge for authenticated display
   */
  static getActiveChallenge(orderId, actionType, actorId) {
    const challenge = state.transaction_challenges.find(
      c => c.order_id === orderId &&
           c.action_type === actionType &&
           c.expected_actor_id === actorId &&
           c.status === CHALLENGE_STATUS.PENDING &&
           new Date(c.expires_at) > new Date()
    );
    if (!challenge) return null;
    return {
      challengeId: challenge.challenge_id,
      orderId: challenge.order_id,
      actionType: challenge.action_type,
      expiresAt: challenge.expires_at,
      attemptCount: challenge.attempt_count
    };
  }
}

module.exports = {
  TransactionChallengeService,
  CHALLENGE_STATUS,
  CHALLENGE_TTL_MS,
  MAX_ATTEMPTS
};

