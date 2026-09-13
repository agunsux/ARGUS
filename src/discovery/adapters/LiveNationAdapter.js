/**
 * Live Nation Global Tours Source Adapter
 * Tier 1: International Promoter Official Public Channel
 * 
 * Ingests official tour press releases and permitted public event calendars.
 * Marked as manual review / fixture mode unless explicit API license is attached.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class LiveNationAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-livenation', options = {}) {
    super(sourceId, options);
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    return {
      status: 'MANUAL_SOURCE_ONLY',
      reason: 'Live Nation requires official press release / manual registration protocol',
      events: []
    };
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
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || 'Jakarta',
      country: s.country || 'Indonesia',
      category: 'CONCERT',
      official_event_url: s.official_event_url || s.url || null,
      official_ticket_url: s.official_ticket_url || s.ticket_url || null,
      organizer_name: 'Live Nation',
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  LiveNationAdapter
};
