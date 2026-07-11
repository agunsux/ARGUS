/**
 * Metrics Collector — Phase 3 Operational Foundation
 *
 * Protocol automatically emits metrics:
 * - CommandReceived / CommandSucceeded / CommandFailed
 * - ReplayCompleted / ProjectionRebuilt / RecoveryExecuted
 * - TransitionDuration / EventBusLatency
 *
 * All metrics are deterministic and measurable.
 */
const { clock } = require('./clock');

class MetricsCollector {
  constructor() {
    this._counters = new Map();
    this._histograms = new Map();
    this._timers = new Map();
    this._startTime = clock.timestampMs();
  }

  /**
   * Increments a counter.
   */
  increment(counter, value = 1) {
    const key = `counter:${counter}`;
    this._counters.set(key, (this._counters.get(key) || 0) + value);
  }

  /**
   * Records a duration for a histogram.
   */
  record(timer, durationMs) {
    const key = `timer:${timer}`;
    if (!this._histograms.has(key)) {
      this._histograms.set(key, []);
    }
    const arr = this._histograms.get(key);
    arr.push(durationMs);
    if (arr.length > 1000) arr.shift();
  }

  /**
   * Times an async operation and records the duration.
   */
  async time(timer, fn) {
    const start = clock.timestampMs();
    try {
      const result = await fn();
      this.record(timer, clock.timestampMs() - start);
      this.increment(`${timer}_success`);
      return result;
    } catch (err) {
      this.record(timer, clock.timestampMs() - start);
      this.increment(`${timer}_failure`);
      throw err;
    }
  }

  /**
   * Times a synchronous function.
   */
  timeSync(timer, fn) {
    const start = clock.timestampMs();
    try {
      const result = fn();
      this.record(timer, clock.timestampMs() - start);
      this.increment(`${timer}_success`);
      return result;
    } catch (err) {
      this.record(timer, clock.timestampMs() - start);
      this.increment(`${timer}_failure`);
      throw err;
    }
  }

  // ==================== Protocol Metrics ====================

  recordCommandReceived(type) {
    this.increment('CommandReceived');
    this.increment(`CommandReceived:${type}`);
  }

  recordCommandSucceeded(type, latencyMs) {
    this.increment('CommandSucceeded');
    this.increment(`CommandSucceeded:${type}`);
    this.record('TransitionDuration', latencyMs);
  }

  recordCommandFailed(type) {
    this.increment('CommandFailed');
    this.increment(`CommandFailed:${type}`);
  }

  recordReplayCompleted(durationMs) {
    this.increment('ReplayCompleted');
    this.record('ReplayDuration', durationMs);
  }

  recordProjectionRebuilt(durationMs) {
    this.increment('ProjectionRebuilt');
    this.record('ProjectionRebuildDuration', durationMs);
  }

  recordRecoveryExecuted(action) {
    this.increment('RecoveryExecuted');
    this.increment(`RecoveryExecuted:${action}`);
  }

  recordEventBusLatency(latencyMs) {
    this.record('EventBusLatency', latencyMs);
  }

  // ==================== Snapshot ====================

  /**
   * Returns all accumulated metrics as a plain object.
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
        result[`${key}_min`] = sorted[0];
        result[`${key}_p50`] = sorted[Math.floor(sorted.length * 0.5)];
        result[`${key}_p95`] = sorted[Math.floor(sorted.length * 0.95)];
        result[`${key}_p99`] = sorted[Math.floor(sorted.length * 0.99)];
        result[`${key}_max`] = sorted[sorted.length - 1];
        result[`${key}_sum`] = sorted.reduce((a, b) => a + b, 0);
        result[`${key}_avg`] = Math.round(result[`${key}_sum`] / values.length);
      }
    }
    return result;
  }

  /**
   * Returns uptime in ms.
   */
  uptime() {
    return clock.timestampMs() - this._startTime;
  }

  /**
   * Resets all metrics.
   */
  reset() {
    this._counters.clear();
    this._histograms.clear();
    this._timers.clear();
    this._startTime = clock.timestampMs();
  }
}

const metrics = new MetricsCollector();

module.exports = { MetricsCollector, metrics };