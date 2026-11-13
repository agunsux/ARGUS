// REAL PostgreSQL integration, never substitutes a mock for unavailable credentials.
// Requires an explicitly supplied isolated database plus a fresh dedicated schema.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { AdminSecurityStore, hash } = require('./src/storage/AdminSecurityStore');
const url = process.env.TEST_DATABASE_URL;
const schema = process.env.TEST_DATABASE_SCHEMA;
if (!url || !/^admin_security_test_[a-z0-9_]+$/.test(schema || '')) {
  console.error('BLOCKED: TEST_DATABASE_URL and fresh TEST_DATABASE_SCHEMA=admin_security_test_<unique> required. No SQL executed.');
  process.exit(2);
}
if (url === process.env.DATABASE_URL || url === process.env.TARGET_DATABASE_URL) {
  console.error('BLOCKED: integration database must differ from application database.'); process.exit(2);
}
const setup = new Pool({ connectionString: url, max: 1 });
setup.on('error', () => {});
const options = { connectionString: url, options: `-c search_path=${schema}`, max: 3 };
const a = new Pool(options); const b = new Pool(options);
a.on('error', () => {}); b.on('error', () => {});
let created = false;
(async () => {
  // CREATE SCHEMA without IF NOT EXISTS prevents reuse or damage to existing data.
  await setup.query(`CREATE SCHEMA "${schema}"`); created = true;
  await a.query('CREATE TABLE users (id VARCHAR(100) PRIMARY KEY, email TEXT, name TEXT, role TEXT, status TEXT)');
  await a.query(fs.readFileSync(path.join(__dirname, 'migrations/025_admin_identity_security.sql'), 'utf8'));
  await a.query(fs.readFileSync(path.join(__dirname, 'migrations/025_admin_identity_security.sql'), 'utf8'));
  await a.query("INSERT INTO users VALUES ('test-admin', 'admin@tikum.app', 'Isolated Admin', 'ADMIN', 'ACTIVE')");
  const first = new AdminSecurityStore(a); const second = new AdminSecurityStore(b);
  assert.equal((await first.findAdmin()).id, 'test-admin');
  const token = crypto.randomBytes(32).toString('hex');
  await first.issue('test-admin', hash(token)); await first.accept(hash(token));
  const attempts = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    (i % 2 ? first : second).consume(hash(token), hash(`isolated-session-${i}`), null)));
  assert.equal(attempts.filter(Boolean).length, 1, 'Exactly one cross-connection consumer');
  const winner = attempts.findIndex(Boolean); const session = `isolated-session-${winner}`;
  assert.ok(await second.lookup(session)); await first.revoke(session); assert.equal(await second.lookup(session), null);
  const limits = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? first : second).limit('shared-limit', 5, 60)));
  assert.equal(limits.filter(Boolean).length, 5, 'Shared SQL limiter must admit exactly five');
  await first.issue('test-admin', hash('expired')); await first.accept(hash('expired'));
  await a.query("UPDATE admin_magic_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [hash('expired')]);
  assert.equal(await second.consume(hash('expired'), hash('never-session'), null), null);
  await first.issue('test-admin', hash('identity-change')); await first.accept(hash('identity-change'));
  await a.query("UPDATE users SET email='other@example.test' WHERE id='test-admin'");
  assert.equal(await second.consume(hash('identity-change'), hash('never-session'), null), null);
  assert.equal(await first.findAdmin(), null);
  console.log('POSTGRES ADMIN SECURITY: migration idempotency, identity, concurrent single-use, shared limits, expiry, revocation PASS');
})().catch(error => { console.error(`POSTGRES ADMIN SECURITY FAILED (${error.code || error.name})`); process.exitCode = 1; })
  .finally(async () => {
    await Promise.all([a.end(), b.end()]);
    // Only the fresh schema created by this exact invocation is removed.
    if (created) await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
    await setup.end();
  });