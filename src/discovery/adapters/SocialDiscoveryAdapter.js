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

  parse(raw) {
    const s = super.parse(raw);
    const title = s.event_name || s.event_key || s.name || s.title || 'Untitled Event';
    return {
      source_id: this.sourceId,
      source_event_id: s.source_event_id || s.signal_id || s.id || s.post_id || null,
      name: title,
      title: title,
      canonical_name: title,
      start_date: s.start_date || s.date || null,
      start_datetime: s.start_datetime || null,
      venue_name: s.venue_name || s.venue || 'Venue TBA',
      city: s.city || s.venue_city || 'Jakarta',
      country: s.country || 'Indonesia',
      category: s.category || 'CONCERT',
      official_ticket_url: s.official_ticket_url || s.ticket_url || null,
      organizer_name: s.organizer_name || s.promoter_name || this.accountHandle || 'Social Signal Organizer',
      artists: Array.isArray(s.artists) ? s.artists : (s.artist ? [s.artist] : []),
      post_url: s.post_url || s.url || null,
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
