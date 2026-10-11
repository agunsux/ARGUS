/**
 * TIKUM / ARGUS — Event Visual Provenance & Image Sourcing Service
 * 
 * Strict Official Visual Provenance Engine & Image Verification Gate:
 * - Priority:
 *   TIER S: Official Event / Organizer / Promoter Poster & Artwork (Tier 0)
 *   > TIER A: Official Ticketing Partner / Official Artist / Official Venue (Tier 1-2)
 *   > TIER B: LiveNation / Ticketmaster / Tiket.com (Tier 2)
 *   > TIER C: Songkick / Bandsintown (Discovery / Cross-check only; portrait -> ARTIST_PROMO) (Tier 3)
 *   > TIER D: @infokonser / Regional Discovery (Tier 4-5)
 *   > SAFE TIKUM UI PLACEHOLDER (Tier 99)
 * 
 * Core Invariants:
 * 1. EVENT IDENTITY FIRST, IMAGE SECOND:
 *    Establish WHO, WHAT, WHEN, WHERE before attaching any image.
 * 2. WRONG IMAGE IS STRICTLY WORSE THAN MISSING IMAGE:
 *    For Tikum, data trust > visual completeness. Cards must display a clean verified
 *    category placeholder (GENERIC_FALLBACK) rather than a mismatched or unverified poster.
 * 3. Scope Hierarchy: LOCAL_EVENT > TOUR > ARTIST > VENUE > GENERIC_CATEGORY.
 * 4. Image Confidence Gate:
 *    - HIGH: Official event / promoter / ticketing with full matching event details.
 *    - MEDIUM: Cross-verified through multiple reliable sources, high match score.
 *    - LOW: Weak evidence, single unverified aggregator source, artist portrait without event context.
 *    - UNKNOWN: Source untrustworthy, SSRF/security failure, or wrong image detected.
 *    Only HIGH and verified MEDIUM images can be approved (image_verified = true).
 * 5. Wrong Image Detection:
 *    - Rejects wrong artist images (e.g. LANY banner on NCT 127).
 *    - Rejects wrong event/festival images (e.g. Pestapora thumbnail on Synchronize Fest).
 *    - Rejects wrong city images (e.g. Singapore banner on Jakarta event).
 *    - Rejects stale images (e.g. 2024 poster for 2026 event).
 *    - Rejects duplicate images across different artists (except multi-night residency of same artist).
 * 6. Decoupled Verification:
 *    - UNVERIFIED EVENT + VALID IMAGE -> NEVER PUBLIC!
 *    - VERIFIED EVENT + MISSING/UNVERIFIED IMAGE -> PUBLIC, WITH SAFE TIKUM FALLBACK.
 * 7. SSRF & Security: Rejects private IP addresses, loopback, and cloud metadata.
 * 8. Zero live network scraping during homepage SSR / API requests.
 */

const crypto = require('crypto');
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');
const { EventNormalizationService } = require('./EventNormalizationService');

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
  VERIFIED_OFFICIAL: 'VERIFIED_OFFICIAL',
  VERIFIED_AUTHORIZED_SELLER: 'VERIFIED_AUTHORIZED_SELLER',
  SOURCE_LINK_ONLY: 'SOURCE_LINK_ONLY',
  MISSING: 'MISSING',
  BROKEN: 'BROKEN',
  BLOCKED_BY_SOURCE: 'BLOCKED_BY_SOURCE',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  TRANSIENT_FAILURE: 'TRANSIENT_FAILURE',
  UNVERIFIED: 'UNVERIFIED',
  STALE: 'STALE',
  INVALID: 'INVALID',
  FALLBACK: 'FALLBACK'
};

const IMAGE_TYPES = {
  OFFICIAL_EVENT_POSTER: 'OFFICIAL_EVENT_POSTER',
  OFFICIAL_EVENT_ARTWORK: 'OFFICIAL_EVENT_ARTWORK',
  OFFICIAL_PROMOTER_ARTWORK: 'OFFICIAL_PROMOTER_ARTWORK',
  OFFICIAL_TICKETING_ARTWORK: 'OFFICIAL_TICKETING_ARTWORK',
  OFFICIAL_ARTIST_ARTWORK: 'OFFICIAL_ARTIST_ARTWORK',
  VENUE_ARTWORK: 'VENUE_ARTWORK',
  AGGREGATOR_EVENT_ARTWORK: 'AGGREGATOR_EVENT_ARTWORK',
  ARTIST_PROMO: 'ARTIST_PROMO',
  GENERIC_FALLBACK: 'GENERIC_FALLBACK'
};

const IMAGE_CONFIDENCE = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN'
};

