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

const { MarketplaceRepository } = require('./MarketplaceRepository');
const { InMemoryMarketplaceRepository } = require('./InMemoryMarketplaceRepository');
const { PostgresMarketplaceRepository } = require('./PostgresMarketplaceRepository');

const { MoneyRepository } = require('./MoneyRepository');
const { InMemoryMoneyRepository } = require('./InMemoryMoneyRepository');
const { PostgresMoneyRepository } = require('./PostgresMoneyRepository');

let activeMarketplaceRepo = null;
let activeMoneyRepo = null;

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
  setMoneyRepository
};
