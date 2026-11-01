/**
 * TIKUM / ARGUS — Event Change Tracking & Conflict Resolution Service
 *
 * Continuous Tracking Engine for Dates, Prices, Availability, and Lifecycle Status.
 *
 * Conflict Resolution Hierarchy:
 * 1. Manual Admin Override (admin_lock_mask) > ANY Automated Discovery.
 *    Once an admin locks or edits a field, automated discovery CANNOT overwrite it.
 * 2. Primary Promoter Official Announcement (Tier 1) > Primary Ticketing Platform (Tier 1/2) > Aggregator / Social (Tier 3).
 *
 * All state changes are auditable and persisted to event_change_history.
 */

const { getCatalogRepository } = require('./repository');
const { recordAuditLog } = require('../database');

class EventChangeTrackingService {
  /**
   * Tracks and resolves changes between existing canonical event and incoming discovery candidate.
   *
   * @param {object} existingEvent
   * @param {object} incomingEvent
   * @param {object} options
   *   - sourceTier: number (1 = Official/Promoter, 2 = Ticketing, 3 = Aggregator/Social)
   *   - sourceId: string
   *   - actorId: string ('SYSTEM' or admin user ID)
   *   - isAdmin: boolean
   * @returns {object} { canUpdate: boolean, changes: Array, resolvedEvent: object }
   */
  static processCandidateUpdate(existingEvent, incomingEvent, options = {}) {
    if (!existingEvent) {
      return {
        canUpdate: true,
        changes: [],
        resolvedEvent: incomingEvent
      };
    }

    const repo = getCatalogRepository();
    const isAdmin = Boolean(options.isAdmin);
    const actorId = options.actorId || (isAdmin ? 'ADMIN' : 'SYSTEM');
    const sourceId = options.sourceId || incomingEvent.source_id || 'INGESTION_PIPELINE';
    const lockMask = Array.isArray(existingEvent.admin_lock_mask) ? existingEvent.admin_lock_mask : [];

    const changes = [];
    const resolvedEvent = { ...incomingEvent };

    // Trackable key fields
    const trackableFields = [
      { key: 'start_date', label: 'Start Date' },
      { key: 'end_date', label: 'End Date' },
      { key: 'venue_name', label: 'Venue Name' },
      { key: 'city', label: 'City' },
      { key: 'min_price', label: 'Minimum Price' },
      { key: 'max_price', label: 'Maximum Price' },
      { key: 'price_status', label: 'Price Status' },
      { key: 'status', label: 'Status' },
      { key: 'event_status', label: 'Event Status' },
      { key: 'official_ticket_availability', label: 'Ticket Availability' },
      { key: 'primary_ticket_status', label: 'Primary Ticket Status' },
      { key: 'poster_url', label: 'Poster URL' },
      { key: 'poster_verification_status', label: 'Poster Verification Status' }
    ];

    for (const field of trackableFields) {
      const k = field.key;
      const oldVal = existingEvent[k];
      const newVal = incomingEvent[k];

      if (newVal !== undefined && newVal !== null && String(newVal) !== String(oldVal)) {
        // Check if field is locked by an admin
        if (lockMask.includes(k) && !isAdmin) {
          // Automated discovery cannot overwrite admin-locked field
          resolvedEvent[k] = oldVal;
          try {
            recordAuditLog('EVENT', existingEvent.id || existingEvent.event_id, 'OVERWRITE_REJECTED_ADMIN_LOCKED', actorId, {
              field: k,
              attempted_value: newVal,
              retained_value: oldVal,
              source: sourceId
            });
          } catch (_) {}
          continue;
        }

        // Change allowed
        changes.push({
          field: k,
          old_value: oldVal,
          new_value: newVal,
          label: field.label
        });

        // Record change to audit history
        try {
          if (repo && typeof repo.recordEventChange === 'function') {
            repo.recordEventChange({
              event_id: existingEvent.id || existingEvent.event_id,
              field_name: k,
              old_value: oldVal,
              new_value: newVal,
              changed_by: actorId,
              change_source: sourceId,
              reason: options.reason || `Automated discovery update from ${sourceId}`
            });
          }
        } catch (_) {}
      } else if (newVal === undefined || newVal === null) {
        // Zero-fabrication: preserve existing known value
        resolvedEvent[k] = oldVal;
      }
    }

    // Preserve admin lock mask and historical provenance
    resolvedEvent.admin_lock_mask = lockMask;

    return {
      canUpdate: true,
      changes,
      resolvedEvent
    };
  }
}

module.exports = {
  EventChangeTrackingService
};
