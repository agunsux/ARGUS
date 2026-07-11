const assert = require('assert');
const FlutterGateway = require('./src/gateway/FlutterGateway');
const DecisionOrchestrator = require('./src/decision/DecisionOrchestrator');
const Decision = require('./src/decision/Decision');

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

console.log('\n=== PHASE 23 FLUTTER INTEGRATION GATEWAY TEST SUITE ===\n');

const orchestrator = new DecisionOrchestrator();
const gateway = new FlutterGateway(orchestrator);

t('FlutterGateway processes offline sync queue successfully', () => {
  gateway.offlineSyncQueue = [];
  const payload = {
    transaction: { transactionId: 'tx-offline-1', price: 5000 },
    evidence: [],
    executionId: 'exec-off-1',
    correlationId: 'corr-off-1'
  };

  const item = gateway.addToSyncQueue(payload);
  assert.strictEqual(item.status, 'PENDING');
  assert.strictEqual(gateway.offlineSyncQueue.length, 1);

  const syncResult = gateway.processSyncQueue();
  assert.strictEqual(syncResult.processed.length, 1);
  assert.strictEqual(syncResult.processed[0].queueId, item.queueId);
  assert.strictEqual(gateway.offlineSyncQueue.length, 0);
});

t('FlutterGateway formats visual mapping outputs correctly', () => {
  const dec = new Decision({
    id: 'dec-1',
    action: 'APPROVE',
    confidence: 0.9,
    entityId: 'ent-123',
    correlationId: 'corr-555',
    createdAt: '2026-07-11T12:00:00Z',
    reasonCodes: []
  });

  const timelineVisuals = gateway.getTimelineVisuals(dec);
  assert.strictEqual(timelineVisuals.cardId, 'dec-1');
  assert.strictEqual(timelineVisuals.action, 'APPROVE');

  const graphVisuals = gateway.getGraphVisuals(dec);
  assert.strictEqual(graphVisuals.nodes.length, 2);
  assert.strictEqual(graphVisuals.links[0].source, 'ent-123');

  const trustVisuals = gateway.getTrustVisuals({ score: 95, metadata: { factors: ['good_history'] } });
  assert.strictEqual(trustVisuals.score, 95);
  assert.strictEqual(trustVisuals.reputationLevel, 'EXCELLENT');

  const velocityVisuals = gateway.getVelocityVisuals({ riskScore: 10, riskLevel: 'LOW' });
  assert.strictEqual(velocityVisuals.riskScore, 10);
  assert.strictEqual(velocityVisuals.riskLevel, 'LOW');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
