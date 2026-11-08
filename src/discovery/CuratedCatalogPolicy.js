/**
 * TIKUM — Curated & Corroborated Catalog Policy Engine
 * 
 * Enforces:
 * 1. Source Ingestion Capability Matrix:
 *    - LOKET: LIVE_NETWORK_VERIFIED (Targeted API) / SNAPSHOT_FALLBACK
 *    - GOERS: READY_PASSIVE / OFFICIAL_PARTNER_FEED (Zero Cloudflare bypass)
 *    - BBO: SNAPSHOT_ONLY (No unverified crawler)
 * 2. Invariant Gates:
 *    - NEVER_LABEL_SNAPSHOT_AS_LIVE
 *    - SEPARATION_OF_CONCERNS (Discovery != Verified != Resale Available)
 *    - QUARANTINE_ON_CONFLICT
 */

const SOURCE_MODES = {
  LIVE_NETWORK_VERIFIED: 'LIVE_NETWORK_VERIFIED',
  READY_PASSIVE: 'READY_PASSIVE',
  SNAPSHOT_ONLY: 'SNAPSHOT_ONLY',
  PRIMARY_SOURCE_AUTHORITATIVE: 'PRIMARY_SOURCE_AUTHORITATIVE'
};

const SOURCE_CAPABILITIES = {
  'src-loket': {
    name: 'LOKET.com',
    approved_mode: SOURCE_MODES.LIVE_NETWORK_VERIFIED,
    has_live_network: true,
    live_endpoint: 'https://rest.loket.com/fusio/api/v1/public/discover',
    allows_snapshot_fallback: true,
    anti_bot_policy: 'ROBOTS_TXT_COMPLIANT_RATE_LIMITED'
  },
  'src-goers': {
    name: 'GOERSapp',
    approved_mode: SOURCE_MODES.READY_PASSIVE,
    has_live_network: false, // Public web blocked by Cloudflare (HTTP 403)
    partner_feed_configured: Boolean(process.env.GOERS_FEED_URL),
    anti_bot_policy: 'ZERO_CLOUDFLARE_BYPASS',
    reason: 'Public endpoints return HTTP 403 Cloudflare challenge; partner feed or snapshot required'
  },
  'src-bbo': {
    name: 'BBO',
    approved_mode: SOURCE_MODES.SNAPSHOT_ONLY,
    has_live_network: false,
    allows_snapshot_fallback: true,
    anti_bot_policy: 'NO_UNVERIFIED_CRAWLER',
    reason: 'No network crawler or API client implemented; operates strictly from snapshot'
  }
};

const OFFICIAL_MIN_TICKET_PRICE = 500000;

class CuratedCatalogPolicy {
  static get OFFICIAL_MIN_TICKET_PRICE() {
    return OFFICIAL_MIN_TICKET_PRICE;
  }

