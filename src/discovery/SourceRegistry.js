/**
 * ARGUS Source Registry (Epic: Event Discovery & SEO Engine)
 * 
 * Manages event data sources across Indonesia with strict trust hierarchy:
 * TIER 1: Official organizer, venue, league/federation
 * TIER 2: Established ticketing platforms (tiket.com, Loket, Goers, etc.)
 * TIER 3: Government tourism / event calendars
 * TIER 4: Secondary discovery / media sources
 * TIER 5: Social / community / user submissions
 */

const SOURCE_TYPES = {
  OFFICIAL_ORGANIZER: 'OFFICIAL_ORGANIZER',
  OFFICIAL_VENUE: 'OFFICIAL_VENUE',
  OFFICIAL_TICKETING_PLATFORM: 'OFFICIAL_TICKETING_PLATFORM',
  SPORTS_ORGANIZATION: 'SPORTS_ORGANIZATION',
  GOVERNMENT: 'GOVERNMENT',
  DISCOVERY_PLATFORM: 'DISCOVERY_PLATFORM',
  OTHER: 'OTHER'
};

const TRUST_LEVELS = {
  TIER_1: 'TIER_1', // Organizer, Venue, League/Federation
  TIER_2: 'TIER_2', // Established ticketing platforms (tiket.com, Loket, etc.)
  TIER_3: 'TIER_3', // Government / tourism boards
  TIER_4: 'TIER_4', // Secondary media / blogs
  TIER_5: 'TIER_5'  // User submissions / unverified social
};

const SOURCE_STATUS = {
  ACTIVE: 'ACTIVE',
  DEGRADED: 'DEGRADED',
  INACTIVE: 'INACTIVE'
};

const ACCESS_METHODS = {
  API: 'API',
  FEED: 'FEED',
  CRAWL: 'CRAWL',
  MANUAL: 'MANUAL',
  SUBMISSION: 'SUBMISSION'
};

class SourceRegistry {
  constructor() {
    this.sources = new Map();
    this._initializeDefaultSources();
  }

  _initializeDefaultSources() {
    const defaults = [
      {
        source_id: 'src-tiket-com',
        source_name: 'tiket.com',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.tiket.com/to-do',
        trust_level: TRUST_LEVELS.TIER_2,
        access_method: ACCESS_METHODS.FEED,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Partner API ToS / Structured Public Catalog',
        notes: 'Major OTA & primary ticketing partner for large concerts & attractions'
      },
      {
        source_id: 'src-loket',
        source_name: 'LOKET',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.loket.com',
        trust_level: TRUST_LEVELS.TIER_2,
        access_method: ACCESS_METHODS.FEED,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        notes: 'Major primary ticketing platform for festivals and indie gigs'
      },
      {
        source_id: 'src-goers',
        source_name: 'GOERS',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://goersapp.com',
        trust_level: TRUST_LEVELS.TIER_2,
        access_method: ACCESS_METHODS.FEED,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Key ticketing platform for nightlife, lifestyle, and regional events'
      },
      {
        source_id: 'src-ticket2u',
        source_name: 'Ticket2U',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.ticket2u.id',
        trust_level: TRUST_LEVELS.TIER_2,
        access_method: ACCESS_METHODS.FEED,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Regional and international concert ticketing partner'
      },
      {
        source_id: 'src-org-pk-ent',
        source_name: 'PK Entertainment (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://pk-ent.com',
        trust_level: TRUST_LEVELS.TIER_1,
        access_method: ACCESS_METHODS.MANUAL,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for Coldplay, Ed Sheeran, etc.'
      },
      {
        source_id: 'src-league-ibl',
        source_name: 'IBL Indonesia (Official League)',
        source_type: SOURCE_TYPES.SPORTS_ORGANIZATION,
        base_url: 'https://iblindonesia.com',
        trust_level: TRUST_LEVELS.TIER_1,
        access_method: ACCESS_METHODS.API,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'National basketball league governing body'
      },
      {
        source_id: 'src-venue-gbk',
        source_name: 'PPK GBK (Official Venue Authority)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE,
        base_url: 'https://gbk.id',
        trust_level: TRUST_LEVELS.TIER_1,
        access_method: ACCESS_METHODS.API,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official management body for Gelora Bung Karno sports complex'
      },
      {
        source_id: 'src-argus-community',
        source_name: 'ARGUS Community Submission',
        source_type: SOURCE_TYPES.OTHER,
        base_url: 'https://argus.id',
        trust_level: TRUST_LEVELS.TIER_5,
        access_method: ACCESS_METHODS.SUBMISSION,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Direct crowd submissions requiring operator/evidence verification'
      }
    ];

    for (const src of defaults) {
      this.registerSource(src);
    }
  }

  registerSource(sourceData) {
    if (!sourceData.source_id || !sourceData.source_name) {
      throw new Error('Source must have source_id and source_name');
    }

    const source = {
      source_id: sourceData.source_id,
      source_name: sourceData.source_name,
      source_type: sourceData.source_type || SOURCE_TYPES.OTHER,
      base_url: sourceData.base_url || '',
      trust_level: sourceData.trust_level || TRUST_LEVELS.TIER_5,
      access_method: sourceData.access_method || ACCESS_METHODS.MANUAL,
      last_successful_fetch: sourceData.last_successful_fetch || null,
      last_attempted_fetch: sourceData.last_attempted_fetch || null,
      active_status: sourceData.active_status || SOURCE_STATUS.ACTIVE,
      terms_reference: sourceData.terms_reference || 'Compliant Access Protocol',
      notes: sourceData.notes || '',
      created_at: new Date().toISOString()
    };

    this.sources.set(source.source_id, source);
    return source;
  }

  getSource(sourceId) {
    return this.sources.get(sourceId) || null;
  }

  getAllSources() {
    return Array.from(this.sources.values());
  }

  updateHealth(sourceId, status, { success = false } = {}) {
    const src = this.sources.get(sourceId);
    if (!src) return null;

    const now = new Date().toISOString();
    src.last_attempted_fetch = now;
    if (success) {
      src.last_successful_fetch = now;
      src.active_status = SOURCE_STATUS.ACTIVE;
    } else if (status) {
      src.active_status = status;
    }
    return src;
  }

  reset() {
    this.sources.clear();
    this._initializeDefaultSources();
  }
}

// Singleton instance
const sourceRegistryInstance = new SourceRegistry();

module.exports = {
  SourceRegistry,
  sourceRegistry: sourceRegistryInstance,
  SOURCE_TYPES,
  TRUST_LEVELS,
  SOURCE_STATUS,
  ACCESS_METHODS
};
