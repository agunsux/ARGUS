/**
 * TIKUM Venue Registry
 * Aggregates known venues with active canonical events.
 * Strict Grounding: Never fabricates venue data.
 */

const { KNOWN_VENUES } = require('./EventNormalizationService');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { state } = require('../database');

class VenueRegistry {
  /**
   * Returns list of all known venues with real event counts
   */
  static getAllVenues() {
    const allEvents = canonicalRegistry.getAllEvents();

    return KNOWN_VENUES.map(v => {
      const slug = v.canonical_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const hostedEvents = allEvents.filter(e => 
        (e.venue_id && e.venue_id === v.id) ||
        (e.venue_name && e.venue_name.toLowerCase().includes(v.canonical_name.toLowerCase())) ||
        (v.aliases && v.aliases.some(a => (e.venue_name || '').toLowerCase().includes(a)))
      );

      return {
        id: v.id,
        canonical_name: v.canonical_name,
        slug: slug,
        city: v.city,
        province: v.province,
        aliases: v.aliases || [],
        event_count: hostedEvents.length,
        events: hostedEvents
      };
    });
  }

  /**
   * Finds a venue by slug or ID
   */
  static getVenueBySlug(slugOrId) {
    if (!slugOrId) return null;
    const clean = slugOrId.toLowerCase().trim();
    const venues = this.getAllVenues();

    return venues.find(v => 
      v.slug === clean || 
      v.id.toLowerCase() === clean ||
      v.aliases.some(a => a.replace(/[^a-z0-9]+/g, '-') === clean)
    ) || null;
  }
}

module.exports = {
  VenueRegistry
};

