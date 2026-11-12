const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function isolated(code, env = {}) {
  return spawnSync(process.execPath, ['-e', code], {
    cwd: __dirname, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, ...env }
  });
}

test('synthetic financial schedule is explicit, bounded and forbidden outside tests', () => {
  const helper = JSON.stringify(path.join(__dirname, 'test/helpers/financialEventFixture'));
  const result = isolated(`const assert = require('node:assert/strict');
    const { futureEventSchedule } = require(${helper});
    const now = new Date('2026-11-13T00:00:00Z');
    const fixture = futureEventSchedule(now);
    assert.equal(fixture.event_start_at, '2026-11-16T00:00:00.000Z');
    assert.equal(fixture.event_end_at, '2026-11-16T04:00:00.000Z');
    assert.equal(fixture.event_timezone, 'UTC');
    process.env.NODE_ENV = 'production';
    assert.throws(() => futureEventSchedule(now), /TEST_FIXTURE_ONLY/);`, { NODE_ENV: 'test' });
  assert.equal(result.status, 0, result.stderr);
});

test('offline preload rejects external network entry points before connecting', () => {
  const result = isolated(`require('./scripts/offline-test-guard.cjs');
    const assert = require('node:assert/strict');
    const blocked = /OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED/;
    assert.throws(() => require('node:http').request('http://example.invalid'), blocked);
    assert.throws(() => require('node:https').get('https://example.invalid'), blocked);
    assert.throws(() => fetch('https://example.invalid'), blocked);
    assert.throws(() => require('node:net').connect({host:'203.0.113.1',port:443}), blocked);
    assert.throws(() => require('node:dns').lookup('example.invalid', () => {}), blocked);`);
  assert.equal(result.status, 0, result.stderr);
});

test('offline preload permits actual loopback integration traffic', () => {
  const result = isolated(`require('./scripts/offline-test-guard.cjs');
    const http = require('node:http');
    const assert = require('node:assert/strict');
    const server = http.createServer((req,res) => res.end('local-only'));
    server.listen(0,'127.0.0.1',async () => {
      try {
        const response = await fetch('http://127.0.0.1:' + server.address().port);
        assert.equal(await response.text(), 'local-only');
      } catch (error) { console.error(error); process.exitCode = 1; }
      finally { server.closeAllConnections(); server.close(); }
    });`);
  assert.equal(result.status, 0, result.stderr);
});

test('DOKU simulation remains pending and non-simulation rejects unsupported payout', async () => {
  const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');
  const { CapabilityUnsupportedError } = require('./src/services/payment/PaymentProvider');
  const simulated = new DokuPaymentProvider({ allowSimulation: true });
  const strict = new DokuPaymentProvider({ allowSimulation: false });
  // Test instances only: explicitly remove inherited deployment activation assumptions.
  for (const provider of [simulated, strict]) {
    provider.payoutEnabled = false;
    provider.contractVerified = false;
  }
  const params = { orderId: 'forensic-local-order', sellerId: 'forensic-local-seller',
    amount: 100000, bankAccount: { bank: 'TEST_ONLY' }, idempotencyKey: 'forensic-local-key' };
  assert.equal(strict.capabilities().payout, false);
  await assert.rejects(strict.createPayout(params), CapabilityUnsupportedError);
  const result = await simulated.createPayout(params);
  assert.equal(result.simulated, true);
  assert.equal(result.status, 'PENDING_BANK_EXECUTION');
  assert.notEqual(result.status, 'DISBURSED');
  assert.equal(result.amount, params.amount);
});