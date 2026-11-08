#!/usr/bin/env node
const assert = require('assert');
const https = require('https');

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://argus-80y7b2e20-shinerva.vercel.app';
const BYPASS_SECRET = process.env.VERCEL_PROTECTION_BYPASS || 'xIPBjrn6NgFlCegXY7LFgOfDjlFIi9rz';

function get(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'x-vercel-protection-bypass': BYPASS_SECRET,
        'User-Agent': 'Mozilla/5.0 (Node.js E2E Verifier)'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

async function run() {
  console.log(`Verifying live event structured data on: ${PREVIEW_URL}\n`);

  // 1. BTS Event
  console.log('1. Checking BTS World Tour Arirang...');
  const bts = await get(`${PREVIEW_URL}/events/bts-world-tour-arirang-jakarta-2026`);
  assert.strictEqual(bts.status, 200, 'BTS event page must return HTTP 200');
  const btsMatch = bts.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert(btsMatch, 'BTS JSON-LD script must exist');
  const btsSchema = JSON.parse(btsMatch[1]);
  assert.strictEqual(btsSchema['@type'], 'MusicEvent', 'BTS schema must be MusicEvent');
  assert.strictEqual(btsSchema.startDate, '2026-12-26T19:00:00+07:00', 'BTS date must be 2026-12-26');
  assert.strictEqual(btsSchema.endDate, '2026-12-27T22:30:00+07:00', 'BTS end date must be 2026-12-27');
  assert.strictEqual(btsSchema.offers, undefined, 'BTS schema.offers must be omitted (unverified primary omitted, 0 secondary)');
  assert(!bts.body.includes('schema.org/InStock'), 'BTS page must contain NO InStock claims');
  assert(bts.body.includes('https://www.tiket.com/en-id/to-do/bts-jakarta-day1'), 'BTS official ticket URL must be visible in HTML');
  assert(bts.body.includes('Tiket.com'), 'Tiket.com must be visible');
  assert(bts.body.includes('link rel="canonical" href="https://tikum.app/events/bts-world-tour-arirang-jakarta-2026"'), 'BTS canonical URL must be https://tikum.app/events/bts-world-tour-arirang-jakarta-2026');
  console.log('   ✅ BTS structured data and visible grounding certified!');

  // 2. BIGBANG Event
  console.log('2. Checking BIGBANG Cosmos Tour...');
  const bb = await get(`${PREVIEW_URL}/events/bigbang-cosmos-tour-jakarta-2027`);
  assert.strictEqual(bb.status, 200, 'BIGBANG event page must return HTTP 200');
  const bbMatch = bb.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert(bbMatch, 'BIGBANG JSON-LD script must exist');
  const bbSchema = JSON.parse(bbMatch[1]);
  assert.strictEqual(bbSchema['@type'], 'MusicEvent', 'BIGBANG schema must be MusicEvent');
  assert.strictEqual(bbSchema.startDate, '2027-01-16T19:00:00+07:00', 'BIGBANG date must be 2027-01-16');
  assert.strictEqual(bbSchema.endDate, '2027-01-17T22:30:00+07:00', 'BIGBANG end date must be 2027-01-17');
  assert.strictEqual(bbSchema.offers, undefined, 'BIGBANG schema.offers must be omitted (unverified primary omitted, 0 secondary)');
  assert(!bb.body.includes('schema.org/InStock'), 'BIGBANG page must contain NO InStock claims');
  assert(bb.body.includes('https://bigbanginjakarta.com/'), 'BIGBANG official ticket URL must be visible in HTML');
  assert(bb.body.includes('Jakarta International Stadium'), 'JIS venue must be visible');
  assert(bb.body.includes('link rel="canonical" href="https://tikum.app/events/bigbang-cosmos-tour-jakarta-2027"'), 'BIGBANG canonical URL must be https://tikum.app/events/bigbang-cosmos-tour-jakarta-2027');
  console.log('   ✅ BIGBANG structured data and visible grounding certified!');

  console.log('\n================================================================');
  console.log('ALL LIVE PREVIEW EVENT GROUNDING CHECKS PASSED PERFECTLY!');
  console.log('================================================================');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
