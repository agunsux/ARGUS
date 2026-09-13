/**
 * LOKET Source Adapter
 * Tier 2: Commercial Ticketing Platform
 * 
 * Supports structured public event catalog feeds and safe mock fixtures.
 * Does NOT scrape non-public surfaces or bypass anti-bot protections.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class LoketAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-loket', options = {}) {
    super(sourceId, options);
    this.feedUrl = options.feedUrl || process.env.LOKET_FEED_URL || null;
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    if (!this.feedUrl) {
      return {
        status: 'READY_PASSIVE',
        reason: 'LOKET partner feed URL not configured; running in passive ingestion mode',
        events: []
      };
    }

    return this.fetchWithRetry(async () => {
      const res = await fetch(this.feedUrl);
      if (!res.ok) throw new Error(`LOKET feed returned HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.events || data.data || []);
      return list.map(item => this.parse(item));
    });
  }

  parse(raw) {
    const s = super.parse(raw);
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.id || s.event_id || null,
      name: s.name || s.title,
      title: s.name || s.title,
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.venue_city || 'Jakarta',
      country: s.country || 'Indonesia',
      category: s.category || 'FESTIVAL',
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.url || null,
      official_ticketing_provider: 'LOKET',
      ticket_price: s.ticket_price || 'UNKNOWN',
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  LoketAdapter
};
