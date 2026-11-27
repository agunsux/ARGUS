'use strict';

const assert = require('node:assert/strict');
const { createHash, createHmac, randomUUID } = require('node:crypto');
const { DokuPaymentProvider } = require('../src/services/payment/DokuPaymentProvider');
const { FEE_POLICY_V2, calculateDualTierFees } = require('../src/pricing/DualTierFeePolicy');
const { isPrelaunchListingMode } = require('../src/config/marketplaceMode');

const SANDBOX = 'https://api-sandbox.doku.com';
const PRODUCTION = 'https://api.doku.com';
const CHECKOUT = '/checkout/v1/payment';
const present = value => Boolean(value?.trim());

function configIssues(env) {
  const issues = [];
  const mode = env.DOKU_ENV ?? 'sandbox';
  const base = env.DOKU_BASE_URL ?? SANDBOX;
  const production = mode === 'production';
  if (!['sandbox', 'production'].includes(mode) || base !== (production ? PRODUCTION : SANDBOX)) issues.push('DOKU_ENV_BASE_MISMATCH');
  for (const name of ['DOKU_SANDBOX_BASE_URL', 'DOKU_API_BASE_URL']) {
    if (env[name] !== undefined && env[name] !== base) issues.push(`${name}_CONFLICT`);
  }
  if (env.PAYMENT_PROVIDER?.toLowerCase() !== 'doku' || (env.DEFAULT_PAYMENT_PROVIDER !== undefined &&
      env.DEFAULT_PAYMENT_PROVIDER.toLowerCase() !== 'doku')) issues.push('PAYMENT_PROVIDER_NOT_EXPLICIT_DOKU');
  if (!present(env.DOKU_CLIENT_ID) || !present(env.DOKU_SECRET_KEY)) issues.push(production ? 'PRODUCTION_CREDS_NOT_SET_LOCALLY' : 'SANDBOX_CREDS_NOT_SET_LOCALLY');
  if (env.ACTIVE_FEE_POLICY_VERSION !== FEE_POLICY_V2.version) issues.push('FEE_POLICY_NOT_V2');
  if (env.MARKETPLACE_MODE !== undefined && env.MARKETPLACE_MODE !== 'PRELAUNCH_LISTING_ONLY') issues.push('PRELAUNCH_LOCK_NOT_EXPLICIT');
  for (const name of ['DOKU_CALLBACK_URL', 'DOKU_RETURN_URL']) {
    if (name === 'DOKU_RETURN_URL' && env[name] === undefined) continue;
    let url;
    try { url = new URL(env[name]); } catch (_) {}
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash ||
        (production && (url.origin !== 'https://tikum.app' || url.pathname === '/'))) issues.push(`${name}_INVALID`);
  }
  if (env.DOKU_HOLD_SETTLEMENT_ENABLED !== undefined && !['true', 'false'].includes(env.DOKU_HOLD_SETTLEMENT_ENABLED)) issues.push('HOLD_SETTING_INVALID');
  if (env.DOKU_PAYMENT_DUE_MINUTES !== undefined && (!/^[1-9]\d*$/.test(env.DOKU_PAYMENT_DUE_MINUTES) ||
      !Number.isSafeInteger(Number(env.DOKU_PAYMENT_DUE_MINUTES)))) issues.push('PAYMENT_DUE_MINUTES_INVALID');
  if (production) {
    if (env.DOKU_WRITTEN_APPROVAL_CONFIRMED !== 'true') issues.push('WRITTEN_APPROVAL_REQUIRED');
    if (['DOKU_SANDBOX_CLIENT_ID', 'DOKU_SANDBOX_SECRET_KEY'].some(name => present(env[name]))) issues.push('SANDBOX_CREDENTIAL_OVERRIDES_PRESENT');
    if (env.ENABLE_DOKU_PRODUCTION !== 'true' && env.DOKU_PRODUCTION_ENABLED !== 'true') issues.push('PRODUCTION_PROVIDER_GATE_CLOSED');
  }
  return issues;
}

