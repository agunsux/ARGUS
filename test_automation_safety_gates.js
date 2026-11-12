process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { requireCronBearer, requireOperationalClock } = require('./src/middleware/cronAuthorization');
const { EventIngestionScheduler, JOB_TYPES } = require('./src/discovery/EventIngestionScheduler');
const { SourceToDatabaseAuditService } = require('./src/discovery/SourceToDatabaseAuditService');

function invoke(guard, req) {
  let status;
  let body;
  let allowed = false;
  guard(req, { status(value) { status = value; return this; }, json(value) { body = value; return this; } }, () => { allowed = true; });
  return { status, body, allowed };
}

test('cron authentication fails closed and accepts only an exact bearer header', () => {
  const original = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal(invoke(requireCronBearer, { headers: {} }).status, 503);
    process.env.CRON_SECRET = 'test-cron-credential';
    assert.equal(invoke(requireCronBearer, { headers: {}, query: { secret: process.env.CRON_SECRET } }).status, 401);
    assert.equal(invoke(requireCronBearer, { headers: { authorization: 'Bearer wrong' } }).status, 401);
    assert.equal(invoke(requireCronBearer, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).allowed, true);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});

test('operational clocks cannot be overridden outside tests', () => {
  const original = process.env.NODE_ENV;
  const clock = process.env.SIMULATE_NOW;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SIMULATE_NOW;
    for (const req of [{ query: { now: '2040-01-01' } }, { body: { asOfDate: '2040-01-01' } }, { headers: { 'x-simulate-clock': '2040-01-01' } }]) {
      assert.equal(invoke(requireOperationalClock, req).status, 400);
    }
    assert.equal(invoke(requireOperationalClock, {}).allowed, true);
    process.env.SIMULATE_NOW = '2040-01-01';
    assert.equal(invoke(requireOperationalClock, {}).status, 400);
  } finally {
    process.env.NODE_ENV = original;
    if (clock === undefined) delete process.env.SIMULATE_NOW;
    else process.env.SIMULATE_NOW = clock;
  }
});

test('all discovery cron aliases reject unauthenticated HTTP requests before execution', async () => {
  const app = express();
  app.use(express.json());
  app.use(require('./src/discovery/discoveryRouter'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const original = process.env.CRON_SECRET;
  const paths = ['/api/discovery/lifecycle/cron', '/api/cron/lifecycle',
    '/api/cron/discovery-sync', '/api/discovery/cron/sync',
    '/api/discovery/jobs/chunked-sync', '/api/cron/discovery-chunked-sync',
    '/api/discovery/jobs/targeted-sync', '/api/cron/targeted-imminent-sync',
    '/api/discovery/cron/catalog-refresh', '/api/cron/catalog-refresh'];
  try {
    for (const secret of [undefined, 'test-cron-credential']) {
      if (secret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = secret;
      for (const path of paths) {
        for (const method of ['GET', 'POST']) {
          const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
          assert.equal(response.status, secret === undefined ? 503 : 401, `${method} ${path}`);
        }
      }
    }
    delete process.env.CRON_SECRET;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/discovery/admin/run-sync`, { method: 'POST' });
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
    await new Promise(resolve => server.close(resolve));
  }
});

test('image write failures fail the job instead of reporting success', async () => {
  const scheduler = new EventIngestionScheduler();
  await assert.rejects(scheduler.runJob(JOB_TYPES.IMAGE_HEALTH_CHECK, {
    persist: true,
    events: [{ id: 'test-image', image_url: 'https://example.com/poster.png' }],
    repository: { upsertCanonicalEvent: async () => { throw new Error('TEST_DB_WRITE_FAILED'); } },
    fetchFn: async () => ({ ok: true, status: 200, headers: { get: () => 'image/png' } })
  }), /TEST_DB_WRITE_FAILED/);
  assert.equal(scheduler.getJobStatus(JOB_TYPES.IMAGE_HEALTH_CHECK).status, 'FAILED');
});

test('image persistence requires a writable repository', async () => {
  const scheduler = new EventIngestionScheduler();
  await assert.rejects(scheduler.runImageHealthCheckChunk({ persist: true, repository: { readOnly: true } }), /PERSISTENCE_UNAVAILABLE/);
  await assert.rejects(scheduler.runImageHealthCheckChunk({ persist: true, repository: {} }), /PERSISTENCE_UNAVAILABLE/);
});

test('audit rejects invalid reference time', () => {
  assert.throws(() => SourceToDatabaseAuditService.runAudit({ asOfDate: 'not-a-date' }), /INVALID_AUDIT_REFERENCE_TIME/);
});