/**
 * Live Nation Asia Source Adapter
 * Tier 1: International/Regional Promoter Official Public Calendar
 *
 * COMPLIANCE (audited 2026-09-25):
 *   - robots.txt: https://www.livenation.asia/robots.txt
 *     Disallowed: /myln /subscription /account /culture /health /login /register
 *     -> Public artist & event calendar pages are permitted.
 *   - Public artist/event pages are server-rendered with one structured block per
 *     event: `href="/event/<slug>-ticket-edp<id>", <time dateTime>, city, venue, title`
 *     plus an optional official event information link.
 *   - Poster art is served from the official promoter CDN
 *     (dynamicmedia.livenationinternational.com).
 *
 * ARCHITECTURAL INVARIANT:
 *   - No live network access during request handling. `discover()` reads the
 *     committed official source snapshot.
 *   - src-livenation is a Tier 1 PROMOTER source, but for Indonesian events the
 *     local Indonesian authority rule still requires an Indonesian authoritative
 *     source (official local event website / promoter) for verification.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');

const LN_EVENT_BLOCK_PATTERN = /<li[^>]*data-testid="aedp-event"[\s\S]{0,3000}?<\/li>/gi;
const LN_HREF_PATTERN = /href="(\/event\/[^"]+)"/i;
const LN_DATETIME_PATTERN = /<time[^>]*dateTime="([^"]+)"/i;
const LN_H3_PATTERN = /<h3[^>]*>([^<]*)<span[^>]*><\/span>([^<]*)<\/h3>/i;
const LN_H4_PATTERN = /<h4[^>]*>([^<]*)<\/h4>/i;
const LN_INFO_LINK_PATTERN = /please visit(?:&nbsp;|\s)*((?:https?:\/\/)?(?:www\.)?[a-z0-9\-]+\.[a-z]{2,}(?:\/[^\s<&"]*)?)/i;

class LiveNationAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-livenation', options = {}) {
    super(sourceId, options);
    this.fixtureData = options.fixtureData || null;
    this.pageUrls = options.pageUrls || [];
  }

  /**
   * Reads corroborated event facts from the committed snapshot (no live network).
   */
  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }
    return OfficialSourceSnapshotStore.getRecordsBySource(this.sourceId).map(rec => this.parse(rec));
  }

  /**
   * Maps a snapshot record (or raw discovery item) into the standard claim shape.
   */
  parse(raw) {
    const s = super.parse(raw);
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || null,
      name: s.name || s.title,
      title: s.name || s.title,
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      end_date: s.end_date || null,
      end_datetime: s.end_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || 'Jakarta',
      province: s.province || null,
      country: s.country || 'Indonesia',
      category: s.category || 'CONCERT',
      organizer_name: s.organizer_name || s.organizer || 'Live Nation Asia',
      artists: Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []),
      official_event_url: s.official_event_url || s.url || null,
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.official_event_url || null,
      official_ticketing_provider: 'Live Nation Asia',
      image_url: s.image_url || null,
      image_source_type: s.image_source_type || 'OFFICIAL_PROMOTER_WEB',
      image_source_url: s.image_source_url || s.official_event_url || null,
      image_credit: s.image_credit || 'Live Nation Asia',
      source_url: s.discovery_source_url || s.source_url || s.official_event_url || null,
      status: s.status || 'UPCOMING'
    };
  }

  /**
   * Enumerates the whitelisted public artist/event calendar pages linked from the
   * Live Nation Asia homepage (e.g. `/bruno-mars-tickets-adp147754`).
   */
  static extractCalendarPagePaths(html) {
    if (!html || typeof html !== 'string') return [];
    const matches = html.match(/href="\/([a-z0-9\-]+-tickets-adp\d+)"/g) || [];
    return Array.from(new Set(matches.map(m => m.replace(/^href="\//, '').replace(/"$/, ''))));
  }

  /**
   * Parses the per-event blocks embedded in a Live Nation Asia calendar page.
   * Returns factual claims only (name, date, city, venue, official event URL).
   */
  static parseTourHtml(html, pageBaseUrl = 'https://www.livenation.asia') {
    if (!html || typeof html !== 'string') return [];
    const blocks = html.match(LN_EVENT_BLOCK_PATTERN) || [];
    const results = [];

    for (const block of blocks) {
      const href = block.match(LN_HREF_PATTERN);
      const dt = block.match(LN_DATETIME_PATTERN);
      const h3 = block.match(LN_H3_PATTERN);
      const h4 = block.match(LN_H4_PATTERN);
      if (!href || !dt) continue;

      const rawDate = dt[1];
      const eventIdMatch = href[1].match(/-(edp\d+)$/);
      const infoLink = block.match(LN_INFO_LINK_PATTERN);
      const isoDate = rawDate ? rawDate.substring(0, 10) : null;

      results.push({
        source_event_id: eventIdMatch ? eventIdMatch[1] : null,
        name: h4 ? h4[1].trim() : null,
        title: h4 ? h4[1].trim() : null,
        start_date: isoDate,
        city: h3 ? h3[1].trim() : null,
        venue_name: h3 ? h3[2].trim() : null,
        official_event_url: `${pageBaseUrl}${href[1]}`,
        official_ticket_url: `${pageBaseUrl}${href[1]}`,
        official_info_url: infoLink ? LiveNationAdapter.normalizeInfoUrl(infoLink[1]) : null,
        country: null
      });
    }

    return results;
  }

  /**
   * Normalises the official information destination published on the calendar
   * page (which is sometimes protocol-less, e.g. "www.example.com/path").
   */
  static normalizeInfoUrl(raw) {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value) return null;
    return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`;
  }

  /**
   * Extracts the official poster/hero art URL for a calendar page.
   * Prefers the OpenGraph image, falling back to the promoter CDN hero asset.
   */
  static extractPosterUrl(html) {
    if (!html || typeof html !== 'string') return null;
    const og =
      html.match(/property="og:image"[^>]*content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"[^>]*property="og:image"/i);
    if (og && /^https?:\/\//i.test(og[1])) return og[1];

    const cdn = html.match(/https:\/\/dynamicmedia\.livenationinternational\.com\/[a-z0-9\/\-]+\.(?:jpg|jpeg|png|webp)/i);
    return cdn ? cdn[0] : null;
  }
}

module.exports = {
  LiveNationAdapter
};

