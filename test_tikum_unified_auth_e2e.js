// Deterministic HTTP integration only; never claims browser/mailbox/PostgreSQL coverage.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const express = require('express');
const { MagicLinkService } = require('./src/services/magicLinkService');
const { resolveUserAsync } = require('./src/middleware/auth');
const { getUserRepository } = require('./src/storage');
const { SessionStore } = require('./src/services/sessionStore');
let server;
let passed = 0;
const sessions = [];
SessionStore.getAll = () => sessions;
SessionStore.saveAll = rows => { sessions.splice(0, sessions.length, ...rows); };
(async () => {
  const app = express();
  app.use(express.json());
  app.use(async (req, res, next) => { await resolveUserAsync(req); next(); });
  app.use('/api/auth', require('./src/api/authRouter'));
  app.use('/api/admin', require('./src/api/adminAuthRouter'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, cookie, origin = base) => fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const check = (actual, expected) => { assert.equal(actual, expected); passed++; };
  let mail;
  MagicLinkService.setTestMailSink(value => { mail = value; });
  const email = 'controlled@example.test';
  const response = await request('/api/auth/magic-link', { email });
  check(response.status, 200);
  const generic = await response.json();
  check(new URL(mail.magicLinkUrl).search, '');
  const hash = MagicLinkService.hashToken(mail.rawToken);
  check((await request('/api/auth/verify?token=' + mail.rawToken)).status, 200);
  check((await getUserRepository().getMagicLinkTokenByHash(hash)).used, false);
  check((await request('/api/auth/verify', { token: mail.rawToken }, null, 'https://evil.example')).status, 403);
  const results = await Promise.all([request('/api/auth/verify', { token: mail.rawToken }), request('/api/auth/verify', { token: mail.rawToken })]);
  check(results.filter(r => r.status === 200).length, 1);
  const cookie = results.find(r => r.status === 200).headers.get('set-cookie').split(';')[0];
  check((await request('/api/auth/me', undefined, cookie)).status, 200);
  check((await request('/api/auth/logout', {}, cookie)).status, 200);
  check((await request('/api/auth/me', undefined, cookie)).status, 401);
  check((await request('/api/auth/verify', { token: mail.rawToken })).status, 401);
  const admin = await (await request('/api/auth/magic-link', { email: 'admin@tikum.app' })).json();
  check(admin.message, generic.message);
  check((await request('/api/admin/login', { password: 'unused' })).status, 410);
  check((await request('/api/admin/verify', { token: 'bad' }, null, 'https://evil.example')).status, 403);
  console.log(`UNIFIED LOCAL HTTP: passed=${passed} failed=0 skipped=0`);
  console.log('BLOCKED external mode: TEST_DATABASE_URL + isolated schema, approved mailbox/provider, and authorized deployed browser target required');
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => { MagicLinkService.clearTestMailSink(); if (server) server.close(); });