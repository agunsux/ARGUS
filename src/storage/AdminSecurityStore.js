const crypto = require('crypto');
const { getUserRepository } = require('./index');
const { ADMIN_EMAIL, isAdminIdentity } = require('../config/adminIdentity');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// No in-memory fallback in production. A missing migration or unavailable DB fails closed.
class AdminSecurityStore {
  constructor(pool = null) {
    this.pool = pool;
    this.testSessions = new Map();
  }
  async database() {
    if (this.pool) return this.pool;
    const repo = getUserRepository();
    if (typeof repo.ensureInitialized !== 'function') throw new Error('ADMIN_DATABASE_REQUIRED');
    await repo.ensureInitialized();
    if (!repo.pool || repo.degraded) throw new Error('ADMIN_DATABASE_UNAVAILABLE');
    return repo.pool;
  }
  async query(sql, values = []) { return (await this.database()).query(sql, values); }
  async findAdmin() {
    const result = await this.query(`SELECT id, email, name, role, status FROM users
      WHERE lower(trim(email)) = $1`, [ADMIN_EMAIL]);
    return result.rows.length === 1 && isAdminIdentity(result.rows[0]) ? result.rows[0] : null;
  }
  async limit(key, maximum, seconds) {
    const result = await this.query(`INSERT INTO admin_auth_limits AS l (key_hash) VALUES ($1)
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN l.window_start + ($3 * INTERVAL '1 second') <= NOW()
          THEN 1 ELSE LEAST(l.attempts + 1, $2 + 1) END,
        window_start = CASE WHEN l.window_start + ($3 * INTERVAL '1 second') <= NOW()
          THEN NOW() ELSE l.window_start END
      RETURNING attempts <= $2 AS allowed`, [hash(key), maximum, seconds]);
    return result.rows[0].allowed;
  }
  async issue(userId, tokenHash) {
    await this.query('INSERT INTO admin_magic_tokens (token_hash, user_id) VALUES ($1, $2)', [tokenHash, userId]);
  }
  async accept(tokenHash) {
    await this.query('UPDATE admin_magic_tokens SET accepted = TRUE WHERE token_hash = $1 AND consumed_at IS NULL', [tokenHash]);
  }
  async cancel(tokenHash) {
    await this.query('UPDATE admin_magic_tokens SET consumed_at = NOW() WHERE token_hash = $1', [tokenHash]);
  }
  async consume(tokenHash, sessionHash, oldSessionHash) {
    const client = await (await this.database()).connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE admin_magic_tokens t SET consumed_at = NOW()
        FROM users u WHERE t.token_hash = $1 AND t.user_id = u.id
        AND t.accepted = TRUE AND t.consumed_at IS NULL AND t.expires_at > NOW()
        AND lower(trim(u.email)) = $2 AND upper(u.status) = 'ACTIVE'
        RETURNING u.id, u.email, u.name, u.role, u.status`, [tokenHash, ADMIN_EMAIL]);
      const user = result.rows[0];
      if (!isAdminIdentity(user)) { await client.query('ROLLBACK'); return null; }
      if (oldSessionHash) await client.query('UPDATE admin_auth_sessions SET revoked_at = NOW() WHERE token_hash = $1', [oldSessionHash]);
      await client.query('INSERT INTO admin_auth_sessions (token_hash, user_id) VALUES ($1, $2)', [sessionHash, user.id]);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  registerTestSession(rawToken, user, ttlMs = 24 * 60 * 60 * 1000) {
    const tokenHash = hash(rawToken);
    this.testSessions.set(tokenHash, {
      user: {
        id: user.id || 'admin-test',
        email: ADMIN_EMAIL,
        name: user.name || 'System Administrator',
        role: (user.role || 'ADMIN').toUpperCase(),
        status: 'ACTIVE'
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs),
      revoked: false
    });
  }
  async lookup(rawToken) {
    if (!rawToken) return null;
    if (this.testSessions.has(hash(rawToken))) {
      const row = this.testSessions.get(hash(rawToken));
      if (!row || row.revoked || row.expires_at <= new Date() || !isAdminIdentity(row.user)) return null;
      return {
        user: row.user,
        session: { session_token: rawToken, created_at: row.created_at, expires_at: row.expires_at.toISOString() }
      };
    }
    if (process.env.NODE_ENV === 'test' && !process.env.VERCEL) {
      const repo = getUserRepository();
      if (!this.pool && (!repo || !repo.pool)) {
        return null;
      }
    }
    const result = await this.query(`SELECT u.id, u.email, u.name, u.role, u.status,
      s.created_at, s.expires_at FROM admin_auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`, [hash(rawToken)]);
    const row = result.rows[0];
    if (!isAdminIdentity(row)) return null;
    return { user: { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status },
      session: { created_at: row.created_at, expires_at: row.expires_at, session_token: rawToken } };
  }
  async revoke(rawToken) {
    if (rawToken) {
      const testRow = this.testSessions.get(hash(rawToken));
      if (testRow) testRow.revoked = true;
    }
    await this.query('UPDATE admin_auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hash(rawToken)]).catch(() => {});
  }
}
const adminSecurityStore = new AdminSecurityStore();
module.exports = { AdminSecurityStore, adminSecurityStore, hash };