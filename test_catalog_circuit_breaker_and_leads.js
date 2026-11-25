'use strict';
process.env.NODE_ENV = 'test';
const assert = require('assert');
const { PrimaryEventScannerService } = require('./src/discovery/PrimaryEventScannerService');
const { eventPolicyRegistry } = require('./src/discovery/EventPolicyRegistry');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { DailyCatalogRefreshService } = require('./src/discovery/DailyCatalogRefreshService');
const { checkCatalogBatch, normalizeProviderKey } = require('./src/discovery/CatalogSafety');
const app = require('./src/server');

async function main() {
  for (const [source, expected] of Object.entries({
    LOKET: 'loket', 'loket.com': 'loket', 'https://www.tiket.com/event': 'tiket',
    'tiptip.id': 'tiptip', 'goers.app': 'goers', 'goersapp.com': 'goers',
    'kiostix.com': 'kiostix', 'artatix.co.id': 'artatix',
    'dewatiket.id': 'dewatiket', 'yesplis.com': 'yesplis', 'notloket.com': 'unknown'
  })) assert.strictEqual(normalizeProviderKey(source), expected, source);
  const oldCatalog = PrimaryEventScannerService.getPrimarySourcesCatalog;
  const before = JSON.stringify(eventPolicyRegistry.getAllEvents());
  try {
    for (const events of [[], [{ event_name: 'Single', venue: 'Venue', event_date: '2026-12-01', starting_price_idr: 500000, category: 'CONCERT' }]]) {
      PrimaryEventScannerService.getPrimarySourcesCatalog = () => [{ source: 'test', events }];
      const result = PrimaryEventScannerService.scanAllSources({ now: '2026-11-24T05:00:00Z', fullCatalog: true });
      assert.strictEqual(result.circuit_breaker_tripped, true);
      assert.strictEqual(JSON.stringify(eventPolicyRegistry.getAllEvents()), before);
    }
  } finally { PrimaryEventScannerService.getPrimarySourcesCatalog = oldCatalog; }
  const fixtures = [0, 1, 2, 3].map(i => ({ id: `provider-breaker-${i}`, event_name: `Provider Fixture ${i}`, venue: 'Fixture Hall', city: 'Jakarta', event_date: '2099-01-01', category: 'CONCERT', starting_price_idr: 500000, official_ticketing_partner: 'LOKET' }));
  for (const event of fixtures) eventPolicyRegistry.events.set(event.id, event);
  const healthy = { event_name: 'Healthy provider fixture', venue: 'Fixture Hall', city: 'Jakarta', event_date: '2099-01-01', category: 'CONCERT', starting_price_idr: 500000, policy_source_url: 'https://yesplis.com/events/fixture' };
  try {
    PrimaryEventScannerService.getPrimarySourcesCatalog = () => [
      { source: 'loket.com', snapshotComplete: true, events: [fixtures[0], fixtures[0]] },
      { source: 'yesplis.com', events: [healthy] }
    ];
    const result = PrimaryEventScannerService.scanAllSources({ now: '2098-12-01T00:00:00Z' });
    assert.strictEqual(result.circuit_breaker_tripped, true);
    const loket = result.provider_reports.find(r => r.provider === 'loket');
    assert.strictEqual(loket.raw_fetched_count, 2);
    assert.strictEqual(loket.qualified_count, 1);
    assert.ok(loket.previous_window_active >= 4);
    assert.strictEqual(JSON.stringify(fixtures), JSON.stringify(fixtures.map(e => eventPolicyRegistry.events.get(e.id))));
    assert.ok(eventPolicyRegistry.getAllEvents().some(e => e.event_name === healthy.event_name));
    assert.ok(!result.provider_reports.some(r => r.provider === 'tiket'));
    PrimaryEventScannerService.getPrimarySourcesCatalog = () => [{ source: 'LOKET', events: [] }];
    assert.strictEqual(PrimaryEventScannerService.scanAllSources({ now: '2098-12-01T00:00:00Z' }).circuit_breaker_tripped, true);
  } finally {
    PrimaryEventScannerService.getPrimarySourcesCatalog = oldCatalog;
    for (const event of fixtures) eventPolicyRegistry.events.delete(event.id);
    for (const event of eventPolicyRegistry.getAllEvents()) if (event.event_name === healthy.event_name) eventPolicyRegistry.events.delete(event.id);
  }
  assert.strictEqual(checkCatalogBatch(0, 1, 'new_source').circuit_breaker_tripped, false);
  assert.strictEqual(checkCatalogBatch(4, 1, 'existing_source').circuit_breaker_tripped, true);
  const insertedIds = [];
  for (let i = 0; i < 4; i++) {
    const id = `breaker-loket-fixture-${i}`;
    canonicalRegistry.events.set(id, { id, event_id: id, title: id, official_ticketing_provider: 'LOKET', start_date: '2026-12-15', end_date: '2026-12-15', event_start_at: '2026-12-15T12:00:00Z', event_end_at: '2026-12-15T16:00:00Z', status: 'UPCOMING' });
    insertedIds.push(id);
  }
  try {
    const original = JSON.stringify(canonicalRegistry.getAllEvents());
    for (const rows of [[], [{ id: 'candidate', title: 'Test', start_date: '2026-12-10' }]]) {
      const service = new DailyCatalogRefreshService({ loketAdapter: { discover: async () => rows }, goersAdapter: {} });
      service.evaluatePriceEligibility = () => ({ qualified: true, eligible_min_price: 500000 });
      const result = await service.runDailyRefresh({ asOfDate: '2026-11-24T05:00:00Z' });
      assert.strictEqual(result.circuit_breaker_tripped, true);
      assert.strictEqual(result.admin_alert, true);
      assert.strictEqual(JSON.stringify(canonicalRegistry.getAllEvents()), original);
    }
  } finally { insertedIds.forEach(id => canonicalRegistry.events.delete(id)); }
  const marker = 'private-lead-quarantine-test';
  eventPolicyRegistry.events.set(marker, { id: marker, event_id: marker, event_name: marker, event_date: '2099-01-01', category: 'CONCERT', city: 'Jakarta', venue: 'Test', starting_price_idr: 500000, status: 'unverified_lead' });
  canonicalRegistry.events.set(marker, { id: marker, event_id: marker, title: marker, status: 'UPCOMING', verification_state: 'unverified_lead', start_date: '2099-01-01' });
  const server = app.listen(0);
  try {
    for (const route of ['/api/discovery/events-qualified', '/api/events', '/api/events/home-feed']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
      assert.strictEqual(response.status, 200, route);
      assert.ok(!(await response.text()).includes(marker), `Lead leaked from ${route}`);
    }
  } finally {
    server.close();
    eventPolicyRegistry.events.delete(marker);
    canonicalRegistry.events.delete(marker);
  }
  console.log('Catalog breaker and public lead quarantine checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });