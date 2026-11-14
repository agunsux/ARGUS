// Preserve prior evidence; run configured suites independently without live credentials.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const previous = require('../evidence/final-payment-regression.json');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true',
  NODE_OPTIONS: `--require="${path.join(__dirname, 'offline-test-guard.cjs').replace(/\\/g, '/')}"` });
const sanitize = text => text
  .replace(/(?:postgres(?:ql)?:\/\/)[^\s'"<>]+/gi, '[REDACTED_DATABASE_URL]')
  .replace(/((?:authorization|secret|password|token|signature|api[_-]?key)\s*[=:]\s*)[^\s,}\]]+/gi, '$1[REDACTED]')
  .replace(/(?:ses-|adm-)[a-zA-Z0-9-]+/g, '[REDACTED_SESSION]')
  .replace(/[a-f0-9]{64}/gi, '[REDACTED_HASH]');
const evidence = { startedAt: new Date().toISOString(),
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  isolation: 'credential-free; external network blocked; local fixtures are not integration acceptance', suites: [] };
const focused = process.argv.slice(2);
for (const file of focused) {
  if (!/^(?:test_[\w.-]+\.js|scripts\/[\w.-]+\.js)$/.test(file)) throw new Error('Unsupported suite path');
  if (!previous.suites.some(suite => suite.file === file)) previous.suites.push({ file, status: 'NOT RUN' });
}
const output = path.join(root, 'evidence', focused.length ? 'blocker-focused.json' : 'blocker-regression.json');
const saved = ['public/sitemap.xml', 'RELEASE_CANDIDATE.md', 'BENCHMARK_RESULTS.md', 'PERFORMANCE_REPORT.md']
  .filter(file => fs.existsSync(path.join(root, file))).map(file => ({ file, bytes: fs.readFileSync(path.join(root, file)) }));
try {
  for (const prior of previous.suites) {
    if (focused.length && !focused.includes(prior.file)) continue;
    const run = spawnSync(process.execPath, [prior.file], { cwd: root, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
    const text = sanitize(`${run.stdout || ''}\n${run.stderr || ''}`);
    const status = run.error ? 'BLOCKED' : run.status === 2 && /BLOCKED/.test(text) ? 'BLOCKED' : run.status === 0 ? 'PASS' : 'FAIL';
    evidence.suites.push({ file: prior.file, command: `node ${prior.file}`, previousStatus: prior.status,
      status, exitCode: run.status, error: run.error?.code || null,
      assertionCounts: null, counting: 'Native summaries retained; no inferred assertion counts', output: text });
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`${status} ${prior.file}`);
  }
} finally {
  for (const entry of saved) fs.writeFileSync(path.join(root, entry.file), entry.bytes);
  evidence.finishedAt = new Date().toISOString();
  evidence.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(status => [status, evidence.suites.filter(row => row.status === status).length]));
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
}
process.exitCode = evidence.counts.FAIL || evidence.counts.BLOCKED ? 1 : 0;