// Known artist token mappings for wrong image detection
const KNOWN_ARTIST_SIGNATURES = [
  { key: 'lany', names: ['lany'], patterns: [/\/lany\//, /lany[-_]/, /[-_]lany\./] },
  { key: 'the weeknd', names: ['the weeknd', 'weeknd'], patterns: [/\/theweeknd\//, /theweeknd[-_]/, /[-_]theweeknd\./, /weeknd[-_]/] },
  { key: 'maroon 5', names: ['maroon 5', 'maroon5'], patterns: [/\/maroon5\//, /maroon5[-_]/, /[-_]maroon5\./, /maroon-5/] },
  { key: 'nct 127', names: ['nct 127', 'nct127', 'nct'], patterns: [/\/nct127\//, /nct127[-_]/, /[-_]nct127\./, /nct-127/] },
  { key: 'babymonster', names: ['babymonster', 'baby monster'], patterns: [/\/babymonster\//, /babymonster[-_]/, /[-_]babymonster\./] },
  { key: 'bigbang', names: ['bigbang', 'big bang'], patterns: [/\/bigbang\//, /bigbang[-_]/, /[-_]bigbang\./] },
  { key: 'the script', names: ['the script', 'thescript'], patterns: [/\/thescript\//, /thescript[-_]/, /[-_]thescript\./, /the-script/] },
  { key: 'men i trust', names: ['men i trust', 'menitrust'], patterns: [/\/menitrust\//, /menitrust[-_]/, /[-_]menitrust\./, /men-i-trust/] },
  { key: 'touche amore', names: ['touche amore', 'touché amoré', 'toucheamore'], patterns: [/\/toucheamore\//, /toucheamore[-_]/, /[-_]toucheamore\./, /touche-amore/] },
  { key: 'maddix', names: ['maddix'], patterns: [/\/maddix\//, /maddix[-_]/, /[-_]maddix\./] },
  { key: 'kanye west', names: ['kanye west', 'kanye', 'ye'], patterns: [/\/ye\//, /yejakarta/, /yeezy/, /kanye/] },
  { key: 'coldplay', names: ['coldplay'], patterns: [/\/coldplay\//, /coldplay[-_]/, /[-_]coldplay\./] },
  { key: 'dewa 19', names: ['dewa 19', 'dewa19', 'dewa'], patterns: [/\/dewa19\//, /dewa19[-_]/, /[-_]dewa19\./] },
  { key: 'sheila on 7', names: ['sheila on 7', 'sheilaon7', 'so7'], patterns: [/\/sheilaon7\//, /sheilaon7[-_]/, /[-_]sheilaon7\./, /so7[-_]/] },
  { key: 'tulus', names: ['tulus'], patterns: [/\/tulus\//, /tulus[-_]/, /[-_]tulus\./] },
  { key: 'hindia', names: ['hindia'], patterns: [/\/hindia\//, /hindia[-_]/, /[-_]hindia\./] },
  { key: 'bruno mars', names: ['bruno mars', 'brunomars'], patterns: [/\/brunomars\//, /brunomars[-_]/, /[-_]brunomars\./] },
  { key: 'king nassar', names: ['king nassar', 'nassar'], patterns: [/\/nassar\//, /king-nassar/, /nassar[-_]/] }
];

const KNOWN_FESTIVAL_SIGNATURES = [
  { key: 'pestapora', names: ['pestapora'], patterns: [/pestapora/] },
  { key: 'dwp', names: ['dwp', 'djakarta warehouse project'], patterns: [/dwp/, /djakartawarehouse/] },
  { key: 'synchronize', names: ['synchronize festival', 'synchronize fest', 'synchronize'], patterns: [/synchronize/] },
  { key: 'joyland', names: ['joyland festival', 'joyland'], patterns: [/joyland/] },
  { key: 'java jazz', names: ['java jazz'], patterns: [/javajazz/, /java-jazz/] }
];

const KNOWN_CITIES = [
  'singapore', 'bandung', 'bali', 'surabaya', 'tokyo', 'kualalumpur', 'kuala-lumpur',
  'bangkok', 'manila', 'jakarta', 'tangerang', 'semarang', 'medan', 'yogyakarta', 'jogja', 'solo'
];

class EventVisualProvenanceService {
  /**
   * SSRF Protection & URL Validation
   * Rejects localhost, 127.0.0.1, private ranges, metadata IPs, non-http(s) schemes.
   * Permits verified first-party official poster paths under /assets/posters/.
   */
  static validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'URL is required and must be a string' };
    }

    const trimmed = url.trim();
    if (/^\/assets\/posters\/[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$/i.test(trimmed)) {
      return {
        valid: true,
        normalized_url: trimmed,
        hostname: 'tikum.app',
        has_image_ext: true,
        is_local_official_asset: true
      };
    }

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
                          pathname.includes('/banner') ||
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
   * Classifies the semantic type of an image based on source type, scope, and context.
   */
  static classifyImageType(sourceType, scope, isEventSpecific = true, sourceId = '') {
    if (!sourceType || sourceType === 'TIKUM_UI_FALLBACK' || sourceType === 'GENERIC_FALLBACK') {
      return IMAGE_TYPES.GENERIC_FALLBACK;
    }
    const st = String(sourceType).toUpperCase();
    const sid = String(sourceId || '').toLowerCase();

    if (st.includes('POSTER') || st === 'OFFICIAL_EVENT_POSTER') {
      return IMAGE_TYPES.OFFICIAL_EVENT_POSTER;
    }
    if (st === 'OFFICIAL_EVENT_WEB' || st === 'OFFICIAL_EVENT_PAGE' || st === 'OFFICIAL_EVENT_IG') {
      return isEventSpecific ? IMAGE_TYPES.OFFICIAL_EVENT_POSTER : IMAGE_TYPES.OFFICIAL_EVENT_ARTWORK;
    }
    if (st.includes('PROMOTER') || st.includes('ORGANIZER')) {
      return IMAGE_TYPES.OFFICIAL_PROMOTER_ARTWORK;
    }
    if (st.includes('TICKET') || st === 'OFFICIAL_TICKETING') {
      return IMAGE_TYPES.OFFICIAL_TICKETING_ARTWORK;
    }
    if (st.includes('ARTIST')) {
      if (scope === IMAGE_SCOPES.ARTIST && !isEventSpecific) {
        return IMAGE_TYPES.ARTIST_PROMO;
      }
      return IMAGE_TYPES.OFFICIAL_ARTIST_ARTWORK;
    }
    if (st.includes('VENUE')) {
      return IMAGE_TYPES.VENUE_ARTWORK;
    }
    if (sid.includes('songkick') || sid.includes('bandsintown') || st.includes('AGGREGATOR')) {
      if (!isEventSpecific || scope === IMAGE_SCOPES.ARTIST) {
        return IMAGE_TYPES.ARTIST_PROMO;
      }
      return IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK;
    }
    if (scope === IMAGE_SCOPES.ARTIST) {
      return IMAGE_TYPES.ARTIST_PROMO;
    }
    return IMAGE_TYPES.OFFICIAL_EVENT_ARTWORK;
  }

  /**
   * Forensic Detection of Incorrect / Mismatched Images (Hard Guards)
   * Evaluates:
   * 1. Wrong Artist: Image explicitly identifies another artist
   * 2. Wrong Event/Festival: Image identifies another festival
   * 3. Wrong Tour/City: Image explicitly belongs to another city
   * 4. Stale Year: Image belongs to a past year
   * 5. Cross-Artist Duplicate: Same image attached to a different canonical artist
   * 6. Tribute Collision: Original artist portrait attached to a tribute show
   */
  static detectWrongImage(imageUrl, eventData = {}, existingEvents = []) {
    const problems = [];
    if (!imageUrl || typeof imageUrl !== 'string') {
      return { is_wrong: false, problems: [] };
    }

    const normUrl = imageUrl.toLowerCase();
    const eventTitle = (eventData.title || eventData.canonical_name || eventData.name || '').toLowerCase();
    const eventArtist = (eventData.artist || (Array.isArray(eventData.artists) ? eventData.artists[0] : '') || '').toLowerCase();
    const eventCity = (eventData.city || eventData.venue_city || '').toLowerCase();
    const eventDate = (eventData.start_date || eventData.date || '').toLowerCase();

    // 1. Wrong Artist Detection
    for (const sig of KNOWN_ARTIST_SIGNATURES) {
      const urlHasArtist = sig.patterns.some(p => p.test(normUrl));
      if (urlHasArtist) {
        const eventHasArtist = sig.names.some(n => eventTitle.includes(n) || eventArtist.includes(n));
        if (!eventHasArtist) {
          problems.push({
            rule: 'WRONG_ARTIST_IMAGE_COLLISION',
            detail: `Image URL identifies artist "${sig.key}", but event is "${eventTitle || eventArtist}".`
          });
        }
      }
    }

    // 2. Wrong Festival / Event Detection
    for (const fest of KNOWN_FESTIVAL_SIGNATURES) {
      const urlHasFest = fest.patterns.some(p => p.test(normUrl));
      if (urlHasFest) {
        const eventHasFest = fest.names.some(n => eventTitle.includes(n));
        if (!eventHasFest) {
          problems.push({
            rule: 'WRONG_EVENT_COLLISION',
            detail: `Image URL belongs to festival "${fest.key}", but event is "${eventTitle}".`
          });
        }
      }
    }

    // 3. Wrong City Detection
    for (const city of KNOWN_CITIES) {
      const cityPattern = new RegExp(`[-_/]${city}[-_/.]`, 'i');
      if (cityPattern.test(normUrl)) {
        if (eventCity && eventCity !== city && !eventCity.includes(city) && !city.includes(eventCity)) {
          // If event title doesn't mention that city
          if (!eventTitle.includes(city)) {
            problems.push({
              rule: 'WRONG_CITY_IMAGE_MISMATCH',
              detail: `Image URL explicitly targets "${city}", but event city is "${eventCity}".`
            });
          }
        }
      }
    }

    // 4. Stale Year Detection
    const pastYears = ['2021', '2022', '2023', '2024', '2025'];
    for (const py of pastYears) {
      const yearPattern = new RegExp(`[-_/]${py}[-_/.]`, 'i');
      if (yearPattern.test(normUrl)) {
        // If event date or title is in 2026 or 2027 and doesn't contain past year
        const isFutureEvent = eventDate.startsWith('2026') || eventDate.startsWith('2027') || eventTitle.includes('2026') || eventTitle.includes('2027');
        if (isFutureEvent && !eventTitle.includes(py) && !eventDate.includes(py)) {
          problems.push({
            rule: 'STALE_YEAR_IMAGE_MISMATCH',
            detail: `Image URL references past year "${py}", but event is in 2026/2027.`
          });
        }
      }
    }

    // 5. Cross-Artist Duplicate Image Collision
    if (existingEvents && (Array.isArray(existingEvents) || existingEvents instanceof Map)) {
      const list = Array.isArray(existingEvents) ? existingEvents : Array.from(existingEvents.values());
      const currentId = eventData.event_id || eventData.id;
      const currentArtistTokens = EventNormalizationService.extractArtistTokens(eventTitle || eventArtist);

      for (const other of list) {
        const otherId = other.event_id || other.id;
        if (otherId && otherId === currentId) continue;
        if (other.image_url && other.image_url.trim() === imageUrl.trim()) {
          const otherTitle = other.title || other.name || other.canonical_name || '';
          const otherArtist = other.artist || (Array.isArray(other.artists) ? other.artists[0] : '');
          const otherTokens = EventNormalizationService.extractArtistTokens(otherTitle || otherArtist);

          // Check if there is an artist overlap (e.g. multi-night residency of same artist like LANY Night 1 & 2)
          const sharesArtist = currentArtistTokens.some(t => otherTokens.includes(t));
          if (!sharesArtist && currentArtistTokens.length > 0 && otherTokens.length > 0) {
            problems.push({
              rule: 'DUPLICATE_IMAGE_DIFFERENT_ARTISTS',
              detail: `Image URL is already attached to completely different artist event "${otherTitle || otherId}".`
            });
            break;
          }
        }
      }
    }

    // 6. Tribute Band Collision
    if (eventTitle.includes('tribute') || eventTitle.includes('cover band')) {
      for (const sig of KNOWN_ARTIST_SIGNATURES) {
        if (sig.patterns.some(p => p.test(normUrl)) && !normUrl.includes('tribute')) {
          problems.push({
            rule: 'TRIBUTE_ARTIST_COLLISION',
            detail: `Tribute event cannot use original artist portrait without explicit tribute artwork branding.`
          });
        }
      }
    }

    return {
      is_wrong: problems.length > 0,
      problems: problems
    };
  }

  /**
   * Calculates explicit image confidence and verification eligibility.
   * Only HIGH and verified MEDIUM are approved for public display.
   */
  static calculateImageConfidence(candidate, eventData = {}, wrongImageResult = null) {
    if (wrongImageResult && wrongImageResult.is_wrong) {
      return {
        confidence: IMAGE_CONFIDENCE.UNKNOWN,
        verified: false,
        rejection_reason: wrongImageResult.problems.map(p => p.detail).join('; ')
      };
    }

    if (!candidate || !candidate.image_url) {
      return {
        confidence: IMAGE_CONFIDENCE.UNKNOWN,
        verified: false,
        rejection_reason: 'NO_IMAGE_URL'
      };
    }

    const tier = candidate.tier !== undefined ? candidate.tier : 99;
    const imgType = candidate.image_type || IMAGE_TYPES.GENERIC_FALLBACK;
    const sourceId = (candidate.source_id || '').toLowerCase();
    const sourceType = (candidate.source_type || '').toUpperCase();

    // ARTIST_PROMO portraits are NEVER verified as official posters
    if (imgType === IMAGE_TYPES.ARTIST_PROMO) {
      return {
        confidence: IMAGE_CONFIDENCE.LOW,
        verified: false,
        rejection_reason: 'ARTIST_PORTRAIT_WITHOUT_EVENT_CONTEXT'
      };
    }

    // Tier 0 & Tier 1 (Official Event / Promoter / Authority) -> HIGH confidence & VERIFIED
    if (tier <= 1 || sourceType.includes('EVENT') || sourceType.includes('PROMOTER') || sourceType.includes('ORGANIZER')) {
      return {
        confidence: IMAGE_CONFIDENCE.HIGH,
        verified: true,
        rejection_reason: null
      };
    }

    // Tier 2 (Official Ticketing / Major Established Platform: LiveNation, Ticketmaster, Tiket.com)
    if (tier === 2 || sourceType.includes('TICKET')) {
      return {
        confidence: IMAGE_CONFIDENCE.HIGH,
        verified: true,
        rejection_reason: null
      };
    }

    // Tier 3/4 Aggregators (Songkick / Bandsintown):
    // Event-specific artwork -> MEDIUM confidence & VERIFIED
    if (sourceId.includes('songkick') || sourceId.includes('bandsintown') || tier === 3) {
      if (imgType === IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK) {
        return {
          confidence: IMAGE_CONFIDENCE.MEDIUM,
          verified: true,
          rejection_reason: null
        };
      }
      return {
        confidence: IMAGE_CONFIDENCE.LOW,
        verified: false,
        rejection_reason: 'AGGREGATOR_PORTRAIT_ONLY'
      };
    }

    // Tier D / Social Discovery (e.g. @infokonser, StubHub, Viagogo) -> LOW & UNVERIFIED
    if (sourceId.includes('infokonser') || tier >= 4) {
      return {
        confidence: IMAGE_CONFIDENCE.LOW,
        verified: false,
        rejection_reason: 'UNVERIFIED_DISCOVERY_RADAR'
      };
    }

    return {
      confidence: IMAGE_CONFIDENCE.UNKNOWN,
      verified: false,
      rejection_reason: 'UNKNOWN_PROVENANCE_TIER'
    };
  }

  /**
   * Resolves image visual provenance according to strict priority order:
   * Tier 0: Official Event Poster / Official Event Artwork
   * Tier 1: Official Promoter / Organizer Artwork
   * Tier 2: Official Artist / Venue / Ticketing Partner Artwork
   * Tier 3: Aggregator Event Artwork (Songkick / Bandsintown)
   * Fallback: Tikum Safe Placeholder
   *
   * Hard Rule:
   * Any image flagged by detectWrongImage is REJECTED.
   * If no candidate achieves HIGH or MEDIUM verified confidence,
   * falls back to GENERIC_FALLBACK placeholder.
   */
  static resolveEventImage(eventData = {}, sourceRecords = [], existingEvents = []) {
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
      const isEventSpecific = !eventData.is_artist_portrait && scope !== IMAGE_SCOPES.ARTIST;
      const imgType = eventData.image_type || this.classifyImageType(srcType, scope, isEventSpecific);

      candidates.push({
        image_url: imgUrl,
        source_id: eventData.source_id || 'direct',
        source_type: srcType,
        source_url: srcUrl,
        source_account: srcAccount,
        tier: tier,
        scope: scope,
        image_type: imgType,
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

        const scope = src.image_scope || IMAGE_SCOPES.LOCAL_EVENT;
        const isEventSpecific = !src.is_artist_portrait && scope !== IMAGE_SCOPES.ARTIST;
        const imgType = src.image_type || this.classifyImageType(srcType, scope, isEventSpecific, src.source_id);

        candidates.push({
          image_url: imgUrl,
          source_id: src.source_id || srcMeta.source_id || 'source',
          source_type: srcType,
          source_url: src.source_url || srcMeta.base_url || null,
          source_account: src.account_handle || src.source_account || srcMeta.canonical_account || null,
          tier: priorityTier,
          scope: scope,
          image_type: imgType,
          credit: srcMeta.source_name || src.source_name || 'Ticketing / Promoter Source',
          license: 'EDITORIAL_DISCOVERY'
        });
      }
    }

    // 2. Filter valid candidates through SSRF & Wrong Image Detection
    const validCandidates = [];
    let lastRejectionReason = null;

    for (const cand of candidates) {
      const urlCheck = this.validateImageUrl(cand.image_url);
      if (!urlCheck.valid) {
        lastRejectionReason = urlCheck.reason;
        continue;
      }
      cand.normalized_url = urlCheck.normalized_url;

      // Forensic Wrong Image Detection
      const wrongCheck = this.detectWrongImage(cand.normalized_url, eventData, existingEvents);
      if (wrongCheck.is_wrong) {
        cand.is_wrong = true;
        cand.problems = wrongCheck.problems;
        lastRejectionReason = wrongCheck.problems.map(p => p.detail).join('; ');
        continue;
      }

      // Calculate confidence
      const confResult = this.calculateImageConfidence(cand, eventData, wrongCheck);
      cand.confidence = confResult.confidence;
      cand.verified = confResult.verified;
      cand.rejection_reason = confResult.rejection_reason;

      // Only candidates with verified === true (HIGH or verified MEDIUM) are eligible for primary display
      if (cand.verified) {
        validCandidates.push(cand);
      } else {
        lastRejectionReason = confResult.rejection_reason;
      }
    }

    // 3. If no verified candidates exist: return safe Tikum UI fallback
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
        image_type: IMAGE_TYPES.GENERIC_FALLBACK,
        image_verified: false,
        image_confidence: IMAGE_CONFIDENCE.UNKNOWN,
        image_verified_at: null,
        image_verified_by: 'TIKUM_VISUAL_VERIFICATION_GATE_V2',
        image_last_checked_at: now,
        image_evidence_hash: this.generateImageEvidenceHash('tikum-fallback', 'system', 'tikum'),
        image_license_status: 'TIKUM_UI_FALLBACK',
        image_status: IMAGE_STATUS.FALLBACK,
        image_scope: IMAGE_SCOPES.GENERIC_CATEGORY,
        image_credit: 'Tikum UI Placeholder',
        is_fallback: true,
        is_fallback_image: true,
        fallback_meta: fallbackMeta,
        rejection_reason: lastRejectionReason || 'NO_VERIFIED_IMAGE'
      };
    }

    // 4. Sort valid candidates by Priority Tier (0 < 1 < 2 < 3) and Scope (LOCAL_EVENT > TOUR > ARTIST)
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
    const hash = this.generateImageEvidenceHash(chosen.normalized_url, chosen.source_url, chosen.source_account);

    return {
      image_url: chosen.normalized_url,
      thumbnail_url: chosen.normalized_url,
      image_source_type: chosen.source_type,
      image_source_url: chosen.source_url,
      image_source_account: chosen.source_account,
      image_source_tier: chosen.tier,
      image_type: chosen.image_type || IMAGE_TYPES.OFFICIAL_EVENT_POSTER,
      image_verified: true,
      image_confidence: chosen.confidence || IMAGE_CONFIDENCE.HIGH,
      image_verified_at: now,
      image_verified_by: 'TIKUM_VISUAL_VERIFICATION_GATE_V2',
      image_last_checked_at: now,
      image_evidence_hash: hash,
      image_license_status: chosen.license || 'OFFICIAL_PROMOTER_PROMO',
      image_status: IMAGE_STATUS.VERIFIED,
      image_scope: chosen.scope || IMAGE_SCOPES.LOCAL_EVENT,
      image_credit: chosen.credit || 'Official Source',
      is_fallback: false,
      is_fallback_image: false,
      fallback_meta: null
    };
  }

  /**
   * Phase 14 Controlled Image Search Sequence Helper
   * Sequentially queries channels in deterministic priority:
   * 1. Official event / promoter domain
   * 2. Official ticketing platform
   * 3. Official artist site
   * 4. Songkick / Bandsintown (cross-checking artist, city, date; tag ARTIST_PROMO if portrait)
   * 5. Verified discovery sources (@infokonser cross-checked)
   * 6. Verified artist promo image (ONLY if explicitly supported by product)
   * 7. Clean category fallback placeholder (GENERIC_FALLBACK)
   */
  static searchEventImage(eventData = {}, discoverySources = {}, existingEvents = []) {
    const records = [];

    // Step 1: Official event / promoter
    if (discoverySources.official_event) {
      records.push({
        source_id: 'src-official-event',
        source_type: 'OFFICIAL_EVENT_WEB',
        image_url: discoverySources.official_event.image_url,
        image_scope: IMAGE_SCOPES.LOCAL_EVENT,
        tier: IMAGE_SOURCE_TIERS.OFFICIAL_EVENT,
        credit: discoverySources.official_event.credit || 'Official Event'
      });
    } else if (discoverySources.official_promoter) {
      records.push({
        source_id: 'src-official-promoter',
        source_type: 'OFFICIAL_PROMOTER_WEB',
        image_url: discoverySources.official_promoter.image_url,
        image_scope: IMAGE_SCOPES.LOCAL_EVENT,
        tier: IMAGE_SOURCE_TIERS.OFFICIAL_PROMOTER,
        credit: discoverySources.official_promoter.credit || 'Official Promoter'
      });
    }

    // Step 2: Official ticketing
    if (discoverySources.official_ticketing) {
      records.push({
        source_id: 'src-official-ticketing',
        source_type: 'OFFICIAL_TICKETING',
        image_url: discoverySources.official_ticketing.image_url,
        image_scope: IMAGE_SCOPES.LOCAL_EVENT,
        tier: IMAGE_SOURCE_TIERS.OFFICIAL_TICKETING_PARTNER,
        credit: discoverySources.official_ticketing.credit || 'Ticketing Platform'
      });
    }

    // Step 3: Official artist
    if (discoverySources.official_artist) {
      records.push({
        source_id: 'src-official-artist',
        source_type: 'OFFICIAL_ARTIST_WEB',
        image_url: discoverySources.official_artist.image_url,
        image_scope: IMAGE_SCOPES.TOUR,
        tier: IMAGE_SOURCE_TIERS.OFFICIAL_ARTIST,
        credit: discoverySources.official_artist.credit || 'Official Artist'
      });
    }

    // Step 4: Songkick / Bandsintown
    if (discoverySources.songkick) {
      const sk = discoverySources.songkick;
      const isPortrait = Boolean(sk.is_portrait_only);
      records.push({
        source_id: 'src-songkick',
        source_type: 'COMMERCIAL_PLATFORM',
        image_url: sk.image_url,
        image_scope: isPortrait ? IMAGE_SCOPES.ARTIST : IMAGE_SCOPES.LOCAL_EVENT,
        image_type: isPortrait ? IMAGE_TYPES.ARTIST_PROMO : IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK,
        is_artist_portrait: isPortrait,
        tier: 3,
        credit: 'Songkick'
      });
    }
    if (discoverySources.bandsintown) {
      const bit = discoverySources.bandsintown;
      const isPortrait = Boolean(bit.is_portrait_only);
      records.push({
        source_id: 'src-bandsintown',
        source_type: 'COMMERCIAL_PLATFORM',
        image_url: bit.image_url,
        image_scope: isPortrait ? IMAGE_SCOPES.ARTIST : IMAGE_SCOPES.LOCAL_EVENT,
        image_type: isPortrait ? IMAGE_TYPES.ARTIST_PROMO : IMAGE_TYPES.AGGREGATOR_EVENT_ARTWORK,
        is_artist_portrait: isPortrait,
        tier: 3,
        credit: 'Bandsintown'
      });
    }

    // Step 5: Verified discovery sources (@infokonser)
    if (discoverySources.infokonser) {
      records.push({
        source_id: 'src-ig-infokonser',
        source_type: 'DISCOVERY_RADAR',
        image_url: discoverySources.infokonser.image_url,
        image_scope: IMAGE_SCOPES.LOCAL_EVENT,
        tier: 4,
        credit: '@infokonser'
      });
    }

    // Step 6 / 7: Resolve via resolveEventImage
    return this.resolveEventImage(eventData, records, existingEvents);
  }

  /**
   * Audits an individual event and classifies its status into GREEN / YELLOW / RED:
   * - GREEN: Event identity verified AND image verified.
   * - YELLOW: Event identity likely correct but image confidence insufficient.
   * - RED: Event identity or image is incorrect / unverifiable / mismatched.
   */
  static auditEventImage(event = {}, existingEvents = []) {
    const eventId = event.event_id || event.id || 'unknown';
    const eventTitle = event.title || event.canonical_name || event.name || 'Unknown Event';
    const isEventVerified = event.is_verified === true && 
      (event.verification_status === 'VERIFIED' || event.verification_status === 'PRIMARY_SOURCE_VERIFIED');
    const imageUrl = event.image_url || event.event_image || event.poster_url || null;

    if (!imageUrl || event.is_fallback || event.is_fallback_image || event.image_status === 'FALLBACK') {
      return {
        event_id: eventId,
        event_name: eventTitle,
        artist: event.artist || (Array.isArray(event.artists) ? event.artists[0] : null),
        classification: isEventVerified ? 'YELLOW' : 'RED',
        verification_status: event.verification_status || 'UNVERIFIED',
        image_verification_status: 'FALLBACK_PLACEHOLDER',
        image_confidence: IMAGE_CONFIDENCE.UNKNOWN,
        current_image_url: null,
        problems_found: ['NO_OFFICIAL_IMAGE_ATTACHED'],
        recommended_action: 'ATTACH_VERIFIED_IMAGE: Search official event/promoter channels for key artwork.'
      };
    }

    // Check SSRF / format
    const urlCheck = this.validateImageUrl(imageUrl);
    if (!urlCheck.valid) {
      return {
        event_id: eventId,
        event_name: eventTitle,
        artist: event.artist || (Array.isArray(event.artists) ? event.artists[0] : null),
        classification: 'RED',
        verification_status: event.verification_status || 'UNVERIFIED',
        image_verification_status: 'INVALID_URL',
        image_confidence: IMAGE_CONFIDENCE.UNKNOWN,
        current_image_url: imageUrl,
        problems_found: [urlCheck.reason],
        recommended_action: 'REJECT_AND_REPLACE: Invalid or insecure URL scheme/host.'
      };
    }

    // Check wrong image detection rules
    const wrongCheck = this.detectWrongImage(imageUrl, event, existingEvents);
    if (wrongCheck.is_wrong) {
      return {
        event_id: eventId,
        event_name: eventTitle,
        artist: event.artist || (Array.isArray(event.artists) ? event.artists[0] : null),
        classification: 'RED',
        verification_status: event.verification_status || 'UNVERIFIED',
        image_verification_status: 'MISMATCHED_IMAGE',
        image_confidence: IMAGE_CONFIDENCE.UNKNOWN,
        current_image_url: imageUrl,
        problems_found: wrongCheck.problems.map(p => p.detail),
        recommended_action: 'REPLACE_OR_REJECT: Immediately detach incorrect image and replace with verified official artwork or clean category fallback placeholder.'
      };
    }

    const isImageVerified = event.image_verified === true || event.image_status === 'VERIFIED' ||
      (event.verification_mode === 'AUTHORITATIVE_CORROBORATED' && !wrongCheck.is_wrong);
    const conf = event.image_confidence || (event.image_source_tier <= 2 ? IMAGE_CONFIDENCE.HIGH : (event.verification_mode === 'AUTHORITATIVE_CORROBORATED' ? IMAGE_CONFIDENCE.HIGH : IMAGE_CONFIDENCE.MEDIUM));

    if (isEventVerified && isImageVerified && (conf === IMAGE_CONFIDENCE.HIGH || conf === IMAGE_CONFIDENCE.MEDIUM)) {
      return {
        event_id: eventId,
        event_name: eventTitle,
        artist: event.artist || (Array.isArray(event.artists) ? event.artists[0] : null),
        classification: 'GREEN',
        verification_status: event.verification_status,
        image_verification_status: 'VERIFIED',
        image_confidence: conf,
        current_image_url: imageUrl,
        problems_found: [],
        recommended_action: 'KEEP: Event identity and official image verified.'
      };
    }

    return {
      event_id: eventId,
      event_name: eventTitle,
      artist: event.artist || (Array.isArray(event.artists) ? event.artists[0] : null),
      classification: 'YELLOW',
      verification_status: event.verification_status || 'UNVERIFIED',
      image_verification_status: 'UNVERIFIED_CONFIDENCE',
      image_confidence: conf,
      current_image_url: imageUrl,
      problems_found: ['IMAGE_CONFIDENCE_INSUFFICIENT'],
      recommended_action: 'VERIFY_OR_FALLBACK: Cross-check image with official promoter before promoting to public.'
    };
  }

  /**
   * Loads the committed verified event image provenance registry.
   */
  static getVerifiedProvenanceRegistry() {
    if (!this._verifiedProvenanceCache) {
      try {
        this._verifiedProvenanceCache = require('./fixtures/verified_event_image_provenance.json');
      } catch (_) {
        this._verifiedProvenanceCache = {
          verified_by_event_id: {},
          verified_by_source_event_id: {},
          verified_by_source_url: {},
          known_broken_urls: {}
        };
      }
    }
    return this._verifiedProvenanceCache;
  }

  /**
   * Numeric priority rank for image source provenance (Section 5).
   * Higher rank wins:
   *  4 = Official event website / official organizer / official venue poster (VERIFIED_OFFICIAL)
   *  3 = Authorized ticket seller event banner (VERIFIED_AUTHORIZED_SELLER)
   *  2 = Generic verified / official social announcement image
   *  1 = Needs review
   *  0 = Missing / Broken / Blocked / Source-link-only / Fallback placeholder
   */
  static getImageSourcePriorityRank(eventOrMeta = {}) {
    const imgUrl = eventOrMeta.image_url || eventOrMeta.poster_url || eventOrMeta.banner_url || null;
    const status = (eventOrMeta.image_status || '').toUpperCase();
    const srcType = (eventOrMeta.image_source_type || '').toUpperCase();

    if (!imgUrl || ['BROKEN', 'BLOCKED_BY_SOURCE', 'SOURCE_LINK_ONLY', 'MISSING', 'FALLBACK', 'NONE', 'INVALID'].includes(status)) {
      return 0;
    }
    const urlCheck = this.validateImageUrl(imgUrl);
    if (!urlCheck.valid) return 0;

    const reg = this.getVerifiedProvenanceRegistry();
    if (reg.known_broken_urls && reg.known_broken_urls[imgUrl]) {
      return 0;
    }

    if (status === 'VERIFIED_OFFICIAL' ||
        ['OFFICIAL_ORGANIZER', 'OFFICIAL_EVENT_WEB', 'OFFICIAL_PROMOTER_WEB', 'OFFICIAL_ORGANIZER_WEB', 'OFFICIAL_VENUE', 'OFFICIAL_VENUE_WEB', 'OFFICIAL_ARTIST_WEB'].includes(srcType)) {
      return 4;
    }
    if (status === 'VERIFIED_AUTHORIZED_SELLER' ||
        ['AUTHORIZED_TICKET_SELLER', 'OFFICIAL_TICKETING'].includes(srcType)) {
      return 3;
    }
    if (status === 'VERIFIED' || srcType.includes('SOCIAL') || srcType.includes('IG')) {
      return 2;
    }
    if (status === 'NEEDS_REVIEW') {
      return 1;
    }
    return 2;
  }

  /**
   * Selects the preferred image provenance between an existing event and an incoming candidate.
   * Enforces:
   * - Official organizer/venue > Authorized ticket seller > Official social > Fallback
   * - Never overwrites a working verified image with null, BROKEN, or lower-priority image
   * - Never copies a city-specific tour stop poster across different cities
   */
  static selectPreferredImage(existingEvent = {}, candidateEvent = {}) {
    const existingRank = this.getImageSourcePriorityRank(existingEvent);
    const candidateRank = this.getImageSourcePriorityRank(candidateEvent);

    // Multi-city tour stop guard: if existing and candidate are in different cities,
    // do not adopt candidate's image onto existing event
    const cityA = (existingEvent.city || existingEvent.venue_city || '').toLowerCase().trim();
    const cityB = (candidateEvent.city || candidateEvent.venue_city || '').toLowerCase().trim();
    const normCityA = cityA.replace(/\s+(pusat|selatan|barat|timur|utara)$/i, '');
    const normCityB = cityB.replace(/\s+(pusat|selatan|barat|timur|utara)$/i, '');
    const isDifferentCity = normCityA && normCityB && normCityA !== normCityB &&
      !(normCityA === 'jakarta' && normCityB === 'tangerang') &&
      !(normCityA === 'tangerang' && normCityB === 'jakarta');

    if (isDifferentCity && existingRank > 0) {
      return this.extractImageFields(existingEvent);
    }
    if (isDifferentCity && existingRank === 0) {
      // Do not copy another city's tour stop poster
      return this.extractImageFields(existingEvent);
    }

    if (candidateRank > existingRank) {
      return this.extractImageFields(candidateEvent);
    }
    return this.extractImageFields(existingEvent);
  }

  static extractImageFields(obj = {}) {
    const imgUrl = obj.image_url || obj.poster_url || obj.banner_url || null;
    const hasLink = Boolean(obj.official_event_url || obj.official_ticket_url || obj.source_url || obj.image_source_url);
    const defaultStatus = imgUrl ? 'VERIFIED_AUTHORIZED_SELLER' : (hasLink ? 'SOURCE_LINK_ONLY' : 'MISSING');
    const status = obj.image_status && obj.image_status !== 'NONE' ? obj.image_status : defaultStatus;
    return {
      image_url: imgUrl,
      thumbnail_url: obj.thumbnail_url || imgUrl || null,
      image_source_url: obj.image_source_url || (imgUrl ? (obj.official_event_url || obj.official_ticket_url || obj.source_url || null) : null),
      image_source_type: imgUrl ? (obj.image_source_type || 'OFFICIAL_TICKETING') : 'NONE',
      image_verified_at: imgUrl ? (obj.image_verified_at || obj.verified_at || new Date().toISOString()) : null,
      image_status: status,
      image_credit: obj.image_credit || obj.image_attribution || (imgUrl ? 'Official Source' : null),
      image_attribution: obj.image_attribution || obj.image_credit || (imgUrl ? 'Official Source' : null),
      broken_image_url: obj.broken_image_url || null,
      is_fallback_image: !imgUrl
    };
  }

  /**
   * Resolves and classifies catalog event image provenance across all 7 required states:
   * VERIFIED_OFFICIAL, VERIFIED_AUTHORIZED_SELLER, SOURCE_LINK_ONLY,
   * MISSING, BROKEN, BLOCKED_BY_SOURCE, NEEDS_REVIEW.
   */
  static resolveCatalogEventImageProvenance(event = {}, meta = {}) {
    const reg = this.getVerifiedProvenanceRegistry();
    const eventId = event.id || event.event_id || null;
    const sourceEventId = event.source_event_id || meta.source_event_id || (Array.isArray(event.sources) && event.sources[0]?.source_event_id) || null;
    const rawImgUrl = event.image_url || event.poster_url || event.banner_url || meta.image_url || meta.poster_url || null;
    const candidateUrls = [
      event.official_ticket_url,
      event.official_event_url,
      event.source_url,
      meta.official_ticket_url,
      meta.official_event_url,
      meta.source_url,
      ...(Array.isArray(event.sources) ? event.sources.flatMap(s => [s.source_url, s.official_ticket_url]) : [])
    ].filter(Boolean);
    const hasOfficialLink = candidateUrls.length > 0;

    // 1. Check verified provenance registry by canonical event ID, source_event_id, or official/ticket URL
    let verifiedEntry = (eventId && reg.verified_by_event_id && reg.verified_by_event_id[eventId]) ||
      (sourceEventId && reg.verified_by_source_event_id && reg.verified_by_source_event_id[sourceEventId]) ||
      null;

    if (!verifiedEntry && reg.verified_by_source_url) {
      for (const u of candidateUrls) {
        const cleanU = String(u).trim();
        const noWww = cleanU.replace(/^https?:\/\/www\./i, m => m.replace('www.', ''));
        const withWww = cleanU.replace(/^https?:\/\/(?!www\.)/i, m => `${m}www.`);
        if (reg.verified_by_source_url[cleanU]) {
          verifiedEntry = reg.verified_by_source_url[cleanU];
          break;
        }
        if (reg.verified_by_source_url[noWww]) {
          verifiedEntry = reg.verified_by_source_url[noWww];
          break;
        }
        if (reg.verified_by_source_url[withWww]) {
          verifiedEntry = reg.verified_by_source_url[withWww];
          break;
        }
      }
    }

    if (verifiedEntry && verifiedEntry.image_url) {
      return {
        image_url: verifiedEntry.image_url,
        thumbnail_url: verifiedEntry.thumbnail_url || verifiedEntry.image_url,
        image_source_url: verifiedEntry.image_source_url || event.official_event_url || event.official_ticket_url || event.source_url || null,
        image_source_type: verifiedEntry.image_source_type || 'OFFICIAL_TICKETING',
        image_verified: true,
        image_verified_at: verifiedEntry.image_verified_at || event.verified_at || new Date().toISOString(),
        image_status: verifiedEntry.image_status || 'VERIFIED_AUTHORIZED_SELLER',
        image_credit: verifiedEntry.image_credit || 'Official Source',
        image_attribution: verifiedEntry.image_credit || 'Official Source',
        broken_image_url: (rawImgUrl && rawImgUrl !== verifiedEntry.image_url && reg.known_broken_urls?.[rawImgUrl]) ? rawImgUrl : null,
        is_fallback_image: false
      };
    }

    // 2. Check if stored rawImgUrl is a known broken URL (HTTP 404 or text/html)
    if (rawImgUrl && reg.known_broken_urls && reg.known_broken_urls[rawImgUrl]) {
      const brokenMeta = reg.known_broken_urls[rawImgUrl];
      return {
        image_url: null,
        thumbnail_url: null,
        image_source_url: event.image_source_url || meta.image_source_url || event.official_event_url || event.official_ticket_url || event.source_url || null,
        image_source_type: event.image_source_type || meta.image_source_type || 'NONE',
        image_verified: false,
        image_verified_at: null,
        image_status: IMAGE_STATUS.BROKEN,
        image_credit: event.image_credit || meta.image_credit || null,
        image_attribution: event.image_credit || meta.image_credit || null,
        broken_image_url: rawImgUrl,
        broken_reason: brokenMeta.reason,
        is_fallback_image: true
      };
    }

    // 3. If event already has an explicit non-verified status (BROKEN, BLOCKED_BY_SOURCE, NEEDS_REVIEW)
    const explicitStatus = event.image_status || meta.image_status || null;
    if (explicitStatus === IMAGE_STATUS.BROKEN || explicitStatus === IMAGE_STATUS.BLOCKED_BY_SOURCE || explicitStatus === IMAGE_STATUS.NEEDS_REVIEW) {
      return {
        image_url: explicitStatus === IMAGE_STATUS.NEEDS_REVIEW ? rawImgUrl : null,
        thumbnail_url: explicitStatus === IMAGE_STATUS.NEEDS_REVIEW ? rawImgUrl : null,
        image_source_url: event.image_source_url || meta.image_source_url || event.source_url || null,
        image_source_type: event.image_source_type || meta.image_source_type || 'NONE',
        image_verified: false,
        image_verified_at: null,
        image_status: explicitStatus,
        image_credit: event.image_credit || meta.image_credit || null,
        image_attribution: event.image_credit || meta.image_credit || null,
        broken_image_url: event.broken_image_url || meta.broken_image_url || rawImgUrl || null,
        is_fallback_image: explicitStatus !== IMAGE_STATUS.NEEDS_REVIEW
      };
    }

    // 4. If rawImgUrl is present, validate URL security & wrong-image check
    if (rawImgUrl) {
      const urlCheck = this.validateImageUrl(rawImgUrl);
      if (!urlCheck.valid) {
        return {
          image_url: null,
          thumbnail_url: null,
          image_source_url: event.image_source_url || meta.image_source_url || null,
          image_source_type: 'NONE',
          image_verified: false,
          image_verified_at: null,
          image_status: IMAGE_STATUS.BROKEN,
          image_credit: null,
          image_attribution: null,
          broken_image_url: rawImgUrl,
          broken_reason: urlCheck.reason,
          is_fallback_image: true
        };
      }
      const srcType = event.image_source_type || meta.image_source_type || (rawImgUrl.includes('loket.com') ? 'OFFICIAL_TICKETING' : 'OFFICIAL_EVENT_WEB');
      const isOfficialOrganizerOrVenue = ['OFFICIAL_ORGANIZER', 'OFFICIAL_EVENT_WEB', 'OFFICIAL_PROMOTER_WEB', 'OFFICIAL_VENUE', 'OFFICIAL_VENUE_WEB', 'OFFICIAL_ARTIST_WEB'].includes(srcType) &&
        !rawImgUrl.includes('loket.com');
      const resolvedStatus = event.is_verified === false
        ? IMAGE_STATUS.NEEDS_REVIEW
        : (isOfficialOrganizerOrVenue ? IMAGE_STATUS.VERIFIED_OFFICIAL : IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER);

      return {
        image_url: urlCheck.normalized_url,
        thumbnail_url: event.thumbnail_url || meta.thumbnail_url || urlCheck.normalized_url,
        image_source_url: event.image_source_url || meta.image_source_url || event.official_event_url || event.official_ticket_url || event.source_url || null,
        image_source_type: srcType,
        image_verified: event.is_verified !== false,
        image_verified_at: event.image_verified_at || meta.image_verified_at || event.verified_at || new Date().toISOString(),
        image_status: resolvedStatus,
        image_credit: event.image_credit || meta.image_credit || event.image_attribution || 'Official Source',
        image_attribution: event.image_attribution || meta.image_attribution || event.image_credit || meta.image_credit || 'Official Source',
        broken_image_url: null,
        is_fallback_image: false
      };
    }

    // 5. No image_url present -> classify as SOURCE_LINK_ONLY (if official/authorized link exists) or MISSING
    return {
      image_url: null,
      thumbnail_url: null,
      image_source_url: hasOfficialLink ? candidateUrls[0] : null,
      image_source_type: 'NONE',
      image_verified: false,
      image_verified_at: null,
      image_status: hasOfficialLink ? IMAGE_STATUS.SOURCE_LINK_ONLY : IMAGE_STATUS.MISSING,
      image_credit: null,
      image_attribution: null,
      broken_image_url: null,
      is_fallback_image: true
    };
  }

  /**
   * Automated Image Health Check (Section 7):
   * - Validates URL format and SSRF safety
   * - Checks HTTP status (200/206 vs 404/410 vs 403 vs 429/5xx)
   * - Verifies Content-Type starts with image/* (never marks 200 + text/html as verified!)
   * - Bounded retries for transient failures
   */
  static async checkImageHealth(imageUrl, options = {}) {
    const checkedAt = new Date().toISOString();
    if (!imageUrl) {
      return {
        ok: false,
        healthy: false,
        image_status: options.hasOfficialLink ? IMAGE_STATUS.SOURCE_LINK_ONLY : IMAGE_STATUS.MISSING,
        http_status: null,
        content_type: null,
        checked_at: checkedAt,
        reason: 'NO_IMAGE_URL'
      };
    }

    const urlCheck = this.validateImageUrl(imageUrl);
    if (!urlCheck.valid) {
      return {
        ok: false,
        healthy: false,
        image_status: IMAGE_STATUS.BROKEN,
        http_status: null,
        content_type: null,
        checked_at: checkedAt,
        reason: urlCheck.reason
      };
    }

    if (urlCheck.is_local_official_asset) {
      const fs = require('fs');
      const path = require('path');
      const localPath = path.join(__dirname, '../../public', urlCheck.normalized_url);
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
        const ext = path.extname(localPath).toLowerCase();
        const mimeMap = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.avif': 'image/avif',
          '.svg': 'image/svg+xml'
        };
        return {
          ok: true,
          healthy: true,
          image_status: IMAGE_STATUS.VERIFIED_OFFICIAL,
          http_status: 200,
          content_type: mimeMap[ext] || 'image/jpeg',
          verified_at: checkedAt,
          checked_at: checkedAt,
          reason: null
        };
      }
      return {
        ok: false,
        healthy: false,
        image_status: IMAGE_STATUS.BROKEN,
        http_status: 404,
        content_type: null,
        checked_at: checkedAt,
        reason: 'HTTP_404_LOCAL_ASSET_MISSING'
      };
    }

    const fetchFn = options.fetchFn || options.fetchImpl || global.fetch;
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 1;
    const timeoutMs = options.timeoutMs || 5000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let res = await fetchFn(urlCheck.normalized_url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          redirect: 'follow',
          signal: controller.signal
        });

        if (res.status === 405 || (res.ok && !(res.headers && ((typeof res.headers.get === 'function' && res.headers.get('content-type')) || res.headers['content-type'])))) {
          res = await fetchFn(urlCheck.normalized_url, {
            method: 'GET',
            headers: {
              'User-Agent': 'TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Range': 'bytes=0-1023'
            },
            redirect: 'follow',
            signal: controller.signal
          });
        }
        clearTimeout(timer);

        const status = res.status;
        const contentType = (res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : (res.headers && res.headers['content-type'])) || '';
        const normCt = contentType.toLowerCase().trim();

        if (status === 404 || status === 410) {
          return {
            ok: false,
            healthy: false,
            image_status: IMAGE_STATUS.BROKEN,
            http_status: status,
            content_type: contentType || null,
            checked_at: checkedAt,
            reason: `HTTP_${status}`
          };
        }

        if (status === 403) {
          return {
            ok: false,
            healthy: false,
            image_status: IMAGE_STATUS.BLOCKED_BY_SOURCE,
            http_status: 403,
            content_type: contentType || null,
            checked_at: checkedAt,
            reason: 'HTTP_403_BLOCKED_BY_SOURCE'
          };
        }

        if (status === 429 || status >= 500) {
          if (attempt < maxRetries) continue;
          return {
            ok: false,
            healthy: false,
            image_status: IMAGE_STATUS.TRANSIENT_FAILURE,
            retryable: true,
            http_status: status,
            content_type: contentType || null,
            checked_at: checkedAt,
            reason: `HTTP_${status}_TRANSIENT`
          };
        }

        if (status >= 200 && status < 300) {
          if (!normCt.startsWith('image/')) {
            return {
              ok: false,
              healthy: false,
              image_status: IMAGE_STATUS.BROKEN,
              http_status: status,
              content_type: contentType || null,
              checked_at: checkedAt,
              reason: `INVALID_CONTENT_TYPE:${contentType || 'missing'}`
            };
          }
          const srcType = (options.sourceType || '').toUpperCase();
          const isAuthorizedSeller = srcType.includes('TICKET') || urlCheck.normalized_url.includes('loket.com');
          return {
            ok: true,
            healthy: true,
            image_status: isAuthorizedSeller ? IMAGE_STATUS.VERIFIED_AUTHORIZED_SELLER : IMAGE_STATUS.VERIFIED_OFFICIAL,
            http_status: status,
            content_type: contentType,
            verified_at: checkedAt,
            checked_at: checkedAt,
            reason: null
          };
        }

        return {
          ok: false,
          healthy: false,
          image_status: IMAGE_STATUS.BROKEN,
          http_status: status,
          content_type: contentType || null,
          checked_at: checkedAt,
          reason: `HTTP_${status}`
        };
      } catch (err) {
        clearTimeout(timer);
        if (attempt < maxRetries) continue;
        return {
          ok: false,
          healthy: false,
          image_status: IMAGE_STATUS.TRANSIENT_FAILURE,
          retryable: true,
          http_status: null,
          content_type: null,
          checked_at: checkedAt,
          reason: err.name === 'AbortError' ? 'TIMEOUT' : (err.code || err.message || 'NETWORK_ERROR')
        };
      }
    }
  }

  /**
   * Applies an image health check result to an event record.
   * CRITICAL DECOUPLING INVARIANT:
   * Image failure NEVER marks an event CANCELLED, ARCHIVED, or UNVERIFIED!
   */
  static applyImageHealthResult(event, healthResult) {
    if (!event || !healthResult) return event;
    event.image_last_checked_at = healthResult.checked_at || new Date().toISOString();

    if (healthResult.healthy || healthResult.ok) {
      event.image_status = healthResult.image_status;
      event.image_verified = true;
      event.image_verified_at = healthResult.verified_at || event.image_last_checked_at;
      event.is_fallback_image = false;
      event.image_health_reason = null;
      return event;
    }

    if (healthResult.image_status === IMAGE_STATUS.BROKEN || healthResult.image_status === IMAGE_STATUS.BLOCKED_BY_SOURCE) {
      if (event.image_url) {
        event.broken_image_url = event.image_url;
      }
      event.image_status = healthResult.image_status;
      event.image_verified = false;
      event.image_verified_at = null;
      event.image_url = null;
      event.thumbnail_url = null;
      event.is_fallback_image = true;
      event.image_health_reason = healthResult.reason;
    } else if (healthResult.image_status === IMAGE_STATUS.TRANSIENT_FAILURE) {
      // Preserve existing image_url during transient network failure; record diagnostic reason only
      event.image_health_reason = healthResult.reason;
      event.image_health_warning = 'TRANSIENT_FAILURE';
    }
    return event;
  }
}

module.exports = {
  EventVisualProvenanceService,
  IMAGE_SOURCE_TIERS,
  IMAGE_SOURCE_TYPES,
  IMAGE_SCOPES,
  IMAGE_STATUS,
  IMAGE_TYPES,
  IMAGE_CONFIDENCE
};
