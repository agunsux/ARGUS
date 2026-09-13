/**
 * Official Promoter Source Adapter
 * Tier 1: Authoritative Event Source
 * 
 * Handles official promoter structured feeds, APMI official member updates,
 * and verified institutional announcements.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class PromoterAdapter extends EventSourceAdapter {
  constructor(sourceId, options = {}) {
    super(sourceId, options);
    this.promoterName = options.promoterName || 'Official Promoter';
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }
    return [];
  }

  parse(raw) {
    const s = super.parse(raw);
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.id || null,
      name: s.canonical_name || s.name || s.title,
      title: s.canonical_name || s.name || s.title,
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.venue_city || 'Jakarta',
      country: s.country || 'Indonesia',
      category: s.category || s.event_type || 'CONCERT',
      official_event_url: s.official_event_url || s.official_link || s.url || null,
      official_ticket_url: s.official_ticket_url || s.ticket_url || null,
      official_ticketing_provider: s.official_ticketing_provider || null,
      organizer_name: s.organizer_name || this.promoterName,
      artists: Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []),
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  PromoterAdapter
};
