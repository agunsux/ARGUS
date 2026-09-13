/**
 * Tiket.com Source Adapter
 * Tier 2: Commercial Ticketing Platform
 * 
 * Supports structured partner catalog feeds and safe mock fixtures.
 * Does NOT scrape non-public surfaces or bypass anti-bot protections.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

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
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.id || s.eventId || null,
      name: s.name || s.title || s.eventName,
      title: s.name || s.title || s.eventName,
      start_date: s.start_date || s.date || s.startDate,
      start_datetime: s.start_datetime || s.startDateTime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.location || 'Jakarta',
      country: s.country || 'Indonesia',
      category: s.category || 'KONSER',
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.url || null,
      official_ticketing_provider: 'tiket.com',
      ticket_price: s.ticket_price || s.price || 'UNKNOWN',
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  TiketComAdapter
};
