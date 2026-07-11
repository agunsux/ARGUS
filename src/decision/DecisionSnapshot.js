/**
 * DecisionSnapshot — Phase 5 Decision Domain
 * 
 * Captures an immutable snapshot representing the state of a Decision 
 * at a specific point in time, stored and verifiable via SHA-256 hashes.
 */
class DecisionSnapshot {
  constructor(data = {}) {
    this.decisionId = data.decisionId || '';
    this.lifecycleState = data.lifecycleState || '';
    this.hash = data.hash || '';
    this.payload = data.payload || '';
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  /**
   * Generates a snapshot from a Decision object.
   */
  static capture(decision) {
    if (!decision) throw new Error('Decision is required to capture snapshot');
    return new DecisionSnapshot({
      decisionId: decision.id,
      lifecycleState: decision.lifecycleState,
      hash: decision.hash(),
      payload: decision.serialize(),
      timestamp: decision.createdAt
    });
  }

  /**
   * Verifies the integrity of the captured snapshot.
   */
  verifyIntegrity(decision) {
    if (!decision) return false;
    return decision.hash() === this.hash;
  }

  toJSON() {
    return {
      decisionId: this.decisionId,
      lifecycleState: this.lifecycleState,
      hash: this.hash,
      payload: this.payload,
      timestamp: this.timestamp
    };
  }

  static fromJSON(json) {
    return new DecisionSnapshot(json);
  }
}

module.exports = DecisionSnapshot;
