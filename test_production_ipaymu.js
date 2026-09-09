/**
 * ARGUS — Production Verification for iPaymu Compliance
 * 
 * Verifies live production website at:
 * https://argus-trust-infrastructure.vercel.app
 */

const https = require('https');
const assert = require('assert');

const PROD_BASE = 'https://argus-trust-infrastructure.vercel.app';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(PROD_BASE + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function verifyProduction() {
  console.log('====================================================');
  console.log(`  VERIFYING LIVE PRODUCTION: ${PROD_BASE}`);
  console.log('====================================================\n');

  const routes = ['/', '/faq', '/terms', '/refund-policy', '/contact'];
  
  for (const r of routes) {
    const res = await get(r);
    console.log(`[ROUTE] ${r} -> HTTP ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200, `Expected 200 on ${r}, got ${res.statusCode}`);
    
    // Check canonical business info
    assert.ok(res.body.includes('SHINERVA HQ'), `Missing SHINERVA HQ on ${r}`);
    assert.ok(res.body.includes('agunsux@gmail.com'), `Missing agunsux@gmail.com on ${r}`);
    assert.ok(res.body.includes('081299927378'), `Missing 081299927378 on ${r}`);
    assert.ok(res.body.includes('Jl. Pasirluyu No. 79'), `Missing Pasirluyu on ${r}`);
    assert.ok(res.body.includes('Bandung 40254'), `Missing Bandung 40254 on ${r}`);
    assert.ok(res.body.includes('Indonesia'), `Missing Indonesia on ${r}`);

    // Check footer links
    assert.ok(res.body.includes('href="/faq"'), `Missing /faq link on ${r}`);
    assert.ok(res.body.includes('href="/terms"'), `Missing /terms link on ${r}`);
    assert.ok(res.body.includes('href="/refund-policy"'), `Missing /refund-policy link on ${r}`);
    assert.ok(res.body.includes('href="/contact"'), `Missing /contact link on ${r}`);

    // Check zero forbidden placeholders
    const placeholders = ['Lorem ipsum', 'test@test', 'your@email', 'your address', '000000', 'Coming soon', 'TODO', 'FIXME'];
    for (const p of placeholders) {
      assert.strictEqual(res.body.includes(p), false, `Found placeholder ${p} on ${r}`);
    }
    console.log(`  -> Checked: SHINERVA HQ, agunsux@gmail.com, 081299927378, Jl. Pasirluyu No. 79, Bandung 40254, Indonesia (ALL PRESENT & VERIFIED)`);
  }

  // Check /api/business-profile
  const apiRes = await get('/api/business-profile');
  console.log(`[API] /api/business-profile -> HTTP ${apiRes.statusCode}`);
  assert.strictEqual(apiRes.statusCode, 200);
  const profile = JSON.parse(apiRes.body);
  assert.strictEqual(profile.name, 'SHINERVA HQ');
  assert.strictEqual(profile.email, 'agunsux@gmail.com');
  assert.strictEqual(profile.phone, '081299927378');
  assert.strictEqual(profile.address.street, 'Jl. Pasirluyu No. 79');
  assert.strictEqual(profile.address.city, 'Bandung');
  assert.strictEqual(profile.address.postalCode, '40254');
  assert.strictEqual(profile.address.country, 'Indonesia');
  console.log(`  -> Canonical businessProfile verified: ${profile.name}, ${profile.email}, ${profile.phone}, ${profile.address.formattedText.replace(/\n/g, ', ')}`);

  console.log('\n====================================================');
  console.log('  ALL LIVE PRODUCTION CHECKS PASSED: 100% GO');
  console.log('====================================================\n');
}

verifyProduction().catch(err => {
  console.error('Production verification failed:', err);
  process.exit(1);
});
