const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = { NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true',
  NODE_OPTIONS: `--require="${path.join(__dirname, 'offline-test-guard.cjs').replace(/\\/g, '/')}"` };
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
const suites = process.argv.includes('--reproduce') ? ['test_sandbox_deployed_safety.js'] : [
  'test_sandbox_deployed_safety.js', 'test_doku_refund_fail_closed.js', 'test_doku_confirmation_boundary.js',
  'test_doku_signature_pure.js', 'test_doku_sandbox_environment_isolation.js', 'test_doku_verification_truthfulness.js',
  'test_doku_direct_api_sandbox_e2e.js', 'test_refund_state_machine_and_provider_confirmation.js',
  'test_inventory_concurrency_race.js', 'test_admin_identity_http.js', 'test_admin_identity_security.js',
  'test_admin_identity_postgres.js', 'test_tikum_prelaunch_listing_mode.js', 'test_syntax_check.js'
];
const evidence = { startedAt: new Date().toISOString(), sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Local isolated contracts, not real gateway or database acceptance', suites: [] };
for (const file of suites) {
  const run = spawnSync(process.execPath, [file], { cwd: root, env, encoding: 'utf8', timeout: 90000 });
  const text = `${run.stdout || ''}\n${run.stderr || ''}`;
  const summary = text.split(/\r?\n/).filter(l => /PASS|FAIL|BLOCKED|passed|failed|skipped|tests|flag=|!==|actual|expected/.test(l))
    .map(l => l.replace(/[a-f0-9]{64}/gi, '[REDACTED_HASH]').replace(/(?:ses-|adm-)[\w-]+/g, '[REDACTED_SESSION]'));
  evidence.suites.push({ file, exitCode: run.status, error: run.error?.code || null,
    status: run.error ? 'BLOCKED' : run.status === 2 ? 'BLOCKED' : run.status === 0 ? 'PASS' : 'FAIL', summary });
}
evidence.finishedAt = new Date().toISOString();
evidence.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(s => [s, evidence.suites.filter(r => r.status === s).length]));
fs.writeFileSync(path.join(root, `evidence/sandbox-safety-${process.argv.includes('--reproduce') ? 'reproduction' : 'tests'}.json`), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exitCode = evidence.counts.FAIL || evidence.counts.BLOCKED ? 1 : 0;