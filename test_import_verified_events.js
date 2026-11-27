'use strict';
const assert = require('node:assert/strict');
const { validateInput, planImport } = require('./scripts/import_verified_events');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');

(async () => {
  const options = { now: new Date('2026-11-28T02:00:00+07:00'), trustedHosts: new Set(['promoter.example']) };
  const sports = { id: 'fixture-sports', canonical_name: 'Jakarta Basketball Final', category: 'OLAHRAGA', venue: 'Indoor Arena',
    city: 'Jakarta', start_date: '2026-11-28', min_price: 500000, source_url: 'https://promoter.example/basketball',
    provenance: { type: 'PROMOTER', reviewer: 'Fixture Reviewer', verified_at: '2026-11-27T10:00:00Z', evidence_sha256: 'a'.repeat(64) } };
  const comedy = { ...sports, id: 'fixture-comedy', canonical_name: 'Jakarta Stand-up Night', category: 'STAND-UP COMEDY',
    source_url: 'https://promoter.example/comedy' };
  const repo = new InMemoryCatalogRepository();
  let reads = 0;
  const read = repo.getAllEvents.bind(repo);
  repo.getAllEvents = async () => { reads++; return read(); };
  for (const [delta, code] of [
    [{ start_date: '2026-11-27' }, 'INVALID_OR_PAST_WIB_DATE'],
    [{ start_date: '2027-02-29' }, 'INVALID_OR_PAST_WIB_DATE'],
    [{ source_url: '' }, 'OFFICIAL_PROVENANCE_REQUIRED'],
    [{ source_url: 'https://promoter.example.invalid/basketball' }, 'OFFICIAL_PROVENANCE_REQUIRED'],
    [{ poster_url: '/assets/posters/fixture-sports.svg' }, 'INVALID_OR_MISSING_POSTER']
  ]) {
    const plan = await planImport(validateInput([{ ...sports, ...delta }], options), repo);
    assert.equal(plan.results[0].code, code);
    assert.equal(plan.ok, false);
  }
  assert.equal(reads, 0);
  const input = validateInput([sports, comedy], options);
  const plan = await planImport(input, repo);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.inserts.map(event => event.category), ['SPORTS', 'COMEDY']);
  assert.match(plan.results[0].poster, /\/fixture-sports\/poster\.svg$/);
  assert.deepEqual(await read(), []);
  await repo.upsertCanonicalEvent(plan.inserts[0]);
  assert.equal((await planImport(input, repo)).results[0].code, 'UNCHANGED');
  const dupe = validateInput([{ ...sports, id: 'fixture-copy' }], options);
  assert.equal((await planImport(dupe, repo)).results[0].code, 'DUPLICATE_EVENT');
  await repo.archivePastEvents({ todayWib: '2026-11-29' });
  assert.equal((await planImport(input, repo)).results[0].code, 'TERMINAL_ID_OR_SLUG_COLLISION');
  console.log('Verified importer: offline validation, fallback, duplicate, no-op and archive collision PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });