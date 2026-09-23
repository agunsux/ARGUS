/**
 * TIKUM City Registry
 * Grounded directory of Indonesian cities hosting live events and venues.
 * Grounded nationwide directory of Indonesian cities hosting live events and venues.
 * Includes geographic coordinates (latitude, longitude) for accurate spatial distance calculation.
 */

const KNOWN_VENUES = require('./EventNormalizationService').KNOWN_VENUES || [];
const NATIONWIDE_CITIES = [
  // Jabodetabek (Indonesia)
  { name: 'Jakarta', slug: 'jakarta', country: 'Indonesia', province: 'DKI Jakarta', region: 'Jabodetabek', lat: -6.2088, lng: 106.8456, timezone: 'Asia/Jakarta' },
  { name: 'Tangerang', slug: 'tangerang', country: 'Indonesia', province: 'Banten', region: 'Jabodetabek', lat: -6.1783, lng: 106.6319, timezone: 'Asia/Jakarta' },
  { name: 'Tangerang Selatan', slug: 'tangerang-selatan', country: 'Indonesia', province: 'Banten', region: 'Jabodetabek', lat: -6.2889, lng: 106.7179, timezone: 'Asia/Jakarta' },
  { name: 'Bekasi', slug: 'bekasi', country: 'Indonesia', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.2383, lng: 106.9756, timezone: 'Asia/Jakarta' },
  { name: 'Bogor', slug: 'bogor', country: 'Indonesia', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.5971, lng: 106.8060, timezone: 'Asia/Jakarta' },
  { name: 'Depok', slug: 'depok', country: 'Indonesia', province: 'Jawa Barat', region: 'Jabodetabek', lat: -6.4025, lng: 106.7942, timezone: 'Asia/Jakarta' },

  // Jawa Barat (Indonesia)
  { name: 'Bandung', slug: 'bandung', country: 'Indonesia', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.9175, lng: 107.6191, timezone: 'Asia/Jakarta' },
  { name: 'Cimahi', slug: 'cimahi', country: 'Indonesia', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.8722, lng: 107.5422, timezone: 'Asia/Jakarta' },
  { name: 'Cirebon', slug: 'cirebon', country: 'Indonesia', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.7320, lng: 108.5523, timezone: 'Asia/Jakarta' },
  { name: 'Tasikmalaya', slug: 'tasikmalaya', country: 'Indonesia', province: 'Jawa Barat', region: 'Jawa Barat', lat: -7.3274, lng: 108.2207, timezone: 'Asia/Jakarta' },
  { name: 'Sukabumi', slug: 'sukabumi', country: 'Indonesia', province: 'Jawa Barat', region: 'Jawa Barat', lat: -6.9277, lng: 106.9300, timezone: 'Asia/Jakarta' },

  // Jawa Tengah & DIY (Indonesia)
  { name: 'Semarang', slug: 'semarang', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.9667, lng: 110.4167, timezone: 'Asia/Jakarta' },
  { name: 'Solo', slug: 'solo', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', aliases: ['Surakarta'], lat: -7.5755, lng: 110.8243, timezone: 'Asia/Jakarta' },
  { name: 'Surakarta', slug: 'surakarta', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.5755, lng: 110.8243, timezone: 'Asia/Jakarta' },
  { name: 'Yogyakarta', slug: 'yogyakarta', country: 'Indonesia', province: 'DI Yogyakarta', region: 'DIY', aliases: ['Jogja', 'DIY'], lat: -7.7956, lng: 110.3695, timezone: 'Asia/Jakarta' },
  { name: 'Magelang', slug: 'magelang', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.4706, lng: 110.2178, timezone: 'Asia/Jakarta' },
  { name: 'Purwokerto', slug: 'purwokerto', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.4244, lng: 109.2302, timezone: 'Asia/Jakarta' },
  { name: 'Salatiga', slug: 'salatiga', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.3305, lng: 110.5084, timezone: 'Asia/Jakarta' },
  { name: 'Tegal', slug: 'tegal', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.8694, lng: 109.1402, timezone: 'Asia/Jakarta' },
  { name: 'Kudus', slug: 'kudus', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.8048, lng: 110.8405, timezone: 'Asia/Jakarta' },
  { name: 'Jepara', slug: 'jepara', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -6.5932, lng: 110.6778, timezone: 'Asia/Jakarta' },
  { name: 'Kebumen', slug: 'kebumen', country: 'Indonesia', province: 'Jawa Tengah', region: 'Jawa Tengah', lat: -7.6686, lng: 109.6521, timezone: 'Asia/Jakarta' },

  // Jawa Timur (Indonesia)
  { name: 'Surabaya', slug: 'surabaya', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.2575, lng: 112.7521, timezone: 'Asia/Jakarta' },
  { name: 'Malang', slug: 'malang', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.9666, lng: 112.6326, timezone: 'Asia/Jakarta' },
  { name: 'Sidoarjo', slug: 'sidoarjo', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.4478, lng: 112.7183, timezone: 'Asia/Jakarta' },
  { name: 'Mojokerto', slug: 'mojokerto', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.4726, lng: 112.4381, timezone: 'Asia/Jakarta' },
  { name: 'Kediri', slug: 'kediri', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.8480, lng: 112.0178, timezone: 'Asia/Jakarta' },
  { name: 'Tulungagung', slug: 'tulungagung', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.0647, lng: 111.9012, timezone: 'Asia/Jakarta' },
  { name: 'Jember', slug: 'jember', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.1724, lng: 113.7007, timezone: 'Asia/Jakarta' },
  { name: 'Banyuwangi', slug: 'banyuwangi', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -8.2192, lng: 114.3692, timezone: 'Asia/Jakarta' },
  { name: 'Madiun', slug: 'madiun', country: 'Indonesia', province: 'Jawa Timur', region: 'Jawa Timur', lat: -7.6298, lng: 111.5239, timezone: 'Asia/Jakarta' },

  // Bali & Nusa Tenggara (Indonesia)
  { name: 'Bali', slug: 'bali', country: 'Indonesia', province: 'Bali', region: 'Bali', aliases: ['Denpasar', 'Badung', 'Gianyar'], lat: -8.6705, lng: 115.2126, timezone: 'Asia/Makassar' },
  { name: 'Denpasar', slug: 'denpasar', country: 'Indonesia', province: 'Bali', region: 'Bali', lat: -8.6705, lng: 115.2126, timezone: 'Asia/Makassar' },
  { name: 'Badung', slug: 'badung', country: 'Indonesia', province: 'Bali', region: 'Bali', lat: -8.5833, lng: 115.1833, timezone: 'Asia/Makassar' },
  { name: 'Gianyar', slug: 'gianyar', country: 'Indonesia', province: 'Bali', region: 'Bali', lat: -8.5433, lng: 115.3283, timezone: 'Asia/Makassar' },
  { name: 'Tabanan', slug: 'tabanan', country: 'Indonesia', province: 'Bali', region: 'Bali', lat: -8.5411, lng: 115.1252, timezone: 'Asia/Makassar' },
  { name: 'Mataram', slug: 'mataram', country: 'Indonesia', province: 'Nusa Tenggara Barat', region: 'Nusa Tenggara', aliases: ['Lombok'], lat: -8.5833, lng: 116.1167, timezone: 'Asia/Makassar' },

  // Sumatera (Indonesia)
  { name: 'Medan', slug: 'medan', country: 'Indonesia', province: 'Sumatera Utara', region: 'Sumatera', lat: 3.5952, lng: 98.6722, timezone: 'Asia/Jakarta' },
  { name: 'Palembang', slug: 'palembang', country: 'Indonesia', province: 'Sumatera Selatan', region: 'Sumatera', lat: -2.9761, lng: 104.7754, timezone: 'Asia/Jakarta' },
  { name: 'Pekanbaru', slug: 'pekanbaru', country: 'Indonesia', province: 'Riau', region: 'Sumatera', lat: 0.5071, lng: 101.4478, timezone: 'Asia/Jakarta' },
  { name: 'Batam', slug: 'batam', country: 'Indonesia', province: 'Kepulauan Riau', region: 'Sumatera', lat: 1.1301, lng: 104.0529, timezone: 'Asia/Jakarta' },
  { name: 'Padang', slug: 'padang', country: 'Indonesia', province: 'Sumatera Barat', region: 'Sumatera', lat: -0.9471, lng: 100.4172, timezone: 'Asia/Jakarta' },
  { name: 'Bandar Lampung', slug: 'bandar-lampung', country: 'Indonesia', province: 'Lampung', region: 'Sumatera', aliases: ['Lampung'], lat: -5.3971, lng: 105.2668, timezone: 'Asia/Jakarta' },

  // Kalimantan (Indonesia)
  { name: 'Banjarmasin', slug: 'banjarmasin', country: 'Indonesia', province: 'Kalimantan Selatan', region: 'Kalimantan', lat: -3.3194, lng: 114.5908, timezone: 'Asia/Makassar' },
  { name: 'Banjarbaru', slug: 'banjarbaru', country: 'Indonesia', province: 'Kalimantan Selatan', region: 'Kalimantan', lat: -3.4404, lng: 114.8306, timezone: 'Asia/Makassar' },
  { name: 'Samarinda', slug: 'samarinda', country: 'Indonesia', province: 'Kalimantan Timur', region: 'Kalimantan', lat: -0.5022, lng: 117.1536, timezone: 'Asia/Makassar' },
  { name: 'Balikpapan', slug: 'balikpapan', country: 'Indonesia', province: 'Kalimantan Timur', region: 'Kalimantan', lat: -1.2379, lng: 116.8529, timezone: 'Asia/Makassar' },
  { name: 'Pontianak', slug: 'pontianak', country: 'Indonesia', province: 'Kalimantan Barat', region: 'Kalimantan', lat: -0.0263, lng: 109.3425, timezone: 'Asia/Jakarta' },

  // Sulawesi & Papua (Indonesia)
  { name: 'Makassar', slug: 'makassar', country: 'Indonesia', province: 'Sulawesi Selatan', region: 'Sulawesi', aliases: ['Ujung Pandang'], lat: -5.1477, lng: 119.4327, timezone: 'Asia/Makassar' },
  { name: 'Manado', slug: 'manado', country: 'Indonesia', province: 'Sulawesi Utara', region: 'Sulawesi', lat: 1.4748, lng: 124.8421, timezone: 'Asia/Makassar' },
  { name: 'Jayapura', slug: 'jayapura', country: 'Indonesia', province: 'Papua', region: 'Papua', lat: -2.5916, lng: 140.6690, timezone: 'Asia/Jayapura' },

  // Singapore
  { name: 'Singapore', slug: 'singapore', country: 'Singapore', province: 'Central Region', region: 'Singapore', aliases: ['SG'], lat: 1.3521, lng: 103.8198, timezone: 'Asia/Singapore' },

  // Malaysia
  { name: 'Kuala Lumpur', slug: 'kuala-lumpur', country: 'Malaysia', province: 'Federal Territory', region: 'Kuala Lumpur', aliases: ['KL'], lat: 3.1390, lng: 101.6869, timezone: 'Asia/Kuala_Lumpur' },
  { name: 'George Town', slug: 'george-town', country: 'Malaysia', province: 'Penang', region: 'Penang', aliases: ['Penang'], lat: 5.4141, lng: 100.3288, timezone: 'Asia/Kuala_Lumpur' },
  { name: 'Johor Bahru', slug: 'johor-bahru', country: 'Malaysia', province: 'Johor', region: 'Johor', aliases: ['JB'], lat: 1.4927, lng: 103.7414, timezone: 'Asia/Kuala_Lumpur' },

  // Thailand
  { name: 'Bangkok', slug: 'bangkok', country: 'Thailand', province: 'Bangkok', region: 'Central Thailand', aliases: ['BKK', 'Krung Thep'], lat: 13.7563, lng: 100.5018, timezone: 'Asia/Bangkok' },
  { name: 'Nonthaburi', slug: 'nonthaburi', country: 'Thailand', province: 'Nonthaburi', region: 'Impact Muang Thong Thani', lat: 13.8621, lng: 100.5144, timezone: 'Asia/Bangkok' },
  { name: 'Chiang Mai', slug: 'chiang-mai', country: 'Thailand', province: 'Chiang Mai', region: 'Northern Thailand', lat: 18.7883, lng: 98.9853, timezone: 'Asia/Bangkok' },

  // Philippines
  { name: 'Manila', slug: 'manila', country: 'Philippines', province: 'Metro Manila', region: 'NCR', aliases: ['Metro Manila', 'Pasay', 'Quezon City', 'Taguig'], lat: 14.5995, lng: 120.9842, timezone: 'Asia/Manila' },
  { name: 'Cebu City', slug: 'cebu-city', country: 'Philippines', province: 'Cebu', region: 'Central Visayas', aliases: ['Cebu'], lat: 10.3157, lng: 123.8854, timezone: 'Asia/Manila' },

  // Vietnam
  { name: 'Ho Chi Minh City', slug: 'ho-chi-minh-city', country: 'Vietnam', province: 'Southeast', region: 'HCMC', aliases: ['HCMC', 'Saigon'], lat: 10.8231, lng: 106.6297, timezone: 'Asia/Ho_Chi_Minh' },
  { name: 'Hanoi', slug: 'hanoi', country: 'Vietnam', province: 'Red River Delta', region: 'Hanoi', aliases: ['Ha Noi'], lat: 21.0285, lng: 105.8542, timezone: 'Asia/Ho_Chi_Minh' },
  { name: 'Da Nang', slug: 'da-nang', country: 'Vietnam', province: 'South Central Coast', region: 'Central Vietnam', aliases: ['Danang'], lat: 16.0544, lng: 108.2022, timezone: 'Asia/Ho_Chi_Minh' }
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

  static getAllCountries() {
    return ['Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam'];
  }

  static getCitiesByCountry(country) {
    return cityRegistry.getCitiesByCountry(country);
  }

  getAllCountries() {
    return ['Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam'];
  }

  getCitiesByCountry(country) {
    if (!country) return this.getAllCities();
    const clean = country.toLowerCase().trim();
    const cities = this.getAllCities();
    return cities.filter(c => {
      const cityCountry = (c.country || 'Indonesia').toLowerCase().trim();
      return cityCountry === clean ||
        (clean === 'id' && cityCountry === 'indonesia') ||
        (clean === 'sg' && cityCountry === 'singapore') ||
        (clean === 'my' && cityCountry === 'malaysia') ||
        (clean === 'th' && cityCountry === 'thailand') ||
        (clean === 'ph' && cityCountry === 'philippines') ||
        (clean === 'vn' && cityCountry === 'vietnam');
    });
  }

  /**
   * Dynamically registers a newly observed city
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
      country: cityData.country || 'Indonesia',
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

