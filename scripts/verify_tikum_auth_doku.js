// Runs local suites independently. No application/external credentials inherited.
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const suites = [
  'test_tikum_unified_auth_e2e.js', 'test_durable_user_auth.js', 'test_auth_security.js',
  'test_admin_identity_security.js', 'test_admin_identity_http.js', 'test_admin_identity_postgres.js',
  'test_admin_magic_link_e2e_verification.js', 'test_admin_auth_regression.js',
  'test_email_service.js', 'test_email_infrastructure.js', 'test_p0_magic_link_auth.js',
  'test_doku_verification_truthfulness.js', 'test_doku_sandbox_environment_isolation.js',
  'test_doku_signature_pure.js', 'test_doku_compliance.js', 'test_doku_direct_api_hold_release.js',
  'test_payment_provider_contracts.js', 'test_doku_sandbox_audit.js', 'test_doku_payment_migration.js',
  'test_multi_provider_resilience.js', 'test_doku_direct_api_sandbox_e2e.js',
  'test_canonical_fee_engine_v1.js', 'test_pricing_tax_ledger_engine.js',
  'test_tikum_prelaunch_listing_mode.js', 'test_syntax_check.js'
];
if (process.argv[2] === 'build') suites.splice(0, suites.length, 'test_syntax_check.js', 'scripts/check_homepage_surface.js', 'scripts/generate_sitemap.js');
const env = { ...process.env, NODE_ENV: 'test' };
for (const key of Object.keys(env)) {
  if (/DATABASE|DOKU|RESEND|VERCEL|SMTP|SENDGRID|PAYMENT|IPAYMU|MIDTRANS|RCB|XENDIT|APP_BASE_URL|MARKETPLACE_MODE/.test(key)) delete env[key];
}
const evidence = {
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
  cwd: root, timestamp: new Date().toISOString(), environment: 'local isolated credentials; memory/mock only', suites: []
};
for (const suite of suites.filter(name => !process.argv[2] || process.argv[2] === 'build' || name.includes(process.argv[2]))) {
  if (!fs.existsSync(path.join(root, suite))) {
    evidence.suites.push({ command: `node ${suite}`, status: 'NOT RUN', blocker: 'file absent' }); continue;
  }
  const run = spawnSync(process.execPath, [suite], { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  const lines = `${run.stdout || ''}\n${run.stderr || ''}`.split(/\r?\n/);
  const summary = lines.filter(line => /PASS|FAIL|SKIP|BLOCKED|passed|failed|skipped|tests |suites |AssertionError|Error:|Expected|actual|expected|✖|✔|ℹ/.test(line))
    .map(line => line.replace(/(?:ses-|adm-)[a-zA-Z0-9-]+/g, '[REDACTED_SESSION]').replace(/[a-f0-9]{64}/g, '[REDACTED_HASH_OR_TOKEN]'));
  const row = { command: `node ${suite}`, exitCode: run.status, status: run.status === 2 && lines.some(l => l.includes('BLOCKED')) ? 'BLOCKED' : run.status === 0 ? 'PASS' : 'FAIL',
    counts: 'See suite-native summary; not inferred from exit status', summary, timeout: run.error?.code === 'ETIMEDOUT' };
  evidence.suites.push(row);
  console.log(`${row.status} exit=${row.exitCode} ${suite}`);
}
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(root, `evidence/tikum-auth-doku-${process.argv[2] || 'local'}.json`), JSON.stringify(evidence, null, 2) + '\n');
process.exitCode = evidence.suites.some(row => row.status === 'FAIL') ? 1 : 0;