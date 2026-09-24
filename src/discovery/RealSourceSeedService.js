/**
 * TIKUM / ARGUS — Real Source Seed Service
 *
 * Materialises the committed official-source snapshot into canonical events at
 * application bootstrap, through the REAL ingestion pipeline (no shortcuts), so
 * every fail-closed invariant is enforced:
 *
 *   [SNAPSHOT] -> ingestEvent(authoritative claim)  -> canonical event VERIFIED
 *              -> ingestEvent(discovery claim)      -> corroboration + ticket URL
 *              -> attach Tier 3 social discovery linkage (provenance only)
 *              -> EventTemporalLifecycleEngine.reconcileAllEvents()
 *              -> canonicalRegistry.syncToState(state.events)
 *
 * ORDERING INVARIANT
 *   The authoritative Indonesian authority channel is ingested FIRST because the
 *   canonical event (and therefore its resolved official poster) is created on the
 *   first observation. The Tier 2 discovery/transaction source is ingested second
 *   to add independent corroboration and the official ticket destination.
 *
 * GATING
 *   Enabled by ARGUS_REAL_SOURCE_SEED=true, or automatically on production/Vercel
 *   runtimes. Never enabled under NODE_ENV=test so the deterministic test baseline
 *   (zero public events from unverified seed data) is preserved.
 */

const { ingestionPipeline } = require('./EventIngestionPipeline');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');
const { OfficialSourceSnapshotStore } = require('./OfficialSourceSnapshotStore');

// Registered Tier 3 discovery channels (@infokonser, @livenationasia, @ticketmasterasia).
const REGISTERED_SOCIAL_SIGNAL_SOURCE_IDS = [
  'src-ig-infokonser',
  'src-ig-livenationasia',
  'src-ig-ticketmasterasia'
];

class RealSourceSeedService {
  constructor() {
    this.lastReport = null;
  }

  /**
   * Whether bootstrap seeding should run for the current runtime.
   */
  static isEnabled() {
    if (process.env.ARGUS_REAL_SOURCE_SEED === 'true') return true;
    if (process.env.ARGUS_REAL_SOURCE_SEED === 'false') return false;
    if (process.env.NODE_ENV === 'test') return false;
    return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  }

  /**
   * Builds the claim payload for a snapshot record.
   * @param {object} record snapshot record
   * @param {'authoritative'|'discovery'} role
   */
  static buildPayload(record, role) {
    const isAuthoritative = role === 'authoritative';

    return {
      name: record.title,
      title: record.title,
      canonical_name: record.title,
      artists: Array.isArray(record.artists) ? record.artists : [],
      category: record.category || 'CONCERT',
      event_type: record.category || 'CONCERT',
      start_date: record.start_date,
      start_datetime: record.start_datetime || null,
      end_date: record.end_date || null,
      end_datetime: record.end_datetime || null,
      timezone: record.timezone || 'Asia/Jakarta',
      venue_name: record.venue_name,
      city: record.city || null,
      province: record.province || null,
      country: record.country || 'Indonesia',
      organizer_name: isAuthoritative ? (record.organizer || record.organizer_name || null) : (record.organizer_name || null),
      official_event_url: record.official_event_url || null,
      official_ticket_url: record.official_ticket_url || null,
      official_ticketing_provider: record.official_ticketing_provider || null,
      min_price: record.min_price || null,
      max_price: record.max_price || null,
      source_url: isAuthoritative ? record.authoritative_source_url : record.discovery_source_url,
      published_at: record.discovery_retrieved_at || null,
      status: 'UPCOMING',
      // Visual provenance is only attached on the authoritative claim so the
      // resolved poster is the official one (Tier 1).
      image_url: isAuthoritative ? (record.image_url || null) : null,
      image_source_type: isAuthoritative ? (record.image_source_type || null) : null,
      image_source_url: isAuthoritative ? (record.image_source_url || null) : null,
      image_credit: isAuthoritative ? (record.image_credit || null) : null,
      image_license: isAuthoritative ? (record.image_license_status || 'OFFICIAL_EVENT_PROMO') : null,
      image_scope: isAuthoritative ? 'LOCAL_EVENT' : null,

      // Tikum Zero-Fake 14 Schema Attributes
      artist_official_url: record.artist_official_url || null,
      artist_official_source_type: record.artist_official_source_type || null,
      artist_verification_status: record.artist_verification_status || null,
      promoter_official_url: record.promoter_official_url || null,
      promoter_verification_status: record.promoter_verification_status || null,
      event_official_url: record.event_official_url || record.official_event_url || null,
      event_verification_status: record.event_verification_status || null,
      ticketing_official_url: record.ticketing_official_url || record.official_ticket_url || null,
      ticketing_verification_status: record.ticketing_verification_status || null,
      venue_verification_status: record.venue_verification_status || null,
      verification_tier: record.verification_tier || null,
      verification_score: record.verification_score || null,
      last_verified_at: record.last_verified_at || null,
      next_verification_at: record.next_verification_at || null
    };
  }

