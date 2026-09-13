/**
 * TIKUM / ARGUS Event Conflict Model
 * 
 * Formal entity tracking factual discrepancies between two sources reporting on the same canonical event.
 * Never silently overwrites data when sources disagree.
 */

const { v4: uuidv4 } = require('uuid');

const CONFLICT_RESOLUTION_STATUS = {
  UNRESOLVED: 'UNRESOLVED',
  RESOLVED: 'RESOLVED'
};

const CONFLICT_RESOLUTION_METHOD = {
  MANUAL_ADMIN: 'MANUAL_ADMIN',
  AUTHORITY_PRECEDENCE: 'AUTHORITY_PRECEDENCE',
  SOURCE_CORRECTION: 'SOURCE_CORRECTION'
};

class EventConflict {
  constructor(data = {}) {
    this.conflict_id = data.conflict_id || `conf-${uuidv4().substring(0, 10)}`;
    this.event_id = data.event_id || null;
    this.field = data.field || 'unknown'; // 'start_date', 'venue', 'title', 'status', 'ticket_url'
    
    // Source A details
    this.source_a = data.source_a || 'source-a';
    this.value_a = data.value_a !== undefined ? data.value_a : null;
    this.source_a_tier = data.source_a_tier || 2;
    
    // Source B details
    this.source_b = data.source_b || 'source-b';
    this.value_b = data.value_b !== undefined ? data.value_b : null;
    this.source_b_tier = data.source_b_tier || 2;
    
    this.detected_at = data.detected_at || new Date().toISOString();
    this.resolution_status = data.resolution_status || CONFLICT_RESOLUTION_STATUS.UNRESOLVED;
    this.resolution_method = data.resolution_method || null;
    this.resolved_by = data.resolved_by || null;
    this.resolved_at = data.resolved_at || null;
    this.resolution_reason = data.resolution_reason || null;
    this.resolved_value = data.resolved_value !== undefined ? data.resolved_value : null;
  }

  /**
   * Resolves this conflict record.
   */
  resolve({ resolved_by, chosen_value, method = CONFLICT_RESOLUTION_METHOD.MANUAL_ADMIN, reason = '' }) {
    this.resolution_status = CONFLICT_RESOLUTION_STATUS.RESOLVED;
    this.resolved_by = resolved_by || 'admin-1';
    this.resolved_at = new Date().toISOString();
    this.resolved_value = chosen_value;
    this.resolution_method = method;
    this.resolution_reason = reason;
    return this;
  }

  toJSON() {
    return {
      conflict_id: this.conflict_id,
      event_id: this.event_id,
      field: this.field,
      source_a: this.source_a,
      value_a: this.value_a,
      source_a_tier: this.source_a_tier,
      source_b: this.source_b,
      value_b: this.value_b,
      source_b_tier: this.source_b_tier,
      detected_at: this.detected_at,
      resolution_status: this.resolution_status,
      resolution_method: this.resolution_method,
      resolved_by: this.resolved_by,
      resolved_at: this.resolved_at,
      resolution_reason: this.resolution_reason,
      resolved_value: this.resolved_value
    };
  }
}

module.exports = {
  EventConflict,
  CONFLICT_RESOLUTION_STATUS,
  CONFLICT_RESOLUTION_METHOD
};
