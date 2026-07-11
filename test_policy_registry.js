const assert = require('assert');
const { PolicyRegistry } = require('./src/policy/PolicyRegistry');
const Policy = require('./src/policy/Policy');

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

console.log('\n=== POLICY REGISTRY TEST SUITE ===\n');

t('PolicyRegistry registers and resolves latest policy version', () => {
  const registry = new PolicyRegistry();
  const p1 = new Policy({ id: 'p-1', version: '1.0.0' });
  const p2 = new Policy({ id: 'p-1', version: '1.1.0' });

  registry.register(p1);
  registry.register(p2);

  // Resolving without version should return latest (1.1.0)
  const resolved = registry.resolve('p-1');
  assert.strictEqual(resolved.version, '1.1.0');
});

t('PolicyRegistry resolves specific policy version', () => {
  const registry = new PolicyRegistry();
  const p1 = new Policy({ id: 'p-1', version: '1.0.0' });
  const p2 = new Policy({ id: 'p-1', version: '1.1.0' });

  registry.register(p1);
  registry.register(p2);

  const resolved = registry.resolve('p-1', '1.0.0');
  assert.strictEqual(resolved.version, '1.0.0');
});

t('PolicyRegistry throws error when resolving non-existent policy', () => {
  const registry = new PolicyRegistry();
  assert.throws(() => registry.resolve('p-missing'), /not found in registry/);
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);