function paymentArgs(tier, price, orderId) {
  const quantity = 2;
  const fee = calculateDualTierFees({ ticketPrice: price, quantity, fulfillmentType: tier });
  return { orderId, amount: fee.buyer_total_amount, channel: 'DOKU_CHECKOUT', requiresEscrow: false,
    metadata: { invoiceNumber: orderId, quantity, unit_listing_price: price,
      buyer_fee_per_ticket: fee.buyer_fee_per_ticket, fulfillment_type: tier } };
}

async function selfChecks() {
  const defaultKeys = ['DOKU_ENV', 'DOKU_SANDBOX_BASE_URL', 'DOKU_BASE_URL', 'DOKU_API_BASE_URL'];
  const saved = defaultKeys.map(key => process.env[key]);
  try {
    for (const key of defaultKeys) delete process.env[key];
    const defaults = new DokuPaymentProvider({ allowSimulation: false });
    assert.equal(defaults.env, 'sandbox');
    assert.equal(defaults.apiBaseUrl, SANDBOX);
  } finally {
    defaultKeys.forEach((key, i) => {
      if (saved[i] !== undefined) process.env[key] = saved[i];
    });
  }
  const provider = new DokuPaymentProvider({ clientId: 'preflight-fixture', secretKey: 'preflight-fixture-secret',
    webhookSecret: 'preflight-fixture-secret', apiBaseUrl: SANDBOX, env: 'sandbox', allowSimulation: false });
  const target = '/api/webhooks/doku';
  const body = '{ "preflight": true }';
  function expected({ headers, digest }) {
    const parts = [`Client-Id:${provider.clientId}`, `Request-Id:${headers['Request-Id']}`,
      `Request-Timestamp:${headers['Request-Timestamp']}`, `Request-Target:${target}`];
    if (digest) parts.push(`Digest:${digest}`);
    return 'HMACSHA256=' + createHmac('sha256', 'preflight-fixture-secret').update(parts.join('\n')).digest('base64');
  }
  const post = provider.buildSignedRequest({ method: 'POST', target, body });
  const get = provider.buildSignedRequest({ method: 'GET', target, body });
  assert.equal(post.headers.Digest, createHash('sha256').update(body).digest('base64'));
  assert.equal(post.headers.Signature, expected({ headers: post.headers, digest: post.headers.Digest }));
  assert.equal(get.headers.Digest, undefined);
  assert.equal(get.headers.Signature, expected({ headers: get.headers }));
  assert.equal(provider.verifyWebhook(post.headers, {}, Buffer.from(body)), true);
  assert.equal(provider.verifyWebhook(post.headers, {}, Buffer.from(body.trim() + ' ')), false);
  assert.equal(FEE_POLICY_V2.minimum_listing_price, 500000);

  let payload;
  const captured = new Error('offline request captured');
  provider._httpPost = async req => {
    assert.equal(req.url, SANDBOX + CHECKOUT);
    payload = JSON.parse(req.body);
    throw captured;
  };
  for (const [tier, rate, cap] of [['SELLER_MANAGED', 6, 300000], ['TIKUM_VENUE_PIC', 9, 450000]]) {
    for (const [price, unitFee] of [[1000000, 1000000 * rate / 100], [10000000, cap]]) {
      const args = paymentArgs(tier, price, 'offline-preflight');
      await assert.rejects(provider.createPayment(args), error => error === captured);
      assert.deepEqual(payload.order.line_items.map(({ quantity, price }) => [quantity, price]), [[2, price], [2, unitFee]]);
      assert.equal(payload.order.amount, 2 * (price + unitFee));
    }
  }
  return ['SANDBOX_DEFAULT_URL', 'POST_DIGEST', 'GET_NO_DIGEST', 'RAW_WEBHOOK_HMAC', 'BOTH_TIER_RATES_CAPS_AND_CHECKOUT_ITEMIZATION'];
}

