/**
 * Metrics Collector — Wave 2.5 Observability
 * 
 * All commands automatically produce metrics:
 * - command_received, command_completed, command_failed
 * - transition_latency_ms, projection_rebuild_ms
 * - replay_duration_ms, rule_execution_ms
 */
class MetricsCollector {
  constructor() {
    this._counters = new Map();
    this._histograms = new Map();
    this._timers = new Map();
  }

  /**
   * Increments a counter.
   */
  increment(counter, value = 1) {
    const key = `counter:${counter}`;
    this._counters.set(key, (this._counters.get(key) || 0) + value);
  }

  /**
   * Records a duration for a timer.
   */
  record(timer, durationMs) {
    const key = `timer:${timer}`;
    if (!this._histograms.has(key)) {
      this._histograms.set(key, []);
    }
    this._histograms.get(key).push(durationMs);
    // Keep only last 1000 samples per timer
    if (this._histograms.get(key).length > 1000) {
      this._histograms.get(key).shift();
    }
  }

  /**
   * Times an async operation and records the duration.
   */
  async time(timer, fn) {
    const start = Date.now();
    try {
      const result = await fn();
      this.record(timer, Date.now() - start);
      this.increment(`${timer}_success`);
      return result;
    } catch (err) {
      this.record(timer, Date.now() - start);
      this.increment(`${timer}_failure`);
      throw err;
    }
  }

  /**
   * Returns all accumulated metrics.
   */
  snapshot() {
    const result = {};
    for (const [key, value] of this._counters) {
      result[key] = value;
    }
    for (const [key, values] of this._histograms) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        result[`${key}_count`] = values.length;
        result[`${key}_p50`] = sorted[Math.floor(sorted.length * 0.5)];
        result[`${key}_p95`] = sorted[Math.floor(sorted.length * 0.95)];
        result[`${key}_p99`] = sorted[Math.floor(sorted.length * 0.99)];
        result[`${key}_max`] = sorted[sorted.length - 1];
      }
    }
    return result;
  }

  /**
   * Resets all metrics.
   */
  reset() {
    this._counters.clear();
    this._histograms.clear();
    this._timers.clear();
  }

  /**
   * Records domain metrics.
   */
  recordCommandReceived(type) { this.increment(`command_received`, 1); this.increment(`command_received:${type}`, 1); }
  recordCommandCompleted(type, latencyMs) { this.increment(`command_completed`, 1); this.increment(`command_completed:${type}`, 1); this.record(`transition_latency_ms`, latencyMs); }
  recordCommandFailed(type) { this.increment(`command_failed`, 1); this.increment(`command_failed:${type}`, 1); }
  recordProjectionRebuild(durationMs) { this.record(`projection_rebuild_ms`, durationMs); }
  recordReplay(durationMs) { this.record(`replay_duration_ms`, durationMs); }
  recordRuleExecution(durationMs) { this.record(`rule_execution_ms`, durationMs); }
}

const metrics = new MetricsCollector();

module.exports = { MetricsCollector, metrics };
