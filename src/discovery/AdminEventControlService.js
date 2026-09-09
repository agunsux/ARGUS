/**
 * ARGUS Admin Event Control Service
 * 
 * Operational control center for verifying, merging, resolving conflicts,
 * and managing the lifecycle of events in the Canonical Event Registry.
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { VERIFICATION_STATUS } = require('./EventVerificationService');

class AdminEventControlService {
  /**
   * Returns dashboard overview for trust officers & operators.
   */
  static getControlDashboard() {
    const allEvents = canonicalRegistry.getAllEvents();

    const discovered = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.DISCOVERED);
    const pendingReview = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.PENDING_REVIEW);
    const verified = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.VERIFIED);
    const conflicts = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.DATA_CONFLICT);
    const stale = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.STALE);
    const cancelled = allEvents.filter(e => e.verification_status === VERIFICATION_STATUS.CANCELLED);

    return {
      summary: {
        total_events: allEvents.length,
        discovered_count: discovered.length,
        pending_review_count: pendingReview.length,
        verified_count: verified.length,
        conflicts_count: conflicts.length,
        stale_count: stale.length,
        cancelled_count: cancelled.length
      },
      items: {
        conflicts,
        pending_review: pendingReview,
        stale,
        discovered: discovered.slice(0, 20)
      }
    };
  }

  /**
   * Officer manually verifies an event.
   */
  static verifyEvent(eventId, officerId, notes = '') {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    event.verification_status = VERIFICATION_STATUS.VERIFIED;
    event.verification_confidence = 100;
    event.is_verified = true;
    event.last_verified_at = new Date().toISOString();
    event.updated_at = new Date().toISOString();
    event.verified_by = officerId;
    event.verification_notes = notes;

    return event;
  }

  /**
   * Officer resolves a DATA_CONFLICT by selecting chosen canonical values.
   */
  static resolveConflict(eventId, officerId, chosenFields) {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    if (chosenFields.start_date) {
      event.start_date = chosenFields.start_date;
      event.date = chosenFields.start_date;
    }
    if (chosenFields.venue_name) {
      event.venue_name = chosenFields.venue_name;
      event.venue = chosenFields.venue_name;
    }
    if (chosenFields.city) {
      event.city = chosenFields.city;
      event.venue_city = chosenFields.city;
    }

    event.conflicts = [];
    event.verification_status = VERIFICATION_STATUS.VERIFIED;
    event.verification_confidence = 90;
    event.is_verified = true;
    event.last_verified_at = new Date().toISOString();
    event.updated_at = new Date().toISOString();
    event.resolved_by = officerId;

    return event;
  }

  /**
   * Merges two canonical events into one (e.g., duplicate detected after ingestion).
   */
  static mergeEvents(sourceEventId, targetEventId, officerId) {
    const sourceEvent = canonicalRegistry.getEventById(sourceEventId);
    const targetEvent = canonicalRegistry.getEventById(targetEventId);

    if (!sourceEvent || !targetEvent) {
      throw new Error('Both source and target events must exist to merge');
    }

    // Move source records to target
    for (const src of (sourceEvent.sources || [])) {
      canonicalRegistry.addSourceRecord(targetEvent.event_id, src);
    }

    // Mark source event as merged / blocked
    sourceEvent.verification_status = VERIFICATION_STATUS.BLOCKED;
    sourceEvent.merged_into = targetEvent.event_id;
    sourceEvent.updated_at = new Date().toISOString();

    return {
      merged_canonical_id: targetEvent.event_id,
      retired_canonical_id: sourceEvent.event_id,
      officer: officerId
    };
  }

  /**
   * Cancels an event officially (propagates cancellation to listings).
   */
  static cancelEvent(eventId, officerId, reason = '') {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    event.status = 'CANCELLED';
    event.verification_status = VERIFICATION_STATUS.CANCELLED;
    event.cancellation_reason = reason;
    event.cancelled_by = officerId;
    event.updated_at = new Date().toISOString();

    return event;
  }

  /**
   * Marks an event as STALE for re-verification.
   */
  static markStale(eventId, officerId) {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    event.verification_status = VERIFICATION_STATUS.STALE;
    event.updated_at = new Date().toISOString();
    return event;
  }
}

module.exports = {
  AdminEventControlService
};
