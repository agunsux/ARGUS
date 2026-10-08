const fs = require('fs');
const { spawnSync } = require('child_process');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const testCmd = pkg.scripts.test;
const commands = testCmd.split('&&').map(s => s.trim());

console.log('================================================================');
console.log(`RUNNING FULL REGRESSION SUITE: ${commands.length} TESTS`);
console.log('================================================================\n');

const suiteStart = Date.now();
let passed = 0;
let failed = 0;

for (let i = 0; i < commands.length; i++) {
  const cmdStr = commands[i];
  const parts = cmdStr.split(' ');
  const file = parts.slice(1).join(' ');
  const t0 = Date.now();
  
  process.stdout.write(`[${i + 1}/${commands.length}] Running: ${file} ... `);
  
  const res = spawnSync(parts[0], parts.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'],
    timeout: 30000,
    encoding: 'utf8'
  });
  
  const dur = Date.now() - t0;
  
  if (res.status === 0) {
    console.log(`PASS (${dur}ms)`);
    passed++;
  } else {
    console.log(`FAILED (code: ${res.status}, signal: ${res.signal}, ${dur}ms)`);
    if (res.stdout) console.log('--- STDOUT ---\n' + res.stdout.slice(-1500));
    if (res.stderr) console.log('--- STDERR ---\n' + res.stderr.slice(-1500));
    failed++;
    break;
  }
}

const totalDur = Date.now() - suiteStart;
console.log('\n================================================================');
console.log(`SUITE COMPLETE: ${passed}/${commands.length} PASSED | ${failed} FAILED | DURATION: ${totalDur}ms`);
console.log('================================================================');

process.exit(failed > 0 ? 1 : 0);