  /**
   * Evaluates official ticket price qualification against the mandatory P0 invariant:
   * official_min_ticket_price >= 500000 (IDR 500,000).
   *
   * Gating Rules:
   * 1. Evaluated strictly against the LOWEST legitimate official ticket tier (face value).
   * 2. NEVER qualifies using highest price, VIP tier, average tier, or resale asking price.
   * 3. Sold-out tiers: If an official tier existed (e.g. Presale/Early Bird at 350k),
   *    it cannot be ignored to artificially qualify an event.
   * 4. Multi-day festival exception: Evaluated by lowest official full event / GA pass.
   * 5. Unannounced / missing price -> PENDING_VERIFICATION (quarantined).
   * 6. Lowest official tier < 500k -> EXCLUDED_PRICE_TOO_LOW (quarantined from public catalog).
   *
   * @param {object} eventData
   * @param {object} options
   * @returns {object} { qualified: boolean, meets_threshold: boolean, status: string, lowest_official_price: number|null, highest_official_price: number|null, reason: string }
   */
  static evaluateOfficialPriceQualification(eventData = {}, options = {}) {
    if (!eventData) {
      return {
        qualified: false,
        meets_threshold: false,
        status: 'PENDING_VERIFICATION',
        lowest_official_price: null,
        highest_official_price: null,
        reason: 'NULL_EVENT_DATA'
      };
    }

    const minThreshold = typeof options.minThreshold === 'number' ? options.minThreshold : OFFICIAL_MIN_TICKET_PRICE;

    let lowestOfficialPrice = null;
    let highestOfficialPrice = null;

    // 1. Evaluate explicit price tiers if provided
    if (Array.isArray(eventData.price_tiers) && eventData.price_tiers.length > 0) {
      const validTiers = eventData.price_tiers
        .map(t => ({
          name: t.name || '',
          price: Number(t.price !== undefined && t.price !== null ? t.price : (t.face_value !== undefined && t.face_value !== null ? t.face_value : 0)),
          is_single_day: /1-day|single|daily|1 day|harian/i.test(t.name || ''),
          is_full_pass: /full|3-day|2-day|pass|terusan/i.test(t.name || '')
        }))
        .filter(t => typeof t.price === 'number' && !isNaN(t.price) && t.price > 0);

      if (validTiers.length > 0) {
        const isFestival = eventData.is_festival === true ||
          (eventData.category || '').toUpperCase() === 'FESTIVAL' ||
          (eventData.event_type || '').toUpperCase() === 'FESTIVAL' ||
          /festival|fest\b/i.test(eventData.title || eventData.canonical_name || eventData.name || '');

        const fullPassTiers = validTiers.filter(t => t.is_full_pass);
        const hasSingleAndFull = validTiers.some(t => t.is_single_day) && fullPassTiers.length > 0;

        if (isFestival && hasSingleAndFull) {
          lowestOfficialPrice = Math.min(...fullPassTiers.map(t => t.price));
        } else {
          // Standard concert / live event: gate strictly on lowest tier (including presale/early bird/tribun)
          lowestOfficialPrice = Math.min(...validTiers.map(t => t.price));
        }
        highestOfficialPrice = Math.max(...validTiers.map(t => t.price));
      }
    }

    // 2. Fallback to flat/min/max fields if no tiers or tiers had no prices
    if (lowestOfficialPrice === null) {
      const candidatePrices = [];
      if (eventData.lowest_official_price !== undefined && eventData.lowest_official_price !== null) {
        const p = Number(eventData.lowest_official_price);
        if (!isNaN(p) && p > 0) candidatePrices.push(p);
      }
      if (eventData.price_min !== undefined && eventData.price_min !== null) {
        const p = Number(eventData.price_min);
        if (!isNaN(p) && p > 0) candidatePrices.push(p);
      }
      if (eventData.min_price !== undefined && eventData.min_price !== null) {
        const p = Number(eventData.min_price);
        if (!isNaN(p) && p > 0) candidatePrices.push(p);
      }
      if (eventData.price !== undefined && eventData.price !== null) {
        const p = Number(eventData.price);
        if (!isNaN(p) && p > 0) candidatePrices.push(p);
      }

      if (candidatePrices.length > 0) {
        lowestOfficialPrice = Math.min(...candidatePrices);
      }

      const maxCandidates = [];
      if (eventData.price_max !== undefined && eventData.price_max !== null) {
        const p = Number(eventData.price_max);
        if (!isNaN(p) && p > 0) maxCandidates.push(p);
      }
      if (eventData.max_price !== undefined && eventData.max_price !== null) {
        const p = Number(eventData.max_price);
        if (!isNaN(p) && p > 0) maxCandidates.push(p);
      }
      if (maxCandidates.length > 0) {
        highestOfficialPrice = Math.max(...maxCandidates);
      } else if (lowestOfficialPrice !== null) {
        highestOfficialPrice = lowestOfficialPrice;
      }
    }

    // 3. Evaluate qualification against threshold
    if (lowestOfficialPrice === null || isNaN(lowestOfficialPrice) || lowestOfficialPrice <= 0) {
      return {
        qualified: false,
        meets_threshold: false,
        status: 'PENDING_VERIFICATION',
        lowest_official_price: null,
        highest_official_price: highestOfficialPrice,
        reason: 'PRICE_UNANNOUNCED_OR_MISSING'
      };
    }

    const currency = (eventData.currency || eventData.currency_code || 'IDR').toUpperCase();
    const isForeignCurrency = currency !== 'IDR';
    let threshold = minThreshold;
    if (isForeignCurrency) {
      const foreignThresholds = {
        SGD: 40,
        MYR: 140,
        THB: 1100,
        PHP: 1500,
        VND: 100000,
        USD: 30
      };
      threshold = foreignThresholds[currency] !== undefined ? foreignThresholds[currency] : 0;
    }

    if (lowestOfficialPrice < threshold) {
      return {
        qualified: false,
        meets_threshold: false,
        status: 'EXCLUDED_PRICE_TOO_LOW',
        lowest_official_price: lowestOfficialPrice,
        highest_official_price: highestOfficialPrice,
        reason: `Lowest official ticket tier (${currency} ${lowestOfficialPrice.toLocaleString('id-ID')}) is below minimum ${currency} ${threshold.toLocaleString('id-ID')}`
      };
    }

    return {
      qualified: true,
      meets_threshold: true,
      status: 'QUALIFIED',
      lowest_official_price: lowestOfficialPrice,
      highest_official_price: highestOfficialPrice,
      reason: 'OFFICIAL_PRICE_QUALIFIED'
    };
  }

