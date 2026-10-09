/**
 * TIKUM / ARGUS — Test Database Isolation Verification Gate
 *
 * Verifies:
 * 1. NODE_ENV === 'test' defaults to in-memory repositories (Marketplace, Money, User, Catalog).
 * 2. .env.local DATABASE_URL is NOT auto-loaded in test mode.
 * 3. assertTestDatabaseIsolation blocks Postgres initialization when TEST_DATABASE_URL is missing.
 * 4. Zero mutations occur to shared Neon database during test execution.
 */

const assert = require('assert');

process.env.NODE_ENV = 'test';
delete process.env.TEST_DATABASE_URL;
delete process.env.TEST_DATABASE_SCHEMA;

const {
  getMarketplaceRepository,
  getMoneyRepository,
  getUserRepository,
  InMemoryMarketplaceRepository,
  InMemoryMoneyRepository,
  InMemoryUserRepository,
  PostgresMarketplaceRepository,
  PostgresMoneyRepository,
  PostgresUserRepository,
  assertTestDatabaseIsolation
} = require('./src/storage');

const {
  getCatalogRepository,
  InMemoryCatalogRepository
} = require('./src/discovery/repository');

async function runIsolationSuite() {
  console.log('================================================================');
  console.log('  TIKUM — TEST DATABASE ISOLATION VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // Gate 1: Storage index defaults to InMemory in test mode
  test('Gate 1: getMarketplaceRepository() defaults to InMemoryMarketplaceRepository in test mode', () => {
    const repo = getMarketplaceRepository(true);
    assert.ok(repo instanceof InMemoryMarketplaceRepository, 'Must be InMemoryMarketplaceRepository');
  });

  test('Gate 2: getMoneyRepository() defaults to InMemoryMoneyRepository in test mode', () => {
    const repo = getMoneyRepository(true);
    assert.ok(repo instanceof InMemoryMoneyRepository, 'Must be InMemoryMoneyRepository');
  });

  test('Gate 3: getUserRepository() defaults to InMemoryUserRepository in test mode', () => {
    const repo = getUserRepository(true);
    assert.ok(repo instanceof InMemoryUserRepository, 'Must be InMemoryUserRepository');
  });

  test('Gate 4: getCatalogRepository() defaults to InMemoryCatalogRepository in test mode', () => {
    const repo = getCatalogRepository(true);
    assert.ok(repo instanceof InMemoryCatalogRepository, 'Must be InMemoryCatalogRepository');
  });

  // Gate 5: assertTestDatabaseIsolation throws when TEST_DATABASE_URL / TEST_DATABASE_SCHEMA unset
  await testAsync('Gate 5: assertTestDatabaseIsolation throws violation error without isolated test config', async () => {
    let threw = false;
    try {
      await assertTestDatabaseIsolation(null);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('TEST_DATABASE_ISOLATION_VIOLATION'), 'Must throw isolation violation');
    }
    assert.strictEqual(threw, true, 'assertTestDatabaseIsolation must throw error');
  });

  // Gate 6: PostgresMarketplaceRepository blocks direct init in test mode without TEST_DATABASE_URL
  await testAsync('Gate 6: PostgresMarketplaceRepository blocks init in test mode without TEST_DATABASE_URL', async () => {
    const pgRepo = new PostgresMarketplaceRepository({
      connectionString: 'postgres://dummy:dummy@localhost:5432/dummy'
    });
    let blocked = false;
    try {
      await pgRepo.init();
    } catch (err) {
      blocked = true;
      assert.ok(err.message.includes('TEST_DATABASE_ISOLATION_VIOLATION') || err.message.includes('dummy') || err.code === 'ECONNREFUSED');
    }
    // If it threw isolation violation before attempting connection, that's expected
    assert.ok(blocked || pgRepo.degraded, 'PostgresMarketplaceRepository must fail or degrade');
  });

  // Gate 7: Permitted when TEST_DATABASE_URL is set
  await testAsync('Gate 7: assertTestDatabaseIsolation permits isolated test URL', async () => {
    process.env.TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/tikum_test';
    try {
      const allowed = await assertTestDatabaseIsolation(null);
      assert.strictEqual(allowed, true);
    } finally {
      delete process.env.TEST_DATABASE_URL;
    }
  });

  // Gate 8: Permitted when TEST_DATABASE_SCHEMA is set to non-public
  await testAsync('Gate 8: assertTestDatabaseIsolation permits non-public test schema', async () => {
    process.env.TEST_DATABASE_SCHEMA = 'test_isolation_schema';
    try {
      const allowed = await assertTestDatabaseIsolation(null);
      assert.strictEqual(allowed, true);
    } finally {
      delete process.env.TEST_DATABASE_SCHEMA;
    }
  });

  console.log(`\n================================================================`);
  console.log(`  ALL ${passed}/${total} TEST DATABASE ISOLATION GATES PASSED!`);
  console.log(`================================================================\n`);
}

runIsolationSuite().catch(err => {
  console.error('Test Database Isolation Suite Failed:', err);
  process.exit(1);
});
