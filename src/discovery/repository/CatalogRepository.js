/**
 * TIKUM / ARGUS — Catalog Repository Interface
 *
 * Abstract contract for Catalog Tier durability.
 * Implementations:
 * - PostgresCatalogRepository (Neon Postgres via pg.Pool)
 * - InMemoryCatalogRepository (Deterministic in-memory adapter for tests)
 */

class CatalogRepository {
  async init() {
    throw new Error('init() must be implemented');
  }

  async getEventById(id) {
    throw new Error('getEventById() must be implemented');
  }

  async getEventBySlug(slug) {
    throw new Error('getEventBySlug() must be implemented');
  }

  async getAllEvents() {
    throw new Error('getAllEvents() must be implemented');
  }

  async getUpcomingEvents(now = new Date()) {
    throw new Error('getUpcomingEvents() must be implemented');
  }

  async getArchivedEvents() {
    throw new Error('getArchivedEvents() must be implemented');
  }

  async upsertCanonicalEvent(eventData) {
    throw new Error('upsertCanonicalEvent() must be implemented');
  }

  async upsertEvent(eventData) {
    return this.upsertCanonicalEvent(eventData);
  }

  async insertEventIfAbsent(eventData) {
    throw new Error('insertEventIfAbsent() must be implemented');
  }

  async attachSourceLink(linkData) {
    throw new Error('attachSourceLink() must be implemented');
  }

  async getSourceLinksForEvent(eventId) {
    throw new Error('getSourceLinksForEvent() must be implemented');
  }

  async recordReconciliationRun(runData) {
    throw new Error('recordReconciliationRun() must be implemented');
  }

  async updateReconciliationRun(id, updateData) {
    throw new Error('updateReconciliationRun() must be implemented');
  }

  async acquireAdvisoryLock(lockId) {
    throw new Error('acquireAdvisoryLock() must be implemented');
  }

  async releaseAdvisoryLock(lockId) {
    throw new Error('releaseAdvisoryLock() must be implemented');
  }

  isDegraded() {
    return false;
  }
}

module.exports = { CatalogRepository };
