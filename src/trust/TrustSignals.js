/**
 * TrustSignals — Phase 8/EPIC I Trust Intelligence
 * 
 * Maps entity behaviors (past success rates, consecutive validation breaches) 
 * to score modification parameters.
 */
class TrustSignals {
  /**
   * Evaluates historical records of an entity to output trust signals.
   */
  static resolveSignals(entityId, history = []) {
    const signals = [];
    if (!Array.isArray(history) || history.length === 0) {
      return [{ type: 'NO_HISTORY', scoreModifier: 0 }];
    }

    const successes = history.filter(h => h.result === 'SUCCESS' || h.status === 'SUCCESS').length;
    const failures = history.filter(h => h.result === 'FAILURE' || h.status === 'FAILURE').length;

    if (successes >= 5 && failures === 0) {
      signals.push({ type: 'ESTABLISHED_HISTORY', scoreModifier: 15 });
    }
    
    if (failures > 0) {
      // Penalty based on failure count
      signals.push({ type: 'RECENT_FAILURES', scoreModifier: -10 * failures });
    }

    return signals;
  }
}

module.exports = TrustSignals;
