/**
 * Artatix Source Adapter
 * Ticketing Platform for Campus Concerts, Music Festivals & Regional Live Events in Central Java & DIY
 * 
 * Ingests structured ticketing observations.
 * Fail-closed passive mode if feed URL is unconfigured.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class ArtatixAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-artatix', options = {}) {
    super(sourceId, options);
    this.feedUrl = options.feedUrl || process.env.ARTATIX_FEED_URL || null;
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    if (!this.feedUrl) {
      return {
        status: 'READY_PASSIVE',
        reason: 'Artatix partner feed URL not configured; running in passive ingestion mode',
        events: []
      };
    }

    return this.fetchWithRetry(async () => {
      const res = await fetch(this.feedUrl);
      if (!res.ok) throw new Error(`Artatix feed returned HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.events || data.data || []);
      return list.map(item => this.parse(item));
    });
  }

  parse(raw) {
    const s = super.parse(raw);
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.id || null,
      name: s.name || s.title,
      title: s.name || s.title,
      artist: s.artist || null,
      artists: s.artists || (s.artist ? [s.artist] : []),
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.venue_city || 'Yogyakarta',
      province: s.province || 'DI Yogyakarta',
      country: s.country || 'Indonesia',
      category: s.category || 'CONCERT',
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.url || null,
      official_ticketing_provider: 'Artatix',
      ticket_price: s.ticket_price || (s.price_min ? { min: s.price_min, max: s.price_max } : 'UNKNOWN'),
      status: s.status || 'UPCOMING'
    };
  }
}

module.exports = {
  ArtatixAdapter
};

