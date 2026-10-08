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
if (!process.env.DATABASE_URL && fs.existsSync('.env.local')) {
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

function getMarketplaceRepository(forceNew = false) {
  if (activeMarketplaceRepo && !forceNew) {
    return activeMarketplaceRepo;
  }
  if (process.env.DATABASE_URL) {
    activeMarketplaceRepo = new PostgresMarketplaceRepository();
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
  if (process.env.DATABASE_URL) {
    activeMoneyRepo = new PostgresMoneyRepository();
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
  if (process.env.DATABASE_URL) {
    activeUserRepo = new PostgresUserRepository();
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
  setUserRepository
};
