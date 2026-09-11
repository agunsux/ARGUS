/**
 * ARGUS Source Registry (Epic: Event Intelligence & Discovery Engine)
 * 
 * Manages event data sources across Indonesia with strict trust hierarchy:
 * TIER S: Official promoter (APMI), venue, artist, league/federation
 * TIER A: Licensed discovery platforms & APIs (Bandsintown, Eventbrite)
 * TIER B: Government tourism / event calendars / verified news
 * TIER C: Secondary marketplaces & community forums (never canonical truth)
 */

const SOURCE_TYPES = {
  OFFICIAL_PROMOTER: 'OFFICIAL_PROMOTER',
  OFFICIAL_ORGANIZER: 'OFFICIAL_ORGANIZER', // backward compatibility
  OFFICIAL_VENUE: 'OFFICIAL_VENUE',
  OFFICIAL_ARTIST: 'OFFICIAL_ARTIST',
  OFFICIAL_TICKETING_PLATFORM: 'OFFICIAL_TICKETING_PLATFORM',
  TICKETING_PLATFORM: 'TICKETING_PLATFORM',
  SPORTS_ORGANIZATION: 'SPORTS_ORGANIZATION',
  GOVERNMENT: 'GOVERNMENT',
  EVENT_DISCOVERY_API: 'EVENT_DISCOVERY_API',
  DISCOVERY_PLATFORM: 'DISCOVERY_PLATFORM',
  EVENT_LISTING: 'EVENT_LISTING',
  NEWS: 'NEWS',
  PROMOTER_OFFICIAL_SOCIAL: 'PROMOTER_OFFICIAL_SOCIAL',
  SOCIAL_SIGNAL: 'SOCIAL_SIGNAL',
  OTHER: 'OTHER'
};

const SOURCE_ROLES = {
  PRIMARY_EVENT_SOURCE: 'PRIMARY_EVENT_SOURCE',
  CORROBORATING_SOURCE: 'CORROBORATING_SOURCE',
  TRANSACTION_SOURCE: 'TRANSACTION_SOURCE',
  DISCOVERY_SIGNAL: 'DISCOVERY_SIGNAL'
};

const AUTHORITY_SCOPES = {
  EVENT: 'EVENT',
  PROMOTER_IDENTITY: 'PROMOTER_IDENTITY',
  TRANSACTION: 'TRANSACTION',
  VENUE: 'VENUE'
};

const TRUST_LEVELS = {
  TIER_S: 'TIER_S', // Official Promoter (APMI), Venue, Artist, League
  TIER_1: 'TIER_1', // Backward compatibility for Tier S
  TIER_A: 'TIER_A', // Licensed Discovery APIs
  TIER_2: 'TIER_2', // Backward compatibility for ticketing platforms
  TIER_B: 'TIER_B', // Government / tourism boards / media
  TIER_3: 'TIER_3', // Backward compatibility
  TIER_4: 'TIER_4', // Secondary media
  TIER_C: 'TIER_C', // Secondary resale
  TIER_5: 'TIER_5'  // User submissions / unverified social
};

const PERMISSION_STATUS = {
  AUTHORIZED_API: 'AUTHORIZED_API',
  LICENSED_DATA: 'LICENSED_DATA',
  PERMITTED_CRAWL: 'PERMITTED_CRAWL',
  PUBLIC_DISCOVERY_ONLY: 'PUBLIC_DISCOVERY_ONLY',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  NOT_ALLOWED: 'NOT_ALLOWED',
  UNKNOWN: 'UNKNOWN'
};

const CRAWL_FREQUENCY = {
  DAILY: 'DAILY',
  EVERY_3_DAYS: 'EVERY_3_DAYS',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY'
};

const SOURCE_STATUS = {
  ACTIVE: 'ACTIVE',
  DEGRADED: 'DEGRADED',
  INACTIVE: 'INACTIVE'
};

const ACCESS_METHODS = {
  API: 'API',
  AUTHORIZED_API: 'AUTHORIZED_API',
  FEED: 'FEED',
  LICENSED_DATA: 'LICENSED_DATA',
  PERMITTED_CRAWL: 'PERMITTED_CRAWL',
  PUBLIC_DISCOVERY_ONLY: 'PUBLIC_DISCOVERY_ONLY',
  CRAWL: 'CRAWL',
  MANUAL: 'MANUAL',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  SUBMISSION: 'SUBMISSION',
  NOT_ALLOWED: 'NOT_ALLOWED',
  UNKNOWN: 'UNKNOWN'
};

