// Reuse the forensic runner without overwriting the original script/evidence.
// All child execution retains its clean environment and external-network block.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const filename = path.join(__dirname, 'audit_ipaymu_sandbox.js');
let source = fs.readFileSync(filename, 'utf8');
for (const [before, after] of [
  ["'ipaymu-sandbox-forensic-audit.json'", "'ipaymu-p0-remediation.json'"],
  ["'test_ipaymu_compliance.js'", "'test_ipaymu_compliance.js', 'test_ipaymu_p0_remediation.js'"],
  ['for (const file of tracked) {', "if (!tracked.includes('test_ipaymu_p0_remediation.js')) tracked.push('test_ipaymu_p0_remediation.js'); for (const file of tracked) {"],
  ['if (require.main === module)', 'if (true)']
]) {
  if (!source.includes(before)) throw new Error('Forensic runner changed; review wrapper before execution');
  source = source.replace(before, after);
}
const runner = new Module(filename, module);
runner.filename = filename;
runner.paths = Module._nodeModulePaths(__dirname);
runner._compile(source, filename);