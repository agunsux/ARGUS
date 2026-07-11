const assert = require('assert');
const ImportPipeline = require('./src/dataset/ImportPipeline');

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

console.log('\n=== PHASE 24 DATASET IMPORT PLATFORM TEST SUITE ===\n');

const pipeline = new ImportPipeline();

t('ImportPipeline normalizes, deduplicates, and canonicalizes data', () => {
  pipeline.clear();
  const rawLogs = [
    { id: 'rep-1', entityId: '  User-A ', type: 'Marketplace scam', rawScore: 80 },
    { id: 'rep-1', entityId: '  User-A ', type: 'Marketplace scam', rawScore: 80 }, // Duplicate ID
    { id: 'rep-2', entityId: '  user-a ', type: 'marketplace scam', rawScore: 80 } // Duplicate entity-type combination
  ];

  const res = pipeline.importData(rawLogs, 'community_reports');
  assert.strictEqual(res.totalCount, 1);
  assert.strictEqual(res.duplicatesCount, 2);
  
  const record = res.imported[0];
  assert.strictEqual(record.entityId, 'user-a'); // Normalized to lower & trimmed
  assert.strictEqual(record.type, 'MARKETPLACE_SCAM'); // Canonicalized to upper snake case
  assert.strictEqual(record.linkedNode, 'node:user-a');
  assert.strictEqual(record.importConfidence, 0.55); // Weight of community_reports
});

t('ImportPipeline computes higher confidence score for verified investigations', () => {
  pipeline.clear();
  const raw = [{ id: 'v1', entityId: 'user-b', type: 'Investment fraud' }];
  const res = pipeline.importData(raw, 'verified_investigations');
  assert.strictEqual(res.imported[0].importConfidence, 0.95);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
