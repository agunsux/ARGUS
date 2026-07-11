/**
 * PolicyMetrics — Phase 5 Policy Framework
 * 
 * Collects counters and timings for policy engine rules, constraints, and latency.
 */
class PolicyMetrics {
  constructor() {
    this._counters = new Map();
    this._histograms = new Map();
  }

  increment(metric, val = 1) {
    this._counters.set(metric, (this._counters.get(metric) || 0) + val);
  }

  record(metric, value) {
    if (!this._histograms.has(metric)) {
      this._histograms.set(metric, []);
    }
    this._histograms.get(metric).push(value);
  }

  snapshot() {
    const result = {};
    for (const [key, value] of this._counters) {
      result[key] = value;
    }
    for (const [key, values] of this._histograms) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        result[`${key}_count`] = values.length;
        result[`${key}_min`] = sorted[0];
        result[`${key}_max`] = sorted[sorted.length - 1];
        result[`${key}_avg`] = Math.round(sorted.reduce((a, b) => a + b, 0) / values.length);
      }
    }
    return result;
  }

  reset() {
    this._counters.clear();
    this._histograms.clear();
  }
}

const policyMetrics = new PolicyMetrics();

module.exports = {
  PolicyMetrics,
  policyMetrics
};
