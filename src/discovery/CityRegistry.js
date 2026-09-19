/**
 * TIKUM City Registry
 * Grounded directory of Indonesian cities hosting live events and venues.
 * Grounded nationwide directory of Indonesian cities hosting live events and venues.
 * Includes geographic coordinates (latitude, longitude) for accurate spatial distance calculation.
 */

const { KNOWN_VENUES } = require('./EventNormalizationService');
const NATIONWIDE_CITIES = [
  // Jabodetabek
  { name: 'Jakarta', slug: 'jakarta', province: 'DKI Jakarta', region: 'Jabodetabek', lat: -6.2088, lng: 106.8456, timezone: 'Asia/Jakarta' },
  { name: 'Tangerang', slug: 'tangerang', province: 'Banten', region: 'Jabodetabek', lat: -6.1783, lng: 106.6319, timezone: 'Asia/Jakarta' },
  { name: 'Tangerang Selatan', slug: 'tangerang-selatan', province: 'Banten', region: 'Jabodetabek', lat: -6.2889, lng: 106.7179, timezone: 'Asia/Jakarta' },
  { name: 'Bekasi', slug: 'bekasi', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.2383, lng: 106.9756, timezone: 'Asia/Jakarta' },
  { name: 'Bogor', slug: 'bogor', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.5971, lng: 106.8060, timezone: 'Asia/Jakarta' },
  { name: 'Depok', slug: 'depok', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.4025, lng: 106.7942, timezone: 'Asia/Jakarta' },

  // Jawa Barat
  { name: 'Bandung', slug: 'bandung', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.9175, lng: 107.6191, timezone: 'Asia/Jakarta' },
  { name: 'Cimahi', slug: 'cimahi', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.8722, lng: 107.5422, timezone: 'Asia/Jakarta' },
  { name: 'Cirebon', slug: 'cirebon', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.7320, lng: 108.5523, timezone: 'Asia/Jakarta' },
  { name: 'Tasikmalaya', slug: 'tasikmalaya', province: 'Jawa Barat', region: 'Jawa Barat', lat: -7.3274, lng: 108.2207, timezone: 'Asia/Jakarta' },
  { name: 'Sukabumi', slug: 'sukabumi', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.9277, lng: 106.9300, timezone: 'Asia/Jakarta' },

  // Jawa Tengah & DIY
  { name: 'Semarang', slug: 'semarang', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.9667, lng: 110.4167, timezone: 'Asia/Jakarta' },
  { name: 'Solo', slug: 'solo', province: 'Jawa Tengah', region: 'Jawa Tengah', aliases: ['Surakarta'], lat: -7.5755, lng: 110.8243, timezone: 'Asia/Jakarta' },
  { name: 'Surakarta', slug: 'surakarta', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.5755, lng: 110.8243, timezone: 'Asia/Jakarta' },
  { name: 'Yogyakarta', slug: 'yogyakarta', province: 'DI Yogyakarta', region: 'DIY', aliases: ['Jogja', 'DIY'], lat: -7.7956, lng: 110.3695, timezone: 'Asia/Jakarta' },
  { name: 'Magelang', slug: 'magelang', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.4706, lng: 110.2178, timezone: 'Asia/Jakarta' },
  { name: 'Purwokerto', slug: 'purwokerto', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.4244, lng: 109.2302, timezone: 'Asia/Jakarta' },
  { name: 'Salatiga', slug: 'salatiga', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.3305, lng: 110.5084, timezone: 'Asia/Jakarta' },
  { name: 'Tegal', slug: 'tegal', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.8694, lng: 109.1402, timezone: 'Asia/Jakarta' },
  { name: 'Kudus', slug: 'kudus', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.8048, lng: 110.8405, timezone: 'Asia/Jakarta' },
  { name: 'Jepara', slug: 'jepara', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.5932, lng: 110.6778, timezone: 'Asia/Jakarta' },
  { name: 'Kebumen', slug: 'kebumen', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.6686, lng: 109.6521, timezone: 'Asia/Jakarta' },

  // Jawa Timur
  { name: 'Surabaya', slug: 'surabaya', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.2575, lng: 112.7521, timezone: 'Asia/Jakarta' },
  { name: 'Malang', slug: 'malang', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.9666, lng: 112.6326, timezone: 'Asia/Jakarta' },
  { name: 'Sidoarjo', slug: 'sidoarjo', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.4478, lng: 112.7183, timezone: 'Asia/Jakarta' },
  { name: 'Mojokerto', slug: 'mojokerto', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.4726, lng: 112.4381, timezone: 'Asia/Jakarta' },
  { name: 'Kediri', slug: 'kediri', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.8480, lng: 112.0178, timezone: 'Asia/Jakarta' },
  { name: 'Tulungagung', slug: 'tulungagung', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.0647, lng: 111.9012, timezone: 'Asia/Jakarta' },
  { name: 'Jember', slug: 'jember', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.1724, lng: 113.7007, timezone: 'Asia/Jakarta' },
  { name: 'Banyuwangi', slug: 'banyuwangi', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.2192, lng: 114.3692, timezone: 'Asia/Jakarta' },
  { name: 'Madiun', slug: 'madiun', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.6298, lng: 111.5239, timezone: 'Asia/Jakarta' },

  // Bali & Nusa Tenggara
  { name: 'Bali', slug: 'bali', province: 'Bali', region: 'Bali', aliases: ['Denpasar', 'Badung', 'Gianyar'], lat: -8.6705, lng: 115.2126, timezone: 'Asia/Makassar' },
  { name: 'Denpasar', slug: 'denpasar', province: 'Bali', region: 'Bali', lat: -8.6705, lng: 115.2126, timezone: 'Asia/Makassar' },
  { name: 'Badung', slug: 'badung', province: 'Bali', region: 'Bali', lat: -8.5833, lng: 115.1833, timezone: 'Asia/Makassar' },
  { name: 'Gianyar', slug: 'gianyar', province: 'Bali', region: 'Bali', lat: -8.5433, lng: 115.3283, timezone: 'Asia/Makassar' },
  { name: 'Tabanan', slug: 'tabanan', province: 'Bali', region: 'Bali', lat: -8.5411, lng: 115.1252, timezone: 'Asia/Makassar' },
  { name: 'Mataram', slug: 'mataram', province: 'Nusa Tenggara Barat', region: 'Nusa Tenggara', aliases: ['Lombok'], lat: -8.5833, lng: 116.1167, timezone: 'Asia/Makassar' },

  // Sumatera
  { name: 'Medan', slug: 'medan', province: 'Sumatera Utara', region: 'Sumatera', lat: 3.5952, lng: 98.6722, timezone: 'Asia/Jakarta' },
  { name: 'Palembang', slug: 'palembang', province: 'Sumatera Selatan', region: 'Sumatera', lat: -2.9761, lng: 104.7754, timezone: 'Asia/Jakarta' },
  { name: 'Pekanbaru', slug: 'pekanbaru', province: 'Riau', region: 'Sumatera', lat: 0.5071, lng: 101.4478, timezone: 'Asia/Jakarta' },
  { name: 'Batam', slug: 'batam', province: 'Kepulauan Riau', region: 'Sumatera', lat: 1.1301, lng: 104.0529, timezone: 'Asia/Jakarta' },
  { name: 'Padang', slug: 'padang', province: 'Sumatera Barat', region: 'Sumatera', lat: -0.9471, lng: 100.4172, timezone: 'Asia/Jakarta' },
  { name: 'Bandar Lampung', slug: 'bandar-lampung', province: 'Lampung', region: 'Sumatera', aliases: ['Lampung'], lat: -5.3971, lng: 105.2668, timezone: 'Asia/Jakarta' },

  // Kalimantan
  { name: 'Banjarmasin', slug: 'banjarmasin', province: 'Kalimantan Selatan', region: 'Kalimantan', lat: -3.3194, lng: 114.5908, timezone: 'Asia/Makassar' },
  { name: 'Banjarbaru', slug: 'banjarbaru', province: 'Kalimantan Selatan', region: 'Kalimantan', lat: -3.4404, lng: 114.8306, timezone: 'Asia/Makassar' },
  { name: 'Samarinda', slug: 'samarinda', province: 'Kalimantan Timur', region: 'Kalimantan', lat: -0.5022, lng: 117.1536, timezone: 'Asia/Makassar' },
  { name: 'Balikpapan', slug: 'balikpapan', province: 'Kalimantan Timur', region: 'Kalimantan', lat: -1.2379, lng: 116.8529, timezone: 'Asia/Makassar' },
  { name: 'Pontianak', slug: 'pontianak', province: 'Kalimantan Barat', region: 'Kalimantan', lat: -0.0263, lng: 109.3425, timezone: 'Asia/Jakarta' },

  // Sulawesi & Papua
  { name: 'Makassar', slug: 'makassar', province: 'Sulawesi Selatan', region: 'Sulawesi', aliases: ['Ujung Pandang'], lat: -5.1477, lng: 119.4327, timezone: 'Asia/Makassar' },
  { name: 'Manado', slug: 'manado', province: 'Sulawesi Utara', region: 'Sulawesi', lat: 1.4748, lng: 124.8421, timezone: 'Asia/Makassar' },
  { name: 'Jayapura', slug: 'jayapura', province: 'Papua', region: 'Papua', lat: -2.5916, lng: 140.6690, timezone: 'Asia/Jayapura' }
];

