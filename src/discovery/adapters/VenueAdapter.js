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
    this.dataSource = options.dataSource || null;
    this.calendarUrl = options.calendarUrl || options.feedUrl || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    if (this.dataSource && Array.isArray(this.dataSource)) {
      return this.dataSource.map(item => this.parse(item));
    }

    if (this.calendarUrl) {
      return this.fetchWithRetry(async () => {
        const res = await fetch(this.calendarUrl);
        if (!res.ok) throw new Error(`${this.sourceId} calendar returned HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.events || data.calendar || data.data || []);
        return list.map(item => this.parse(item));
      });
    }

    return {
      status: 'DATA_UNAVAILABLE',
      reason: `No authorized live calendar endpoint configured for ${this.sourceId}; failing closed`,
      events: []
    };
  }

  /**
   * Directly ingests real external venue observations into canonical pipeline with full provenance.
   */
  async acquireRealObservations(rawItems = [], ingestionPipelineInstance = null) {
    const pipeline = ingestionPipelineInstance || require('../EventIngestionPipeline').ingestionPipeline;
    const results = [];

    for (const raw of rawItems) {
      const parsed = this.parse(raw);
      const observationMeta = {
        observation_id: raw.observation_id || null,
        source_id: this.sourceId,
        post_url: parsed.official_event_url || null,
        published_at: raw.published_at || null,
        observed_at: raw.observed_at || new Date().toISOString()
      };

      const result = await pipeline.ingestEvent(parsed, this.sourceId, observationMeta);
      results.push(result);
    }

    return {
      source_id: this.sourceId,
      total_acquired: results.length,
      acquisitions: results
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
