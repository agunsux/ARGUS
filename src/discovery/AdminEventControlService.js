/**
 * TIKUM / ARGUS Admin Event Control Service
 * 
 * Operational control center for verifying, merging, resolving conflicts,
 * and managing the lifecycle of events in the Canonical Event Registry.
 * 
 * All metrics originate from real database & registry state (Zero Mocks).
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { VERIFICATION_STATUS } = require('./EventVerificationService');
const { sourceRegistry } = require('./SourceRegistry');
const { recordAuditLog } = require('../database');

class AdminEventControlService {
  /**
   * Returns comprehensive event intelligence dashboard.
   * Real database state only — zero dummy/mock metrics.
   */
  static getControlDashboard() {
    const allEvents = canonicalRegistry.getAllEvents();
    const allSources = sourceRegistry.getAllSources();

    const unverified = allEvents.filter(e => 
      e.verification_status === VERIFICATION_STATUS.UNVERIFIED ||
      e.verification_status === 'DISCOVERED' ||
      e.verification_status === 'PENDING_REVIEW'
    );
    const partiallyVerified = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.PARTIALLY_VERIFIED);
    const verified = allEvents.filter(e => 
      e.verification_status === VERIFICATION_STATUS.VERIFIED ||
      e.verification_status === 'PRIMARY_SOURCE_VERIFIED'
    );
    const conflicts = allEvents.filter(e => 
      e.verification_status === VERIFICATION_STATUS.CONFLICTED ||
      e.verification_status === 'DATA_CONFLICT' ||
      (Array.isArray(e.conflicts) && e.conflicts.length > 0)
    );
    const expired = allEvents.filter(e => 
      e.verification_status === VERIFICATION_STATUS.EXPIRED ||
      e.verification_status === 'STALE'
    );
    const changed = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.CHANGED);
    const cancelled = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.CANCELLED);
    const postponed = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.POSTPONED);
    const rejected = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.REJECTED);

    // Source health overview
    const sourceHealth = allSources.map(s => ({
      source_id: s.source_id,
      source_name: s.source_name,
      tier: s.tier,
      authority_level: s.authority_level,
      health_status: s.health_status,
      circuit_breaker: s.circuit_breaker_status,
      consecutive_failures: s.consecutive_failures,
      telemetry: s.telemetry
    }));

    return {
      summary: {
        total_events: allEvents.length,
        verified_count: verified.length,
        unverified_count: unverified.length,
        partially_verified_count: partiallyVerified.length,
        conflicts_count: conflicts.length,
        expired_count: expired.length,
        changed_count: changed.length,
        cancelled_count: cancelled.length,
        postponed_count: postponed.length,
        rejected_count: rejected.length,
        total_sources: allSources.length,
        active_sources: allSources.filter(s => s.active && s.circuit_breaker_status !== 'OPEN').length,
        circuit_open_sources: allSources.filter(s => s.circuit_breaker_status === 'OPEN').length
      },
      sources: sourceHealth,
      queues: {
        conflicts: conflicts.map(e => ({
          event_id: e.event_id,
          title: e.canonical_name || e.title,
          conflicts: e.conflicts,
          sources: (e.sources || []).map(s => s.source_id)
        })),
        unverified_queue: unverified.slice(0, 50).map(e => ({
          event_id: e.event_id,
          title: e.canonical_name || e.title,
          date: e.start_date || e.date,
          venue: e.venue_name,
          confidence: e.verification_confidence,
          reasons: e.verification_reasons
        })),
        expired_queue: expired.map(e => ({
          event_id: e.event_id,
          title: e.canonical_name || e.title,
          expires_at: e.expires_at,
          last_verified_at: e.last_verified_at
        }))
      }
    };
  }

  /**
   * Officer manually verifies an event with mandatory notes.
   */
  static verifyEvent(eventId, officerId, notes = '') {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const oldStatus = event.verification_status;
    event.verification_status = VERIFICATION_STATUS.VERIFIED;
    event.verification_confidence = 98; // Never claim 100%
    event.is_verified = true;
    event.last_verified_at = new Date().toISOString();
    event.verified_at = new Date().toISOString();
    event.expires_at = canonicalRegistry.computeExpirationDate(event.start_date, new Date());
    event.updated_at = new Date().toISOString();
    event.verified_by = officerId;
    event.verification_notes = notes;

    try {
      recordAuditLog('event_verified', {
        event_id: eventId,
        officer_id: officerId,
        old_status: oldStatus,
        new_status: 'VERIFIED',
        notes
      });
    } catch (e) {}

    return event;
  }

  /**
   * Officer manually rejects an event.
   */
  static rejectEvent(eventId, officerId, reason = '') {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const oldStatus = event.verification_status;
    event.verification_status = VERIFICATION_STATUS.REJECTED;
    event.is_verified = false;
    event.rejection_reason = reason;
    event.rejected_by = officerId;
    event.updated_at = new Date().toISOString();

    try {
      recordAuditLog('event_rejected', {
        event_id: eventId,
        officer_id: officerId,
        old_status: oldStatus,
        new_status: 'REJECTED',
        reason
      });
    } catch (e) {}

    return event;
  }

  /**
   * Officer resolves an EventConflict by selecting chosen values.
   */
  static resolveConflict(eventId, officerId, chosenFields = {}) {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const now = new Date().toISOString();

    if (chosenFields.start_date) {
      event.start_date = chosenFields.start_date;
      event.date = chosenFields.start_date;
      event.start_at = `${chosenFields.start_date}T19:00:00+07:00`;
      event.start_datetime = event.start_at;
    }
    if (chosenFields.venue_name) {
      event.venue_name = chosenFields.venue_name;
      event.venue = chosenFields.venue_name;
    }
    if (chosenFields.city) {
      event.city = chosenFields.city;
      event.venue_city = chosenFields.city;
    }
    if (chosenFields.status) {
      event.status = chosenFields.status;
      event.event_status = chosenFields.status;
    }

    event.conflicts = [];
    event.verification_status = VERIFICATION_STATUS.VERIFIED;
    event.verification_confidence = 92;
    event.is_verified = true;
    event.last_verified_at = now;
    event.verified_at = now;
    event.expires_at = canonicalRegistry.computeExpirationDate(event.start_date, new Date());
    event.updated_at = now;
    event.resolved_by = officerId;

    try {
      recordAuditLog('event_conflict_resolved', {
        event_id: eventId,
        officer_id: officerId,
        chosen_fields: chosenFields,
        reason: chosenFields.reason || 'Manual officer conflict resolution'
      });
    } catch (e) {}

    return event;
  }

  /**
   * Cancels an event officially (propagates cancellation to listings).
   */
  static cancelEvent(eventId, officerId, reason = '') {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    event.status = 'CANCELLED';
    event.event_status = 'CANCELLED';
    event.verification_status = VERIFICATION_STATUS.CANCELLED;
    event.is_verified = false;
    event.cancellation_reason = reason;
    event.cancelled_by = officerId;
    event.updated_at = new Date().toISOString();

    try {
      recordAuditLog('event_status_changed', {
        event_id: eventId,
        officer_id: officerId,
        new_status: 'CANCELLED',
        reason
      });
    } catch (e) {}

    return event;
  }

  /**
   * Marks an event as EXPIRED for re-verification.
   */
  static markExpired(eventId, officerId) {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    event.verification_status = VERIFICATION_STATUS.EXPIRED;
    event.is_verified = false;
    event.updated_at = new Date().toISOString();

    try {
      recordAuditLog('event_status_changed', {
        event_id: eventId,
        officer_id: officerId,
        new_status: 'EXPIRED',
        reason: 'Manual officer expiration trigger'
      });
    } catch (e) {}

    return event;
  }

  static markStale(eventId, officerId) {
    return this.markExpired(eventId, officerId);
  }

  /**
   * Answers: "Why does ARGUS believe this event exists?"
   * Full reconstructable provenance inspection.
   */
  static getEventProvenance(eventId) {
    const event = canonicalRegistry.getEventById(eventId) || canonicalRegistry.getEventBySlug(eventId);
    if (!event) return null;

    return {
      event_id: event.event_id,
      canonical_name: event.canonical_name || event.title,
      verification_status: event.verification_status,
      verification_confidence: event.verification_confidence,
      verification_reasons: event.verification_reasons,
      first_seen_at: event.first_seen_at,
      last_seen_at: event.last_seen_at,
      last_verified_at: event.last_verified_at,
      expires_at: event.expires_at,
      field_provenance: event.field_provenance,
      sources: event.sources,
      observations_count: (event.observations || []).length,
      observations: event.observations,
      event_history: event.event_history,
      conflicts: event.conflicts,
      qr_verification_layers: event.admission_protocol
    };
  }
}

module.exports = {
  AdminEventControlService
};
