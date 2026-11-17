/**
 * TIKUM / ARGUS — Shared Connection Pool Manager
 *
 * Ensures that all repositories targeting the same database connection string
 * share a single connection pool. This prevents connection pool exhaustion
 * and enables atomic multi-repository transactions via a single database client.
 */

const { Pool } = require('pg');

const pools = new Map();

function normalizeConnectionString(connStr) {
  if (!connStr || typeof connStr !== 'string') return '';
  let clean = connStr.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
  if (clean.startsWith("'") && clean.endsWith("'")) clean = clean.slice(1, -1);
  try {
    const u = new URL(clean);
    u.searchParams.delete('channel_binding');
    u.searchParams.delete('sslmode');
    clean = u.toString();
  } catch (_) {}
  return clean;
}

function getSharedPool(connectionString, poolOptions = {}) {
  const normalized = normalizeConnectionString(connectionString);
  if (!normalized) return null;

  if (pools.has(normalized)) {
    return pools.get(normalized);
  }

  const isLocalhost = normalized.includes('localhost') || normalized.includes('127.0.0.1');
  const ssl = isLocalhost ? undefined : { rejectUnauthorized: false };

  const pool = new Pool({
    connectionString: normalized,
    ssl,
    max: poolOptions.max || 10,
    idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 10000,
    connectionTimeoutMillis: poolOptions.connectionTimeoutMillis || 10000
  });

  pools.set(normalized, pool);
  return pool;
}

async function closeAllPools() {
  for (const [key, pool] of pools.entries()) {
    try {
      await pool.end();
    } catch (_) {}
  }
  pools.clear();
}

module.exports = {
  getSharedPool,
  normalizeConnectionString,
  closeAllPools
};
