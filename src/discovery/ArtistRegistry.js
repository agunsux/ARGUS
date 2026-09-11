/**
 * TIKUM Artist Registry
 * Discovers and indexes artists strictly grounded in existing canonical event records.
 * Non-negotiable: Never hallucinates artists or biographies.
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');

class ArtistRegistry {
  /**
   * Discovers all artists with active or past events in the canonical registry
   */
  static getAllArtists() {
    const events = canonicalRegistry.getAllEvents();
    const artistMap = new Map();

    for (const ev of events) {
      const artistList = Array.isArray(ev.artists) ? ev.artists : [];
      for (const rawName of artistList) {
        if (!rawName || typeof rawName !== 'string') continue;
        const name = rawName.trim();
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (!artistMap.has(slug)) {
          artistMap.set(slug, {
            name,
            slug,
            events: []
          });
        }
        artistMap.get(slug).events.push(ev);
      }
    }

    return Array.from(artistMap.values()).map(artist => ({
      ...artist,
      event_count: artist.events.length,
      upcoming_events: artist.events.filter(e => e.status !== 'CANCELLED')
    }));
  }

  /**
   * Finds an artist by slug
   */
  static getArtistBySlug(slug) {
    if (!slug) return null;
    const clean = slug.toLowerCase().trim();
    const all = this.getAllArtists();
    return all.find(a => a.slug === clean) || null;
  }
}

module.exports = {
  ArtistRegistry
};

