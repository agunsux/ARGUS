/**
 * TIKUM / ARGUS — Unified Source Model
 *
 * Implements the authoritative source schema across all live entertainment
 * sources (artists, managements, promoters, event sites, ticketing, venues).
 *
 * PRIORITY HIERARCHY:
 * 1. Official artist / management announcement (Priority 1)
 * 2. Official event website (Priority 2)
 * 3. Official promoter announcement (Priority 3)
 * 4. Official ticketing platform (Priority 4)
 * 5. Venue announcement (Priority 5)
 * 6. Reputable media as secondary corroboration (Priority 6)
 */

const UNIFIED_SOURCE_TYPES = {
  ARTIST: 'ARTIST',
  MANAGEMENT: 'MANAGEMENT',
  PROMOTER: 'PROMOTER',
  OFFICIAL_EVENT: 'OFFICIAL_EVENT',
  TICKETING: 'TICKETING',
  VENUE: 'VENUE',
  MEDIA: 'MEDIA'
};

const DEFAULT_PRIORITY_BY_TYPE = {
  [UNIFIED_SOURCE_TYPES.ARTIST]: 1,
  [UNIFIED_SOURCE_TYPES.MANAGEMENT]: 1,
  [UNIFIED_SOURCE_TYPES.OFFICIAL_EVENT]: 2,
  [UNIFIED_SOURCE_TYPES.PROMOTER]: 3,
  [UNIFIED_SOURCE_TYPES.TICKETING]: 4,
  [UNIFIED_SOURCE_TYPES.VENUE]: 5,
  [UNIFIED_SOURCE_TYPES.MEDIA]: 6
};

class UnifiedSource {
  /**
   * @param {Object} data
   */
  constructor(data = {}) {
    if (!data.source_id) {
      throw new Error('UnifiedSource requires a valid source_id');
    }
    if (!data.source_name && !data.name) {
      throw new Error('UnifiedSource requires a valid source_name');
    }

    this.source_id = String(data.source_id).trim();
    this.source_name = String(data.source_name || data.name).trim();

    // Map legacy or incoming source_type to standardized unified types
    this.source_type = this._normalizeSourceType(data.source_type || data.type);

    this.canonical_url = String(data.canonical_url || data.official_url || data.base_url || '').trim();
    this.supported_event_scope = data.supported_event_scope || data.scope || 'ALL_EVENTS';

    // Priority: 1 (highest) to 6 (lowest)
    this.priority = typeof data.priority === 'number'
      ? data.priority
      : (DEFAULT_PRIORITY_BY_TYPE[this.source_type] || 3);

    this.fetch_method = data.fetch_method || data.access_method || 'PUBLIC_DISCOVERY_ONLY';

    const nowIso = new Date().toISOString();
    this.last_checked_at = data.last_checked_at || nowIso;
    this.last_success_at = data.last_success_at || data.last_successful_sync || nowIso;
    this.last_error = data.last_error || null;

    this.verification_status = data.verification_status || (this.priority <= 3 ? 'VERIFIED' : 'UNVERIFIED');
    this.enabled = data.enabled !== false && data.active !== false;

    // Backward compatibility attributes for existing subsystems
    this.base_url = this.canonical_url;
    this.official_url = this.canonical_url;
    this.tier = data.tier || (this.priority <= 2 ? 1 : (this.priority <= 4 ? 2 : 3));
    this.authority_level = data.authority_level || (this.tier === 1 ? 'HIGH' : (this.tier === 2 ? 'MEDIUM' : 'LOW'));
    this.trust_level = data.trust_level || (this.tier === 1 ? 'TIER_1' : 'TIER_2');
    this.notes = data.notes || '';
  }

  _normalizeSourceType(type) {
    if (!type) return UNIFIED_SOURCE_TYPES.OFFICIAL_EVENT;
    const upper = String(type).toUpperCase();

    if (upper === 'ARTIST' || upper.includes('ARTIST')) return UNIFIED_SOURCE_TYPES.ARTIST;
    if (upper === 'MANAGEMENT' || upper.includes('MANAGEMENT') || upper.includes('ORGANIZER')) return UNIFIED_SOURCE_TYPES.MANAGEMENT;
    if (upper === 'PROMOTER' || upper.includes('PROMOTER')) return UNIFIED_SOURCE_TYPES.PROMOTER;
    if (upper === 'OFFICIAL_EVENT' || upper.includes('EVENT')) return UNIFIED_SOURCE_TYPES.OFFICIAL_EVENT;
    if (upper === 'TICKETING' || upper.includes('TICKET')) return UNIFIED_SOURCE_TYPES.TICKETING;
    if (upper === 'VENUE' || upper.includes('VENUE')) return UNIFIED_SOURCE_TYPES.VENUE;

    return UNIFIED_SOURCE_TYPES.PROMOTER;
  }

  /**
   * Records a fetch cycle result
   * @param {boolean} success
   * @param {string|null} error
   */
  recordCheck(success = true, error = null) {
    const nowIso = new Date().toISOString();
    this.last_checked_at = nowIso;
    if (success) {
      this.last_success_at = nowIso;
      this.last_error = null;
    } else {
      this.last_error = error ? String(error) : 'Unknown ingestion error';
    }
    return this;
  }

  /**
   * Compares precedence against another source. Lower numerical priority = higher precedence.
   * Priority 1 (Artist) > Priority 2 (Official Event) > Priority 3 (Promoter) > Priority 4 (Ticketing)
   */
  takesPrecedenceOver(otherSource) {
    if (!otherSource) return true;
    const otherPriority = typeof otherSource.priority === 'number' ? otherSource.priority : 3;
    return this.priority < otherPriority;
  }

  toJSON() {
    return {
      source_id: this.source_id,
      source_name: this.source_name,
      source_type: this.source_type,
      canonical_url: this.canonical_url,
      supported_event_scope: this.supported_event_scope,
      priority: this.priority,
      fetch_method: this.fetch_method,
      last_checked_at: this.last_checked_at,
      last_success_at: this.last_success_at,
      last_error: this.last_error,
      verification_status: this.verification_status,
      enabled: this.enabled,
      tier: this.tier,
      authority_level: this.authority_level,
      notes: this.notes
    };
  }
}

module.exports = {
  UnifiedSource,
  UNIFIED_SOURCE_TYPES,
  DEFAULT_PRIORITY_BY_TYPE
};
