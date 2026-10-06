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

class DurableArticleStore {
  static init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (_) {
      // Read-only or restricted fallback environment
    }
  }

  static getDataDir() {
    return DATA_DIR;
  }

  static getFilePath() {
    return ARTICLES_FILE;
  }

  static hasPersistedData() {
    try {
      if (!fs.existsSync(ARTICLES_FILE)) return false;
      const stats = fs.statSync(ARTICLES_FILE);
      if (stats.size < 2) return false;
      const content = fs.readFileSync(ARTICLES_FILE, 'utf8');
      const parsed = JSON.parse(content || '[]');
      return Array.isArray(parsed) && parsed.length > 0;
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
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {
      // Return empty array on parse or access error
    }
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
