/**
 * Bandsintown Source Adapter
 * Trusted Primary Event Source
 * 
 * Ingests concert dates and tour stops from Bandsintown.
 * Produces the TIKUM Common Event Contract with deterministic fields.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');
const { EventNormalizationService } = require('../EventNormalizationService');

class BandsintownAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-bandsintown-jakarta', options = {}) {
    super(sourceId, options);
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
    return [];
  }

  parse(raw) {
    const s = super.parse(raw);
    const rawTitle = s.title || s.name || s.artist_name || (Array.isArray(s.artists) ? s.artists.join(', ') : s.artist) || 'Concert';
    const normTitle = EventNormalizationService.normalizeTitle(rawTitle);
    const venueRaw = s.venue_name || s.venue || (s.location && s.location.name) || 'Venue TBA';
    const cityRaw = s.city || (s.location && s.location.city) || 'Jakarta';
    const venueNorm = EventNormalizationService.normalizeVenue(venueRaw, cityRaw);

    const startDate = s.start_date || s.date || (s.datetime ? s.datetime.substring(0, 10) : null);
    const endDate = s.end_date || null;
    const eventUrl = s.official_event_url || s.event_url || s.url || s.source_url || (s.id ? `https://www.bandsintown.com/e/${s.id}` : 'https://www.bandsintown.com/');
    const sourceEventId = s.source_event_id || s.id || s.eventId || (s.url ? s.url.split('/').pop() : null);

    const price = s.price !== undefined && s.price !== null ? Number(s.price) : (s.min_price !== undefined ? Number(s.min_price) : (s.max_price !== undefined ? Number(s.max_price) : null));
    const minPrice = s.min_price !== undefined && s.min_price !== null ? Number(s.min_price) : price;
    const maxPrice = s.max_price !== undefined && s.max_price !== null ? Number(s.max_price) : price;

    const organizer = s.organizer_name || s.organizer || s.promoter || 'Bandsintown Concert Listing';

    return {
      // Common Event Contract (Phase 2)
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
      endDate: endDate,
      end_date: endDate,
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
      image_credit: 'Bandsintown',
      sourceFetchedAt: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      source_last_checked_at: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      sourceMetadata: s.raw_source_metadata || s.raw || null,
      official_event_url: eventUrl,
      official_ticket_url: s.official_ticket_url || s.ticket_url || eventUrl,
      artists: Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []),
      category: s.category || 'CONCERT',
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  BandsintownAdapter
};
