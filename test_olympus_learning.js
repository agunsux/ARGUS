"use strict";

const assert = require('assert');
const LearningSnapshot = require('./src/learning/LearningSnapshot');
const LearningQueue = require('./src/learning/LearningQueue');
const LearningEngine = require('./src/learning/LearningEngine');
const KnowledgeGraph = require('./src/knowledge/KnowledgeGraph');

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

console.log('\n=== OLYMPUS CONTINUOUS LEARNING TEST SUITE ===\n');

t('LearningSnapshot contract validates correct configurations', () => {
  const snap = new LearningSnapshot({
    id: 'snap-1',
    entityId: 'user-a',
    epochId: 'epoch-10',
    casesProcessed: 5,
    executionId: 'exec-1',
    correlationId: 'corr-1'
  });

  const val = snap.validate();
  assert.ok(val.valid);
  assert.strictEqual(snap.epochId, 'epoch-10');
});

t('LearningQueue enqueues and dequeues batches successfully', () => {
  const queue = new LearningQueue();
  queue.enqueue({ driftDelta: 0.1 });
  queue.enqueue({ driftDelta: 0.2 });

  assert.strictEqual(queue.size(), 2);
  const batch = queue.dequeueBatch(1);
  assert.strictEqual(batch.length, 1);
  assert.strictEqual(queue.size(), 1);
});

t('LearningEngine processes batch events and yields frozen snapshots', () => {
  const kg = new KnowledgeGraph();
  const engine = new LearningEngine(kg);
  
  const events = [
    { payload: { driftDelta: 0.1 } },
    { payload: { driftDelta: 0.25 } } // total driftDelta = 0.35 > 0.3 -> drift detected
  ];

  const snapshot = engine.processBatch(events, 'exec-titan-1', 'corr-titan-1');
  assert.ok(snapshot);
  assert.strictEqual(snapshot.epochId, 'epoch-1');
  assert.strictEqual(snapshot.casesProcessed, 2);
  assert.strictEqual(snapshot.driftStatus.driftDetected, true);
  assert.strictEqual(snapshot.driftStatus.ksStatistic, 0.35);

  // Assert immutability
  assert.throws(() => {
    snapshot.epochId = 'new-epoch';
  }, TypeError);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
