/**
 * TIKUM / ARGUS — Shared PostgreSQL Pool & Test-Schema Isolation Helpers
 *
 * Manages normalized connection pools and safe transaction-scoped search_path
 * helpers compatible with Neon PgBouncer poolers as well as direct PostgreSQL.
 */

const { Pool } = require('pg');
const { assertTestDatabaseIsolation } = require('./testIsolation');

const poolCache = new Map();

function normalizeConnectionString(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') return null;
  let cleanConnStr = connectionString.trim();
  if ((cleanConnStr.startsWith('"') && cleanConnStr.endsWith('"')) ||
      (cleanConnStr.startsWith("'") && cleanConnStr.endsWith("'"))) {
    cleanConnStr = cleanConnStr.slice(1, -1).trim();
  }
  try {
    const parsed = new URL(cleanConnStr);
    parsed.searchParams.delete('channel_binding');
    parsed.searchParams.delete('sslmode');
    cleanConnStr = parsed.toString();
  } catch (_) {}
  return cleanConnStr;
}

function sanitizeSchemaName(schema) {
  if (!schema || typeof schema !== 'string') return null;
  const trimmed = schema.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(`Invalid PostgreSQL schema identifier: '${schema}'`);
  }
  return trimmed;
}

async function applyTransactionSchema(client, schema) {
  const safeSchema = sanitizeSchemaName(schema);
  if (!safeSchema || !client) return;
  await client.query(`SET LOCAL search_path TO "${safeSchema}"`);
}

function createConfiguredPool(connectionString, options = {}) {
  const cleanConnStr = normalizeConnectionString(connectionString);
  if (!cleanConnStr) return null;
  const isLocalhost = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');
  const ssl = options.ssl !== undefined ? options.ssl : (isLocalhost ? undefined : { rejectUnauthorized: false });

  const pool = new Pool({
    connectionString: cleanConnStr,
    ssl,
    max: options.max || 5,
    idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 10000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.warn('[SharedPool] Unexpected idle client error:', err.message);
  });

  return pool;
}

function getSharedPool(connectionString = null, options = {}) {
  const targetUrl = connectionString || process.env.TEST_DATABASE_URL || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
  const cleanConnStr = normalizeConnectionString(targetUrl);
  if (!cleanConnStr) return null;

  const cacheKey = cleanConnStr;
  if (!poolCache.has(cacheKey)) {
    const pool = createConfiguredPool(cleanConnStr, options);
    if (pool) poolCache.set(cacheKey, pool);
  }
  return poolCache.get(cacheKey) || null;
}

async function ensureIsolatedSharedPool(connectionString = null, options = {}) {
  const pool = getSharedPool(connectionString, options);
  if (!pool) return null;
  await assertTestDatabaseIsolation(pool, options);
  return pool;
}

async function closeAllSharedPools() {
  const entries = Array.from(poolCache.values());
  poolCache.clear();
  await Promise.allSettled(entries.map(p => p.end()));
}

module.exports = {
  normalizeConnectionString,
  sanitizeSchemaName,
  applyTransactionSchema,
  getSharedPool,
  ensureIsolatedSharedPool,
  closeAllSharedPools
};
