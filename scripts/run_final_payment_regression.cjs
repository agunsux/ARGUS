const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true' });
env.NODE_OPTIONS = `--require="${path.join(__dirname, 'offline-test-guard.cjs').replace(/\\/g, '/')}"`;
const pkg = require('../package.json');
const declared = pkg.scripts.test.split('&&').map(command => command.trim());
if (declared.some(command => !/^node [\w./-]+\.js$/.test(command))) throw new Error('Unsupported test command');
const suites = [...new Set([
  'test_doku_refund_fail_closed.js',
  'test_doku_confirmation_boundary.js',
  ...declared.map(command => command.slice(5)),
  'test_doku_verification_truthfulness.js', 'test_doku_sandbox_environment_isolation.js',
  'test_doku_direct_api_sandbox_e2e.js', 'test_admin_identity_postgres.js',
  'test_refund_state_machine_and_provider_confirmation.js', 'test_inventory_concurrency_race.js'
])];
const evidence = {
  startedAt: new Date().toISOString(),
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  isolation: 'No inherited credentials; external Node network blocked; not gateway evidence',
  counting: 'Suite process outcomes; native assertion counts are not inferred from exit code',
  suites: []
};
const output = path.join(root, 'evidence', 'final-payment-regression.json');
for (const file of suites) {
  const result = spawnSync(process.execPath, [file], { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  const text = (result.stdout || '') + '\n' + (result.stderr || '');
  evidence.suites.push({
    file, exitCode: result.status, error: result.error?.code || null,
    status: result.error ? 'BLOCKED' : result.status === 0 ? 'PASS' : result.status === 2 && /BLOCKED/.test(text) ? 'BLOCKED' : 'FAIL',
    externalNetworkBlocked: text.includes('OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED'),
    skipMentioned: /\bskip(?:ped)?\b/i.test(text),
    failureMarkers: [...new Set(text.match(/\b[A-Z][A-Z_]{5,}\b/g) || [])].filter(value => /ERROR|FAIL|BLOCK|MISSING|MISMATCH|UNCONFIRMED/.test(value))
  });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
}
evidence.finishedAt = new Date().toISOString();
evidence.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(status => [status, evidence.suites.filter(row => row.status === status).length]));
fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
process.exitCode = evidence.counts.FAIL || evidence.counts.BLOCKED ? 1 : 0;