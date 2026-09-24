/**
 * BBO Events Source Adapter (bbo.co.id)
 * Tier 2: Indonesian Event Listing & Ticketing Portal
 *
 * COMPLIANCE (audited 2026-09-25):
 *   - robots.txt => `User-agent: * / Disallow:` (empty directive, crawling permitted).
 *   - https://bbo.co.id/feature-bbo-events.html is server-rendered with event cards
 *     (title, poster on storage.googleapis.com/bbo-images, day/month, description)
 *     and city coverage across Jabodetabek, Bandung, Java, Sumatera and Batam.
 *
 * KNOWN LIMITATION (deliberate fail-closed behaviour):
 *   - Event cards expose only day + month ("Sep 08"), never the calendar year.
 *     BBO records are therefore captured as OBSERVATIONS ONLY and can never be
 *     promoted to a canonical event until the year is independently resolved by
 *     an authoritative source.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');

const BBO_CARD_PATTERN = /<a href="(https:\/\/bbo\.co\.id\/bbo\/[^"]+)"[\s\S]{0,2200}?c-events-card__content">([\s\S]{0,400}?)<\/p>/gi;

class BboAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-bbo', options = {}) {
    super(sourceId, options);
    this.fixtureData = options.fixtureData || null;
  }

  /**
   * Reads BBO observations from the committed snapshot (no live network).
   */
  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }
    return OfficialSourceSnapshotStore.getRecordsBySource(this.sourceId).map(rec => this.parse(rec));
  }

  parse(raw) {
    const s = super.parse(raw);
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.bbo_event_id || null,
      name: s.name || s.title,
      title: s.name || s.title,
      start_date: s.start_date || null,
      start_datetime: s.start_datetime || null,
      observed_month_day: s.observed_month_day || null,
      year_resolved: s.year_resolved === true,
      venue_name: s.venue_name || 'Venue TBA',
      city: s.city || null,
      province: s.province || null,
      country: s.country || 'Indonesia',
      category: s.category || 'OTHER',
      official_event_url: s.official_event_url || null,
      official_ticket_url: s.official_ticket_url || s.official_event_url || null,
      official_ticketing_provider: 'BBO',
      image_url: s.image_url || null,
      image_source_type: s.image_source_type || 'OFFICIAL_TICKETING',
      image_source_url: s.image_source_url || s.official_event_url || null,
      image_credit: s.image_credit || 'BBO Events',
      source_url: s.discovery_source_url || s.official_event_url || null,
      status: s.year_resolved === true ? 'UPCOMING' : 'DISCOVERED'
    };
  }

  /**
   * Parses the server-rendered BBO events listing into factual observation records.
   * `year_resolved` is intentionally false: the listing does not publish a year.
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
