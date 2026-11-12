const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || root);
const output = path.resolve(process.argv[3] || path.join(root, 'scratch', 'financial-forensics'));
if (target !== root && !target.startsWith(root + path.sep)) throw new Error('TARGET_MUST_BE_INSIDE_ISOLATED_WORKTREE');
if (!output.startsWith(root + path.sep)) throw new Error('OUTPUT_MUST_BE_INSIDE_ISOLATED_WORKTREE');
fs.mkdirSync(output, { recursive: true });

// Deliberate environment allowlist: no inherited provider, database or deployment secrets.
const env = {};
for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'NODE_PATH']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true',
  ENABLE_DOKU_PRODUCTION: 'false', ENABLE_IPAYMU_PRODUCTION: 'false',
  ENABLE_MIDTRANS_PRODUCTION: 'false', ENABLE_XENDIT_PRODUCTION: 'false'
});

const tests = [
  'test_payment_provider_contracts.js', 'test_mvp_transaction_loop.js',
  'test_inventory_concurrency_race.js', 'test_pricing_tax_ledger_engine.js',
  'test_ipaymu_compliance.js', 'test_ipaymu_argus_lifecycle.js',
  'test_refund_state_machine_and_provider_confirmation.js',
  'test_p0_p1_payment_inventory_safety.js', 'test_payment_sandbox_e2e_matrix.js',
  'test_doku_payment_migration.js', 'test_mvp_dispute_loop.js',
  'test_transaction_control_center_red_yellow_green.js'
];
const results = [];
for (const file of tests) {
  const started = Date.now();
  const result = spawnSync(process.execPath,
    ['--require', path.join(__dirname, 'offline-test-guard.cjs'), file],
    { cwd: target, env, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  fs.writeFileSync(path.join(output, file + '.log'), stdout + '\n--- STDERR ---\n' + stderr);
  results.push({ file, exit_code: result.status, signal: result.signal,
    error: result.error?.code || null, duration_ms: Date.now() - started,
    status: result.error ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'FAIL',
    network_blocked: (stdout + stderr).includes('OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED') });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ target, results }, null, 2));
  console.log(`${file}: ${results.at(-1).status} exit=${result.status}`);
}
const failed = results.filter(r => r.status !== 'PASS').length;
console.log(`${results.length - failed} passed; ${failed} failed/blocked; ${tests.length} executed`);
fs.writeFileSync(path.join(output, 'complete.json'), JSON.stringify({ exit_code: failed ? 1 : 0, total: tests.length, failed }));
process.exitCode = failed ? 1 : 0;