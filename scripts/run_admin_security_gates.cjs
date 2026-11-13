// Run every existing package test independently, retaining failures rather than short-circuiting.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const workspace = path.resolve(__dirname, '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : workspace;
if (root !== workspace && !root.startsWith(path.join(workspace, 'scratch') + path.sep)) throw Error('Target must be isolated inside scratch');
const out = path.join(workspace, 'scratch', root === workspace ? 'admin-security-gates' : 'admin-security-baseline-gates');
fs.mkdirSync(out, { recursive: true });
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC', 'NODE_PATH']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true',
  ENABLE_DOKU_PRODUCTION: 'false', ENABLE_IPAYMU_PRODUCTION: 'false',
  ENABLE_MIDTRANS_PRODUCTION: 'false', ENABLE_XENDIT_PRODUCTION: 'false' });
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const names = [...new Set([
  ...pkg.scripts.test.split(' && ').map(command => command.replace(/^node /, '')),
  ...(root === workspace ? ['test_admin_identity_security.js', 'test_admin_identity_http.js'] : []), 'test_automation_db_persistence.js',
  'test_admin_real_world_qa.js', 'test_mvp_admin_automation_bootstrap.js',
  'test_durable_user_auth.js', 'test_auth_security.js'
])];
const results = [];
for (const file of names) {
  if (!fs.existsSync(path.join(root, file))) throw Error(`Missing required test: ${file}`);
  const r = spawnSync(process.execPath, ['--require', path.join(__dirname, 'offline-test-guard.cjs'), file],
    { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 12 * 1024 * 1024 });
  const text = (r.stdout || '') + '\n--- STDERR ---\n' + (r.stderr || '');
  fs.writeFileSync(path.join(out, file.replace(/[\\/]/g, '_') + '.log'), text);
  results.push({ file, exit: r.status, error: r.error?.code || null,
    status: r.error ? 'BLOCKED' : r.status === 0 ? 'PASS' : 'FAIL' });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`${file}: ${results.at(-1).status}`);
}
fs.writeFileSync(path.join(out, 'complete.json'), JSON.stringify({ total: results.length,
  pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status !== 'PASS').length }));
process.exitCode = results.some(r => r.status !== 'PASS') ? 1 : 0;