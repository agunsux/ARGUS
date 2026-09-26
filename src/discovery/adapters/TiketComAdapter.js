/**
 * Tiket.com Source Adapter
 * Tier 1: Indonesian Primary Ticketing Platform & OTA (TRANSACTION & DISCOVERY SOURCE)
 * 
 * Supports structured partner catalog feeds, snapshot store, and safe fixtures.
 * Does NOT scrape non-public surfaces or bypass anti-bot protections.
 * Strict no-fabrication policy: missing fields are returned as null.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');

class TiketComAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-tiket-com', options = {}) {
    super(sourceId, options);
    this.feedUrl = options.feedUrl || process.env.TIKET_COM_FEED_URL || null;
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    // In passive ingestion mode, query committed snapshot records
    const snapshotRecords = OfficialSourceSnapshotStore.getRecordsBySource(this.sourceId);
    if (snapshotRecords.length > 0) {
      return snapshotRecords.map(rec => this.parse(rec));
    }

    if (!this.feedUrl) {
      return {
        status: 'READY_PASSIVE',
        reason: 'Tiket.com partner feed URL not configured; running in passive ingestion mode',
        events: []
      };
    }

    return this.fetchWithRetry(async () => {
      const res = await fetch(this.feedUrl);
      if (!res.ok) throw new Error(`Tiket.com feed returned HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.events || data.data || []);
      return list.map(item => this.parse(item));
    });
  }

  parse(raw) {
    const s = super.parse(raw);
    const artists = Array.isArray(s.artists)
      ? s.artists
      : (s.artist ? [s.artist] : (s.lineup ? (Array.isArray(s.lineup) ? s.lineup : [s.lineup]) : []));

    const title = s.name || s.title || s.eventName || null;
    const startDate = s.start_date || s.date || s.startDate || null;
    const startDatetime = s.start_datetime || s.startDateTime || (s.event_start_at || null);
    const endDate = s.end_date || s.endDate || null;
    const endDatetime = s.end_datetime || s.endDateTime || (s.event_end_at || null);

    let startTime = s.start_time || s.time || null;
    if (!startTime && startDatetime && startDatetime.includes('T')) {
      startTime = startDatetime.split('T')[1].substring(0, 5);
    }

    let endTime = s.end_time || null;
    if (!endTime && endDatetime && endDatetime.includes('T')) {
      endTime = endDatetime.split('T')[1].substring(0, 5);
    }

    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.id || s.eventId || s.slug || null,
      name: title,
      title: title,
      artist: artists.length > 0 ? artists[0] : null,
      artists: artists,
      start_date: startDate,
      start_time: startTime,
      start_datetime: startDatetime,
      end_date: endDate,
      end_time: endTime,
      end_datetime: endDatetime,
      timezone: s.timezone || s.event_timezone || 'Asia/Jakarta',
      venue_name: s.venue_name || s.venue || null,
      city: s.city || s.location || s.venue_city || null,
      province: s.province || null,
      country: s.country || 'Indonesia',
      promoter: s.organizer_name || s.organizer || s.promoter || null,
      organizer_name: s.organizer_name || s.organizer || s.promoter || null,
      category: s.category || 'CONCERT',
      official_event_url: s.official_event_url || s.event_url || null,
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.url || null,
      official_ticketing_provider: 'tiket.com',
      ticket_status: s.ticket_status || (s.status === 'SOLD_OUT' ? 'SOLD_OUT' : (s.official_ticket_url ? 'ON_SALE' : 'UPCOMING')),
      min_price: s.min_price !== undefined && s.min_price !== null ? Number(s.min_price) : (s.price_min !== undefined ? Number(s.price_min) : null),
      max_price: s.max_price !== undefined && s.max_price !== null ? Number(s.max_price) : (s.price_max !== undefined ? Number(s.price_max) : null),
      price: s.min_price !== undefined && s.min_price !== null ? Number(s.min_price) : (s.max_price !== undefined && s.max_price !== null ? Number(s.max_price) : (s.price !== undefined ? Number(s.price) : null)),
      ticket_price: s.ticket_price || (s.min_price ? String(s.min_price) : null),
      currency: s.currency || 'IDR',
      image_url: s.image_url || s.image || s.poster_url || null,
      imageUrl: s.image_url || s.image || s.poster_url || null,
      image_source_type: s.image_source_type || 'OFFICIAL_TICKETING',
      image_credit: s.image_credit || 'tiket.com',
      eventUrl: s.official_ticket_url || s.ticket_url || s.official_event_url || s.url || null,
      source: this.sourceId,
      sourceEventId: s.source_event_id || s.id || s.eventId || s.slug || null,
      startDate: startDate,
      endDate: endDate,
      venueName: s.venue_name || s.venue || null,
      normalizedVenueName: s.venue_name || s.venue || null,
      organizerName: s.organizer_name || s.organizer || s.promoter || null,
      normalizedOrganizerName: s.organizer_name || s.organizer || s.promoter || null,
      sourceFetchedAt: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      sourceMetadata: s.raw_source_metadata || s.raw || raw || null,
      source_publication_timestamp: s.source_publication_timestamp || s.published_at || s.discovery_retrieved_at || null,
      source_last_checked_at: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      raw_source_metadata: s.raw_source_metadata || s.raw || raw || null,
      status: s.status || 'UPCOMING'
    };
  }
}

const TiketAdapter = TiketComAdapter;

module.exports = {
  TiketComAdapter,
  TiketAdapter
};

