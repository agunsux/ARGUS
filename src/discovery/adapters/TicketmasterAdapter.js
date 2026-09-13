/**
 * Ticketmaster Source Adapter
 * Tier 2: Commercial Ticketing Platform
 * 
 * Compliant API-First Adapter:
 * - Requires explicit TICKETMASTER_API_KEY.
 * - If key is missing or unauthorized, safely fails closed as REQUIRES_AUTHORIZATION / UNSUPPORTED.
 * - Does NOT bypass authentication, reverse-engineer private endpoints, or scrape without authorization.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class TicketmasterAdapter extends EventSourceAdapter {
  constructor(sourceId = 'src-ticketmaster', options = {}) {
    super(sourceId, options);
    this.apiKey = options.apiKey || process.env.TICKETMASTER_API_KEY || null;
    this.fixtureData = options.fixtureData || null; // Safe test fixture injection
  }

  isAuthorized() {
    return Boolean(this.apiKey || this.fixtureData);
  }

  async discover(query = {}) {
    if (!this.isAuthorized()) {
      return {
        status: 'UNSUPPORTED',
        reason: 'Ticketmaster API requires authorized TICKETMASTER_API_KEY',
        events: []
      };
    }

    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }

    // In live mode, invoke official Discovery API with strict rate limiting & timeout
    return this.fetchWithRetry(async () => {
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${this.apiKey}&keyword=${encodeURIComponent(query.keyword || '')}&countryCode=${query.countryCode || 'ID'}`;
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403) {
        throw new Error('Ticketmaster API credentials rejected (401/403)');
      }
      if (res.status === 429) {
        const err = new Error('Ticketmaster API rate limit exceeded (429)');
        err.status = 429;
        throw err;
      }
      if (!res.ok) {
        throw new Error(`Ticketmaster API returned HTTP ${res.status}`);
      }
      const json = await res.json();
      const rawList = (json._embedded && json._embedded.events) || [];
      return rawList.map(e => this.parse(e));
    });
  }

  parse(raw) {
    const sanitized = super.parse(raw);
    const venues = (sanitized._embedded && sanitized._embedded.venues) || [];
    const venue = venues[0] || {};
    const dates = sanitized.dates || {};
    const start = dates.start || {};

    return {
      source_id: this.sourceId,
      source_event_id: sanitized.id,
      name: sanitized.name,
      title: sanitized.name,
      start_date: start.localDate,
      start_datetime: start.dateTime || (start.localDate ? `${start.localDate}T${start.localTime || '19:00:00'}` : null),
      venue_name: venue.name || sanitized.venue_name || 'Venue TBA',
      city: (venue.city && venue.city.name) || sanitized.city || 'Jakarta',
      country: (venue.country && venue.country.name) || sanitized.country || 'Indonesia',
      category: (sanitized.classifications && sanitized.classifications[0] && sanitized.classifications[0].segment && sanitized.classifications[0].segment.name) || 'MUSIC',
      official_ticket_url: sanitized.url || sanitized.official_ticket_url || null,
      official_ticketing_provider: 'Ticketmaster',
      status: sanitized.status || 'UPCOMING'
    };
  }
}

module.exports = {
  TicketmasterAdapter
};
