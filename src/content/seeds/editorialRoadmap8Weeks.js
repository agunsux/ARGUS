/**
 * TIKUM Editorial Roadmap (8-Week Strategic Publication Calendar)
 * 
 * Target Cadence: 2 high-quality articles per week (Tuesday & Friday at 10:00 WIB).
 * Timezone: Asia/Jakarta strictly enforced.
 * Invariant: Draft articles are NOT automatically published.
 * 
 * Pillars Covered:
 * Cluster A: Event Discovery
 * Cluster B: Artist Discovery
 * Cluster C: Ticket Buyer Education
 * Cluster D: Venue Intelligence
 * Cluster E: Secondary Ticket Marketplace Education
 */

const EDITORIAL_ROADMAP_8_WEEKS = [
  // --- WEEK 1 ---
  {
    week: 1,
    planned_date: '2026-11-10T10:00:00+07:00',
    topic: 'Panduan Lengkap Konser BTS Jakarta 2026: Jadwal GBK, Info Tiket Resmi & Ketentuan Masuk',
    target_keyword: 'konser bts jakarta 2026',
    search_intent: 'informational',
    cluster: 'B. Artist Discovery',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_PRIMARY_SOURCE (BIGHIT MUSIC / ibighit.com / Tiket.com)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Chief Content Officer)',
    publication_status: 'SCHEDULED (Private until date reached)',
    target_artist_slug: 'bts',
    target_event_id: 'bts-world-tour-arirang-jakarta-2026'
  },
  {
    week: 1,
    planned_date: '2026-11-13T10:00:00+07:00',
    topic: 'Checklist 7 Langkah Verifikasi Tiket Resale Sebelum Melakukan Pembayaran',
    target_keyword: 'verifikasi tiket konser resale',
    search_intent: 'informational',
    cluster: 'C. Ticket Buyer Education',
    pillar: 'SAFETY',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_OPERATIONAL_PROCEDURE (Tikum Trust Engine Standard)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Trust & Safety Lead)',
    publication_status: 'SCHEDULED (Private until date reached)'
  },

  // --- WEEK 2 ---
  {
    week: 2,
    planned_date: '2026-11-17T10:00:00+07:00',
    topic: 'BIGBANG Cosmos Tour Jakarta 2027: Jadwal JIS, Promotor Resmi & Informasi Presale',
    target_keyword: 'konser bigbang jakarta 2027',
    search_intent: 'informational',
    cluster: 'B. Artist Discovery',
    pillar: 'EVENT_DISCOVERY',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_PRIMARY_SOURCE (YG Entertainment / bigbanginjakarta.com / PK Entertainment)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Music Desk)',
    publication_status: 'SCHEDULED (Private until date reached)',
    target_artist_slug: 'bigbang',
    target_event_id: 'bigbang-cosmos-tour-jakarta-2027'
  },
  {
    week: 2,
    planned_date: '2026-11-20T10:00:00+07:00',
    topic: 'Perbedaan Tiket Primary vs Secondary: Hak Konsumen dan Perlindungan Transaksi',
    target_keyword: 'primary vs secondary ticket indonesia',
    search_intent: 'informational',
    cluster: 'E. Secondary Marketplace Education',
    pillar: 'RESALE_EDUCATION',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_LEGAL_FRAMEWORK (UU Perlindungan Konsumen & UU PDP)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Legal & Compliance)',
    publication_status: 'SCHEDULED (Private until date reached)'
  },

  // --- WEEK 3 ---
  {
    week: 3,
    planned_date: '2026-11-24T10:00:00+07:00',
    topic: 'Panduan Akses Stadion GBK Senayan: Pintu Masuk, Transportasi MRT/KRL & Tips Parkir Hari Konser',
    target_keyword: 'panduan akses gbk konser',
    search_intent: 'informational',
    cluster: 'D. Venue Intelligence',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_VENUE_INTELLIGENCE (Pusat Pengelolaan Komplek GBK)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Ground Ops)',
    publication_status: 'SCHEDULED (Private until date reached)',
    target_venue_id: 'venue-gbk'
  },
  {
    week: 3,
    planned_date: '2026-11-27T10:00:00+07:00',
    topic: 'Modus Double Selling Barcode Tiket: Cara Mengenali dan Menghindarinya',
    target_keyword: 'penipuan double selling tiket konser',
    search_intent: 'informational',
    cluster: 'C. Ticket Buyer Education',
    pillar: 'SAFETY',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_FRAUD_ANALYSIS (Argus Risk & Fraud Log)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Security Lead)',
    publication_status: 'SCHEDULED (Private until date reached)'
  },

  // --- WEEK 4 ---
  {
    week: 4,
    planned_date: '2026-12-01T10:00:00+07:00',
    topic: 'Panduan Lengkap Venue JIS: Rute TransJakarta, Shuttle Bus & Alur Gate Masuk Stadion',
    target_keyword: 'panduan venue jis konser',
    search_intent: 'informational',
    cluster: 'D. Venue Intelligence',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_VENUE_INTELLIGENCE (PT Jakpro / JIS Operations)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Ground Ops)',
    publication_status: 'SCHEDULED (Private until date reached)',
    target_venue_id: 'venue-jis'
  },
  {
    week: 4,
    planned_date: '2026-12-04T10:00:00+07:00',
    topic: 'Mekanisme Rekening Escrow Tikum: Mengapa Dana Penjual Ditahan Hingga Acara Berlangsung',
    target_keyword: 'rekening escrow tiket konser',
    search_intent: 'informational',
    cluster: 'E. Secondary Marketplace Education',
    pillar: 'RESALE_EDUCATION',
    assigned_status: 'scheduled',
    source_readiness: 'VERIFIED_FINANCIAL_ARCHITECTURE (Doku / Xendit Escrow Protocol)',
    editorial_approval: 'APPROVED (Tim Editorial Tikum - Compliance)',
    publication_status: 'SCHEDULED (Private until date reached)'
  },

  // --- WEEK 5 ---
  {
    week: 5,
    planned_date: '2026-12-08T10:00:00+07:00',
    topic: 'Kalender Konser Musik Terbesar di Indonesia 2026–2027: Jadwal Musisi Internasional & Lokal',
    target_keyword: 'jadwal konser indonesia 2026 2027',
    search_intent: 'informational',
    cluster: 'A. Event Discovery',
    pillar: 'EVENT_DISCOVERY',
    assigned_status: 'draft',
    source_readiness: 'PRIMARY_SOURCE_CURATION_IN_PROGRESS (APMI Promoters)',
    editorial_approval: 'PENDING_FINAL_FACT_CHECK',
    publication_status: 'DRAFT (Not published)'
  },
  {
    week: 5,
    planned_date: '2026-12-11T10:00:00+07:00',
    topic: 'Prosedur Surat Kuasa Tiket Konser: Syarat Resmi, Format & Dokumen Penukaran Wristband',
    target_keyword: 'surat kuasa penukaran tiket konser',
    search_intent: 'informational',
    cluster: 'C. Ticket Buyer Education',
    pillar: 'TICKET_BUYING',
    assigned_status: 'draft',
    source_readiness: 'PROMOTER_GUIDELINES_COMPILATION',
    editorial_approval: 'IN_REVIEW',
    publication_status: 'DRAFT (Not published)'
  },

  // --- WEEK 6 ---
  {
    week: 6,
    planned_date: '2026-12-15T10:00:00+07:00',
    topic: 'Perbedaan Tiket Festival Standing vs Seating di Stadion: Mana Pilihan Terbaik untuk Anda?',
    target_keyword: 'standing vs seating tiket konser',
    search_intent: 'informational',
    cluster: 'D. Venue Intelligence',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'draft',
    source_readiness: 'EDITORIAL_EXPERIENCE_SURVEY',
    editorial_approval: 'IN_REVIEW',
    publication_status: 'DRAFT (Not published)'
  },
  {
    week: 6,
    planned_date: '2026-12-18T10:00:00+07:00',
    topic: 'Prosedur Resolusi Sengketa Tiket di Tikum: Hak Pembeli Jika Tiket Bermasalah di Gerbang',
    target_keyword: 'sengketa tiket konser pengembalian dana',
    search_intent: 'informational',
    cluster: 'E. Secondary Marketplace Education',
    pillar: 'RESALE_EDUCATION',
    assigned_status: 'draft',
    source_readiness: 'ARGUS_DISPUTE_SLA_POLICY',
    editorial_approval: 'PENDING_APPROVAL',
    publication_status: 'DRAFT (Not published)'
  },

  // --- WEEK 7 ---
  {
    week: 7,
    planned_date: '2026-12-22T10:00:00+07:00',
    topic: 'Profil Promotor Konser Resmi di Indonesia: Daftar Anggota APMI & Standar Keamanan Acara',
    target_keyword: 'promotor konser resmi indonesia apmi',
    search_intent: 'informational',
    cluster: 'B. Artist Discovery',
    pillar: 'EVENT_DISCOVERY',
    assigned_status: 'draft',
    source_readiness: 'APMI_REGISTRY_VERIFIED',
    editorial_approval: 'DRAFT_IN_PROGRESS',
    publication_status: 'DRAFT (Not published)'
  },
  {
    week: 7,
    planned_date: '2026-12-25T10:00:00+07:00',
    topic: 'Waspada Penipuan Tiket Konser di Media Sosial: Red Flags Akun Calo Twitter/X dan Instagram',
    target_keyword: 'cara aman beli tiket di twitter',
    search_intent: 'informational',
    cluster: 'C. Ticket Buyer Education',
    pillar: 'SAFETY',
    assigned_status: 'draft',
    source_readiness: 'FRAUD_CASE_STUDIES_ANALYSIS',
    editorial_approval: 'DRAFT_IN_PROGRESS',
    publication_status: 'DRAFT (Not published)'
  },

  // --- WEEK 8 ---
  {
    week: 8,
    planned_date: '2026-12-29T10:00:00+07:00',
    topic: 'Checklist Persiapan Hari-H Nonton Konser Stadion: Barang Bawaan, Tas Bening & Aturan Powerbank',
    target_keyword: 'tips nonton konser stadion barang bawaan',
    search_intent: 'informational',
    cluster: 'D. Venue Intelligence',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'draft',
    source_readiness: 'VENUE_SECURITY_REGULATIONS_COMPILATION',
    editorial_approval: 'DRAFT_IN_PROGRESS',
    publication_status: 'DRAFT (Not published)'
  },
  {
    week: 8,
    planned_date: '2027-01-01T10:00:00+07:00',
    topic: 'Panduan Lengkap Menghadiri Konser di ICE BSD City: Rute Tol, Shuttle Bus & Penginapan Terdekat',
    target_keyword: 'panduan konser ice bsd tangerang',
    search_intent: 'informational',
    cluster: 'A. Event Discovery',
    pillar: 'EVENT_GUIDES',
    assigned_status: 'draft',
    source_readiness: 'ICE_BSD_VENUE_SPECS',
    editorial_approval: 'DRAFT_IN_PROGRESS',
    publication_status: 'DRAFT (Not published)'
  }
];

module.exports = {
  EDITORIAL_ROADMAP_8_WEEKS
};
