/**
 * Social Discovery Signal Adapter
 * Tier 3: Discovery Signals Only
 * 
 * Ingests candidate social announcements (Instagram, TikTok, X, Telegram).
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * TIER 3 CAN DISCOVER. TIER 3 CANNOT SOLELY VERIFY.
 * 
 * Observations from this adapter are explicitly tagged as discovery signals
 * and will FAIL CLOSED to UNVERIFIED / NOINDEX unless independent Tier 1
 * evidence corroborates the event.
 */

const { EventSourceAdapter } = require('./EventSourceAdapter');

class SocialDiscoveryAdapter extends EventSourceAdapter {
  constructor(sourceId, options = {}) {
    super(sourceId, options);
    this.platform = options.platform || 'INSTAGRAM';
    this.accountHandle = options.accountHandle || null;
    this.fixtureData = options.fixtureData || null;
  }

  async discover(query = {}) {
    if (this.fixtureData) {
      return this.fixtureData.map(item => this.parse(item));
    }
    const { OfficialSourceSnapshotStore } = require('../OfficialSourceSnapshotStore');
    const signals = OfficialSourceSnapshotStore.getDiscoverySignalsBySource(this.sourceId);
    if (signals && signals.length > 0) {
      return signals.map(item => this.parse(item));
    }
    return [];
  }

  async fetchEvents(query = {}) {
    return this.discover(query);
  }

  parse(raw) {
    const s = super.parse(raw);
    const title = s.canonical_name || s.event_name || s.event_key || s.name || s.title || 'Untitled Event';
    const artistList = Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []);
    const startDate = s.start_date || s.date || null;
    const endDate = s.end_date || null;
    const startTime = s.start_time || null;
    const endTime = s.end_time || null;
    const venueName = s.venue_name || s.venue || 'Venue TBA';
    const city = s.city || s.venue_city || 'Jakarta';
    const country = s.country || 'Indonesia';
    const promoter = s.promoter || s.promoter_name || s.organizer_name || this.accountHandle || 'Promoter TBA';
    const ticketUrl = s.official_ticket_url || s.ticketing_url || s.ticket_url || null;
    const officialUrl = s.official_event_url || s.official_url || s.event_url || null;
    const sourceUrl = s.post_url || s.source_url || s.url || (this.accountHandle ? `https://www.instagram.com/${this.accountHandle.replace('@', '')}/` : null);
    const imageUrl = s.image_url || s.poster_url || s.post_image_url || null;
    const eventType = s.event_type || s.category || 'CONCERT';

    return {
      source_id: this.sourceId,
      source: this.accountHandle || '@infokonser',
      source_event_id: s.source_event_id || s.signal_id || s.id || s.post_id || null,
      name: title,
      title: title,
      canonical_name: title,
      event_name: title,
      artist: artistList[0] || title,
      artists: artistList,
      event_type: eventType,
      category: eventType,
      date: startDate,
      start_date: startDate,
      start_time: startTime,
      start_datetime: s.start_datetime || (startDate && startTime ? `${startDate}T${startTime}:00+07:00` : null),
      end_date: endDate,
      end_time: endTime,
      end_datetime: s.end_datetime || (endDate && endTime ? `${endDate}T${endTime}:00+07:00` : null),
      venue: venueName,
      venue_name: venueName,
      city: city,
      country: country,
      promoter: promoter,
      organizer_name: promoter,
      ticketing_url: ticketUrl,
      official_ticket_url: ticketUrl,
      official_url: officialUrl,
      official_event_url: officialUrl,
      source_url: sourceUrl,
      post_url: sourceUrl,
      image_url: imageUrl,
      published_at: s.published_at || s.observed_at || null,
      status: s.status || 'UPCOMING',
      // Explicit Tier 3 metadata
      is_discovery_signal: true,
      tier: 3,
      authority_level: 'LOW'
    };
  }
}

module.exports = {
  SocialDiscoveryAdapter
};
