const assert = require('assert');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');
const LoadGenerator = require('./src/performance/LoadGenerator');
const PerformanceAnalyzer = require('./src/performance/PerformanceAnalyzer');
const BenchmarkRunner = require('./src/performance/BenchmarkRunner');
const StressRunner = require('./src/performance/StressRunner');
const SoakRunner = require('./src/performance/SoakRunner');
const ChaosRunner = require('./src/performance/ChaosRunner');
const fs = require('fs');
const path = require('path');

let p = 0, f = 0;
const t = (n, fn) => {
  try {
    fn();
    console.log('  \u2713', n);
    p++;
  } catch (e) {
    console.log('  \u2717', n, e.message);
    f++;
  }
};

const asyncTest = (n, fn) => {
  return fn().then(() => {
    console.log('  \u2713', n);
    p++;
  }).catch((e) => {
    console.log('  \u2717', n, e.message);
    f++;
  });
};

console.log('\n=== PHASE 21 PERFORMANCE LABORATORY TEST SUITE ===\n');

const orchestrator = new DecisionOrchestrator();
const payloadTemplate = {
  transaction: { transactionId: 'tx-1', price: 100 },
  evidence: [],
  executionId: 'exec-1',
  correlationId: 'corr-1'
};

async function runTests() {
  t('PerformanceAnalyzer calculates percentiles and exports reports', () => {
    const mockResults = {
      successCount: 10,
      failureCount: 0,
      latencies: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    };
    const report = PerformanceAnalyzer.analyze('TestRun', mockResults, 100);
    assert.strictEqual(report.p50Ms, 6);
    assert.strictEqual(report.p95Ms, 10);
    assert.strictEqual(report.throughputReqSec, 100);

    const reportContent = PerformanceAnalyzer.writeReport(report, __dirname);
    assert.ok(fs.existsSync(path.join(__dirname, 'BENCHMARK_RESULTS.md')));
    assert.ok(reportContent.includes('ARGUS Performance Benchmark Report'));
  });

  await asyncTest('LoadGenerator fires concurrent request batches', async () => {
    const res = await LoadGenerator.generateLoad(orchestrator, payloadTemplate, 5, 20);
    assert.strictEqual(res.successCount, 20);
    assert.strictEqual(res.latencies.length, 20);
  });

  await asyncTest('BenchmarkRunner executes benchmark user levels', async () => {
    const report = await BenchmarkRunner.runBenchmark(orchestrator, payloadTemplate, 20, __dirname);
    assert.strictEqual(report.totalRequests, 20);
    assert.ok(report.throughputReqSec >= 0);
  });

  await asyncTest('StressRunner runs load until breaking points are reached', async () => {
    // Inject a latency ruleset using ChaosRunner to trigger breaking latency > 200ms
    const chaos = ChaosRunner.injectLatency(orchestrator, 250);
    
    const stressReport = await StressRunner.runStress(orchestrator, payloadTemplate, 30);
    assert.strictEqual(stressReport.breakingPointConcurrency, 10);
    assert.ok(stressReport.finalAverageLatencyMs >= 200);

    chaos.restore();
  });

  await asyncTest('SoakRunner checks endurance and reports leak check parameters', async () => {
    const soakReport = await SoakRunner.runSoak(orchestrator, payloadTemplate, 500); // 500ms duration
    assert.ok(soakReport.totalRequests >= 10);
    assert.strictEqual(typeof soakReport.leakDetected, 'boolean');
  });

  await asyncTest('ChaosRunner successfully injects failures', async () => {
    const chaos = ChaosRunner.injectFailure(orchestrator, 1.0); // 100% failure rate
    
    const res = await LoadGenerator.generateLoad(orchestrator, payloadTemplate, 2, 2);
    assert.strictEqual(res.failureCount, 2);
    assert.strictEqual(res.successCount, 0);

    chaos.restore();
  });

  console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
  if (f > 0) process.exit(1);
  else process.exit(0);
}

runTests();
