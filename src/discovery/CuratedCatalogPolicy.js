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

class CuratedCatalogPolicy {
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
  CuratedCatalogPolicy
};
