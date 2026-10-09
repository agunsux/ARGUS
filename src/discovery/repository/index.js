/**
 * TIKUM / ARGUS — Catalog Repository Factory & Singleton
 *
 * Automatically provides:
 * - PostgresCatalogRepository if DATABASE_URL is configured
 * - InMemoryCatalogRepository if DATABASE_URL is not set or in test mode without DATABASE_URL
 */

const fs = require('fs');
const { CatalogRepository } = require('./CatalogRepository');
const { InMemoryCatalogRepository } = require('./InMemoryCatalogRepository');
const { PostgresCatalogRepository } = require('./PostgresCatalogRepository');

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
