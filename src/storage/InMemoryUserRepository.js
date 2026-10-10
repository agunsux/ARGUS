/**
 * TIKUM / ARGUS — In-Memory User & Authentication Repository
 *
 * Mock implementation used strictly in isolated tests without PostgreSQL.
 */

const crypto = require('crypto');
const { UserRepository } = require('./UserRepository');

class InMemoryUserRepository extends UserRepository {
  constructor() {
    super();
    this.users = new Map();
    this.userRoles = new Map(); // userId -> Set of roles
    this.sessions = new Map();  // tokenHash -> session
    this.auditEvents = [];
    this.initialized = false;
  }

  async ensureInitialized() {
    if (!this.initialized) await this.init();
  }

  async init() {
    this.seedBaseline();
    this.initialized = true;
    return true;
  }

  seedBaseline() {
    const defaultHash = '$2b$12$4S3malXpyvpXvygwPeNE1.Yc6W2iP9APUve9Gi1EqG3Jt39bDUZS.'; // 'pilot123'
    const baseline = [
      { id: 'admin-1', email: 'ops@argus.id', name: 'Trust Officer ARGUS', role: 'ADMIN', password_hash: defaultHash },
      { id: 'seller-1', email: 'budi.seller@example.com', name: 'Budi Santoso', role: 'SELLER', password_hash: defaultHash },
      { id: 'buyer-1', email: 'dewi.buyer@example.com', name: 'Dewi Lestari', role: 'BUYER', password_hash: defaultHash },
      { id: 'buyer-2', email: 'rina.buyer@example.com', name: 'Rina Wijaya', role: 'BUYER', password_hash: defaultHash },
      { id: 'pic-1', email: 'pic.test@argus.id', name: 'Test PIC Officer', role: 'pic', password_hash: defaultHash },
      { id: 'seller-xp-1', email: 'seller-xp-1@test.tikum.app', name: 'Seller Cross-Process', role: 'SELLER', password_hash: defaultHash },
      { id: 'buyer-xp-1', email: 'buyer-xp-1@test.tikum.app', name: 'Buyer Cross-Process', role: 'BUYER', password_hash: defaultHash }
    ];

    for (const u of baseline) {
      if (!this.users.has(u.id)) {
        this.users.set(u.id, {
          ...u,
          display_name: u.name,
          status: 'ACTIVE',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login_at: null
        });
        const roles = new Set([u.role]);
        this.userRoles.set(u.id, roles);
      }
    }
  }

  async createUser(userData) {
    await this.ensureInitialized();
    const id = userData.id || `usr-${crypto.randomUUID()}`;
    const rawEmail = userData.email ? String(userData.email).trim() : null;
    const normEmail = rawEmail ? rawEmail.toLowerCase() : null;
    const rawUsername = userData.username ? String(userData.username).trim() : null;
    const normUsername = rawUsername ? rawUsername.toLowerCase() : null;

    for (const u of this.users.values()) {
      if (normEmail && u.email && u.email.toLowerCase() === normEmail) {
        const err = new Error('User with this email already exists');
        err.code = 'IDENTITY_CONFLICT';
        err.status = 409;
        throw err;
      }
      if (normUsername && u.username && u.username.toLowerCase() === normUsername) {
        const err = new Error('User with this username already exists');
        err.code = 'IDENTITY_CONFLICT';
        err.status = 409;
        throw err;
      }
    }

    const role = (userData.role || 'BUYER').toUpperCase();
    const user = {
      id,
      email: rawEmail,
      username: rawUsername,
      name: userData.name || userData.displayName || 'User',
      display_name: userData.display_name || userData.displayName || userData.name || 'User',
      phone: userData.phone || null,
      role,
      status: (userData.status || 'ACTIVE').toUpperCase(),
      password_hash: userData.password_hash || userData.passwordHash || null,
      metadata: userData.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: null
    };

    this.users.set(id, user);
    this.userRoles.set(id, new Set([role]));
    return user;
  }

  async getUserById(id, includeSecrets = false) {
    await this.ensureInitialized();
    const user = this.users.get(id);
    if (!user) return null;
    if (includeSecrets) return { ...user };
    const { password_hash, ...safe } = user;
    return safe;
  }

