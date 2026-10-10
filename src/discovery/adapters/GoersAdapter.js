/**
 * GOERS Source Adapter
 * Trusted Primary Event Source
 * 
 * OPERATIONAL MODE: SNAPSHOT-FIRST / PASSIVE
 *   - Public web probing to https://www.goersapp.com/events returns HTTP 403 (Cloudflare Bot Management).
 *   - Partner feed (GOERS_FEED_URL) is currently null / unconfigured.
 *   - Reads exclusively from committed OfficialSourceSnapshotStore or fixtures without bypassing access controls.
 *   - Produces the TIKUM Common Event Contract with deterministic fields.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');
const { EventNormalizationService } = require('../EventNormalizationService');

class GoersAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-goers', options = {}) {
    super(sourceId, options);
    this.feedUrl = options.feedUrl || process.env.GOERS_FEED_URL || null;
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    const snapshotRecords = OfficialSourceSnapshotStore.getRecordsBySource(this.sourceId);
    if (snapshotRecords && snapshotRecords.length > 0) {
      return snapshotRecords.map(rec => this.parse(rec));
    }

    if (!this.feedUrl) {
      return {
        status: 'READY_PASSIVE',
        reason: 'GOERS partner feed URL not configured; running in passive ingestion mode',
        events: []
      };
    }

    return this.fetchWithRetry(async () => {
      const res = await fetch(this.feedUrl);
      if (!res.ok) throw new Error(`GOERS feed returned HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.events || data.data || []);
      return list.map(item => this.parse(item));
    });
  }

  /**
   * Probes public GOERS web endpoints legitimately without WAF/Cloudflare bypass.
   * Returns honest telemetry regarding accessibility.
   */
  async probePublicWeb() {
    const targetUrl = 'https://www.goersapp.com/events';
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      return {
        endpoint: targetUrl,
        http_status: res.status,
        is_blocked: res.status === 403,
        reason: res.status === 403 ? 'CLOUDFLARE_BOT_MANAGEMENT_CHALLENGE' : `HTTP_${res.status}`,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        endpoint: targetUrl,
        http_status: null,
        is_blocked: true,
        reason: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  parse(raw) {
    const rawTitle = (raw && (raw.title || raw.name)) ? (raw.title || raw.name) : 'Event';
    const rawVenue = (raw && (raw.venue_name || raw.venue)) ? (raw.venue_name || raw.venue) : 'Venue TBA';
    const rawOrganizer = (raw && (raw.organizer_name || raw.organizer || raw.promoter)) ? (raw.organizer_name || raw.organizer || raw.promoter) : 'Goers Partner';
    const s = super.parse(raw);
    const normTitle = EventNormalizationService.normalizeTitle(rawTitle);
    const venueRaw = s.venue_name || s.venue || 'Venue TBA';
    const cityRaw = s.city || s.venue_city || 'Jakarta';
    const venueNorm = EventNormalizationService.normalizeVenue(venueRaw, cityRaw);

    const startDate = s.start_date || s.date || null;
    const endDate = s.end_date || null;
    const eventUrl = s.official_event_url || s.event_url || s.official_ticket_url || s.ticket_url || s.url || s.source_url || (s.id ? `https://goersapp.com/events/${s.id}` : 'https://goersapp.com/');
    const sourceEventId = s.source_event_id || s.id || s.eventId || null;

    const price = s.price !== undefined && s.price !== null ? Number(s.price) : (s.min_price !== undefined ? Number(s.min_price) : (s.max_price !== undefined ? Number(s.max_price) : null));
    const minPrice = s.min_price !== undefined && s.min_price !== null ? Number(s.min_price) : price;
    const maxPrice = s.max_price !== undefined && s.max_price !== null ? Number(s.max_price) : price;

    const organizer = s.organizer_name || s.organizer || s.promoter || 'Goers Partner';

    if (raw && typeof raw === 'object') {
      raw.rawId = sourceEventId;
      raw.rawTitle = rawTitle;
      raw.rawVenue = rawVenue;
      raw.rawCity = raw.city || raw.venue_city || cityRaw;
      raw.rawDate = raw.start_date || raw.date || startDate;
      raw.rawOrganizer = rawOrganizer;
      raw.rawPlatform = 'GOERSapp';
      raw.source_name = 'GOERSapp';
    }

    return {
      // Common Event Contract & Raw Provenance
      raw_source: raw,
      rawTitle: rawTitle,
      rawVenue: rawVenue,
      rawCity: raw.city || raw.venue_city || cityRaw,
      rawDate: raw.start_date || raw.date || startDate,
      rawOrganizer: rawOrganizer,
      title: rawTitle,
      normalizedTitle: normTitle,
      name: normTitle,
      canonical_name: normTitle,
      eventUrl: eventUrl,
      source: this.sourceId,
      source_id: this.sourceId,
      sourceEventId: sourceEventId,
      source_event_id: sourceEventId,
      startDate: startDate,
      start_date: startDate,
      start_datetime: s.start_datetime || null,
      endDate: endDate,
      end_date: endDate,
      end_datetime: s.end_datetime || null,
      venueName: venueRaw,
      venue_name: venueRaw,
      normalizedVenueName: venueNorm.venue_name,
      city: venueNorm.city || cityRaw,
      country: s.country || 'Indonesia',
      organizerName: organizer,
      organizer_name: organizer,
      normalizedOrganizerName: EventNormalizationService.normalizeTitle(organizer),
      price: price,
      min_price: minPrice,
      max_price: maxPrice,
      currency: s.currency || 'IDR',
      imageUrl: s.image_url || s.imageUrl || s.poster_url || null,
      image_url: s.image_url || s.imageUrl || s.poster_url || null,
      image_source_type: 'PRIMARY_TRUSTED_SOURCE',
      image_source_url: eventUrl,
      image_credit: 'Goers',
      sourceFetchedAt: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      source_last_checked_at: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      sourceMetadata: s.raw_source_metadata || s.raw || null,
      official_event_url: eventUrl,
      official_ticket_url: s.official_ticket_url || s.ticket_url || eventUrl,
      official_ticketing_provider: 'GOERS',
      ticket_price: s.ticket_price || (price ? String(price) : 'UNKNOWN'),
      category: s.category || 'MUSIC_GIG',
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  GoersAdapter
};
