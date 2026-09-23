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
  // MUSIC & ENTERTAINMENT
  CONCERT: 'CONCERT',
  SOLO_CONCERT: 'SOLO_CONCERT',
  WORLD_TOUR: 'WORLD_TOUR',
  FAN_MEETING: 'FAN_MEETING',
  FAN_CONCERT: 'FAN_CONCERT',
  FESTIVAL: 'FESTIVAL',
  DJ_EVENT: 'DJ_EVENT',
  CLUB_EVENT: 'CLUB_EVENT',
  ORCHESTRA: 'ORCHESTRA',
  MUSICAL_PERFORMANCE: 'MUSICAL_PERFORMANCE',
  OPERA: 'OPERA',
  BALLET: 'BALLET',
  DANCE_PERFORMANCE: 'DANCE_PERFORMANCE',
  CULTURAL_PERFORMANCE: 'CULTURAL_PERFORMANCE',
  KPOP_JPOP_CPOP: 'KPOP_JPOP_CPOP',
  COMEDY: 'COMEDY',
  STANDUP_COMEDY: 'STANDUP_COMEDY',
  VARIETY_SHOW: 'VARIETY_SHOW',
  THEATER: 'THEATER',
  BROADWAY_MUSICAL: 'BROADWAY_MUSICAL',
  FILM_SCREENING: 'FILM_SCREENING',
  SPECIAL_SCREENING: 'SPECIAL_SCREENING',
  ENTERTAINMENT_SHOW: 'ENTERTAINMENT_SHOW',
  MUSIC_GIG: 'MUSIC_GIG',

  // SPORTS
  SPORT: 'SPORT',
  FOOTBALL: 'FOOTBALL',
  BASKETBALL: 'BASKETBALL',
  VOLLEYBALL: 'VOLLEYBALL',
  BADMINTON: 'BADMINTON',
  TENNIS: 'TENNIS',
  MOTORSPORT: 'MOTORSPORT',
  FORMULA_RACING: 'FORMULA_RACING',
  MOTO_RACING: 'MOTO_RACING',
  BOXING: 'BOXING',
  MMA: 'MMA',
  WRESTLING: 'WRESTLING',
  ESPORTS: 'ESPORTS',
  RUNNING: 'RUNNING',
  MARATHON: 'MARATHON',
  CYCLING: 'CYCLING',
  GOLF: 'GOLF',
  SWIMMING: 'SWIMMING',
  COMBAT_SPORT: 'COMBAT_SPORT',
  SPECTATOR_SPORT: 'SPECTATOR_SPORT',

  // FESTIVALS / EXHIBITIONS / EXPERIENCES
  FOOD_FESTIVAL: 'FOOD_FESTIVAL',
  CULTURAL_FESTIVAL: 'CULTURAL_FESTIVAL',
  ART_FESTIVAL: 'ART_FESTIVAL',
  FILM_FESTIVAL: 'FILM_FESTIVAL',
  BOOK_FAIR: 'BOOK_FAIR',
  TRADE_FAIR: 'TRADE_FAIR',
  EXHIBITION: 'EXHIBITION',
  ART_EXHIBITION: 'ART_EXHIBITION',
  TECH_EXHIBITION: 'TECH_EXHIBITION',
  AUTO_SHOW: 'AUTO_SHOW',
  ANIME_COMIC_CON: 'ANIME_COMIC_CON',
  POP_CULTURE_CON: 'POP_CULTURE_CON',
  THEME_PARK: 'THEME_PARK',
  ATTRACTION: 'ATTRACTION',
  IMMERSIVE_EXPERIENCE: 'IMMERSIVE_EXPERIENCE',
  MUSEUM_EXHIBITION: 'MUSEUM_EXHIBITION',
  FAMILY: 'FAMILY',
  FAMILY_ENTERTAINMENT: 'FAMILY_ENTERTAINMENT',
  ZOO_WILDLIFE: 'ZOO_WILDLIFE',
  WATER_PARK: 'WATER_PARK',

  // BUSINESS / EDUCATION / PROFESSIONAL
  CONFERENCE: 'CONFERENCE',
  SUMMIT: 'SUMMIT',
  SEMINAR: 'SEMINAR',
  WORKSHOP: 'WORKSHOP',
  MASTERCLASS: 'MASTERCLASS',
  TRAINING: 'TRAINING',
  CERTIFICATION: 'CERTIFICATION',
  BUSINESS_EVENT: 'BUSINESS_EVENT',
  NETWORKING: 'NETWORKING',
  INDUSTRY_EVENT: 'INDUSTRY_EVENT',
  CREATOR_EVENT: 'CREATOR_EVENT',
  ACADEMIC_EVENT: 'ACADEMIC_EVENT',
  PUBLIC_LECTURE: 'PUBLIC_LECTURE',

  // OTHER / UNCATEGORIZED
  CULTURAL: 'CULTURAL',
  RELIGIOUS: 'RELIGIOUS',
  COMMUNITY: 'COMMUNITY',
  OTHER: 'OTHER'
};