  async getUserByEmail(email, includeSecrets = false) {
    await this.ensureInitialized();
    if (!email) return null;
    const norm = String(email).trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase() === norm) {
        if (includeSecrets) return { ...u };
        const { password_hash, ...safe } = u;
        return safe;
      }
    }
    return null;
  }

  async getUserByUsername(username, includeSecrets = false) {
    await this.ensureInitialized();
    if (!username) return null;
    const norm = String(username).trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.username && u.username.toLowerCase() === norm) {
        if (includeSecrets) return { ...u };
        const { password_hash, ...safe } = u;
        return safe;
      }
    }
    return null;
  }

  async updateUser(id, updates) {
    await this.ensureInitialized();
    const user = this.users.get(id);
    if (!user) return null;
    Object.assign(user, updates, { updated_at: new Date().toISOString() });
    return this.getUserById(id);
  }

  async updateUserPassword(id, passwordHash) {
    await this.ensureInitialized();
    const user = this.users.get(id);
    if (!user) return false;
    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
    return true;
  }

  async updateUserStatus(id, status) {
    await this.ensureInitialized();
    const user = this.users.get(id);
    if (!user) return null;
    user.status = status.toUpperCase();
    user.updated_at = new Date().toISOString();
    return { id: user.id, status: user.status };
  }

  async listUsers(filter = {}) {
    await this.ensureInitialized();
    let list = Array.from(this.users.values());
    if (filter.role) {
      list = list.filter(u => (u.role || '').toUpperCase() === filter.role.toUpperCase());
    }
    if (filter.status) {
      list = list.filter(u => (u.status || '').toUpperCase() === filter.status.toUpperCase());
    }
    return list;
  }

  async createSession({ userId, role, ip = null, userAgent = null, ttlMs = 24 * 60 * 60 * 1000, token = null }) {
    await this.ensureInitialized();
    const rawToken = token || `ses-${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    // Enforce concurrent session limit (max 3 active sessions per user)
    const activeSessions = [];
    for (const [h, s] of this.sessions.entries()) {
      if (s.user_id === userId && !s.revoked && new Date(s.expires_at) > now) {
        activeSessions.push(s);
      }
    }
    if (activeSessions.length >= 3) {
      activeSessions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const toRevoke = activeSessions.length - 3 + 1;
      for (let i = 0; i < toRevoke; i++) {
        activeSessions[i].revoked = true;
        activeSessions[i].revoked_at = now.toISOString();
        activeSessions[i].revoked_reason = 'CONCURRENT_SESSION_LIMIT';
      }
    }

    const session = {
      id: `ses-${crypto.randomUUID()}`,
      user_id: userId,
      session_token_hash: tokenHash,
      role: role.toUpperCase(),
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt,
      revoked: false,
      revoked_at: null,
      revoked_reason: null,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString()
    };

    this.sessions.set(tokenHash, session);
    return {
      rawToken,
      session: {
        ...session,
        session_token: rawToken
      }
    };
  }

  async getSessionByTokenHash(tokenHashOrRaw) {
    await this.ensureInitialized();
    if (!tokenHashOrRaw) return null;

    let session = this.sessions.get(tokenHashOrRaw);
    if (!session) {
      const hash = crypto.createHash('sha256').update(tokenHashOrRaw).digest('hex');
      session = this.sessions.get(hash);
    }

    if (!session || session.revoked) return null;
    if (new Date(session.expires_at) <= new Date()) return null;

    const user = this.users.get(session.user_id);
    if (!user || user.status !== 'ACTIVE') return null;

    session.last_seen_at = new Date().toISOString();

    return {
      session: {
        id: session.id,
        user_id: session.user_id,
        role: session.role,
        expires_at: session.expires_at,
        created_at: session.created_at,
        last_seen_at: session.last_seen_at
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        display_name: user.display_name,
        role: user.role,
        status: user.status
      }
    };
  }

  async revokeSession(tokenHashOrRaw, reason = 'LOGOUT') {
    await this.ensureInitialized();
    if (!tokenHashOrRaw) return false;

    let session = this.sessions.get(tokenHashOrRaw);
    if (!session) {
      const hash = crypto.createHash('sha256').update(tokenHashOrRaw).digest('hex');
      session = this.sessions.get(hash);
    }

    if (session && !session.revoked) {
      session.revoked = true;
      session.revoked_at = new Date().toISOString();
      session.revoked_reason = reason;
      return true;
    }
    return false;
  }

  async revokeAllUserSessions(userId, exceptTokenHashOrRaw = null, reason = 'SECURITY_REVOCATION') {
    await this.ensureInitialized();
    let count = 0;
    const exceptHash = exceptTokenHashOrRaw
      ? crypto.createHash('sha256').update(exceptTokenHashOrRaw).digest('hex')
      : null;

    for (const [hash, session] of this.sessions.entries()) {
      if (session.user_id === userId && !session.revoked) {
        if (exceptTokenHashOrRaw && (hash === exceptTokenHashOrRaw || hash === exceptHash)) continue;
        session.revoked = true;
        session.revoked_at = new Date().toISOString();
        session.revoked_reason = reason;
        count++;
      }
    }
    return count;
  }

  async getUserRoles(userId) {
    await this.ensureInitialized();
    const roles = this.userRoles.get(userId);
    return roles ? Array.from(roles) : [];
  }

  async assignUserRole(userId, role, assignedBy = 'SYSTEM') {
    await this.ensureInitialized();
    let roles = this.userRoles.get(userId);
    if (!roles) {
      roles = new Set();
      this.userRoles.set(userId, roles);
    }
    roles.add(role.toUpperCase());
    return { user_id: userId, role: role.toUpperCase(), assigned_by: assignedBy };
  }

  async revokeUserRole(userId, role) {
    await this.ensureInitialized();
    const roles = this.userRoles.get(userId);
    if (roles) {
      return roles.delete(role.toUpperCase());
    }
    return false;
  }

  async recordAuthAudit(auditData) {
    await this.ensureInitialized();
    const record = {
      id: `aae-${crypto.randomUUID()}`,
      user_id: auditData.userId || null,
      event_type: auditData.eventType,
      success: auditData.success !== false,
      ip_address: auditData.ipAddress || null,
      user_agent: auditData.userAgent || null,
      metadata: auditData.metadata || {},
      created_at: new Date().toISOString()
    };
    this.auditEvents.push(record);
    return record;
  }

  reset() {
    this.users.clear();
    this.userRoles.clear();
    this.sessions.clear();
    this.auditEvents = [];
    this.seedBaseline();
  }
}

module.exports = { InMemoryUserRepository };
