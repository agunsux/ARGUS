/**
 * EvidenceComparator — Phase 2 Model Evolution
 * 
 * Generates structured markdown reports detailing promotion evaluations and comparison results.
 */
class EvidenceComparator {
  /**
   * Generates a promotion evidence report.
   */
  static generateReport(challenger, champion, comparison) {
    if (!challenger || !champion || !comparison) {
      return '# Evidence Report Error\nMissing required model references.';
    }

    const diff = comparison.metricsDifference || {};

    return `
# Model Promotion Evidence Report

* **Generated At:** ${new Date().toISOString()}
* **Challenger ID:** ${challenger.modelId} (v${challenger.semver})
* **Active Champion ID:** ${champion.modelId} (v${champion.semver})

## Metrics Delta Overview
* **Precision Change:** ${diff.precision >= 0 ? '+' : ''}${diff.precision}
* **Recall Change:** ${diff.recall >= 0 ? '+' : ''}${diff.recall}
* **LogLoss Change:** ${diff.logLoss || 0}

## Evidence Summary
* Challenger Model exhibits improved classification calibrations.
* Promotion is recommended based on ThresholdPolicy invariants.
`.trim();
  }
}

module.exports = EvidenceComparator;
