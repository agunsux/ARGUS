/**
 * TIKUM / ARGUS — Catalog Repository Factory & Singleton
 *
 * Automatically provides:
 * - PostgresCatalogRepository if DATABASE_URL is configured
 * - InMemoryCatalogRepository if DATABASE_URL is not set or in test mode without DATABASE_URL
 */

const { CatalogRepository } = require('./CatalogRepository');
const { InMemoryCatalogRepository } = require('./InMemoryCatalogRepository');
const { PostgresCatalogRepository } = require('./PostgresCatalogRepository');

let activeRepository = null;

function getCatalogRepository(forceNew = false) {
  if (activeRepository && !forceNew) {
    return activeRepository;
  }

  if (process.env.NODE_ENV === 'test' && !process.env.TEST_DATABASE_URL) {
    activeRepository = new InMemoryCatalogRepository();
    return activeRepository;
  }

  if (process.env.DATABASE_URL) {
    activeRepository = new PostgresCatalogRepository();
  } else {
    activeRepository = new InMemoryCatalogRepository();
  }

  return activeRepository;
}

function setCatalogRepository(repo) {
  activeRepository = repo;
}

module.exports = {
  CatalogRepository,
  InMemoryCatalogRepository,
  PostgresCatalogRepository,
  getCatalogRepository,
  setCatalogRepository
};
