/**
 * ARGUS Event Normalization Service
 * 
 * Normalizes multi-source event data into canonical format:
 * - 20 Standard Event Types
 * - Noise & sponsor removal from titles
 * - ISO-8601 Datetime with Indonesia timezones (WIB, WITA, WIT)
 * - Canonical Venue & City mapping
 * - ISO-8601 Datetime with Indonesia timezones (WIB +07:00, WITA +08:00, WIT +09:00)
 * - Canonical Venue & City mapping across all 8 Indonesian regions
 * - Zero fallback to Jakarta for unmapped cities
 * - URL Slug generator for SEO assets
 */

const EVENT_TYPES = {
  CONCERT: 'CONCERT',
  FESTIVAL: 'FESTIVAL',
  SPORT: 'SPORT',
  FOOTBALL: 'FOOTBALL',
  BASKETBALL: 'BASKETBALL',
  BADMINTON: 'BADMINTON',
  MOTORSPORT: 'MOTORSPORT',
  RUNNING: 'RUNNING',
  COMBAT_SPORT: 'COMBAT_SPORT',
  ESPORTS: 'ESPORTS',
  THEATER: 'THEATER',
  COMEDY: 'COMEDY',
  MUSIC_GIG: 'MUSIC_GIG',
  CONFERENCE: 'CONFERENCE',
  EXHIBITION: 'EXHIBITION',
  FAMILY: 'FAMILY',
  CULTURAL: 'CULTURAL',
  RELIGIOUS: 'RELIGIOUS',
  COMMUNITY: 'COMMUNITY',
  OTHER: 'OTHER'
};

