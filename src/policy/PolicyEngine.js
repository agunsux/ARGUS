const PolicyEvaluation = require('./PolicyEvaluation');
const { policyMetrics } = require('./PolicyMetrics');

/**
 * PolicyEngine — Phase 5 Policy Framework
 * 
 * Executes evaluation of DecisionCandidates against compiled policies.
 * Consolidates rule outcomes and determines final actions based on severity, 
 * outputting a structured PolicyEvaluation object.
 */
class PolicyEngine {
  /**
   * Evaluates a DecisionCandidate against a Policy.
   * Returns a frozen, validated PolicyEvaluation contract.
   */
  evaluate(policy, candidate, context = {}) {
    if (!policy) {
      throw new Error('Policy is required for evaluation');
    }
    if (!candidate) {
      throw new Error('DecisionCandidate is required for evaluation');
    }

    const start = Date.now();
    const matchedRules = [];
    const failedRules = [];
    const reasonCodes = [];
    
    const supportingEvidence = [];
    const contradictingEvidence = [];
    const missingEvidence = [];
    const evaluationTrace = [];

    const rules = policy.ruleSet ? policy.ruleSet.getRules() : [];
    policyMetrics.increment('policyEvaluated');

    for (const rule of rules) {
      policyMetrics.increment('ruleEvaluated');
      const matched = rule.evaluate(candidate);

      evaluationTrace.push({
        ruleId: rule.id,
        matched,
        action: rule.action,
        reasonCode: rule.reasonCode,
        timestamp: context.timestamp || new Date().toISOString()
      });

      if (matched) {
        matchedRules.push(rule.id);
        if (rule.reasonCode) {
          reasonCodes.push(rule.reasonCode);
        }
        if (rule.evidenceRequirements) {
          supportingEvidence.push(...(rule.evidenceRequirements.supportingEvidence || []));
          missingEvidence.push(...(rule.evidenceRequirements.missingEvidence || []));
        }
        policyMetrics.increment('ruleHits');
      } else {
        failedRules.push(rule.id);
        if (rule.evidenceRequirements) {
          contradictingEvidence.push(...(rule.evidenceRequirements.contradictingEvidence || []));
        }
      }
    }

    // Resolve final decision based on severity priority: BLOCK > REVIEW > FLAG > APPROVE
    let finalDecision = 'APPROVE';
    const activeActions = rules.filter(r => matchedRules.includes(r.id)).map(r => r.action);
    if (activeActions.includes('BLOCK')) {
      finalDecision = 'BLOCK';
    } else if (activeActions.includes('REVIEW')) {
      finalDecision = 'REVIEW';
    } else if (activeActions.includes('FLAG')) {
      finalDecision = 'FLAG';
    }

    const latency = Date.now() - start;
    policyMetrics.record('evaluationLatency', latency);

    // Instantiate canonical PolicyEvaluation contract
    const id = context.id || `pev-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = context.timestamp || new Date().toISOString();

    const evaluation = new PolicyEvaluation({
      id,
      entityId: candidate.transactionId,
      executionId: candidate.executionId,
      correlationId: candidate.correlationId,
      causationId: candidate.causationId,
      policyId: policy.id,
      matchedRules,
      failedRules,
      decision: finalDecision,
      confidence: candidate.rawConfidence,
      reasonCodes,
      supportingEvidence: [...new Set(supportingEvidence)],
      contradictingEvidence: [...new Set(contradictingEvidence)],
      missingEvidence: [...new Set(missingEvidence)],
      evaluationTrace,
      createdAt: timestamp
    });

    return evaluation.freeze();
  }
}

module.exports = PolicyEngine;