  /**
   * Selects the registered Tier 3 discovery channel that announced this event class.
   */
  static resolveSocialSignalSourceId(record) {
    const discoverySource = record.discovery_source_id || '';
    if (discoverySource === 'src-livenation') return 'src-ig-livenationasia';
    if (discoverySource === 'src-loket' || discoverySource === 'src-bbo') return 'src-ig-infokonser';
    if (discoverySource === 'src-weverse' || discoverySource === 'src-yg-entertainment' || discoverySource === 'src-promoter-dyandra') return 'src-ig-infokonser';
    return null;
  }
  /**
   * Attaches the Tier 3 social discovery linkage to a canonical event as
   * READ-ONLY provenance. No claim is ingested, so the audit trail never
   * contains a fabricated post observation.
   */
  static attachSocialDiscoveryLinkage(canonicalEvent, record) {
    if (!canonicalEvent || !record) return null;
    const signalSourceId = RealSourceSeedService.resolveSocialSignalSourceId(record);
    if (!signalSourceId) return null;

    const ledgerEntry = OfficialSourceSnapshotStore
      .getDiscoverySignalsBySource(signalSourceId)
      .find(s => s && s.corroboration_rule_id === record.corroboration_rule_id) || null;

    const linkage = {
      source_id: signalSourceId,
      account_handle: ledgerEntry ? ledgerEntry.account_handle : null,
      profile_url: ledgerEntry ? ledgerEntry.profile_url : null,
      authority_role: 'DISCOVERY_SIGNAL',
      can_verify: false,
      capture_status: ledgerEntry ? ledgerEntry.capture_status : 'HANDLE_REGISTERED_NO_POST_CAPTURED',
      post_url: ledgerEntry && ledgerEntry.post_url ? ledgerEntry.post_url : null,
      automated_collection: false,
      note: 'Tier 3 social channel linkage. Instagram is login-gated and Meta ToS prohibit automated collection, so no post content is captured. Verification is established exclusively by the official Indonesian authority channel.'
    };

    canonicalEvent.social_discovery_signals = canonicalEvent.social_discovery_signals || [];
    if (!canonicalEvent.social_discovery_signals.some(s => s.source_id === linkage.source_id)) {
      canonicalEvent.social_discovery_signals.push(linkage);
    }
    return linkage;
  }
  /**
   * Seeds all authoritatively corroborated snapshot records.
   * @param {object} options
   * @param {function} options.log
   */
  async seed({ log = console.log } = {}) {
    const startedAt = new Date().toISOString();
    const records = OfficialSourceSnapshotStore.getVerifiedRecords();

    const report = {
      enabled: true,
      started_at: startedAt,
      snapshot_meta: OfficialSourceSnapshotStore.getSnapshotMeta(),
      records_seen: records.length,
      seeded: [],
      skipped: [],
      failed: []
    };

    if (records.length === 0) {
      log('[RealSourceSeed] No authoritatively corroborated snapshot records available; nothing seeded.');
      this.lastReport = report;
      return report;
    }

    for (const record of records) {
      const label = `${record.title} (${record.start_date})`;
      try {
        // 1. Authoritative Indonesian authority claim -> creates the canonical event.
        const authResult = await ingestionPipeline.ingestEvent(
          RealSourceSeedService.buildPayload(record, 'authoritative'),
          record.authoritative_source_id,
          {
            observed_at: record.authoritative_retrieved_at || new Date().toISOString(),
            published_at: record.discovery_retrieved_at || null,
            observation_id: `seed-auth-${record.corroboration_rule_id}`
          }
        );

        // 2. Discovery / transaction claim -> independent corroboration + ticket URL.
        await ingestionPipeline.ingestEvent(
          RealSourceSeedService.buildPayload(record, 'discovery'),
          record.discovery_source_id,
          {
            observed_at: record.discovery_retrieved_at || new Date().toISOString(),
            published_at: record.discovery_retrieved_at || null,
            observation_id: `seed-disc-${record.corroboration_rule_id}`
          }
        );

        const canonicalId = authResult && authResult.canonical_event ? authResult.canonical_event.event_id : null;
        const canonical = canonicalId ? canonicalRegistry.getEventById(canonicalId) : null;

        if (!canonical) {
          report.failed.push({ record: record.corroboration_rule_id, reason: 'canonical_event_missing_after_ingest' });
          continue;
        }

        // 3. Tier 3 social discovery linkage (provenance only, cannot verify).
        RealSourceSeedService.attachSocialDiscoveryLinkage(canonical, record);

        if (canonical.is_verified === true &&
            (canonical.verification_status === 'VERIFIED' || canonical.verification_status === 'PRIMARY_SOURCE_VERIFIED')) {
          report.seeded.push({
            event_id: canonical.event_id,
            title: canonical.title || canonical.canonical_name,
            start_date: canonical.start_date,
            city: canonical.city,
            verification_status: canonical.verification_status,
            verification_confidence: canonical.verification_confidence,
            has_image: Boolean(canonical.image_url),
            image_source_type: canonical.image_source_type || null,
            authoritative_source_id: record.authoritative_source_id,
            discovery_source_id: record.discovery_source_id
          });
          log(`[RealSourceSeed] VERIFIED  ${label} -> ${canonical.event_id} (confidence ${canonical.verification_confidence})`);
        } else {
          report.skipped.push({
            event_id: canonical.event_id,
            title: canonical.title || canonical.canonical_name,
            verification_status: canonical.verification_status,
            reasons: canonical.verification_reasons || []
          });
          log(`[RealSourceSeed] NOT PUBLIC ${label} -> ${canonical.verification_status}`);
        }
      } catch (err) {
        report.failed.push({ record: record.corroboration_rule_id, reason: err && err.message ? err.message : String(err) });
        log(`[RealSourceSeed] FAILED ${label}: ${err && err.message ? err.message : err}`);
      }
    }

    // Reconcile temporal lifecycle and project canonical events into state.events.
    try {
      await EventTemporalLifecycleEngine.reconcileAllEvents();
    } catch (err) {
      log(`[RealSourceSeed] Lifecycle reconciliation warning: ${err && err.message ? err.message : err}`);
    }
    try {
      canonicalRegistry.syncToState(require('../database').state.events);
    } catch (err) {
      log(`[RealSourceSeed] State projection warning: ${err && err.message ? err.message : err}`);
    }

    report.finished_at = new Date().toISOString();
    report.public_verified_upcoming = report.seeded.length;
    this.lastReport = report;

    log(`[RealSourceSeed] Done: ${report.seeded.length} verified, ${report.skipped.length} not public, ${report.failed.length} failed.`);
    return report;
  }
}

const realSourceSeedService = new RealSourceSeedService();

module.exports = {
  RealSourceSeedService,
  realSourceSeedService,
  REGISTERED_SOCIAL_SIGNAL_SOURCE_IDS
};
