/**
 * ARGUS Event Normalization Service
 * 
 * Normalizes multi-source event data into canonical format:
 * - 20 Standard Event Types
 * - Noise & sponsor removal from titles
 * - ISO-8601 Datetime with Indonesia timezones (WIB, WITA, WIT)
 * - Canonical Venue & City mapping
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
const KNOWN_VENUES = [
  {
    id: 'venue-gbk',
    canonical_name: 'Gelora Bung Karno (Main Stadium)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    aliases: ['gbk', 'gelora bung karno', 'stadion utama gbk', 'sugbk', 'gelora bung karno senayan']
  },
  {
    id: 'venue-indonesia-arena',
    canonical_name: 'Indonesia Arena GBK',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    aliases: ['indonesia arena', 'indoor multifunction stadium gbk', 'ims gbk']
  },
  {
    id: 'venue-jis',
    canonical_name: 'Jakarta International Stadium (JIS)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    aliases: ['jis', 'jakarta international stadium']
  },
  {
    id: 'venue-ice-bsd',
    canonical_name: 'Indonesia Convention Exhibition (ICE BSD)',
    city: 'Tangerang',
    province: 'Banten',
    aliases: ['ice bsd', 'ice bsd city', 'indonesia convention exhibition']
  },
  {
    id: 'venue-kemayoran',
    canonical_name: 'Gambir Expo / JIExpo Kemayoran',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    aliases: ['jiexpo', 'jiexpo kemayoran', 'gambir expo', 'jakarta international expo']
  },
  {
    id: 'venue-tim',
    canonical_name: 'Taman Ismail Marzuki (TIM)',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    aliases: ['tim', 'taman ismail marzuki', 'teater jakarta tim', 'graha bhakti budaya']
  },
  {
    id: 'venue-siliwangi',
    canonical_name: 'Stadion Siliwangi',
    city: 'Bandung',
    province: 'Jawa Barat',
    aliases: ['stadion siliwangi', 'siliwangi stadium', 'siliwangi bandung']
  },
  {
    id: 'venue-grand-city',
    canonical_name: 'Grand City Convention Center',
    city: 'Surabaya',
    province: 'Jawa Timur',
    aliases: ['grand city', 'grand city convention center', 'grand city surabaya']
  },
  {
    id: 'venue-gbt',
    canonical_name: 'Stadion Gelora Bung Tomo (GBT)',
    city: 'Surabaya',
    province: 'Jawa Timur',
    aliases: ['gbt', 'stadion gelora bung tomo', 'gelora bung tomo surabaya']
  },
  {
    id: 'venue-peninsula',
    canonical_name: 'Peninsula Island Nusa Dua',
    city: 'Badung',
    province: 'Bali',
    aliases: ['peninsula island', 'peninsula nusa dua', 'nusa dua bali']
  }
];

// Indonesian cities mapping
const KNOWN_CITIES = {
  jakarta: { city: 'Jakarta', province: 'DKI Jakarta' },
  bandung: { city: 'Bandung', province: 'Jawa Barat' },
  surabaya: { city: 'Surabaya', province: 'Jawa Timur' },
  tangerang: { city: 'Tangerang', province: 'Banten' },
  bekasi: { city: 'Bekasi', province: 'Jawa Barat' },
  bogor: { city: 'Bogor', province: 'Jawa Barat' },
  depok: { city: 'Depok', province: 'Jawa Barat' },
  semarang: { city: 'Semarang', province: 'Jawa Tengah' },
  yogyakarta: { city: 'Yogyakarta', province: 'DI Yogyakarta' },
  jogja: { city: 'Yogyakarta', province: 'DI Yogyakarta' },
  solo: { city: 'Surakarta', province: 'Jawa Tengah' },
  surakarta: { city: 'Surakarta', province: 'Jawa Tengah' },
  bali: { city: 'Denpasar', province: 'Bali' },
  denpasar: { city: 'Denpasar', province: 'Bali' },
  badung: { city: 'Badung', province: 'Bali' },
  medan: { city: 'Medan', province: 'Sumatera Utara' },
  makassar: { city: 'Makassar', province: 'Sulawesi Selatan' }
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
    const cleanTitle = this.normalizeTitle(title)
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

    return slug.replace(/^-+|-+$/g, '');
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
   */
  static normalizeVenue(rawVenue, rawCity) {
    const vStr = String(rawVenue || '').toLowerCase().trim();
    const cStr = String(rawCity || '').toLowerCase().trim();

    // Check alias match against known venues
    for (const v of KNOWN_VENUES) {
      if (v.id === rawVenue || v.canonical_name.toLowerCase() === vStr) {
        return {
          venue_id: v.id,
          venue_name: v.canonical_name,
          city: v.city,
          province: v.province,
          country: 'Indonesia'
        };
      }
      for (const alias of v.aliases) {
        if (vStr.includes(alias)) {
          return {
            venue_id: v.id,
            venue_name: v.canonical_name,
            city: v.city,
            province: v.province,
            country: 'Indonesia'
          };
        }
      }
    }

    // Resolve city and province
    let resolvedCity = rawCity ? rawCity.trim() : 'Jakarta';
    let resolvedProvince = 'DKI Jakarta';

    for (const [key, val] of Object.entries(KNOWN_CITIES)) {
      if (cStr.includes(key) || vStr.includes(key)) {
        resolvedCity = val.city;
        resolvedProvince = val.province;
        break;
      }
    }

    return {
      venue_id: null,
      venue_name: rawVenue ? rawVenue.trim() : 'TBA Venue',
      city: resolvedCity,
      province: resolvedProvince,
      country: 'Indonesia'
    };
  }

  /**
   * Normalizes dates and times to ISO standard with appropriate Indonesia timezone.
   */
  static normalizeDateTime(dateStr, timeStr = null, timezone = 'Asia/Jakarta') {
    if (!dateStr) return { start_datetime: null, date: null, time: null, timezone };

    // Standardize YYYY-MM-DD
    let cleanDate = String(dateStr).trim();
    if (cleanDate.includes('T')) {
      cleanDate = cleanDate.split('T')[0];
    }

    let cleanTime = timeStr ? String(timeStr).trim() : '19:00';
    if (!cleanTime.includes(':')) {
      cleanTime = `${cleanTime}:00`;
    }

    const isoDatetime = `${cleanDate}T${cleanTime}:00+07:00`; // Standard WIB (+07:00)

    return {
      start_datetime: isoDatetime,
      date: cleanDate,
      time: cleanTime,
      timezone: timezone || 'Asia/Jakarta'
    };
  }
}

module.exports = {
  EventNormalizationService,
  EVENT_TYPES,
  KNOWN_VENUES,
  KNOWN_CITIES
};
