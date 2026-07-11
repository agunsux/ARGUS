/**
 * CaseSimilarity — EPIC Ω Knowledge & Learning Layer
 * 
 * Computes attribute similarity indexes (Jaccard similarity) between 
 * two evaluated transactions.
 */
class CaseSimilarity {
  /**
   * Calculates Jaccard similarity index based on explainability risk contributors.
   */
  static calculateJaccard(caseA, caseB) {
    if (!caseA || !caseB) return 0;

    const contributorsA = caseA.explainability?.riskContributors || {};
    const contributorsB = caseB.explainability?.riskContributors || {};

    const setA = new Set(Object.keys(contributorsA));
    const setB = new Set(Object.keys(contributorsB));

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    return parseFloat((intersection.size / union.size).toFixed(4));
  }
}

module.exports = CaseSimilarity;
