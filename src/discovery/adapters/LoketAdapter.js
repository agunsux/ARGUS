/**
 * LOKET Source Adapter
 * Tier 2: Indonesian Commercial Ticketing Platform (TRANSACTION SOURCE)
 *
 * COMPLIANCE (audited 2026-09-25):
 *   - robots.txt => `User-agent: * / Allow: /`  -> crawling permitted.
 *   - Event detail pages (`/event/<slug>_<id>`) are server-rendered and embed a
 *     schema.org/Event JSON-LD block (name, startDate/endDate + timezone,
 *     location, image banner, IDR price range, organizer).
 *   - Listing/discover surfaces are client-rendered, therefore discovery is
 *     limited to publicly linked event URLs. The full catalog requires the
 *     official partner feed (LOKET_FEED_URL).
 *
 * ARCHITECTURAL INVARIANT:
 *   - No live network access during request handling. `discover()` reads the
 *     committed official source snapshot (built out-of-band).
 *   - LOKET is a Tier 2 transaction source: it can CORROBORATE and supply the
 *     official ticket URL, but it can NEVER solely verify an event.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');
const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');

const LOKET_EVENT_URL_PATTERN = /https:\/\/www\.loket\.com\/event\/[a-z0-9\-]+_[A-Za-z0-9]+/g;

/**
 * Metro district -> canonical city hints. LOKET publishes venue districts
 * (e.g. "Kemayoran", "Pademangan") without always naming the city, so these
 * documented administrative mappings are required to resolve the city.
 */
const DISTRICT_CITY_HINTS = {
  kemayoran: 'Jakarta',
  pademangan: 'Jakarta',
  gambir: 'Jakarta',
  menteng: 'Jakarta',
  senayan: 'Jakarta',
  kuningan: 'Jakarta',
  setiabudi: 'Jakarta',
  tebet: 'Jakarta',
  cilandak: 'Jakarta',
  kebayoran: 'Jakarta',
  penjaringan: 'Jakarta',
  ancol: 'Jakarta',
  'kelapa gading': 'Jakarta',
  mijen: 'Semarang',
  tembalang: 'Semarang',
  gajahmungkur: 'Semarang',
  coblong: 'Bandung',
  cicendo: 'Bandung',
  'sumur bandung': 'Bandung',
  gubeng: 'Surabaya',
  genteng: 'Surabaya',
  wonokromo: 'Surabaya',
  cibinong: 'Bogor',
  serpong: 'Tangerang Selatan',
  bintaro: 'Tangerang Selatan',
  cisauk: 'Tangerang',
  tamalate: 'Makassar',
  panakkukang: 'Makassar'
};

const TZ_OFFSETS = {
  'Asia/Jakarta': '+07:00',
  'Asia/Pontianak': '+07:00',
  'Asia/Makassar': '+08:00',
  'Asia/Ujung_Pandang': '+08:00',
  'Asia/Jayapura': '+09:00'
};

class LoketAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-loket', options = {}) {
    super(sourceId, options);
    this.feedUrl = options.feedUrl || process.env.LOKET_FEED_URL || null;
    this.fixtureData = options.fixtureData || null;
  }

  /**
   * Loads corroborated / discovered LOKET event facts from the committed snapshot.
   * Never performs live network I/O.
   */
  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    return OfficialSourceSnapshotStore.getRecordsBySource(this.sourceId).map(rec => this.parse(rec));
  }

  /**
   * Legacy partner-feed path (LOKET_FEED_URL). Kept for contractual activation.
   */
  async discoverFromFeed() {
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
      source_event_id: s.source_event_id || s.loket_event_slug || s.id || null,
      name: s.name || s.title,
      title: s.name || s.title,
      start_date: s.start_date || s.date,
      start_datetime: s.start_datetime || null,
      end_date: s.end_date || null,
      end_datetime: s.end_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.venue_city || 'Jakarta',
      province: s.province || null,
      country: s.country || 'Indonesia',
      category: s.category || 'FESTIVAL',
      organizer_name: s.organizer || s.organizer_name || 'LOKET',
      artists: Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []),
      official_event_url: s.official_event_url || null,
      official_ticket_url: s.official_ticket_url || s.ticket_url || s.url || null,
      official_ticketing_provider: 'LOKET',
      min_price: s.min_price || null,
      max_price: s.max_price || null,
      image_url: s.image_url || null,
      image_source_type: s.image_source_type || 'OFFICIAL_TICKETING',
      image_source_url: s.image_source_url || s.official_event_url || null,
      image_credit: s.image_credit || 'LOKET',
      source_url: s.discovery_source_url || s.official_event_url || null,
      ticket_price: s.ticket_price || 'UNKNOWN',
      status: s.status || 'UPCOMING'
    };
  }

  /**
   * Extracts the publicly linked LOKET event detail URLs from any LOKET page.
   */
  static extractEventUrls(html) {
    if (!html || typeof html !== 'string') return [];
    const matches = html.match(LOKET_EVENT_URL_PATTERN) || [];
    return Array.from(new Set(matches));
  }

  /**
   * Deterministically parses a LOKET event detail page's schema.org/Event JSON-LD.
   * Returns null when no Event structured data is present (fail-closed).
   */
  static parseEventJsonLd(html, pageUrl = null) {
    if (!html || typeof html !== 'string') return null;

    const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    let event = null;

    for (const block of blocks) {
      const bodyMatch = block.match(/>([\s\S]*?)<\/script>/i);
      if (!bodyMatch) continue;
      const body = bodyMatch[1].trim();
      if (!/"@type"\s*:\s*"Event"/.test(body)) continue;
      try {
        event = JSON.parse(body);
        break;
      } catch (_) {
        continue;
      }
    }

    if (!event) return null;

    const location = Array.isArray(event.location) ? (event.location[0] || {}) : (event.location || {});
    const address = location.address || {};
    const start = LoketAdapter.parseSchemaDate(event.startDate);
    const end = LoketAdapter.parseSchemaDate(event.endDate);
    const offers = event.offers || {};
    const image = Array.isArray(event.image) ? event.image[0] : event.image;
    const organizer = event.organizer || {};
    const addressText = [address.streetAddress, address.addressRegion, address.addressLocality]
      .filter(Boolean)
      .join(', ');

    return {
      source_event_id: LoketAdapter.extractEventSlug(pageUrl),
      name: event.name || null,
      title: event.name || null,
      start_date: start.date,
      start_time: start.time,
      start_datetime: start.iso,
      end_date: end.date,
      end_time: end.time,
      end_datetime: end.iso,
      timezone: start.timezone,
      venue_name: location.name || address.addressLocality || null,
      city: LoketAdapter.resolveCity(addressText || location.name || ''),
      address_text: addressText || null,
      province: address.addressRegion || null,
      country: address.addressCountry === 'ID' ? 'Indonesia' : (address.addressCountry || 'Indonesia'),
      organizer: organizer.name || null,
      organizer_url: organizer.url || null,
      official_event_url: pageUrl,
      official_ticket_url: pageUrl,
      min_price: offers.lowPrice || null,
      max_price: offers.highPrice || null,
      currency: offers.priceCurrency || 'IDR',
      image_url: image || null,
      event_status_schema: event.eventStatus || null
    };
  }

  static extractEventSlug(pageUrl) {
    if (!pageUrl) return null;
    const m = String(pageUrl).match(/\/event\/([a-z0-9\-]+_[A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  /**
   * Parses LOKET's "YYYY-MM-DD HH:mm:ss Timezone" schema date representation.
   */
  static parseSchemaDate(raw) {
    if (!raw || typeof raw !== 'string') {
      return { date: null, time: null, iso: null, timezone: null };
    }
    const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?\s*([A-Za-z_/]+)?$/);
    if (!m) {
      return { date: null, time: null, iso: null, timezone: null };
    }
    const date = m[1];
    const time = m[2] || null;
    const timezone = m[3] || 'Asia/Jakarta';
    const offset = TZ_OFFSETS[timezone] || '+07:00';
    const iso = time ? `${date}T${time}:00${offset}` : null;
    return { date, time, iso, timezone };
  }

  /**
   * Resolves an Indonesian city from a free-text address line using the
   * canonical CityRegistry (fails closed to null when unmapped).
   */
  static resolveCity(text) {
    if (!text) return null;
    let cityRegistry = null;
    try {
      cityRegistry = require('../CityRegistry').cityRegistry;
    } catch (_) {
      return null;
    }
    const haystack = String(text).toLowerCase();
    const all = cityRegistry.getAllCities ? cityRegistry.getAllCities() : [];
    let best = null;
    for (const city of all) {
      if (!city || !city.name) continue;
      const candidates = [city.name, ...(city.aliases || [])];
      for (const cand of candidates) {
        const needle = String(cand).toLowerCase();
        if (needle.length < 4) continue;
        if (haystack.includes(needle) && (!best || needle.length > best.len)) {
          best = { city: city.name, province: city.province, country: city.country, len: needle.length };
        }
      }
    }
    if (best) return best.city;

    // Fallback: documented metro district -> city mapping.
    let hintBest = null;
    for (const [district, city] of Object.entries(DISTRICT_CITY_HINTS)) {
      if (haystack.includes(district) && (!hintBest || district.length > hintBest.len)) {
        hintBest = { city, len: district.length };
      }
    }
    return hintBest ? hintBest.city : null;
  }

  static getDistrictCityHints() {
    return { ...DISTRICT_CITY_HINTS };
  }
}

module.exports = {
  LoketAdapter
};
