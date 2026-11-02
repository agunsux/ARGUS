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
const { EventVisualProvenanceService } = require('../EventVisualProvenanceService');

class InMemoryCatalogRepository extends CatalogRepository {
  constructor() {
    super();
    this.events = new Map(); // id -> event
    this.slugMap = new Map(); // slug -> id
    this.sourceLinks = new Map(); // id -> link
    this.snapshots = new Map(); // id -> snapshot
    this.reconciliationRuns = new Map(); // id -> run
    this.locks = new Set(); // active lock IDs
    this.schedulerStates = new Map(); // job_name -> state row
    this.changeHistory = []; // event change audit records
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

  async upsertCanonicalEvent(eventData, options = {}) {
    if (!eventData || (!eventData.id && !eventData.event_id)) {
      throw new Error('Canonical event must have an id or event_id');
    }
    const id = eventData.id || eventData.event_id;
    const existing = this.events.get(id);

    // ADMIN LOCK CONFLICT RESOLUTION:
    // If fields are locked by an admin (admin_lock_mask), automated crawlers cannot overwrite them.
    const effectiveData = { ...eventData };
    if (existing && Array.isArray(existing.admin_lock_mask) && existing.admin_lock_mask.length > 0 && !options.isAdminOverride) {
      for (const lockedField of existing.admin_lock_mask) {
        if (effectiveData[lockedField] !== undefined) {
          effectiveData[lockedField] = existing[lockedField];
        }
      }
    }

    // ANTI-RESURRECTION INVARIANT:
    // If already ARCHIVED or COMPLETED, incoming UPCOMING updates must not resurrect it
    if (existing) {
      const isTerminal = (
        existing.archive_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'COMPLETED' ||
        existing.status === 'ARCHIVED'
      );
      if (isTerminal && (effectiveData.lifecycle_status === 'UPCOMING' || effectiveData.status === 'UPCOMING' || !effectiveData.lifecycle_status)) {
        // Retain archived lifecycle
        effectiveData.archive_status = 'ARCHIVED';
        effectiveData.lifecycle_status = existing.lifecycle_status;
        effectiveData.homepage_visibility = false;
      }
    }

    const preferredImg = existing
      ? EventVisualProvenanceService.selectPreferredImage(existing, effectiveData)
      : EventVisualProvenanceService.resolveCatalogEventImageProvenance(effectiveData, effectiveData.metadata || {});

    // CONTINUOUS TRACKING ENGINE: Track field changes for audit
    if (existing) {
      const trackableFields = ['start_date', 'date', 'venue_name', 'city', 'min_price', 'max_price', 'status', 'event_status', 'ticket_status', 'poster_url', 'image_url', 'poster_verification_status'];
      for (const field of trackableFields) {
        if (effectiveData[field] !== undefined && existing[field] !== undefined && String(effectiveData[field]) !== String(existing[field])) {
          this.recordEventChange({
            event_id: id,
            field_name: field,
            old_value: existing[field],
            new_value: effectiveData[field],
            changed_by: options.changedBy || (options.isAdminOverride ? 'ADMIN' : 'CRAWLER'),
            change_source: options.changeSource || 'INGESTION_PIPELINE',
            reason: options.reason || 'Continuous discovery state update'
          });
        }
      }
    }

    const merged = {
      ...(existing || {}),
      ...effectiveData,
      id,
      ...preferredImg,
      poster_url: effectiveData.poster_url || preferredImg.image_url,
      poster_thumbnail_url: effectiveData.poster_thumbnail_url || preferredImg.thumbnail_url || preferredImg.image_url,
      poster_source_url: effectiveData.poster_source_url || preferredImg.image_source_url,
      poster_attribution: effectiveData.poster_attribution || preferredImg.image_attribution || preferredImg.image_credit,
      poster_verification_status: effectiveData.poster_verification_status || (preferredImg.image_url ? 'VERIFIED_OFFICIAL' : 'PENDING_REVIEW'),
      admin_lock_mask: effectiveData.admin_lock_mask || existing?.admin_lock_mask || [],
      confidence_score: effectiveData.confidence_score !== undefined ? effectiveData.confidence_score : (existing?.confidence_score || 0),
      event_image: preferredImg.image_url,
      metadata: {
        ...(existing?.metadata || {}),
        ...(effectiveData.metadata || {}),
        ...preferredImg
      },
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

  recordEventChange(changeData) {
    const entry = {
      id: changeData.id || `chg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      event_id: changeData.event_id,
      field_name: changeData.field_name,
      old_value: changeData.old_value !== undefined ? String(changeData.old_value) : null,
      new_value: changeData.new_value !== undefined ? String(changeData.new_value) : null,
      changed_by: changeData.changed_by || 'SYSTEM',
      change_source: changeData.change_source || 'CRAWLER',
      reason: changeData.reason || null,
      timestamp: changeData.timestamp || new Date().toISOString()
    };
    this.changeHistory.push(entry);
    return entry;
  }

  getEventChangeHistory(eventId) {
    if (!eventId) return [...this.changeHistory];
    return this.changeHistory.filter(h => h.event_id === eventId);
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

  async acquireJobLease(jobName, leaseOwner, ttlMs = 55000, now = new Date()) {
    const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
    const existing = this.schedulerStates.get(jobName);
    if (existing && existing.lease_expires_at) {
      const expMs = new Date(existing.lease_expires_at).getTime();
      if (expMs > nowMs && existing.lease_owner && existing.lease_owner !== leaseOwner) {
        return { acquired: false, state: existing };
      }
    }
    const nextState = {
      job_name: jobName,
      source_cursor: existing ? existing.source_cursor : 0,
      page_cursor: existing ? existing.page_cursor : 1,
      last_source_id: existing ? existing.last_source_id : null,
      lease_owner: leaseOwner,
      lease_acquired_at: new Date(nowMs).toISOString(),
      lease_expires_at: new Date(nowMs + ttlMs).toISOString(),
      last_run_id: existing ? existing.last_run_id : null,
      last_status: existing ? existing.last_status : null,
      updated_at: new Date(nowMs).toISOString()
    };
    this.schedulerStates.set(jobName, nextState);
    return { acquired: true, state: { ...nextState } };
  }

  async updateJobCursorAndReleaseLease(jobName, leaseOwner, statePatch = {}) {
    const existing = this.schedulerStates.get(jobName) || {
      job_name: jobName,
      source_cursor: 0,
      page_cursor: 1,
      last_source_id: null,
      lease_owner: null,
      lease_acquired_at: null,
      lease_expires_at: null,
      last_run_id: null,
      last_status: null
    };
    const release = statePatch.releaseLease !== false;
    const sourceCursor = statePatch.source_cursor !== undefined ? statePatch.source_cursor : statePatch.sourceCursor;
    const pageCursor = statePatch.page_cursor !== undefined ? statePatch.page_cursor : statePatch.pageCursor;
    const lastSourceId = statePatch.last_source_id !== undefined ? statePatch.last_source_id : statePatch.lastSourceId;
    const lastRunId = statePatch.last_run_id !== undefined ? statePatch.last_run_id : statePatch.lastRunId;
    const lastStatus = statePatch.last_status !== undefined ? statePatch.last_status : statePatch.lastStatus;

    const updated = {
      ...existing,
      source_cursor: sourceCursor !== undefined ? Number(sourceCursor) : existing.source_cursor,
      page_cursor: pageCursor !== undefined ? Number(pageCursor) : existing.page_cursor,
      last_source_id: lastSourceId !== undefined ? lastSourceId : existing.last_source_id,
      last_run_id: lastRunId !== undefined ? lastRunId : existing.last_run_id,
      last_status: lastStatus !== undefined ? lastStatus : existing.last_status,
      lease_owner: release ? null : (leaseOwner || existing.lease_owner),
      lease_expires_at: release ? null : existing.lease_expires_at,
      updated_at: new Date().toISOString()
    };
    this.schedulerStates.set(jobName, updated);
    return { ...updated };
  }

  async getJobSchedulerState(jobName) {
    const existing = this.schedulerStates.get(jobName);
    return existing ? { ...existing } : null;
  }

  isDegraded() {
    return this.degraded;
  }
}

module.exports = { InMemoryCatalogRepository };
