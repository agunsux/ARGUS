const { metrics: baseMetrics } = require('./metrics');

/**
 * MetricsCollector — Phase 20 Observability Platform
 * 
 * Standardized wrapper class to aggregate core transaction, CPU, and RAM metrics.
 */
class MetricsCollector {
  constructor() {
    this.base = baseMetrics;
  }

  increment(metric, val = 1) {
    this.base.increment(metric, val);
  }

  record(metric, durationMs) {
    this.base.record(metric, durationMs);
  }

  snapshot() {
    const snap = this.base.snapshot();
    const mem = process.memoryUsage();
    
    return {
      ...snap,
      cpu_usage_user_ms: Math.round(process.cpuUsage().user / 1000),
      cpu_usage_system_ms: Math.round(process.cpuUsage().system / 1000),
      memory_heap_used_mb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
      memory_heap_total_mb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
      queue_depth: 0 // Mock queue depth indicator for pipeline
    };
  }

  reset() {
    this.base.reset();
  }
}

const collector = new MetricsCollector();

module.exports = {
  MetricsCollector,
  metrics: collector
};
