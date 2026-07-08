/**
 * Evidence Engine — Core Trust Loop v0.2
 * 
 * Automatically generates evidence for every state transition.
 * Every state transition MUST produce evidence (Rule #2).
 * 
 * ADR-002 (Append-Only Evidence)
 * ADR-012 (Hashed Evidence Bundles)
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class EvidenceEngine {
  /**
   * Generates evidence for a transaction event.
   */
  static generateEventEvidence({ transactionId, eventType, actorId, deviceFingerprint, previousEventId, metadata = {} }) {
    const evidenceId = `evd-${uuidv4()}`;
    const payload = {
      evidenceId,
      transactionId,
      eventType,
      timestamp: new Date().toISOString(),
      actorId: actorId || 'system',
      deviceFingerprint: deviceFingerprint || 'system',
      previousEventId: previousEventId || null,
      nextEventId: null,
      metadata
    };
    payload.signature = crypto.createHash('sha256').update(JSON.stringify({ ...payload, signature: null })).digest('hex');
    return payload;
  }

  /**
   * Returns the minimum evidence fields that every event must include.
   */
  static getMinimumEvidenceFields() {
    return [
      'timestamp',
      'actorId',
      'deviceFingerprint',
      'transactionId',
      'evidenceId',
      'eventType',
      'signature',
      'previousEventId',
      'nextEventId'
    ];
  }

  /**
   * Validates that evidence contains all minimum fields.
   */
  static validateEvidenceCompleteness(evidence) {
    const required = EvidenceEngine.getMinimumEvidenceFields();
    const missing = required.filter(f => evidence[f] === undefined);
    if (missing.length > 0) {
      return { complete: false, missingFields: missing };
    }
    // Verify signature
    const sig = evidence.signature;
    const computed = crypto.createHash('sha256')
      .update(JSON.stringify({ ...evidence, signature: null }))
      .digest('hex');
    if (sig !== computed) {
      return { complete: false, reason: 'Signature mismatch — evidence may have been tampered' };
    }
    return { complete: true };
  }

  /**
   * Generates an immutable evidence chain entry.
   */
  static chainEvidence(previousEvidence, currentEvidence) {
    return {
      ...currentEvidence,
      previousSignature: previousEvidence ? previousEvidence.signature : null,
      chainHash: crypto.createHash('sha256')
        .update(JSON.stringify({ previous: previousEvidence?.signature, current: currentEvidence.signature }))
        .digest('hex')
    };
  }

  /**
   * Automatically generates an audit record summary.
   */
  static generateAuditRecord(evidence) {
    return {
      recordId: `aud-${uuidv4()}`,
      timestamp: evidence.timestamp,
      eventType: evidence.eventType,
      transactionId: evidence.transactionId,
      actor: evidence.actorId,
      evidenceId: evidence.evidenceId,
      signature: evidence.signature,
      summary: `[${evidence.eventType}] Transaction ${evidence.transactionId} by ${evidence.actorId} at ${evidence.timestamp}`
    };
  }
}

module.exports = { EvidenceEngine };
