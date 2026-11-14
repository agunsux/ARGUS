const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const location = fs.readFileSync(path.join(process.env.TEMP, 'tikum-comparison-location.txt'), 'utf8').trim();
const checkpoint = JSON.parse(fs.readFileSync(path.join(root, 'evidence/tikum-auth-doku-local.json')));
const env = { ...process.env, NODE_ENV: 'test' };
for (const key of Object.keys(env)) if (/DATABASE|DOKU|RESEND|VERCEL|SMTP|SENDGRID|PAYMENT|IPAYMU|MIDTRANS|RCB|XENDIT|APP_BASE_URL|MARKETPLACE_MODE/.test(key)) delete env[key];
const results = [];
for (const side of ['baseline', 'candidate']) {
  for (const item of checkpoint.suites.filter(s => ['FAIL', 'BLOCKED'].includes(s.status))) {
    const file = item.command.replace(/^node /, '');
    const cwd = path.join(location, side);
    const run = spawnSync(process.execPath, [file], { cwd, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
    const output = `${run.stdout || ''}\n${run.stderr || ''}`.replace(/(?:ses-|adm-)[a-zA-Z0-9-]+/g, '[REDACTED_SESSION]').replace(/[a-f0-9]{64}/g, '[REDACTED_HASH_OR_TOKEN]');
    fs.writeFileSync(path.join(location, `${side}-${file}.log`), output);
    results.push({ side, source: side === 'baseline' ? '84477c4' : '0621075', command: item.command, exitCode: run.status, timeout: run.error?.code === 'ETIMEDOUT', output });
    fs.writeFileSync(path.join(root, 'evidence/tikum-checkpoint-comparison.json'), JSON.stringify({ node: process.version, location, dependencyMode: 'same node_modules junction; identical lockfiles', results }, null, 2));
    console.log(`${side} ${file} exit=${run.status}`);
  }
}