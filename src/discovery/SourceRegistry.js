/**
 * TIKUM / ARGUS Source Registry (Epic: Event Supply Intelligence & Verified Ingestion)
 * 
 * Manages event data sources across Indonesia with strict 3-tier trust hierarchy:
 * TIER 1: Primary & Authoritative (Official Promoters, Venues, Primary Ticketing Partners, Leagues)
 * TIER 2: Trusted Commercial (Major Ticketing Platforms, Licensed Discovery APIs, Tourism Calendars)
 * TIER 3: Discovery Signals (Social Channels: Instagram, TikTok, X. Strictly discovery signals — cannot solely verify)
 */

const SOURCE_TYPES = {
  // 4 Approved Authoritative Source Types (with web / IG split)
  OFFICIAL_PROMOTER_WEB: 'OFFICIAL_PROMOTER_WEB',
  OFFICIAL_PROMOTER_IG: 'OFFICIAL_PROMOTER_IG',
  OFFICIAL_ARTIST_WEB: 'OFFICIAL_ARTIST_WEB',
  OFFICIAL_ARTIST_IG: 'OFFICIAL_ARTIST_IG',
  OFFICIAL_EVENT_WEB: 'OFFICIAL_EVENT_WEB',
  OFFICIAL_EVENT_IG: 'OFFICIAL_EVENT_IG',

  // Backward compatibility authoritative aliases
  OFFICIAL_PROMOTER: 'OFFICIAL_PROMOTER',
  OFFICIAL_ORGANIZER: 'OFFICIAL_ORGANIZER', // backward compatibility
  OFFICIAL_ORGANIZER: 'OFFICIAL_ORGANIZER',
  OFFICIAL_VENUE: 'OFFICIAL_VENUE',
  OFFICIAL_ARTIST: 'OFFICIAL_ARTIST',
  OFFICIAL_EVENT: 'OFFICIAL_EVENT',
  OFFICIAL_TICKETING_PLATFORM: 'OFFICIAL_TICKETING_PLATFORM',
  OFFICIAL_TICKETING_PARTNER: 'OFFICIAL_TICKETING_PARTNER',
  OFFICIAL_ORGANIZER_WEB: 'OFFICIAL_ORGANIZER_WEB',
  OFFICIAL_VENUE_WEB: 'OFFICIAL_VENUE_WEB',
  OFFICIAL_EVENT_SOCIAL: 'OFFICIAL_EVENT_SOCIAL',
  OFFICIAL_PROMOTER_INSTAGRAM: 'OFFICIAL_PROMOTER_INSTAGRAM',
  OFFICIAL_ARTIST_INSTAGRAM: 'OFFICIAL_ARTIST_INSTAGRAM',
  OFFICIAL_EVENT_INSTAGRAM: 'OFFICIAL_EVENT_INSTAGRAM',
  PROMOTER_OFFICIAL_SOCIAL: 'PROMOTER_OFFICIAL_SOCIAL',

  // Secondary / Non-Authoritative Sources (Candidate discovery only - NEVER authoritative proof)
  TICKETING_PLATFORM: 'TICKETING_PLATFORM',
  SPORTS_ORGANIZATION: 'SPORTS_ORGANIZATION',
  GOVERNMENT: 'GOVERNMENT',
  EVENT_DISCOVERY_API: 'EVENT_DISCOVERY_API',
  DISCOVERY_PLATFORM: 'DISCOVERY_PLATFORM',
  EVENT_LISTING: 'EVENT_LISTING',
  NEWS: 'NEWS',
  NEWS_BLOG: 'NEWS_BLOG',
  SEARCH_ENGINE: 'SEARCH_ENGINE',
  WIKIPEDIA: 'WIKIPEDIA',
  EVENT_AGGREGATOR: 'EVENT_AGGREGATOR',
  TICKET_AGGREGATOR: 'TICKET_AGGREGATOR',
  GLOBAL_MARKETPLACE_DISCOVERY: 'GLOBAL_MARKETPLACE_DISCOVERY',
  AI_INFERRED: 'AI_INFERRED',
  SOCIAL_SIGNAL: 'SOCIAL_SIGNAL',
  COMMUNITY: 'COMMUNITY',
  COMMUNITY_SUBMISSION: 'COMMUNITY_SUBMISSION',
  UNVERIFIED_SOCIAL: 'UNVERIFIED_SOCIAL',
  OTHER: 'OTHER'
};

const AUTHORITATIVE_SOURCE_TYPES = [
  SOURCE_TYPES.OFFICIAL_PROMOTER_WEB,
  SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
  SOURCE_TYPES.OFFICIAL_ARTIST_WEB,
  SOURCE_TYPES.OFFICIAL_ARTIST_IG,
  SOURCE_TYPES.OFFICIAL_EVENT_WEB,
  SOURCE_TYPES.OFFICIAL_EVENT_IG,
  SOURCE_TYPES.OFFICIAL_ORGANIZER_WEB,
  SOURCE_TYPES.OFFICIAL_VENUE_WEB,
  SOURCE_TYPES.OFFICIAL_EVENT_SOCIAL,
  SOURCE_TYPES.OFFICIAL_PROMOTER_INSTAGRAM,
  SOURCE_TYPES.OFFICIAL_ARTIST_INSTAGRAM,
  SOURCE_TYPES.OFFICIAL_EVENT_INSTAGRAM,
  SOURCE_TYPES.OFFICIAL_PROMOTER,
  SOURCE_TYPES.OFFICIAL_ORGANIZER,
  SOURCE_TYPES.OFFICIAL_ARTIST,
  SOURCE_TYPES.OFFICIAL_EVENT,
  SOURCE_TYPES.OFFICIAL_VENUE,
  SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL
];

