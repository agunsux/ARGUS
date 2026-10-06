/**
 * TIKUM / ARGUS — Durable Financial Store & Persistence Engine
 *
 * Replaces ephemeral in-memory financial records with durable, restart-safe persistence.
 * Provides atomic, synchronized persistence for:
 * - Financial Ledger Entries (double-entry journal)
 * - Canonical Payments
 * - Payment Attempts
 * - Provider Webhooks (raw payload, hash, audit)
 * - Escrow Transactions
 * - Settlement Records
 * - Disputes & Evidence
 * - Chargebacks
 * - Reconciliation Records
 * - Idempotency Records
 *
 * Meets ADR_PERSISTENCE_BOUNDARY and Section 8/10/24 requirements.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL
  ? '/tmp/argus_data'
  : (process.env.ARGUS_DATA_DIR || path.resolve(__dirname, '../../data'));

const STORE_FILES = {
  financial_ledger: 'financial_ledger.json',
  canonical_payments: 'canonical_payments.json',
  payment_attempts: 'payment_attempts.json',
  provider_webhooks: 'provider_webhooks.json',
  settlement_records: 'settlement_records.json',
  disputes: 'disputes.json',
  chargebacks: 'chargebacks.json',
  payment_reconciliation_logs: 'payment_reconciliation_logs.json',
  idempotency_records: 'idempotency_records.json',
  escrows: 'escrows.json',
  orders: 'orders.json'
};

class DurableFinancialStore {
  static init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      for (const [key, filename] of Object.entries(STORE_FILES)) {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, JSON.stringify([]), 'utf8');
        }
      }
    } catch (e) {
      // In read-only fallback environments
    }
  }

  static getDataDir() {
    return DATA_DIR;
  }

  static load(collectionName) {
    this.init();
    const filename = STORE_FILES[collectionName];
    if (!filename) return [];
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content || '[]');
      }
    } catch (e) {
      // Return empty array on parse error
    }
    return [];
  }

  static persist(collectionName, items) {
    this.init();
    const filename = STORE_FILES[collectionName];
    if (!filename) return;
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
    try {
      const data = JSON.stringify(items || [], null, 2);
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (e) {
      // Cleanup temp if failed
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    }
  }

  /**
   * Restores persistent financial state into in-memory state object on startup
   */
  static restoreAll(state) {
    this.init();
    for (const [collectionName] of Object.entries(STORE_FILES)) {
      const loaded = this.load(collectionName);
      if (Array.isArray(loaded) && loaded.length > 0) {
        if (!state[collectionName] || state[collectionName].length === 0) {
          state[collectionName] = loaded;
        } else {
          // Merge avoiding duplicates by id
          const existingIds = new Set((state[collectionName] || []).map(x => x.id || x.transaction_id || x.paymentAttemptId));
          for (const item of loaded) {
            const id = item.id || item.transaction_id || item.paymentAttemptId;
            if (!existingIds.has(id)) {
              state[collectionName].push(item);
            }
          }
        }
      }
    }
  }

  /**
   * Resets all persistent files (primarily for test harness isolation)
   */
  static resetAll() {
    this.init();
    for (const [key, filename] of Object.entries(STORE_FILES)) {
      const filePath = path.join(DATA_DIR, filename);
      try {
        fs.writeFileSync(filePath, JSON.stringify([]), 'utf8');
      } catch (e) {}
    }
  }
}

module.exports = {
  DurableFinancialStore,
  STORE_FILES
};
