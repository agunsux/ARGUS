const path = require('path');
const fs = require('fs');

// Global in-memory state mimicking database tables
const state = {
  users: [],
  seller_profiles: [],
  venues: [],
  events: [],
  event_pics: [],
  tickets: [],
  listings: [],
  orders: [],
  payments: [],
  escrows: [],
  entry_verifications: [],
  evidence_bundles: [],
  disputes: [],
  settlements: [],
  transfers: [], // kept for backward compatibility
  ticket_events: [], // kept for backward compatibility
  audit_logs: [],
  sessions: [],
  transaction_challenges: [],
  evidence_access_logs: [],
  step_up_tokens: [],
  offers: [],
  offer_audit_logs: [],
  notifications: [],
  promoter_imports: [], // Admin CSV promoter import history (source of record: PromoterDiscoveryRegistry)
  evidence_items: [],
  venue_shifts: [],
  verification_sessions: [],
  incidents: [],
  financial_ledger: [],
  magic_link_tokens: [],
  processed_webhooks: new Set()
};

let seqId = 1;
let logId = 1;
let offerAuditLogId = 1;

const bcrypt = require('bcryptjs');

// Pre-computed bcrypt cost 12 hash for 'pilot123'
const PILOT123_HASH = '$2b$12$4S3malXpyvpXvygwPeNE1.Yc6W2iP9APUve9Gi1EqG3Jt39bDUZS.';

