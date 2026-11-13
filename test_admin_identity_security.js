// Isolated contract tests. These are NOT PostgreSQL or production delivery evidence.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const { AdminMagicLinkService } = require('./src/services/adminMagicLinkService');
const { ADMIN_EMAIL, isAdminIdentity } = require('./src/config/adminIdentity');
const { hash, adminSecurityStore } = require('./src/storage/AdminSecurityStore');
const { TestEmailProvider } = require('./src/services/email/TestEmailProvider');
const { InMemoryUserRepository, setUserRepository } = require('./src/storage');
const { resolveUserAsync, resolveUser } = require('./src/middleware/auth');
const { requireAdminIdentity, adminOrigin } = require('./src/middleware/adminSecurity');
const { SessionStore } = require('./src/services/sessionStore');

class IsolatedStore {
  constructor() {
    this.user = { id: 'isolated-admin', email: ADMIN_EMAIL, name: 'Admin', role: 'ADMIN', status: 'ACTIVE' };
    this.tokens = new Map(); this.sessions = new Map(); this.limits = new Map(); this.down = false;
  }
  check() { if (this.down) throw Error('DATABASE_UNAVAILABLE'); }
  async findAdmin() { this.check(); return isAdminIdentity(this.user) ? this.user : null; }
  async limit(key, max, seconds) {
    this.check(); const now = Date.now(); let row = this.limits.get(key);
    if (!row || row.until <= now) row = { attempts: 0, until: now + seconds * 1000 };
    row.attempts++; this.limits.set(key, row); return row.attempts <= max;
  }
  async issue(id, tokenHash) { this.check(); this.tokens.set(tokenHash, { id, until: Date.now() + 900000, accepted: false }); }
  async accept(tokenHash) { this.check(); this.tokens.get(tokenHash).accepted = true; }
  async cancel(tokenHash) { this.check(); this.tokens.get(tokenHash).used = true; }
  async consume(tokenHash, sessionHash, previous) {
    this.check(); const row = this.tokens.get(tokenHash);
    if (!row || row.used || !row.accepted || row.until <= Date.now() || !isAdminIdentity(this.user)) return null;
    row.used = true; if (previous) this.sessions.delete(previous);
    this.sessions.set(sessionHash, { until: Date.now() + 28800000 }); return this.user;
  }
  async lookup(token) {
    this.check(); const row = this.sessions.get(hash(token));
    if (!row || row.revoked || row.until <= Date.now() || !isAdminIdentity(this.user)) return null;
    return { user: this.user, session: { session_token: token, expires_at: new Date(row.until).toISOString() } };
  }
  async revoke(token) { this.check(); this.sessions.delete(hash(token)); }
}
function fixture() {
  const store = new IsolatedStore(); const provider = new TestEmailProvider();
  return { store, provider, service: new AdminMagicLinkService(store, provider) };
}
async function issued(f = fixture()) {
  await f.service.request(' ADMIN@TIKUM.APP ', '127.0.0.1');
  const token = /#token=([a-f0-9]{64})/.exec(f.provider.getLastEmail().text)[1];
  return { ...f, token };
}
function req(token) { return { headers: {}, header: () => token ? `Bearer ${token}` : null }; }
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test('admin security contracts', async t => {
  await t.test('normalizes the canonical identity; rejects other emails and inactive users', () => {
    assert.ok(isAdminIdentity({ email: ' ADMIN@TIKUM.APP ', role: 'ADMIN', status: 'ACTIVE' }));
    for (const email of ['other@tikum.app', 'admin@tikum.app.evil', '']) assert.equal(isAdminIdentity({ email, role: 'ADMIN', status: 'ACTIVE' }), false);
    assert.equal(isAdminIdentity({ email: ADMIN_EMAIL, role: 'BUYER', status: 'ACTIVE' }), false);
  });
  await t.test('unauthorized and unregistered emails get generic response and no email/token', async () => {
    const f = fixture(); const a = await f.service.request('other@tikum.app', 'a');
    const b = await f.service.request('unregistered@example.test', 'b');
    assert.deepEqual(a, b); assert.equal(f.store.tokens.size, 0); assert.equal(f.provider.sentEmails.length, 0);
  });
  await t.test('correct email issues only a hash, 15 minute expiry and fragment link; response leaks no token', async () => {
    const f = await issued(); assert.equal(f.store.tokens.has(f.token), false);
    assert.ok(f.store.tokens.has(hash(f.token))); assert.ok(f.store.tokens.get(hash(f.token)).until <= Date.now() + 900000);
    assert.equal(f.provider.getLastEmail().from, 'TIKUM <no-reply@tikum.app>');
    assert.equal(new URL(f.provider.getLastEmail().text.split('\n')[0].replace('Masuk ke TIKUM: ', '')).search, '');
    assert.ok(!JSON.stringify(await f.service.request(ADMIN_EMAIL, 'different-ip')).includes(f.token));
  });
  await t.test('valid token authenticates; replay and modified token fail', async () => {
    const f = await issued(); const result = await f.service.verify(f.token, 'a');
    assert.ok(await f.store.lookup(result.sessionToken));
    await assert.rejects(f.service.verify(f.token, 'a'), { code: 'INVALID_ADMIN_LINK' });
    await assert.rejects(f.service.verify(crypto.randomBytes(32).toString('hex'), 'a'), { code: 'INVALID_ADMIN_LINK' });
  });
  await t.test('expired token and invalid token fail', async () => {
    const f = await issued(); f.store.tokens.get(hash(f.token)).until = 0;
    await assert.rejects(f.service.verify(f.token, 'a'), { code: 'INVALID_ADMIN_LINK' });
    await assert.rejects(f.service.verify('bad', 'a'), { code: 'INVALID_ADMIN_LINK' });
  });
  await t.test('concurrent verification creates exactly one session (contract simulation)', async () => {
    const f = await issued(); const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.service.verify(f.token, 'a')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.store.sessions.size, 1);
  });
  await t.test('role-bearing wrong email cannot request or restore an admin session', async () => {
    const f = await issued(); f.store.user.email = 'other@tikum.app';
    await assert.rejects(f.service.verify(f.token, 'a'), { code: 'INVALID_ADMIN_LINK' });
    assert.equal(f.store.sessions.size, 0);
  });
  await t.test('authentication rotates old session and logout rejects stale cookie', async () => {
    const f = await issued(); const old = 'adm-old'; f.store.sessions.set(hash(old), { until: Date.now() + 10000 });
    const result = await f.service.verify(f.token, 'a', old); assert.notEqual(result.sessionToken, old);
    assert.equal(await f.store.lookup(old), null); await f.store.revoke(result.sessionToken);
    assert.equal(await f.store.lookup(result.sessionToken), null);
  });
  await t.test('expired, revoked and deleted sessions are rejected', async () => {
    for (const mode of ['expired', 'revoked', 'deleted']) {
      const f = await issued(); const result = await f.service.verify(f.token, 'a'); const row = f.store.sessions.get(hash(result.sessionToken));
      if (mode === 'expired') row.until = 0; if (mode === 'revoked') row.revoked = true;
      if (mode === 'deleted') f.store.sessions.delete(hash(result.sessionToken));
      assert.equal(await f.store.lookup(result.sessionToken), null);
    }
  });
  await t.test('rate limits shared across service instances; storage failures fail closed', async () => {
    const f = fixture(); const second = new AdminMagicLinkService(f.store, f.provider);
    for (let i = 0; i < 10; i++) await (i % 2 ? second : f.service).request('wrong@example.test', 'shared-ip');
    await assert.rejects(second.request('wrong@example.test', 'shared-ip'), { code: 'AUTH_RATE_LIMITED' });
    f.store.down = true; await assert.rejects(f.service.request(ADMIN_EMAIL, 'new-ip'), /DATABASE_UNAVAILABLE/);
  });
  await t.test('verification attempts are rate limited', async () => {
    const f = fixture(); for (let i = 0; i < 30; i++) await assert.rejects(f.service.verify('bad', 'a'));
    await assert.rejects(f.service.verify('bad', 'a'), { code: 'AUTH_RATE_LIMITED' });
  });
  await t.test('provider rejection/network failure revokes pending token and returns safe failure', async () => {
    for (const send of [async () => ({ success: false }), async () => { throw Error('sensitive provider detail'); }]) {
      const f = fixture(); f.service.provider = { send };
      await assert.rejects(f.service.request(ADMIN_EMAIL, 'a'), { code: 'ADMIN_EMAIL_UNAVAILABLE' });
      assert.ok([...f.store.tokens.values()].every(row => row.used));
    }
  });
  await t.test('no local session resurrection on authoritative miss or database failure', async () => {
    const original = adminSecurityStore.lookup;
    try {
      for (const lookup of [async () => null, async () => { throw Error('DB unavailable'); }]) {
        adminSecurityStore.lookup = lookup; const request = req('adm-stale');
        assert.equal(await resolveUserAsync(request), null); assert.equal(request.adminAuthenticated, false);
      }
      assert.equal(resolveUser(req('adm-stale')), null);
    } finally { adminSecurityStore.lookup = original; }
  });
  await t.test('ordinary session creation rejects every administrator role', async () => {
    const repo = new InMemoryUserRepository();
    assert.throws(() => SessionStore.createSession({ userId: 'admin', role: 'ADMIN' }), /ADMIN_MAGIC_LINK_REQUIRED/);
    await assert.rejects(repo.createSession({ userId: 'admin', role: 'ADMIN' }), /ADMIN_MAGIC_LINK_REQUIRED/);
  });
  await t.test('authorization rejects anonymous, client claims, stale identity and DB failure', async () => {
    let next = false; const user = fixture().store.user;
    for (const request of [{}, { user, adminAuthenticated: false }, { user: { ...user, email: 'other@example.test' }, adminAuthenticated: true }]) {
      const res = response(); await requireAdminIdentity(request, res, () => { next = true; });
      assert.ok([401, 403].includes(res.statusCode));
    }
    assert.equal(next, false);
    const original = adminSecurityStore.lookup;
    try {
      adminSecurityStore.lookup = async () => { throw Error('down'); };
      const res = response(); await requireAdminIdentity({ user, adminAuthenticated: true, session: {} }, res, () => {});
      assert.equal(res.statusCode, 503);
    } finally { adminSecurityStore.lookup = original; }
  });
  await t.test('cross-site and missing Origin mutations rejected', () => {
    for (const origin of [undefined, 'https://evil.example']) {
      const res = response(); adminOrigin({ method: 'POST', headers: { origin, host: 'localhost' } }, res, () => assert.fail('CSRF bypass'));
      assert.equal(res.statusCode, 403);
    }
  });
  await t.test('public buyer sessions still authenticate and revoked sessions fail', async () => {
    const repo = new InMemoryUserRepository(); setUserRepository(repo);
    const user = await repo.createUser({ id: 'security-buyer', email: 'buyer@example.test', name: 'Buyer', role: 'BUYER', status: 'ACTIVE' });
    const result = await repo.createSession({ userId: user.id, role: 'BUYER' });
    assert.equal((await resolveUserAsync(req(result.rawToken))).id, user.id);
    await repo.revokeSession(result.rawToken); assert.equal(await resolveUserAsync(req(result.rawToken)), null);
  });
});