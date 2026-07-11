/**
 * Health Monitor — Phase 3 Operational Foundation
 *
 * Tracks:
 * - Replay status
 * - Projection status
 * - Event Bus status
 * - Recovery queue
 * - Clock status
 */

const { clock } = require('./clock');

class HealthMonitor {
  constructor() {
    this._checks = new Map();
    this._statuses = new Map();

    // Register default checks
    this._statuses.set('clock', { status: 'UP', detail: 'SystemClock' });
    this._statuses.set('eventBus', { status: 'UP', detail: 'ready' });
    this._statuses.set('replay', { status: 'UP', detail: 'no active replay' });
    this._statuses.set('projection', { status: 'UP', detail: 'ready' });
    this._statuses.set('recoveryQueue', { status: 'UP', detail: 'empty' });
    this._statuses.set('metrics', { status: 'UP', detail: 'ready' });
    this._statuses.set('audit', { status: 'UP', detail: 'ready' });
  }

  /**
   * Registers a custom health check function.
   */
  register(name, checkFn) {
    this._checks.set(name, checkFn);
  }

  /**
   * Updates the status of a subsystem.
   */
  setStatus(name, status, detail) {
    this._statuses.set(name, { status, detail, updatedAt: clock.now() });
  }

  /**
   * Update replay status.
   */
  setReplayStatus(status, detail) {
    this.setStatus('replay', status, detail);
  }

  /**
   * Update projection status.
   */
  setProjectionStatus(status, detail) {
    this.setStatus('projection', status, detail);
  }

  /**
   * Update event bus status.
   */
  setEventBusStatus(status, detail) {
    this.setStatus('eventBus', status, detail);
  }

  /**
   * Update recovery queue status.
   */
  setRecoveryQueueStatus(status, detail) {
    this.setStatus('recoveryQueue', status, detail);
  }

  /**
   * Update clock status.
   */
  setClockStatus(status, detail) {
    this.setStatus('clock', status, detail);
  }

  /**
   * Runs all registered health checks and returns overall status.
   */
  async status() {
    const results = [];
    let healthy = true;

    // Run registered checks
    for (const [name, checkFn] of this._checks) {
      try {
        const result = await checkFn();
        const isHealthy = result !== false && result !== 'DOWN';
        results.push({ name, status: isHealthy ? 'UP' : 'DOWN', detail: result });
        if (!isHealthy) healthy = false;
      } catch (err) {
        results.push({ name, status: 'DOWN', error: err.message });
        healthy = false;
      }
    }

    // Include tracked statuses
    for (const [name, st] of this._statuses) {
      results.push({ name, status: st.status, detail: st.detail, updatedAt: st.updatedAt || null });
      if (st.status === 'DOWN') healthy = false;
    }

    return {
      status: healthy ? 'UP' : 'DEGRADED',
      timestamp: clock.now(),
      uptime: process.uptime(),
      checks: results
    };
  }

  /**
   * Returns true if all subsystems are healthy.
   */
  async isHealthy() {
    const s = await this.status();
    return s.status === 'UP';
  }

  /**
   * Returns a simple readiness check.
   */
  async readiness() {
    const s = await this.status();
    return {
      ready: s.status === 'UP',
      status: s.status,
      timestamp: clock.now()
    };
  }

  /**
   * Returns a simple liveness check.
   */
  async liveness() {
    return { alive: true, timestamp: clock.now() };
  }
}

const healthMonitor = new HealthMonitor();

module.exports = { HealthMonitor, healthMonitor };