const AUTHORITY_RELATIONSHIPS = {
  PRIMARY_AUTHORITY: 'PRIMARY_AUTHORITY',
  OFFICIAL_TICKET_SELLER: 'OFFICIAL_TICKET_SELLER',
  OFFICIAL_PROMOTER: 'OFFICIAL_PROMOTER',
  OFFICIAL_ORGANIZER: 'OFFICIAL_ORGANIZER',
  OFFICIAL_VENUE_OPERATOR: 'OFFICIAL_VENUE_OPERATOR',
  OFFICIAL_ARTIST: 'OFFICIAL_ARTIST',
  TICKETING_PARTNER: 'TICKETING_PARTNER',
  DISCOVERY_CANDIDATE: 'DISCOVERY_CANDIDATE',
  UNVERIFIED: 'UNVERIFIED'
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
  TIER_S: 'TIER_S', // Official Promoter (APMI), Venue, Artist, League (Tier 1)
  TIER_1: 'TIER_1', // Tier 1 Authoritative
  TIER_A: 'TIER_A', // Licensed Discovery APIs (Tier 2)
  TIER_2: 'TIER_2', // Commercial Ticketing Platforms (Tier 2)
  TIER_B: 'TIER_B', // Government / tourism boards / media (Tier 2)
  TIER_3: 'TIER_3', // Secondary media
  TIER_4: 'TIER_4', // Secondary listing
  TIER_C: 'TIER_C', // Resale platforms
  TIER_5: 'TIER_5'  // User submissions / unverified social (Tier 3)
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
  FAILING: 'FAILING',
  INACTIVE: 'INACTIVE',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN'
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
      // ==========================================
      // TIER 1: AUTHORITATIVE PROMOTERS (APMI APEX & MEMBERS)
      // ==========================================
      {
        source_id: 'src-assoc-apmi',
        source_name: 'APMI (Asosiasi Promotor Musik Indonesia)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://apmi.co.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'APMI Official Member Association Feed',
        robots_policy: 'HONOR_ROBOTS_TXT',
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
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://bosscreator.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
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
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://antarasuara.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Sheila on 7 Tunggu Aku Di Tour, Hindia, Kunto Aji concerts'
      },
      {
        source_id: 'src-org-pk-ent',
        source_name: 'PK Entertainment (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://pk-ent.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.MANUAL,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for Coldplay, Ed Sheeran, etc.'
      },
      {
        source_id: 'src-promoter-tem',
        source_name: 'TEM Presents (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://temgmt.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official co-promoter for LANY, Ed Sheeran, Justin Bieber, etc.'
      },
      {
        source_id: 'src-promoter-rajawali',
        source_name: 'Rajawali Indonesia (Official Promoter)',
        source_owner: 'Rajawali Indonesia',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://rajawaliindonesia.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for Prambanan Jazz and international stadium tours'
      },
      {
        source_id: 'src-promoter-ravel',
        source_name: 'Ravel Entertainment (Official Promoter)',
        source_owner: 'Ravel Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://ravelent.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for Hammersonic, Green Day Jakarta, BMTH Jakarta, etc.'
      },
      {
        source_id: 'src-event-hammersonic',
        source_name: 'Hammersonic Festival (Official Website)',
        source_owner: 'Ravel Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://hammersonic.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Festival Website',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.PRIMARY_AUTHORITY,
        notes: 'Official festival website for Hammersonic Festival Jakarta'
      },
      {
        source_id: 'src-promoter-ismaya-live',
        source_name: 'Ismaya Live (Official Promoter / APMI Member)',
        source_owner: 'Ismaya Live',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://ismayalive.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official promoter for DWP (Djakarta Warehouse Project) and We The Fest'
      },
      {
        source_id: 'src-promoter-dyandra-global',
        source_name: 'Dyandra Global Edutainment (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://dyandraglobal.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Major K-Pop promoter: NCT 127, NCT DREAM, aespa, EXO, etc.'
      },
      {
        source_id: 'src-promoter-ime-id',
        source_name: 'iMe Indonesia (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://ime.co.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Major K-Pop and Asian pop promoter: BLACKPINK, Stray Kids, Treasure, etc.'
      },
      {
        source_id: 'src-promoter-mecimapro',
        source_name: 'Mecimapro (MCP) (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://mecimapro.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Major K-Pop promoter: SEVENTEEN, TWICE, Day6, etc.'
      },
      {
        source_id: 'src-promoter-applewood',
        source_name: 'Applewood Indonesia (Official Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://applewood.kr',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'K-Pop and Asian regional tours promoter'
      },
      {
        source_id: 'src-promoter-isb-live',
        source_name: 'Ismaya Live (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://ismayalive.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'We The Fest, Djakarta Warehouse Project (DWP)'
      },
      {
        source_id: 'src-promoter-sound-rh',
        source_name: 'Sound Rhythm (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://soundrhythm.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'OneRepublic, Charlie Puth, Kygo Jakarta'
      },
      {
        source_id: 'src-promoter-otello-asia',
        source_name: 'Otello Asia (Official Promoter / APMI Member)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://otelloasia.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
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
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://joylandfest.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'BALI_JAKARTA',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
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
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://aloka.co.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA_METRO',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official Promoter Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 1,
        reliability_score: 1.0,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Asian pop tours, K-Pop fan meetings, and international shows'
      },
      // ==========================================
      // TIER 1: VENUES & LEAGUES
      // ==========================================
      {
        source_id: 'src-venue-gbk',
        source_name: 'PPK GBK (Official Venue Authority)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://gbk.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'VENUE',
        adapter: 'VenueAdapter',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Venue Authority Public Calendar',
        robots_policy: 'HONOR_ROBOTS_TXT',
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official management body for Gelora Bung Karno sports complex'
      },
      {
        source_id: 'src-league-ibl',
        source_name: 'IBL Indonesia (Official League)',
        source_type: SOURCE_TYPES.SPORTS_ORGANIZATION,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://iblindonesia.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'SPORTS',
        adapter: 'VenueAdapter',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Official League Sports Calendar',
        robots_policy: 'HONOR_ROBOTS_TXT',
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'National basketball league governing body'
      },
      {
        source_id: 'src-argus-verified-seed',
        source_name: 'ARGUS Curated Seed Verification',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://tikum.app',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        terms_reference: 'Internal Verified Institutional Seed Database',
        robots_policy: 'INTERNAL',
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Curated ground truth seed events'
      },
      // ==========================================
      // TIER 2: TRUSTED COMMERCIAL & TICKETING PLATFORMS
      // ==========================================
      {
        source_id: 'src-tiket-com',
        source_name: 'tiket.com',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.tiket.com/to-do',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'TiketComAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Partner API ToS / Structured Public Catalog',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Major OTA & primary ticketing partner for large concerts & attractions'
      },
      {
        source_id: 'src-loket',
        source_name: 'LOKET',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.loket.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'LoketAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Major primary ticketing platform for festivals and indie gigs'
      },
      {
        source_id: 'src-goers',
        source_name: 'GOERS',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://goersapp.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'GoersAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Key ticketing platform for nightlife, lifestyle, and regional events'
      },
      {
        source_id: 'src-dewatiket',
        source_name: 'Dewatiket',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://dewatiket.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'CENTRAL_AND_EAST_JAVA',
        category: 'MUSIC',
        adapter: 'DewatiketAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Partner / Structured Public Event Catalog',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Ticketing platform across Solo, Yogyakarta, Semarang, and East Java'
      },
      {
        source_id: 'src-yesplis',
        source_name: 'Yesplis',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://yesplis.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAVA_BALI',
        category: 'MUSIC',
        adapter: 'YesplisAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Major ticketing platform for indie music gigs and regional festivals in Java & Bali'
      },
      {
        source_id: 'src-artatix',
        source_name: 'Artatix',
        source_type: SOURCE_TYPES.OFFICIAL_TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://artatix.co.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'DIY_CENTRAL_JAVA',
        category: 'MUSIC',
        adapter: 'ArtatixAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Structured Event Feed',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Dominant platform for university concerts and regional festivals in Yogyakarta and Central Java'
      },
      {
        source_id: 'src-promoter-slemania',
        source_name: 'Sleman Temple Vibes / Jogja Live (Regional Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://jogjalive.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'YOGYAKARTA',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Regional Organizer Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Prominent regional concert and festival organizer in Yogyakarta & Central Java'
      },
      {
        source_id: 'src-promoter-makassar-live',
        source_name: 'Makassar Live Entertainment (Regional Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://makassarlive.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'MAKASSAR',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Regional Organizer Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Prominent music concert promoter in Makassar, Celebes & Eastern Indonesia'
      },
      {
        source_id: 'src-promoter-palembang-fest',
        source_name: 'Sriwijaya Music Fest Organizer (Regional Promoter)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://sriwijayafest.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'PALEMBANG',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Regional Organizer Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Major music festival and stadium concert organizer in Palembang and South Sumatra'
      },
      {
        source_id: 'src-promoter-solo-radio',
        source_name: 'Solo Radio Concerts (Regional Organizer)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://soloradio.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'SOLO',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.FEED,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Regional Organizer Channel',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Live concerts and music gigs organizer across Solo Raya and Central Java'
      },
      {
        source_id: 'src-disc-bandsintown',
        source_name: 'Bandsintown API',
        source_type: SOURCE_TYPES.EVENT_DISCOVERY_API,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://bandsintown.com',
        country: 'Indonesia',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.AUTHORIZED_API,
        permission_status: PERMISSION_STATUS.LICENSED_DATA,
        trust_level: TRUST_LEVELS.TIER_A,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Developer API License',
        robots_policy: 'API_DIRECT',
        notes: 'Licensed tour discovery database'
      },
      {
        source_id: 'src-ticketmaster',
        source_name: 'Ticketmaster API',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://app.ticketmaster.com',
        country: 'Global',
        language: 'en',
        coverage: 'INTERNATIONAL',
        category: 'MUSIC',
        adapter: 'TicketmasterAdapter',
        access_method: ACCESS_METHODS.AUTHORIZED_API,
        permission_status: PERMISSION_STATUS.NOT_ALLOWED, // default until API key provided
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.INACTIVE,
        terms_reference: 'Ticketmaster Developer Terms',
        robots_policy: 'API_DIRECT',
        notes: 'Requires developer API key before live activation'
      },
      {
        source_id: 'src-livenation',
        source_name: 'Live Nation Global Tours',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://livenation.asia',
        country: 'International',
        language: 'en',
        coverage: 'INTERNATIONAL',
        category: 'MUSIC',
        adapter: 'LiveNationAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Manual Review / Public Press Releases',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'International tour promoter public announcements'
      },
      {
        source_id: 'src-axs',
        source_name: 'AXS Ticketing',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.axs.com',
        country: 'Global',
        language: 'en',
        coverage: 'INTERNATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        terms_reference: 'AXS Official Ticketing Platform',
        robots_policy: 'HONOR_ROBOTS_TXT',
        notes: 'Global & regional ticketing partner for arena concerts, sports, festivals, and live entertainment'
      },
      // ==========================================
      // TIER 1 / TIER 2: SOUTHEAST ASIAN TICKETING PLATFORMS & REGIONAL PROMOTERS
      // (Singapore, Malaysia, Thailand, Philippines, Vietnam, Indonesia)
      // ==========================================
      // Singapore
      {
        source_id: 'src-ticketmaster-sg',
        source_name: 'Ticketmaster Singapore',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://ticketmaster.sg',
        country: 'Singapore',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'TicketmasterAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Primary ticketing platform for Singapore sports and music events'
      },
      {
        source_id: 'src-sistic-sg',
        source_name: 'SISTIC Singapore',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.sistic.com.sg',
        country: 'Singapore',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'THEATER',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Singapore theater, musicals, family shows, and arts ticketing'
      },
      {
        source_id: 'src-ticket2u-sg',
        source_name: 'Ticket2U Singapore',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticket2u.com.sg',
        country: 'Singapore',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'EXPERIENCES',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Exhibitions, conventions, sports, and experiences in Singapore'
      },
      {
        source_id: 'src-venue-singapore-sports-hub',
        source_name: 'Singapore Sports Hub (Official Venue)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://www.sportshub.com.sg',
        country: 'Singapore',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'SPORTS',
        adapter: 'VenueAdapter',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_VENUE_OPERATOR,
        notes: 'Official operator of Singapore National Stadium & Singapore Indoor Stadium'
      },
      // Malaysia
      {
        source_id: 'src-org-malaysia-tech-council',
        source_name: 'Malaysia Tech & Digital Council (Official Organizer)',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://mdec.my',
        country: 'Malaysia',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'BUSINESS_EDUCATION',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.PRIMARY_AUTHORITY,
        notes: 'National organizer for tech conferences, summits, and professional events in Malaysia'
      },
      {
        source_id: 'src-ticket2u-my',
        source_name: 'Ticket2U Malaysia',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticket2u.com.my',
        country: 'Malaysia',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Major ticketing platform for concerts, festivals, sports in Malaysia'
      },
      {
        source_id: 'src-bookmyshow-my',
        source_name: 'BookMyShow Malaysia',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://my.bookmyshow.com',
        country: 'Malaysia',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Concerts and comedy shows in Malaysia'
      },
      {
        source_id: 'src-megatix-my',
        source_name: 'Megatix Malaysia',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://megatix.my',
        country: 'Malaysia',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'FESTIVAL',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Festival and nightlife ticketing in Malaysia'
      },
      // Thailand
      {
        source_id: 'src-thaiticketmajor-th',
        source_name: 'ThaiTicketMajor',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.thaiticketmajor.com',
        country: 'Thailand',
        language: 'th',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Premier ticketing platform in Thailand for concerts, sports, theater'
      },
      {
        source_id: 'src-ticketmelon-th',
        source_name: 'Ticketmelon Thailand',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticketmelon.com',
        country: 'Thailand',
        language: 'th',
        coverage: 'REGIONAL',
        category: 'FESTIVAL',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Festivals, concerts, and exhibitions in Thailand & SEA'
      },
      {
        source_id: 'src-ticket2u-th',
        source_name: 'Ticket2U Thailand',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticket2u.co.th',
        country: 'Thailand',
        language: 'th',
        coverage: 'NATIONAL',
        category: 'EXPERIENCES',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Attractions and exhibitions in Thailand'
      },
      {
        source_id: 'src-livenation-tero-th',
        source_name: 'Live Nation Tero Thailand',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://www.livenationtero.co.th',
        country: 'Thailand',
        language: 'th',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_PROMOTER,
        notes: 'Major concert and tour promoter in Thailand'
      },
      // Philippines
      {
        source_id: 'src-livenation-ph',
        source_name: 'Live Nation Philippines',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://www.livenation.ph',
        country: 'Philippines',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_PROMOTER,
        notes: 'Leading concert and stadium tour promoter in the Philippines'
      },
      {
        source_id: 'src-ticketnet-ph',
        source_name: 'Ticketnet Philippines',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticketnet.com.ph',
        country: 'Philippines',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'SPORTS',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Araneta Coliseum, sports, basketball, and concert ticketing in Philippines'
      },
      {
        source_id: 'src-ticketmelon-ph',
        source_name: 'Ticketmelon Philippines',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticketmelon.com',
        country: 'Philippines',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Concerts and community events in Philippines'
      },
      {
        source_id: 'src-venue-newport-manila',
        source_name: 'Newport World Resorts Performing Arts Theater (Official Venue)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://www.newportworldresorts.com',
        country: 'Philippines',
        language: 'en',
        coverage: 'NATIONAL',
        category: 'THEATER',
        adapter: 'VenueAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_VENUE_OPERATOR,
        notes: 'Premier theater and comedy venue in Pasay / Manila'
      },
      // Vietnam
      {
        source_id: 'src-venue-secc-vn',
        source_name: 'Saigon Exhibition and Convention Center (SECC Official Venue)',
        source_type: SOURCE_TYPES.OFFICIAL_VENUE_WEB,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://secc.com.vn',
        country: 'Vietnam',
        language: 'vi',
        coverage: 'NATIONAL',
        category: 'FESTIVAL',
        adapter: 'VenueAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.AUTHORIZED_API,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_VENUE_OPERATOR,
        notes: 'Largest exhibition and trade/food festival center in Ho Chi Minh City, Vietnam'
      },
      {
        source_id: 'src-ticketbox-vn',
        source_name: 'Ticketbox Vietnam',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://ticketbox.vn',
        country: 'Vietnam',
        language: 'vi',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Top ticketing platform in Vietnam for concerts, festivals, conferences'
      },
      {
        source_id: 'src-ticketmelon-vn',
        source_name: 'Ticketmelon Vietnam',
        source_type: SOURCE_TYPES.TICKETING_PLATFORM,
        tier: 2,
        authority_level: 'MEDIUM',
        base_url: 'https://www.ticketmelon.com',
        country: 'Vietnam',
        language: 'vi',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.TICKETING_PARTNER,
        notes: 'Festivals and live events in Vietnam'
      },
      // Regional Promoters
      {
        source_id: 'src-promoter-ckstar',
        source_name: 'CK Star Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://ckstarentertainment.com',
        country: 'Regional',
        language: 'en',
        coverage: 'REGIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_PROMOTER,
        notes: 'Regional promoter across SG, ID, MY (Coldplay, Epik High, etc.)'
      },
      {
        source_id: 'src-promoter-ime-asia',
        source_name: 'iMe Entertainment Group Asia',
        source_type: SOURCE_TYPES.OFFICIAL_ORGANIZER,
        tier: 1,
        authority_level: 'HIGH',
        base_url: 'https://www.ime.co',
        country: 'Regional',
        language: 'en',
        coverage: 'REGIONAL',
        category: 'MUSIC',
        adapter: 'PromoterAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_1,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.OFFICIAL_PROMOTER,
        notes: 'Major Asian K-pop and World Tour promoter'
      },
      // ==========================================
      // TIER 3: DISCOVERY SIGNALS (SOCIAL CHANNELS)
      // Strictly Discovery Signals — Cannot solely verify!
      // AUTHORITATIVE PROMOTER OFFICIAL INSTAGRAM ACCOUNTS
      // Tier 1 Authoritative ONLY when explicitly registered with verified handle
      // ==========================================
      {
        source_id: 'src-promoter-antarasuara-instagram',
        source_name: 'Antarasuara (Official Instagram)',
        source_owner: 'Antarasuara',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/antara.suara/',
        account_handle: '@antara.suara',
        canonical_account: '@antara.suara',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'SocialDiscoveryAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Verified Promoter Instagram',
        robots_policy: 'API_OR_MANUAL_REVIEW',
        notes: 'Verified Official Promoter Instagram for Antarasuara'
      },
      {
        source_id: 'src-promoter-bosscreator-instagram',
        source_name: 'Boss Creator (Official Instagram)',
        source_owner: 'Boss Creator',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/boss.creator/',
        account_handle: '@boss.creator',
        canonical_account: '@boss.creator',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'SocialDiscoveryAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Verified Promoter Instagram',
        robots_policy: 'API_OR_MANUAL_REVIEW',
        notes: 'Verified Official Promoter Instagram for Boss Creator'
      },
      {
        source_id: 'src-promoter-otello-asia-instagram',
        source_name: 'Otello Asia (Official Instagram)',
        source_owner: 'Otello Asia',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/otelloasia/',
        account_handle: '@otelloasia',
        canonical_account: '@otelloasia',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'SocialDiscoveryAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Verified Promoter Instagram',
        robots_policy: 'API_OR_MANUAL_REVIEW',
        notes: 'Verified Official Promoter Instagram for Otello Asia'
      },
      {
        source_id: 'src-promoter-plainsong-instagram',
        source_name: 'Plainsong Live (Official Instagram)',
        source_owner: 'Plainsong Live',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/joylandfest/',
        account_handle: '@joylandfest',
        canonical_account: '@joylandfest',
        country: 'Indonesia',
        language: 'id',
        coverage: 'BALI_JAKARTA',
        category: 'MUSIC',
        adapter: 'SocialDiscoveryAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Official Verified Promoter Instagram',
        robots_policy: 'API_OR_MANUAL_REVIEW',
        notes: 'Verified Official Promoter Instagram for Plainsong Live'
      },
      {
        source_id: 'src-ig-promoter-tem',
        source_name: 'TEM Presents (Official Instagram)',
        source_owner: 'TEM Presents',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/temgmt/',
        account_handle: '@temgmt',
        canonical_account: '@temgmt',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for TEM Presents'
      },
      {
        source_id: 'src-ig-promoter-pk',
        source_name: 'PK Entertainment (Official Instagram)',
        source_owner: 'PK Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/pkentertainment.id/',
        account_handle: '@pkentertainment.id',
        canonical_account: '@pkentertainment.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for PK Entertainment'
      },
      {
        source_id: 'src-ig-promoter-rajawali',
        source_name: 'Rajawali Indonesia (Official Instagram)',
        source_owner: 'Rajawali Indonesia',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/rajawaliindonesia/',
        account_handle: '@rajawaliindonesia',
        canonical_account: '@rajawaliindonesia',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for Rajawali Indonesia'
      },
      {
        source_id: 'src-ig-promoter-ravel',
        source_name: 'Ravel Entertainment (Official Instagram)',
        source_owner: 'Ravel Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/ravelentertainment/',
        account_handle: '@ravelentertainment',
        canonical_account: '@ravelentertainment',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for Ravel Entertainment'
      },
      {
        source_id: 'src-ig-event-hammersonic',
        source_name: 'Hammersonic Festival (Official Instagram)',
        source_owner: 'Ravel Entertainment',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/hammersonicfest/',
        account_handle: '@hammersonicfest',
        canonical_account: '@hammersonicfest',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.PRIMARY_AUTHORITY,
        notes: 'Verified Official Festival Instagram for Hammersonic Festival'
      },
      {
        source_id: 'src-ig-promoter-dyandra',
        source_name: 'Dyandra Global Edutainment (Official Instagram)',
        source_owner: 'Dyandra Global Edutainment',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/dyandraglobal/',
        account_handle: '@dyandraglobal',
        canonical_account: '@dyandraglobal',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for Dyandra Global'
      },
      {
        source_id: 'src-ig-promoter-ismaya',
        source_name: 'Ismaya Live (Official Instagram)',
        source_owner: 'Ismaya Live',
        source_type: SOURCE_TYPES.OFFICIAL_PROMOTER_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/ismayalive/',
        account_handle: '@ismayalive',
        canonical_account: '@ismayalive',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Verified Official Promoter Instagram for Ismaya Live'
      },
      // ==========================================
      // AUTHORITATIVE EVENT WEBSITES & INSTAGRAM
      // ==========================================
      {
        source_id: 'src-event-pestapora-web',
        source_name: 'Pestapora Official Website',
        source_owner: 'Pestapora / Boss Creator',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://pestapora.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Website for Pestapora'
      },
      {
        source_id: 'src-event-pestapora-ig',
        source_name: 'Pestapora (Official Instagram)',
        source_owner: 'Pestapora / Boss Creator',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/pestapora/',
        account_handle: '@pestapora',
        canonical_account: '@pestapora',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Instagram for Pestapora'
      },
      {
        source_id: 'src-event-synchronize-web',
        source_name: 'Synchronize Fest Official Website',
        source_owner: 'Synchronize Festival / Pusen',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://synchronizefestival.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Website for Synchronize Fest'
      },
      {
        source_id: 'src-event-synchronize-ig',
        source_name: 'Synchronize Fest (Official Instagram)',
        source_owner: 'Synchronize Festival / Pusen',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/synchronizefest/',
        account_handle: '@synchronizefest',
        canonical_account: '@synchronizefest',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Instagram for Synchronize Fest'
      },
      {
        source_id: 'src-event-joyland-web',
        source_name: 'Joyland Festival Official Website',
        source_owner: 'Joyland Festival / Plainsong Live',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://joylandfest.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'BALI_JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Website for Joyland Festival'
      },
      {
        source_id: 'src-event-joyland-ig',
        source_name: 'Joyland Festival (Official Instagram)',
        source_owner: 'Joyland Festival / Plainsong Live',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/joylandfest/',
        account_handle: '@joylandfest',
        canonical_account: '@joylandfest',
        country: 'Indonesia',
        language: 'id',
        coverage: 'BALI_JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Instagram for Joyland Festival'
      },
      {
        source_id: 'src-event-dwp-web',
        source_name: 'Djakarta Warehouse Project Official Website',
        source_owner: 'Djakarta Warehouse Project / Ismaya Live',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://djakartawarehouse.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Website for Djakarta Warehouse Project (DWP)'
      },
      {
        source_id: 'src-event-dwp-ig',
        source_name: 'Djakarta Warehouse Project (Official Instagram)',
        source_owner: 'Djakarta Warehouse Project / Ismaya Live',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/djakartawarehouseproject/',
        account_handle: '@djakartawarehouseproject',
        canonical_account: '@djakartawarehouseproject',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Instagram for DWP'
      },
      {
        source_id: 'src-event-bigbang-web',
        source_name: 'Big Bang Festival Official Website',
        source_owner: 'Big Bang Festival / PT Expo Indo Jaya',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://bigbangfest.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Website for Big Bang Festival'
      },
      {
        source_id: 'src-event-bigbang-ig',
        source_name: 'Big Bang Festival (Official Instagram)',
        source_owner: 'Big Bang Festival / PT Expo Indo Jaya',
        source_type: SOURCE_TYPES.OFFICIAL_EVENT_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/bigbangfest.id/',
        account_handle: '@bigbangfest.id',
        canonical_account: '@bigbangfest.id',
        country: 'Indonesia',
        language: 'id',
        coverage: 'JAKARTA',
        category: 'FESTIVAL',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Event Instagram for Big Bang Festival'
      },
      // ==========================================
      // AUTHORITATIVE ARTIST WEBSITES & INSTAGRAM
      // ==========================================
      {
        source_id: 'src-artist-sheilaon7-web',
        source_name: 'Sheila On 7 Official Website',
        source_owner: 'Sheila On 7',
        source_type: SOURCE_TYPES.OFFICIAL_ARTIST_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://sheilaon7.com',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Artist Website for Sheila On 7'
      },
      {
        source_id: 'src-artist-sheilaon7-ig',
        source_name: 'Sheila On 7 (Official Instagram)',
        source_owner: 'Sheila On 7',
        source_type: SOURCE_TYPES.OFFICIAL_ARTIST_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/sheilaon7/',
        account_handle: '@sheilaon7',
        canonical_account: '@sheilaon7',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Verified Artist Instagram for Sheila On 7'
      },
      {
        source_id: 'src-artist-coldplay-web',
        source_name: 'Coldplay Official Website',
        source_owner: 'Coldplay',
        source_type: SOURCE_TYPES.OFFICIAL_ARTIST_WEB,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://coldplay.com',
        country: 'International',
        language: 'en',
        coverage: 'INTERNATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Artist Website for Coldplay'
      },
      {
        source_id: 'src-artist-coldplay-ig',
        source_name: 'Coldplay (Official Instagram)',
        source_owner: 'Coldplay',
        source_type: SOURCE_TYPES.OFFICIAL_ARTIST_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/coldplay/',
        account_handle: '@coldplay',
        canonical_account: '@coldplay',
        country: 'International',
        language: 'en',
        coverage: 'INTERNATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Verified Artist Instagram for Coldplay'
      },
      {
        source_id: 'src-artist-hindia-ig',
        source_name: 'Hindia / Baskara Putra (Official Instagram)',
        source_owner: 'Hindia',
        source_type: SOURCE_TYPES.OFFICIAL_ARTIST_IG,
        tier: 1,
        authority_level: 'HIGH',
        source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
        base_url: 'https://www.instagram.com/wordfangs/',
        account_handle: '@wordfangs',
        canonical_account: '@wordfangs',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        trust_level: TRUST_LEVELS.TIER_S,
        active_status: SOURCE_STATUS.ACTIVE,
        notes: 'Official Verified Artist Instagram for Hindia / Baskara Putra'
      },
      {
        source_id: 'src-argus-community',
        source_name: 'ARGUS Community Submission',
        source_type: SOURCE_TYPES.COMMUNITY,
        tier: 3,
        authority_level: 'LOW',
        base_url: 'https://tikum.app',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'COMMUNITY',
        adapter: 'EventSourceAdapter',
        access_method: ACCESS_METHODS.SUBMISSION,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_5,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Community Submission Policy',
        robots_policy: 'INTERNAL',
        notes: 'Crowdsourced event submissions requiring operator evidence check'
      },
      // ==========================================
      // TIER 2: GLOBAL / REGIONAL DISCOVERY RADAR (STUBHUB & VIAGOGO)
      // ==========================================
      {
        source_id: 'src-stubhub',
        source_name: 'StubHub International',
        source_type: SOURCE_TYPES.GLOBAL_MARKETPLACE_DISCOVERY,
        tier: 2,
        authority_level: 'MEDIUM',
        source_role: SOURCE_ROLES.CORROBORATING_SOURCE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.DISCOVERY_CANDIDATE,
        base_url: 'https://www.stubhub.com',
        country: 'Regional',
        language: 'en',
        coverage: 'REGIONAL',
        category: 'MULTI_DISCIPLINARY',
        adapter: 'DiscoveryAdapter',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Marketplace Catalog',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 2,
        reliability_score: 0.8,
        notes: 'Regional ticket marketplace radar for tour dates; cannot alone verify Indonesian events without local authority proof'
      },
      {
        source_id: 'src-viagogo',
        source_name: 'Viagogo Worldwide',
        source_type: SOURCE_TYPES.GLOBAL_MARKETPLACE_DISCOVERY,
        tier: 2,
        authority_level: 'MEDIUM',
        source_role: SOURCE_ROLES.CORROBORATING_SOURCE,
        authority_relationship: AUTHORITY_RELATIONSHIPS.DISCOVERY_CANDIDATE,
        base_url: 'https://www.viagogo.com',
        country: 'Regional',
        language: 'en',
        coverage: 'REGIONAL',
        category: 'MULTI_DISCIPLINARY',
        adapter: 'DiscoveryAdapter',
        access_method: ACCESS_METHODS.API,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_2,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Marketplace Catalog',
        robots_policy: 'HONOR_ROBOTS_TXT',
        rate_limit: '30 req/min',
        crawl_frequency: CRAWL_FREQUENCY.DAILY,
        priority: 2,
        reliability_score: 0.8,
        notes: 'Regional ticket marketplace radar for tour dates; cannot alone verify Indonesian events without local authority proof'
      },
      // ==========================================
      // TIER 3: LOCAL CONCERT DISCOVERY REFERENCE (@infokonser)
      // ==========================================
      {
        source_id: 'src-ig-infokonser',
        source_name: 'Info Konser Indonesia (@infokonser)',
        source_owner: 'Info Konser Indonesia',
        source_type: SOURCE_TYPES.DISCOVERY_PLATFORM,
        tier: 3,
        authority_level: 'MEDIUM',
        source_role: SOURCE_ROLES.DISCOVERY_SIGNAL,
        authority_relationship: AUTHORITY_RELATIONSHIPS.DISCOVERY_CANDIDATE,
        base_url: 'https://www.instagram.com/infokonser/',
        account_handle: '@infokonser',
        canonical_account: '@infokonser',
        country: 'Indonesia',
        language: 'id',
        coverage: 'NATIONAL',
        category: 'MUSIC',
        adapter: 'SocialDiscoveryAdapter',
        access_method: ACCESS_METHODS.MANUAL_REVIEW,
        permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
        trust_level: TRUST_LEVELS.TIER_3,
        active_status: SOURCE_STATUS.ACTIVE,
        terms_reference: 'Public Social Discovery Media',
        robots_policy: 'API_OR_MANUAL_REVIEW',
        priority: 2,
        reliability_score: 0.85,
        notes: 'Primary Indonesian local concert discovery channel (@infokonser); feeds candidate events for verification against official promoter/artist sources'
      }
    ];

    for (const src of defaults) {
      this.registerSource(src);
    }
  }

  registerSource(sourceData) {
    const id = sourceData.source_id;
    const name = sourceData.source_name || sourceData.name;
    if (!id || !name) {
      throw new Error('Source must have source_id and source_name');
    }

    // Determine tier (1, 2, or 3)
    let tier = sourceData.tier;
    if (!tier) {
      if (sourceData.trust_level === TRUST_LEVELS.TIER_S || sourceData.trust_level === TRUST_LEVELS.TIER_1) {
        tier = 1;
      } else if (sourceData.trust_level === TRUST_LEVELS.TIER_A || sourceData.trust_level === TRUST_LEVELS.TIER_2 || sourceData.trust_level === TRUST_LEVELS.TIER_B) {
        tier = 2;
      } else {
        tier = 3;
      }
    }

    let authority = sourceData.authority_level;
    if (!authority) {
      authority = tier === 1 ? 'HIGH' : (tier === 2 ? 'MEDIUM' : 'LOW');
    }

    const source = {
      source_id: id,
      source_name: name,
      name: name, // compatibility
      source_type: sourceData.source_type || sourceData.type || SOURCE_TYPES.OTHER,
      type: sourceData.source_type || sourceData.type || SOURCE_TYPES.OTHER, // compatibility
      tier: tier,
      authority_level: authority,
      source_role: sourceData.source_role || (tier === 1 ? SOURCE_ROLES.PRIMARY_EVENT_SOURCE : (tier === 2 ? SOURCE_ROLES.CORROBORATING_SOURCE : SOURCE_ROLES.DISCOVERY_SIGNAL)),
      authority_scope: sourceData.authority_scope || AUTHORITY_SCOPES.EVENT,
      base_url: sourceData.base_url || '',
      country: sourceData.country || 'Indonesia',
      language: sourceData.language || 'id',
      coverage: sourceData.coverage || 'NATIONAL',
      category: sourceData.category || 'MUSIC',
      adapter: sourceData.adapter || 'EventSourceAdapter',
      access_method: sourceData.access_method || ACCESS_METHODS.MANUAL,
      permission_status: sourceData.permission_status || PERMISSION_STATUS.MANUAL_REVIEW,
      terms_reference: sourceData.terms_reference || 'Compliant Access Protocol',
      robots_policy: sourceData.robots_policy || 'HONOR_ROBOTS_TXT',
      terms_url: sourceData.terms_url || null,
      robots_url: sourceData.robots_url || null,
      api_url: sourceData.api_url || null,
      account_handle: sourceData.account_handle || null,
      rate_limit: sourceData.rate_limit || '30 req/min',
      crawl_frequency: sourceData.crawl_frequency || CRAWL_FREQUENCY.DAILY,
      priority: sourceData.priority || 1,
      reliability_score: sourceData.reliability_score || (tier === 1 ? 1.0 : (tier === 2 ? 0.8 : 0.5)),
      enabled: sourceData.enabled !== false && sourceData.active !== false,
      active: sourceData.enabled !== false && sourceData.active !== false, // compatibility
      trust_level: sourceData.trust_level || (tier === 1 ? TRUST_LEVELS.TIER_1 : (tier === 2 ? TRUST_LEVELS.TIER_2 : TRUST_LEVELS.TIER_5)),
      active_status: sourceData.active_status || sourceData.health_status || SOURCE_STATUS.ACTIVE,
      health_status: sourceData.active_status || sourceData.health_status || SOURCE_STATUS.ACTIVE,
      
      // Circuit breaker
      circuit_breaker_status: sourceData.circuit_breaker_status || 'CLOSED',
      consecutive_failures: sourceData.consecutive_failures || 0,
      cooldown_until: null,
      
      // Real database telemetry (Zero mock metrics)
      telemetry: {
        successful_fetches: 0,
        failed_fetches: 0,
        parse_failures: 0,
        schema_failures: 0,
        rate_limit_events: 0,
        last_success: sourceData.last_successful_sync || null,
        last_failure: sourceData.last_failed_sync || null,
        last_http_status: sourceData.last_http_status !== undefined ? sourceData.last_http_status : null,
        average_latency_ms: 0,
        events_discovered: 0,
        events_changed: 0,
        events_rejected: 0,
        source_freshness: sourceData.last_successful_sync || null
      },

      last_successful_sync: sourceData.last_successful_sync || null,
      last_failed_sync: sourceData.last_failed_sync || null,
      last_successful_fetch: sourceData.last_successful_fetch || null,
      last_attempted_fetch: sourceData.last_attempted_fetch || null,
      last_http_status: sourceData.last_http_status !== undefined ? sourceData.last_http_status : null,
      notes: sourceData.notes || '',
      created_at: sourceData.created_at || new Date().toISOString()
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

  getSourcesByTier(tier) {
    return this.getAllSources().filter(s => s.tier === tier);
  }

  isSourcePermittedForIngestion(sourceId) {
    const src = this.getSource(sourceId);
    if (!src || !src.enabled) return false;
    if (src.circuit_breaker_status === 'OPEN') {
      if (src.cooldown_until && Date.now() > new Date(src.cooldown_until).getTime()) {
        src.circuit_breaker_status = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    if (src.permission_status === PERMISSION_STATUS.NOT_ALLOWED || src.permission_status === PERMISSION_STATUS.UNKNOWN) {
      return false;
    }
    return true;
  }

  updateHealth(sourceId, status, { success = false, latencyMs = 0, isParseFailure = false, isSchemaFailure = false, isRateLimited = false, httpStatus = null } = {}) {
    const src = this.sources.get(sourceId);
    if (!src) return null;

    const now = new Date().toISOString();
    src.last_attempted_fetch = now;

    if (httpStatus !== null && httpStatus !== undefined) {
      src.last_http_status = httpStatus;
      src.telemetry.last_http_status = httpStatus;
    }

    if (success) {
      src.telemetry.successful_fetches++;
      src.telemetry.last_success = now;
      src.telemetry.source_freshness = now;
      src.last_successful_fetch = now;
      src.last_successful_sync = now;
      src.active_status = SOURCE_STATUS.ACTIVE;
      src.health_status = SOURCE_STATUS.ACTIVE;
      src.consecutive_failures = 0;
      src.circuit_breaker_status = 'CLOSED';
      src.cooldown_until = null;
    } else {
      src.telemetry.failed_fetches++;
      src.telemetry.last_failure = now;
      src.last_failed_sync = now;
      src.consecutive_failures = (src.consecutive_failures || 0) + 1;

      if (isParseFailure) src.telemetry.parse_failures++;
      if (isSchemaFailure) src.telemetry.schema_failures++;
      if (isRateLimited) src.telemetry.rate_limit_events++;

      if (src.consecutive_failures >= 3) {
        src.circuit_breaker_status = 'OPEN';
        src.active_status = SOURCE_STATUS.CIRCUIT_OPEN;
        src.health_status = SOURCE_STATUS.CIRCUIT_OPEN;
        src.cooldown_until = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min cooldown
      } else if (status) {
        src.active_status = status;
        src.health_status = status;
      } else {
        src.active_status = SOURCE_STATUS.DEGRADED;
        src.health_status = SOURCE_STATUS.DEGRADED;
      }
    }

    if (latencyMs > 0) {
      const prevAvg = src.telemetry.average_latency_ms || latencyMs;
      src.telemetry.average_latency_ms = Math.round((prevAvg + latencyMs) / 2);
    }

    return src;
  }

  recordEventMetrics(sourceId, { discovered = 0, changed = 0, rejected = 0 } = {}) {
    const src = this.sources.get(sourceId);
    if (!src) return;
    if (discovered) src.telemetry.events_discovered += discovered;
    if (changed) src.telemetry.events_changed += changed;
    if (rejected) src.telemetry.events_rejected += rejected;
  }

  resetCircuitBreaker(sourceId) {
    const src = this.sources.get(sourceId);
    if (!src) return null;
    src.circuit_breaker_status = 'CLOSED';
    src.consecutive_failures = 0;
    src.cooldown_until = null;
    src.active_status = SOURCE_STATUS.ACTIVE;
    src.health_status = SOURCE_STATUS.ACTIVE;
    return src;
  }

  registerVerifiedPromoterSocial(promoterId, promoterName, handle, profileUrl) {
    const cleanId = (promoterId || '').replace(/^prm-/, '').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const sourceId = `src-promoter-${cleanId}-instagram`;
    const record = {
      source_id: sourceId,
      source_name: `${promoterName} (Official Instagram)`,
      source_type: SOURCE_TYPES.PROMOTER_OFFICIAL_SOCIAL,
      tier: 1, // Official promoter verified account is Tier 1 authority
      authority_level: 'HIGH',
      source_role: SOURCE_ROLES.PRIMARY_EVENT_SOURCE,
      authority_scope: AUTHORITY_SCOPES.EVENT,
      trust_level: TRUST_LEVELS.TIER_S,
      base_url: profileUrl || `https://www.instagram.com/${(handle || '').replace('@', '')}/`,
      account_handle: handle,
      country: 'Indonesia',
      language: 'id',
      coverage: 'NATIONAL',
      category: 'MUSIC',
      adapter: 'SocialDiscoveryAdapter',
      access_method: ACCESS_METHODS.MANUAL_REVIEW,
      permission_status: PERMISSION_STATUS.MANUAL_REVIEW,
      commercial_use_allowed: true,
      scraping_allowed: false,
      attribution_required: true,
      priority: 1,
      reliability_score: 1.0,
      active_status: SOURCE_STATUS.ACTIVE,
      health_status: SOURCE_STATUS.ACTIVE,
      account_verified_at: new Date().toISOString(),
      notes: `Verified Official Promoter Instagram for ${promoterName} (Tier S Primary Source)`
    };

    this.registerSource(record);

    // Register alias without hyphens if applicable (e.g., antara-suara vs antarasuara)
    const noHyphens = cleanId.replace(/-/g, '');
    if (noHyphens !== cleanId) {
      const aliasId = `src-promoter-${noHyphens}-instagram`;
      this.sources.set(aliasId, { ...record, source_id: aliasId });
    }

    return record;
  }

  /**
   * Checks whether a source is authoritative.
   * If sourceAccount is provided, verifies that it matches the registered account handle.
   */
  isAuthoritativeSource(sourceId, sourceAccount = null) {
    if (!sourceId) return false;
    const src = this.getSource(sourceId);
    if (!src) return false;
    if (src.active_status !== SOURCE_STATUS.ACTIVE && src.active !== true) return false;

    // Check if source type is in authoritative list
    const isAuthType = AUTHORITATIVE_SOURCE_TYPES.includes(src.source_type) ||
                       src.tier === 1 ||
                       src.trust_level === TRUST_LEVELS.TIER_S ||
                       src.trust_level === TRUST_LEVELS.TIER_1;
    if (!isAuthType) return false;

    // If source is an Instagram channel, enforce registered account boundary
    const isSocialOrIg = (src.source_type || '').includes('IG') ||
                         (src.source_type || '').includes('SOCIAL') ||
                         (src.base_url || '').includes('instagram.com');
    if (isSocialOrIg) {
      const registeredHandle = (src.account_handle || src.canonical_account || src.source_account || '').replace(/^@/, '').toLowerCase().trim();
      if (!registeredHandle) return false;

      if (sourceAccount) {
        const inputHandle = String(sourceAccount).replace(/^@/, '').toLowerCase().trim();
        if (inputHandle !== registeredHandle) return false;
      }
    }

    return true;
  }

  /**
   * Validates mandatory provenance attributes for a public canonical event.
   * Core invariant: NO SOURCE EVIDENCE = NO PUBLIC EVENT.
   */
  validateProvenance(provenance) {
    const errors = [];
    if (!provenance || typeof provenance !== 'object') {
      return { valid: false, errors: ['Provenance object is required'] };
    }

    if (!provenance.source_type || !AUTHORITATIVE_SOURCE_TYPES.includes(provenance.source_type)) {
      errors.push(`Invalid or non-authoritative source_type: '${provenance.source_type}'`);
    }

    if (!provenance.source_url || typeof provenance.source_url !== 'string' || !provenance.source_url.startsWith('http')) {
      errors.push('Valid source_url starting with http/https is required');
    }

    if (!provenance.source_last_checked_at || isNaN(new Date(provenance.source_last_checked_at).getTime())) {
      errors.push('Valid source_last_checked_at timestamp is required');
    }

    if (provenance.verification_status !== 'VERIFIED' && provenance.verification_status !== 'PRIMARY_SOURCE_VERIFIED') {
      errors.push(`Public event requires verification_status VERIFIED, got: '${provenance.verification_status}'`);
    }

    if (!provenance.verified_at || isNaN(new Date(provenance.verified_at).getTime())) {
      errors.push('Valid verified_at timestamp is required');
    }

    if (!provenance.evidence_hash || typeof provenance.evidence_hash !== 'string' || provenance.evidence_hash.length < 16) {
      errors.push('Valid cryptographic evidence_hash is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  reset() {
    this.sources.clear();
    this._initializeDefaultSources();
  }
}

const sourceRegistryInstance = new SourceRegistry();

module.exports = {
  SourceRegistry,
  sourceRegistry: sourceRegistryInstance,
  SOURCE_TYPES,
  AUTHORITATIVE_SOURCE_TYPES,
  SOURCE_ROLES,
  AUTHORITY_SCOPES,
  TRUST_LEVELS,
  SOURCE_STATUS,
  PERMISSION_STATUS,
  CRAWL_FREQUENCY,
  ACCESS_METHODS,
  AUTHORITY_RELATIONSHIPS
};