class CityRegistry {
  constructor() {
    this.dynamicCities = new Map();
    for (const c of NATIONWIDE_CITIES) {
      this.dynamicCities.set(c.name.toLowerCase(), { ...c });
    }
  }
  /**
   * Calculates Haversine distance in kilometers between two coordinates
   */
  static haversineDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
      return null;
    }
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Returns list of all known cities with real event counts
   */
  getAllCities() {
    let events = [];
    let knownVenues = [];
    try {
      const { canonicalRegistry } = require('./CanonicalEventRegistry');
      events = canonicalRegistry.getAllEvents();
    } catch (_) {
      events = [];
    }

    try {
      const { KNOWN_VENUES } = require('./EventNormalizationService');
      knownVenues = KNOWN_VENUES;
    } catch (_) {
      knownVenues = [];
    }

    const list = Array.from(this.dynamicCities.values());

    return list.map(c => {
      const cityEvents = events.filter(e =>
        (e.city || '').toLowerCase() === c.name.toLowerCase() ||
        (c.aliases && c.aliases.some(a => (e.city || '').toLowerCase() === a.toLowerCase()))
      );
      const cityVenues = knownVenues.filter(v =>
        (v.city || '').toLowerCase() === c.name.toLowerCase() ||
        (c.aliases && c.aliases.some(a => (v.city || '').toLowerCase() === a.toLowerCase()))
      );

      return {
        ...c,
        event_count: cityEvents.length,
        venue_count: cityVenues.length,
        events: cityEvents,
        venues: cityVenues
      };
    });
  }

  /**
   * Finds a city by name, slug, or alias
   */
  findCity(query) {
    if (!query) return null;
    const clean = String(query).toLowerCase().trim();

    for (const city of this.dynamicCities.values()) {
      if (city.name.toLowerCase() === clean || city.slug === clean) {
        return city;
      }
      if (city.aliases && city.aliases.some(a => a.toLowerCase() === clean)) {
        return city;
      }
    }
    return null;
  }

  getCityBySlug(slug) {
    if (!slug) return null;
    const clean = slug.toLowerCase().trim();
    const cities = this.getAllCities();
    return cities.find(c => c.slug === clean || c.name.toLowerCase() === clean) || null;
  }

  static getAllCities() {
    return cityRegistry.getAllCities();
  }

  static getCityBySlug(slug) {
    return cityRegistry.getCityBySlug(slug);
  }

  static findCity(query) {
    return cityRegistry.findCity(query);
  }

  static registerCity(data) {
    return cityRegistry.registerCity(data);
  }

  /**
   * Dynamically registers a newly observed Indonesian city
   */
  registerCity(cityData = {}) {
    if (!cityData.name) return null;
    const key = cityData.name.toLowerCase().trim();
    if (this.dynamicCities.has(key)) {
      return this.dynamicCities.get(key);
    }

    const slug = cityData.slug || key.replace(/[^a-z0-9]+/g, '-');
    const newCity = {
      name: cityData.name,
      slug: slug,
      province: cityData.province || 'Indonesia',
      region: cityData.region || 'Regional',
      lat: cityData.lat || -6.2088,
      lng: cityData.lng || 106.8456,
      timezone: cityData.timezone || 'Asia/Jakarta',
      is_dynamically_added: true
    };
    this.dynamicCities.set(key, newCity);
    return newCity;
  }
}

const cityRegistry = new CityRegistry();

module.exports = {
  CityRegistry,
  cityRegistry,
  NATIONWIDE_CITIES
};

