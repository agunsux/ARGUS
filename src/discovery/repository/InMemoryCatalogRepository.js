/**
 * TIKUM / ARGUS — In-Memory Catalog Repository
 *
 * Deterministic test and offline fallback adapter implementing CatalogRepository.
 * Enforces all domain invariants:
 * - Anti-resurrection (ARCHIVED events cannot be reverted to UPCOMING)
 * - Safe insert-if-absent for seeds
 * - Multi-source provenance linking
 * - Advisory locking simulation
 */

const { CatalogRepository } = require('./CatalogRepository');

class InMemoryCatalogRepository extends CatalogRepository {
  constructor() {
    super();
    this.events = new Map(); // id -> event
    this.slugMap = new Map(); // slug -> id
    this.sourceLinks = new Map(); // id -> link
    this.snapshots = new Map(); // id -> snapshot
    this.reconciliationRuns = new Map(); // id -> run
    this.locks = new Set(); // active lock IDs
    this.initialized = false;
    this.degraded = false;
  }

  async init() {
    this.initialized = true;
    return true;
  }

  async getEventById(id) {
    if (!id) return null;
    return this.events.get(id) || null;
  }

  async getEventBySlug(slug) {
    if (!slug) return null;
    const id = this.slugMap.get(slug);
    return id ? this.events.get(id) || null : null;
  }

  async getAllEvents() {
    return Array.from(this.events.values());
  }

  async getUpcomingEvents(now = new Date()) {
    const nowDateStr = (now instanceof Date ? now : new Date(now)).toISOString().substring(0, 10);
    return Array.from(this.events.values()).filter(e => {
      const isArchived = e.archive_status === 'ARCHIVED' || e.lifecycle_status === 'ARCHIVED';
      if (isArchived) return false;
      const eventDate = e.start_date || (e.start_datetime ? e.start_datetime.substring(0, 10) : null);
      return !eventDate || eventDate >= nowDateStr;
    });
  }

  async getArchivedEvents() {
    return Array.from(this.events.values()).filter(e =>
      e.archive_status === 'ARCHIVED' || e.lifecycle_status === 'ARCHIVED'
    );
  }

  async upsertCanonicalEvent(eventData) {
    if (!eventData || (!eventData.id && !eventData.event_id)) {
      throw new Error('Canonical event must have an id or event_id');
    }
    const id = eventData.id || eventData.event_id;
    const existing = this.events.get(id);

    // ANTI-RESURRECTION INVARIANT:
    // If already ARCHIVED or COMPLETED, incoming UPCOMING updates must not resurrect it
    if (existing) {
      const isTerminal = (
        existing.archive_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'COMPLETED' ||
        existing.status === 'ARCHIVED'
      );
      if (isTerminal && (eventData.lifecycle_status === 'UPCOMING' || eventData.status === 'UPCOMING' || !eventData.lifecycle_status)) {
        // Retain archived lifecycle
        eventData.archive_status = 'ARCHIVED';
        eventData.lifecycle_status = existing.lifecycle_status;
        eventData.homepage_visibility = false;
      }
    }

    const merged = {
      ...(existing || {}),
      ...eventData,
      id,
      updated_at: new Date().toISOString()
    };
    if (!merged.created_at) {
      merged.created_at = new Date().toISOString();
    }

    this.events.set(id, merged);
    if (merged.slug) {
      this.slugMap.set(merged.slug, id);
    }
    return merged;
  }

  async upsertEvent(eventData) {
    return this.upsertCanonicalEvent(eventData);
  }

  async insertEventIfAbsent(eventData) {
    if (!eventData || (!eventData.id && !eventData.event_id)) {
      throw new Error('Event must have id or event_id');
    }
    const id = eventData.id || eventData.event_id;
    if (this.events.has(id)) {
      return { inserted: false, event: this.events.get(id) };
    }
    const event = await this.upsertCanonicalEvent(eventData);
    return { inserted: true, event };
  }

  async attachSourceLink(linkData) {
    if (!linkData || !linkData.event_id || !linkData.source_id) {
      throw new Error('Link requires event_id and source_id');
    }
    const id = linkData.id || `${linkData.event_id}_${linkData.source_id}_${linkData.source_record_id || 'default'}`;
    const link = {
      ...linkData,
      id,
      attached_at: linkData.attached_at || new Date().toISOString()
    };
    this.sourceLinks.set(id, link);
    return link;
  }

  async getSourceLinksForEvent(eventId) {
    return Array.from(this.sourceLinks.values()).filter(l => l.event_id === eventId);
  }

  async recordReconciliationRun(runData) {
    const id = runData.id || `rec-run-${Date.now()}`;
    const run = {
      ...runData,
      id,
      started_at: runData.started_at || new Date().toISOString(),
      status: runData.status || 'RUNNING'
    };
    this.reconciliationRuns.set(id, run);
    return run;
  }

  async updateReconciliationRun(id, updateData) {
    const existing = this.reconciliationRuns.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updateData,
      completed_at: updateData.completed_at || new Date().toISOString()
    };
    this.reconciliationRuns.set(id, updated);
    return updated;
  }

  async acquireAdvisoryLock(lockId) {
    if (this.locks.has(lockId)) {
      return false; // lock held
    }
    this.locks.add(lockId);
    return true;
  }

  async releaseAdvisoryLock(lockId) {
    this.locks.delete(lockId);
    return true;
  }

  isDegraded() {
    return this.degraded;
  }
}

module.exports = { InMemoryCatalogRepository };
