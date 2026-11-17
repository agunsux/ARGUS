const https = require('https');
const fs = require('fs');

// Load environment variables safely
function loadEnv() {
  const env = {};
  for (const file of ['.env.local', '.env.preview']) {
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          if (!env[key]) env[key] = val;
        }
      }
    }
  }
  return env;
}

const env = loadEnv();
const PREVIEW_HOST = 'argus-f33bjcgde-shinerva.vercel.app';
const PROD_HOST = 'tikum.app';
const BYPASS_SECRET = 'xIPBjrn6NgFlCegXY7LFgOfDjlFIi9rz';
const ADMIN_API_KEY = env.ADMIN_API_KEY;

function request(hostname, path, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Host': hostname,
      'User-Agent': 'Tikum-P1-2-Verifier/1.0',
      'x-vercel-protection-bypass': BYPASS_SECRET,
      ...headers
    };

    let bodyData = null;
    if (body) {
      bodyData = typeof body === 'string' ? body : JSON.stringify(body);
      defaultHeaders['Content-Type'] = 'application/json';
      defaultHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = https.request({
      hostname,
      port: 443,
      path,
      method,
      headers: defaultHeaders,
      timeout: 30000
    }, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout on ${hostname}${path}`));
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('EPIC P1.2 PREVIEW & PRODUCTION VERIFICATION');
  console.log(`Preview Host: ${PREVIEW_HOST}`);
  console.log(`Production Host: ${PROD_HOST}`);
  console.log('====================================================\n');

  const results = [];

  // Probe 1: Preview Diagnostic
  try {
    const diag = await request(PREVIEW_HOST, '/api/v1/payments/diagnostic', 'GET');
    console.log('[PROBE 1] Preview Payment Diagnostic:');
    console.log(`Status Code: ${diag.statusCode}`);
    console.log('Diagnostic Summary:', {
      success: diag.data?.success,
      selectedProvider: diag.data?.diagnostic?.selected_provider,
      paymentEnv: diag.data?.diagnostic?.payment_environment,
      deploymentEnv: diag.data?.diagnostic?.deployment_environment,
      productionGated: diag.data?.diagnostic?.production_payment_lock?.production_gated,
      merchantEntity: diag.data?.diagnostic?.merchant_entity
    });
    const pass = diag.statusCode === 200 &&
                 diag.data?.diagnostic?.selected_provider === 'doku' &&
                 diag.data?.diagnostic?.payment_environment === 'sandbox' &&
                 diag.data?.diagnostic?.production_payment_lock?.production_gated === true;
    results.push({ probe: 'Preview Diagnostic (DOKU Sandbox, Production Gated)', pass, detail: diag.data?.diagnostic });
  } catch (err) {
    console.error('[PROBE 1] Failed:', err.message);
    results.push({ probe: 'Preview Diagnostic', pass: false, error: err.message });
  }

  // Probe 2: Public Anonymous Access to /api/v1/payments/sandbox/execute-live-cycle
  try {
    const anon = await request(PREVIEW_HOST, '/api/v1/payments/sandbox/execute-live-cycle', 'POST', {}, { amount: 50000 });
    console.log('\n[PROBE 2] Anonymous Live Cycle Access:');
    console.log(`Status Code: ${anon.statusCode}`);
    console.log('Response:', anon.data);
    const pass = anon.statusCode === 401 && anon.data?.code === 'ADMIN_AUTH_REQUIRED';
    results.push({ probe: 'Anonymous Live Cycle Blocked (401 ADMIN_AUTH_REQUIRED)', pass, detail: anon.data });
  } catch (err) {
    console.error('[PROBE 2] Failed:', err.message);
    results.push({ probe: 'Anonymous Live Cycle Blocked', pass: false, error: err.message });
  }

  // Probe 3: Invalid Admin Key Access
  try {
    const badKey = await request(PREVIEW_HOST, '/api/v1/payments/sandbox/execute-live-cycle', 'POST', {
      'x-admin-key': 'invalid-secret-key-12345'
    }, { amount: 50000 });
    console.log('\n[PROBE 3] Invalid Admin Key Access:');
    console.log(`Status Code: ${badKey.statusCode}`);
    console.log('Response:', badKey.data);
    const pass = badKey.statusCode === 401 && badKey.data?.code === 'ADMIN_AUTH_REQUIRED';
    results.push({ probe: 'Invalid Admin Key Blocked (401 ADMIN_AUTH_REQUIRED)', pass, detail: badKey.data });
  } catch (err) {
    console.error('[PROBE 3] Failed:', err.message);
    results.push({ probe: 'Invalid Admin Key Blocked', pass: false, error: err.message });
  }

  // Probe 4: Input Validation (Invalid Amount: 500 IDR)
  try {
    const badAmount = await request(PREVIEW_HOST, '/api/v1/payments/sandbox/execute-live-cycle', 'POST', {
      'x-admin-key': ADMIN_API_KEY
    }, { amount: 500 });
    console.log('\n[PROBE 4] Invalid Amount Validation (500 IDR):');
    console.log(`Status Code: ${badAmount.statusCode}`);
    console.log('Response:', badAmount.data);
    const pass = badAmount.statusCode === 400 && badAmount.data?.code === 'INVALID_AMOUNT';
    results.push({ probe: 'Invalid Amount Validation (400 INVALID_AMOUNT)', pass, detail: badAmount.data });
  } catch (err) {
    console.error('[PROBE 4] Failed:', err.message);
    results.push({ probe: 'Invalid Amount Validation', pass: false, error: err.message });
  }

  // Probe 5: Valid Admin Key -> Full Live Cycle Execution on Preview
  try {
    console.log('\n[PROBE 5] Executing Live Cycle with Valid Admin Key on Preview:');
    const liveCycle = await request(PREVIEW_HOST, '/api/v1/payments/sandbox/execute-live-cycle', 'POST', {
      'x-admin-key': ADMIN_API_KEY
    }, { amount: 50000 });
    console.log(`Status Code: ${liveCycle.statusCode}`);
    const trace = liveCycle.data?.trace;
    const vaCreation = trace?.steps?.realVaCreation;
    const statusInquiry = trace?.steps?.realStatusInquiry;
    const invariants = trace?.invariants;

    console.log('Live Cycle Summary:');
    console.log({
      success: liveCycle.data?.success,
      vaStatus: vaCreation?.statusCode,
      vaNumber: vaCreation?.vaDetails?.virtual_account_number,
      invoiceNumber: vaCreation?.invoiceNumber,
      statusInquiryCode: statusInquiry?.statusCode,
      statusInquiryTarget: statusInquiry?.target,
      transactionStatus: statusInquiry?.response?.transaction?.status,
      invariantsPassed: invariants?.reconciliationZeroVariance && invariants?.serverToServerInquiryGuardsAgainstFraudulentSuccess
    });

    const pass = liveCycle.statusCode === 200 &&
                 liveCycle.data?.success === true &&
                 vaCreation?.statusCode === 200 &&
                 !!vaCreation?.vaDetails?.virtual_account_number &&
                 statusInquiry?.statusCode === 200 &&
                 statusInquiry?.response?.transaction?.status === 'PENDING' &&
                 invariants?.reconciliationZeroVariance === true;
    results.push({
      probe: 'Live Cycle Execution (HTTP 200 VA + HTTP 200 Status Inquiry + Invariants)',
      pass,
      detail: {
        invoiceNumber: vaCreation?.invoiceNumber,
        vaNumber: vaCreation?.vaDetails?.virtual_account_number,
        inquiryStatus: statusInquiry?.response?.transaction?.status
      }
    });
  } catch (err) {
    console.error('[PROBE 5] Failed:', err.message);
    results.push({ probe: 'Live Cycle Execution', pass: false, error: err.message });
  }

  // Probe 6: Dead Midtrans Live Cycle Endpoint
  try {
    const midtransDead = await request(PREVIEW_HOST, '/api/v1/payments/sandbox/midtrans/execute-live-cycle', 'POST', {}, {});
    console.log('\n[PROBE 6] Midtrans Removed Endpoint Check:');
    console.log(`Status Code: ${midtransDead.statusCode}`);
    console.log('Response:', midtransDead.data);
    const pass = midtransDead.statusCode === 410 && midtransDead.data?.code === 'PROVIDER_REMOVED';
    results.push({ probe: 'Midtrans Endpoint Removed (HTTP 410 PROVIDER_REMOVED)', pass, detail: midtransDead.data });
  } catch (err) {
    console.error('[PROBE 6] Failed:', err.message);
    results.push({ probe: 'Midtrans Endpoint Removed', pass: false, error: err.message });
  }

  // Probe 7: Production Freeze Gate (Diagnostic check on tikum.app)
  try {
    const prodDiag = await request(PROD_HOST, '/api/v1/payments/diagnostic', 'GET');
    console.log('\n[PROBE 7] Production Environment Diagnostic:');
    console.log(`Status Code: ${prodDiag.statusCode}`);
    console.log('Production Diagnostic:', {
      success: prodDiag.data?.success,
      selectedProvider: prodDiag.data?.diagnostic?.selected_provider,
      paymentEnv: prodDiag.data?.diagnostic?.payment_environment,
      deploymentEnv: prodDiag.data?.diagnostic?.deployment_environment,
      productionGated: prodDiag.data?.diagnostic?.production_payment_lock?.production_gated,
      marketplaceMode: prodDiag.data?.diagnostic?.production_payment_lock?.marketplace_mode
    });

    const pass = prodDiag.statusCode === 200 &&
                 prodDiag.data?.diagnostic?.production_payment_lock?.production_gated === true &&
                 prodDiag.data?.diagnostic?.production_payment_lock?.marketplace_mode === 'PRELAUNCH_LISTING_ONLY';
    results.push({ probe: 'Production Environment Frozen & Gated', pass, detail: prodDiag.data?.diagnostic });
  } catch (err) {
    console.error('[PROBE 7] Failed:', err.message);
    results.push({ probe: 'Production Environment Frozen & Gated', pass: false, error: err.message });
  }

  // Probe 8: Event Visual and Lifecycle Baseline Check on Production
  try {
    const prodEvents = await request(PROD_HOST, '/api/events', 'GET');
    console.log('\n[PROBE 8] Production Event Catalog Check:');
    console.log(`Status Code: ${prodEvents.statusCode}`);
    const events = Array.isArray(prodEvents.data) ? prodEvents.data : (prodEvents.data?.events || []);
    console.log(`Events Count: ${events.length}`);
    const mcr = events.find(e => (e.name || '').includes('Chemical') || (e.slug || '').includes('my-chemical-romance'));
    console.log('MCR Event Present:', !!mcr, mcr ? { name: mcr.name, hasImage: !!(mcr.imageUrl || mcr.image_url) } : 'none');
    const pass = prodEvents.statusCode === 200 && events.length > 0 && !!mcr;
    results.push({ probe: 'Production Event Baseline Intact (P1.1 Protected)', pass, detail: { totalEvents: events.length, mcrFound: !!mcr } });
  } catch (err) {
    console.error('[PROBE 8] Failed:', err.message);
    results.push({ probe: 'Production Event Baseline Intact', pass: false, error: err.message });
  }

  console.log('\n====================================================');
  console.log('FINAL VERIFICATION SUMMARY');
  console.log('====================================================');
  let allPass = true;
  for (const r of results) {
    console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}: ${r.probe}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\nOVERALL RESULT: ${allPass ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
  process.exit(allPass ? 0 : 1);
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
