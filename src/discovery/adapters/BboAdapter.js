/**
 * BBO Events Source Adapter (bbo.co.id)
 * Trusted Primary Event Source
 *
 * Supports structured event feeds, server-rendered listings, and snapshot store.
 * Produces the TIKUM Common Event Contract with deterministic fields.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');
const { EventNormalizationService } = require('../EventNormalizationService');

const BBO_CARD_PATTERN = /<a href="(https:\/\/bbo\.co\.id\/bbo\/[^"]+)"[\s\S]{0,2200}?c-events-card__content">([\s\S]{0,400}?)<\/p>/gi;

class BboAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-bbo', options = {}) {
    super(sourceId, options);
    this.fixtureData = options.fixtureData || null;
  }

  /**
   * Reads BBO observations from the committed snapshot or fixture data.
   */
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
    const rawTitle = s.title || s.name || 'Event';
    const normTitle = EventNormalizationService.normalizeTitle(rawTitle);
    const venueRaw = s.venue_name || s.venue || 'Venue TBA';
    const cityRaw = s.city || s.venue_city || 'Jakarta';
    const venueNorm = EventNormalizationService.normalizeVenue(venueRaw, cityRaw);

    const startDate = s.start_date || s.date || null;
    const endDate = s.end_date || null;
    const eventUrl = s.official_event_url || s.event_url || s.official_ticket_url || s.ticket_url || s.url || s.source_url || (s.source_event_id ? `https://bbo.co.id/event/${s.source_event_id}` : 'https://bbo.co.id/');
    const sourceEventId = s.source_event_id || s.bbo_event_id || s.id || null;

    const price = s.price !== undefined && s.price !== null ? Number(s.price) : (s.min_price !== undefined ? Number(s.min_price) : (s.max_price !== undefined ? Number(s.max_price) : null));
    const minPrice = s.min_price !== undefined && s.min_price !== null ? Number(s.min_price) : price;
    const maxPrice = s.max_price !== undefined && s.max_price !== null ? Number(s.max_price) : price;

    const organizer = s.organizer_name || s.organizer || s.promoter || 'BBO Partner';

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
      start_datetime: s.start_datetime || null,
      observed_month_day: s.observed_month_day || null,
      year_resolved: s.year_resolved !== false,
      endDate: endDate,
      end_date: endDate,
      end_datetime: s.end_datetime || null,
      venueName: venueRaw,
      venue_name: venueRaw,
      normalizedVenueName: venueNorm.venue_name,
      city: venueNorm.city || cityRaw,
      province: s.province || null,
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
      image_credit: 'BBO Events',
      sourceFetchedAt: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      source_last_checked_at: s.source_last_checked_at || s.retrieved_at || new Date().toISOString(),
      sourceMetadata: s.raw_source_metadata || s.raw || null,
      official_event_url: eventUrl,
      official_ticket_url: s.official_ticket_url || s.ticket_url || eventUrl,
      official_ticketing_provider: 'BBO',
      ticket_price: s.ticket_price || (price ? String(price) : 'UNKNOWN'),
      category: s.category || 'MUSIC_GIG',
      status: s.status || 'UPCOMING'
    };
  }

  /**
   * Parses the server-rendered BBO events listing into factual observation records.
   */
  static parseListingHtml(html) {
    if (!html || typeof html !== 'string') return [];
    const records = [];
    const seen = new Set();

    for (const match of html.matchAll(BBO_CARD_PATTERN)) {
      const url = match[1];
      if (seen.has(url)) continue;
      seen.add(url);

      const block = match[0];
      const month = (block.match(/c-events-card__month">\s*([A-Za-z]{3})/) || [])[1] || null;
      const day = (block.match(/c-events-card__day">\s*(\d{1,2})/) || [])[1] || null;
      const title = (block.match(/c-events-card__title">\s*([^<]{2,120})/) || [])[1] || null;
      const banner = (block.match(/src="(https:\/\/storage\.googleapis\.com\/bbo-images\/[^"]+)"/) || [])[1] || null;
      const eventId = (url.match(/-evnt(\d+)$/) || [])[1] || null;

      records.push({
        source_event_id: eventId,
        title: title ? title.trim() : null,
        name: title ? title.trim() : null,
        observed_month_day: month && day ? `${month} ${day}` : null,
        start_date: null,
        year_resolved: false,
        official_event_url: url,
        image_url: banner,
        image_source_url: 'https://bbo.co.id/feature-bbo-events.html',
        image_source_type: 'OFFICIAL_TICKETING',
        image_credit: 'BBO Events'
      });
    }

    return records;
  }
}

module.exports = {
  BboAdapter
};