  /**
   * Helper returns boolean true if event meets strict official price threshold.
   */
  static isPriceQualified(eventData, minThreshold = OFFICIAL_MIN_TICKET_PRICE) {
    const result = this.evaluateOfficialPriceQualification(eventData, { minThreshold });
    return result.qualified === true;
  }
  /**
   * Retrieves registered operational capabilities for a source ID.
   */
  static getSourceCapability(sourceId) {
    if (SOURCE_CAPABILITIES[sourceId]) {
      return { ...SOURCE_CAPABILITIES[sourceId] };
    }
    if (sourceId && (sourceId.startsWith('src-promoter-') || sourceId.startsWith('src-official-'))) {
      return {
        name: 'Official Promoter / Primary Authority',
        approved_mode: SOURCE_MODES.PRIMARY_SOURCE_AUTHORITATIVE,
        has_live_network: true,
        anti_bot_policy: 'DIRECT_AUTHORITATIVE_SOURCE'
      };
    }
    return {
      name: sourceId || 'UNKNOWN',
      approved_mode: SOURCE_MODES.SNAPSHOT_ONLY,
      has_live_network: false,
      anti_bot_policy: 'DEFAULT_FAIL_CLOSED'
    };
  }

  /**
   * Enforces that snapshot data is never presented or flagged as live scraping.
   */
  static validateSourceProvenanceClaim(sourceId, isClaimedLive, isFromSnapshot) {
    if (isFromSnapshot && isClaimedLive) {
      throw new Error(`[CATALOG_POLICY_VIOLATION] Source ${sourceId} attempted to label snapshot/fixture data as live ingestion`);
    }
    const cap = this.getSourceCapability(sourceId);
    if (isClaimedLive && !cap.has_live_network) {
      throw new Error(`[CATALOG_POLICY_VIOLATION] Source ${sourceId} does not support live network ingestion (${cap.reason || 'No live crawler'})`);
    }
    return true;
  }

  /**
   * Computes resale availability invariants.
   * Resale tickets are ONLY available if active, verified listing count is strictly greater than 0.
   */
  static evaluateResaleAvailability(activeListingsCount) {
    const count = typeof activeListingsCount === 'number' ? Math.max(0, Math.floor(activeListingsCount)) : 0;
    return {
      resale_inventory_count: count,
      resale_available: count > 0,
      resale_notice: count === 0
        ? 'Belum ada tiket resale sekunder terverifikasi di TIKUM untuk event ini. TIKUM tidak membuat stok palsu atau harga fiktif.'
        : `Tersedia ${count} tiket resale sekunder terverifikasi dengan jaminan 100% perlindungan pembeli.`
    };
  }

  /**
   * Checks if an event has conflicting source data and requires quarantine.
   */
  static shouldQuarantineEvent(conflicts = [], status = '') {
    if (status === 'DATA_CONFLICT' || status === 'CONFLICTED' || status === 'QUARANTINED') {
      return true;
    }
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      // Disagreements in core attributes (date, venue, city) trigger mandatory quarantine
      const coreConflict = conflicts.some(c => 
        ['start_date', 'date', 'venue', 'venue_name', 'city'].includes(c.field || c.attribute)
      );
      if (coreConflict) return true;
    }
    return false;
  }
}

module.exports = {
  SOURCE_MODES,
  SOURCE_CAPABILITIES,
  OFFICIAL_MIN_TICKET_PRICE,
  CuratedCatalogPolicy
};
