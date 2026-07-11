const DecisionContext = require('../decision/DecisionContext');

/**
 * LoadGenerator — Phase 21 Performance Laboratory
 * 
 * Generates and fires concurrent evaluation requests against the DecisionOrchestrator.
 */
class LoadGenerator {
  /**
   * Fires concurrent transaction loads against the orchestrator.
   */
  static async generateLoad(orchestrator, payloadTemplate, concurrency = 10, totalRequests = 100) {
    if (!orchestrator) throw new Error('Orchestrator is required');

    const latencies = [];
    let successCount = 0;
    let failureCount = 0;

    const runRequest = async (index) => {
      const start = Date.now();
      try {
        const context = new DecisionContext({
          ...payloadTemplate,
          transaction: {
            ...payloadTemplate.transaction,
            transactionId: `${payloadTemplate.transaction?.transactionId || 'tx'}-load-${index}`
          },
          executionId: `exec-load-${index}`,
          correlationId: `corr-load-${index}`
        });

        const res = orchestrator.evaluate(context);
        if (res && res.decision) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (err) {
        failureCount++;
      } finally {
        latencies.push(Date.now() - start);
      }
    };

    // Process in batches matching concurrency limit
    for (let i = 0; i < totalRequests; i += concurrency) {
      const batch = [];
      const limit = Math.min(totalRequests, i + concurrency);
      for (let j = i; j < limit; j++) {
        batch.push(runRequest(j));
      }
      await Promise.all(batch);
    }

    return {
      successCount,
      failureCount,
      latencies
    };
  }
}

module.exports = LoadGenerator;
