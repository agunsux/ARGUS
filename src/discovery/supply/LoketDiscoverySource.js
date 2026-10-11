/**
 * TIKUM / ARGUS — Loket Discovery Source
 *
 * Scans Loket.com public discover endpoints and parses items into DiscoveredEvent.
 */

const { EventDiscoverySource } = require('./EventDiscoverySource');
const { DiscoveredEvent, DISCOVERY_CATEGORIES } = require('../models/DiscoveredEvent');
const { LoketAdapter } = require('../adapters/LoketAdapter');

class LoketDiscoverySource extends EventDiscoverySource {
  constructor(options = {}) {
    super('src-loket', 'Loket.com', 1);
    this.adapter = new LoketAdapter('src-loket', options);
    this.pageSize = options.pageSize || 100;
    this.maxPages = options.maxPages || 5;
  }

  async discover(options = {}) {
    const rawEvents = [];
    const maxPages = options.maxPages || this.maxPages;
    const pageSize = options.pageSize || this.pageSize;

    try {
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://rest.loket.com/fusio/api/v1/public/discover?p=${page}&ps=${pageSize}&f.d_ext=1`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)',
            Accept: 'application/json',
            Origin: 'https://www.loket.com',
            Referer: 'https://www.loket.com/'
          }
        });

        if (!res.ok) break;
        const json = await res.json();
        if (!json.result || !Array.isArray(json.result.data) || json.result.data.length === 0) break;

        rawEvents.push(...json.result.data);
        const totalPages = json.result.total_pages || Math.ceil((json.result.total_records || 0) / pageSize);
        if (page >= totalPages) break;
      }
    } catch (err) {
      console.warn(`[LoketDiscoverySource] Live fetch failed: ${err.message}. Using adapter fallback.`);
      const fallbackEvents = await this.adapter.discover(options);
      return fallbackEvents.map(item => this.normalizeToDiscoveredEvent(item));
    }

    return rawEvents.map(item => this.normalizeToDiscoveredEvent(item));
  }

  normalizeToDiscoveredEvent(rawItem) {
    const parsed = this.adapter.parse(rawItem);
    const minPrice = parsed.min_price !== null ? parsed.min_price : (rawItem?.pricing?.price !== undefined ? Number(rawItem.pricing.price) : null);
    const maxPrice = parsed.max_price !== null ? parsed.max_price : (rawItem?.pricing?.initial_price !== undefined ? Number(rawItem.pricing.initial_price) : minPrice);

    return new DiscoveredEvent({
      source_id: this.sourceId,
      source_event_id: parsed.source_event_id,
      title: parsed.name,
      event_name: parsed.name,
      artists: parsed.artists || (parsed.artist ? [parsed.artist] : []),
      artist: parsed.artist,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      start_datetime: parsed.start_datetime,
      end_datetime: parsed.end_datetime,
      timezone: parsed.timezone,
      venue_name: parsed.venue_name,
      city: parsed.city,
      province: parsed.province,
      country: parsed.country,
      organizer_name: parsed.organizer_name || parsed.promoter,
      official_event_url: parsed.official_event_url || parsed.source_url,
      official_ticket_url: parsed.official_ticket_url || parsed.source_url,
      official_ticketing_provider: 'LOKET',
      price_currency: parsed.currency || 'IDR',
      price_min: minPrice,
      price_max: maxPrice,
      price_source: this.sourceId,
      event_status: parsed.status || 'UPCOMING',
      verification_status: 'VERIFIED', // Tier-1 Authoritative Primary Ticketing
      is_verified: true,
      image_url: parsed.image_url,
      thumbnail_url: parsed.thumbnail_url || parsed.image_url || null,
      image_source_url: parsed.image_source_url || parsed.official_ticket_url || parsed.source_url || null,
      image_source_type: parsed.image_source_type || (parsed.image_url ? 'OFFICIAL_TICKETING' : 'NONE'),
      image_status: parsed.image_status || (parsed.image_url ? 'VERIFIED_AUTHORIZED_SELLER' : 'SOURCE_LINK_ONLY'),
      image_credit: parsed.image_credit || (parsed.organizer_name ? `${parsed.organizer_name} via LOKET` : 'LOKET'),
      image_verified_at: parsed.image_url ? (parsed.sourceFetchedAt || new Date().toISOString()) : null,
      provenance: {
        official_source: parsed.official_event_url,
        ticket_source: parsed.official_ticket_url,
        promoter_source: parsed.organizer_name ? `promoter:${parsed.organizer_name}` : null,
        venue_source: parsed.venue_name ? `venue:${parsed.venue_name}` : null,
        discovery_source: this.sourceId
      }
    });
  }
}

module.exports = {
  LoketDiscoverySource
};