const CATEGORY_GROUPS = {
  MUSIC: 'MUSIC',
  SPORTS: 'SPORTS',
  FESTIVALS_EXPERIENCES: 'FESTIVALS_EXPERIENCES',
  SHOWS_COMEDY: 'SHOWS_COMEDY',
  BUSINESS_EDUCATION: 'BUSINESS_EDUCATION',
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
    country: 'Indonesia',
    lat: -5.1517,
    lng: 119.4069,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['phinisi point', 'pipo makassar', 'parking lot pipo']
  },

  // Regional Venues — Singapore
  {
    id: 'venue-singapore-national-stadium',
    canonical_name: 'Singapore National Stadium',
    city: 'Singapore',
    province: 'Central Region',
    country: 'Singapore',
    lat: 1.3039,
    lng: 103.8748,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['singapore national stadium', 'national stadium singapore', 'kallang stadium']
  },
  {
    id: 'venue-singapore-indoor-stadium',
    canonical_name: 'Singapore Indoor Stadium',
    city: 'Singapore',
    province: 'Central Region',
    country: 'Singapore',
    lat: 1.3008,
    lng: 103.8752,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['singapore indoor stadium', 'indoor stadium singapore']
  },
  {
    id: 'venue-star-theatre-sg',
    canonical_name: 'The Star Performing Arts Centre (Star Theatre)',
    city: 'Singapore',
    province: 'Central Region',
    country: 'Singapore',
    lat: 1.3068,
    lng: 103.7885,
    capacity_tier: 'HALL_LARGE',
    aliases: ['star theatre', 'the star performing arts centre', 'star vista theatre']
  },
  {
    id: 'venue-sands-expo-sg',
    canonical_name: 'Sands Expo and Convention Centre',
    city: 'Singapore',
    province: 'Central Region',
    country: 'Singapore',
    lat: 1.2834,
    lng: 103.8591,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['sands expo', 'marina bay sands expo', 'mbs expo']
  },
  {
    id: 'venue-esplanade-sg',
    canonical_name: 'Esplanade – Theatres on the Bay',
    city: 'Singapore',
    province: 'Central Region',
    country: 'Singapore',
    lat: 1.2898,
    lng: 103.8558,
    capacity_tier: 'HALL_LARGE',
    aliases: ['esplanade', 'theatres on the bay', 'esplanade concert hall']
  },

  // Regional Venues — Malaysia
  {
    id: 'venue-bukit-jalil',
    canonical_name: 'National Stadium Bukit Jalil',
    city: 'Kuala Lumpur',
    province: 'Federal Territory',
    country: 'Malaysia',
    lat: 3.0546,
    lng: 101.6917,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['bukit jalil', 'stadium bukit jalil', 'national stadium bukit jalil', 'stadium nasional bukit jalil']
  },
  {
    id: 'venue-axiata-arena',
    canonical_name: 'Axiata Arena Bukit Jalil',
    city: 'Kuala Lumpur',
    province: 'Federal Territory',
    country: 'Malaysia',
    lat: 3.0583,
    lng: 101.6919,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['axiata arena', 'stadium putra', 'axiata arena bukit jalil']
  },
  {
    id: 'venue-mega-star-arena',
    canonical_name: 'Mega Star Arena KL',
    city: 'Kuala Lumpur',
    province: 'Federal Territory',
    country: 'Malaysia',
    lat: 3.1200,
    lng: 101.6780,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['mega star arena', 'mega star arena kl']
  },
  {
    id: 'venue-zepp-kl',
    canonical_name: 'Zepp Kuala Lumpur',
    city: 'Kuala Lumpur',
    province: 'Federal Territory',
    country: 'Malaysia',
    lat: 3.1412,
    lng: 101.7088,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['zepp kl', 'zepp kuala lumpur']
  },
  {
    id: 'venue-sepang',
    canonical_name: 'Sepang International Circuit',
    city: 'Kuala Lumpur',
    province: 'Selangor',
    country: 'Malaysia',
    lat: 2.7606,
    lng: 101.7378,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['sepang', 'sepang circuit', 'sepang international circuit']
  },

  // Regional Venues — Thailand
  {
    id: 'venue-rajamangala',
    canonical_name: 'Rajamangala National Stadium',
    city: 'Bangkok',
    province: 'Bangkok',
    country: 'Thailand',
    lat: 13.7553,
    lng: 100.6223,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['rajamangala', 'rajamangala stadium', 'rajamangala national stadium']
  },
  {
    id: 'venue-impact-arena',
    canonical_name: 'Impact Arena, Muang Thong Thani',
    city: 'Nonthaburi',
    province: 'Nonthaburi',
    country: 'Thailand',
    lat: 13.9114,
    lng: 100.5484,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['impact arena', 'impact muang thong thani', 'impact arena bangkok']
  },
  {
    id: 'venue-impact-challenger',
    canonical_name: 'Impact Challenger Hall',
    city: 'Nonthaburi',
    province: 'Nonthaburi',
    country: 'Thailand',
    lat: 13.9125,
    lng: 100.5501,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['impact challenger', 'impact exhibition center']
  },
  {
    id: 'venue-uob-live',
    canonical_name: 'UOB LIVE at Emsphere',
    city: 'Bangkok',
    province: 'Bangkok',
    country: 'Thailand',
    lat: 13.7317,
    lng: 100.5675,
    capacity_tier: 'ARENA_MEDIUM',
    aliases: ['uob live', 'uob live emsphere', 'emsphere bangkok']
  },
  {
    id: 'venue-bitec-bangkok',
    canonical_name: 'BITEC (Bangkok International Trade & Exhibition Centre)',
    city: 'Bangkok',
    province: 'Bangkok',
    country: 'Thailand',
    lat: 13.6698,
    lng: 100.6062,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['bitec', 'bitec bangna', 'bitec bangkok']
  },

  // Regional Venues — Philippines
  {
    id: 'venue-philippine-arena',
    canonical_name: 'Philippine Arena',
    city: 'Manila',
    province: 'Bulacan',
    country: 'Philippines',
    lat: 14.7951,
    lng: 120.9419,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['philippine arena', 'ciudad de victoria']
  },
  {
    id: 'venue-mall-of-asia-arena',
    canonical_name: 'SM Mall of Asia Arena',
    city: 'Manila',
    province: 'Metro Manila',
    country: 'Philippines',
    lat: 14.5322,
    lng: 120.9850,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['moa arena', 'mall of asia arena', 'sm moa arena']
  },
  {
    id: 'venue-smart-araneta',
    canonical_name: 'Smart Araneta Coliseum',
    city: 'Manila',
    province: 'Metro Manila',
    country: 'Philippines',
    lat: 14.6219,
    lng: 121.0531,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['araneta coliseum', 'smart araneta coliseum', 'the big dome']
  },
  {
    id: 'venue-new-frontier',
    canonical_name: 'New Frontier Theater',
    city: 'Manila',
    province: 'Metro Manila',
    country: 'Philippines',
    lat: 14.6200,
    lng: 121.0536,
    capacity_tier: 'HALL_MEDIUM',
    aliases: ['new frontier theater', 'kia theatre']
  },

  // Regional Venues — Vietnam
  {
    id: 'venue-my-dinh',
    canonical_name: 'My Dinh National Stadium',
    city: 'Hanoi',
    province: 'Red River Delta',
    country: 'Vietnam',
    lat: 21.0205,
    lng: 105.7639,
    capacity_tier: 'STADIUM_MEGA',
    aliases: ['my dinh', 'my dinh stadium', 'san van dong my dinh']
  },
  {
    id: 'venue-thong-nhat',
    canonical_name: 'Thong Nhat Stadium',
    city: 'Ho Chi Minh City',
    province: 'Southeast',
    country: 'Vietnam',
    lat: 10.7601,
    lng: 106.6578,
    capacity_tier: 'STADIUM_REGIONAL',
    aliases: ['thong nhat stadium', 'san van dong thong nhat']
  },
  {
    id: 'venue-quan-khu-7',
    canonical_name: 'Quan Khu 7 Stadium',
    city: 'Ho Chi Minh City',
    province: 'Southeast',
    country: 'Vietnam',
    lat: 10.8016,
    lng: 106.6669,
    capacity_tier: 'STADIUM_REGIONAL',
    aliases: ['quan khu 7', 'san van dong quan khu 7', 'military zone 7 stadium']
  },
  {
    id: 'venue-secc-hcmc',
    canonical_name: 'Saigon Exhibition and Convention Center (SECC)',
    city: 'Ho Chi Minh City',
    province: 'Southeast',
    country: 'Vietnam',
    lat: 10.7303,
    lng: 106.7214,
    capacity_tier: 'ARENA_LARGE',
    aliases: ['secc', 'secc hcmc', 'saigon exhibition center']
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
  makassar: { city: 'Makassar', province: 'Sulawesi Selatan', country: 'Indonesia', timezone: 'Asia/Makassar' },
  'ujung pandang': { city: 'Makassar', province: 'Sulawesi Selatan', country: 'Indonesia', timezone: 'Asia/Makassar' },
  manado: { city: 'Manado', province: 'Sulawesi Utara', country: 'Indonesia', timezone: 'Asia/Makassar' },
  jayapura: { city: 'Jayapura', province: 'Papua', country: 'Indonesia', timezone: 'Asia/Jayapura' },

  // Singapore
  singapore: { city: 'Singapore', province: 'Central Region', country: 'Singapore', timezone: 'Asia/Singapore' },
  sg: { city: 'Singapore', province: 'Central Region', country: 'Singapore', timezone: 'Asia/Singapore' },

  // Malaysia
  'kuala lumpur': { city: 'Kuala Lumpur', province: 'Federal Territory', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  kl: { city: 'Kuala Lumpur', province: 'Federal Territory', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  penang: { city: 'George Town', province: 'Penang', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  'george town': { city: 'George Town', province: 'Penang', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  'johor bahru': { city: 'Johor Bahru', province: 'Johor', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },

  // Thailand
  bangkok: { city: 'Bangkok', province: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok' },
  bkk: { city: 'Bangkok', province: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok' },
  nonthaburi: { city: 'Nonthaburi', province: 'Nonthaburi', country: 'Thailand', timezone: 'Asia/Bangkok' },
  'chiang mai': { city: 'Chiang Mai', province: 'Chiang Mai', country: 'Thailand', timezone: 'Asia/Bangkok' },

  // Philippines
  manila: { city: 'Manila', province: 'Metro Manila', country: 'Philippines', timezone: 'Asia/Manila' },
  pasay: { city: 'Manila', province: 'Metro Manila', country: 'Philippines', timezone: 'Asia/Manila' },
  'quezon city': { city: 'Manila', province: 'Metro Manila', country: 'Philippines', timezone: 'Asia/Manila' },
  cebu: { city: 'Cebu City', province: 'Cebu', country: 'Philippines', timezone: 'Asia/Manila' },

  // Vietnam
  'ho chi minh': { city: 'Ho Chi Minh City', province: 'Southeast', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  'ho chi minh city': { city: 'Ho Chi Minh City', province: 'Southeast', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  hcmc: { city: 'Ho Chi Minh City', province: 'Southeast', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  saigon: { city: 'Ho Chi Minh City', province: 'Southeast', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  hanoi: { city: 'Hanoi', province: 'Red River Delta', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  'ha noi': { city: 'Hanoi', province: 'Red River Delta', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  'da nang': { city: 'Da Nang', province: 'South Central Coast', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' }
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
   * Categorizes raw string into one of the canonical event types across all paid/ticketed categories.
   */
  static normalizeEventType(rawCategory, title = '') {
    const text = `${rawCategory || ''} ${title || ''}`.toUpperCase();

    // 1. SPORTS
    if (text.includes('SEPAK BOLA') || text.includes('FOOTBALL') || text.includes('SOCCER') || text.includes('LIGA 1') || text.includes('LIGA 2') || text.includes('PERSIB') || text.includes('PERSIJA') || text.includes('TIMNAS') || text.includes('EPL') || text.includes('AFF')) {
      return EVENT_TYPES.FOOTBALL;
    }
    if (text.includes('BASKET') || text.includes('IBL') || text.includes('NBA')) {
      return EVENT_TYPES.BASKETBALL;
    }
    if (text.includes('VOLLEY') || text.includes('VOLI') || text.includes('PROLIGA')) {
      return EVENT_TYPES.VOLLEYBALL;
    }
    if (text.includes('BADMINTON') || text.includes('BULUTANGKIS') || text.includes('INDONESIA OPEN') || text.includes('INDONESIA MASTERS') || text.includes('BWF')) {
      return EVENT_TYPES.BADMINTON;
    }
    if (text.includes('TENNIS') || text.includes('TENIS') || text.includes('ATP') || text.includes('WTA')) {
      return EVENT_TYPES.TENNIS;
    }
    if (text.includes('F1') || text.includes('FORMULA 1') || text.includes('FORMULA RACING')) {
      return EVENT_TYPES.FORMULA_RACING;
    }
    if (text.includes('MOTOGP') || text.includes('MOTO2') || text.includes('MOTO RACING') || text.includes('MANDALIKA') || text.includes('SEPANG')) {
      return EVENT_TYPES.MOTO_RACING;
    }
    if (text.includes('MOTORSPORT') || text.includes('RACING') || text.includes('BALAP')) {
      return EVENT_TYPES.MOTORSPORT;
    }
    if (text.includes('MARATHON') || text.includes('HALF MARATHON')) {
      return EVENT_TYPES.MARATHON;
    }
    if (text.includes('RUN') || text.includes('LARI') || text.includes('10K') || text.includes('5K') || text.includes('TRAIL RUN')) {
      return EVENT_TYPES.RUNNING;
    }
    if (text.includes('CYCLING') || text.includes('SEPEDA') || text.includes('GRAN FONDO')) {
      return EVENT_TYPES.CYCLING;
    }
    if (text.includes('GOLF')) {
      return EVENT_TYPES.GOLF;
    }
    if (text.includes('SWIMMING') || text.includes('RENANG')) {
      return EVENT_TYPES.SWIMMING;
    }
    if (text.includes('MMA') || text.includes('ONE CHAMPIONSHIP') || text.includes('UFC')) {
      return EVENT_TYPES.MMA;
    }
    if (text.includes('BOXING') || text.includes('TINJU')) {
      return EVENT_TYPES.BOXING;
    }
    if (text.includes('WRESTLING') || text.includes('GULAT') || text.includes('WWE')) {
      return EVENT_TYPES.WRESTLING;
    }
    if (text.includes('COMBAT') || text.includes('BELA DIRI')) {
      return EVENT_TYPES.COMBAT_SPORT;
    }
    if (text.includes('ESPORT') || text.includes('MPL') || text.includes('VALORANT') || text.includes('DOTA') || text.includes('PUBG') || text.includes('MOBILE LEGENDS')) {
      return EVENT_TYPES.ESPORTS;
    }
    if (text.includes('SPORT') || text.includes('OLAHRAGA') || text.includes('MATCH') || text.includes('PERTANDINGAN')) {
      return EVENT_TYPES.SPORT;
    }

    // 2. FESTIVALS, EXHIBITIONS & EXPERIENCES
    if (text.includes('FOOD FESTIVAL') || text.includes('KULINER') || text.includes('CULINARY')) {
      return EVENT_TYPES.FOOD_FESTIVAL;
    }
    if (text.includes('ANIME') || text.includes('COMIC CON') || text.includes('COSPLAY') || text.includes('POP CULTURE') || text.includes('COMICON')) {
      return EVENT_TYPES.ANIME_COMIC_CON;
    }
    if (text.includes('THEME PARK') || text.includes('DUFAN') || text.includes('UNIVERSAL STUDIOS')) {
      return EVENT_TYPES.THEME_PARK;
    }
    if (text.includes('WATER PARK') || text.includes('WATERPARK') || text.includes('WATERBOM')) {
      return EVENT_TYPES.WATER_PARK;
    }
    if (text.includes('ZOO') || text.includes('SAFARI') || text.includes('AQUARIUM') || text.includes('SEA WORLD')) {
      return EVENT_TYPES.ZOO_WILDLIFE;
    }
    if (text.includes('IMMERSIVE') || text.includes('EXPERIENCE') || text.includes('PENGALAMAN')) {
      return EVENT_TYPES.IMMERSIVE_EXPERIENCE;
    }
    if (text.includes('AUTO SHOW') || text.includes('GIIAS') || text.includes('IIMS') || text.includes('MOTOR SHOW')) {
      return EVENT_TYPES.AUTO_SHOW;
    }
    if (text.includes('TECH') || text.includes('TEKNOLOGI') || text.includes('INNOVATION EXPO')) {
      return EVENT_TYPES.TECH_EXHIBITION;
    }
    if (text.includes('BOOK FAIR') || text.includes('BIG BAD WOLF') || text.includes('PESTA BUKU')) {
      return EVENT_TYPES.BOOK_FAIR;
    }
    if (text.includes('ART EXHIBITION') || text.includes('PAMERAN SENI') || text.includes('ART JAKARTA') || text.includes('MUSEUM')) {
      return EVENT_TYPES.ART_EXHIBITION;
    }
    if (text.includes('EXPO') || text.includes('EXHIBITION') || text.includes('PAMERAN') || text.includes('FAIR') || text.includes('TRADE FAIR')) {
      return EVENT_TYPES.EXHIBITION;
    }
    if (text.includes('ATTRACTION') || text.includes('ATRAKSI') || text.includes('OBSERVATION DECK')) {
      return EVENT_TYPES.ATTRACTION;
    }

    // 3. SHOWS & COMEDY
    if (text.includes('STANDUP') || text.includes('COMEDY') || text.includes('KOMEDI') || text.includes('COMIC')) {
      return EVENT_TYPES.STANDUP_COMEDY;
    }
    if (text.includes('VARIETY') || text.includes('TALK SHOW')) {
      return EVENT_TYPES.VARIETY_SHOW;
    }
    if (text.includes('BROADWAY') || text.includes('MUSIKAL') || text.includes('MUSICAL THEATER')) {
      return EVENT_TYPES.BROADWAY_MUSICAL;
    }
    if (text.includes('TEATER') || text.includes('THEATER') || text.includes('DRAMA') || text.includes('SANDIWARA')) {
      return EVENT_TYPES.THEATER;
    }
    if (text.includes('SCREENING') || text.includes('FILM') || text.includes('CINEMA') || text.includes('NOBAR')) {
      return EVENT_TYPES.FILM_SCREENING;
    }

    // 4. BUSINESS & EDUCATION
    if (text.includes('SUMMIT')) {
      return EVENT_TYPES.SUMMIT;
    }
    if (text.includes('WORKSHOP') || text.includes('LOKAKARYA') || text.includes('BOOTCAMP')) {
      return EVENT_TYPES.WORKSHOP;
    }
    if (text.includes('MASTERCLASS')) {
      return EVENT_TYPES.MASTERCLASS;
    }
    if (text.includes('TRAINING') || text.includes('PELATIHAN') || text.includes('SERTIFIKASI') || text.includes('CERTIFICATION')) {
      return EVENT_TYPES.TRAINING;
    }
    if (text.includes('NETWORKING') || text.includes('BUSINESS') || text.includes('BISNIS')) {
      return EVENT_TYPES.BUSINESS_EVENT;
    }
    if (text.includes('CONFERENCE') || text.includes('KONFERENSI') || text.includes('SEMINAR') || text.includes('SIMPOSIUM')) {
      return EVENT_TYPES.CONFERENCE;
    }
    if (text.includes('LECTURE') || text.includes('KULIAH UMUM') || text.includes('ACADEMIC')) {
      return EVENT_TYPES.ACADEMIC_EVENT;
    }

    // 5. MUSIC & ENTERTAINMENT
    if (text.includes('FAN MEETING') || text.includes('FAN CONCERT') || text.includes('FANMEET') || text.includes('FANMEETING')) {
      return EVENT_TYPES.FAN_MEETING;
    }
    if (text.includes('WORLD TOUR') || text.includes('ASIA TOUR') || text.includes('LIVE TOUR')) {
      return EVENT_TYPES.WORLD_TOUR;
    }
    if (text.includes('ORCHESTRA') || text.includes('ORKESTRA') || text.includes('SYMPHONY') || text.includes('PHILHARMONIC')) {
      return EVENT_TYPES.ORCHESTRA;
    }
    if (text.includes('OPERA')) {
      return EVENT_TYPES.OPERA;
    }
    if (text.includes('BALLET') || text.includes('BALE')) {
      return EVENT_TYPES.BALLET;
    }
    if (text.includes('DANCE') || text.includes('TARI') || text.includes('DANCE PERFORMANCE')) {
      return EVENT_TYPES.DANCE_PERFORMANCE;
    }
    if (text.includes('KPOP') || text.includes('K-POP') || text.includes('JPOP') || text.includes('J-POP') || text.includes('CPOP')) {
      return EVENT_TYPES.KPOP_JPOP_CPOP;
    }
    if (text.includes('DJ') || text.includes('EDM') || text.includes('CLUB')) {
      return EVENT_TYPES.DJ_EVENT;
    }
    if (text.includes('FESTIVAL') || text.includes('FEST') || text.includes('PESTAPORA') || text.includes('DWP') || text.includes('SYNCHRONIZE')) {
      return EVENT_TYPES.FESTIVAL;
    }
    if (text.includes('GIG') || text.includes('SHOWCASE') || text.includes('INTIMATE') || text.includes('ACOUSTIC')) {
      return EVENT_TYPES.MUSIC_GIG;
    }
    if (text.includes('KONSER') || text.includes('CONCERT') || text.includes('TOUR') || text.includes('MUSIC') || text.includes('MUSIK')) {
      return EVENT_TYPES.CONCERT;
    }

    // 6. OTHERS
    if (text.includes('CULTURE') || text.includes('BUDAYA') || text.includes('WAYANG')) {
      return EVENT_TYPES.CULTURAL;
    }
    if (text.includes('RELIGI') || text.includes('TABLIGH') || text.includes('RETREAT') || text.includes('KEBAKTIAN')) {
      return EVENT_TYPES.RELIGIOUS;
    }
    if (text.includes('FAMILY') || text.includes('KID') || text.includes('ANAK') || text.includes('KELUARGA')) {
      return EVENT_TYPES.FAMILY;
    }
    if (text.includes('COMMUNITY') || text.includes('KOMUNITAS')) {
      return EVENT_TYPES.COMMUNITY;
    }

    return EVENT_TYPES.OTHER;
  }

  /**
   * Maps a fine-grained event type or raw category into one of the 6 canonical category groups.
   */
  static mapCategoryToGroup(rawTypeOrCategory) {
    if (!rawTypeOrCategory) return CATEGORY_GROUPS.OTHER;
    const t = String(rawTypeOrCategory).toUpperCase().trim();

    if ([
      'CONCERT', 'SOLO_CONCERT', 'WORLD_TOUR', 'FAN_MEETING', 'FAN_CONCERT', 'FESTIVAL',
      'MUSIC_FESTIVAL', 'DJ_EVENT', 'CLUB_EVENT', 'ORCHESTRA', 'MUSICAL_PERFORMANCE', 'OPERA', 'BALLET',
      'DANCE_PERFORMANCE', 'CULTURAL_PERFORMANCE', 'KPOP_JPOP_CPOP', 'MUSIC_GIG', 'MUSIC',
      'KONSER', 'MUSIK'
    ].includes(t)) {
      return CATEGORY_GROUPS.MUSIC;
    }

    if ([
      'SPORT', 'FOOTBALL', 'BASKETBALL', 'VOLLEYBALL', 'BADMINTON', 'TENNIS', 'MOTORSPORT',
      'FORMULA_RACING', 'MOTO_RACING', 'BOXING', 'MMA', 'WRESTLING', 'ESPORTS', 'RUNNING',
      'MARATHON', 'CYCLING', 'GOLF', 'SWIMMING', 'COMBAT_SPORT', 'SPECTATOR_SPORT', 'OLAHRAGA'
    ].includes(t)) {
      return CATEGORY_GROUPS.SPORTS;
    }

    if ([
      'FOOD_FESTIVAL', 'CULTURAL_FESTIVAL', 'ART_FESTIVAL', 'FILM_FESTIVAL', 'BOOK_FAIR',
      'TRADE_FAIR', 'EXHIBITION', 'ART_EXHIBITION', 'TECH_EXHIBITION', 'AUTO_SHOW',
      'ANIME_COMIC_CON', 'POP_CULTURE_CON', 'THEME_PARK', 'ATTRACTION', 'IMMERSIVE_EXPERIENCE',
      'MUSEUM_EXHIBITION', 'FAMILY', 'FAMILY_ENTERTAINMENT', 'ZOO_WILDLIFE', 'WATER_PARK',
      'EXPERIENCE'
    ].includes(t)) {
      return CATEGORY_GROUPS.FESTIVALS_EXPERIENCES;
    }

    if ([
      'COMEDY', 'STANDUP_COMEDY', 'STANDUP', 'VARIETY_SHOW', 'THEATER', 'BROADWAY_MUSICAL',
      'FILM_SCREENING', 'SPECIAL_SCREENING', 'ENTERTAINMENT_SHOW', 'TEATER'
    ].includes(t)) {
      return CATEGORY_GROUPS.SHOWS_COMEDY;
    }

    if ([
      'CONFERENCE', 'SUMMIT', 'SEMINAR', 'WORKSHOP', 'MASTERCLASS', 'TRAINING',
      'CERTIFICATION', 'BUSINESS_EVENT', 'NETWORKING', 'INDUSTRY_EVENT', 'CREATOR_EVENT',
      'ACADEMIC_EVENT', 'PUBLIC_LECTURE', 'BUSINESS', 'EDUCATION'
    ].includes(t)) {
      return CATEGORY_GROUPS.BUSINESS_EDUCATION;
    }

    return CATEGORY_GROUPS.OTHER;
  }

  /**
   * Maps raw venue and city string into canonical venue record.
   * STRICT GROUNDING: Never defaults unmapped cities to Jakarta.
   */
  static normalizeVenue(rawVenue, rawCity, rawCountry = null) {
    const vStr = String(rawVenue || '').toLowerCase().trim();
    const cStr = String(rawCity || '').toLowerCase().trim();

    for (const v of KNOWN_VENUES) {
      if (v.id === rawVenue || v.canonical_name.toLowerCase() === vStr) {
        return {
          venue_id: v.id,
          venue_name: v.canonical_name,
          city: v.city,
          province: v.province,
          country: v.country || rawCountry || 'Indonesia',
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
            country: v.country || rawCountry || 'Indonesia',
            lat: v.lat || null,
            lng: v.lng || null
          };
        }
      }
    }

    let resolvedCity = null;
    let resolvedProvince = null;
    let resolvedCountry = rawCountry || null;

    for (const [key, val] of Object.entries(KNOWN_CITIES)) {
      if (cStr === key || cStr.includes(key) || vStr.includes(key)) {
        resolvedCity = val.city;
        resolvedProvince = val.province;
        resolvedCountry = val.country || rawCountry || 'Indonesia';
        break;
      }
    }

    if (!resolvedCity) {
      resolvedCity = rawCity ? rawCity.trim() : (rawVenue ? rawVenue.trim() : 'TBA City');
      resolvedProvince = resolvedCountry || 'Indonesia';
    }

    return {
      venue_id: null,
      venue_name: rawVenue ? rawVenue.trim() : 'TBA Venue',
      city: resolvedCity,
      province: resolvedProvince || 'Indonesia',
      country: resolvedCountry || 'Indonesia',
      lat: null,
      lng: null
    };
  }

  /**
   * Normalizes dates and times to ISO standard with appropriate timezone offset:
   * WIB (+07:00), WITA (+08:00), WIT (+09:00), Singapore / Malaysia / Philippines (+08:00), Thailand / Vietnam (+07:00)
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
    if (cleanTz === 'Asia/Makassar' || cleanTz === 'WITA' || cleanTz === 'Asia/Singapore' || cleanTz === 'Asia/Kuala_Lumpur' || cleanTz === 'Asia/Manila' || cleanTz === 'SGT' || cleanTz === 'MYT' || cleanTz === 'PHT') {
      offset = '+08:00';
    } else if (cleanTz === 'Asia/Jayapura' || cleanTz === 'WIT') {
      offset = '+09:00';
    } else if (cleanTz === 'Asia/Bangkok' || cleanTz === 'Asia/Ho_Chi_Minh' || cleanTz === 'ICT' || cleanTz === 'WIB') {
      offset = '+07:00';
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
  CATEGORY_GROUPS,
  KNOWN_VENUES,
  KNOWN_CITIES
};