async function smoke(env) {
  if (!present(env.DOKU_CLIENT_ID) || !present(env.DOKU_SECRET_KEY)) return { code: 'SANDBOX_CREDS_NOT_SET_LOCALLY' };
  if ((env.DOKU_ENV ?? 'sandbox') !== 'sandbox' || env.DOKU_BASE_URL !== SANDBOX ||
      ['DOKU_SANDBOX_BASE_URL', 'DOKU_API_BASE_URL'].some(name => env[name] !== undefined && env[name] !== SANDBOX) ||
      !isPrelaunchListingMode()) return { code: 'SANDBOX_SMOKE_REFUSED' };
  const provider = new DokuPaymentProvider({ clientId: env.DOKU_CLIENT_ID, secretKey: env.DOKU_SECRET_KEY,
    apiBaseUrl: SANDBOX, env: 'sandbox', allowSimulation: false });
  const orderId = `smoke-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  let result;
  const captured = new Error('sandbox response captured');
  provider._httpPost = async req => {
    if (req.url !== SANDBOX + CHECKOUT || result) throw new Error('Unexpected destination or repeat request');
    const response = await fetch(SANDBOX + CHECKOUT, { method: 'POST', headers: req.headers, body: req.body,
      redirect: 'error', signal: AbortSignal.timeout(8000) });
    const json = await response.json().catch(() => null);
    const hasPaymentUrl = typeof json?.response?.payment?.url === 'string';
    result = { code: response.ok && hasPaymentUrl ? 'SANDBOX_CHECKOUT_OK' : 'SANDBOX_CHECKOUT_FAILED',
      httpStatus: response.status, shape: { json: json !== null, hasPaymentUrl } };
    throw captured;
  };
  try {
    await provider.createPayment({ ...paymentArgs('SELLER_MANAGED', 500000, orderId), callbackUrl: 'https://example.com/' });
  } catch (error) {
    if (error === captured) return result;
  }
  return { code: 'SANDBOX_CHECKOUT_FAILED' };
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some(flag => !['--require-creds', '--sandbox-smoke', '--production'].includes(flag))) throw new Error('Invalid flags');
  const mode = flags[0];
  const issues = configIssues(process.env);
  const checks = await selfChecks();
  const prelaunchLocked = isPrelaunchListingMode();
  if (!prelaunchLocked) issues.push('PRELAUNCH_LOCK_NOT_ACTIVE');
  const missingSandboxCredentials = issues.includes('SANDBOX_CREDS_NOT_SET_LOCALLY');
  // A fixture checkout supplies its own callback. All other malformed or
  // conflicting settings still block the network probe.
  const unsafeToSmoke = issues.some(issue => issue !== 'DOKU_CALLBACK_URL_INVALID' && /MISMATCH|CONFLICT|PRELAUNCH|INVALID$/.test(issue));
  const sandbox = mode !== '--sandbox-smoke' ? { code: 'NOT_REQUESTED' }
    : missingSandboxCredentials ? { code: 'SANDBOX_CREDS_NOT_SET_LOCALLY' }
    : unsafeToSmoke ? { code: 'SANDBOX_SMOKE_REFUSED' }
    : await smoke(process.env);
  const blockingIssues = issues.filter(issue => mode === '--production' ||
    issue.startsWith('PRELAUNCH_') || (mode && issue.endsWith('_CREDS_NOT_SET_LOCALLY')));
  if (mode === '--production' && process.env.DOKU_ENV !== 'production') blockingIssues.push('DOKU_PRODUCTION_MODE_REQUIRED');
  const ok = !blockingIssues.length && (mode !== '--sandbox-smoke' || sandbox.code === 'SANDBOX_CHECKOUT_OK');
  console.log(JSON.stringify({ ok, checks, prelaunchLocked, issues, blockingIssues, sandbox }));
  if (!ok) process.exitCode = 1;
}

if (require.main === module) main().catch(() => { console.error('DOKU_PREFLIGHT_FAILED'); process.exitCode = 1; });
module.exports = { configIssues, selfChecks, smoke };