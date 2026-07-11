/**
 * EvidenceExplainer — Phase 19 Explainability Platform
 * 
 * Analyzes evidence supporting, contradicting, or missing from policy requirements.
 */
class EvidenceExplainer {
  static explainHuman(evaluation) {
    if (!evaluation) return 'No evidence details found.';

    const parts = [];
    if (evaluation.supportingEvidence.length > 0) {
      parts.push(`Supported by: ${evaluation.supportingEvidence.join(', ')}`);
    }
    if (evaluation.contradictingEvidence.length > 0) {
      parts.push(`Contradicted by: ${evaluation.contradictingEvidence.join(', ')}`);
    }
    if (evaluation.missingEvidence.length > 0) {
      parts.push(`Missing requirements: ${evaluation.missingEvidence.join(', ')}`);
    }

    return parts.join('; ') || 'No specific evidence parameters were required.';
  }

  static explainTechnical(evaluation) {
    if (!evaluation) return {};
    return {
      supportingEvidence: evaluation.supportingEvidence,
      contradictingEvidence: evaluation.contradictingEvidence,
      missingEvidence: evaluation.missingEvidence
    };
  }
}

module.exports = EvidenceExplainer;
