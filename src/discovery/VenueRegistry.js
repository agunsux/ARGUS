/**
 * TIKUM Venue Registry
 * Aggregates known venues with active canonical events.
 * Includes geo-coordinates (latitude, longitude) and capacity tiers.
 * Strict Grounding: Never fabricates venue data.
 */

const { KNOWN_VENUES } = require('./EventNormalizationService');

class VenueRegistry {
  constructor() {
    this.dynamicVenues = new Map();
    for (const v of KNOWN_VENUES) {
      this.dynamicVenues.set(v.id, { ...v });
    }
  }

  /**
   * Returns list of all known venues with real event counts
   */
  getAllVenues() {
    let allEvents = [];
    try {
      const { canonicalRegistry } = require('./CanonicalEventRegistry');
      allEvents = canonicalRegistry.getAllEvents();
    } catch (_) {
      allEvents = [];
    }

    const venuesList = Array.from(this.dynamicVenues.values());

    return venuesList.map(v => {
      const slug = v.canonical_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const hostedEvents = allEvents.filter(e => 
        (e.venue_id && e.venue_id === v.id) ||
        (e.venue_name && e.venue_name.toLowerCase().includes(v.canonical_name.toLowerCase())) ||
        (e.venue && e.venue.toLowerCase().includes(v.canonical_name.toLowerCase())) ||
        (v.aliases && v.aliases.some(a => (e.venue_name || e.venue || '').toLowerCase().includes(a)))
      );

      return {
        id: v.id,
        canonical_name: v.canonical_name,
        slug: slug,
        city: v.city,
        province: v.province,
        lat: v.lat || null,
        lng: v.lng || null,
        capacity_tier: v.capacity_tier || 'UNKNOWN',
        aliases: v.aliases || [],
        event_count: hostedEvents.length,
        events: hostedEvents
      };
    });
  }

  /**
   * Finds a venue by slug or ID or alias or name substring
   */
  findVenue(slugOrId) {
    if (!slugOrId) return null;
    const clean = String(slugOrId).toLowerCase().trim();
    const cleanSlug = clean.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const venues = this.getAllVenues();

    return venues.find(v => {
      const vCanonical = v.canonical_name.toLowerCase();
      const vId = (v.id || '').toLowerCase();
      return (
        v.slug === cleanSlug ||
        v.slug === clean ||
        vId === clean ||
        vCanonical === clean ||
        clean.includes(vCanonical) ||
        vCanonical.includes(clean) ||
        (v.aliases && v.aliases.some(a => {
          const aClean = a.toLowerCase();
          const aSlug = aClean.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          return aSlug === cleanSlug || aClean === clean || clean.includes(aClean) || aClean.includes(clean);
        }))
      );
    }) || null;
  }

  getVenueBySlug(slugOrId) {
    return this.findVenue(slugOrId);
  }

  /**
   * Dynamically registers a newly verified venue
   */
  registerVenue(venueData = {}) {
    const canonicalName = venueData.canonical_name || venueData.name;
    if (!venueData.id && !canonicalName) return null;
    const id = venueData.id || `venue-${canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    if (this.dynamicVenues.has(id)) {
      return this.dynamicVenues.get(id);
    }

    const newVenue = {
      id,
      canonical_name: canonicalName,
      city: venueData.city || 'Indonesia',
      province: venueData.province || 'Indonesia',
      lat: venueData.lat || null,
      lng: venueData.lng || null,
      capacity_tier: venueData.capacity_tier || 'UNKNOWN',
      aliases: venueData.aliases || [],
      is_dynamically_added: true
    };
    this.dynamicVenues.set(id, newVenue);
    return newVenue;
  }

  static getAllVenues() {
    return venueRegistry.getAllVenues();
  }

  static getVenueBySlug(slugOrId) {
    return venueRegistry.findVenue(slugOrId);
  }

  static findVenue(slugOrId) {
    return venueRegistry.findVenue(slugOrId);
  }

  static registerVenue(venueData) {
    return venueRegistry.registerVenue(venueData);
  }
}

const venueRegistry = new VenueRegistry();

module.exports = {
  VenueRegistry,
  venueRegistry
};