function hashPassword(password) {
  if (!password) return null;
  if (typeof password === 'string' && (password.startsWith('$2a$') || password.startsWith('$2b$'))) {
    return password;
  }
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(candidate, storedHash) {
  if (!candidate || !storedHash) return false;
  if (typeof storedHash === 'string' && (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$'))) {
    return bcrypt.compareSync(candidate, storedHash);
  }
  if (candidate === storedHash) {
    return true;
  }
  return false;
}

/**
 * Reset and seed database with initial clean fixtures.
 */
function resetDatabase() {
  const { SessionStore } = require('./services/sessionStore');
  SessionStore.reset();
  state.sessions = [];
  state.transaction_challenges = [];
  state.evidence_access_logs = [];
  state.step_up_tokens = [];
  state.magic_link_tokens = [];

  const isTest = process.env.NODE_ENV === 'test';
  const defaultTestPass = isTest ? 'pilot123' : null;
  const defaultPassHash = isTest ? PILOT123_HASH : null;

  state.users = [
    { id: 'admin-1', name: 'Trust Officer ARGUS', email: 'ops@argus.id', phone: '081234567890', role: 'admin', password: process.env.ARGUS_ADMIN_PASSWORD ? hashPassword(process.env.ARGUS_ADMIN_PASSWORD) : defaultPassHash },
    { id: 'seller-1', name: 'Budi Santoso', email: 'budi.seller@example.com', phone: '082223334445', role: 'seller', password: process.env.ARGUS_SELLER_PASSWORD ? hashPassword(process.env.ARGUS_SELLER_PASSWORD) : defaultPassHash },
    { id: 'buyer-1', name: 'Dewi Lestari', email: 'dewi.buyer@example.com', phone: '085556667778', role: 'buyer', password: process.env.ARGUS_BUYER_PASSWORD ? hashPassword(process.env.ARGUS_BUYER_PASSWORD) : defaultPassHash },
    { id: 'buyer-2', name: 'Rina Wijaya', email: 'rina.buyer@example.com', phone: '085556667779', role: 'buyer', password: process.env.ARGUS_BUYER2_PASSWORD ? hashPassword(process.env.ARGUS_BUYER2_PASSWORD) : defaultPassHash },
    { id: 'pic-1', name: 'Agus Hendra (Event PIC)', email: 'agus.pic@argus.id', phone: '081199887766', role: 'pic', password: process.env.ARGUS_PIC_PASSWORD ? hashPassword(process.env.ARGUS_PIC_PASSWORD) : defaultPassHash }
  ];

  state.seller_profiles = [
    { user_id: 'seller-1', kyc_status: 'VERIFIED', nik_hash: 'hash-ktp-budi-327101', active_listing_limit: 10 }
  ];

  state.venues = [
    { id: 'venue-gbk', name: 'Gelora Bung Karno (Main Stadium)', city: 'Jakarta', gate_info: 'Pintu 3, 7, 10' },
    { id: 'venue-singapore', name: 'Singapore National Stadium', city: 'Singapore', gate_info: 'Gate 4, 12' },
    { id: 'venue-kemayoran', name: 'Gambir Expo / JIExpo Kemayoran', city: 'Jakarta', gate_info: 'Pintu 2, 7, Gambir Expo Gate' },
    { id: 'venue-tim', name: 'Taman Ismail Marzuki (TIM)', city: 'Jakarta', gate_info: 'Lobby Teater Jakarta & Graha Bhakti Budaya' },
    { id: 'venue-indonesia-arena', name: 'Indonesia Arena GBK', city: 'Jakarta', gate_info: 'Gate Barat & Gate Timur' },
    { id: 'venue-jis', name: 'Jakarta International Stadium (JIS)', city: 'Jakarta', gate_info: 'Rampa Barat & Rampa Timur' },
    { id: 'venue-ice-bsd', name: 'Indonesia Convention Exhibition (ICE BSD)', city: 'Tangerang', gate_info: 'Hall 5 & Hall 6' },
    { id: 'venue-siliwangi', name: 'Stadion Siliwangi', city: 'Bandung', gate_info: 'Pintu Utara & Pintu Selatan' },
    { id: 'venue-eldorado', name: 'Eldorado Dome', city: 'Bandung', gate_info: 'Lobby Utama Eldorado' },
    { id: 'venue-grand-city', name: 'Grand City Convention Center', city: 'Surabaya', gate_info: 'Exhibition Hall Lt. 3' },
    { id: 'venue-gbt', name: 'Stadion Gelora Bung Tomo (GBT)', city: 'Surabaya', gate_info: 'Gate 1-4 Gate Utama' },
    { id: 'venue-peninsula', name: 'Peninsula Island Nusa Dua', city: 'Bali', gate_info: 'Main Entrance Nusa Dua Gate' }
  ];

  state.events = [
    {
      id: 'event-coldplay',
      name: 'Coldplay Music of the Spheres',
      title: 'Coldplay Music of the Spheres',
      artists: ['Coldplay'],
      date: '2026-11-15',
      start_date: '2026-11-15',
      end_date: null,
      venue_id: 'venue-gbk',
      venue: 'Gelora Bung Karno',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      venue_city: 'Jakarta',
      category: 'KONSER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan QR/Barcode di turnstile resmi promotor + random ID check oleh venue security',
        required_items: ['E-Voucher PDF / QR Code resmi', 'KTP Asli / Passport'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Promoter & Venue Security (ARGUS acts as verification intermediary)'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://coldplayinjakarta2026.com',
      poster_url: null
    },
    {
      id: 'event-gnr',
      name: 'Guns N Roses: Not In This Lifetime',
      title: 'Guns N Roses: Not In This Lifetime',
      artists: ['Guns N Roses'],
      date: '2026-10-15',
      start_date: '2026-10-15',
      end_date: null,
      venue_id: 'venue-gbk',
      venue: 'Gelora Bung Karno',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      venue_city: 'Jakarta',
      category: 'KONSER',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Penukaran e-voucher menjadi wristband RFID di redemption booth sebelum antrean gate',
        required_items: ['Bukti Pembelian / Surat Kuasa', 'KTP Fisik'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Promoter & Venue Security (ARGUS acts as verification intermediary)'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://gnrjakarta2026.id',
      poster_url: null
    },
    {
      id: 'event-pestapora-2026',
      name: 'Pestapora 2026',
      title: 'Pestapora 2026',
      artists: ['Tulus', 'Hindia', 'The Changcuters', 'Danilla', 'Isyana Sarasvati', 'Feast'],
      date: '2026-09-25',
      start_date: '2026-09-25',
      end_date: '2026-09-27',
      venue_id: 'venue-kemayoran',
      venue: 'Gambir Expo / JIExpo Kemayoran',
      venue_name: 'Gambir Expo / JIExpo Kemayoran',
      venue_city: 'Jakarta',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Penukaran e-ticket menjadi wristband RFID di ticket booth Gambir Expo',
        required_items: ['E-Voucher PDF resmi', 'KTP/SIM asli'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Boss Creator & Venue Security'
      },
      status: 'ON_SALE',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://pestapora.com',
      poster_url: null
    },
    {
      id: 'event-raditya-dika-standup',
      name: 'Raditya Dika: Cerita Cintaku Stand-Up Special',
      title: 'Raditya Dika: Cerita Cintaku Stand-Up Special',
      artists: ['Raditya Dika'],
      date: '2026-09-19',
      start_date: '2026-09-19',
      end_date: null,
      venue_id: 'venue-tim',
      venue: 'Taman Ismail Marzuki (TIM)',
      venue_name: 'Taman Ismail Marzuki (TIM)',
      venue_city: 'Jakarta',
      category: 'STANDUP',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan e-ticket barcode pada pintu masuk hall Teater Jakarta',
        required_items: ['E-Ticket QR', 'Identitas Diri'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'TIM & Event Operator'
      },
      status: 'SOLD_OUT',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: null,
      poster_url: null
    },
    {
      id: 'event-ibl-finals-2026',
      name: 'Indonesian Basketball League (IBL) Finals 2026',
      title: 'Indonesian Basketball League (IBL) Finals 2026',
      artists: ['Pelita Jaya', 'Satria Muda'],
      date: '2026-09-22',
      start_date: '2026-09-22',
      end_date: null,
      venue_id: 'venue-indonesia-arena',
      venue: 'Indonesia Arena GBK',
      venue_name: 'Indonesia Arena GBK',
      venue_city: 'Jakarta',
      category: 'OLAHRAGA',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan QR Code di turnstile otomatis Indonesia Arena',
        required_items: ['E-Ticket QR'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'IBL & Venue Security'
      },
      status: 'ON_SALE',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://iblindonesia.com',
      poster_url: null
    },
    {
      id: 'event-so7-bandung',
      name: 'Sheila On 7: Tunggu Aku Di Bandung',
      title: 'Sheila On 7: Tunggu Aku Di Bandung',
      artists: ['Sheila On 7'],
      date: '2026-09-28',
      start_date: '2026-09-28',
      end_date: null,
      venue_id: 'venue-siliwangi',
      venue: 'Stadion Siliwangi',
      venue_name: 'Stadion Siliwangi',
      venue_city: 'Bandung',
      category: 'KONSER',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Penukaran gelang tiket fisik di gate utara Stadion Siliwangi',
        required_items: ['E-voucher PDF', 'Surat Kuasa jika diwakilkan', 'KTP Asli'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Antara Suara & Venue Security'
      },
      status: 'SOLD_OUT',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://tungguakudi.id',
      poster_url: null
    },
    {
      id: 'event-synchronize-2026',
      name: 'Synchronize Fest 2026',
      title: 'Synchronize Fest 2026',
      artists: ['Rhoma Irama & Soneta', 'Kahitna', 'Barasuara', 'Burgerkill', 'Maliq & D Essentials'],
      date: '2026-10-02',
      start_date: '2026-10-02',
      end_date: '2026-10-04',
      venue_id: 'venue-kemayoran',
      venue: 'Gambir Expo / JIExpo Kemayoran',
      venue_name: 'Gambir Expo / JIExpo Kemayoran',
      venue_city: 'Jakarta',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Redemption wristband RFID di area pre-function Gambir Expo',
        required_items: ['E-voucher resmi', 'KTP Asli'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Demajors & Dyandra Promosindo'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://synchronizefestival.com',
      poster_url: null
    },
    {
      id: 'event-mamamoo-jkt',
      name: 'MAMAMOO: World Tour in Jakarta',
      title: 'MAMAMOO: World Tour in Jakarta',
      artists: ['MAMAMOO'],
      date: '2026-10-24',
      start_date: '2026-10-24',
      end_date: null,
      venue_id: 'venue-ice-bsd',
      venue: 'Indonesia Convention Exhibition (ICE BSD)',
      venue_name: 'Indonesia Convention Exhibition (ICE BSD)',
      venue_city: 'Tangerang',
      category: 'KONSER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Barcode scan di gate hall 5 ICE BSD + pemeriksaan identitas pembeli',
        required_items: ['E-ticket QR', 'KTP/Paspor Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Promotor & ICE BSD Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: null,
      poster_url: null
    },
    {
      id: 'event-pandji-surabaya',
      name: 'Pandji Pragiwaksono: Mens Rea Stand-Up Tour',
      title: 'Pandji Pragiwaksono: Mens Rea Stand-Up Tour',
      artists: ['Pandji Pragiwaksono'],
      date: '2026-10-10',
      start_date: '2026-10-10',
      end_date: null,
      venue_id: 'venue-grand-city',
      venue: 'Grand City Convention Center',
      venue_name: 'Grand City Convention Center',
      venue_city: 'Surabaya',
      category: 'STANDUP',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Pemeriksaan tiket digital di pintu masuk convention hall Lt. 3',
        required_items: ['E-Ticket QR'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Comika & Venue Security'
      },
      status: 'ON_SALE',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://comika.id',
      poster_url: null
    },
    {
      id: 'event-bali-world-music',
      name: 'Bali International World Music Festival 2026',
      title: 'Bali International World Music Festival 2026',
      artists: ['Balawan', 'Gus Teja', 'International World Music Acts'],
      date: '2026-10-17',
      start_date: '2026-10-17',
      end_date: '2026-10-18',
      venue_id: 'venue-peninsula',
      venue: 'Peninsula Island Nusa Dua',
      venue_name: 'Peninsula Island Nusa Dua',
      venue_city: 'Bali',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Wristband RFID terpasang di security check pintu masuk Peninsula Island',
        required_items: ['E-Ticket', 'ID KTP/Passport'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'ITDC & Festival Management'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: null,
      poster_url: null
    },
    {
      id: 'event-the-weeknd-jis',
      name: 'The Weeknd: After Hours Til Dawn Tour',
      title: 'The Weeknd: After Hours Til Dawn Tour',
      artists: ['The Weeknd'],
      date: '2026-11-21',
      start_date: '2026-11-21',
      end_date: null,
      venue_id: 'venue-jis',
      venue: 'Jakarta International Stadium (JIS)',
      venue_name: 'Jakarta International Stadium (JIS)',
      venue_city: 'Jakarta',
      category: 'KONSER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan barcode di turnstile JIS rampa barat dan timur + cross-check identitas',
        required_items: ['E-Ticket PDF resmi', 'KTP Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'PK Entertainment & JIS Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://theweekndinjakarta.com',
      poster_url: null
    },
    {
      id: 'event-joyland-2026',
      name: 'Joyland Festival Jakarta 2026',
      title: 'Joyland Festival Jakarta 2026',
      artists: ['Kings of Convenience', 'Laufey', 'White Shoes & The Couples Company', 'Reality Club'],
      date: '2026-11-27',
      start_date: '2026-11-27',
      end_date: '2026-11-29',
      venue_id: 'venue-gbk',
      venue: 'Gelora Bung Karno',
      venue_name: 'Gelora Bung Karno (Main Stadium)',
      venue_city: 'Jakarta',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Penukaran wristband di area ticket box Lapangan Baseball GBK',
        required_items: ['E-ticket', 'KTP/Passport'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Plainsong Live & GBK Management'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://joylandfest.com',
      poster_url: null
    },
    {
      id: 'event-teater-koma-2026',
      name: 'Teater Koma: Lakon Suksesi Republik',
      title: 'Teater Koma: Lakon Suksesi Republik',
      artists: ['Teater Koma Ensemble'],
      date: '2026-11-07',
      start_date: '2026-11-07',
      end_date: '2026-11-08',
      venue_id: 'venue-tim',
      venue: 'Taman Ismail Marzuki (TIM)',
      venue_name: 'Taman Ismail Marzuki (TIM)',
      venue_city: 'Jakarta',
      category: 'TEATER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Pemeriksaan tiket manual dan scan barcode pintu auditorium Graha Bhakti Budaya',
        required_items: ['Karcis Teater / E-Voucher'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Teater Koma & TIM Management'
      },
      status: 'ON_SALE',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://teaterkoma.org',
      poster_url: null
    },
    {
      id: 'event-dwp-2026',
      name: 'Djakarta Warehouse Project (DWP) 2026',
      title: 'Djakarta Warehouse Project (DWP) 2026',
      artists: ['Martin Garrix', 'Armin van Buuren', 'Zedd', 'DJ Snake'],
      date: '2026-11-13',
      start_date: '2026-11-13',
      end_date: '2026-11-15',
      venue_id: 'venue-kemayoran',
      venue: 'Gambir Expo / JIExpo Kemayoran',
      venue_name: 'Gambir Expo / JIExpo Kemayoran',
      venue_city: 'Jakarta',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Wristband RFID Ismaya Live dengan mandatory age verification 18+',
        required_items: ['E-Voucher resmi', 'KTP Fisik/Paspor Asli'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Ismaya Live & Venue Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://djakartawarehouse.com',
      poster_url: null
    },
    {
      id: 'event-twice-jkt',
      name: 'TWICE: 5th World Tour Jakarta',
      title: 'TWICE: 5th World Tour Jakarta',
      artists: ['TWICE'],
      date: '2026-12-05',
      start_date: '2026-12-05',
      end_date: null,
      venue_id: 'venue-indonesia-arena',
      venue: 'Indonesia Arena GBK',
      venue_name: 'Indonesia Arena GBK',
      venue_city: 'Jakarta',
      category: 'KONSER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Barcode turnstile check + queue numbering wristband',
        required_items: ['E-Ticket QR', 'KTP Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Mecima Pro & Venue Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: null,
      poster_url: null
    },
    {
      id: 'event-tulus-bandung',
      name: 'Tulus: Konser Intim Akhir Tahun 2026',
      title: 'Tulus: Konser Intim Akhir Tahun 2026',
      artists: ['Tulus'],
      date: '2026-12-12',
      start_date: '2026-12-12',
      end_date: null,
      venue_id: 'venue-eldorado',
      venue: 'Eldorado Dome',
      venue_name: 'Eldorado Dome',
      venue_city: 'Bandung',
      category: 'KONSER',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan QR code di pintu hall Eldorado Lembang Bandung',
        required_items: ['E-ticket QR', 'KTP Asli'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'TulusCompany & Eldorado'
      },
      status: 'ON_SALE',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://situstulus.com',
      poster_url: null
    },
    {
      id: 'event-big-bang-2026',
      name: 'Big Bang Festival Jakarta 2026',
      title: 'Big Bang Festival Jakarta 2026',
      artists: ['Kahitna', 'Guyon Waton', 'NDX AKA', 'Fiersa Besari', 'Fourtwnty'],
      date: '2026-12-22',
      start_date: '2026-12-22',
      end_date: '2026-12-31',
      venue_id: 'venue-kemayoran',
      venue: 'Gambir Expo / JIExpo Kemayoran',
      venue_name: 'Gambir Expo / JIExpo Kemayoran',
      venue_city: 'Jakarta',
      category: 'FESTIVAL',
      admission_protocol: {
        type: 'BARCODE_PLUS_ID',
        description: 'Scan barcode pintu masuk utama JIExpo Kemayoran',
        required_items: ['E-ticket App BBO / Tiket.com'],
        handoff_type: 'DIGITAL_TRANSFER',
        venue_gate_authority: 'Expo Indo Jaya & JIExpo Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://bigbangfest.com',
      poster_url: null
    },
    {
      id: 'event-dewa19-surabaya',
      name: 'Dewa 19: All Stars Stadium Tour Surabaya',
      title: 'Dewa 19: All Stars Stadium Tour Surabaya',
      artists: ['Dewa 19', 'Ari Lasso', 'Once Mekel', 'Virzha', 'Ello'],
      date: '2026-12-19',
      start_date: '2026-12-19',
      end_date: null,
      venue_id: 'venue-gbt',
      venue: 'Stadion Gelora Bung Tomo (GBT)',
      venue_name: 'Stadion Gelora Bung Tomo (GBT)',
      venue_city: 'Surabaya',
      category: 'KONSER',
      admission_protocol: {
        type: 'PHYSICAL_WRISTBAND',
        description: 'Penukaran gelang di gate barat GBT sebelum antrean masuk',
        required_items: ['E-voucher tiket', 'KTP Asli'],
        handoff_type: 'PHYSICAL_WRISTBAND',
        venue_gate_authority: 'Otello Asia & Venue Security'
      },
      status: 'UPCOMING',
      source: 'SEED',
      created_by_user_id: null,
      is_verified: true,
      official_link: 'https://dewa19tour.com',
      poster_url: null
    }
  ];

  state.event_pics = [
    {
      id: 'pic-assign-coldplay',
      event_id: 'event-coldplay',
      venue_id: 'venue-gbk',
      pic_user_id: 'pic-1',
      event_date: '2026-11-15',
      status: 'ACTIVE',
      contact_phone: '081199887766'
    }
  ];

  state.tickets = [
    {
      id: 'ticket-demo-1',
      event_id: 'event-coldplay',
      current_owner_id: 'seller-1',
      status: 'VERIFIED',
      seat_info: 'Row H, Seat 12',
      face_value: 1250000,
      price: 1500000,
      barcode_hash: 'hash-barcode-demo-1'
    }
  ];

  state.listings = [
    {
      id: 'list-demo-1',
      ticket_id: 'ticket-demo-1',
      seller_id: 'seller-1',
      event_id: 'event-coldplay',
      face_value: 1250000,
      price: 1500000,
      status: 'ACTIVE',
      rejection_reason: null,
      evidence_bundle_id: 'bdl-seed-1',
      created_at: '2026-07-09T10:00:00Z'
    }
  ];

  state.evidence_bundles = [
    {
      id: 'bdl-seed-1',
      ticket_id: 'ticket-demo-1',
      uploader_id: 'seller-1',
      bundle_hash: 'hash-bundle-seed-1',
      files_json: JSON.stringify([
        { originalname: 'invoice_ticket.pdf', size: 102400, hash: 'hash-pdf-invoice' },
        { originalname: 'ticket_qr.png', size: 51200, hash: 'hash-png-qr' }
      ]),
      uploaded_at: '2026-07-09T09:59:00Z'
    }
  ];

  state.orders = [];
  state.payments = [];
  state.escrows = [];
  state.entry_verifications = [];
  state.disputes = [];
  state.settlements = [];
  state.transfers = [];
  state.ticket_events = [
    {
      sequence_id: 1,
      id: 'evt-seed-1',
      ticket_id: 'ticket-demo-1',
      event_type: 'TicketCreated',
      actor_id: 'seller-1',
      metadata: JSON.stringify({ seat_info: 'Row H, Seat 12', price: 1500000 }),
      created_at: '2026-07-09T10:00:00Z'
    },
    {
      sequence_id: 2,
      id: 'evt-seed-2',
      ticket_id: 'ticket-demo-1',
      event_type: 'OwnershipAssigned',
      actor_id: 'seller-1',
      metadata: JSON.stringify({ assigned_to: 'seller-1' }),
      created_at: '2026-07-09T10:00:05Z'
    }
  ];

  state.audit_logs = [
    {
      id: 1,
      entity_type: 'TICKET',
      entity_id: 'ticket-demo-1',
      action: 'CREATED',
      performed_by: 'seller-1',
      metadata: JSON.stringify({ reason: 'Initial seed generation' }),
      created_at: '2026-07-09T10:00:00Z'
    }
  ];

  state.offers = [];
  state.offer_audit_logs = [];
  state.notifications = [];
  state.promoter_imports = [];
  state.evidence_items = [];
  state.venue_shifts = [];
  state.verification_sessions = [];
  state.incidents = [];
  state.financial_ledger = [];
  state.processed_webhooks = new Set();

  try {
    const { canonicalRegistry } = require('./discovery/CanonicalEventRegistry');
    const { sourceRegistry } = require('./discovery/SourceRegistry');
    const { ingestionPipeline } = require('./discovery/EventIngestionPipeline');
    const { demandCapture } = require('./discovery/DemandCaptureService');
    canonicalRegistry.reset();
    sourceRegistry.reset();
    ingestionPipeline.reset();
    demandCapture.reset();
    canonicalRegistry.importLegacyEvents(state.events);
    canonicalRegistry.syncToState(state.events);
  } catch (e) {
    // In case discovery module is loaded during initial require bootstrap
  }

  seqId = 3;
  logId = 2;
  offerAuditLogId = 1;
}

module.exports = {
  state,
  resetDatabase,
  db: { serialize: (cb) => cb() },
  run,
  all,
  get,
  recordAuditLog,
  recordOfferAuditLog,
  initializeDatabase,
  hashPassword,
  verifyPassword
};

resetDatabase();

// Dummy connection object
const db = {
  serialize: (callback) => callback()
};

/**
 * Execute write/modification queries.
 */
async function run(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  // Enforce ADR-003 and Invariant 6: Prevent UPDATE/DELETE on audit_logs
  if (clean.toUpperCase().includes('UPDATE AUDIT_LOGS') || clean.toUpperCase().includes('DELETE FROM AUDIT_LOGS')) {
    throw new Error('Updates on audit_logs are prohibited by ADR-003 / Invariant 6');
  }

  // Enforce ADR-011: Prevent UPDATE/DELETE on ticket_events
  if (clean.toUpperCase().includes('UPDATE TICKET_EVENTS') || clean.toUpperCase().includes('DELETE FROM TICKET_EVENTS')) {
    throw new Error('Updates on ticket_events are prohibited by ADR-011 / Invariant 10');
  }

  // Enforce Epic 4.0: Prevent UPDATE/DELETE on offer_audit_logs
  if (clean.toUpperCase().includes('UPDATE OFFER_AUDIT_LOGS') || clean.toUpperCase().includes('DELETE FROM OFFER_AUDIT_LOGS')) {
    throw new Error('Updates on offer_audit_logs are prohibited by Epic 4.0 specification (append-only audit log)');
  }

  // 1. INSERT INTO tickets
  if (clean.includes('INSERT OR IGNORE INTO tickets') || clean.includes('INSERT INTO tickets')) {
    const id = params[0];
    const event_id = params[1];
    const current_owner_id = params[2];
    const seat_info = params[3];
    const price = params[4];
    if (!state.tickets.find(t => t.id === id)) {
      state.tickets.push({
        id,
        event_id,
        current_owner_id,
        status: params[5] || 'LISTED',
        seat_info,
        price,
        barcode_hash: params[6] || `hash-${id}`
      });
    }
    return { lastID: id, changes: 1 };
  }

  // 2. INSERT INTO ticket_events
  if (clean.includes('INSERT INTO ticket_events')) {
    const id = params[0];
    const ticket_id = params[1];
    const event_type = params[2];
    const actor_id = params[3];
    const metadata = params[4];
    state.ticket_events.push({
      sequence_id: seqId++,
      id,
      ticket_id,
      event_type,
      actor_id,
      metadata,
      created_at: new Date().toISOString()
    });
    return { lastID: seqId, changes: 1 };
  }

  // 3. INSERT INTO transfers
  if (clean.includes('INSERT INTO transfers')) {
    const id = params[0];
    const ticket_id = params[1];
    const seller_id = params[2];
    const buyer_id = params[3];
    const price = params[4];
    const unique_code = params[5];
    const status = params[6] || 'PENDING_PAYMENT';
    state.transfers.push({
      id,
      ticket_id,
      seller_id,
      buyer_id,
      price,
      unique_code,
      status
    });
    return { lastID: id, changes: 1 };
  }

  // 4. INSERT INTO evidence_bundles
  if (clean.includes('INSERT INTO evidence_bundles')) {
    const id = params[0];
    const ticket_id = params[1];
    const uploader_id = params[2];
    const bundle_hash = params[3];
    const files_json = params[4];
    state.evidence_bundles.push({
      id,
      ticket_id,
      uploader_id,
      bundle_hash,
      files_json,
      uploaded_at: new Date().toISOString()
    });
    return { lastID: id, changes: 1 };
  }

  // 5. UPDATE tickets status
  if (clean.includes('UPDATE tickets SET status = ? WHERE id = ?')) {
    const status = params[0];
    const id = params[1];
    const ticket = state.tickets.find(t => t.id === id);
    if (ticket) ticket.status = status;
    return { changes: 1 };
  }

  // 6. UPDATE tickets status & owner
  if (clean.includes('UPDATE tickets SET status = ?, current_owner_id = ? WHERE id = ?')) {
    const status = params[0];
    const current_owner_id = params[1];
    const id = params[2];
    const ticket = state.tickets.find(t => t.id === id);
    if (ticket) {
      ticket.status = status;
      ticket.current_owner_id = current_owner_id;
    }
    return { changes: 1 };
  }

  // 7. UPDATE transfers status
  if (clean.includes('UPDATE transfers SET status = ? WHERE id = ?')) {
    const status = params[0];
    const id = params[1];
    const transfer = state.transfers.find(t => t.id === id);
    if (transfer) transfer.status = status;
    return { changes: 1 };
  }

  // 8. INSERT INTO audit_logs
  if (clean.includes('INSERT INTO audit_logs')) {
    const entity_type = params[0];
    const entity_id = params[1];
    const action = params[2];
    const performed_by = params[3];
    const metadata = params[4];
    state.audit_logs.push({
      id: logId++,
      entity_type,
      entity_id,
      action,
      performed_by,
      metadata,
      created_at: new Date().toISOString()
    });
    return { lastID: logId, changes: 1 };
  }

  // 9. INSERT OR IGNORE INTO users
  if (clean.includes('INSERT OR IGNORE INTO users')) {
    const id = params[0];
    const name = params[1];
    const phone = params[2];
    const role = params[3] || 'user';
    if (!state.users.find(u => u.id === id)) {
      state.users.push({ id, name, phone, role });
    }
    return { lastID: id, changes: 1 };
  }

  // 10. INSERT OR IGNORE INTO events
  if (clean.includes('INSERT OR IGNORE INTO events')) {
    const id = params[0];
    const title = params[1];
    const date = params[2];
    const venue = params[3];
    const category = params[4];
    if (!state.events.find(e => e.id === id)) {
      state.events.push({
        id,
        name: title,
        title,
        date,
        start_date: date,
        venue,
        venue_name: venue,
        venue_city: 'Jakarta',
        category: category || 'KONSER',
        status: 'UPCOMING',
        source: 'USER_CREATED',
        is_verified: false
      });
    }
    return { lastID: id, changes: 1 };
  }

  // 11. Escrows table queries
  if (clean.includes('INSERT INTO escrows')) {
    const [id, order_id, buyer_id, seller_id, amount, status, payment_proof, created_at] = params;
    state.escrows.push({
      id,
      order_id,
      buyer_id,
      seller_id,
      amount,
      status,
      payment_proof,
      created_at: created_at || new Date().toISOString()
    });
    return { lastID: id, changes: 1 };
  }

  if (clean.includes('UPDATE escrows SET status = ? WHERE id = ?')) {
    const [status, id] = params;
    const item = state.escrows.find(e => e.id === id);
    if (item) item.status = status;
    return { changes: 1 };
  }

  return { changes: 0 };
}

/**
 * Fetch single row queries.
 */
async function get(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  if (clean.includes('SELECT COUNT(*) as count FROM users')) {
    return { count: state.users.length };
  }
  if (clean.includes('SELECT * FROM users WHERE id = ?')) {
    return state.users.find(u => u.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM events WHERE id = ?')) {
    return state.events.find(e => e.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM tickets WHERE id = ?')) {
    return state.tickets.find(t => t.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM transfers WHERE id = ?')) {
    return state.transfers.find(t => t.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM escrows WHERE id = ?')) {
    return state.escrows.find(e => e.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM escrows WHERE order_id = ?')) {
    return state.escrows.find(e => e.order_id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE ticket_id = ?') && clean.includes('ORDER BY uploaded_at DESC LIMIT 1')) {
    const filtered = state.evidence_bundles.filter(eb => eb.ticket_id === params[0]);
    if (filtered.length === 0) return null;
    return filtered[filtered.length - 1];
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE ticket_id = ?')) {
    return state.evidence_bundles.find(eb => eb.ticket_id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE id = ?')) {
    return state.evidence_bundles.find(eb => eb.id === params[0]) || null;
  }
  if (clean.includes('SELECT COUNT(*) as count FROM transfers WHERE status = ?')) {
    const count = state.transfers.filter(t => t.status === params[0]).length;
    return { count };
  }

  return null;
}

/**
 * Fetch multiple row queries.
 */
async function all(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  if (clean.includes('SELECT * FROM ticket_events WHERE ticket_id = ?')) {
    return state.ticket_events
      .filter(te => te.ticket_id === params[0])
      .sort((a, b) => a.sequence_id - b.sequence_id);
  }
  if (clean.includes('SELECT * FROM transfers')) {
    return state.transfers;
  }
  if (clean.includes('SELECT t.*') && clean.includes('FROM tickets t')) {
    const results = [];
    for (const ticket of state.tickets) {
      if (['LISTED', 'RESERVED', 'ESCROW_PAID', 'VERIFIED'].includes(ticket.status)) {
        const event = state.events.find(e => e.id === ticket.event_id) || {};
        const bundle = state.evidence_bundles.find(eb => eb.ticket_id === ticket.id) || {};
        results.push({
          id: ticket.id,
          event_id: ticket.event_id,
          current_owner_id: ticket.current_owner_id,
          status: ticket.status,
          seat_info: ticket.seat_info,
          price: ticket.price,
          created_at: ticket.created_at || new Date().toISOString(),
          event_title: event.title || '',
          event_date: event.date || '',
          event_venue: event.venue || '',
          bundle_id: bundle.id || null,
          bundle_hash: bundle.bundle_hash || null,
          files_json: bundle.files_json || null
        });
      }
    }
    return results;
  }

  return [];
}

/**
 * Helper to record immutable audit log
 */
async function recordAuditLog(entityType, entityId, action, performedBy, metadata = {}) {
  const entry = {
    id: logId++,
    entity_type: entityType,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
    created_at: new Date().toISOString()
  };
  state.audit_logs.push(entry);
  return entry;
}

/**
 * Helper to record immutable offer audit log (Epic 4.0)
 */
async function recordOfferAuditLog({ offerId, actorId, actorRole, fromStatus, toStatus, ipAddress = '127.0.0.1', metadata = {} }) {
  const entry = {
    id: `oal-${offerAuditLogId++}`,
    offer_id: offerId,
    actor_id: actorId,
    actor_role: actorRole,
    from_status: fromStatus,
    to_status: toStatus,
    ip_address: ipAddress,
    metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
    created_at: new Date().toISOString()
  };
  state.offer_audit_logs.push(entry);
  return entry;
}

/**
 * Mock database initialization
 */
async function initializeDatabase() {
  return Promise.resolve();
}

module.exports = {
  state,
  resetDatabase,
  db,
  run,
  all,
  get,
  recordAuditLog,
  recordOfferAuditLog,
  initializeDatabase,
  hashPassword,
  verifyPassword
};
