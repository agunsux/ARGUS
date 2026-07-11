/**
 * ChaosRunner — Phase 21 Performance Laboratory
 * 
 * Injects simulated delays or execution failure triggers into the target orchestrator.
 */
class ChaosRunner {
  /**
   * Overrides orchestrator evaluate to inject latency.
   */
  static injectLatency(orchestrator, latencyMs) {
    const originalEvaluate = orchestrator.evaluate;
    
    orchestrator.evaluate = function(context) {
      const start = Date.now();
      while (Date.now() - start < latencyMs) {
        // Busy wait to simulate synchronous process lag
      }
      return originalEvaluate.call(orchestrator, context);
    };

    return {
      restore: () => {
        orchestrator.evaluate = originalEvaluate;
      }
    };
  }

  /**
   * Overrides orchestrator evaluate to inject random failures.
   */
  static injectFailure(orchestrator, failureRate = 0.5) {
    const originalEvaluate = orchestrator.evaluate;

    orchestrator.evaluate = function(context) {
      if (Math.random() < failureRate) {
        throw new Error('CHAOS_INJECTED_FAILURE: System fault simulated');
      }
      return originalEvaluate.call(orchestrator, context);
    };

    return {
      restore: () => {
        orchestrator.evaluate = originalEvaluate;
      }
    };
  }
}

module.exports = ChaosRunner;
