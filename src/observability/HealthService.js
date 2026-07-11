const { healthMonitor } = require('./health');

/**
 * HealthService — Phase 20 Observability Platform
 * 
 * Exposes readiness, liveness, and overall subsystem status checks 
 * by wrapping the core healthMonitor singleton.
 */
class HealthService {
  /**
   * Performs the readiness check.
   */
  static async readiness() {
    return healthMonitor.readiness();
  }

  /**
   * Performs the liveness check.
   */
  static async liveness() {
    return healthMonitor.liveness();
  }

  /**
   * Compiles the full status checklist for all registered subsystems.
   */
  static async status() {
    return healthMonitor.status();
  }
}

module.exports = HealthService;
