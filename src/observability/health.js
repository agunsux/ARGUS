/**
 * Health Check — Wave 2.5 Observability
 * 
 * Provides system health status for monitoring and deployment.
 */
class HealthCheck {
  constructor() {
    this._checks = new Map();
  }

  /**
   * Registers a health check function.
   */
  register(name, checkFn) {
    this._checks.set(name, checkFn);
  }

  /**
   * Runs all registered health checks.
   */
  async status() {
    const results = [];
    let healthy = true;

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

    return {
      status: healthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: results
    };
  }

  /**
   * Returns a simple readiness check.
   */
  async readiness() {
    return { ready: true, timestamp: new Date().toISOString() };
  }

  /**
   * Returns a simple liveness check.
   */
  async liveness() {
    return { alive: true, timestamp: new Date().toISOString() };
  }
}

module.exports = { HealthCheck };
