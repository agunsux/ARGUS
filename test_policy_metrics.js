const assert = require('assert');
const { PolicyMetrics, policyMetrics } = require('./src/policy/PolicyMetrics');

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

console.log('\n=== POLICY METRICS TEST SUITE ===\n');

t('PolicyMetrics records counters and histograms correctly', () => {
  policyMetrics.reset();
  policyMetrics.increment('ruleHits', 2);
  policyMetrics.record('evaluationLatency', 5);
  policyMetrics.record('evaluationLatency', 15);

  const snap = policyMetrics.snapshot();
  assert.strictEqual(snap.ruleHits, 2);
  assert.strictEqual(snap.evaluationLatency_count, 2);
  assert.strictEqual(snap.evaluationLatency_min, 5);
  assert.strictEqual(snap.evaluationLatency_max, 15);
  assert.strictEqual(snap.evaluationLatency_avg, 10);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
