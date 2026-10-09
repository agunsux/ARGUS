/**
 * TIKUM / ARGUS — Test Database Isolation Gate
 *
 * Guarantees that automated tests NEVER connect to or mutate the shared
 * Neon PostgreSQL database (or public schema) unless explicitly configured
 * with an isolated TEST_DATABASE_URL or isolated TEST_DATABASE_SCHEMA.
 */

async function assertTestDatabaseIsolation(pool, options = {}) {
  if (process.env.NODE_ENV !== 'test') {
    return true;
  }

  const isIsolatedTestUrl = Boolean(process.env.TEST_DATABASE_URL);
  const isIsolatedSchema = Boolean(
    process.env.TEST_DATABASE_SCHEMA &&
    process.env.TEST_DATABASE_SCHEMA.trim().toLowerCase() !== 'public'
  );

  if (!isIsolatedTestUrl && !isIsolatedSchema) {
    throw new Error(
      '[TEST_DATABASE_ISOLATION_VIOLATION] Tests are strictly forbidden from connecting to or mutating the shared database. ' +
      'Set TEST_DATABASE_URL or TEST_DATABASE_SCHEMA to an isolated test environment, or use InMemory repositories.'
    );
  }

  if (pool && typeof pool.query === 'function') {
    try {
      const res = await pool.query('SELECT current_schema(), current_database()');
      const currentSchema = res.rows && res.rows[0] ? res.rows[0].current_schema : null;
      if (!isIsolatedTestUrl && currentSchema === 'public') {
        throw new Error(
          `[TEST_DATABASE_ISOLATION_VIOLATION] Test connected to shared 'public' schema in database '${res.rows[0]?.current_database}'. ` +
          'Test execution against shared public schema is blocked.'
        );
      }
    } catch (e) {
      if (e.message && e.message.includes('TEST_DATABASE_ISOLATION_VIOLATION')) {
        throw e;
      }
    }
  }

  return true;
}

module.exports = {
  assertTestDatabaseIsolation
};
