/**
 * TIKUM / ARGUS — Postgres User & Authentication Repository
 *
 * Production PostgreSQL implementation of UserRepository.
 * Handles users, durable sessions, roles, and auth audit events.
 *
 * Fail-Closed Invariant: In production (NODE_ENV === 'production' || VERCEL),
 * all operations fail closed if the database pool is unavailable.
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { UserRepository } = require('./UserRepository');
const { InMemoryUserRepository } = require('./InMemoryUserRepository');
const { assertTestDatabaseIsolation } = require('./testIsolation');

const DEFAULT_HASH = '$2b$12$4S3malXpyvpXvygwPeNE1.Yc6W2iP9APUve9Gi1EqG3Jt39bDUZS.'; // 'pilot123'

class PostgresUserRepository extends UserRepository {
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.DATABASE_URL;
    this.pool = null;
    this.fallbackRepo = new InMemoryUserRepository();
    this.degraded = false;
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) {
      if (this.degraded && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
        throw new Error('[UserRepository] Production database is degraded / unavailable.');
      }
      return;
    }
    await this.init();
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
      if (!this.connectionString) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error('[UserRepository] Production configuration error: DATABASE_URL is missing.');
        }
        this.degraded = true;
        await this.fallbackRepo.init();
        this.initialized = true;
        return false;
      }

      try {
        let cleanConnStr = this.connectionString.trim();
        if (cleanConnStr.startsWith('"') && cleanConnStr.endsWith('"')) cleanConnStr = cleanConnStr.slice(1, -1);
        if (cleanConnStr.startsWith("'") && cleanConnStr.endsWith("'")) cleanConnStr = cleanConnStr.slice(1, -1);
        if (cleanConnStr.includes('channel_binding=')) {
          try {
            const u = new URL(cleanConnStr);
            u.searchParams.delete('channel_binding');
            cleanConnStr = u.toString();
          } catch (_) {}
        }

        this.pool = new Pool({
          connectionString: cleanConnStr,
          ssl: cleanConnStr.includes('sslmode=') || cleanConnStr.includes('neon.tech')
            ? { rejectUnauthorized: false }
            : false,
          max: 10,
          idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 30000,
          connectionTimeoutMillis: 10000
        });

        // Test connection
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }

        await assertTestDatabaseIsolation(this.pool);
        await this.runMigrations();
        await this.seedBaselineUsers();

        this.initialized = true;
        this.degraded = false;
        return true;
      } catch (err) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error(`[UserRepository] Production database connection failed: ${err.message}`);
        }
        console.warn(`[UserRepository] DB connection failed, falling back to memory: ${err.message}`);
        this.degraded = true;
        await this.fallbackRepo.init();
        this.initialized = true;
        return false;
      }
    })();
    return this.initPromise;
  }

  async query(text, params = []) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[UserRepository] Database operation rejected while degraded in production.');
      }
      return null;
    }
    return await this.pool.query(text, params);
  }

  async runMigrations() {
    const ddl = `
      -- 1. Users table
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        normalized_email VARCHAR(255) UNIQUE,
        username VARCHAR(100) UNIQUE,
        normalized_username VARCHAR(100) UNIQUE,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        phone VARCHAR(50),
        role VARCHAR(50) NOT NULL DEFAULT 'BUYER',
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        password_hash VARCHAR(255),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (normalized_email);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

      -- 2. User Roles table
      CREATE TABLE IF NOT EXISTS user_roles (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        assigned_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_role UNIQUE (user_id, role)
      );
      CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);

      -- 3. Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash VARCHAR(64) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL,
        ip_address VARCHAR(100),
        user_agent TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(100),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (session_token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (expires_at, revoked);

      -- 4. Auth Audit Events table
      CREATE TABLE IF NOT EXISTS auth_audit_events (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        event_type VARCHAR(100) NOT NULL,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        ip_address VARCHAR(100),
        user_agent TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_events (user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_type ON auth_audit_events (event_type);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit_events (created_at DESC);
    `;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(ddl);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async seedBaselineUsers() {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_SEEDING !== 'true') {
      return false;
    }
    const isProd = process.env.NODE_ENV === 'production';
    const adminPass = process.env.ARGUS_ADMIN_PASSWORD
      ? bcrypt.hashSync(process.env.ARGUS_ADMIN_PASSWORD, 12)
      : (!isProd ? DEFAULT_HASH : null);
    const sellerPass = process.env.ARGUS_SELLER_PASSWORD
      ? bcrypt.hashSync(process.env.ARGUS_SELLER_PASSWORD, 12)
      : (!isProd ? DEFAULT_HASH : null);
    const buyerPass = process.env.ARGUS_BUYER_PASSWORD
      ? bcrypt.hashSync(process.env.ARGUS_BUYER_PASSWORD, 12)
      : (!isProd ? DEFAULT_HASH : null);
    const picPass = process.env.ARGUS_PIC_PASSWORD
      ? bcrypt.hashSync(process.env.ARGUS_PIC_PASSWORD, 12)
      : (!isProd ? DEFAULT_HASH : null);

    const baseline = [
      { id: 'admin-1', email: 'ops@argus.id', name: 'Trust Officer ARGUS', role: 'ADMIN', password_hash: adminPass },
      { id: 'seller-1', email: 'budi.seller@example.com', name: 'Budi Santoso', role: 'SELLER', password_hash: sellerPass },
      { id: 'buyer-1', email: 'dewi.buyer@example.com', name: 'Dewi Lestari', role: 'BUYER', password_hash: buyerPass },
      { id: 'buyer-2', email: 'rina.buyer@example.com', name: 'Rina Wijaya', role: 'BUYER', password_hash: buyerPass },
      { id: 'pic-1', email: 'pic.test@argus.id', name: 'Test PIC Officer', role: 'pic', password_hash: picPass },
      { id: 'seller-xp-1', email: 'seller-xp-1@test.tikum.app', name: 'Seller Cross-Process', role: 'SELLER', password_hash: DEFAULT_HASH },
      { id: 'buyer-xp-1', email: 'buyer-xp-1@test.tikum.app', name: 'Buyer Cross-Process', role: 'BUYER', password_hash: DEFAULT_HASH }
    ];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of baseline) {
        const normEmail = u.email ? u.email.toLowerCase().trim() : null;
        const defaultMeta = (u.id === 'seller-1' || u.id === 'seller-xp-1')
          ? JSON.stringify({
              seller_profile: {
                user_id: u.id,
                kyc_status: 'VERIFIED',
                nik_hash: 'hash-ktp-budi-327101',
                active_listing_limit: 10,
                verified_at: new Date().toISOString(),
                verified_by: 'SYSTEM'
              }
            })
          : JSON.stringify({});
        await client.query(`
          INSERT INTO users (id, email, normalized_email, name, display_name, role, status, password_hash, metadata)
          VALUES ($1, $2, $3, $4, $4, $5, 'ACTIVE', $6, $7::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            role = EXCLUDED.role,
            status = 'ACTIVE',
            metadata = COALESCE(users.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = NOW()
        `, [u.id, u.email, normEmail, u.name, u.role, u.password_hash, defaultMeta]);

        await client.query(`
          INSERT INTO user_roles (id, user_id, role, assigned_by)
          VALUES ($1, $2, $3, 'SYSTEM')
          ON CONFLICT (user_id, role) DO NOTHING
        `, [`ur-${u.id}-${u.role}`, u.id, u.role]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- USER OPERATIONS ---

  async createUser(userData) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.createUser(userData);
    }

    const id = userData.id || `usr-${crypto.randomUUID()}`;
    const rawEmail = userData.email ? String(userData.email).trim() : null;
    const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : null;
    const rawUsername = userData.username ? String(userData.username).trim() : null;
    const normalizedUsername = rawUsername ? rawUsername.toLowerCase() : null;
    const role = (userData.role || 'BUYER').toUpperCase();
    const status = (userData.status || 'ACTIVE').toUpperCase();
    const name = String(userData.name || userData.displayName || rawUsername || normalizedEmail || 'User').trim();
    const displayName = userData.display_name || userData.displayName || name;
    const phone = userData.phone ? String(userData.phone).trim() : null;
    const passwordHash = userData.password_hash || userData.passwordHash || null;
    const metadata = JSON.stringify(userData.metadata || {});

    const sql = `
      INSERT INTO users (
        id, email, normalized_email, username, normalized_username,
        name, display_name, phone, role, status, password_hash, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at;
    `;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(sql, [
        id, rawEmail, normalizedEmail, rawUsername, normalizedUsername,
        name, displayName, phone, role, status, passwordHash, metadata
      ]);
      const user = res.rows[0];

      // Assign initial role in user_roles table
      await client.query(`
        INSERT INTO user_roles (id, user_id, role, assigned_by)
        VALUES ($1, $2, $3, 'SYSTEM')
        ON CONFLICT (user_id, role) DO NOTHING
      `, [`ur-${id}-${role}`, id, role]);

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        const conflictErr = new Error('User with this email or username already exists');
        conflictErr.code = 'IDENTITY_CONFLICT';
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async getUserById(id, includeSecrets = false) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getUserById(id, includeSecrets);
    }

    const sql = includeSecrets
      ? 'SELECT * FROM users WHERE id = $1'
      : 'SELECT id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at, last_login_at FROM users WHERE id = $1';

    const res = await this.query(sql, [id]);
    return res.rows[0] || null;
  }

  async getUserByEmail(email, includeSecrets = false) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getUserByEmail(email, includeSecrets);
    }

    if (!email) return null;
    const norm = String(email).trim().toLowerCase();
    const sql = includeSecrets
      ? 'SELECT * FROM users WHERE normalized_email = $1'
      : 'SELECT id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at, last_login_at FROM users WHERE normalized_email = $1';

    const res = await this.query(sql, [norm]);
    return res.rows[0] || null;
  }

  async getUserByUsername(username, includeSecrets = false) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getUserByUsername(username, includeSecrets);
    }

    if (!username) return null;
    const norm = String(username).trim().toLowerCase();
    const sql = includeSecrets
      ? 'SELECT * FROM users WHERE normalized_username = $1'
      : 'SELECT id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at, last_login_at FROM users WHERE normalized_username = $1';

    const res = await this.query(sql, [norm]);
    return res.rows[0] || null;
  }

  async updateUser(id, updates) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.updateUser(id, updates);
    }

    const fields = [];
    const values = [id];
    let idx = 2;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.display_name !== undefined || updates.displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(updates.display_name || updates.displayName);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(updates.phone);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(updates.role);
    }
    if (updates.last_login_at !== undefined) {
      fields.push(`last_login_at = $${idx++}`);
      values.push(updates.last_login_at);
    }

    if (fields.length === 0) return this.getUserById(id);

    fields.push('updated_at = NOW()');
    const sql = `
      UPDATE users SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at, last_login_at;
    `;
    const res = await this.query(sql, values);
    return res.rows[0] || null;
  }

  async updateUserPassword(id, passwordHash) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.updateUserPassword(id, passwordHash);
    }
    const sql = 'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING id;';
    const res = await this.query(sql, [id, passwordHash]);
    return res.rows.length > 0;
  }

  async updateUserStatus(id, status) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.updateUserStatus(id, status);
    }
    const sql = 'UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status;';
    const res = await this.query(sql, [id, status.toUpperCase()]);
    return res.rows[0] || null;
  }

  async listUsers(filter = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listUsers(filter);
    }
    let sql = 'SELECT id, email, username, name, display_name, phone, role, status, metadata, created_at, updated_at, last_login_at FROM users WHERE 1=1';
    const params = [];
    let idx = 1;
    if (filter.role) {
      sql += ` AND role = $${idx++}`;
      params.push(filter.role.toUpperCase());
    }
    if (filter.status) {
      sql += ` AND status = $${idx++}`;
      params.push(filter.status.toUpperCase());
    }
    sql += ' ORDER BY created_at ASC;';
    const res = await this.query(sql, params);
    return res.rows || [];
  }

  // --- SESSION OPERATIONS ---

  async createSession({ userId, role, ip = null, userAgent = null, ttlMs = 24 * 60 * 60 * 1000, token = null }) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.createSession({ userId, role, ip, userAgent, ttlMs, token });
    }

    const sessionId = `ses-${crypto.randomUUID()}`;
    const rawToken = token || `ses-${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    // Enforce concurrent session limit (max 3 active sessions per user)
    // N+1 revokes the oldest session
    try {
      const activeRes = await this.query(`
        SELECT id, session_token_hash FROM sessions
        WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()
        ORDER BY created_at ASC;
      `, [userId]);

      const activeRows = activeRes ? activeRes.rows : [];
      if (activeRows.length >= 3) {
        const toRevoke = activeRows.length - 3 + 1;
        const idsToRevoke = activeRows.slice(0, toRevoke).map(r => r.id);
        await this.query(`
          UPDATE sessions
          SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'CONCURRENT_SESSION_LIMIT'
          WHERE id = ANY($1::varchar[])
        `, [idsToRevoke]);
      }
    } catch (e) {
      console.warn('[PostgresUserRepository] Concurrency limit warning:', e.message);
    }

    const sql = `
      INSERT INTO sessions (
        id, user_id, session_token_hash, role, ip_address, user_agent, expires_at, created_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' milliseconds')::interval, NOW(), NOW())
      RETURNING id, user_id, role, ip_address, user_agent, expires_at, created_at;
    `;

    const res = await this.query(sql, [sessionId, userId, tokenHash, role, ip, userAgent, ttlMs]);
    return {
      rawToken,
      session: {
        ...res.rows[0],
        session_token: rawToken
      }
    };
  }

  async getSessionByTokenHash(tokenHashOrRaw) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getSessionByTokenHash(tokenHashOrRaw);
    }

    if (!tokenHashOrRaw) return null;

    const hash = crypto.createHash('sha256').update(tokenHashOrRaw).digest('hex');

    const sql = `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.role AS session_role,
        s.expires_at,
        s.revoked,
        s.revoked_at,
        s.created_at AS session_created_at,
        s.last_seen_at,
        u.id,
        u.email,
        u.name,
        u.display_name,
        u.role,
        u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE (s.session_token_hash = $1 OR s.session_token_hash = $2)
      AND s.revoked = FALSE
      AND s.expires_at > NOW();
    `;

    const res = await this.query(sql, [tokenHashOrRaw, hash]);
    const row = res.rows[0];
    if (!row) return null;
    if (new Date(row.expires_at) <= new Date()) return null;

    // Fire-and-forget touch last_seen_at
    this.query('UPDATE sessions SET last_seen_at = NOW() WHERE (session_token_hash = $1 OR session_token_hash = $2)', [tokenHashOrRaw, hash]).catch(() => {});

    return {
      session: {
        id: row.session_id,
        user_id: row.user_id,
        role: row.session_role,
        expires_at: row.expires_at,
        created_at: row.session_created_at,
        last_seen_at: row.last_seen_at
      },
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        display_name: row.display_name,
        role: row.role,
        status: row.status
      }
    };
  }

  async revokeSession(tokenHashOrRaw, reason = 'LOGOUT') {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.revokeSession(tokenHashOrRaw, reason);
    }
    if (!tokenHashOrRaw) return false;
    const hash = crypto.createHash('sha256').update(tokenHashOrRaw).digest('hex');
    const sql = `
      UPDATE sessions
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $3
      WHERE (session_token_hash = $1 OR session_token_hash = $2)
      RETURNING id;
    `;
    const res = await this.query(sql, [tokenHashOrRaw, hash, reason]);
    return res.rows.length > 0;
  }

  async revokeAllUserSessions(userId, exceptTokenHashOrRaw = null, reason = 'SECURITY_REVOCATION') {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.revokeAllUserSessions(userId, exceptTokenHashOrRaw, reason);
    }
    let sql = `
      UPDATE sessions
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
      WHERE user_id = $1 AND revoked = FALSE
    `;
    const params = [userId, reason];
    if (exceptTokenHashOrRaw) {
      const hash = crypto.createHash('sha256').update(exceptTokenHashOrRaw).digest('hex');
      sql += ' AND session_token_hash != $3 AND session_token_hash != $4';
      params.push(exceptTokenHashOrRaw, hash);
    }
    const res = await this.query(sql, params);
    return res.rowCount || 0;
  }

  async listActiveSessionsForUser(userId) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listActiveSessionsForUser(userId);
    }
    const res = await this.query(
      'SELECT id, user_id, role, ip_address, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW() ORDER BY last_seen_at DESC',
      [userId]
    );
    return res ? (res.rows || []) : [];
  }

  // --- ROLE OPERATIONS ---

  async getUserRoles(userId) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getUserRoles(userId);
    }
    const res = await this.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
    return res.rows.map(r => r.role);
  }

  async assignUserRole(userId, role, assignedBy = 'SYSTEM') {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.assignUserRole(userId, role, assignedBy);
    }
    const id = `ur-${userId}-${role.toUpperCase()}`;
    const sql = `
      INSERT INTO user_roles (id, user_id, role, assigned_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, role) DO NOTHING
      RETURNING *;
    `;
    const res = await this.query(sql, [id, userId, role.toUpperCase(), assignedBy]);
    return res.rows[0] || null;
  }

  async revokeUserRole(userId, role) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.revokeUserRole(userId, role);
    }
    const sql = 'DELETE FROM user_roles WHERE user_id = $1 AND role = $2 RETURNING id;';
    const res = await this.query(sql, [userId, role.toUpperCase()]);
    return res.rows.length > 0;
  }

  // --- MAGIC LINK TOKEN DURABILITY ---

  async saveMagicLinkToken(tokenRecord) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.saveMagicLinkToken(tokenRecord);
    }
    if (!tokenRecord || !tokenRecord.token_hash) return null;

    const id = tokenRecord.id || `mlt-${crypto.randomUUID()}`;
    const safeMetadata = {
      id,
      email: String(tokenRecord.email || '').toLowerCase().trim(),
      token_hash: tokenRecord.token_hash,
      created_at: tokenRecord.created_at || new Date().toISOString(),
      expires_at: tokenRecord.expires_at,
      used: Boolean(tokenRecord.used),
      used_at: tokenRecord.used_at || null,
      redirect_url: tokenRecord.redirect_url || '/'
    };

    const eventType = safeMetadata.used ? 'MAGIC_LINK_TOKEN_CONSUMED' : 'MAGIC_LINK_TOKEN_ISSUED';
    const sql = `
      INSERT INTO auth_audit_events (id, user_id, event_type, success, ip_address, user_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        event_type = EXCLUDED.event_type,
        metadata = EXCLUDED.metadata
      RETURNING *;
    `;

    await this.query(sql, [
      id,
      tokenRecord.user_id || null,
      eventType,
      true,
      tokenRecord.ip_address || null,
      tokenRecord.user_agent || null,
      JSON.stringify(safeMetadata)
    ]);

    return safeMetadata;
  }

  async getMagicLinkTokenByHash(tokenHash) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getMagicLinkTokenByHash(tokenHash);
    }
    if (!tokenHash) return null;

    const sql = `
      SELECT id, user_id, event_type, ip_address, user_agent, metadata, created_at,
             ((metadata->>'expires_at')::timestamptz <= NOW()) AS db_expired
      FROM auth_audit_events
      WHERE event_type IN ('MAGIC_LINK_TOKEN_ISSUED', 'MAGIC_LINK_TOKEN_CONSUMED')
        AND metadata->>'token_hash' = $1
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = await this.query(sql, [tokenHash]);
    const row = res && res.rows ? res.rows[0] : null;
    if (!row) return null;

    const meta = row.metadata || {};
    const isUsed = row.event_type === 'MAGIC_LINK_TOKEN_CONSUMED' || Boolean(meta.used);
    return {
      id: meta.id || row.id,
      user_id: row.user_id || meta.user_id || null,
      email: meta.email,
      token_hash: meta.token_hash,
      created_at: meta.created_at || (row.created_at ? new Date(row.created_at).toISOString() : null),
      expires_at: meta.expires_at,
      db_expired: Boolean(row.db_expired),
      used: isUsed,
      used_at: meta.used_at || null,
      ip_address: row.ip_address || null,
      user_agent: row.user_agent || null,
      redirect_url: meta.redirect_url || '/'
    };
  }

  async consumeMagicLinkToken(tokenHash, usedAtIso = new Date().toISOString()) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.consumeMagicLinkToken(tokenHash, usedAtIso);
    }
    if (!tokenHash) return false;

    const sql = `
      UPDATE auth_audit_events
      SET event_type = 'MAGIC_LINK_TOKEN_CONSUMED',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('used', true, 'used_at', COALESCE($2::text, NOW()::text))
      WHERE event_type = 'MAGIC_LINK_TOKEN_ISSUED'
        AND metadata->>'token_hash' = $1
        AND COALESCE((metadata->>'used')::boolean, false) = false
        AND (metadata->>'expires_at') IS NOT NULL
        AND (metadata->>'expires_at')::timestamptz > NOW()
      RETURNING id;
    `;
    const res = await this.query(sql, [tokenHash, usedAtIso]);
    return Boolean(res && res.rows && res.rows.length > 0);
  }

  // --- AUDIT TRAIL ---

  async recordAuthAudit({ userId = null, eventType, success = true, ipAddress = null, userAgent = null, metadata = {} }) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.recordAuthAudit({ userId, eventType, success, ipAddress, userAgent, metadata });
    }
    const id = `aae-${crypto.randomUUID()}`;
    const sql = `
      INSERT INTO auth_audit_events (id, user_id, event_type, success, ip_address, user_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [
        id, userId, eventType, success, ipAddress, userAgent, JSON.stringify(metadata)
      ]);
      return res.rows[0];
    } catch (err) {
      console.error('[AuthAudit] Failed to persist audit event:', err.message);
      return null;
    }
  }

  async listRecentAuthAuditEvents(limit = 100, userId = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listRecentAuthAuditEvents(limit, userId);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    if (userId) {
      const res = await this.query(
        'SELECT id, user_id, event_type, success, ip_address, user_agent, created_at FROM auth_audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, safeLimit]
      );
      return res ? (res.rows || []) : [];
    }
    const res = await this.query(
      'SELECT id, user_id, event_type, success, ip_address, user_agent, created_at FROM auth_audit_events ORDER BY created_at DESC LIMIT $1',
      [safeLimit]
    );
    return res ? (res.rows || []) : [];
  }

  // --- SELLER ONBOARDING & KYC PROFILE (DURABLE IN users.metadata.seller_profile) ---

  async getSellerProfile(userId) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getSellerProfile(userId);
    }
    if (!userId) return null;
    const user = await this.getUserById(userId);
    if (!user) return null;
    const meta = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
    const sp = meta.seller_profile && typeof meta.seller_profile === 'object' ? meta.seller_profile : null;
    if (!sp) return null;

    return {
      user_id: user.id,
      kyc_status: sp.kyc_status || 'UNVERIFIED',
      active_listing_limit: typeof sp.active_listing_limit === 'number' ? sp.active_listing_limit : 10,
      nik_hash: sp.nik_hash || null,
      display_name: sp.display_name || user.display_name || user.name || null,
      payout_bank: sp.payout_bank || null,
      payout_account_masked: sp.payout_account_masked || null,
      requested_at: sp.requested_at || null,
      verified_at: sp.verified_at || null,
      verified_by: sp.verified_by || null,
      rejection_reason: sp.rejection_reason || null,
      suspension_reason: sp.suspension_reason || null,
      updated_at: sp.updated_at || (user.updated_at ? new Date(user.updated_at).toISOString() : null)
    };
  }

  async upsertSellerProfile(userId, profileUpdates = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.upsertSellerProfile(userId, profileUpdates);
    }
    if (!userId) return null;

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: userId,
      ...profileUpdates,
      updated_at: nowIso
    };

    const sql = `
      UPDATE users
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{seller_profile}',
        jsonb_build_object(
          'user_id', $1::text,
          'kyc_status', 'UNVERIFIED',
          'active_listing_limit', 10
        ) || COALESCE(metadata->'seller_profile', '{}'::jsonb) || $2::jsonb,
        true
      ),
      updated_at = NOW()
      WHERE id = $1
      RETURNING id;
    `;
    const res = await this.query(sql, [userId, JSON.stringify(payload)]);
    if (!res || !res.rows || res.rows.length === 0) return null;
    return this.getSellerProfile(userId);
  }

  async listSellerProfiles(filter = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listSellerProfiles(filter);
    }
    let sql = `
      SELECT id, email, name, display_name, role, status, metadata, updated_at
      FROM users
      WHERE (role = 'SELLER' OR (metadata IS NOT NULL AND metadata ? 'seller_profile'))
    `;
    const params = [];
    if (filter.kyc_status) {
      sql += ` AND COALESCE(metadata->'seller_profile'->>'kyc_status', 'UNVERIFIED') = $1`;
      params.push(filter.kyc_status);
    }
    sql += ' ORDER BY updated_at DESC LIMIT 200;';
    const res = await this.query(sql, params);
    const rows = res && res.rows ? res.rows : [];
    return rows.map(u => {
      const sp = u.metadata && u.metadata.seller_profile ? u.metadata.seller_profile : null;
      return {
        user_id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        user_status: u.status,
        kyc_status: sp && sp.kyc_status ? sp.kyc_status : 'UNVERIFIED',
        active_listing_limit: sp && typeof sp.active_listing_limit === 'number' ? sp.active_listing_limit : 10,
        seller_profile: sp ? {
          user_id: u.id,
          kyc_status: sp.kyc_status || 'UNVERIFIED',
          active_listing_limit: typeof sp.active_listing_limit === 'number' ? sp.active_listing_limit : 10,
          nik_hash: sp.nik_hash || null,
          display_name: sp.display_name || u.display_name || u.name || null,
          payout_bank: sp.payout_bank || null,
          payout_account_masked: sp.payout_account_masked || null,
          requested_at: sp.requested_at || null,
          verified_at: sp.verified_at || null,
          verified_by: sp.verified_by || null,
          rejection_reason: sp.rejection_reason || null,
          suspension_reason: sp.suspension_reason || null,
          updated_at: sp.updated_at || (u.updated_at ? new Date(u.updated_at).toISOString() : null)
        } : null
      };
    });
  }
}

module.exports = { PostgresUserRepository };
