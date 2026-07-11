const RuleExplainer = require('./RuleExplainer');
const TimelineExplainer = require('./TimelineExplainer');
const EvidenceExplainer = require('./EvidenceExplainer');
const GraphExplainer = require('./GraphExplainer');
const ConfidenceExplainer = require('./ConfidenceExplainer');
const VelocityExplainer = require('./VelocityExplainer');
const DecisionExplainer = require('./DecisionExplainer');

/**
 * ExplanationEngine — Phase 19 Explainability Platform
 * 
 * Aggregates explainability outputs from all specialized explainers 
 * and formats the result into Human, Technical, JSON, or Markdown structures.
 */
class ExplanationEngine {
  /**
   * Compiles explanations for a given Decision and corresponding PolicyEvaluation.
   * 
   * @param {Decision} decision
   * @param {PolicyEvaluation} evaluation
   * @param {string} format 'json' | 'human' | 'technical' | 'markdown'
   */
  static explain(decision, evaluation, format = 'json') {
    const human = {
      why: DecisionExplainer.explainHuman(decision),
      evidence: EvidenceExplainer.explainHuman(evaluation),
      rules: RuleExplainer.explainHuman(evaluation),
      graphInfluence: GraphExplainer.explainHuman(decision),
      timelineInfluence: TimelineExplainer.explainHuman(decision),
      velocityInfluence: VelocityExplainer.explainHuman(decision),
      confidenceInfluence: ConfidenceExplainer.explainHuman(decision),
      decisionReasoning: decision ? (decision.explainability?.why || '') : ''
    };

    const technical = {
      decision: DecisionExplainer.explainTechnical(decision),
      rules: RuleExplainer.explainTechnical(evaluation),
      evidence: EvidenceExplainer.explainTechnical(evaluation),
      graph: GraphExplainer.explainTechnical(decision),
      timeline: TimelineExplainer.explainTechnical(decision),
      velocity: VelocityExplainer.explainTechnical(decision),
      confidence: ConfidenceExplainer.explainTechnical(decision)
    };

    if (format === 'json') {
      return { human, technical };
    }

    if (format === 'technical') {
      return technical;
    }

    if (format === 'human') {
      return [
        `Summary: ${human.why}`,
        `Evidence: ${human.evidence}`,
        `Rules: ${human.rules}`,
        `Graph: ${human.graphInfluence}`,
        `Timeline: ${human.timelineInfluence}`,
        `Velocity: ${human.velocityInfluence}`,
        `Confidence: ${human.confidenceInfluence}`
      ].join('\n');
    }

    if (format === 'markdown') {
      return `
# ARGUS Decision Explainability Profile

## Executive Summary
* **Decision ID:** ${decision ? decision.id : 'N/A'}
* **Decision Action:** ${decision ? decision.action : 'N/A'}
* **Confidence Rating:** ${decision ? Math.round(decision.confidence * 100) : 0}%
* **Timestamp:** ${decision ? decision.createdAt : 'N/A'}

## Human Readable Explanations
* **Reasoning:** ${human.why}
* **Violations:** ${human.rules}
* **Evidence:** ${human.evidence}
* **Identity Graph Details:** ${human.graphInfluence}
* **Timeline Context:** ${human.timelineInfluence}
* **Velocity Metrics:** ${human.velocityInfluence}

## Technical Trace Specs
\`\`\`json
${JSON.stringify(technical, null, 2)}
\`\`\`
`.trim();
    }

    throw new Error(`Unsupported explainability format: '${format}'`);
  }
}

module.exports = ExplanationEngine;