class SourceRegistry {
  constructor() {
    this.sources = new Map();
    this._initializeDefaultSources();
  }

  _initializeDefaultSources() {
    const defaults = [
      // APMI Apex Association & Accredited Member Promoters
      {
        source_id: 'src-assoc-apmi',
        source_name: 'APMI (Asosiasi Promotor Musik Indonesia)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://apmi.co.id',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_url: 'https://apmi.co.id',
        robots_url: 'https://apmi.co.id/robots.txt',
        commercial_use_allowed: true,
        scraping_allowed: false,
        attribution_required: true,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official apex music promoter association in Indonesia (https://apmi.co.id/#members)'
      },
      {
        source_id: 'src-promoter-boss-creator',
        source_name: 'Boss Creator (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://bosscreator.id',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Pestapora and prominent Indonesian music festivals'
      },
      {
        source_id: 'src-promoter-antarasuara',
        source_name: 'Antarasuara (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://antarasuara.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Sheila on 7 Tunggu Aku Di Tour, Hindia, Kunto Aji concerts'
      },
      {
        source_id: 'src-promoter-otello-asia',
        source_name: 'Otello Asia (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://otelloasia.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Dewa 19 All Stars Stadium Tours, International Rock Shows'
      },
      {
        source_id: 'src-promoter-plainsong',
        source_name: 'Plainsong Live (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://joylandfest.com',
        country: 'Indonesia',
        coverage: 'BALI_JAKARTA',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Joyland Festival Bali and Jakarta'
      },
      {
        source_id: 'src-promoter-aloka',
        source_name: 'ALOKA (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://aloka.co.id',
        country: 'Indonesia',
        coverage: 'JAKARTA_METRO',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Asian pop tours, K-Pop fan meetings, and international shows'
      },
      {
        source_id: 'src-org-pk-ent',
        source_name: 'PK Entertainment (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://pk-ent.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.MANUAL,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for Coldplay, Ed Sheeran, etc.'
      },
      {
        source_id: 'src-promoter-sound-rh',
        source_name: 'Sound Rhythm (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://soundrhythm.id',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'OneRepublic, Charlie Puth, Kygo Jakarta'
      },
      {
        source_id: 'src-promoter-isb-live',
        source_name: 'Ismaya Live (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        base_url: 'https://ismayalive.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'We The Fest, Djakarta Warehouse Project (DWP)'
      },
      // Ticketing Platforms
      // TIER S: Verified Official Promoter Instagram Sources ("Follow the Promoter")
      {
        source_id: 'src-promoter-antarasuara-instagram',
        source_name: 'Antarasuara (Official Instagram)',
        source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        authority_scope: AUTHORITY_SCOPES.EVENT,
        authority_level: TRUST_LEVELS.TIER_S,
        trust_level: TRUST_LEVELS.TIER_S,
        base_url: 'https://www.instagram.com/antara.suara/',
        account_handle: '@antara.suara',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        commercial_use_allowed: true,
        scraping_allowed: false,
        attribution_required: true,
        priority: 1,
        reliability_score: 1.0,
        active_status: SOURCE_STATUS.ACTIVE,
        account_verified_at: '2026-09-01T00:00:00Z',
        notes: 'Verified Official Promoter Instagram for Antarasuara (APMI Member)'
      },
      {
        source_id: 'src-promoter-bosscreator-instagram',
        source_name: 'Boss Creator (Official Instagram)',
        source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        authority_scope: AUTHORITY_SCOPES.EVENT,
        authority_level: TRUST_LEVELS.TIER_S,
        trust_level: TRUST_LEVELS.TIER_S,
        base_url: 'https://www.instagram.com/boss.creator/',
        account_handle: '@boss.creator',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        commercial_use_allowed: true,
        scraping_allowed: false,
        attribution_required: true,
        priority: 1,
        reliability_score: 1.0,
        active_status: SOURCE_STATUS.ACTIVE,
        account_verified_at: '2026-09-01T00:00:00Z',
        notes: 'Verified Official Promoter Instagram for Boss Creator (APMI Member)'
      },
      {
        source_id: 'src-promoter-otello-asia-instagram',
        source_name: 'Otello Asia (Official Instagram)',
        source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        authority_scope: AUTHORITY_SCOPES.EVENT,
        authority_level: TRUST_LEVELS.TIER_S,
        trust_level: TRUST_LEVELS.TIER_S,
        base_url: 'https://www.instagram.com/otelloasia/',
        account_handle: '@otelloasia',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        commercial_use_allowed: true,
        scraping_allowed: false,
        attribution_required: true,
        priority: 1,
        reliability_score: 1.0,
        active_status: SOURCE_STATUS.ACTIVE,
        account_verified_at: '2026-09-01T00:00:00Z',
        notes: 'Verified Official Promoter Instagram for Otello Asia (APMI Member)'
      },
      {
        source_id: 'src-promoter-plainsong-instagram',
        source_name: 'Plainsong Live (Official Instagram)',
        source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        authority_scope: AUTHORITY_SCOPES.EVENT,
        authority_level: TRUST_LEVELS.TIER_S,
        trust_level: TRUST_LEVELS.TIER_S,
        base_url: 'https://www.instagram.com/joylandfest/',
        account_handle: '@joylandfest',
        country: 'Indonesia',
        coverage: 'BALI_JAKARTA',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        commercial_use_allowed: true,
        scraping_allowed: false,
        attribution_required: true,
        priority: 1,
        reliability_score: 1.0,
        active_status: SOURCE_STATUS.ACTIVE,
        account_verified_at: '2026-09-01T00:00:00Z',
        notes: 'Verified Official Promoter Instagram for Plainsong Live / Joyland (APMI Member)'
      },
      {
        source_id: 'src-tiket-com',
        source_name: 'tiket.com',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.tiket.com/to-do',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Partner API ToS / Structured Public Catalog',
        notes: 'Major OTA & primary ticketing partner for large concerts & attractions'
      },
      {
        source_id: 'src-loket',
        source_name: 'LOKET',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.loket.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        notes: 'Major primary ticketing platform for festivals and indie gigs'
      },
      {
        source_id: 'src-goers',
        source_name: 'GOERS',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://goersapp.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Key ticketing platform for nightlife, lifestyle, and regional events'
      },
      {
        source_id: 'src-ticket2u',
        source_name: 'Ticket2U',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        base_url: 'https://www.ticket2u.id',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Regional and international concert ticketing partner'
      },
      // Sports Leagues & Venues
      {
        source_id: 'src-league-ibl',
        source_name: 'IBL Indonesia (Official League)',
        source_type: SOURCE_TYPES.SPORTS_ORGANIZATION,
        base_url: 'https://iblindonesia.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'SPORTS',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'National basketball league governing body'
      },
      {
        source_id: 'src-venue-gbk',
        source_name: 'PPK GBK (Official Venue Authority)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE,
        base_url: 'https://gbk.id',
        country: 'Indonesia',
        coverage: 'JAKARTA',
        category: 'VENUE',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official management body for Gelora Bung Karno sports complex'
      },
      // Discovery APIs
      {
        source_id: 'src-disc-bandsintown',
        source_name: 'Bandsintown API',
        source_type: SOURCE_TYPES.EVENT_DISCOVERY_API,
        base_url: 'https://bandsintown.com',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        access_method: ACCESS_METHODS.AUTHORIZED_API,
        permission_status: PERMISSION_STATUS.LICENSED_DATA,
        trust_level: TRUST_LEVELS.TIER_A,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Licensed tour discovery database'
      },
      // Community
      {
        source_id: 'src-argus-community',
        source_name: 'ARGUS Community Submission',
        source_type: SOURCE_TYPES.OTHER,
        base_url: 'https://argus.id',
        country: 'Indonesia',
        coverage: 'NATIONAL',
        category: 'OTHER',
        access_method: ACCESS_METHODS.SUBMISSION,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_5,
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
      country: sourceData.country || 'Indonesia',
      coverage: sourceData.coverage || 'NATIONAL',
      category: sourceData.category || 'MUSIC',
      access_method: sourceData.access_method || ACCESS_METHODS.MANUAL,
      permission_status: sourceData.permission_status || PERMISSION_STATUS.MANUAL_REVIEW,
      terms_url: sourceData.terms_url || null,
      robots_url: sourceData.robots_url || null,
      api_url: sourceData.api_url || null,
      commercial_use_allowed: sourceData.commercial_use_allowed !== false,
      scraping_allowed: sourceData.scraping_allowed === true,
      attribution_required: sourceData.attribution_required !== false,
      rate_limit: sourceData.rate_limit || '30 req/min',
      crawl_frequency: sourceData.crawl_frequency || CRAWL_FREQUENCY.DAILY,
      priority: sourceData.priority || 1,
      reliability_score: sourceData.reliability_score || 0.9,
      enabled: sourceData.enabled !== false,
      trust_level: sourceData.trust_level || TRUST_LEVELS.TIER_5,
      active_status: sourceData.active_status || SOURCE_STATUS.ACTIVE,
      circuit_breaker_status: 'CLOSED',
      consecutive_failures: 0,
      last_successful_sync: sourceData.last_successful_sync || null,
      last_failed_sync: sourceData.last_failed_sync || null,
      last_successful_fetch: sourceData.last_successful_fetch || null,
      last_attempted_fetch: sourceData.last_attempted_fetch || null,
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

  isSourcePermittedForIngestion(sourceId) {
    const src = this.getSource(sourceId);
    if (!src || !src.enabled) return false;
    if (src.circuit_breaker_status === 'OPEN') return false;
    if (src.permission_status === PERMISSION_STATUS.NOT_ALLOWED || src.permission_status === PERMISSION_STATUS.UNKNOWN) {
      return false;
    }
    return true;
  }

  updateHealth(sourceId, status, { success = false } = {}) {
    const src = this.sources.get(sourceId);
    if (!src) return null;

    const now = new Date().toISOString();
    src.last_attempted_fetch = now;
    if (success) {
      src.last_successful_fetch = now;
      src.last_successful_sync = now;
      src.active_status = SOURCE_STATUS.ACTIVE;
      src.consecutive_failures = 0;
      src.circuit_breaker_status = 'CLOSED';
    } else {
      src.last_failed_sync = now;
      src.consecutive_failures = (src.consecutive_failures || 0) + 1;
      if (src.consecutive_failures >= 3) {
        src.circuit_breaker_status = 'OPEN';
        src.active_status = SOURCE_STATUS.DEGRADED;
      } else if (status) {
        src.active_status = status;
      }
    }
    return src;
  }

  /**
   * Registers a verified official promoter Instagram social source as Tier S Primary Event Source.
   */
  registerVerifiedPromoterSocial(promoterId, promoterName, handle, profileUrl) {
    const cleanId = (promoterId || '').replace(/^prm-/, '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const sourceId = `src-promoter-${cleanId}-instagram`;
    const record = {
      source_id: sourceId,
      source_name: `${promoterName} (Official Instagram)`,
      source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
      source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
      authority_scope: AUTHORITY_SCOPES.EVENT,
      authority_level: TRUST_LEVELS.TIER_S,
      trust_level: TRUST_LEVELS.TIER_S,
      base_url: profileUrl || `https://www.instagram.com/${(handle || '').replace('@', '')}/`,
      account_handle: handle,
      country: 'Indonesia',
      coverage: 'NATIONAL',
      category: 'MUSIC',
      access_method: ACCESS_METHODS.MANUAL_REVIEW,
      permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
      commercial_use_allowed: true,
      scraping_allowed: false,
      attribution_required: true,
      priority: 1,
      reliability_score: 1.0,
      active_status: SOURCE_STATUS.ACTIVE,
      account_verified_at: new Date().toISOString(),
      notes: `Verified Official Promoter Instagram for ${promoterName}`
    };
    this.sources.set(sourceId, record);
    return record;
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
  SOURCE_ROLES,
  AUTHORITY_SCOPES,
  TRUST_LEVELS,
  SOURCE_STATUS,
  PERMISSION_STATUS,
  CRAWL_FREQUENCY,
  ACCESS_METHODS
};