// Known venues lookup dictionary for normalization
// Known venues lookup dictionary for normalization across Indonesia
const KNOWN_VENUES = [
  // National Stadiums & Arenas (Jakarta / Jabodetabek)
  {
    id: 'venue-gbk',
    canonical_name: 'Gelora Bung Karno (Main Stadium)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.2186,
    lng: 106.8018,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['gbk', 'gelora bung karno', 'stadion utama gbk', 'sugbk', 'gelora bung karno senayan']
  },
  {
    id: 'venue-indonesia-arena',
    canonical_name: 'Indonesia Arena, Senayan',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.2162,
    lng: 106.8015,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['indonesia arena', 'indoor multifunction stadium gbk', 'ims gbk', 'indonesia arena senayan', 'indonesia arena gbk']
  },
  {
    id: 'venue-jis',
    canonical_name: 'Jakarta International Stadium (JIS)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.1264,
    lng: 106.8587,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['jis', 'jakarta international stadium']
  },
  {
    id: 'venue-ice-bsd',
    canonical_name: 'Indonesia Convention Exhibition (ICE BSD)',
    city: 'Tangerang',
    province: 'Banten',
    lat: -6.3023,
    lng: 106.6372,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['ice bsd', 'ice bsd city', 'indonesia convention exhibition', 'ice bsd hall']
  },
  {
    id: 'venue-kemayoran',
    canonical_name: 'Gambir Expo / JIExpo Kemayoran',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.1478,
    lng: 106.8488,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['jiexpo', 'jiexpo kemayoran', 'gambir expo', 'jakarta international expo']
  },
  {
    id: 'venue-beach-city',
    canonical_name: 'Beach City International Stadium (BCIS)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.1189,
    lng: 106.8492,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['beach city', 'bcis', 'beach city international stadium', 'ancol beach city', 'mata elang']
  },
  {
    id: 'venue-tim',
    canonical_name: 'Taman Ismail Marzuki (TIM)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    lat: -6.1903,
    lng: 106.8398,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['tim', 'taman ismail marzuki', 'teater jakarta tim', 'graha bhakti budaya']
  },

  // Regional Venues — Jawa Barat
  {
    id: 'venue-siliwangi',
    canonical_name: 'Stadion Siliwangi',
    city: 'Bandung',
    province: 'Jawa Barat',
    lat: -6.9075,
    lng: 107.6189,
    capacity_tier: 'STADIUM_REGIONAL',
    aliases: ['stadion siliwangi', 'siliwangi stadium', 'siliwangi bandung']
  },
  {
    id: 'venue-eldorado',
    canonical_name: 'Eldorado Dome',
    city: 'Bandung',
    province: 'Jawa Barat',
    lat: -6.8378,
    lng: 107.5997,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['eldorado', 'eldorado dome', 'eldorado bandung', 'eldorado convention hall']
  },

  // Regional Venues — Jawa Tengah & DIY
  {
    id: 'venue-jec',
    canonical_name: 'Jogja Expo Center (JEC)',
    city: 'Yogyakarta',
    province: 'DI Yogyakarta',
    lat: -7.7986,
    lng: 110.4045,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['jec', 'jogja expo center', 'jec yogyakarta', 'jogja expo']
  },
  {
    id: 'venue-kridosono',
    canonical_name: 'Stadion Kridosono',
    city: 'Yogyakarta',
    province: 'DI Yogyakarta',
    lat: -7.7877,
    lng: 110.3722,
    capacity_tier: 'STADIUM_REGIONAL',
    aliases: ['kridosono', 'stadion kridosono', 'kridosono yogyakarta']
  },
  {
    id: 'venue-prambanan',
    canonical_name: 'Candi Prambanan Open Air Theatre',
    city: 'Yogyakarta',
    province: 'DI Yogyakarta',
    lat: -7.7520,
    lng: 110.4915,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['candi prambanan', 'prambanan', 'prambanan temple', 'candi prambanan yogyakarta']
  },
  {
    id: 'venue-sam-poo-kong',
    canonical_name: 'Klenteng Sam Poo Kong',
    city: 'Semarang',
    province: 'Jawa Tengah',
    lat: -6.9961,
    lng: 110.3981,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['sam poo kong', 'klenteng sam poo kong', 'sam poo kong semarang']
  },
  {
    id: 'venue-tjolomadoe',
    canonical_name: 'De Tjolomadoe',
    city: 'Solo',
    province: 'Jawa Tengah',
    lat: -7.5348,
    lng: 110.7483,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['de tjolomadoe', 'tjolomadoe', 'colomadu', 'de colomadu']
  },
  {
    id: 'venue-manahan',
    canonical_name: 'Stadion Manahan',
    city: 'Solo',
    province: 'Jawa Tengah',
    lat: -7.5562,
    lng: 110.8083,
    capacity_tier: 'STADIUM_REGIONAL',
    aliases: ['stadion manahan', 'manahan', 'manahan solo', 'manahan stadium']
  },

  // Regional Venues — Jawa Timur
  {
    id: 'venue-jatim-expo',
    canonical_name: 'Jatim Expo (JX International)',
    city: 'Surabaya',
    province: 'Jawa Timur',
    lat: -7.3142,
    lng: 112.7336,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['jatim expo', 'jx international', 'jatim expo surabaya', 'surabaya expo center']
  },
  {
    id: 'venue-grand-city',
    canonical_name: 'Grand City Convention Center',
    city: 'Surabaya',
    province: 'Jawa Timur',
    lat: -7.2625,
    lng: 112.7497,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['grand city', 'grand city convention center', 'grand city surabaya']
  },
  {
    id: 'venue-gbt',
    canonical_name: 'Stadion Gelora Bung Tomo (GBT)',
    city: 'Surabaya',
    province: 'Jawa Timur',
    lat: -7.2272,
    lng: 112.6289,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['gbt', 'stadion gelora bung tomo', 'gelora bung tomo surabaya']
  },
  {
    id: 'venue-graha-cakrawala',
    canonical_name: 'Graha Cakrawala UM',
    city: 'Malang',
    province: 'Jawa Timur',
    lat: -7.9625,
    lng: 112.6186,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['graha cakrawala', 'graha cakrawala um', 'cakrawala malang', 'graha cakrawala universitas negeri malang']
  },

  // Regional Venues — Bali & Nusa Tenggara
  {
    id: 'venue-gwk',
    canonical_name: 'Garuda Wisnu Kencana (GWK Cultural Park)',
    city: 'Badung',
    province: 'Bali',
    lat: -8.8105,
    lng: 115.1667,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['gwk', 'garuda wisnu kencana', 'gwk bali', 'lotus pond gwk']
  },
  {
    id: 'venue-savaya',
    canonical_name: 'Savaya Bali',
    city: 'Badung',
    province: 'Bali',
    lat: -8.8475,
    lng: 115.1539,
    capacity_tier: 'CLUB_RESORT',
    aliases: ['savaya', 'savaya bali', 'omnia bali']
  },
  {
    id: 'venue-peninsula',
    canonical_name: 'Peninsula Island Nusa Dua',
    city: 'Badung',
    province: 'Bali',
    lat: -8.8028,
    lng: 115.2347,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['peninsula island', 'peninsula nusa dua', 'nusa dua bali']
  },

  // Regional Venues — Sumatera
  {
    id: 'venue-pos-bloc-medan',
    canonical_name: 'Pos Bloc Medan',
    city: 'Medan',
    province: 'Sumatera Utara',
    lat: 3.5912,
    lng: 98.6756,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['pos bloc medan', 'kantor pos medan', 'pos bloc']
  },
  {
    id: 'venue-tiara-medan',
    canonical_name: 'Tiara Convention Center Medan',
    city: 'Medan',
    province: 'Sumatera Utara',
    lat: 3.5855,
    lng: 98.6711,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['tiara convention center', 'tiara medan', 'tiara hotel convention']
  },
  {
    id: 'venue-jakabaring',
    canonical_name: 'Stadion Gelora Sriwijaya Jakabaring',
    city: 'Palembang',
    province: 'Sumatera Selatan',
    lat: -3.0208,
    lng: 104.7892,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['jakabaring', 'gelora sriwijaya', 'jakabaring palembang', 'stadion jakabaring']
  },

  // Regional Venues — Kalimantan
  {
    id: 'venue-lapangan-murjani',
    canonical_name: 'Lapangan Murjani Banjarbaru',
    city: 'Banjarbaru',
    province: 'Kalimantan Selatan',
    lat: -3.4411,
    lng: 114.8315,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['lapangan murjani', 'murjani banjarbaru', 'alun alun banjarbaru']
  },

  // Regional Venues — Sulawesi
  {
    id: 'venue-ccc-makassar',
    canonical_name: 'Celebes Convention Center (CCC)',
    city: 'Makassar',
    province: 'Sulawesi Selatan',
    lat: -5.1558,
    lng: 119.4042,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['ccc makassar', 'celebes convention center', 'ccc', 'celebes convention']
  },
  {
    id: 'venue-phinisipoint',
    canonical_name: 'Parking Lot Phinisi Point Makassar',
    city: 'Makassar',
    province: 'Sulawesi Selatan',
    lat: -5.1517,
    lng: 119.4069,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['phinisi point', 'pipo makassar', 'parking lot pipo']
  }
];

