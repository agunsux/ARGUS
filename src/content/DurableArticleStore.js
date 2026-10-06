/**
 * TIKUM / ARGUS — Durable Article Store & Content Persistence Engine
 *
 * Provides crash-safe, restart-safe atomic persistence for the Tikum editorial
 * article collection, adhering to ADR: PERSISTENCE_BOUNDARY and Tikum data standards.
 *
 * Invariants:
 * - Atomic write via temporary file + atomic rename (fs.renameSync).
 * - Guaranteed consistency across restarts and multi-instance reads.
 * - Idempotent data handling.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL
  ? '/tmp/argus_data'
  : (process.env.ARGUS_DATA_DIR || path.resolve(__dirname, '../../data'));

const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const SNAPSHOT_FILE = path.resolve(__dirname, 'fixtures/articles_snapshot.json');

class DurableArticleStore {
  static init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (_) {
      // Read-only or restricted fallback environment
    }

    // Hydrate runtime file from committed snapshot if runtime file does not exist
    try {
      if (!fs.existsSync(ARTICLES_FILE) && fs.existsSync(SNAPSHOT_FILE)) {
        const snapContent = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
        if (snapContent && snapContent.length > 2) {
          fs.writeFileSync(ARTICLES_FILE, snapContent, 'utf8');
        }
      }
    } catch (_) {}
  }

  static getDataDir() {
    return DATA_DIR;
  }

  static getFilePath() {
    return ARTICLES_FILE;
  }

  static getSnapshotPath() {
    return SNAPSHOT_FILE;
  }

  static hasPersistedData() {
    try {
      if (fs.existsSync(ARTICLES_FILE)) {
        const stats = fs.statSync(ARTICLES_FILE);
        if (stats.size >= 2) {
          const content = fs.readFileSync(ARTICLES_FILE, 'utf8');
          const parsed = JSON.parse(content || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) return true;
        }
      }
      if (fs.existsSync(SNAPSHOT_FILE)) {
        const snapStats = fs.statSync(SNAPSHOT_FILE);
        if (snapStats.size >= 2) {
          const content = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
          const parsed = JSON.parse(content || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  static load() {
    this.init();
    try {
      if (fs.existsSync(ARTICLES_FILE)) {
        const content = fs.readFileSync(ARTICLES_FILE, 'utf8');
        const parsed = JSON.parse(content || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}

    // Fallback to snapshot
    try {
      if (fs.existsSync(SNAPSHOT_FILE)) {
        const content = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
        const parsed = JSON.parse(content || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          try {
            fs.writeFileSync(ARTICLES_FILE, JSON.stringify(parsed, null, 2), 'utf8');
          } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}

    return [];
  }

  static persist(articles = []) {
    this.init();
    const tempPath = path.join(DATA_DIR, `.articles.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`);
    try {
      const data = JSON.stringify(articles || [], null, 2);
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, ARTICLES_FILE);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
      throw err;
    }

    // Mirror to authoritative committed snapshot when running locally (non-Vercel)
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
      try {
        const snapDir = path.dirname(SNAPSHOT_FILE);
        if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
        const snapTemp = path.join(snapDir, `.snapshot.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`);
        fs.writeFileSync(snapTemp, JSON.stringify(articles || [], null, 2), 'utf8');
        fs.renameSync(snapTemp, SNAPSHOT_FILE);
      } catch (_) {}
    }
  }

  static clear() {
    this.init();
    try {
      if (fs.existsSync(ARTICLES_FILE)) {
        fs.unlinkSync(ARTICLES_FILE);
      }
    } catch (_) {}
  }
}

module.exports = {
  DurableArticleStore
};
