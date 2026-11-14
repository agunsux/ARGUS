const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, { NODE_ENV: 'test', ARGUS_SKIP_MIGRATIONS: 'true', ARGUS_DB_READ_ONLY: 'true' });
env.NODE_OPTIONS = `--require="${path.join(__dirname, 'offline-test-guard.cjs').replace(/\\/g, '/')}"`;
const saved = ['public/sitemap.xml', 'RELEASE_CANDIDATE.md', 'BENCHMARK_RESULTS.md', 'PERFORMANCE_REPORT.md'].map(file => ({ file, content: fs.readFileSync(path.join(root, file)) }));
const result = { startedAt: new Date().toISOString(), isolation: 'offline, credential-free', checks: [] };
try {
  for (const file of ['test_syntax_check.js', 'scripts/check_homepage_surface.js', 'scripts/generate_sitemap.js', 'release_verify.js']) {
    const run = spawnSync(process.execPath, [file], { cwd: root, env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    const text = (run.stdout || '') + '\n' + (run.stderr || '');
    result.checks.push({ file, exitCode: run.status, error: run.error?.code || null,
      summary: text.split(/\r?\n/).filter(line => /All \d+ src|syntax validation|suite.*PASSED|suite.*FAILED|test_\w+\.js (PASSED|FAILED)|AUDIT FAILED|ALL AUDITS PASSED|Generated public|Homepage|homepage/.test(line)).map(line => line.slice(0, 300)) });
  }
} finally {
  for (const entry of saved) fs.writeFileSync(path.join(root, entry.file), entry.content);
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, process.argv.includes('--blocker') ? 'evidence/blocker-release-checks.json' : 'evidence/final-release-checks.json'), JSON.stringify(result, null, 2) + '\n');
}
process.exitCode = result.checks.some(check => check.exitCode !== 0 || check.error) ? 1 : 0;