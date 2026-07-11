const assert = require('assert');
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

console.log('\n=== PHASE 26 RELEASE CANDIDATE TEST SUITE ===\n');

t('RELEASE_CANDIDATE.md has been generated and displays READY status', () => {
  const rcPath = path.resolve(__dirname, 'RELEASE_CANDIDATE.md');
  assert.ok(fs.existsSync(rcPath), 'RELEASE_CANDIDATE.md should exist');
  
  const content = fs.readFileSync(rcPath, 'utf8');
  assert.ok(content.includes('🟢 READY FOR PRODUCTION'), 'Release Candidate must be marked as ready for production');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
