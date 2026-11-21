/** Offline forensic audit. Never loads .env or contacts a payment gateway.
 * Runs existing tests/build in a disposable tracked-source copy, not the working tree.
 * Nonzero exit means a security expectation or a selected regression failed.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

function blockExternalNetwork() {
  const net = require('net');
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof options === 'object' ? options.host :
      (typeof args[1] === 'string' ? args[1] : 'localhost');
    if ((typeof options === 'object' && options.path) ||
        !['localhost', '127.0.0.1', '::1'].includes(host || 'localhost')) {
      throw new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED');
    }
    return original.apply(this, args);
  };
  const originalFetch = global.fetch;
  global.fetch = function (input, ...args) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return Promise.reject(new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED'));
    }
    return originalFetch(input, ...args);
  };
}

if (process.env.IPAYMU_OFFLINE_AUDIT === 'true') blockExternalNetwork();

async function probe(root) {
  const assert = require('assert');
  const crypto = require('crypto');
  const { IPaymuProvider } = require(path.join(root, 'src/services/payment/IPaymuProvider'));
  const { PaymentService } = require(path.join(root, 'src/services/payment/PaymentService'));
  const { paymentManager } = require(path.join(root, 'src/services/payment'));
  const { state } = require(path.join(root, 'src/database'));
  const results = [];
  const check = async (id, name, fn) => {
    try {
      await fn();
      results.push({ id, name, result: 'PASS', evidence: 'Expectation satisfied in offline fixture' });
    } catch (error) {
      // Do not serialize assertion operands, requests, headers, credentials or signatures.
      results.push({ id, name, result: 'FAIL', evidence: error.name === 'AssertionError' ?
        'Security expectation not satisfied by current implementation' : 'Unexpected fixture error',
      errorType: error.name });
    }
  };
  const make = (overrides = {}) => new IPaymuProvider({
    apiKey: 'offline-fixture-not-a-credential', virtualAccount: 'offline-fixture-va',
    mode: 'sandbox', allowSimulation: false, ...overrides
  });
  await check('G01', 'Preview environment variables select Sandbox independently of NODE_ENV', () => {
    const before = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'preview';
      process.env.IPAYMU_ENV = 'sandbox';
      process.env.IPAYMU_BASE_URL = 'https://sandbox.ipaymu.com/api/v2';
      const provider = new IPaymuProvider();
      assert.strictEqual(provider.mode, 'sandbox');
      assert.strictEqual(provider.apiBaseUrl, process.env.IPAYMU_BASE_URL);
    } finally { process.env = before; }
  });
  for (const [id, mode, url] of [
    ['G02', 'sandbox', 'https://my.ipaymu.com/api/v2'],
    ['G03', 'production', 'https://sandbox.ipaymu.com/api/v2'],
    ['G04', 'ambiguous', 'https://sandbox.ipaymu.com/api/v2']
  ]) {
    await check(id, 'Reject invalid environment pairing: ' + mode, () => {
      assert.throws(() => make({ mode, apiBaseUrl: url }).buildSignedRequest({ endpoint: '/payment' }));
    });
  }
  await check('G05', 'Missing API key and VA block real payment initiation', async () => {
    const provider = new IPaymuProvider({ mode: 'sandbox', allowSimulation: false });
    provider._httpRequest = async () => { throw new Error('Unexpected transport'); };
    await assert.rejects(provider.createPayment({ orderId: 'AUDIT-MISSING', amount: 10000 }));
  });
  await check('S01', 'Documented normalized callback signature is accepted', () => {
    const provider = make();
    const body = { status: 'berhasil', trx_id: '42', status_code: '1', amount: '10000', reference_id: 'AUDIT' };
    const normalized = { additional_info: [], amount: '10000', reference_id: 'AUDIT', status: 'berhasil', status_code: 1, trx_id: 42 };
    const signature = crypto.createHmac('sha256', provider.virtualAccount).update(JSON.stringify(normalized)).digest('hex');
    assert.strictEqual(provider.verifyWebhook({ 'x-signature': signature }, body, JSON.stringify(body)), true);
  });
  await check('S02', 'Undocumented API-key callback signature fallback is rejected', () => {
    const provider = make();
    const body = { reference_id: 'AUDIT', status: 'berhasil', amount: '10000' };
    const raw = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', provider.apiKey).update(raw).digest('hex');
    assert.strictEqual(provider.verifyWebhook({ 'x-signature': signature }, body, raw), false);
  });
  await check('S03', 'Invalid callback signature is rejected', () => {
    assert.strictEqual(make().verifyWebhook({ 'x-signature': 'invalid' }, {}), false);
  });
  await check('P01', 'HTTP 200 malformed JSON fails closed', async () => {
    const provider = make();
    provider._httpRequest = async () => ({ statusCode: 200, json: null, body: 'invalid' });
    await assert.rejects(provider.createPayment({ orderId: 'AUDIT-MALFORMED', amount: 10000, channel: 'IPAYMU_REDIRECT' }));
  });
  await check('P02', 'Provider status failure cannot become simulated evidence', async () => {
    const provider = make();
    provider._httpRequest = async () => { throw new Error('Fixture timeout'); };
    await assert.rejects(provider.getPaymentStatus({ orderId: 'AUDIT-TIMEOUT', providerRef: '42' }));
  });
  await check('W01', 'Pending callback does not suppress later success for same transaction', async () => {
    const provider = make();
    // Stub authentication only to isolate orchestration from signature defects.
    provider.verifyWebhook = () => true;
    provider.getPaymentStatus = async () => ({ status: 'PAID', amount: 10000, simulated: false });
    paymentManager.registerProvider(provider);
    state.provider_webhooks = [];
    state.processed_webhooks = new Set();
    const body = { reference_id: 'AUDIT-PENDING', trx_id: 'AUDIT-PENDING-TX', amount: '10000', status: 'pending' };
    await PaymentService.handleWebhook({ providerName: 'ipaymu', body });
    const result = await PaymentService.handleWebhook({ providerName: 'ipaymu', body: { ...body, status: 'berhasil' } });
    assert.notStrictEqual(result.idempotent, true);
  });
  await check('W02', 'Amount mismatch cannot mark canonical payment paid', async () => {
    const provider = make();
    provider.verifyWebhook = () => true;
    provider.getPaymentStatus = async () => ({ status: 'PAID', amount: 1, simulated: false });
    paymentManager.registerProvider(provider);
    state.orders.push({ id: 'AUDIT-AMOUNT', buyer_total: 10000, currency: 'IDR', status: 'PENDING' });
    const payment = { id: 'AUDIT-PAY', order_id: 'AUDIT-AMOUNT', provider: 'ipaymu', provider_reference: 'AUDIT-AMOUNT-TX', status: 'PAYMENT_PENDING' };
    state.canonical_payments.push(payment);
    await assert.rejects(PaymentService.handleWebhook({ providerName: 'ipaymu', body: {
      reference_id: 'AUDIT-AMOUNT', trx_id: 'AUDIT-AMOUNT-TX', amount: '1', status: 'berhasil'
    } }), error => error.code === 'AMOUNT_MISMATCH');
    assert.strictEqual(payment.status, 'PAYMENT_PENDING');
  });
  await check('R01', 'Reconciliation consults provider rather than declaring local-only match', async () => {
    let inquiries = 0;
    const provider = make();
    provider.getPaymentStatus = async () => { inquiries++; return { status: 'FAILED', simulated: false }; };
    paymentManager.registerProvider(provider);
    state.orders = [{ id: 'AUDIT-REC', buyer_total: 10000 }];
    state.canonical_payments = [{ id: 'AUDIT-REC-PAY', order_id: 'AUDIT-REC', provider: 'ipaymu', gross_amount: 10000, money_state: 'PAID', provider_transaction_id: 'AUDIT-REC-TX' }];
    const result = await PaymentService.reconcileTransactions({ providerName: 'ipaymu' });
    assert.ok(inquiries > 0);
    assert.notStrictEqual(result.records[0].status, 'MATCHED');
  });
  console.log('AUDIT_PROBES_JSON=' + JSON.stringify(results));
  process.exitCode = results.some(item => item.result === 'FAIL') ? 1 : 0;
}

function run() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tikum-ipaymu-audit-'));
  const copy = path.join(temp, 'repository');
  fs.mkdirSync(copy);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of tracked) {
    if (/(^|\/)\.env(?:\.|$)/.test(file)) continue;
    const target = path.join(copy, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const clean = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) {
    if (process.env[key]) clean[key] = process.env[key];
  }
  Object.assign(clean, {
    NODE_ENV: 'test', NODE_PATH: path.join(root, 'node_modules'),
    IPAYMU_OFFLINE_AUDIT: 'true', ENABLE_IPAYMU_PRODUCTION: 'false',
    MARKETPLACE_MODE: 'PRELAUNCH_LISTING_ONLY', EMAIL_SEND_ENABLED: 'false'
  });
  const tests = [
    'test_ipaymu_argus_lifecycle.js', 'test_ipaymu_final_integration_alignment.js',
    'test_ipaymu_production_readiness_audit.js', 'test_payment_provider_contracts.js',
    'test_pricing_tax_ledger_engine.js', 'test_refund_state_machine_and_provider_confirmation.js',
    'test_ipaymu_compliance.js'
  ];
  const commands = tests.map(file => ({ name: file, args: [path.join(copy, file)] }));
  commands.push({ name: 'security-expectations', args: [__filename, '--probe', copy] });
  commands.push({ name: 'build:syntax', args: [path.join(copy, 'test_syntax_check.js')] });
  commands.push({ name: 'build:homepage', args: [path.join(copy, 'scripts/check_homepage_surface.js')] });
  commands.push({ name: 'build:sitemap', args: [path.join(copy, 'scripts/generate_sitemap.js')] });
  const results = [];
  for (const [index, command] of commands.entries()) {
    const args = command.name === 'security-expectations' ? command.args : ['--require', __filename, ...command.args];
    const result = spawnSync(process.execPath, args, {
      cwd: copy, env: { ...clean, ARGUS_DATA_DIR: path.join(temp, 'data-' + index) },
      encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024
    });
    const output = (result.stdout || '') + (result.stderr || '');
    // Fixtures only, but omit payloads and verbose logs from persisted evidence.
    const summary = output.split(/\r?\n/).filter(line =>
      /\[PASS\]|\[FAIL\]|AssertionError|passed|failed|Syntax|Generated public|PASS:|FAIL:|AUDIT_EXTERNAL_NETWORK_BLOCKED/i.test(line)
      && !/signature.*:|api.?key|virtual.?account.*:|buyer_email|buyer_phone/i.test(line));
    const marker = output.split(/\r?\n/).find(line => line.startsWith('AUDIT_PROBES_JSON='));
    const entry = { name: command.name, exitCode: result.status, signal: result.signal,
      result: result.status === 0 && (command.name !== 'security-expectations' || marker) ? 'PASS' : 'FAIL', summary,
      error: result.error ? result.error.code : null };
    if (marker) entry.probes = JSON.parse(marker.slice('AUDIT_PROBES_JSON='.length));
    results.push(entry);
    console.log(command.name + ': ' + entry.result + ' (exit ' + result.status + ')');
  }
  const report = { executedAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    classification: 'OFFLINE_FIXTURES_ONLY_NOT_SANDBOX',
    isolation: { copiedTrackedSources: true, envFilesExcluded: true, externalNetworkBlocked: true,
      paymentCredentialsLoaded: false, databaseCredentialsLoaded: false, dataDirectory: temp },
    buildNote: 'Executed all three package build steps separately in isolated copy under NODE_ENV=test; not a Preview deployment or production-runtime certification.',
    results };
  const output = path.join(root, 'evidence', 'ipaymu-sandbox-forensic-audit.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Evidence: ' + output);
  process.exitCode = results.some(item => item.result !== 'PASS') ? 1 : 0;
}

if (require.main === module) {
  if (process.argv[2] === '--probe') probe(process.argv[3]).catch(() => { console.error('AUDIT_PROBE_FAILURE'); process.exitCode = 1; });
  else run();
}