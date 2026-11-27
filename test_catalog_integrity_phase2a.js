'use strict';

// Offline diagnostics: no environment loading, network, database, or fixture mutation.
const assert = require('assert');
const policy = require('./src/discovery/CatalogHygienePolicy');
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
const event = (id, extra = {}) => ({ id, title: 'Example concert', city: 'Jakarta', start_date: '2027-01-01', status: 'UPCOMING', ...extra });
check('WIB before midnight', () => assert.strictEqual(policy.getTodayWibIso(new Date('2026-11-25T16:59:59Z')), '2026-11-25'));
check('WIB at midnight', () => assert.strictEqual(policy.getTodayWibIso(new Date('2026-11-25T17:00:00Z')), '2026-11-26'));
check('past event excluded', () => assert.strictEqual(policy.isEligibleForActiveResale(event('a', { start_date: '2026-11-25' }), '2026-11-26'), false));
check('terminal lifecycle overrides active status', () => assert.strictEqual(policy.isEligibleForActiveResale(event('a', { lifecycle_status: 'PAST' }), '2026-11-26'), false));
check('sports alias', () => assert.strictEqual(policy.normalizeCategory('OLAHRAGA'), 'SPORTS'));
check('comedy alias', () => assert.strictEqual(policy.normalizeCategory('STANDUP'), 'COMEDY'));
check('same title/date, different venues must remain distinct', () => assert.strictEqual(policy.deduplicateEvents([event('a', { venue_name: 'Venue A' }), event('b', { venue_name: 'Venue B' })]).length, 2));
check('different sessions must remain distinct', () => assert.strictEqual(policy.deduplicateEvents([event('a', { start_datetime: '2027-01-01T12:00:00+07:00' }), event('b', { start_datetime: '2027-01-01T19:00:00+07:00' })]).length, 2));
check('missing provider metadata must not auto-merge', () => assert.strictEqual(policy.deduplicateEvents([event('a'), event('b')]).length, 2));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;