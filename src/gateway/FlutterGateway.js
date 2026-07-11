const DecisionContext = require('../decision/DecisionContext');

/**
 * FlutterGateway — Phase 23 Flutter Production Integration
 * 
 * Provides API mappings to feed the Flutter production mobile client,
 * including offline queues, sync retry states, and visual graph builders.
 */
class FlutterGateway {
  constructor(orchestrator, explanationEngine) {
    this.orchestrator = orchestrator;
    this.explanationEngine = explanationEngine;
    this.offlineSyncQueue = [];
  }

  /**
   * Builds visual payload data for the Flutter Timeline Page.
   */
  getTimelineVisuals(decision) {
    if (!decision) return {};
    return {
      cardId: decision.id,
      timestamp: decision.createdAt,
      state: decision.lifecycleState,
      action: decision.action,
      reasons: decision.reasonCodes || [],
      traceId: decision.correlationId
    };
  }

  /**
   * Builds visual reputation parameters for the Flutter Trust Graph Page.
   */
  getTrustVisuals(trustContract) {
    if (!trustContract) return { score: 0, status: 'UNKNOWN' };
    return {
      score: trustContract.score || 0,
      reputationLevel: trustContract.score > 80 ? 'EXCELLENT' : trustContract.score > 50 ? 'GOOD' : 'POOR',
      factors: trustContract.metadata?.factors || []
    };
  }

  /**
   * Builds visual speed parameters for the Flutter Velocity Page.
   */
  getVelocityVisuals(riskContract) {
    if (!riskContract) return { riskScore: 0, level: 'LOW' };
    return {
      riskScore: riskContract.riskScore || 0,
      riskLevel: riskContract.riskLevel || 'LOW',
      indicators: riskContract.metadata?.indicators || []
    };
  }

  /**
   * Builds link details for the Flutter Identity Graph visualization.
   */
  getGraphVisuals(decision) {
    if (!decision) return { nodes: [], links: [] };
    return {
      nodes: [
        { id: decision.entityId, type: 'entity' },
        { id: decision.correlationId, type: 'session' }
      ],
      links: [
        { source: decision.entityId, target: decision.correlationId, relation: 'eval_path' }
      ]
    };
  }

  /**
   * Pushes a failed or offline transaction payload to the retry sync queue.
   */
  addToSyncQueue(payload) {
    const item = {
      queueId: `queue-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      payload,
      status: 'PENDING'
    };
    this.offlineSyncQueue.push(item);
    return item;
  }

  /**
   * Flushes and processes the offline queue, resolving conflicts.
   */
  processSyncQueue() {
    const processed = [];
    const failed = [];

    while (this.offlineSyncQueue.length > 0) {
      const item = this.offlineSyncQueue.shift();
      try {
        const ctx = new DecisionContext(item.payload);
        const outcome = this.orchestrator.evaluate(ctx);
        processed.push({
          queueId: item.queueId,
          transactionId: ctx.transaction.transactionId,
          decisionId: outcome.decision.id,
          action: outcome.decision.action
        });
      } catch (err) {
        failed.push({
          queueId: item.queueId,
          error: err.message
        });
      }
    }

    return { processed, failed };
  }
}

module.exports = FlutterGateway;
