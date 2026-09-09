const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.VERCEL
  ? '/tmp/argus_data'
  : path.resolve(__dirname, '../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const MAX_CONCURRENT_SESSIONS = 3;

class SessionStore {
  static init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(SESSIONS_FILE)) {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]), 'utf8');
      }
    } catch (e) {
      // Fallback for restricted file systems
    }
  }

  static getAll() {
    this.init();
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
        return JSON.parse(raw || '[]');
      }
    } catch (e) {
      // Return empty array on read error
    }
    return [];
  }

  static saveAll(sessions) {
    this.init();
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (e) {
      // Fallback in read-only environment
    }
  }

  /**
   * Creates a server-side session with concurrent limit enforcement (max 3)
   */
  static createSession({ userId, role, ttlMs = 24 * 60 * 60 * 1000, userAgent = null, ip = null }) {
    if (!userId || !role) {
      throw new Error('userId and role are required for session creation');
    }

    const sessions = this.getAll();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Enforce concurrent session limit (max 3 active sessions per user)
    // N+1 revokes the oldest session
    const activeUserSessions = sessions.filter(
      s => s.user_id === userId && !s.revoked && new Date(s.expires_at) > new Date(now)
    );

    if (activeUserSessions.length >= MAX_CONCURRENT_SESSIONS) {
      activeUserSessions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const sessionsToRevoke = activeUserSessions.length - MAX_CONCURRENT_SESSIONS + 1;
      for (let i = 0; i < sessionsToRevoke; i++) {
        activeUserSessions[i].revoked = true;
        activeUserSessions[i].revoked_at = nowIso;
        activeUserSessions[i].revoked_reason = 'CONCURRENT_SESSION_LIMIT';
      }
    }

    const token = `ses-${uuidv4()}`;

    const session = {
      session_token: token,
      user_id: userId,
      role: role,
      user_agent: userAgent,
      ip: ip,
      created_at: nowIso,
      last_active_at: nowIso,
      expires_at: new Date(now + ttlMs).toISOString(),
      revoked: false,
      revoked_at: null,
      revoked_reason: null
    };

    sessions.push(session);
    this.saveAll(sessions);
    return session;
  }

  /**
   * Looks up an active session by token, enforcing server-side expiry and revocation.
   */
  static findSession(token) {
    if (!token) return null;
    const sessions = this.getAll();
    const now = new Date();
    const session = sessions.find(s => s.session_token === token);
    if (!session) return null;
    if (session.revoked) return null;
    if (new Date(session.expires_at) <= now) return null;

    // Touch last active timestamp
    session.last_active_at = now.toISOString();
    this.saveAll(sessions);
    return session;
  }

  /**
   * Revokes a specific session token immediately.
   */
  static revokeSession(token, reason = 'LOGOUT') {
    if (!token) return false;
    const sessions = this.getAll();
    const session = sessions.find(s => s.session_token === token);
    if (session && !session.revoked) {
      session.revoked = true;
      session.revoked_at = new Date().toISOString();
      session.revoked_reason = reason;
      this.saveAll(sessions);
      return true;
    }
    return false;
  }

  /**
   * Invalidates all active sessions for a user, optionally exempting one session.
   * Required after critical actions: password change, bank change, account suspension.
   */
  static invalidateAllSessions(userId, exceptToken = null) {
    if (!userId) return 0;
    const sessions = this.getAll();
    const nowIso = new Date().toISOString();
    let revokedCount = 0;

    for (const session of sessions) {
      if (session.user_id === userId && !session.revoked) {
        if (exceptToken && session.session_token === exceptToken) {
          continue;
        }
        session.revoked = true;
        session.revoked_at = nowIso;
        session.revoked_reason = 'SECURITY_INVALIDATION';
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      this.saveAll(sessions);
    }
    return revokedCount;
  }

  static purgeExpired() {
    const sessions = this.getAll();
    const now = new Date();
    const active = sessions.filter(s => !s.revoked && new Date(s.expires_at) > now);
    this.saveAll(active);
    return sessions.length - active.length;
  }

  static reset() {
    this.saveAll([]);
  }
}

SessionStore.init();

module.exports = { SessionStore, MAX_CONCURRENT_SESSIONS };
