/**
 * ARGUS / TIKUM Event Discovery Signal Service
 * 
 * Manages social event discovery signals and orchestrates their promotion to Canonical Events.
 * 
 * Architectural Rule: "Follow the Promoter"
 * 1. Post from a VERIFIED official promoter account:
 *    -> Directly creates or updates CanonicalEvent via EventIngestionPipeline
 *    -> Status: PRIMARY_SOURCE_VERIFIED, confidence: HIGH
 *    -> Does NOT require a second source prior to creation!
 * 2. Post from an UNVERIFIED promoter account (DISCOVERED / IDENTITY_MATCHED):
 *    -> Staged as EventDiscoverySignal (NEEDS_VERIFICATION)
 *    -> Held in staging until promoter identity is verified or secondary corroboration is received
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { promoterRegistry, PROMOTER_STATUS } = require('./PromoterDiscoveryRegistry');
const { ingestionPipeline } = require('./EventIngestionPipeline');
const { sourceRegistry } = require('./SourceRegistry');

const SIGNAL_STATUS = {
  NEW: 'NEW',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  STALE: 'STALE'
};

class EventDiscoverySignalService {
  constructor() {
    this.signals = new Map(); // signal_id -> signal
  }

  /**
   * Ingests a social post announcement from a promoter Instagram account.
   * Enforces Tier S primary source promotion if the account is verified.
   */
  async processSocialPost(postPayload, promoterIdentifier) {
    let promoter = promoterRegistry.getPromoterById(promoterIdentifier) ||
                   promoterRegistry.getPromoterByHandle(promoterIdentifier) ||
                   promoterRegistry.getPromoterBySlug(promoterIdentifier);

    if (!promoter && postPayload.instagram_handle) {
      promoter = promoterRegistry.getPromoterByHandle(postPayload.instagram_handle);
    }

    const signalId = postPayload.signal_id || `sig-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    const observedAt = postPayload.observed_at || now;
    const publishedAt = postPayload.published_at || null;
    const postUrl = postPayload.post_url || postPayload.url || null;

    const rawTitle = postPayload.event_name || postPayload.name || postPayload.title;
    const rawDate = postPayload.start_date || postPayload.date || postPayload.start_datetime;
    const rawVenue = postPayload.venue_name || postPayload.venue;
    const rawCity = postPayload.city || postPayload.venue_city || (promoter ? promoter.city : 'Jakarta');
    const rawArtists = Array.isArray(postPayload.artists) ? postPayload.artists : (postPayload.artist ? [postPayload.artist] : []);
    const rawTicketUrl = postPayload.official_ticket_url || postPayload.ticket_url || null;

    // Generate SHA-256 fingerprint of content claims
    const fingerprintPayload = {
      title: rawTitle,
      date: rawDate,
      venue: rawVenue,
      artists: rawArtists,
      ticket_url: rawTicketUrl,
      post_url: postUrl,
      published_at: publishedAt
    };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex').substring(0, 16);

    const isVerifiedPromoter = promoter && promoter.verification_status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT;

    const signal = {
      signal_id: signalId,
      promoter_id: promoter ? promoter.promoter_id : null,
      promoter_name: promoter ? promoter.canonical_name : (postPayload.promoter_name || 'Unknown Organizer'),
      instagram_handle: promoter ? promoter.instagram_handle : (postPayload.instagram_handle || null),
      source_id: (promoter && promoter.source_id) || (postPayload.instagram_handle ? `src-social-${postPayload.instagram_handle.replace('@', '')}` : 'src-social-signal'),
      post_url: postUrl,
      observed_at: observedAt,
      published_at: publishedAt,
      content_fingerprint: fingerprint,
      event_name_candidate: rawTitle,
      date_candidate: rawDate,
      venue_candidate: rawVenue,
      city_candidate: rawCity,
      artists_candidate: rawArtists,
      ticket_url_candidate: rawTicketUrl,
      ticket_price: postPayload.ticket_price || 'UNKNOWN',
      status: isVerifiedPromoter ? SIGNAL_STATUS.VERIFIED : SIGNAL_STATUS.NEEDS_VERIFICATION,
      is_primary_source: isVerifiedPromoter,
      created_at: now,
      updated_at: now
    };

    this.signals.set(signalId, signal);

    if (isVerifiedPromoter) {
      // TIER S PRIMARY EVENT SOURCE:
      // Directly create or update canonical event via existing EventIngestionPipeline
      const sourceId = promoter.source_id || `src-promoter-${promoter.slug}-instagram`;
      
      // Ensure source exists in sourceRegistry
      if (!sourceRegistry.getSource(sourceId)) {
        sourceRegistry.registerVerifiedPromoterSocial(
          promoter.promoter_id,
          promoter.canonical_name,
          promoter.instagram_handle,
          promoter.instagram_url
        );
      }

      const rawIngestPayload = {
        name: rawTitle,
        start_date: rawDate,
        venue_name: rawVenue,
        city: rawCity,
        artists: rawArtists,
        official_ticket_url: rawTicketUrl,
        ticket_price: postPayload.ticket_price || 'UNKNOWN',
        organizer_name: promoter.canonical_name,
        post_url: postUrl,
        published_at: publishedAt,
        status: postPayload.status || 'UPCOMING'
      };

      const observationMeta = {
        observation_id: `obs-${signalId}`,
        source_id: sourceId,
        post_url: postUrl,
        observed_at: observedAt,
        published_at: publishedAt,
        content_fingerprint: fingerprint
      };

      const ingestResult = await ingestionPipeline.ingestEvent(
        rawIngestPayload,
        sourceId,
        observationMeta
      );

      signal.canonical_event_id = ingestResult.canonical_event ? ingestResult.canonical_event.event_id : null;
      signal.dedup_action = ingestResult.dedup_action;

      return {
        success: true,
        action: 'CANONICAL_EVENT_PROMOTED',
        signal,
        canonical_event: ingestResult.canonical_event,
        verification_status: ingestResult.canonical_event.verification_status,
        verification_confidence: ingestResult.canonical_event.verification_confidence,
        changes: ingestResult.changes || []
      };
    } else {
      // Unverified account remains a discovery signal
      return {
        success: true,
        action: 'DISCOVERY_SIGNAL_STAGED',
        signal,
        reason: 'Account is not yet a verified official promoter; requires identity resolution or secondary corroboration'
      };
    }
  }

  /**
   * Manually verifies a staged discovery signal and promotes it to a canonical event.
   */
  async verifySignal(signalId, { verified_by = 'admin', overridePayload = {} } = {}) {
    const signal = this.signals.get(signalId);
    if (!signal) throw new Error(`Signal ${signalId} not found`);

    const now = new Date().toISOString();
    signal.status = SIGNAL_STATUS.VERIFIED;
    signal.verified_by = verified_by;
    signal.verified_at = now;
    signal.updated_at = now;

    const sourceId = signal.source_id && sourceRegistry.getSource(signal.source_id) ? 
      signal.source_id : 'src-argus-community';

    const rawIngestPayload = {
      name: overridePayload.name || signal.event_name_candidate,
      start_date: overridePayload.start_date || signal.date_candidate,
      venue_name: overridePayload.venue_name || signal.venue_candidate,
      city: overridePayload.city || signal.city_candidate,
      artists: overridePayload.artists || signal.artists_candidate,
      official_ticket_url: overridePayload.official_ticket_url || signal.ticket_url_candidate,
      organizer_name: signal.promoter_name,
      post_url: signal.post_url
    };

    const ingestResult = await ingestionPipeline.ingestEvent(rawIngestPayload, sourceId);
    signal.canonical_event_id = ingestResult.canonical_event ? ingestResult.canonical_event.event_id : null;

    return {
      success: true,
      signal,
      canonical_event: ingestResult.canonical_event
    };
  }

  rejectSignal(signalId, reason = 'Invalid or unverified claims') {
    const signal = this.signals.get(signalId);
    if (!signal) throw new Error(`Signal ${signalId} not found`);

    signal.status = SIGNAL_STATUS.REJECTED;
    signal.rejection_reason = reason;
    signal.updated_at = new Date().toISOString();
    return signal;
  }

  getSignalById(id) {
    return this.signals.get(id) || null;
  }

  getAllSignals(filter = {}) {
    let list = Array.from(this.signals.values());
    if (filter.status) {
      list = list.filter(s => s.status === filter.status.toUpperCase());
    }
    if (filter.promoter_id) {
      list = list.filter(s => s.promoter_id === filter.promoter_id);
    }
    return list;
  }

  reset() {
    this.signals.clear();
  }
}

const eventDiscoverySignalServiceInstance = new EventDiscoverySignalService();

module.exports = {
  EventDiscoverySignalService,
  discoverySignalService: eventDiscoverySignalServiceInstance,
  SIGNAL_STATUS
};
