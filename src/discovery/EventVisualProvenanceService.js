/**
 * TIKUM / ARGUS — Event Visual Provenance & Image Sourcing Service
 * 
 * Strict Official Visual Provenance Engine:
 * - Priority:
 *   REAL OFFICIAL EVENT VISUAL (Tier 0)
 *   > OFFICIAL PROMOTER / ORGANIZER VISUAL (Tier 1)
 *   > OFFICIAL ARTIST / PERFORMER / TEAM VISUAL (Tier 2)
 *   > OFFICIAL VENUE VISUAL (Tier 3)
 *   > OFFICIAL TICKETING PARTNER VISUAL (Tier 4)
 *   > REGIONAL DISCOVERY / CROSS-REFERENCE (Tier 5: StubHub / Viagogo)
 *   > SAFE TIKUM UI PLACEHOLDER
 * 
 * Invariants:
 * 1. Event verification and image verification are decoupled:
 *    - UNVERIFIED EVENT + VALID IMAGE -> NEVER PUBLIC!
 *    - VERIFIED EVENT + MISSING/UNVERIFIED IMAGE -> PUBLIC, WITH SAFE TIKUM FALLBACK.
 * 2. Never fabricate an event image or generate fake AI posters.
 * 3. Scope Hierarchy: LOCAL_EVENT > TOUR > ARTIST > VENUE > GENERIC_CATEGORY.
 * 4. SSRF & URL Security: Rejects private IP addresses, localhost, and metadata endpoints.
 * 5. Homepage performance: Zero live network scraping during homepage SSR / API requests.
 */

const crypto = require('crypto');
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');

const IMAGE_SOURCE_TIERS = {
  OFFICIAL_EVENT: 0,
  OFFICIAL_PROMOTER: 1,
  OFFICIAL_ORGANIZER: 1,
  OFFICIAL_ARTIST: 2,
  OFFICIAL_VENUE: 3,
  OFFICIAL_TICKETING_PARTNER: 4,
  REGIONAL_DISCOVERY: 5,
  TIKUM_FALLBACK: 99
};

const IMAGE_SOURCE_TYPES = {
  OFFICIAL_EVENT_WEB: 'OFFICIAL_EVENT_WEB',
  OFFICIAL_EVENT_IG: 'OFFICIAL_EVENT_IG',
  OFFICIAL_EVENT_PAGE: 'OFFICIAL_EVENT_PAGE',
  OFFICIAL_PROMOTER_WEB: 'OFFICIAL_PROMOTER_WEB',
  OFFICIAL_PROMOTER_IG: 'OFFICIAL_PROMOTER_IG',
  OFFICIAL_ORGANIZER_WEB: 'OFFICIAL_ORGANIZER_WEB',
  OFFICIAL_ORGANIZER_IG: 'OFFICIAL_ORGANIZER_IG',
  OFFICIAL_ARTIST_WEB: 'OFFICIAL_ARTIST_WEB',
  OFFICIAL_ARTIST_IG: 'OFFICIAL_ARTIST_IG',
  OFFICIAL_VENUE_WEB: 'OFFICIAL_VENUE_WEB',
  OFFICIAL_TICKETING: 'OFFICIAL_TICKETING',
  GLOBAL_MARKETPLACE_DISCOVERY: 'GLOBAL_MARKETPLACE_DISCOVERY',
  TIKUM_UI_FALLBACK: 'TIKUM_UI_FALLBACK'
};

const IMAGE_SCOPES = {
  LOCAL_EVENT: 'LOCAL_EVENT',
  TOUR: 'TOUR',
  ARTIST: 'ARTIST',
  VENUE: 'VENUE',
  GENERIC_CATEGORY: 'GENERIC_CATEGORY'
};

const IMAGE_STATUS = {
  VERIFIED: 'VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  STALE: 'STALE',
  INVALID: 'INVALID',
  FALLBACK: 'FALLBACK'
};