// Expanded Indonesian cities mapping across all 8 regions
const KNOWN_CITIES = {
  // Jabodetabek
  jakarta: { city: 'Jakarta', province: 'DKI Jakarta', timezone: 'Asia/Jakarta' },
  tangerang: { city: 'Tangerang', province: 'Banten', timezone: 'Asia/Jakarta' },
  'tangerang selatan': { city: 'Tangerang Selatan', province: 'Banten', timezone: 'Asia/Jakarta' },
  tangsel: { city: 'Tangerang Selatan', province: 'Banten', timezone: 'Asia/Jakarta' },
  bekasi: { city: 'Bekasi', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  bogor: { city: 'Bogor', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  depok: { city: 'Depok', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },

  // Jawa Barat
  bandung: { city: 'Bandung', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  cimahi: { city: 'Cimahi', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  cirebon: { city: 'Cirebon', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  tasikmalaya: { city: 'Tasikmalaya', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },
  sukabumi: { city: 'Sukabumi', province: 'Jawa Barat', timezone: 'Asia/Jakarta' },

  // Jawa Tengah & DIY
  semarang: { city: 'Semarang', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  solo: { city: 'Solo', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  surakarta: { city: 'Solo', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  yogyakarta: { city: 'Yogyakarta', province: 'DI Yogyakarta', timezone: 'Asia/Jakarta' },
  jogja: { city: 'Yogyakarta', province: 'DI Yogyakarta', timezone: 'Asia/Jakarta' },
  diy: { city: 'Yogyakarta', province: 'DI Yogyakarta', timezone: 'Asia/Jakarta' },
  magelang: { city: 'Magelang', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  purwokerto: { city: 'Purwokerto', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  salatiga: { city: 'Salatiga', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  tegal: { city: 'Tegal', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  kudus: { city: 'Kudus', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  jepara: { city: 'Jepara', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },
  kebumen: { city: 'Kebumen', province: 'Jawa Tengah', timezone: 'Asia/Jakarta' },

  // Jawa Timur
  surabaya: { city: 'Surabaya', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  malang: { city: 'Malang', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  sidoarjo: { city: 'Sidoarjo', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  mojokerto: { city: 'Mojokerto', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  kediri: { city: 'Kediri', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  tulungagung: { city: 'Tulungagung', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  jember: { city: 'Jember', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  banyuwangi: { city: 'Banyuwangi', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },
  madiun: { city: 'Madiun', province: 'Jawa Timur', timezone: 'Asia/Jakarta' },

  // Bali & Nusa Tenggara
  bali: { city: 'Bali', province: 'Bali', timezone: 'Asia/Makassar' },
  denpasar: { city: 'Denpasar', province: 'Bali', timezone: 'Asia/Makassar' },
  badung: { city: 'Badung', province: 'Bali', timezone: 'Asia/Makassar' },
  gianyar: { city: 'Gianyar', province: 'Bali', timezone: 'Asia/Makassar' },
  tabanan: { city: 'Tabanan', province: 'Bali', timezone: 'Asia/Makassar' },
  mataram: { city: 'Mataram', province: 'Nusa Tenggara Barat', timezone: 'Asia/Makassar' },
  lombok: { city: 'Mataram', province: 'Nusa Tenggara Barat', timezone: 'Asia/Makassar' },

  // Sumatera
  medan: { city: 'Medan', province: 'Sumatera Utara', timezone: 'Asia/Jakarta' },
  palembang: { city: 'Palembang', province: 'Sumatera Selatan', timezone: 'Asia/Jakarta' },
  pekanbaru: { city: 'Pekanbaru', province: 'Riau', timezone: 'Asia/Jakarta' },
  batam: { city: 'Batam', province: 'Kepulauan Riau', timezone: 'Asia/Jakarta' },
  padang: { city: 'Padang', province: 'Sumatera Barat', timezone: 'Asia/Jakarta' },
  'bandar lampung': { city: 'Bandar Lampung', province: 'Lampung', timezone: 'Asia/Jakarta' },
  lampung: { city: 'Bandar Lampung', province: 'Lampung', timezone: 'Asia/Jakarta' },

  // Kalimantan
  banjarmasin: { city: 'Banjarmasin', province: 'Kalimantan Selatan', timezone: 'Asia/Makassar' },
  banjarbaru: { city: 'Banjarbaru', province: 'Kalimantan Selatan', timezone: 'Asia/Makassar' },
  samarinda: { city: 'Samarinda', province: 'Kalimantan Timur', timezone: 'Asia/Makassar' },
  balikpapan: { city: 'Balikpapan', province: 'Kalimantan Timur', timezone: 'Asia/Makassar' },
  pontianak: { city: 'Pontianak', province: 'Kalimantan Barat', timezone: 'Asia/Jakarta' },

  // Sulawesi & Papua
  makassar: { city: 'Makassar', province: 'Sulawesi Selatan', timezone: 'Asia/Makassar' },
  'ujung pandang': { city: 'Makassar', province: 'Sulawesi Selatan', timezone: 'Asia/Makassar' },
  manado: { city: 'Manado', province: 'Sulawesi Utara', timezone: 'Asia/Makassar' },
  jayapura: { city: 'Jayapura', province: 'Papua', timezone: 'Asia/Jayapura' }
};

class EventNormalizationService {
  /**
   * Cleans title of tournament/sponsor prefixes and noise.
   * e.g., "BRI Liga 1: Persib Bandung vs Persija Jakarta (Matchday 28)"
   * -> "Persib Bandung vs Persija Jakarta"
   */
  static normalizeTitle(rawTitle) {
    if (!rawTitle) return '';
    let title = String(rawTitle).trim();

    // Strip common sponsor noise and prefixes
    title = title.replace(/^(BRI\s+Liga\s+1\s*[:\-\—]\s*)/i, '');
    title = title.replace(/^(Pegadaian\s+Liga\s+2\s*[:\-\—]\s*)/i, '');
    title = title.replace(/^(Djarum\s+Superliga\s*[:\-\—]\s*)/i, '');
    title = title.replace(/^(Kapal\s+Api\s*[:\-\—]\s*)/i, '');
    title = title.replace(/\s*\(Matchday\s*\d+\)/i, '');
    title = title.replace(/\s*-\s*Live\s*In\s*Jakarta/i, '');
    title = title.replace(/\s*-\s*Official\s*Ticket/i, '');
    title = title.replace(/\s*\[OFFICIAL\]/i, '');
    title = title.replace(/\s*\s+/g, ' ').trim();

    // Standardize "v" or "v." to "vs"
    title = title.replace(/\s+v\.?\s+/gi, ' vs ');

    return title;
  }

  /**
   * Generates URL-safe SEO slug from event details.
   */
  static generateSlug(title, city, date) {
    const cleanTitle = this.normalizeTitle(title || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const cleanCity = city ? String(city).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const year = date ? String(date).substring(0, 4) : '';

    let slug = cleanTitle;
    if (cleanCity && !slug.includes(cleanCity)) {
      slug += `-${cleanCity}`;
    }
    if (year && !slug.includes(year)) {
      slug += `-${year}`;
    }

    return slug.replace(/(^-|-$)/g, '').toLowerCase();
  }

  /**
   * Categorizes raw string into one of the 20 canonical event types.
   */
  static normalizeEventType(rawCategory, title = '') {
    const text = `${rawCategory || ''} ${title || ''}`.toUpperCase();

    if (text.includes('SEPAK BOLA') || text.includes('FOOTBALL') || text.includes('LIGA 1') || text.includes('LIGA 2') || text.includes('PERSIB') || text.includes('PERSIJA') || text.includes('TIMNAS')) {
      return EVENT_TYPES.FOOTBALL;
    }
    if (text.includes('BASKET') || text.includes('IBL') || text.includes('NBA')) {
      return EVENT_TYPES.BASKETBALL;
    }
    if (text.includes('BADMINTON') || text.includes('BULUTANGKIS') || text.includes('INDONESIA OPEN') || text.includes('INDONESIA MASTERS')) {
      return EVENT_TYPES.BADMINTON;
    }
    if (text.includes('MOTO') || text.includes('F1') || text.includes('MANDALIKA') || text.includes('RACING')) {
      return EVENT_TYPES.MOTORSPORT;
    }
    if (text.includes('MARATHON') || text.includes('RUN') || text.includes('LARI')) {
      return EVENT_TYPES.RUNNING;
    }
    if (text.includes('MMA') || text.includes('BOXING') || text.includes('TINJU') || text.includes('ONE CHAMPIONSHIP')) {
      return EVENT_TYPES.COMBAT_SPORT;
    }
    if (text.includes('ESPORT') || text.includes('MPL') || text.includes('VALORANT') || text.includes('DOTA')) {
      return EVENT_TYPES.ESPORTS;
    }
    if (text.includes('SPORT') || text.includes('OLAHRAGA')) {
      return EVENT_TYPES.SPORT;
    }
    if (text.includes('STANDUP') || text.includes('COMEDY') || text.includes('KOMEDI') || text.includes('COMIC')) {
      return EVENT_TYPES.COMEDY;
    }
    if (text.includes('TEATER') || text.includes('THEATER') || text.includes('DRAMA') || text.includes('MUSIKAL')) {
      return EVENT_TYPES.THEATER;
    }
    if (text.includes('FESTIVAL') || text.includes('FEST')) {
      return EVENT_TYPES.FESTIVAL;
    }
    if (text.includes('GIG') || text.includes('SHOWCASE') || text.includes('INTIMATE')) {
      return EVENT_TYPES.MUSIC_GIG;
    }
    if (text.includes('KONSER') || text.includes('CONCERT') || text.includes('TOUR') || text.includes('MUSIC')) {
      return EVENT_TYPES.CONCERT;
    }
    if (text.includes('CONFERENCE') || text.includes('SUMMIT') || text.includes('SEMINAR')) {
      return EVENT_TYPES.CONFERENCE;
    }
    if (text.includes('EXPO') || text.includes('EXHIBITION') || text.includes('PAMERAN')) {
      return EVENT_TYPES.EXHIBITION;
    }
    if (text.includes('CULTURE') || text.includes('BUDAYA') || text.includes('WAYANG')) {
      return EVENT_TYPES.CULTURAL;
    }
    if (text.includes('RELIGI') || text.includes('TABLIGH') || text.includes('RETREAT')) {
      return EVENT_TYPES.RELIGIOUS;
    }
    if (text.includes('FAMILY') || text.includes('KID') || text.includes('ANAK')) {
      return EVENT_TYPES.FAMILY;
    }
    if (text.includes('COMMUNITY') || text.includes('KOMUNITAS')) {
      return EVENT_TYPES.COMMUNITY;
    }

    return EVENT_TYPES.OTHER;
  }

  /**
   * Maps raw venue and city string into canonical venue record.
   * STRICT GROUNDING: Never defaults unmapped cities to Jakarta.
   */
  static normalizeVenue(rawVenue, rawCity) {
    const vStr = String(rawVenue || '').toLowerCase().trim();
    const cStr = String(rawCity || '').toLowerCase().trim();

    for (const v of KNOWN_VENUES) {
      if (v.id === rawVenue || v.canonical_name.toLowerCase() === vStr) {
        return {
          venue_id: v.id,
          venue_name: v.canonical_name,
          city: v.city,
          province: v.province,
          country: 'Indonesia',
          lat: v.lat || null,
          lng: v.lng || null
        };
      }
      for (const alias of v.aliases) {
        if (vStr.includes(alias) || (alias.length > 4 && vStr.replace(/[^a-z0-9]/g, '').includes(alias.replace(/[^a-z0-9]/g, '')))) {
          return {
            venue_id: v.id,
            venue_name: v.canonical_name,
            city: v.city,
            province: v.province,
            country: 'Indonesia',
            lat: v.lat || null,
            lng: v.lng || null
          };
        }
      }
    }

    let resolvedCity = null;
    let resolvedProvince = null;

    for (const [key, val] of Object.entries(KNOWN_CITIES)) {
      if (cStr === key || cStr.includes(key) || vStr.includes(key)) {
        resolvedCity = val.city;
        resolvedProvince = val.province;
        break;
      }
    }

    if (!resolvedCity) {
      resolvedCity = rawCity ? rawCity.trim() : (rawVenue ? rawVenue.trim() : 'TBA City');
      resolvedProvince = 'Indonesia';
    }

    return {
      venue_id: null,
      venue_name: rawVenue ? rawVenue.trim() : 'TBA Venue',
      city: resolvedCity,
      province: resolvedProvince || 'Indonesia',
      country: 'Indonesia',
      lat: null,
      lng: null
    };
  }

  /**
   * Normalizes dates and times to ISO standard with appropriate Indonesia timezone offset:
   * WIB = +07:00, WITA = +08:00, WIT = +09:00
   */
  static normalizeDateTime(dateStr, timeStr = null, timezone = null, cityOrProvince = null) {
    let cleanTz = timezone;
    if ((!cleanTz || cleanTz === 'Asia/Jakarta') && cityOrProvince) {
      try {
        const { cityRegistry } = require('./CityRegistry');
        const c = cityRegistry.findCity(cityOrProvince);
        if (c && c.timezone) cleanTz = c.timezone;
      } catch (_) {}
    }
    cleanTz = cleanTz || 'Asia/Jakarta';

    if (!dateStr) return { start_datetime: null, date: null, time: null, timezone: cleanTz };

    let cleanDate = String(dateStr).trim();
    if (cleanDate.includes('T')) {
      cleanDate = cleanDate.split('T')[0];
    }

    let cleanTime = timeStr ? String(timeStr).trim() : '19:00';
    if (!cleanTime.includes(':')) {
      cleanTime = `${cleanTime}:00`;
    }
    const timeParts = cleanTime.split(':');
    cleanTime = `${timeParts[0].padStart(2, '0')}:${(timeParts[1] || '00').padStart(2, '0')}`;

    let offset = '+07:00';
    if (cleanTz === 'Asia/Makassar' || cleanTz === 'WITA') {
      offset = '+08:00';
    } else if (cleanTz === 'Asia/Jayapura' || cleanTz === 'WIT') {
      offset = '+09:00';
    }

    const isoDatetime = `${cleanDate}T${cleanTime}:00${offset}`;

    return {
      start_datetime: isoDatetime,
      date: cleanDate,
      time: cleanTime,
      timezone: cleanTz
    };
  }
}

module.exports = {
  EventNormalizationService,
  EVENT_TYPES,
  KNOWN_VENUES,
  KNOWN_CITIES
};
