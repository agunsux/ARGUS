/**
 * TIKUM — Admin Activity Notification Durable Store
 * 
 * Persists and queries admin activity alert events across Supabase PostgreSQL
 * and in-memory fallback state.
 */

const { state } = require('../database');

class AdminActivityNotificationStore {
  constructor(pool = null) {
    this._pool = pool;
    this._tableChecked = false;
  }

  getPool() {
    if (!this._pool && process.env.DATABASE_URL) {
      try {
        const { getSharedPool } = require('./connectionPool');
        if (typeof getSharedPool === 'function') {
          this._pool = getSharedPool(process.env.DATABASE_URL);
        }
      } catch (_) {}
      if (!this._pool) {
        try {
          const { Pool } = require('pg');
          this._pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });
        } catch (_) {}
      }
    }
    return this._pool;
  }

  async ensureSchema() {
    if (this._tableChecked || process.env.NODE_ENV === 'test') return;
    const pool = this.getPool();
    if (!pool) return;
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_activity_notifications (
          id VARCHAR(64) PRIMARY KEY,
          event_id VARCHAR(128) UNIQUE NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          priority VARCHAR(16) NOT NULL,
          user_id VARCHAR(64),
          user_email VARCHAR(255),
          recipients TEXT NOT NULL,
          subject VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sent_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON admin_activity_notifications (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_admin_notif_type ON admin_activity_notifications (event_type);
      `);
      this._tableChecked = true;
    } catch (err) {
      console.warn('[AdminActivityStore] Schema check non-critical failure:', err.message);
    }
  }

  async recordNotification({
    id,
    eventId,
    eventType,
    priority,
    userId = null,
    userEmail = null,
    recipients,
    subject,
    payload = {},
    status = 'PENDING',
    lastError = null
  }) {
    const memoryRecord = {
      id,
      event_id: eventId,
      event_type: eventType,
      priority,
      user_id: userId,
      user_email: userEmail,
      recipients: Array.isArray(recipients) ? recipients.join(', ') : String(recipients || ''),
      subject,
      payload,
      status,
      retry_count: 0,
      last_error: lastError,
      created_at: new Date().toISOString(),
      sent_at: status === 'SENT' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    if (!state.admin_activity_notifications) {
      state.admin_activity_notifications = [];
    }
    state.admin_activity_notifications.unshift(memoryRecord);

    const pool = this.getPool();
    if (pool && process.env.NODE_ENV !== 'test') {
      try {
        await this.ensureSchema();
        await pool.query(
          `INSERT INTO admin_activity_notifications 
           (id, event_id, event_type, priority, user_id, user_email, recipients, subject, payload, status, last_error, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (event_id) DO UPDATE SET
             status = EXCLUDED.status,
             last_error = EXCLUDED.last_error,
             sent_at = COALESCE(admin_activity_notifications.sent_at, EXCLUDED.sent_at),
             updated_at = NOW()`,
          [
            id,
            eventId,
            eventType,
            priority,
            userId,
            userEmail,
            memoryRecord.recipients,
            subject,
            JSON.stringify(payload),
            status,
            lastError,
            memoryRecord.sent_at
          ]
        );
      } catch (err) {
        console.warn('[AdminActivityStore] PostgreSQL record error:', err.message);
      }
    }

    return memoryRecord;
  }

  async updateDeliveryStatus(id, { status, sentAt = null, lastError = null, retryCount = 0 }) {
    if (state.admin_activity_notifications) {
      const match = state.admin_activity_notifications.find(r => r.id === id);
      if (match) {
        match.status = status;
        if (sentAt) match.sent_at = sentAt;
        if (lastError !== undefined) match.last_error = lastError;
        if (retryCount !== undefined) match.retry_count = retryCount;
        match.updated_at = new Date().toISOString();
      }
    }

    const pool = this.getPool();
    if (pool && process.env.NODE_ENV !== 'test') {
      try {
        await pool.query(
          `UPDATE admin_activity_notifications
           SET status = $2,
               sent_at = COALESCE($3, sent_at),
               last_error = $4,
               retry_count = $5,
               updated_at = NOW()
           WHERE id = $1`,
          [id, status, sentAt, lastError, retryCount]
        );
      } catch (err) {
        console.warn('[AdminActivityStore] PostgreSQL update error:', err.message);
      }
    }
  }

  async isEventRecorded(eventId) {
    if (!eventId) return false;

    if (state.admin_activity_notifications) {
      const exists = state.admin_activity_notifications.some(r => r.event_id === eventId);
      if (exists) return true;
    }

    const pool = this.getPool();
    if (pool && process.env.NODE_ENV !== 'test') {
      try {
        const res = await pool.query(
          `SELECT 1 FROM admin_activity_notifications WHERE event_id = $1 LIMIT 1`,
          [eventId]
        );
        return res.rows.length > 0;
      } catch (_) {
        return false;
      }
    }

    return false;
  }

  async listRecentNotifications({ limit = 50, eventType = null, status = null } = {}) {
    const pool = this.getPool();
    if (pool && process.env.NODE_ENV !== 'test') {
      try {
        const conditions = [];
        const params = [];

        if (eventType) {
          params.push(eventType);
          conditions.push(`event_type = $${params.length}`);
        }
        if (status) {
          params.push(status);
          conditions.push(`status = $${params.length}`);
        }

        params.push(Math.min(100, Math.max(1, limit)));
        const limitParam = `$${params.length}`;

        const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const res = await pool.query(
          `SELECT * FROM admin_activity_notifications
           ${whereSql}
           ORDER BY created_at DESC
           LIMIT ${limitParam}`,
          params
        );
        return res.rows;
      } catch (err) {
        console.warn('[AdminActivityStore] PostgreSQL list fallback to memory:', err.message);
      }
    }

    // In-memory fallback
    let list = state.admin_activity_notifications || [];
    if (eventType) list = list.filter(r => r.event_type === eventType);
    if (status) list = list.filter(r => r.status === status);
    return list.slice(0, limit);
  }
}

const adminActivityNotificationStore = new AdminActivityNotificationStore();

module.exports = {
  AdminActivityNotificationStore,
  adminActivityNotificationStore
};