class EventVisualProvenanceService {
  /**
   * SSRF Protection & URL Validation
   * Rejects localhost, 127.0.0.1, private ranges, metadata IPs, non-http(s) schemes.
   */
  static validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'URL is required and must be a string' };
    }

    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return { valid: false, reason: 'URL must start with http:// or https://' };
    }

    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname.toLowerCase();

      // Check loopback / localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return { valid: false, reason: 'Localhost and loopback addresses are forbidden' };
      }

      // Check cloud metadata endpoints
      if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' || hostname.endsWith('.internal')) {
        return { valid: false, reason: 'Cloud metadata endpoints are forbidden' };
      }

      // Check private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
      const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipMatch) {
        const p1 = parseInt(ipMatch[1], 10);
        const p2 = parseInt(ipMatch[2], 10);
        if (p1 === 10) return { valid: false, reason: 'Private 10.0.0.0/8 range forbidden' };
        if (p1 === 172 && p2 >= 16 && p2 <= 31) return { valid: false, reason: 'Private 172.16.0.0/12 range forbidden' };
        if (p1 === 192 && p2 === 168) return { valid: false, reason: 'Private 192.168.0.0/16 range forbidden' };
        if (p1 === 169 && p2 === 254) return { valid: false, reason: 'Link-local 169.254.0.0/16 range forbidden' };
      }

      // Check file extension / path sanity if present
      const pathname = parsed.pathname.toLowerCase();
      const hasImageExt = /\.(jpg|jpeg|png|webp|avif|svg)(\?.*)?$/i.test(pathname) ||
                          pathname.includes('/image') ||
                          pathname.includes('/media') ||
                          pathname.includes('/photo') ||
                          pathname.includes('/poster') ||
                          pathname.includes('/event') ||
                          pathname.includes('/cdn');

      return {
        valid: true,
        normalized_url: parsed.toString(),
        hostname: hostname,
        has_image_ext: hasImageExt
      };
    } catch (e) {
      return { valid: false, reason: `Malformed URL: ${e.message}` };
    }
  }

  /**
   * Generates a deterministic SHA-256 evidence hash for the image observation.
   */
  static generateImageEvidenceHash(imageUrl, sourceUrl, sourceAccount = '') {
    const raw = `${imageUrl || ''}|${sourceUrl || ''}|${sourceAccount || ''}|tikum-image-v1`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Generates a clean, transparent, CSS/SVG Tikum UI fallback thumbnail.
   * Clearly labeled as a Tikum UI category placeholder, NEVER claimed as official poster.
   */
  static generateFallbackPlaceholder({ category = 'EVENT', title = 'Event', city = 'Indonesia' }) {
    const cleanCat = (category || 'EVENT').toUpperCase().trim();
    const cleanTitle = (title || 'Event').trim();
    const cleanCity = (city || 'Indonesia').trim();

    return {
      is_fallback: true,
      category_label: cleanCat,
      title_label: cleanTitle,
      city_label: cleanCity,
      fallback_type: 'TIKUM_UI_FALLBACK',
      badge_text: cleanCat,
      disclaimer: 'Tikum UI Placeholder — Official poster not published'
    };
  }

  /**
   * Resolves image provenance from candidate sources according to strict priority order:
   * Tier 0: Official Event
   * Tier 1: Official Promoter / Organizer
   * Tier 2: Artist / Performer / Team
   * Tier 3: Venue
   * Tier 4: Official Ticketing Partner
   * Tier 5: Regional Discovery (StubHub / Viagogo)
   * Fallback: Tikum Safe Placeholder
   */
  static resolveEventImage(eventData = {}, sourceRecords = []) {
    const now = new Date().toISOString();
    const country = (eventData.country || 'Indonesia').trim();
    const isIndonesia = country.toLowerCase() === 'indonesia' || country.toLowerCase() === 'id';

    // 1. Gather all candidates from eventData and sourceRecords
    const candidates = [];

    // Candidate from direct event properties
    if (eventData.image_url || eventData.poster_url || eventData.event_image) {
      const imgUrl = eventData.image_url || eventData.poster_url || eventData.event_image;
      const srcType = eventData.image_source_type || eventData.source_type || 'OFFICIAL_PROMOTER';
      const srcUrl = eventData.image_source_url || eventData.source_url || null;
      const srcAccount = eventData.image_source_account || eventData.source_account || null;
      const tier = eventData.image_source_tier !== undefined ? eventData.image_source_tier : (eventData.tier || 1);
      const scope = eventData.image_scope || (eventData.is_tour ? IMAGE_SCOPES.TOUR : IMAGE_SCOPES.LOCAL_EVENT);

      candidates.push({
        image_url: imgUrl,
        source_type: srcType,
        source_url: srcUrl,
        source_account: srcAccount,
        tier: tier,
        scope: scope,
        credit: eventData.image_credit || 'Official Event Source',
        license: eventData.image_license || 'OFFICIAL_EVENT_PROMO'
      });
    }

    // Candidates from source observations
    for (const src of sourceRecords) {
      if (src.image_url || src.poster_url || src.event_image) {
        const imgUrl = src.image_url || src.poster_url || src.event_image;
        const srcMeta = sourceRegistry.getSource(src.source_id) || {};
        const srcType = src.source_type || srcMeta.source_type || 'COMMERCIAL';
        const tier = srcMeta.tier || src.tier || 2;
        let priorityTier = tier;

        // Map source type to image priority tier
        if (srcType.includes('EVENT') || srcType === 'OFFICIAL_EVENT_WEB' || srcType === 'OFFICIAL_EVENT_IG') {
          priorityTier = IMAGE_SOURCE_TIERS.OFFICIAL_EVENT;
        } else if (srcType.includes('PROMOTER') || srcType.includes('ORGANIZER')) {
          priorityTier = IMAGE_SOURCE_TIERS.OFFICIAL_PROMOTER;
        } else if (srcType.includes('ARTIST')) {
          priorityTier = IMAGE_SOURCE_TIERS.OFFICIAL_ARTIST;
        } else if (srcType.includes('VENUE')) {
          priorityTier = IMAGE_SOURCE_TIERS.OFFICIAL_VENUE;
        } else if (srcType.includes('TICKET')) {
          priorityTier = IMAGE_SOURCE_TIERS.OFFICIAL_TICKETING_PARTNER;
        } else if (srcType === 'GLOBAL_MARKETPLACE_DISCOVERY') {
          priorityTier = IMAGE_SOURCE_TIERS.REGIONAL_DISCOVERY;
        }

        candidates.push({
          image_url: imgUrl,
          source_type: srcType,
          source_url: src.source_url || srcMeta.base_url || null,
          source_account: src.account_handle || src.source_account || srcMeta.canonical_account || null,
          tier: priorityTier,
          scope: src.image_scope || IMAGE_SCOPES.LOCAL_EVENT,
          credit: srcMeta.source_name || src.source_name || 'Ticketing / Promoter Source',
          license: 'EDITORIAL_DISCOVERY'
        });
      }
    }

    // 2. Filter valid candidates through SSRF & Security checks
    const validCandidates = [];
    for (const cand of candidates) {
      const urlCheck = this.validateImageUrl(cand.image_url);
      if (!urlCheck.valid) {
        continue;
      }
      cand.normalized_url = urlCheck.normalized_url;
      validCandidates.push(cand);
    }

    // 3. If no valid image candidates exist: return safe Tikum UI fallback
    if (validCandidates.length === 0) {
      const fallbackMeta = this.generateFallbackPlaceholder({
        category: eventData.category || eventData.event_type || 'EVENT',
        title: eventData.title || eventData.name || eventData.canonical_name || 'Event',
        city: eventData.city || eventData.venue_city || 'Indonesia'
      });

      return {
        image_url: null,
        thumbnail_url: null,
        image_source_type: IMAGE_SOURCE_TYPES.TIKUM_UI_FALLBACK,
        image_source_url: null,
        image_source_account: null,
        image_source_tier: IMAGE_SOURCE_TIERS.TIKUM_FALLBACK,
        image_last_checked_at: now,
        image_evidence_hash: this.generateImageEvidenceHash('tikum-fallback', 'system', 'tikum'),
        image_license_status: 'TIKUM_UI_FALLBACK',
        image_status: IMAGE_STATUS.FALLBACK,
        image_scope: IMAGE_SCOPES.GENERIC_CATEGORY,
        image_credit: 'Tikum UI Placeholder',
        is_fallback: true,
        fallback_meta: fallbackMeta
      };
    }

    // 4. Sort valid candidates by Priority Tier (0 < 1 < 2 < 3 < 4 < 5) and Scope (LOCAL_EVENT > TOUR > ARTIST)
    const scopeWeight = {
      [IMAGE_SCOPES.LOCAL_EVENT]: 1,
      [IMAGE_SCOPES.TOUR]: 2,
      [IMAGE_SCOPES.ARTIST]: 3,
      [IMAGE_SCOPES.VENUE]: 4,
      [IMAGE_SCOPES.GENERIC_CATEGORY]: 5
    };

    validCandidates.sort((a, b) => {
      // Indonesia Rule: heavily favor local promoter/event Tier 0 and Tier 1 over Tier 5
      if (isIndonesia) {
        if (a.tier <= 1 && b.tier > 1) return -1;
        if (b.tier <= 1 && a.tier > 1) return 1;
      }
      if (a.tier !== b.tier) return a.tier - b.tier;
      const wA = scopeWeight[a.scope] || 3;
      const wB = scopeWeight[b.scope] || 3;
      return wA - wB;
    });

    const chosen = validCandidates[0];

    // Determine image verification status
    // Tier 0, 1, 2 can be VERIFIED if from an authoritative source
    let imgStatus = IMAGE_STATUS.UNVERIFIED;
    if (chosen.tier <= 1) {
      imgStatus = IMAGE_STATUS.VERIFIED;
    } else if (chosen.tier === 2) {
      imgStatus = IMAGE_STATUS.VERIFIED;
    } else if (chosen.tier === IMAGE_SOURCE_TIERS.REGIONAL_DISCOVERY) {
      // StubHub / Viagogo images are discovery only
      imgStatus = IMAGE_STATUS.UNVERIFIED;
    } else {
      imgStatus = IMAGE_STATUS.UNVERIFIED;
    }

    // For Indonesia: Regional marketplace images (StubHub/Viagogo) can NEVER be VERIFIED
    if (isIndonesia && chosen.tier >= IMAGE_SOURCE_TIERS.REGIONAL_DISCOVERY) {
      imgStatus = IMAGE_STATUS.UNVERIFIED;
    }

    const hash = this.generateImageEvidenceHash(chosen.normalized_url, chosen.source_url, chosen.source_account);

    return {
      image_url: chosen.normalized_url,
      thumbnail_url: chosen.normalized_url,
      image_source_type: chosen.source_type,
      image_source_url: chosen.source_url,
      image_source_account: chosen.source_account,
      image_source_tier: chosen.tier,
      image_last_checked_at: now,
      image_evidence_hash: hash,
      image_license_status: chosen.license || 'OFFICIAL_PROMOTER_PROMO',
      image_status: imgStatus,
      image_scope: chosen.scope || IMAGE_SCOPES.LOCAL_EVENT,
      image_credit: chosen.credit || 'Official Source',
      is_fallback: false
    };
  }
}

module.exports = {
  EventVisualProvenanceService,
  IMAGE_SOURCE_TIERS,
  IMAGE_SOURCE_TYPES,
  IMAGE_SCOPES,
  IMAGE_STATUS
};
