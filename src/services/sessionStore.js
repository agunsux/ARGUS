const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.VERCEL
  ? '/tmp/argus_data'
  : path.resolve(__dirname, '../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

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

  static createSession({ userId, role, ttlMs = 24 * 60 * 60 * 1000 }) {
    if (!userId || !role) {
      throw new Error('userId and role are required for session creation');
    }

    const sessions = this.getAll();
    const now = Date.now();
    const token = `ses-${uuidv4()}`;

    const session = {
      session_token: token,
      user_id: userId,
      role: role,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlMs).toISOString(),
      revoked: false
    };

    sessions.push(session);
    this.saveAll(sessions);
    return session;
  }

  static findSession(token) {
    if (!token) return null;
    const sessions = this.getAll();
    const now = new Date();
    const session = sessions.find(s => s.session_token === token);
    if (!session) return null;
    if (session.revoked) return null;
    if (new Date(session.expires_at) <= now) return null;
    return session;
  }

  static revokeSession(token) {
    if (!token) return false;
    const sessions = this.getAll();
    const session = sessions.find(s => s.session_token === token);
    if (session) {
      session.revoked = true;
      session.revoked_at = new Date().toISOString();
      this.saveAll(sessions);
      return true;
    }
    return false;
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

module.exports = { SessionStore };

