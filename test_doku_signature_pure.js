/**
 * TIKUM / ARGUS — Pure Deterministic DOKU Signature Unit Test Suite
 *
 * Validates the DOKU HMAC-SHA256 signature protocol against official developers.doku.com specs:
 * 1. Component order: Client-Id, Request-Id, Request-Timestamp, Request-Target, Digest (POST only)
 * 2. Exact separator: '\n' (ASCII 10), never '\r\n', no trailing newline
 * 3. Request-Target: path-only, no host, no query
 * 4. Digest: base64(SHA-256(rawBody bytes))
 * 5. Prefix: 'HMACSHA256='
 * 6. Encoding: Base64 (not hex)
 * 7. GET requests: Exactly 4 components (no Digest line, no Digest header)
 * 8. POST requests: Exactly 5 components + wire Digest header
 * 9. buildSignedRequest: Wire body equals digested body (zero re-serialization drift)
 * 10. Webhook verification: Timing-safe buffer comparison + 300s replay protection
 */

const assert = require('assert');
const crypto = require('crypto');
const { DokuPaymentProvider } = require('./src/services/payment/DokuPaymentProvider');

console.log('================================================================');
console.log('  TIKUM — DOKU PURE CRYPTOGRAPHIC SIGNATURE UNIT TESTS');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(title, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

const mockClientId = 'BRN-0292-TEST-CLIENT';
const mockSecretKey = 'SK-TEST-SECRET-KEY-1234567890';

const provider = new DokuPaymentProvider({
  clientId: mockClientId,
  secretKey: mockSecretKey,
  env: 'sandbox',
  apiBaseUrl: 'https://api-sandbox.doku.com'
});

// Test 1: Deterministic Digest Calculation
check('1. Digest is computed as standard base64(SHA-256(raw_bytes))', () => {
  const payloadStr = '{"order":{"invoice_number":"INV-1001","amount":150000}}';
  const expectedDigest = crypto.createHash('sha256').update(payloadStr, 'utf8').digest('base64');
  const actualDigest = provider.generateDigest(payloadStr);

  assert.strictEqual(actualDigest, expectedDigest);
  assert.strictEqual(typeof actualDigest, 'string');
  assert.strictEqual(Buffer.from(actualDigest, 'base64').length, 32); // SHA-256 is 32 bytes
});

// Test 2: Deterministic POST Signature Components & Formula
check('2. POST Signature has exactly 5 components separated by single \\n without \\r', () => {
  const requestId = 'REQ-POST-001';
  const requestTimestamp = '2026-10-09T08:00:00Z';
  const requestTarget = '/checkout/v1/payment';
  const bodyStr = '{"order":{"amount":50000}}';
  const digest = provider.generateDigest(bodyStr);

  const signedReq = provider.buildSignedRequest({
    method: 'POST',
    target: requestTarget,
    body: bodyStr,
    requestId,
    requestTimestamp
  });

  const lines = signedReq.componentString.split('\n');
  assert.strictEqual(lines.length, 5, 'Must contain exactly 5 lines');
  assert.strictEqual(lines[0], `Client-Id:${mockClientId}`);
  assert.strictEqual(lines[1], `Request-Id:${requestId}`);
  assert.strictEqual(lines[2], `Request-Timestamp:${requestTimestamp}`);
  assert.strictEqual(lines[3], `Request-Target:${requestTarget}`);
  assert.strictEqual(lines[4], `Digest:${digest}`);

  // No carriage return anywhere
  assert.strictEqual(signedReq.componentString.includes('\r'), false, 'Must not contain \\r');
  // No trailing newline
  assert.strictEqual(signedReq.componentString.endsWith('\n'), false, 'Must not have trailing \\n');

  // Prefix check
  assert.ok(signedReq.signature.startsWith('HMACSHA256='), 'Signature must start with HMACSHA256=');

  // Verify HMAC calculation independently
  const expectedHmac = crypto.createHmac('sha256', mockSecretKey)
    .update(signedReq.componentString)
    .digest('base64');
  assert.strictEqual(signedReq.signature, `HMACSHA256=${expectedHmac}`);
});

// Test 3: Deterministic GET Signature (no Digest)
check('3. GET Signature has exactly 4 components (no Digest line and no Digest header)', () => {
  const requestId = 'REQ-GET-002';
  const requestTimestamp = '2026-10-09T08:05:00Z';
  const requestTarget = '/orders/v1/status/INV-DOKU-999';

  const signedReq = provider.buildSignedRequest({
    method: 'GET',
    target: requestTarget,
    requestId,
    requestTimestamp
  });

  const lines = signedReq.componentString.split('\n');
  assert.strictEqual(lines.length, 4, 'GET signature must contain exactly 4 lines');
  assert.strictEqual(lines[0], `Client-Id:${mockClientId}`);
  assert.strictEqual(lines[1], `Request-Id:${requestId}`);
  assert.strictEqual(lines[2], `Request-Timestamp:${requestTimestamp}`);
  assert.strictEqual(lines[3], `Request-Target:${requestTarget}`);
  assert.strictEqual(lines.some(l => l.startsWith('Digest:')), false, 'GET must not have Digest component');

  // Headers check
  assert.strictEqual(signedReq.headers['Digest'], undefined, 'GET must not set Digest header');
  assert.strictEqual(signedReq.headers['Content-Type'], undefined, 'GET must not set Content-Type header');
  assert.strictEqual(signedReq.body, null, 'GET body must be null');
  assert.ok(signedReq.signature.startsWith('HMACSHA256='), 'GET signature must start with HMACSHA256=');
});

// Test 4: Wire Body Identity (Zero re-serialization drift)
check('4. buildSignedRequest wire body matches the exact byte sequence that was digested', () => {
  const complexPayload = {
    order: {
      invoice_number: 'INV-COMPLEX-123',
      amount: 250000,
      callback_url: 'https://tikum.app/callback'
    },
    customer: {
      name: 'Budi Santoso',
      email: 'budi@tikum.app'
    }
  };

  const signed = provider.buildSignedRequest({
    method: 'POST',
    target: '/checkout/v1/payment',
    body: complexPayload
  });

  // Verify that the body sent on the wire matches the digest in the signature components
  const wireDigest = crypto.createHash('sha256').update(signed.body, 'utf8').digest('base64');
  assert.strictEqual(signed.digest, wireDigest);
  assert.strictEqual(signed.headers['Digest'], wireDigest);
  assert.strictEqual(signed.headers['Content-Length'], Buffer.byteLength(signed.body, 'utf8'));
});

// Test 5: Clock / Timestamp Format Conformance
check('5. Request-Timestamp strictly conforms to ISO-8601 UTC format without milliseconds', () => {
  const signed = provider.buildSignedRequest({
    method: 'GET',
    target: '/orders/v1/status/INV-1'
  });

  const ts = signed.headers['Request-Timestamp'];
  // Format: YYYY-MM-DDTHH:mm:ssZ (length 20, ends with Z, no milliseconds dot)
  assert.strictEqual(ts.length, 20);
  assert.ok(ts.endsWith('Z'));
  assert.strictEqual(ts.includes('.'), false, 'Must not include milliseconds');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts), 'Must match ISO-8601 UTC regex');
});

