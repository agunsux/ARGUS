/**
 * TIKUM / ARGUS — Unified Storage Repository Factory
 *
 * Provides singletons for:
 * - MarketplaceRepository (Tickets, Listings, Reservations, Deliveries)
 * - MoneyRepository (Orders, Quotes, Payments, Escrows, Settlements, Disputes, Ledger)
 *
 * Automatically instantiates Postgres implementations when DATABASE_URL is present,
 * or InMemory implementations when omitted or degraded.
 */
const fs = require('fs');
const { assertTestDatabaseIsolation } = require('./testIsolation');

// Only load DATABASE_URL from .env.local if NOT running in test mode
if (process.env.NODE_ENV !== 'test' && !process.env.DATABASE_URL && fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('DATABASE_URL=')) {
        let val = line.substring('DATABASE_URL='.length).trim().replace(/['"]/g, '');
        try {
          const u = new URL(val);
          u.searchParams.delete('channel_binding');
          val = u.toString();
        } catch (_) {}
        process.env.DATABASE_URL = val;
        break;
      }
    }
  } catch (_) {}
}

const { MarketplaceRepository } = require('./MarketplaceRepository');
const { InMemoryMarketplaceRepository } = require('./InMemoryMarketplaceRepository');
const { PostgresMarketplaceRepository } = require('./PostgresMarketplaceRepository');

const { MoneyRepository } = require('./MoneyRepository');
const { InMemoryMoneyRepository } = require('./InMemoryMoneyRepository');
const { PostgresMoneyRepository } = require('./PostgresMoneyRepository');

const { UserRepository } = require('./UserRepository');
const { InMemoryUserRepository } = require('./InMemoryUserRepository');
const { PostgresUserRepository } = require('./PostgresUserRepository');

let activeMarketplaceRepo = null;
let activeMoneyRepo = null;
let activeUserRepo = null;

function resolveDatabaseTarget() {
  if (process.env.NODE_ENV === 'test') {
    // In test mode: strictly default to InMemory UNLESS TEST_DATABASE_URL or TEST_DATABASE_SCHEMA is set!
    if (process.env.TEST_DATABASE_URL) {
      return { connectionString: process.env.TEST_DATABASE_URL, schema: process.env.TEST_DATABASE_SCHEMA || null };
    }
    if (process.env.TEST_DATABASE_SCHEMA && process.env.DATABASE_URL) {
      return { connectionString: process.env.DATABASE_URL, schema: process.env.TEST_DATABASE_SCHEMA };
    }
    return null;
  }
  return process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, schema: null } : null;
}

function getMarketplaceRepository(forceNew = false) {
  if (activeMarketplaceRepo && !forceNew) {
    return activeMarketplaceRepo;
  }
  const dbTarget = resolveDatabaseTarget();
  if (dbTarget) {
    activeMarketplaceRepo = new PostgresMarketplaceRepository(dbTarget);
  } else {
    activeMarketplaceRepo = new InMemoryMarketplaceRepository();
  }
  return activeMarketplaceRepo;
}

function setMarketplaceRepository(repo) {
  activeMarketplaceRepo = repo;
}

function getMoneyRepository(forceNew = false) {
  if (activeMoneyRepo && !forceNew) {
    return activeMoneyRepo;
  }
  const dbTarget = resolveDatabaseTarget();
  if (dbTarget) {
    activeMoneyRepo = new PostgresMoneyRepository(dbTarget);
  } else {
    activeMoneyRepo = new InMemoryMoneyRepository();
  }
  return activeMoneyRepo;
}

function setMoneyRepository(repo) {
  activeMoneyRepo = repo;
}

function getUserRepository(forceNew = false) {
  if (activeUserRepo && !forceNew) {
    return activeUserRepo;
  }
  const dbTarget = resolveDatabaseTarget();
  if (dbTarget) {
    activeUserRepo = new PostgresUserRepository(dbTarget);
  } else {
    activeUserRepo = new InMemoryUserRepository();
  }
  return activeUserRepo;
}

function setUserRepository(repo) {
  activeUserRepo = repo;
}

module.exports = {
  MarketplaceRepository,
  InMemoryMarketplaceRepository,
  PostgresMarketplaceRepository,
  getMarketplaceRepository,
  setMarketplaceRepository,

  MoneyRepository,
  InMemoryMoneyRepository,
  PostgresMoneyRepository,
  getMoneyRepository,
  setMoneyRepository,

  UserRepository,
  InMemoryUserRepository,
  PostgresUserRepository,
  getUserRepository,
  setUserRepository,

  assertTestDatabaseIsolation
};
