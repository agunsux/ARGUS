const ModelComparison = require('./ModelComparison');
const PromotionDecision = require('./PromotionDecision');
const RollbackDecision = require('./RollbackDecision');
const ThresholdPolicy = require('./ThresholdPolicy');
const EvidenceComparator = require('./EvidenceComparator');

/**
 * EvolutionEngine — Phase 2 Model Evolution
 * 
 * Orchestrates comparative metric audits, registers promotions, 
 * and handles automated rollback actions.
 */
class EvolutionEngine {
  constructor(championRegistry, challengerRegistry, canaryRegistry) {
    this.championRegistry = championRegistry;
    this.challengerRegistry = challengerRegistry;
    this.canaryRegistry = canaryRegistry;
  }

  /**
   * Compares challenger and champion model parameters.
   */
  compareModels(challenger, champion, executionId, correlationId) {
    const diff = {
      precision: parseFloat((challenger.performanceMetrics.precision - champion.performanceMetrics.precision).toFixed(4)),
      recall: parseFloat((challenger.performanceMetrics.recall - champion.performanceMetrics.recall).toFixed(4)),
      logLoss: parseFloat((challenger.performanceMetrics.logLoss - champion.performanceMetrics.logLoss).toFixed(4))
    };

    const comparison = new ModelComparison({
      id: `compare-${challenger.modelId}-${champion.modelId}`,
      entityId: 'argus-evolution-system',
      challengerId: challenger.modelId,
      championId: champion.modelId,
      metricsDifference: diff,
      executionId,
      correlationId
    });

    return comparison.freeze();
  }

  /**
   * Evaluates if a challenger should be promoted.
   */
  evaluatePromotion(challenger, champion, executionId, correlationId) {
    const comparison = this.compareModels(challenger, champion, executionId, correlationId);
    const promoteAllowed = ThresholdPolicy.shouldPromote(comparison);

    if (promoteAllowed) {
      // Execute promotion update in Champion registry
      challenger.state = 'CHAMPION';
      champion.state = 'RETIRED';
      this.championRegistry.setActive(challenger);
      this.challengerRegistry.remove(challenger.modelId);

      const decision = new PromotionDecision({
        id: `promo-dec-${challenger.modelId}`,
        entityId: 'argus-evolution-system',
        modelId: challenger.modelId,
        promotedTo: 'CHAMPION',
        reason: 'Challenger met all policy thresholds',
        approvedBy: 'AutoEvolutionEngine',
        executionId,
        correlationId
      });

      return {
        promoted: true,
        decision: decision.freeze(),
        report: EvidenceComparator.generateReport(challenger, champion, comparison)
      };
    }

    return { promoted: false };
  }

  /**
   * Evaluates if a canary model needs rollback.
   */
  evaluateRollback(executionId, correlationId) {
    const canary = this.canaryRegistry.getCanary();
    if (!canary) return { rollbackTriggered: false };

    const shouldRollback = ThresholdPolicy.shouldRollback(this.canaryRegistry);
    if (shouldRollback) {
      const activeChampion = this.championRegistry.getActive();
      const rollbackTargetId = activeChampion ? activeChampion.modelId : 'fallback-v1';

      canary.state = 'ROLLED_BACK';
      this.canaryRegistry.clear();

      const decision = new RollbackDecision({
        id: `rollback-dec-${canary.modelId}`,
        entityId: 'argus-evolution-system',
        modelId: canary.modelId,
        rolledBackTo: rollbackTargetId,
        triggerMetric: 'failureRate',
        reason: 'Canary failure rate limit exceeded threshold',
        executionId,
        correlationId
      });

      return {
        rollbackTriggered: true,
        decision: decision.freeze()
      };
    }

    return { rollbackTriggered: false };
  }
}

module.exports = EvolutionEngine;
