'use strict';

const { getTodayWibIso } = require('./CatalogHygienePolicy');

// One date per instance, not an unbounded map of simulated dates or query strings.
class CatalogReadCache {
  constructor(read, { ttlMs = 30000, clock = Date.now } = {}) {
    this.read = read;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.invalidate();
  }

  invalidate() { this.entry = null; }

  async get() {
    for (;;) {
      const day = getTodayWibIso(new Date(this.clock()));
      let entry = this.entry;
      if (!entry || entry.day !== day || entry.expires <= this.clock()) {
        entry = { day, expires: Infinity };
        this.entry = entry;
        entry.promise = Promise.resolve().then(this.read).then(value => {
          entry.expires = this.clock() + this.ttlMs;
          return value;
        }).catch(error => {
          if (this.entry === entry) this.invalidate();
          throw error;
        });
      }
      const value = await entry.promise;
      if (this.entry === entry && day === getTodayWibIso(new Date(this.clock()))) {
        // The registry mutates its event objects during freshness reconciliation.
        return structuredClone(value);
      }
    }
  }
}

module.exports = { CatalogReadCache };