// Test 6: Secret Key Isolation & Timing-Safe Webhook Verification
check('6. Webhook verification succeeds with genuine signature and fails with tampered components', () => {
  const webhookBody = JSON.stringify({
    order: { invoice_number: 'INV-DOKU-555', amount: 150000 },
    transaction: { status: 'SUCCESS', transaction_id: 'TRX-9988' }
  });
  const reqId = 'WH-REQ-001';
  const reqTime = new Date().toISOString().slice(0, 19) + 'Z';
  const reqTarget = '/api/v1/payments/webhook/doku';
  const digest = provider.generateDigest(webhookBody);

  const sigComponent = [
    `Client-Id:${mockClientId}`,
    `Request-Id:${reqId}`,
    `Request-Timestamp:${reqTime}`,
    `Request-Target:${reqTarget}`,
    `Digest:${digest}`
  ].join('\n');

  const validSig = 'HMACSHA256=' + crypto.createHmac('sha256', mockSecretKey)
    .update(sigComponent)
    .digest('base64');

  const validHeaders = {
    'Client-Id': mockClientId,
    'Request-Id': reqId,
    'Request-Timestamp': reqTime,
    'Request-Target': reqTarget,
    'Signature': validSig
  };

  // Valid webhook
  assert.strictEqual(provider.verifyWebhook(validHeaders, JSON.parse(webhookBody), Buffer.from(webhookBody)), true);

  // Tampered payload
  const tamperedBody = JSON.stringify({
    order: { invoice_number: 'INV-DOKU-555', amount: 1000 }, // tampered amount
    transaction: { status: 'SUCCESS', transaction_id: 'TRX-9988' }
  });
  assert.strictEqual(provider.verifyWebhook(validHeaders, JSON.parse(tamperedBody), Buffer.from(tamperedBody)), false);

  // Tampered signature key
  const invalidKeySig = 'HMACSHA256=' + crypto.createHmac('sha256', 'WRONG-KEY')
    .update(sigComponent)
    .digest('base64');
  assert.strictEqual(provider.verifyWebhook({ ...validHeaders, Signature: invalidKeySig }, JSON.parse(webhookBody)), false);

  // Expired timestamp (>300s)
  const expiredTime = new Date(Date.now() - 301 * 1000).toISOString().slice(0, 19) + 'Z';
  assert.strictEqual(provider.verifyWebhook({ ...validHeaders, 'Request-Timestamp': expiredTime }, JSON.parse(webhookBody)), false);
});

console.log(`\n================================================================`);
console.log(`  ALL ${passed}/${total} PURE DOKU SIGNATURE TESTS PASSED!`);
console.log(`================================================================\n`);
