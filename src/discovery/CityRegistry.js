/**
 * TIKUM City Registry
 * Grounded directory of Indonesian cities hosting live events and venues.
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { KNOWN_VENUES } = require('./EventNormalizationService');

class CityRegistry {
  static getAllCities() {
    const events = canonicalRegistry.getAllEvents();
    const cities = [
      { name: 'Jakarta', slug: 'jakarta', province: 'DKI Jakarta', description: 'Pusat festival musik dan konser internasional terbesar di Indonesia.' },
      { name: 'Bandung', slug: 'bandung', province: 'Jawa Barat', description: 'Kota kreatif dengan panggung musik independen dan konser legendaris.' },
      { name: 'Surabaya', slug: 'surabaya', province: 'Jawa Timur', description: 'Pusat pertunjukan dan pertandingan olahraga akbar di Jawa Timur.' },
      { name: 'Tangerang', slug: 'tangerang', province: 'Banten', description: 'Rumah bagi venue konvensi dan konser berskala internasional di ICE BSD.' },
      { name: 'Bali', slug: 'bali', province: 'Bali', description: 'Pusat festival musik tropis dan pertunjukan budaya berskala internasional.' }
    ];

    return cities.map(c => {
      const cityEvents = events.filter(e => (e.city || '').toLowerCase() === c.name.toLowerCase());
      const cityVenues = KNOWN_VENUES.filter(v => (v.city || '').toLowerCase() === c.name.toLowerCase());
      return {
        ...c,
        event_count: cityEvents.length,
        venue_count: cityVenues.length,
        events: cityEvents,
        venues: cityVenues
      };
    });
  }

  static getCityBySlug(slug) {
    if (!slug) return null;
    const clean = slug.toLowerCase().trim();
    const cities = this.getAllCities();
    return cities.find(c => c.slug === clean || c.name.toLowerCase() === clean) || null;
  }
}

module.exports = {
  CityRegistry
};

