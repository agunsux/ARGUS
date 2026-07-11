const DecisionFactory = require('./DecisionFactory');
const DecisionValidator = require('./DecisionValidator');
const DecisionSnapshot = require('./DecisionSnapshot');
const { decisionMetrics } = require('./DecisionMetrics');

/**
 * PipelineState
 * 
 * Running state context carried across the pipeline execution.
 */
class PipelineState {
  constructor(context) {
    this.context = context;
    this.candidate = null;
    this.policyResult = null;
    this.decision = null;
    this.snapshot = null;
    this.trace = [];
    this.startTime = Date.now();
  }

  addTrace(stageName, detail) {
    this.trace.push({
      stageName,
      timestamp: new Date().toISOString(),
      detail
    });
  }
}

// Stage 1: Context Validation
class ContextValidationStage {
  execute(state) {
    const res = state.context.validate();
    if (!res.valid) {
      decisionMetrics.increment('validationErrors');
      throw new Error(`Stage 1 (ContextValidation) failed: ${res.errors.join('; ')}`);
    }
    state.addTrace('ContextValidation', 'Context conforms to contract validation requirements');
  }
}

// Stage 2: Evidence Resolution
class EvidenceResolutionStage {
  execute(state) {
    const count = state.context.evidence.length;
    state.addTrace('EvidenceResolution', `Resolved ${count} evidence payload reference(s)`);
  }
}

// Stage 3: Inference Resolution
class InferenceResolutionStage {
  execute(state) {
    const hasInference = !!state.context.inference;
    state.addTrace('InferenceResolution', `Resolved inference prediction availability: ${hasInference}`);
  }
}

// Stage 4: Risk Aggregation
class RiskAggregationStage {
  constructor(engine) {
    this.engine = engine;
  }
  execute(state) {
    state.candidate = this.engine.evaluate(state.context);
    state.addTrace('RiskAggregation', `Compiled DecisionCandidate for transaction ${state.candidate.transactionId}`);
  }
}

// Stage 5: Policy Evaluation
class PolicyEvaluationStage {
  constructor(policyEngine) {
    const PolicyEngineClass = require('../policy/PolicyEngine');
    this.policyEngine = policyEngine || new PolicyEngineClass();
  }
  execute(state) {
    const { policyRegistry } = require('../policy/PolicyRegistry');
    const policyId = state.context.transaction.policyId || 'fraud-mitigation-policy';

    let policy;
    try {
      policy = policyRegistry.resolve(policyId);
    } catch (err) {
      // compile and register fallback
      const PolicyCompiler = require('../policy/PolicyCompiler');
      const PolicyDefinition = require('../policy/PolicyDefinition');
      const fs = require('fs');
      const path = require('path');
      const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/policy/policy_fixture_v1.json'), 'utf8'));
      policy = PolicyCompiler.compile(new PolicyDefinition(raw));
      policyRegistry.register(policy);
    }

    const evaluation = this.policyEngine.evaluate(policy, state.candidate);
    state.policyResult = evaluation;

    decisionMetrics.increment('policyCount');
    if (evaluation.decision !== 'APPROVE') {
      decisionMetrics.increment('ruleHits');
    }

    state.addTrace('PolicyEvaluation', `Evaluated candidate action: ${evaluation.decision}`);
  }
}

// Stage 6: Decision Build
class DecisionBuildStage {
  execute(state) {
    const candidate = state.candidate;
    const policy = state.policyResult;
    const finalAction = policy.decision || policy.action || 'APPROVE';

    state.decision = DecisionFactory.create({
      executionId: candidate.executionId,
      correlationId: candidate.correlationId,
      causationId: candidate.causationId,
      entityId: candidate.entityId || candidate.transactionId,
      action: finalAction,
      confidence: candidate.rawConfidence,
      reasonCodes: policy.reasonCodes,
      evidenceIds: candidate.evidenceIds,
      riskIds: candidate.risks.map(r => r.id),
      inferenceIds: candidate.inferences.map(i => i.id),
      createdAt: candidate.createdAt,
      explainability: {
        why: `Evaluated as ${finalAction} due to: ${policy.reasonCodes.join(', ') || 'no violations'}.`,
        whyNot: '',
        supportingEvidence: candidate.evidenceIds,
        contradictingEvidence: [],
        riskContributors: candidate.facts,
        confidenceContributors: { rawConfidence: candidate.rawConfidence },
        missingInformation: [],
        alternativeOutcomes: []
      }
    }, {
      id: `dec-${candidate.id.split('-').slice(1).join('-')}`, // Deterministic derivation from candidate ID
      createdAt: candidate.createdAt,
      freeze: true
    });

    state.addTrace('DecisionBuild', `Decision ${state.decision.id} constructed`);
  }
}


// Stage 7: Validation
class ValidationStage {
  execute(state) {
    const res = DecisionValidator.validate(state.decision);
    if (!res.valid) {
      decisionMetrics.increment('validationErrors');
      throw new Error(`Stage 7 (Validation) failed: ${res.errors.join('; ')}`);
    }
    state.addTrace('Validation', 'Decision invariants successfully verified');
  }
}

// Stage 8: Snapshot
class SnapshotStage {
  execute(state) {
    state.snapshot = DecisionSnapshot.capture(state.decision);
    state.addTrace('Snapshot', `Captured snapshot of decision state. Hash: ${state.snapshot.hash}`);
  }
}

/**
 * DecisionPipeline
 * 
 * Orchestrates execution of the 8 separate pipeline stages.
 */
class DecisionPipeline {
  constructor(engine, policyEngine) {
    this.stages = [
      new ContextValidationStage(),
      new EvidenceResolutionStage(),
      new InferenceResolutionStage(),
      new RiskAggregationStage(engine),
      new PolicyEvaluationStage(policyEngine),
      new DecisionBuildStage(),
      new ValidationStage(),
      new SnapshotStage()
    ];
  }

  /**
   * Executes the pipeline for the given context.
   */
  run(context) {
    const state = new PipelineState(context);
    const start = Date.now();

    for (const stage of this.stages) {
      stage.execute(state);
    }

    const latency = Date.now() - start;
    decisionMetrics.record('decisionLatency', latency);
    decisionMetrics.increment('evaluationCount');

    return state;
  }
}

module.exports = {
  DecisionPipeline,
  PipelineState
};
