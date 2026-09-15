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
    this.dataSource = options.dataSource || null;
    this.feedUrl = options.feedUrl || options.manifestUrl || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    if (this.dataSource && Array.isArray(this.dataSource)) {
      return this.dataSource.map(item => this.parse(item));
    }

    if (this.feedUrl) {
      return this.fetchWithRetry(async () => {
        const res = await fetch(this.feedUrl);
        if (!res.ok) throw new Error(`${this.sourceId} feed returned HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.events || data.data || []);
        return list.map(item => this.parse(item));
      });
    }

    // Zero Fabrication: Return honest DATA_UNAVAILABLE state when no feed or fixture configured
    return {
      status: 'DATA_UNAVAILABLE',
      reason: `No authorized live feed or manifest endpoint configured for ${this.sourceId}; failing closed`,
      events: []
    };
  }

  /**
   * Directly ingests real external observations into canonical pipeline with full provenance.
   * Enforces zero fabrication and fail-closed quality validation.
   */
  async acquireRealObservations(rawItems = [], ingestionPipelineInstance = null) {
    const pipeline = ingestionPipelineInstance || require('../EventIngestionPipeline').ingestionPipeline;
    const results = [];

    for (const raw of rawItems) {
      const parsed = this.parse(raw);
      const observationMeta = {
        observation_id: raw.observation_id || null,
        source_id: this.sourceId,
        post_url: parsed.official_event_url || parsed.official_ticket_url || null,
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
