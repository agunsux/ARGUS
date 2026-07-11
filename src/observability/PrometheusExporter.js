/**
 * PrometheusExporter — Phase 20 Observability Platform
 * 
 * Formats metrics snapshots into standard Prometheus exposition format.
 */
class PrometheusExporter {
  /**
   * Converts a metric registry snapshot object into a Prometheus text string.
   */
  static export(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return '';
    }

    let result = '';
    for (const [key, val] of Object.entries(snapshot)) {
      // Normalize key name to valid Prometheus format (letters, numbers, underscores)
      const normalizedKey = key.replace(/[:.-]/g, '_').toLowerCase();
      
      result += `# HELP argus_${normalizedKey} Telemetry metric for system audit\n`;
      result += `# TYPE argus_${normalizedKey} gauge\n`;
      result += `argus_${normalizedKey} ${val}\n\n`;
    }

    return result.trim();
  }
}

module.exports = PrometheusExporter;
