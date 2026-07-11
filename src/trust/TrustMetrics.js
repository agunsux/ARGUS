/**
 * TrustMetrics — Phase 8/EPIC I Trust Intelligence
 * 
 * Collects telemetry and performance statistics for Trust operations.
 */
class TrustMetrics {
  constructor() {
    this._counters = new Map();
  }

  increment(metric, val = 1) {
    this._counters.set(metric, (this._counters.get(metric) || 0) + val);
  }

  snapshot() {
    const result = {};
    for (const [key, value] of this._counters) {
      result[key] = value;
    }
    return result;
  }

  reset() {
    this._counters.clear();
  }
}

const trustMetrics = new TrustMetrics();

module.exports = {
  TrustMetrics,
  trustMetrics
};
