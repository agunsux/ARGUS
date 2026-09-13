/**
 * Official Venue & Sports Organization Source Adapter
 * Tier 1: Authoritative Spatial / League Source
 * 
 * Ingests official venue calendars (PPK GBK, JIExpo, ICE BSD) and sports governing body fixtures (IBL, LIB).
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class VenueAdapter extends EventSourceAdapter {
  constructor(sourceId, options = {}) {
    super(sourceId, options);
    this.venueName = options.venueName || 'Venue Authority';
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
      name: s.name || s.title,
      title: s.name || s.title,
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      venue_id: s.venue_id || null,
      venue_name: s.venue_name || this.venueName,
      city: s.city || s.venue_city || 'Jakarta',
      country: s.country || 'Indonesia',
      category: s.category || (this.sourceId.includes('ibl') ? 'BASKETBALL' : 'SPORT'),
      official_event_url: s.official_event_url || s.url || null,
      official_ticket_url: s.official_ticket_url || null,
      organizer_name: s.organizer_name || this.venueName,
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  VenueAdapter
};
