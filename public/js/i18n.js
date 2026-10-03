/**
 * Tikum — Client-Side Localization (i18n), RTL Controller & Theme Engine
 * 
 * BRAND: Tikum — Verified Resale. Real Support. (by Shinerva)
 * 
 * Target Languages (10 Global Music & Live Event Markets):
 * - English (en) — Global live event lingua franca
 * - Indonesian (id) — Primary domestic market
 * - Mandarin Chinese (zh-CN / zh) — Greater China & international concert circuit
 * - Japanese (ja) — Top global music market
 * - Korean (ko) — K-Pop touring epicenter & regional fan hub
 * - Spanish (es) — Latin America & European touring circuit
 * - Portuguese (pt-BR / pt) — Brazil & Iberian stadium market
 * - French (fr) — Major European festival & concert economy
 * - Arabic (ar) — Middle East / GCC mega-event market (RTL Layout)
 * - Hindi (hi) — Rapidly growing South Asian live entertainment market
 *
 * Invariants:
 * - Brand name "Tikum" is never translated.
 * - Arabic ('ar') automatically triggers document.documentElement.dir = 'rtl' and RTL classes.
 * - CJK typography ensures clean fallback fonts without character clipping.
 * - Safe for Node / SSR testing (guards window, document, localStorage).
 * - Full coverage of all ARGUS ledger & escrow transaction states.
 * - Defensible trust copy: NO "0 Scam" or absolute fraud guarantees.
 */

(function () {
  const isNode = typeof window === 'undefined';
  const hasStorage = typeof localStorage !== 'undefined';
  const hasDoc = typeof document !== 'undefined';

  const LANGUAGES = [
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', pill: 'ID' },
    { code: 'en', name: 'English', native: 'English', dir: 'ltr', pill: 'EN' },
    { code: 'zh-CN', codeAlias: 'zh', name: 'Chinese (Simplified)', native: '中文', dir: 'ltr', pill: '中文' },
    { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', pill: 'العربية' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', pill: 'हिन्दी' },
    { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', pill: 'ES' },
    { code: 'fr', name: 'French', native: 'Français', dir: 'ltr', pill: 'FR' },
    { code: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr', pill: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr', pill: '한국어' },
    { code: 'pt-BR', codeAlias: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr', pill: 'PT' }
  ];

  const TIER2_LOCALES = [
    { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr', pill: 'DE' },
    { code: 'it', name: 'Italian', native: 'Italiano', dir: 'ltr', pill: 'IT' },
    { code: 'th', name: 'Thai', native: 'ไทย', dir: 'ltr', pill: 'TH' },
    { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', dir: 'ltr', pill: 'VI' },
    { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', dir: 'ltr', pill: 'MS' },
    { code: 'tl', name: 'Filipino', native: 'Tagalog', dir: 'ltr', pill: 'TL' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe', dir: 'ltr', pill: 'TR' }
  ];

  const SUPPORTED_CURRENCIES = [
    'IDR', 'USD', 'SGD', 'MYR', 'THB', 'PHP', 'VND', 'JPY', 'KRW', 'CNY', 'INR', 'EUR', 'GBP', 'BRL', 'MXN', 'AED'
  ];
  const BASE_TRANSACTION_CURRENCY = 'IDR';

  const translations = {
  "id": {
    "domain": {
      "payment": "Pembayaran",
      "refund": "Pengembalian Dana",
      "escrow": "Rekening Penampungan (Escrow)",
      "sellerVerification": "Verifikasi Penjual",
      "buyerProtection": "Perlindungan Pembeli",
      "dispute": "Sengketa Transaksi",
      "ticketDelivery": "Pengiriman Tiket",
      "ticketVerification": "Verifikasi Tiket",
      "venueAssist": "Bantuan Venue Opsional",
      "picAssistance": "Pendampingan PIC Lapangan",
      "eventStatus": "Status Event",
      "orderStatus": "Status Pesanan",
      "terms": "Syarat & Ketentuan",
      "privacy": "Kebijakan Privasi",
      "refundPolicy": "Kebijakan Pengembalian Dana"
    },
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Tiket Second. Tanpa Scam.",
      "slogan": "Beli Tiket Resale dengan Percaya Diri.",
      "copy": "Marketplace tiket sekunder terpercaya yang dirancang untuk mengurangi penipuan tiket dengan verifikasi berlapis, transaksi terlindungi escrow, dan bantuan langsung staf PIC di venue.",
      "venueSupport": "Orang sungguhan. Di venue.",
      "copyright": "© 2026 Tikum — by Shinerva. Seluruh hak cipta dilindungi undang-undang."
    },
    "meta": {
      "title": "Tikum — Tiket Second. Tanpa Scam. | by Shinerva",
      "description": "Marketplace tiket sekunder terpercaya. Dirancang untuk mengurangi penipuan tiket dengan verifikasi resmi, transaksi terlindungi escrow, dan pendampingan PIC di gerbang venue."
    },
    "nav": {
      "events": "Semua Event",
      "concerts": "Konser",
      "sports": "Olahraga",
      "festivals": "Festival",
      "theater": "Teater",
      "comedy": "Komedi",
      "howItWorks": "Cara Kerja",
      "search": "Cari",
      "sellTicket": "Jual Tiket",
      "myOrders": "Pesanan Saya",
      "myTickets": "Tiket Saya",
      "support": "Bantuan",
      "account": "Akun",
      "signIn": "Masuk / Daftar",
      "findTickets": "Cari Tiket"
    },
    "hero": {
      "headline": "Tiket Second. Tanpa Scam.",
      "subhead": "Marketplace tiket sekunder dengan verifikasi, perlindungan transaksi, dan dukungan event yang nyata.",
      "ctaFind": "Cari Tiket",
      "ctaSell": "Jual Tiket",
      "featuredBadge": "PENGUMUMAN RESMI TERVERIFIKASI"
    },
    "trust": {
      "verified": "Listing Terverifikasi",
      "verifiedDesc": "Setiap listing melalui kontrol verifikasi yang jelas dan terstandarisasi.",
      "protected": "Transaksi Terlindungi",
      "protectedDesc": "Status pembayaran dan dana diamankan melalui rekening penampungan internal (escrow).",
      "venue": "Dukungan Nyata di Venue",
      "venueDesc": "Untuk event yang didukung, Tikum menyediakan PIC operasional langsung di sekitar venue.",
      "pricing": "Harga Transparan",
      "pricingDesc": "Rincian harga tiket, biaya layanan, dan pajak ditampilkan jelas tanpa markup tersembunyi.",
      "pillarVerified": "Listing Terverifikasi",
      "pillarVenue": "Dukungan Venue PIC",
      "pillarProtected": "Transaksi Terlindungi (Escrow)",
      "pillarPricing": "Harga Transparan"
    },
    "trustStates": {
      "VERIFIED": "Listing Terverifikasi",
      "SUPPORT_AVAILABLE": "Dukungan Venue Tersedia",
      "REMOTE_SUPPORT": "Dukungan Jarak Jauh",
      "PENDING": "Verifikasi Tertunda",
      "UNAVAILABLE": "Dukungan Belum Tersedia"
    },
    "operations": {
      "headline": "Lebih dari Sekadar Marketplace. Kami Hadir Saat Kamu Membutuhkan.",
      "subhead": "Alur operasional transparan dari listing hingga pintu gerbang acara.",
      "step1Title": "Listing Tiket",
      "step1Desc": "Penjual memasukkan data tiket dan bukti pemesanan awal.",
      "step2Title": "Verifikasi",
      "step2Desc": "Pemeriksaan kesesuaian data tiket dan kepemilikan oleh sistem & tim.",
      "step3Title": "Pembelian Terlindungi",
      "step3Desc": "Dana pembeli disimpan aman di rekening penampungan internal (escrow).",
      "step4Title": "Hari Acara",
      "step4Desc": "Pembeli hadir di venue dengan tiket dan kode verifikasi.",
      "step5Title": "Dukungan di Venue",
      "step5Desc": "PIC Tikum siap mendampingi di lokasi jika terjadi kendala pada gerbang tiket.",
      "humanEscalation": "Eskalasi Manusia Nyata",
      "humanEscalationDesc": "Jika ada masalah tiket, Anda tidak dilempar ke jalan buntu chatbot. Tim operasional kami menindaklanjuti secara langsung."
    },
    "howItWorks": {
      "title": "Cara Kerja Tikum",
      "buyTab": "Membeli Tiket",
      "buy1": "Temukan event pilihanmu",
      "buy2": "Pilih listing yang terverifikasi",
      "buy3": "Bayar dengan aman via escrow",
      "buy4": "Dapatkan bantuan hingga hari acara",
      "sellTab": "Menjual Tiket",
      "sell1": "Daftarkan tiket yang ingin dijual",
      "sell2": "Lengkapi bukti verifikasi listing",
      "sell3": "Dapatkan pembeli dengan harga wajar",
      "sell4": "Terima pencairan dana setelah acara"
    },
    "venueSupportSection": {
      "headline": "Butuh Bantuan di Venue? Kami Punya Tim di Sana.",
      "copy": "Untuk event yang memenuhi syarat, Tikum menyediakan PIC lokal di area venue agar pembeli tidak ditinggal sendirian saat terjadi kendala gerbang masuk.",
      "cta": "Lihat Event yang Didukung"
    },
    "sellerSection": {
      "headline": "Ubah Tiket Tak Terpakai Menjadi Uang Tunai.",
      "copy": "Pendaftaran mudah, harga transparan, verifikasi akurat, komunikasi terarah, dan alur pencairan dana yang terkontrol.",
      "cta": "Jual Tiket Sekarang"
    },
    "principles": {
      "headline": "Dibangun Berdasarkan Kepercayaan. Didukung Manusia Nyata.",
      "p1Title": "Listing Sekunder Terverifikasi",
      "p1Desc": "Kami memeriksa kepemilikan dan integritas setiap tiket sebelum dapat ditransaksikan.",
      "p2Title": "Perlindungan Dana Terkendali",
      "p2Desc": "Dana baru dicairkan ke penjual setelah pembeli terkonfirmasi berhasil masuk venue.",
      "p3Title": "Kehadiran Operasional di Lapangan",
      "p3Desc": "Kami tidak sekadar beroperasi di balik layar; tim kami hadir di lapangan saat event berlangsung."
    },
    "footer": {
      "product": "Produk",
      "company": "Perusahaan",
      "trust": "Keamanan & Kepercayaan",
      "legal": "Legalitas",
      "events": "Katalog Event",
      "sell": "Jual Tiket",
      "how": "Cara Kerja",
      "supported": "Event yang Didukung",
      "about": "Tentang Tikum",
      "contact": "Kontak Kami",
      "venuePIC": "Dukungan Venue",
      "buyerProt": "Perlindungan Pembeli",
      "sellerProt": "Perlindungan Penjual",
      "verifInfo": "Verifikasi Tiket",
      "refund": "Kebijakan Pengembalian Dana",
      "terms": "Syarat & Ketentuan",
      "privacy": "Kebijakan Privasi",
      "cookie": "Kebijakan Cookie",
      "disclaimer": "Pernyataan Sanggahan"
    },
    "status": {
      "LISTED": "Tersedia",
      "LOCKED": "Dalam Transaksi",
      "SOLD": "Terjual",
      "RESERVED": "Dipesan",
      "PENDING_PAYMENT": "Menunggu Pembayaran",
      "PAID": "Dana Diamankan di Escrow",
      "ENTRY_CONFIRMED": "Sukses Masuk Venue",
      "SETTLED": "Selesai & Dicairkan",
      "DISPUTED": "Dalam Investigasi PIC Gate",
      "REFUNDED": "Dana Dikembalikan",
      "CANCELLED": "Dibatalkan",
      "PENDING": "Menunggu Tanggapan",
      "ACCEPTED": "Disepakati",
      "REJECTED": "Ditolak",
      "COUNTERED": "Penawaran Balasan",
      "EXPIRED": "Kedaluwarsa"
    },
    "common": {
      "loading": "Memuat data...",
      "searchPlaceholder": "Cari artis, event, atau venue...",
      "filter": "Saring",
      "allCities": "Semua Kota",
      "allCategories": "Semua Kategori",
      "fromPrice": "Dari",
      "viewTickets": "Lihat Tiket",
      "details": "Detail",
      "officialTickets": "Tiket Resmi",
      "noResults": "Tidak ada event terverifikasi yang sesuai dengan pencarian Anda."
    },
    "venuePicSection": {
      "kicker": "Diferensiasi Utama TIKUM",
      "headline": "Butuh Bantuan di Venue? Kami Punya Tim di Lokasi.",
      "desc": "Koordinator lapangan (PIC) TIKUM hadir langsung di sekitar venue untuk mendampingi pembeli saat penukaran wristband gelang dan turnstile entry gate. Anda tidak ditinggalkan sendirian menghadapi bot saat hari konser tiba.",
      "badgeCoord": "On-Site Coordinator",
      "badgeTurnstile": "Turnstile Assistance",
      "badgeDispute": "Fast Gate Dispute Resolution"
    },
    "trustArchitectureSection": {
      "kicker": "Fondasi Perlindungan",
      "title": "Arsitektur Kepercayaan TIKUM",
      "lead": "Tiga pilar operasional nyata untuk menekan risiko penipuan tiket sekunder.",
      "card1Title": "Sinyal Penjual Terverifikasi",
      "card1Desc": "Setiap penjual melalui kontrol identitas, riwayat transaksi, dan rekam jejak penyelesaian tiket sebelum listing tayang.",
      "card2Title": "Escrow Terkunci Hingga Gate",
      "card2Desc": "Dana pembeli tersimpan aman di rekening penampungan internal dan baru dilepas ke penjual saat pembeli lolos gerbang masuk.",
      "card3Title": "Pencegahan Tiket Ganda",
      "card3Desc": "Sistem buku besar dan audit trail mencegah tiket yang sama didaftarkan atau ditransaksikan dua kali di platform."
    },
    "howItWorksSection": {
      "kicker": "Alur Transaksi Aman",
      "title": "Cara Kerja Pasar Tiket TIKUM",
      "lead": "Proses transparan yang melindungi pembeli dan penjual dari awal hingga gerbang acara.",
      "buyerColTitle": "Untuk Pembeli",
      "buyerStep1": "Cari Event & Tiket Terverifikasi",
      "buyerStep1Desc": "Pilih tiket sekunder dengan harga transparan tanpa markup tersembunyi saat checkout.",
      "buyerStep2": "Pembayaran Aman via Escrow",
      "buyerStep2Desc": "Dana Anda disimpan di rekening penampungan internal (escrow), bukan langsung ke penjual.",
      "buyerStep3": "Dapatkan Tiket Resmi & Kode Masuk",
      "buyerStep3Desc": "Terima e-ticket atau instruksi penukaran gelang beserta kode validasi turnstile.",
      "buyerStep4": "Masuk Venue Didampingi Tim PIC",
      "buyerStep4Desc": "Tunjukkan tiket di gerbang. Jika terjadi kendala barcode, PIC TIKUM siap mendampingi di lokasi.",
      "sellerColTitle": "Untuk Penjual",
      "sellerStep1": "Pasang Listing Tanpa Biaya Awal",
      "sellerStep1Desc": "Masukkan detail tiket, bukti kepemilikan, dan harga jual yang wajar.",
      "sellerStep2": "Verifikasi Tiket Otomatis & Manual",
      "sellerStep2Desc": "Sistem memeriksa validitas tiket dan mencegah duplikasi sebelum listing aktif.",
      "sellerStep3": "Pemberitahuan Saat Tiket Terjual",
      "sellerStep3Desc": "Dapatkan notifikasi instan saat pembeli melakukan pembayaran ke rekening escrow.",
      "sellerStep4": "Pencairan Dana Otomatis Pasca-Acara",
      "sellerStep4Desc": "Setelah pembeli terkonfirmasi sukses masuk gate, dana langsung dicairkan ke rekening bank Anda."
    },
    "sellerExperienceSection": {
      "kicker": "Pengalaman Penjual",
      "headline": "Punya Tiket yang Tidak Bisa Dipakai?",
      "desc": "Daftarkan tiketmu secara gratis tanpa biaya awal. Dapatkan pembeli dengan harga wajar dan pencairan dana langsung ke rekening bank Anda setelah acara.",
      "cta": "Pasang Listing Tiket"
    },
    "faqPreviewSection": {
      "kicker": "Pertanyaan Umum",
      "title": "Pertanyaan yang Sering Diajukan",
      "lead": "Jawaban transparan seputar cara bertransaksi, perlindungan escrow, dan kehadiran staf di venue.",
      "q1": "Bagaimana TIKUM menekan penipuan tiket?",
      "a1": "Kami menggunakan verifikasi dokumen kepemilikan tiket, penahanan dana di escrow sampai penonton masuk gerbang, serta kehadiran staf PIC di lokasi acara.",
      "q2": "Kapan penjual menerima pencairan dana?",
      "a2": "Dana ditahan di rekening penampungan internal (escrow) dan baru dicairkan setelah pembeli terkonfirmasi berhasil masuk gerbang turnstile acara.",
      "q3": "Apa peran staf PIC TIKUM di lokasi?",
      "a3": "Staf operasional (PIC) TIKUM hadir di sekitar area venue untuk membantu pembeli saat penukaran gelang dan mendampingi jika terjadi kendala pemindaian barcode tiket.",
      "q4": "Bagaimana jika tiket bermasalah di gerbang?",
      "a4": "Pembeli dapat langsung melapor ke PIC venue atau sistem dispute. Jika tiket terbukti tidak valid atau sudah dipakai, dana pembeli dikembalikan sesuai kebijakan refund.",
      "viewAll": "Lihat seluruh FAQ & panduan bantuan"
    },
    "finalCtaSection": {
      "kicker": "Mulai Bertransaksi",
      "title": "Siap Menghadiri Acara Favoritmu?",
      "lead": "Temukan ribuan penikmat musik, olahraga, dan festival di ekosistem tiket sekunder yang terlindungi.",
      "ctaFind": "Cari Tiket Sekarang",
      "ctaSell": "Jual Tiket Anda"
    }
  },
  "en": {
    "domain": {
      "payment": "Payment",
      "refund": "Refund",
      "escrow": "Escrow Protection",
      "sellerVerification": "Seller Verification",
      "buyerProtection": "Buyer Protection",
      "dispute": "Dispute Resolution",
      "ticketDelivery": "Ticket Delivery",
      "ticketVerification": "Ticket Verification",
      "venueAssist": "Optional Venue Assistance",
      "picAssistance": "On-Site PIC Assistance",
      "eventStatus": "Event Status",
      "orderStatus": "Order Status",
      "terms": "Terms & Conditions",
      "privacy": "Privacy Policy",
      "refundPolicy": "Refund Policy"
    },
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Secondary Tickets. Built to Reduce Ticket Fraud.",
      "slogan": "Buy Resale Tickets With Confidence.",
      "copy": "A trusted secondary-ticket marketplace built around verification, protected transactions, and real human support at the venue.",
      "venueSupport": "Real people. At the venue.",
      "copyright": "© 2026 Tikum — by Shinerva. All rights reserved."
    },
    "meta": {
      "title": "Tikum — Secondary Tickets. Built to Reduce Ticket Fraud. | by Shinerva",
      "description": "Trusted secondary ticket marketplace designed to reduce ticket fraud through verified sellers, escrow protection, and on-site venue PIC support."
    },
    "nav": {
      "events": "Events",
      "concerts": "Concerts",
      "sports": "Sports",
      "festivals": "Festivals",
      "theater": "Theater",
      "comedy": "Comedy",
      "howItWorks": "How It Works",
      "search": "Search",
      "sellTicket": "Sell Ticket",
      "myOrders": "My Orders",
      "myTickets": "My Tickets",
      "support": "Support",
      "account": "Account",
      "signIn": "Sign In / Register",
      "findTickets": "Find Tickets"
    },
    "hero": {
      "headline": "Secondary Tickets. Built to Reduce Ticket Fraud.",
      "subhead": "Secondary ticket marketplace with verified listings, transaction protection, and real event support.",
      "ctaFind": "Find Tickets",
      "ctaSell": "Sell Tickets",
      "featuredBadge": "FEATURED OFFICIAL ANNOUNCEMENT"
    },
    "trust": {
      "verified": "Verified Listings",
      "verifiedDesc": "Listings go through defined verification controls.",
      "protected": "Protected Transactions",
      "protectedDesc": "Payment and transaction state are handled through controlled marketplace escrow infrastructure.",
      "venue": "Real Venue Support",
      "venueDesc": "For supported events, TIKUM provides an identifiable operational PIC at or near the venue.",
      "pricing": "Transparent Pricing",
      "pricingDesc": "Clear line-item pricing with no hidden checkout markups.",
      "pillarVerified": "Verified Listings",
      "pillarVenue": "On-Site Venue Support",
      "pillarProtected": "Protected Transactions (Escrow)",
      "pillarPricing": "Transparent Upfront Pricing"
    },
    "trustStates": {
      "VERIFIED": "Verified Listing",
      "SUPPORT_AVAILABLE": "Venue Support Available",
      "REMOTE_SUPPORT": "Remote Support Available",
      "PENDING": "Verification Pending",
      "UNAVAILABLE": "Support Unavailable"
    },
    "operations": {
      "headline": "More Than a Marketplace. We're There When You Need Us.",
      "subhead": "A transparent operational flow from ticket listing to the event gates.",
      "step1Title": "Listing",
      "step1Desc": "Seller submits ticket details and booking credentials.",
      "step2Title": "Verification",
      "step2Desc": "Automated and human checks confirm authenticity and ticket terms.",
      "step3Title": "Protected Purchase",
      "step3Desc": "Buyer funds are held safely in internal escrow until event admission.",
      "step4Title": "Event Day",
      "step4Desc": "Buyer arrives at the venue with verified access credentials.",
      "step5Title": "Venue Support",
      "step5Desc": "Identified Tikum PIC is available on-site if turnstile issues arise.",
      "humanEscalation": "Human Escalation",
      "humanEscalationDesc": "When something goes wrong, you are never abandoned in a chatbot-only dead end."
    },
    "howItWorks": {
      "title": "How Tikum Works",
      "buyTab": "Buying Tickets",
      "buy1": "Find your event",
      "buy2": "Choose a verified listing",
      "buy3": "Pay securely with escrow",
      "buy4": "Get support through event day",
      "sellTab": "Selling Tickets",
      "sell1": "List your unused ticket",
      "sell2": "Verify your listing",
      "sell3": "Find a verified buyer",
      "sell4": "Complete transaction & receive payout"
    },
    "venueSupportSection": {
      "headline": "Need Help at the Venue? We Have People There.",
      "copy": "For eligible events, TIKUM provides a local event PIC so buyers aren't left alone when something goes wrong at the gate.",
      "cta": "See Supported Events"
    },
    "sellerSection": {
      "headline": "Turn an Unused Ticket Into Cash.",
      "copy": "Simple listing, transparent pricing, identity verification, buyer communication, and controlled payout process.",
      "cta": "Sell Your Ticket"
    },
    "principles": {
      "headline": "Built on Trust. Backed by Real People.",
      "p1Title": "Verified Secondary Resale",
      "p1Desc": "Every ticket is systematically screened before being offered to fans.",
      "p2Title": "Protected Escrow Rail",
      "p2Desc": "Sellers are compensated only after successful attendee entry into the venue.",
      "p3Title": "Physical On-Site PICs",
      "p3Desc": "Real personnel deployed to concert gates to troubleshoot any ticketing friction."
    },
    "footer": {
      "product": "Product",
      "company": "Company",
      "trust": "Trust & Safety",
      "legal": "Legal",
      "events": "Events",
      "sell": "Sell Tickets",
      "how": "How It Works",
      "supported": "Supported Events",
      "about": "About Us",
      "contact": "Contact Us",
      "venuePIC": "Venue Support",
      "buyerProt": "Buyer Protection",
      "sellerProt": "Seller Protection",
      "verifInfo": "Verification",
      "refund": "Refund Policy",
      "terms": "Terms of Service",
      "privacy": "Privacy Policy",
      "cookie": "Cookie Policy",
      "disclaimer": "Disclaimer"
    },
    "status": {
      "LISTED": "Listed",
      "LOCKED": "In Transaction",
      "SOLD": "Sold",
      "RESERVED": "Reserved",
      "PENDING_PAYMENT": "Pending Payment",
      "PAID": "Escrow Secured",
      "ENTRY_CONFIRMED": "Entry Confirmed",
      "SETTLED": "Settled & Paid Out",
      "DISPUTED": "Under Gate Investigation",
      "REFUNDED": "Refunded",
      "CANCELLED": "Cancelled",
      "PENDING": "Pending Review",
      "ACCEPTED": "Accepted",
      "REJECTED": "Rejected",
      "COUNTERED": "Counter Offer",
      "EXPIRED": "Expired"
    },
    "common": {
      "loading": "Loading data...",
      "searchPlaceholder": "Search artist, event, or venue...",
      "filter": "Filter",
      "allCities": "All Cities",
      "allCategories": "All Categories",
      "fromPrice": "From",
      "viewTickets": "View Tickets",
      "details": "Details",
      "officialTickets": "Official Tickets",
      "noResults": "No verified events found matching your search."
    },
    "venuePicSection": {
      "kicker": "Key TIKUM Differentiator",
      "headline": "Need Help at the Venue? We Have People on the Ground.",
      "desc": "TIKUM on-site coordinators (PIC) are present around venue areas to assist buyers during wristband exchange and turnstile entry gates. You won't be left alone facing bots on concert day.",
      "badgeCoord": "On-Site Coordinator",
      "badgeTurnstile": "Turnstile Assistance",
      "badgeDispute": "Fast Gate Dispute Resolution"
    },
    "trustArchitectureSection": {
      "kicker": "Protection Foundation",
      "title": "TIKUM Trust Architecture",
      "lead": "Three real operational pillars engineered to reduce secondary ticket fraud.",
      "card1Title": "Verified Seller Signals",
      "card1Desc": "Every seller goes through identity verification, transaction history, and settlement track record before listing.",
      "card2Title": "Escrow Locked Until Gate",
      "card2Desc": "Buyer funds remain secured in internal escrow and are released to seller only after verified turnstile admission.",
      "card3Title": "Duplicate Ticket Prevention",
      "card3Desc": "Ledger controls and immutable audit trails prevent the same barcode from being listed or transacted twice."
    },
    "howItWorksSection": {
      "kicker": "Safe Transaction Flow",
      "title": "How TIKUM Ticket Marketplace Works",
      "lead": "A transparent process protecting buyers and sellers from listing creation to venue entry gates.",
      "buyerColTitle": "For Buyers",
      "buyerStep1": "Discover Verified Events & Tickets",
      "buyerStep1Desc": "Browse verified secondary listings with transparent line-item pricing and zero checkout markup.",
      "buyerStep2": "Secure Payment via Escrow",
      "buyerStep2Desc": "Your payment is held safely in escrow infrastructure, never released prematurely to sellers.",
      "buyerStep3": "Receive Official Ticket & Gate Pass",
      "buyerStep3Desc": "Get your official e-ticket or wristband redemption pass with turnstile entry validation.",
      "buyerStep4": "Enter Venue with On-Site Support",
      "buyerStep4Desc": "Scan your ticket at turnstiles. If any gate issue occurs, on-site PIC coordinators are there to assist.",
      "sellerColTitle": "For Sellers",
      "sellerStep1": "List Tickets with Zero Upfront Fees",
      "sellerStep1Desc": "Enter ticket information, proof of purchase, and fair secondary market asking price.",
      "sellerStep2": "Automated & Manual Verification",
      "sellerStep2Desc": "Platform verifies ticket validity and prevents duplicate barcodes before listing goes live.",
      "sellerStep3": "Instant Notification on Purchase",
      "sellerStep3Desc": "Receive instant updates when a buyer successfully reserves and funds enter escrow.",
      "sellerStep4": "Automated Post-Event Payout",
      "sellerStep4Desc": "Funds disburse straight to your designated bank account once turnstile entry is confirmed."
    },
    "sellerExperienceSection": {
      "kicker": "Seller Experience",
      "headline": "Have Unused Tickets You Can't Attend?",
      "desc": "List your tickets for free with zero upfront costs. Reach verified fans and receive direct bank payout after the event.",
      "cta": "List Your Tickets"
    },
    "faqPreviewSection": {
      "kicker": "Frequently Asked Questions",
      "title": "Frequently Asked Questions",
      "lead": "Transparent answers about transaction flows, escrow protection, and venue staff presence.",
      "q1": "How does TIKUM reduce ticket fraud?",
      "a1": "We combine ticket ownership verification, internal escrow fund hold until turnstile entry, and on-site PIC support at venues.",
      "q2": "When does the seller receive payout?",
      "a2": "Funds remain in escrow and are released only after buyer's turnstile entry is confirmed.",
      "q3": "What is the role of TIKUM venue PIC?",
      "a3": "TIKUM on-site coordinators assist buyers during wristband exchange and provide fast gate escalation if barcode issues occur.",
      "q4": "What if a ticket has issues at the gate?",
      "a4": "Buyers can report immediately to the on-site PIC or dispute system. If a ticket is proven invalid, funds are refunded per policy.",
      "viewAll": "View full FAQ & help guides"
    },
    "finalCtaSection": {
      "kicker": "Start Transacting",
      "title": "Ready to Attend Your Next Event?",
      "lead": "Join thousands of music, sports, and festival fans in a protected secondary ticket ecosystem.",
      "ctaFind": "Find Tickets Now",
      "ctaSell": "Sell Your Tickets"
    }
  },
  "zh-CN": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "二手门票·防范诈骗",
      "slogan": "安心购买转售门票。",
      "copy": "值得信赖的二手门票交易平台，依托严格票源核验、资金托管保障以及现场工作人员（PIC）实地协助。",
      "venueSupport": "真人团队，常驻现场。",
      "copyright": "© 2026 Tikum — by Shinerva. 版权所有。"
    },
    "meta": {
      "title": "Tikum — 二手门票·防范诈骗 | by Shinerva",
      "description": "经过严格核验的二手门票市场。依托安全托管基础设施与演出场地专属现场支持，降低票务欺诈风险。"
    },
    "nav": {
      "events": "全部活动",
      "concerts": "演唱会",
      "sports": "体育赛事",
      "festivals": "音乐节",
      "theater": "戏剧话剧",
      "comedy": "脱口秀",
      "howItWorks": "运作流程",
      "search": "搜索",
      "sellTicket": "转售门票",
      "myOrders": "我的订单",
      "myTickets": "我的门票",
      "support": "客户支持",
      "account": "账户中心",
      "signIn": "登录 / 注册",
      "findTickets": "查找门票"
    },
    "hero": {
      "headline": "二手门票·防范诈骗",
      "subhead": "具有房源验证、交易保护和真实活动现场支持的二手门票交易平台。",
      "ctaFind": "查找门票",
      "ctaSell": "转售门票",
      "featuredBadge": "官方核验公布"
    },
    "trust": {
      "verified": "官方核验票源",
      "verifiedDesc": "所有门票均通过明确、严格的真实性与合规性审查。",
      "protected": "托管安全交易",
      "protectedDesc": "支付与交易全流程由受控的托管架构保障，入场后方才结算。",
      "venue": "场馆现场支持",
      "venueDesc": "针对指定演出，Tikum 在检票口及场馆周边设立专人对接服务。",
      "pricing": "透明公允定价",
      "pricingDesc": "票价、服务费与税费明细清晰展示，绝无隐性加价。",
      "pillarVerified": "真实认证门票",
      "pillarVenue": "现场协调支持",
      "pillarProtected": "资金托管保障",
      "pillarPricing": "全程透明定价"
    },
    "trustStates": {
      "VERIFIED": "已核验门票",
      "SUPPORT_AVAILABLE": "现场专人支持可用",
      "REMOTE_SUPPORT": "远程实时协助",
      "PENDING": "核验审核中",
      "UNAVAILABLE": "暂无现场协助"
    },
    "operations": {
      "headline": "不止是交易平台，更在关键时刻伴你同行。",
      "subhead": "从门票挂牌到入场检票的全流程透明运作。",
      "step1Title": "门票挂牌",
      "step1Desc": "卖家提交票面信息与购票凭证。",
      "step2Title": "严格核验",
      "step2Desc": "系统与人工团队双重核查票品真伪。",
      "step3Title": "安全交易",
      "step3Desc": "买家付款暂存于托管账户中，保障资金安全。",
      "step4Title": "演出当天",
      "step4Desc": "买家携带有效入场凭证抵达演出场馆。",
      "step5Title": "现场专人",
      "step5Desc": "若遇闸机或核验异常，Tikum 专人就近协调处理。",
      "humanEscalation": "真人客服介入",
      "humanEscalationDesc": "遭遇问题时无需苦等机器人，我们的运营团队直接跟进解决。"
    },
    "howItWorks": {
      "title": "Tikum 运作流程",
      "buyTab": "购买门票",
      "buy1": "挑选你心仪的活动",
      "buy2": "选择经核验的门票",
      "buy3": "通过托管账户安全支付",
      "buy4": "享受演出当天的贴心协助",
      "sellTab": "转售门票",
      "sell1": "发布你闲置的门票",
      "sell2": "提交必要核验信息",
      "sell3": "与真实买家达成交易",
      "sell4": "演出成功入场后获取款项"
    },
    "venueSupportSection": {
      "headline": "演出入场遇阻？我们现场有人。",
      "copy": "针对指定热门演出，Tikum 派驻现场负责人（PIC），确保买家在闸机检票遇阻时绝不孤立无援。",
      "cta": "查看支持的演出"
    },
    "sellerSection": {
      "headline": "让闲置门票变现，轻松无忧。",
      "copy": "发布简单、费用透明、官方核验、畅通沟通与规范结算流程。",
      "cta": "立即转售门票"
    },
    "principles": {
      "headline": "立足信任，真人护航。",
      "p1Title": "官方级二次核验",
      "p1Desc": "每张票品均经过详尽的凭证查验。",
      "p2Title": "资金托管隔离",
      "p2Desc": "买家顺利入场前，款项不予划拨。",
      "p3Title": "线下现场驻点",
      "p3Desc": "核心场馆部署现场工作人员，提供直接支援。"
    },
    "footer": {
      "product": "产品",
      "company": "公司",
      "trust": "安全与信任",
      "legal": "法律与条款",
      "events": "活动日程",
      "sell": "转售门票",
      "how": "运作方式",
      "supported": "支持的活动",
      "about": "关于我们",
      "contact": "联系我们",
      "venuePIC": "现场支持",
      "buyerProt": "买家保护",
      "sellerProt": "卖家保障",
      "verifInfo": "票源核验",
      "refund": "退款政策",
      "terms": "服务条款",
      "privacy": "隐私政策",
      "cookie": "Cookie 政策",
      "disclaimer": "免责声明"
    },
    "status": {
      "LISTED": "在售",
      "LOCKED": "交易锁定中",
      "SOLD": "已售出",
      "RESERVED": "已预订",
      "PENDING_PAYMENT": "等待买家付款",
      "PAID": "资金已入托管账户",
      "ENTRY_CONFIRMED": "入场已确认",
      "SETTLED": "已结算放款",
      "DISPUTED": "闸机争议调查中",
      "REFUNDED": "款项已退回",
      "CANCELLED": "交易已取消",
      "PENDING": "等待确认",
      "ACCEPTED": "已接受",
      "REJECTED": "已拒绝",
      "COUNTERED": "还价中",
      "EXPIRED": "已过期"
    },
    "common": {
      "loading": "正在加载...",
      "searchPlaceholder": "搜索艺人、活动名称或场馆...",
      "filter": "筛选",
      "allCities": "全部城市",
      "allCategories": "全部类型",
      "fromPrice": "起价",
      "viewTickets": "查看门票",
      "details": "详情",
      "officialTickets": "官方售票",
      "noResults": "未找到符合条件的核验活动。"
    },
    "venuePicSection": {
      "kicker": "TIKUM 核心优势",
      "headline": "现场需要帮助？我们在场馆设有工作人员。",
      "desc": "TIKUM 现场协调员（PIC）驻扎在场馆周边，在手环兑换和闸机入场处提供实地协助。演出当天您不会孤身应对异常。",
      "badgeCoord": "现场协调专员",
      "badgeTurnstile": "闸机入场协助",
      "badgeDispute": "快速现场争议调解"
    },
    "trustArchitectureSection": {
      "kicker": "信任基石",
      "title": "TIKUM 信任与安全架构",
      "lead": "三大坚实运营支柱，切实降低二手门票欺诈风险。",
      "card1Title": "已验证卖家信用",
      "card1Desc": "每位卖家在发布门票前均经过实名认证、交易历史及履约记录核验。",
      "card2Title": "资金托管至验票入场",
      "card2Desc": "买家款项安全存放在内部托管账户中，仅在买家成功核销入场后向卖家放款。",
      "card3Title": "严格防范双重售票",
      "card3Desc": "双录记账系统与不可篡改审计追踪确保同一条码绝不会在平台重复挂牌或交易。"
    },
    "howItWorksSection": {
      "kicker": "安全交易流程",
      "title": "TIKUM 交易运作方式",
      "lead": "透明可信的流转机制，从挂牌到现场入场全流程保障买卖双方权益。",
      "buyerColTitle": "买家流程",
      "buyerStep1": "浏览认证活动与门票",
      "buyerStep1Desc": "选购经核验的二手门票，明码实价，结账时无隐藏加价。",
      "buyerStep2": "托管账户安全付款",
      "buyerStep2Desc": "资金存入内部托管体系，绝不会在入场前提前流向卖家。",
      "buyerStep3": "获取正式门票与入场凭证",
      "buyerStep3Desc": "接收官方电子票或手环兑换凭证，并附带闸机校验码。",
      "buyerStep4": "专人陪同安心入场",
      "buyerStep4Desc": "在闸机扫码入场。如遇条码故障，现场 PIC 协调员即刻协助解决。",
      "sellerColTitle": "卖家流程",
      "sellerStep1": "免费挂牌无需先期费用",
      "sellerStep1Desc": "录入门票信息、购票凭据及合理的二手售价。",
      "sellerStep2": "系统自动与人工双重核验",
      "sellerStep2Desc": "系统核验门票真伪并杜绝条形码重复挂牌。",
      "sellerStep3": "门票售出即时通知",
      "sellerStep3Desc": "买家下单并付款存入托管账户后，您将立即收到通知。",
      "sellerStep4": "演出后款项自动结算",
      "sellerStep4Desc": "买家成功验证入场后，款项自动打入您的指定银行账户。"
    },
    "sellerExperienceSection": {
      "kicker": "卖家体验",
      "headline": "手中有无法前往的闲置门票？",
      "desc": "免费发布门票，无任何前期费用。快速触达真实乐迷，演出结束后款项直达银行账户。",
      "cta": "立即挂牌出售"
    },
    "faqPreviewSection": {
      "kicker": "常见问题",
      "title": "常见问题解答",
      "lead": "关于交易安全、托管保护及现场工作人员职责的清晰说明。",
      "q1": "TIKUM 如何防范门票欺诈？",
      "a1": "我们结合门票所有权审核、入场前资金托管以及现场专员实地协助，全方位控制风险。",
      "q2": "卖家何时收到售票款项？",
      "a2": "资金留存于托管体系中，仅在买家顺利通过闸机核销入场后放款。",
      "q3": "现场 PIC 人员的作用是什么？",
      "a3": "现场协调员协助买家兑换手环，并在条码扫码受阻时进行快速人工介入。",
      "q4": "如在检票口遇到问题怎么办？",
      "a4": "买家可立即联系现场 PIC 或提交争议。若核实门票无效，将依规全额退款。",
      "viewAll": "查看全部常见问题与指南"
    },
    "finalCtaSection": {
      "kicker": "开启安心体验",
      "title": "准备好奔赴心仪的现场了吗？",
      "lead": "与数万名音乐、体育和音乐节爱好者一同体验安全透明的二次流通生态。",
      "ctaFind": "立即查找门票",
      "ctaSell": "出售闲置门票"
    }
  },
  "ja": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Verified Resale. Real Support.",
      "slogan": "確かなリセール、確かなサポート。",
      "copy": "検証済みチケット、エスクロー保護取引、そして会場でのリアルスタッフ対応。",
      "venueSupport": "会場に、本物のスタッフを。",
      "copyright": "© 2026 Tikum — by Shinerva. All rights reserved."
    },
    "meta": {
      "title": "Tikum — 検証済みリセール · 会場対面サポート | by Shinerva",
      "description": "安心の公式検証リセールマーケットプレイス。エスクローによる資金保護と会場ゲートでの専任サポート。"
    },
    "nav": {
      "events": "全イベント",
      "concerts": "コンサート",
      "sports": "スポーツ",
      "festivals": "フェス",
      "theater": "演劇·舞台",
      "comedy": "お笑い·コメディ",
      "howItWorks": "ご利用方法",
      "search": "検索",
      "sellTicket": "チケット出品",
      "myOrders": "購入履歴",
      "myTickets": "保有チケット",
      "support": "サポート",
      "account": "アカウント",
      "signIn": "ログイン / 登録",
      "findTickets": "チケットを探す"
    },
    "hero": {
      "headline": "二次流通チケット。確かな信頼と安全を。",
      "subhead": "出品検証、エスクロー取引保護、現地会場サポートを備えた二次流通チケットマーケットプレイス。",
      "ctaFind": "チケットを探す",
      "ctaSell": "チケットを出品",
      "featuredBadge": "注目の公式発表 · 検証済み"
    },
    "trust": {
      "verified": "検証済みリスティング",
      "verifiedDesc": "すべての出品は明確な検証基準に従って審査されています。",
      "protected": "保護された取引",
      "protectedDesc": "決済と取引状況は安全なエスクロー機構によって厳重に管理されます。",
      "venue": "会場対面サポート",
      "venueDesc": "対象公演では会場近辺に専任の現地スタッフ（PIC）を配置します。",
      "pricing": "透明な価格体系",
      "pricingDesc": "チケット代金、手数料、税金を明示。隠れた追加費用はありません。",
      "pillarVerified": "検証済みリスティング",
      "pillarVenue": "現地スタッフ支援",
      "pillarProtected": "エスクロー保護取引",
      "pillarPricing": "明瞭な価格設定"
    },
    "trustStates": {
      "VERIFIED": "検証済みリスティング",
      "SUPPORT_AVAILABLE": "会場現地サポート対応",
      "REMOTE_SUPPORT": "リモートサポート対応",
      "PENDING": "確認審査中",
      "UNAVAILABLE": "現地サポート未対応"
    },
    "operations": {
      "headline": "ただの市場ではない。困った時に、そこにいる安心。",
      "subhead": "出品から入場ゲートまで、透明なオペレーションフロー。",
      "step1Title": "出品登録",
      "step1Desc": "出品者がチケット情報と購入証明を提出します。",
      "step2Title": "公式検証",
      "step2Desc": "システムと専門チームがチケットの真正性を精査します。",
      "step3Title": "安全な購入",
      "step3Desc": "購入代金は入場確認までエスクロー口座で安全に預託されます。",
      "step4Title": "公演当日",
      "step4Desc": "購入者は検証済みアクセス情報を持って会場へ向かいます。",
      "step5Title": "会場サポート",
      "step5Desc": "入場ゲートでのトラブル発生時、現地スタッフが迅速に対応します。",
      "humanEscalation": "専任担当者による対応",
      "humanEscalationDesc": "AIチャットの堂々巡りではなく、実際の運営チームが問題解決に当たります。"
    },
    "howItWorks": {
      "title": "Tikum の仕組み",
      "buyTab": "チケットを買う",
      "buy1": "希望のイベントを探す",
      "buy2": "検証済みチケットを選択",
      "buy3": "エスクローで安全にお支払い",
      "buy4": "公演当日まで安心サポート",
      "sellTab": "チケットを売る",
      "sell1": "不要になったチケットを出品",
      "sell2": "証明書類を提出し検証を受ける",
      "sell3": "購入者と取引が成立",
      "sell4": "無事入場後に売上金をお受け取り"
    },
    "venueSupportSection": {
      "headline": "会場ゲートでお困りですか？現地にスタッフがいます。",
      "copy": "対象公演では、入場時にトラブルが発生しても孤立しないよう、Tikum現地PICスタッフが会場で待機しています。",
      "cta": "対象イベント一覧を見る"
    },
    "sellerSection": {
      "headline": "行けなくなったチケットを、安心・確実に。",
      "copy": "シンプルな出品、透明な手数料、本人確認、確実な送金フロー。",
      "cta": "今すぐ出品する"
    },
    "principles": {
      "headline": "信頼の上に構築。人が支えるマーケット。",
      "p1Title": "徹底した二次検証",
      "p1Desc": "すべての出品に対して厳正な確認を実施します。",
      "p2Title": "エスクローによる資金保護",
      "p2Desc": "入場が完了するまで代金の引き渡しは保留されます。",
      "p3Title": "会場現地オペレーション",
      "p3Desc": "主要公演のゲートにリアルな運営スタッフを派遣します。"
    },
    "footer": {
      "product": "プロダクト",
      "company": "企業情報",
      "trust": "安全と信頼",
      "legal": "法的規約",
      "events": "イベント一覧",
      "sell": "チケット出品",
      "how": "ご利用の流れ",
      "supported": "サポート対象イベント",
      "about": "会社概要",
      "contact": "お問い合わせ",
      "venuePIC": "会場サポート",
      "buyerProt": "購入者保護",
      "sellerProt": "出品者保護",
      "verifInfo": "検証体制について",
      "refund": "返金ポリシー",
      "terms": "利用規約",
      "privacy": "プライバシーポリシー",
      "cookie": "Cookie ポリシー",
      "disclaimer": "免責事項"
    },
    "status": {
      "LISTED": "出品中",
      "LOCKED": "取引中",
      "SOLD": "売約済み",
      "RESERVED": "予約済み",
      "PENDING_PAYMENT": "支払い待ち",
      "PAID": "エスクロー預託済み",
      "ENTRY_CONFIRMED": "入場完了確認",
      "SETTLED": "決済精算済み",
      "DISPUTED": "ゲート照会調査中",
      "REFUNDED": "返金完了",
      "CANCELLED": "キャンセル",
      "PENDING": "確認待ち",
      "ACCEPTED": "承諾",
      "REJECTED": "却下",
      "COUNTERED": "対抗提案中",
      "EXPIRED": "期限切れ"
    },
    "common": {
      "loading": "読み込み中...",
      "searchPlaceholder": "アーティスト、イベント、会場名で検索...",
      "filter": "絞り込み",
      "allCities": "すべての都市",
      "allCategories": "全カテゴリー",
      "fromPrice": "最安値",
      "viewTickets": "チケットを見る",
      "details": "詳細",
      "officialTickets": "公式プレイガイド",
      "noResults": "条件に一致する検証済みイベントは見つかりませんでした。"
    },
    "venuePicSection": {
      "kicker": "TIKUMの独自価値",
      "headline": "会場でお困りですか？現地スタッフが待機しています。",
      "desc": "TIKUM現地担当者（PIC）が会場周辺に常駐し、リストバンド交換や入場ゲート通過を直接サポートします。公演当日に一人で立ち往生することはありません。",
      "badgeCoord": "現地コーディネーター",
      "badgeTurnstile": "入場ゲートサポート",
      "badgeDispute": "ゲート問題の迅速対応"
    },
    "trustArchitectureSection": {
      "kicker": "安全の基盤",
      "title": "TIKUM トラスト・アーキテクチャ",
      "lead": "二次流通チケットの不正を低減する3つの運用ピラー。",
      "card1Title": "検証済み出品者シグナル",
      "card1Desc": "出品者は身元確認、取引履歴、過去の完了実績を通過した後にのみ掲載されます。",
      "card2Title": "入場確認までエスクロー保護",
      "card2Desc": "購入者の代金は内部エスクローで保管され、ゲート入場が完了した後にのみ出品者へ支払われます。",
      "card3Title": "二重出品・空売りの防止",
      "card3Desc": "元帳管理と改ざん不可能な監査ログにより、同一バーコードの二重取引を遮断します。"
    },
    "howItWorksSection": {
      "kicker": "安全な取引フロー",
      "title": "TIKUMの仕組み",
      "lead": "出品から会場ゲートまで、購入者と出品者の双方を守る透明なプロセス。",
      "buyerColTitle": "購入者向け",
      "buyerStep1": "検証済みイベント＆チケットを検索",
      "buyerStep1Desc": "明瞭な価格表示で、追加の不当な手数料なしにチケットを選択。",
      "buyerStep2": "エスクローによる安全な支払い",
      "buyerStep2Desc": "支払代金はエスクローに保管され、入場前に出品者に直接渡ることはありません。",
      "buyerStep3": "公式チケット・引換コードの受取",
      "buyerStep3Desc": "正規Eチケットまたはリストバンド引換証と検証コードを受領。",
      "buyerStep4": "現地スタッフ支援でスムーズに入場",
      "buyerStep4Desc": "ゲートで提示。バーコード読み取りエラー等があれば現地PICが対応します。",
      "sellerColTitle": "出品者向け",
      "sellerStep1": "初期費用ゼロで出品",
      "sellerStep1Desc": "チケット詳細、購入証明、適正な希望価格を入力。",
      "sellerStep2": "システムと目視による二重検証",
      "sellerStep2Desc": "チケットの正当性とバーコード重複がないことを確認後に掲載開始。",
      "sellerStep3": "購入時の即時通知",
      "sellerStep3Desc": "購入者が確定しエスクロー入金が行われた時点で即座に通知。",
      "sellerStep4": "イベント終了後の自動精算",
      "sellerStep4Desc": "購入者の入場確認後、売上金がご指定の銀行口座へ送金されます。"
    },
    "sellerExperienceSection": {
      "kicker": "出品者向けガイド",
      "headline": "行けなくなったチケットをお持ちですか？",
      "desc": "初期費用なしで簡単出品。適正価格でファンに届け、イベント終了後に安全に売上金を受け取れます。",
      "cta": "チケットを出品する"
    },
    "faqPreviewSection": {
      "kicker": "よくあるご質問",
      "title": "よくあるご質問 (FAQ)",
      "lead": "取引の流れ、エスクロー保護、会場スタッフの役割についての解説。",
      "q1": "チケット詐欺をどのように防いでいますか？",
      "a1": "チケット所有権の検証、ゲート入場までの代金保留（エスクロー）、会場現地PICの配置を組み合わせています。",
      "q2": "出品者への入金はいつ行われますか？",
      "a2": "代金はエスクローで保持され、購入者がゲートから無事入場した確認後に精算されます。",
      "q3": "会場PICの役割は何ですか？",
      "a3": "リストバンド交換の案内や、万一のバーコード読み取りトラブル時の迅速なエスカレーションを担います。",
      "q4": "ゲートでチケットに不具合があった場合は？",
      "a4": "現地PICまたは異議申立機能で直ちに報告可能です。無効が確認された場合は返金ポリシーに基づき全額返金されます。",
      "viewAll": "すべてのFAQ・ヘルプを見る"
    },
    "finalCtaSection": {
      "kicker": "取引を始める",
      "title": "お気に入りのイベントに参加しませんか？",
      "lead": "保護された二次流通プラットフォームで、安心のチケット体験をお届けします。",
      "ctaFind": "今すぐチケットを探す",
      "ctaSell": "チケットを出品する"
    }
  },
  "ko": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Verified Resale. Real Support.",
      "slogan": "믿을 수 있는 티켓 리셀, 현장 지원까지.",
      "copy": "검증된 리스팅, 에스크로 보호 거래, 그리고 필요한 순간 현장에서 제공되는 실제 인력 지원.",
      "venueSupport": "현장에서 함께하는 실제 담당자.",
      "copyright": "© 2026 Tikum — by Shinerva. All rights reserved."
    },
    "meta": {
      "title": "Tikum — 검증된 리셀 · 현장 전담 지원 | by Shinerva",
      "description": "검증된 2차 티켓 마켓플레이스. 내부 에스크로 인프라 보호 및 공연장 현장 전담 지원."
    },
    "nav": {
      "events": "전체 공연",
      "concerts": "콘서트",
      "sports": "스포츠",
      "festivals": "페스티벌",
      "theater": "뮤지컬·연극",
      "comedy": "코미디·쇼",
      "howItWorks": "이용 안내",
      "search": "검색",
      "sellTicket": "티켓 판매",
      "myOrders": "내 주문",
      "myTickets": "내 티켓",
      "support": "고객지원",
      "account": "계정",
      "signIn": "로그인 / 회원가입",
      "findTickets": "티켓 찾기"
    },
    "hero": {
      "headline": "안심 2차 티켓 거래. 사기 방지 보장.",
      "subhead": "검증된 티켓 등록, 에스크로 거래 보호, 공연장 현장 운영 지원을 제공하는 2차 티켓 마켓플레이스.",
      "ctaFind": "티켓 찾기",
      "ctaSell": "티켓 판매하기",
      "featuredBadge": "공식 발표 · 검증 완료"
    },
    "trust": {
      "verified": "검증된 리스팅",
      "verifiedDesc": "모든 티켓은 명확한 인증 및 검증 절차를 거칩니다.",
      "protected": "안전한 에스크로 거래",
      "protectedDesc": "결제 대금은 안전한 내부 에스크로 시스템에 보호되며 입장 확인 후 정산됩니다.",
      "venue": "공연장 현장 지원",
      "venueDesc": "지원 대상 공연의 경우 공연장 게이트 인근에 Tikum 전담 현장 담당자(PIC)가 상주합니다.",
      "pricing": "투명한 가격 정찰제",
      "pricingDesc": "티켓 가격, 수수료, 세금을 명확하게 표기하여 숨은 추가 비용이 없습니다.",
      "pillarVerified": "검증된 티켓 리스팅",
      "pillarVenue": "공연장 현장 지원",
      "pillarProtected": "에스크로 안전 거래",
      "pillarPricing": "투명한 정가 정책"
    },
    "trustStates": {
      "VERIFIED": "검증된 리스팅",
      "SUPPORT_AVAILABLE": "공연장 현장 지원 가능",
      "REMOTE_SUPPORT": "원격 전담 지원",
      "PENDING": "검증 심사 중",
      "UNAVAILABLE": "현장 지원 미제공"
    },
    "operations": {
      "headline": "단순한 마켓플레이스를 넘어, 현장에서 힘이 됩니다.",
      "subhead": "티켓 등록부터 공연장 입장까지 투명한 운영 흐름.",
      "step1Title": "티켓 등록",
      "step1Desc": "판매자가 티켓 정보와 예매 증빙을 입력합니다.",
      "step2Title": "철저한 검증",
      "step2Desc": "시스템과 검증팀이 티켓의 유효성을 정밀 심사합니다.",
      "step3Title": "에스크로 보호 구매",
      "step3Desc": "구매 대금은 안전하게 보관되어 구매자를 보호합니다.",
      "step4Title": "공연 당일",
      "step4Desc": "구매자는 검증된 티켓 정보를 지참하고 공연장으로 이동합니다.",
      "step5Title": "현장 지원",
      "step5Desc": "게이트 입장 문제 발생 시 현장 PIC가 직접 도움을 제공합니다.",
      "humanEscalation": "실제 담당자 즉시 대응",
      "humanEscalationDesc": "단순 챗봇의 반복 답변이 아닌 실제 운영팀이 직접 소통하여 해결합니다."
    },
    "howItWorks": {
      "title": "Tikum 이용 방법",
      "buyTab": "티켓 구매하기",
      "buy1": "원하는 공연을 검색하세요",
      "buy2": "검증된 리스팅을 선택하세요",
      "buy3": "에스크로로 안전하게 결제하세요",
      "buy4": "공연 당일까지 안심 지원을 받으세요",
      "sellTab": "티켓 판매하기",
      "sell1": "남는 티켓을 간편하게 등록하세요",
      "sell2": "간단한 검증 절차를 완료하세요",
      "sell3": "실제 구매자와 안전하게 매칭됩니다",
      "sell4": "구매자 입장 확인 후 정산금을 수령하세요"
    },
    "venueSupportSection": {
      "headline": "공연장 게이트에서 도움이 필요하신가요? 현장에 저희가 있습니다.",
      "copy": "지원 대상 이벤트의 경우 공연장 현장에 전담 인력을 배치하여 입장 오류나 문제 발생 시 관람객을 홀로 두지 않습니다.",
      "cta": "지원 공연 목록 확인"
    },
    "sellerSection": {
      "headline": "사용하지 못하는 티켓을 안전하게 현금화하세요.",
      "copy": "간편 등록, 투명한 수수료, 본인 확인, 안전한 정산 프로세스.",
      "cta": "지금 티켓 판매하기"
    },
    "principles": {
      "headline": "신뢰로 시작하여 사람이 완성하는 경험.",
      "p1Title": "엄격한 2차 검증",
      "p1Desc": "모든 티켓은 등록 전 엄격한 사전 확인을 거칩니다.",
      "p2Title": "에스크로 보호망",
      "p2Desc": "정상적인 공연장 입장 확인 후에만 판매 대금이 정산됩니다.",
      "p3Title": "현장 실물 지원 인력",
      "p3Desc": "주요 콘서트 게이트에 실무진을 직접 배치합니다."
    },
    "footer": {
      "product": "서비스",
      "company": "회사 정보",
      "trust": "신뢰 및 안전",
      "legal": "법적 고지",
      "events": "공연 일정",
      "sell": "티켓 판매",
      "how": "이용 방법",
      "supported": "지원 대상 공연",
      "about": "회사 소개",
      "contact": "고객센터",
      "venuePIC": "현장 지원 안내",
      "buyerProt": "구매자 보호",
      "sellerProt": "판매자 보호",
      "verifInfo": "티켓 검증 기준",
      "refund": "환불 규정",
      "terms": "이용약관",
      "privacy": "개인정보처리방침",
      "cookie": "쿠키 정책",
      "disclaimer": "책임의 한계"
    },
    "status": {
      "LISTED": "판매 중",
      "LOCKED": "거래 진행 중",
      "SOLD": "판매 완료",
      "RESERVED": "예약 완료",
      "PENDING_PAYMENT": "결제 대기",
      "PAID": "에스크로 보관 완료",
      "ENTRY_CONFIRMED": "입장 완료 확인",
      "SETTLED": "정산 완료",
      "DISPUTED": "게이트 확인 중",
      "REFUNDED": "환불 완료",
      "CANCELLED": "취소됨",
      "PENDING": "응답 대기",
      "ACCEPTED": "수락됨",
      "REJECTED": "거절됨",
      "COUNTERED": "역제안 진행 중",
      "EXPIRED": "만료됨"
    },
    "common": {
      "loading": "불러오는 중...",
      "searchPlaceholder": "아티스트, 공연, 공연장 검색...",
      "filter": "필터",
      "allCities": "전체 도시",
      "allCategories": "전체 카테고리",
      "fromPrice": "최저가",
      "viewTickets": "티켓 보기",
      "details": "상세 정보",
      "officialTickets": "공식 예매처",
      "noResults": "조건에 맞는 검증된 공연을 찾을 수 없습니다."
    },
    "venuePicSection": {
      "kicker": "TIKUM 핵심 차별점",
      "headline": "공연장에서 도움이 필요하신가요? 현장에 전담 팀이 있습니다.",
      "desc": "TIKUM 현장 코디네이터(PIC)가 공연장 주변과 입장 게이트에 상주하여 팔찌 교환 및 턴스타일 입장을 안내합니다. 공연 당일 문제 발생 시 혼자 방치되지 않습니다.",
      "badgeCoord": "현장 전담 코디네이터",
      "badgeTurnstile": "입장 게이트 현장 지원",
      "badgeDispute": "신속한 현장 분쟁 해결"
    },
    "trustArchitectureSection": {
      "kicker": "신뢰 기반",
      "title": "TIKUM 신뢰 아키텍처",
      "lead": "티켓 사기 위험을 최소화하기 위해 구축된 3가지 실질적 운영 축.",
      "card1Title": "검증된 판매자 시그널",
      "card1Desc": "모든 판매자는 신원 확인, 거래 이력, 정산 실적을 검증받은 후 리스팅을 등록합니다.",
      "card2Title": "입장 확인 시까지 에스크로 보호",
      "card2Desc": "구매자의 결제 대금은 안전하게 에스크로에 보관되며, 입장 확인 후에만 판매자에게 정산됩니다.",
      "card3Title": "중복 티켓 거래 차단",
      "card3Desc": "원장 시스템과 변경 불가능한 감사 로그로 동일 바코드의 중복 등록 및 거래를 차단합니다."
    },
    "howItWorksSection": {
      "kicker": "안전한 거래 절차",
      "title": "TIKUM 마켓플레이스 이용 안내",
      "lead": "티켓 등록부터 현장 입장까지 구매자와 판매자를 안전하게 보호하는 프로세스.",
      "buyerColTitle": "구매자 안내",
      "buyerStep1": "검증된 이벤트 및 티켓 탐색",
      "buyerStep1Desc": "숨겨진 추가 비용 없이 투명한 가격으로 검증된 티켓을 선택하세요.",
      "buyerStep2": "에스크로 안전 결제",
      "buyerStep2Desc": "결제 대금은 안전하게 에스크로에 보관되며, 판매자에게 사전에 임의 지급되지 않습니다.",
      "buyerStep3": "공식 티켓 및 입장 코드 수령",
      "buyerStep3Desc": "공식 전자티켓 또는 팔찌 교환권과 턴스타일 인증 코드를 전달받습니다.",
      "buyerStep4": "현장 지원과 함께 편안한 입장",
      "buyerStep4Desc": "게이트에서 티켓을 스캔하세요. 바코드 오류 시 현장 PIC가 즉시 지원합니다.",
      "sellerColTitle": "판매자 안내",
      "sellerStep1": "사전 비용 없는 무료 등록",
      "sellerStep1Desc": "티켓 정보, 구매 증빙, 합리적인 희망 가격을 입력하세요.",
      "sellerStep2": "시스템 및 실물 정밀 검증",
      "sellerStep2Desc": "티켓 유효성과 바코드 중복 여부를 철저히 검증한 후 리스팅이 활성화됩니다.",
      "sellerStep3": "티켓 판매 시 실시간 알림",
      "sellerStep3Desc": "구매자가 결제를 완료하고 대금이 에스크로에 입금되면 즉시 알림을 받습니다.",
      "sellerStep4": "행사 종료 후 자동 정산",
      "sellerStep4Desc": "구매자의 성공적인 게이트 입장이 확인되면 지정된 계좌로 정산금이 입금됩니다."
    },
    "sellerExperienceSection": {
      "kicker": "판매자 경험",
      "headline": "참석하지 못하는 티켓이 있으신가요?",
      "desc": "초기 비용 없이 무료로 등록하세요. 합리적인 가격에 팬을 찾고 행사 후 안전하게 정산받으세요.",
      "cta": "티켓 등록하기"
    },
    "faqPreviewSection": {
      "kicker": "자주 묻는 질문",
      "title": "자주 묻는 질문 (FAQ)",
      "lead": "거래 방식, 에스크로 안전 보호, 현장 담당자 지원에 대한 투명한 안내.",
      "q1": "TIKUM은 티켓 사기를 어떻게 방지하나요?",
      "a1": "티켓 소유 증빙 확인, 게이트 입장 시까지 에스크로 대금 보관, 공연장 현장 전담 인력 운영을 결합합니다.",
      "q2": "판매자는 언제 대금을 정산받나요?",
      "a2": "대금은 에스크로에 보관되며, 구매자가 게이트 턴스타일을 성공적으로 통과한 후 지급됩니다.",
      "q3": "현장 PIC 담당자의 역할은 무엇인가요?",
      "a3": "팔찌 수령 지원 및 티켓 바코드 인식 오류 발생 시 현장에서 신속히 문제를 확인하고 조치합니다.",
      "q4": "게이트에서 티켓 문제가 발생하면 어떻게 되나요?",
      "a4": "현장 PIC 또는 분쟁 접수를 통해 즉시 보고할 수 있습니다. 유효하지 않은 티켓으로 확인되면 환불 정책에 따라 전액 환불됩니다.",
      "viewAll": "전체 FAQ 및 도움말 보기"
    },
    "finalCtaSection": {
      "kicker": "안전한 티켓 거래",
      "title": "원하는 공연을 관람할 준비가 되셨나요?",
      "lead": "보호받는 2차 티켓 플랫폼에서 안심하고 티켓을 거래하세요.",
      "ctaFind": "티켓 찾기",
      "ctaSell": "티켓 판매하기"
    }
  },
  "es": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Entradas de reventa. Diseñado para reducir el fraude.",
      "slogan": "Compra entradas de reventa con total confianza.",
      "copy": "Un marketplace seguro de entradas de reventa diseñado con verificación estricta, transacciones protegidas por custodia y asistencia presencial en el recinto.",
      "venueSupport": "Personas reales en el recinto.",
      "copyright": "© 2026 Tikum — by Shinerva. Todos los derechos reservados."
    },
    "meta": {
      "title": "Tikum — Entradas de reventa. Diseñado para reducir el fraude. | by Shinerva",
      "description": "Marketplace de entradas de reventa de confianza, diseñado para reducir el fraude mediante vendedores verificados, custodia de fondos y coordinadores en el recinto."
    },
    "nav": {
      "events": "Eventos",
      "concerts": "Conciertos",
      "sports": "Deportes",
      "festivals": "Festivales",
      "theater": "Teatro",
      "comedy": "Comedia",
      "howItWorks": "Cómo Funciona",
      "search": "Buscar",
      "sellTicket": "Vender Entrada",
      "myOrders": "Mis Pedidos",
      "myTickets": "Mis Entradas",
      "support": "Soporte",
      "account": "Cuenta",
      "signIn": "Iniciar Sesión / Registro",
      "findTickets": "Buscar Entradas"
    },
    "hero": {
      "headline": "Entradas de Reventa. Diseñado para Reducir el Fraude.",
      "subhead": "Mercado de entradas secundarias con verificación, transacciones protegidas y soporte presencial en el evento.",
      "ctaFind": "Buscar Entradas",
      "ctaSell": "Vender Entrada",
      "featuredBadge": "ANUNCIO OFICIAL VERIFICADO"
    },
    "trust": {
      "verified": "Listados Verificados",
      "verifiedDesc": "Cada entrada pasa por controles definidos de autenticidad.",
      "protected": "Transacciones Protegidas",
      "protectedDesc": "El pago se custodia de forma segura hasta confirmar la entrada al evento.",
      "venue": "Soporte Presencial en Venue",
      "venueDesc": "Para eventos seleccionados, Tikum cuenta con personal de soporte en el recinto.",
      "pricing": "Precios Transparentes",
      "pricingDesc": "Desglose claro de precio base, tasas e impuestos sin cargos ocultos.",
      "pillarVerified": "Publicaciones Verificadas",
      "pillarVenue": "Soporte Presencial PIC",
      "pillarProtected": "Transacciones con Garantía",
      "pillarPricing": "Precios Transparentes"
    },
    "trustStates": {
      "VERIFIED": "Listado Verificado",
      "SUPPORT_AVAILABLE": "Soporte en Venue Disponible",
      "REMOTE_SUPPORT": "Soporte Remoto Disponible",
      "PENDING": "Verificación Pendiente",
      "UNAVAILABLE": "Soporte No Disponible"
    },
    "operations": {
      "headline": "Más que un Marketplace. Estamos allí cuando nos necesitas.",
      "subhead": "Un flujo operativo transparente desde la publicación hasta la puerta del evento.",
      "step1Title": "Publicación",
      "step1Desc": "El vendedor ingresa los datos y comprobantes de la entrada.",
      "step2Title": "Verificación",
      "step2Desc": "Controles automatizados y humanos comprueban la validez del ticket.",
      "step3Title": "Compra Protegida",
      "step3Desc": "Los fondos del comprador quedan retenidos en custodia segura (escrow).",
      "step4Title": "Día del Evento",
      "step4Desc": "El comprador acude al recinto con sus credenciales verificadas.",
      "step5Title": "Soporte en Venue",
      "step5Desc": "Un coordinador de Tikum asiste en el lugar si surge un imprevisto en el torno.",
      "humanEscalation": "Escalación Humana Real",
      "humanEscalationDesc": "Si algo sale mal, no quedas atrapado en un chatbot sin salida."
    },
    "howItWorks": {
      "title": "Cómo Funciona Tikum",
      "buyTab": "Comprar Entradas",
      "buy1": "Encuentra tu evento",
      "buy2": "Elige una publicación verificada",
      "buy3": "Paga de forma segura con custodia",
      "buy4": "Recibe soporte hasta el día del evento",
      "sellTab": "Vender Entradas",
      "sell1": "Publica tu entrada no utilizada",
      "sell2": "Verifica tu publicación",
      "sell3": "Conéctate con un comprador",
      "sell4": "Recibe el pago tras el acceso al evento"
    },
    "venueSupportSection": {
      "headline": "¿Necesitas ayuda en el recinto? Tenemos personas allí.",
      "copy": "Para eventos compatibles, Tikum proporciona un coordinador local en el lugar para que los compradores nunca queden desamparados ante problemas en el acceso.",
      "cta": "Ver Eventos con Soporte"
    },
    "sellerSection": {
      "headline": "Convierte una entrada no utilizada en dinero.",
      "copy": "Publicación sencilla, precios transparentes, verificación de identidad, comunicación directa y liquidación segura.",
      "cta": "Vender Entrada"
    },
    "principles": {
      "headline": "Construido sobre la Confianza. Respaldado por Personas Reales.",
      "p1Title": "Reventa Secundaria Verificada",
      "p1Desc": "Cada entrada se revisa metódicamente antes de ser ofrecida.",
      "p2Title": "Carril de Custodia Protegido",
      "p2Desc": "El vendedor cobra únicamente tras el acceso exitoso del asistente.",
      "p3Title": "Presencia Física en el Recinto",
      "p3Desc": "Personal desplegado en los accesos para resolver incidencias."
    },
    "footer": {
      "product": "Producto",
      "company": "Empresa",
      "trust": "Seguridad y Confianza",
      "legal": "Legal",
      "events": "Eventos",
      "sell": "Vender Entradas",
      "how": "Cómo Funciona",
      "supported": "Eventos con Soporte",
      "about": "Sobre Nosotros",
      "contact": "Contacto",
      "venuePIC": "Soporte en Venue",
      "buyerProt": "Protección al Comprador",
      "sellerProt": "Protección al Vendedor",
      "verifInfo": "Verificación",
      "refund": "Política de Reembolso",
      "terms": "Términos y Condiciones",
      "privacy": "Política de Privacidad",
      "cookie": "Política de Cookies",
      "disclaimer": "Aviso Legal"
    },
    "status": {
      "LISTED": "Disponible",
      "LOCKED": "En Transacción",
      "SOLD": "Vendida",
      "RESERVED": "Reservada",
      "PENDING_PAYMENT": "Pendiente de Pago",
      "PAID": "Custodia Asegurada",
      "ENTRY_CONFIRMED": "Entrada Confirmada",
      "SETTLED": "Liquidado y Pagado",
      "DISPUTED": "En Investigación en Acceso",
      "REFUNDED": "Reembolsado",
      "CANCELLED": "Cancelado",
      "PENDING": "Pendiente",
      "ACCEPTED": "Aceptado",
      "REJECTED": "Rechazado",
      "COUNTERED": "Contraoferta",
      "EXPIRED": "Expirado"
    },
    "common": {
      "loading": "Cargando datos...",
      "searchPlaceholder": "Buscar artista, evento o recinto...",
      "filter": "Filtrar",
      "allCities": "Todas las Ciudades",
      "allCategories": "Todas las Categorías",
      "fromPrice": "Desde",
      "viewTickets": "Ver Entradas",
      "details": "Detalles",
      "officialTickets": "Entradas Oficiales",
      "noResults": "No se encontraron eventos verificados con tu búsqueda."
    },
    "venuePicSection": {
      "kicker": "Diferencial Clave TIKUM",
      "headline": "¿Necesitas ayuda en el recinto? Tenemos equipo en el lugar.",
      "desc": "Los coordinadores de campo (PIC) de TIKUM están presentes en las inmediaciones del recinto para asistir en el canje de pulseras y torniquetes de acceso.",
      "badgeCoord": "Coordinador en el Sitio",
      "badgeTurnstile": "Asistencia en Torniquete",
      "badgeDispute": "Resolución Rápida en Puerta"
    },
    "trustArchitectureSection": {
      "kicker": "Base de Protección",
      "title": "Arquitectura de Confianza TIKUM",
      "lead": "Tres pilares operativos para reducir el fraude en entradas de reventa.",
      "card1Title": "Señales de Vendedor Verificado",
      "card1Desc": "Cada vendedor pasa por controles de identidad, historial de transacciones y cumplimiento previo.",
      "card2Title": "Fondo en Garantía (Escrow) hasta el Acceso",
      "card2Desc": "Los fondos del comprador están protegidos en depósito y solo se liberan tras el acceso confirmado.",
      "card3Title": "Prevención de Entradas Duplicadas",
      "card3Desc": "El libro mayor y registro inmutable impiden que el mismo código se publique o venda dos veces."
    },
    "howItWorksSection": {
      "kicker": "Flujo Seguro",
      "title": "Cómo Funciona TIKUM",
      "lead": "Un proceso transparente que protege a compradores y vendedores de principio a fin.",
      "buyerColTitle": "Para Compradores",
      "buyerStep1": "Busca Eventos y Entradas Verificadas",
      "buyerStep1Desc": "Elige entradas de reventa con precios transparentes y sin recargos sorpresa al pagar.",
      "buyerStep2": "Pago Protegido vía Escrow",
      "buyerStep2Desc": "Tus fondos quedan retenidos en garantía interna y no se entregan al vendedor por adelantado.",
      "buyerStep3": "Recibe Entrada Oficial y Código",
      "buyerStep3Desc": "Obtén la entrada digital o instrucciones de retiro junto con tu validación de acceso.",
      "buyerStep4": "Ingresa con Soporte en Recinto",
      "buyerStep4Desc": "Presenta tu entrada. Si surge algún fallo de lectura, nuestro personal PIC te asiste.",
      "sellerColTitle": "Para Vendedores",
      "sellerStep1": "Publica Gratis sin Costos Iniciales",
      "sellerStep1Desc": "Introduce los datos de la entrada, comprobante de compra y un precio justo.",
      "sellerStep2": "Verificación Automática y Manual",
      "sellerStep2Desc": "Validamos la autenticidad e impedimos duplicidades antes de activar el anuncio.",
      "sellerStep3": "Aviso Inmediato al Vender",
      "sellerStep3Desc": "Recibe notificación al instante cuando un comprador reserva y abona en escrow.",
      "sellerStep4": "Liquidación Automática Post-Evento",
      "sellerStep4Desc": "Tras confirmar el acceso del comprador, los fondos se transfieren a tu cuenta bancaria."
    },
    "sellerExperienceSection": {
      "kicker": "Experiencia del Vendedor",
      "headline": "¿Tienes entradas que no podrás usar?",
      "desc": "Publica gratis sin costos iniciales. Conecta con compradores y recibe el dinero en tu cuenta bancaria tras el evento.",
      "cta": "Publicar Entrada"
    },
    "faqPreviewSection": {
      "kicker": "Preguntas Frecuentes",
      "title": "Preguntas Frecuentes (FAQ)",
      "lead": "Respuestas claras sobre pagos protegidos, garantía y soporte en vivo.",
      "q1": "¿Cómo reduce TIKUM el fraude en entradas?",
      "a1": "Combinamos verificación documental, retención de fondos en escrow hasta el ingreso y soporte de personal en el evento.",
      "q2": "¿Cuándo recibe el pago el vendedor?",
      "a2": "El dinero se custodia en garantía y se libera únicamente tras confirmarse el ingreso efectivo al recinto.",
      "q3": "¿Cuál es el rol del personal PIC en el recinto?",
      "a3": "Asistir en el canje de pulseras y brindar mediación inmediata si el código de la entrada presenta problemas en el torno.",
      "q4": "¿Qué ocurre si una entrada falla en el acceso?",
      "a4": "Puedes reportarlo al PIC o al sistema de disputas. Si la entrada resulta inválida, se efectúa el reembolso conforme a la política.",
      "viewAll": "Ver todas las preguntas y guías de ayuda"
    },
    "finalCtaSection": {
      "kicker": "Empieza con Confianza",
      "title": "¿Listo para asistir a tu evento favorito?",
      "lead": "Únete a miles de aficionados en un mercado secundario seguro y transparente.",
      "ctaFind": "Buscar Entradas Ahora",
      "ctaSell": "Vender tus Entradas"
    }
  },
  "pt-BR": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Verified Resale. Real Support.",
      "slogan": "Compre Ingressos de Revenda com Confiança.",
      "copy": "Anúncios verificados, transações protegidas e suporte presencial quando você precisar.",
      "venueSupport": "Pessoas reais. No local do evento.",
      "copyright": "© 2026 Tikum — by Shinerva. Todos os direitos reservados."
    },
    "meta": {
      "title": "Tikum — Revenda Verificada · Suporte Real no Local | by Shinerva",
      "description": "Marketplace de revenda de ingressos verificado. Protegido por custódia (escrow) e suporte presencial no local do evento."
    },
    "nav": {
      "events": "Eventos",
      "concerts": "Shows",
      "sports": "Esportes",
      "festivals": "Festivais",
      "theater": "Teatro",
      "comedy": "Comédia",
      "howItWorks": "Como Funciona",
      "search": "Buscar",
      "sellTicket": "Vender Ingresso",
      "myOrders": "Meus Pedidos",
      "myTickets": "Meus Ingressos",
      "support": "Suporte",
      "account": "Conta",
      "signIn": "Entrar / Cadastrar",
      "findTickets": "Encontrar Ingressos"
    },
    "hero": {
      "headline": "Ingressos de Revenda. Desenvolvido para Reduzir Fraudes.",
      "subhead": "Marketplace de ingressos secundários com listagens verificadas, transações protegidas e suporte presencial no evento.",
      "ctaFind": "Encontrar Ingressos",
      "ctaSell": "Vender Ingresso",
      "featuredBadge": "ANÚNCIO OFICIAL EM DESTAQUE"
    },
    "trust": {
      "verified": "Anúncios Verificados",
      "verifiedDesc": "Todos os ingressos passam por rigoroso controle de autenticidade.",
      "protected": "Transações Protegidas",
      "protectedDesc": "Pagamentos retidos com segurança em garantia (escrow) até a entrada confirmada.",
      "venue": "Suporte no Local do Evento",
      "venueDesc": "Para eventos selecionados, disponibilizamos equipe de apoio presencial nos portões.",
      "pricing": "Preço Transparente",
      "pricingDesc": "Detalhamento explícito de ingressos, taxas e impostos sem cobranças ocultas.",
      "pillarVerified": "Anúncios Verificados",
      "pillarVenue": "Suporte Presencial PIC",
      "pillarProtected": "Transações Protegidas (Escrow)",
      "pillarPricing": "Preços Claros e Transparentes"
    },
    "trustStates": {
      "VERIFIED": "Anúncio Verificado",
      "SUPPORT_AVAILABLE": "Suporte no Local Disponível",
      "REMOTE_SUPPORT": "Suporte Remoto Disponível",
      "PENDING": "Verificação Pendente",
      "UNAVAILABLE": "Suporte Indisponível"
    },
    "operations": {
      "headline": "Mais que um Marketplace. Estamos lá quando você precisa.",
      "subhead": "Fluxo operacional transparente desde o anúncio até a entrada no show.",
      "step1Title": "Anúncio",
      "step1Desc": "O vendedor envia as informações e comprovantes do ingresso.",
      "step2Title": "Verificação",
      "step2Desc": "Checagem rigorosa de autenticidade e regras do ingresso.",
      "step3Title": "Compra Protegida",
      "step3Desc": "O valor pago fica retido em custódia segura até o evento.",
      "step4Title": "Dia do Evento",
      "step4Desc": "O comprador chega ao local com as credenciais validadas.",
      "step5Title": "Suporte Presencial",
      "step5Desc": "Equipe Tikum à disposição nos portões caso ocorra algum problema na catraca.",
      "humanEscalation": "Atendimento Humano Direto",
      "humanEscalationDesc": "Quando algo dá errado, você fala com pessoas de verdade, sem ficar preso em chatbots."
    },
    "howItWorks": {
      "title": "Como Funciona a Tikum",
      "buyTab": "Comprar Ingressos",
      "buy1": "Encontre o seu evento",
      "buy2": "Escolha um anúncio verificado",
      "buy3": "Pague com segurança via garantia",
      "buy4": "Conte com suporte até o dia do evento",
      "sellTab": "Vender Ingressos",
      "sell1": "Cadastre o ingresso que não vai usar",
      "sell2": "Complete a verificação do anúncio",
      "sell3": "Conecte-se com um comprador",
      "sell4": "Receba o pagamento após o evento"
    },
    "venueSupportSection": {
      "headline": "Precisa de ajuda no local? Nós estamos lá.",
      "copy": "Para eventos selecionados, a Tikum mantém um coordenador no local para que os fãs nunca fiquem desamparados caso haja problemas na entrada.",
      "cta": "Ver Eventos Suportados"
    },
    "sellerSection": {
      "headline": "Transforme ingressos parados em dinheiro.",
      "copy": "Cadastro simples, tarifas claras, verificação de identidade, comunicação direta e repasse seguro.",
      "cta": "Vender Meu Ingresso"
    },
    "principles": {
      "headline": "Baseado na Confiança. Apoiado por Pessoas Reais.",
      "p1Title": "Revenda Verificada",
      "p1Desc": "Análise minuciosa de cada ingresso antes de ser ofertado.",
      "p2Title": "Custódia em Garantia",
      "p2Desc": "O vendedor só recebe após a entrada confirmada no local.",
      "p3Title": "Apoio Presencial no Portão",
      "p3Desc": "Equipe no local para resolver quaisquer atritos de entrada."
    },
    "footer": {
      "product": "Produto",
      "company": "Empresa",
      "trust": "Segurança e Confiança",
      "legal": "Jurídico",
      "events": "Eventos",
      "sell": "Vender Ingressos",
      "how": "Como Funciona",
      "supported": "Eventos Suportados",
      "about": "Sobre Nós",
      "contact": "Contato",
      "venuePIC": "Suporte Presencial",
      "buyerProt": "Proteção ao Comprador",
      "sellerProt": "Proteção ao Vendedor",
      "verifInfo": "Verificação",
      "refund": "Política de Reembolso",
      "terms": "Termos de Serviço",
      "privacy": "Política de Privacidade",
      "cookie": "Política de Cookies",
      "disclaimer": "Aviso Legal"
    },
    "status": {
      "LISTED": "Disponível",
      "LOCKED": "Em Transação",
      "SOLD": "Vendido",
      "RESERVED": "Reservado",
      "PENDING_PAYMENT": "Aguardando Pagamento",
      "PAID": "Garantia Assegurada",
      "ENTRY_CONFIRMED": "Entrada Confirmada",
      "SETTLED": "Liquidado e Pago",
      "DISPUTED": "Em Investigação no Portão",
      "REFUNDED": "Reembolsado",
      "CANCELLED": "Cancelado",
      "PENDING": "Pendente",
      "ACCEPTED": "Aceito",
      "REJECTED": "Recusado",
      "COUNTERED": "Contraproposta",
      "EXPIRED": "Expirado"
    },
    "common": {
      "loading": "Carregando...",
      "searchPlaceholder": "Buscar artista, evento ou local...",
      "filter": "Filtrar",
      "allCities": "Todas as Cidades",
      "allCategories": "Todas as Categorias",
      "fromPrice": "A partir de",
      "viewTickets": "Ver Ingressos",
      "details": "Detalhes",
      "officialTickets": "Ingressos Oficiais",
      "noResults": "Nenhum evento verificado encontrado para a sua busca."
    },
    "venuePicSection": {
      "kicker": "Diferencial TIKUM",
      "headline": "Precisa de ajuda no local? Nossa equipe está presente.",
      "desc": "Coordenadores de campo (PIC) da TIKUM atuam no entorno do local para apoiar compradores na troca de pulseiras e catracas de acesso.",
      "badgeCoord": "Coordenador no Local",
      "badgeTurnstile": "Suporte na Catraca",
      "badgeDispute": "Resolução Rápida de Disputas"
    },
    "trustArchitectureSection": {
      "kicker": "Fundamentos de Segurança",
      "title": "Arquitetura de Confiança TIKUM",
      "lead": "Três pilares operacionais para reduzir fraudes em ingressos de revenda.",
      "card1Title": "Sinais de Vendedor Verificado",
      "card1Desc": "Cada vendedor passa por checagem de identidade, histórico de transações e reputação antes de publicar.",
      "card2Title": "Garantia (Escrow) até a Entrada",
      "card2Desc": "Os valores pagos ficam protegidos em custódia e só são repassados ao vendedor após a validação na catraca.",
      "card3Title": "Prevenção de Ingressos Duplicados",
      "card3Desc": "Controle em livro-razão e trilha de auditoria imutável impedem que o mesmo código seja anunciado duas vezes."
    },
    "howItWorksSection": {
      "kicker": "Fluxo Seguro",
      "title": "Como Funciona a TIKUM",
      "lead": "Processo transparente protegendo compradores e vendedores do anúncio até o acesso ao show.",
      "buyerColTitle": "Para Compradores",
      "buyerStep1": "Encontre Eventos e Ingressos Verificados",
      "buyerStep1Desc": "Escolha ingressos com preços transparentes e sem taxas surpresa no checkout.",
      "buyerStep2": "Pagamento Protegido via Escrow",
      "buyerStep2Desc": "Seu dinheiro fica retido em conta de custódia e não é liberado ao vendedor antecipadamente.",
      "buyerStep3": "Receba Ingresso Oficial e Validação",
      "buyerStep3Desc": "Obtenha seu e-ticket ou instruções de retirada com código de validação de acesso.",
      "buyerStep4": "Acesse o Evento com Apoio Presencial",
      "buyerStep4Desc": "Apresente o ingresso na catraca. Em caso de falha de leitura, nossa equipe PIC auxilia na hora.",
      "sellerColTitle": "Para Vendedores",
      "sellerStep1": "Anuncie sem Taxas Iniciais",
      "sellerStep1Desc": "Informe os dados do ingresso, comprovante de compra e um preço de revenda justo.",
      "sellerStep2": "Validação Automática e Manual",
      "sellerStep2Desc": "O sistema confere a validade e impede códigos duplicados antes da publicação.",
      "sellerStep3": "Aviso Instantâneo na Venda",
      "sellerStep3Desc": "Receba notificação assim que o comprador efetuar o pagamento protegido.",
      "sellerStep4": "Repasse Automático Pós-Evento",
      "sellerStep4Desc": "Após confirmada a entrada na catraca, o valor é transferido para a sua conta bancária."
    },
    "sellerExperienceSection": {
      "kicker": "Experiência do Vendedor",
      "headline": "Tem ingressos que não vai conseguir usar?",
      "desc": "Anuncie gratuitamente sem custos iniciais. Conecte-se com fãs e receba o valor na sua conta bancária após o evento.",
      "cta": "Anunciar Ingresso"
    },
    "faqPreviewSection": {
      "kicker": "Perguntas Frequentes",
      "title": "Perguntas Frequentes (FAQ)",
      "lead": "Respostas transparentes sobre custódia, proteção e atuação da equipe no local.",
      "q1": "Como a TIKUM reduz fraudes de ingressos?",
      "a1": "Aliamos conferência de titularidade, retenção de fundos até a entrada e suporte presencial no evento.",
      "q2": "Quando o vendedor recebe o repasse?",
      "a2": "O valor fica retido em garantia e só é liberado após a confirmação de entrada válida na catraca.",
      "q3": "Qual é a função da equipe PIC no local?",
      "a3": "Auxiliar na troca de pulseiras e agir rapidamente caso ocorra qualquer dificuldade na leitura do código.",
      "q4": "E se o ingresso apresentar problemas na entrada?",
      "a4": "Você pode acionar o PIC ou abrir disputa imediatamente. Se for constatada invalidade, o reembolso é realizado.",
      "viewAll": "Ver todas as dúvidas e tutoriais"
    },
    "finalCtaSection": {
      "kicker": "Comece com Segurança",
      "title": "Pronto para curtir seu evento favorito?",
      "lead": "Junte-se a milhares de fãs em um ecossistema de revenda seguro e protegido.",
      "ctaFind": "Buscar Ingressos Agora",
      "ctaSell": "Vender seus Ingressos"
    }
  },
  "fr": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "Billets de revente. Conçu pour réduire la fraude.",
      "slogan": "Achetez des billets de revente en toute confiance.",
      "copy": "Une plateforme de revente de billets fiable, conçue autour de la vérification, de transactions sécurisées sous séquestre et d’une assistance humaine sur place.",
      "venueSupport": "Des personnes réelles sur place.",
      "copyright": "© 2026 Tikum — by Shinerva. Tous droits réservés."
    },
    "meta": {
      "title": "Tikum — Billets de revente. Conçu pour réduire la fraude. | by Shinerva",
      "description": "Plateforme fiable de revente de billets conçue pour réduire la fraude grâce à des vendeurs vérifiés, la protection sous séquestre et des coordinateurs sur place."
    },
    "nav": {
      "events": "Événements",
      "concerts": "Concerts",
      "sports": "Sports",
      "festivals": "Festivals",
      "theater": "Théâtre",
      "comedy": "Humour",
      "howItWorks": "Comment ça marche",
      "search": "Recherche",
      "sellTicket": "Vendre un Billet",
      "myOrders": "Mes Commandes",
      "myTickets": "Mes Billets",
      "support": "Assistance",
      "account": "Compte",
      "signIn": "Connexion / Inscription",
      "findTickets": "Trouver des Billets"
    },
    "hero": {
      "headline": "Billets de Revente. Conçu pour Réduire la Fraude.",
      "subhead": "Plateforme de revente de billets avec vérification des annonces, protection des transactions et assistance physique sur place.",
      "ctaFind": "Trouver des Billets",
      "ctaSell": "Vendre un Billet",
      "featuredBadge": "ANNONCE OFFICIELLE VÉRIFIÉE"
    },
    "trust": {
      "verified": "Annonces Vérifiées",
      "verifiedDesc": "Chaque billet fait l'objet d'un contrôle de conformité strict.",
      "protected": "Transactions Protégées",
      "protectedDesc": "Fonds sécurisés sous séquestre (escrow) jusqu'à confirmation de l'accès à l'événement.",
      "venue": "Assistance sur Place",
      "venueDesc": "Pour les événements éligibles, un référent Tikum est présent aux abords de la salle.",
      "pricing": "Tarification Transparente",
      "pricingDesc": "Détail précis du billet, des frais de service et des taxes sans frais cachés.",
      "pillarVerified": "Annonces Vérifiées",
      "pillarVenue": "Assistance sur Place",
      "pillarProtected": "Transactions Sécurisées (Escrow)",
      "pillarPricing": "Tarification Transparente"
    },
    "trustStates": {
      "VERIFIED": "Annonce Vérifiée",
      "SUPPORT_AVAILABLE": "Assistance sur Place Disponible",
      "REMOTE_SUPPORT": "Assistance à Distance Disponible",
      "PENDING": "Vérification en Cours",
      "UNAVAILABLE": "Assistance Non Disponible"
    },
    "operations": {
      "headline": "Plus qu'une Plateforme. Nous sommes là quand vous en avez besoin.",
      "subhead": "Un parcours opérationnel transparent, de la mise en vente aux portes de l'événement.",
      "step1Title": "Mise en vente",
      "step1Desc": "Le vendeur fournit les détails et la preuve d'achat du billet.",
      "step2Title": "Vérification",
      "step2Desc": "Contrôles humains et techniques pour valider l'authenticité.",
      "step3Title": "Achat Sécurisé",
      "step3Desc": "Le paiement est consigné sous séquestre jusqu'à l'admission.",
      "step4Title": "Jour de l'événement",
      "step4Desc": "L'acheteur se présente à la salle avec son titre vérifié.",
      "step5Title": "Support sur Place",
      "step5Desc": "Un coordinateur Tikum est mobilisable sur site en cas d'anomalie au tourniquet.",
      "humanEscalation": "Interlocuteur Humain Dédié",
      "humanEscalationDesc": "En cas de difficulté, vous n'êtes jamais abandonné face à un chatbot sans issue."
    },
    "howItWorks": {
      "title": "Comment Fonctionne Tikum",
      "buyTab": "Acheter des Billets",
      "buy1": "Trouvez votre événement",
      "buy2": "Choisissez une annonce vérifiée",
      "buy3": "Payez en toute sécurité via séquestre",
      "buy4": "Profitez d'un support jusqu'au jour J",
      "sellTab": "Vendre des Billets",
      "sell1": "Publiez votre billet inutilisé",
      "sell2": "Faites vérifier votre annonce",
      "sell3": "Trouvez un acheteur en toute simplicité",
      "sell4": "Recevez votre paiement après le concert"
    },
    "venueSupportSection": {
      "headline": "Besoin d'aide sur place ? Nos équipes sont présentes.",
      "copy": "Sur les événements majeurs, Tikum détache un coordinateur local aux abords du site pour éviter toute déconvenue aux portes de la salle.",
      "cta": "Voir les Événements Couverts"
    },
    "sellerSection": {
      "headline": "Transformez un billet inutilisé en argent en toute sécurité.",
      "copy": "Mise en ligne intuitive, tarifs clairs, contrôle d'identité et virement garanti.",
      "cta": "Vendre Mon Billet"
    },
    "principles": {
      "headline": "Fondé sur la Confiance. Porté par de Vraies Équipes.",
      "p1Title": "Revente Contrôlée",
      "p1Desc": "Contrôle minutieux de chaque billet avant publication.",
      "p2Title": "Séquestre Intégral",
      "p2Desc": "Paiement débloqué uniquement après admission réussie.",
      "p3Title": "Présence Terrain Réelle",
      "p3Desc": "Équipes physiques déployées sur les principaux événements."
    },
    "footer": {
      "product": "Produit",
      "company": "Société",
      "trust": "Confiance & Sécurité",
      "legal": "Mentions Légales",
      "events": "Événements",
      "sell": "Vendre des Billets",
      "how": "Fonctionnement",
      "supported": "Événements Couverts",
      "about": "À Propos",
      "contact": "Contactez-nous",
      "venuePIC": "Assistance sur Place",
      "buyerProt": "Protection Acheteur",
      "sellerProt": "Protection Vendeur",
      "verifInfo": "Vérification des Billets",
      "refund": "Politique de Remboursement",
      "terms": "Conditions Générales",
      "privacy": "Politique de Confidentialité",
      "cookie": "Politique de Cookies",
      "disclaimer": "Avertissement Légal"
    },
    "status": {
      "LISTED": "Disponible",
      "LOCKED": "En Transaction",
      "SOLD": "Vendu",
      "RESERVED": "Réservé",
      "PENDING_PAYMENT": "En Attente de Paiement",
      "PAID": "Fonds sous Séquestre",
      "ENTRY_CONFIRMED": "Entrée Confirmée",
      "SETTLED": "Paiement Débloqué",
      "DISPUTED": "Contrôle Tourniquet en Cours",
      "REFUNDED": "Remboursé",
      "CANCELLED": "Annulé",
      "PENDING": "En Attente",
      "ACCEPTED": "Accepté",
      "REJECTED": "Refusé",
      "COUNTERED": "Contre-offre",
      "EXPIRED": "Expiré"
    },
    "common": {
      "loading": "Chargement en cours...",
      "searchPlaceholder": "Rechercher un artiste, concert ou salle...",
      "filter": "Filtrer",
      "allCities": "Toutes les Villes",
      "allCategories": "Toutes les Catégories",
      "fromPrice": "Dès",
      "viewTickets": "Voir les Billets",
      "details": "Détails",
      "officialTickets": "Billetterie Officielle",
      "noResults": "Aucun événement vérifié ne correspond à votre recherche."
    },
    "venuePicSection": {
      "kicker": "Différenciateur Clé TIKUM",
      "headline": "Besoin d'aide sur place ? Notre équipe est présente à l'événement.",
      "desc": "Les coordinateurs de terrain TIKUM (PIC) sont présents aux abords du lieu pour assister les acheteurs lors du retrait des bracelets et du passage aux tourniquets.",
      "badgeCoord": "Coordinateur sur Place",
      "badgeTurnstile": "Assistance Tourniquet",
      "badgeDispute": "Médiation Rapide aux Portes"
    },
    "trustArchitectureSection": {
      "kicker": "Socle de Confiance",
      "title": "Architecture de Confiance TIKUM",
      "lead": "Trois piliers opérationnels pour limiter les fraudes sur les billets de revente.",
      "card1Title": "Signaux Vendeur Vérifiés",
      "card1Desc": "Chaque vendeur fait l'objet d'un contrôle d'identité, d'un historique de transactions et d'une vérification préalable.",
      "card2Title": "Fonds Séquestrés (Escrow) jusqu'à l'Entrée",
      "card2Desc": "Les fonds de l'acheteur sont sécurisés sur un compte séquestre et ne sont versés qu'après admission validée au tourniquet.",
      "card3Title": "Prévention des Doublons de Billets",
      "card3Desc": "Le grand livre et la traçabilité immuable empêchent qu'un même code-barres soit mis en vente deux fois."
    },
    "howItWorksSection": {
      "kicker": "Parcours Sécurisé",
      "title": "Comment Fonctionne TIKUM",
      "lead": "Un processus transparent qui protège acheteurs et vendeurs de la mise en vente jusqu'à l'accès au concert.",
      "buyerColTitle": "Pour les Acheteurs",
      "buyerStep1": "Trouvez Événements et Billets Vérifiés",
      "buyerStep1Desc": "Consultez des annonces vérifiées avec une tarification claire et sans frais cachés lors du paiement.",
      "buyerStep2": "Paiement Sécurisé via Escrow",
      "buyerStep2Desc": "Votre paiement est conservé sous séquestre interne et n'est jamais transféré par avance au vendeur.",
      "buyerStep3": "Recevez Votre Billet Officiel",
      "buyerStep3Desc": "Obtenez votre e-billet ou bon d'échange officiel accompagné du code de validation aux tourniquets.",
      "buyerStep4": "Accédez à l'Événement avec Support",
      "buyerStep4Desc": "Scannez votre billet. En cas de problème de lecture, nos coordinateurs PIC interviennent immédiatement.",
      "sellerColTitle": "Pour les Vendeurs",
      "sellerStep1": "Publiez Sans Frais Préalables",
      "sellerStep1Desc": "Indiquez les détails du billet, une preuve d'achat et un prix de revente équitable.",
      "sellerStep2": "Vérification Automatique et Manuelle",
      "sellerStep2Desc": "La plateforme valide le billet et bloque tout code-barres en doublon avant publication.",
      "sellerStep3": "Alerte Immédiate lors de la Vente",
      "sellerStep3Desc": "Recevez une notification instantanée dès que le paiement sécurisé de l'acheteur est consigné.",
      "sellerStep4": "Versement Automatique Après l'Événement",
      "sellerStep4Desc": "Dès l'entrée confirmée aux tourniquets, les fonds sont virés directement sur votre compte bancaire."
    },
    "sellerExperienceSection": {
      "kicker": "Espace Vendeur",
      "headline": "Des billets que vous ne pouvez plus utiliser ?",
      "desc": "Mettez-les en vente gratuitement sans frais initiaux. Trouvez preneur à un prix juste et recevez votre paiement après l'événement.",
      "cta": "Mettre en Vente un Billet"
    },
    "faqPreviewSection": {
      "kicker": "Questions Fréquentes",
      "title": "Questions Fréquentes (FAQ)",
      "lead": "Des réponses transparentes sur le paiement protégé, le séquestre et l'assistance physique.",
      "q1": "Comment TIKUM réduit-il la fraude ?",
      "a1": "Nous associons la vérification des titres, la rétention des fonds jusqu'à l'accès en salle et une présence d'agents sur site.",
      "q2": "Quand le vendeur reçoit-il ses fonds ?",
      "a2": "L'argent reste consigné sous séquestre et n'est débloqué qu'après validation effective du billet à la porte.",
      "q3": "Quel est le rôle du coordinateur PIC sur place ?",
      "a3": "Il facilite l'échange de bracelets et assiste les spectateurs en cas de difficulté de scan du code-barres.",
      "q4": "Que faire en cas d'incident à l'entrée ?",
      "a4": "Contactez immédiatement le coordinateur PIC ou le support. Si le billet s'avère invalide, vous êtes remboursé.",
      "viewAll": "Consulter l'ensemble de la FAQ et des guides"
    },
    "finalCtaSection": {
      "kicker": "Lancez-vous en Toute Sécurité",
      "title": "Prêt à assister à votre prochain concert ?",
      "lead": "Rejoignez des milliers de passionnés au sein d'une plateforme de revente protégée.",
      "ctaFind": "Rechercher des Billets",
      "ctaSell": "Vendre vos Billets"
    }
  },
  "ar": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "تذاكر ثانوية. صُممت للحد من الاحتيال.",
      "slogan": "شراء تذاكر إعادة البيع بكل ثقة.",
      "copy": "سوق تذاكر موثوق لإعادة البيع يعتمد على التحقق الدقيق، المعاملات المحمية بالضمان، ودعم بشري حقيقي في موقع الفعالية.",
      "venueSupport": "أشخاص حقيقيون. في موقع الفعالية.",
      "copyright": "© 2026 Tikum — by Shinerva. جميع الحقوق محفوظة."
    },
    "meta": {
      "title": "Tikum — تذاكر ثانوية. صُممت للحد من الاحتيال. | by Shinerva",
      "description": "سوق تذاكر موثوق لإعادة البيع، صُمم للحد من الاحتيال عبر بائعين موثقين، حماية أموال الضمان، وتواجد ميداني لمشرفي الدعم في موقع الفعالية."
    },
    "nav": {
      "events": "جميع الفعاليات",
      "concerts": "الحفلات الموسيقية",
      "sports": "الرياضة",
      "festivals": "المهرجانات",
      "theater": "المسرح",
      "comedy": "الكوميديا",
      "howItWorks": "كيف نعمل",
      "search": "بحث",
      "sellTicket": "بيع تذكرة",
      "myOrders": "طلباتي",
      "myTickets": "تذاكري",
      "support": "المساعدة",
      "account": "الحساب",
      "signIn": "تسجيل الدخول / إنشاء حساب",
      "findTickets": "البحث عن التذاكر"
    },
    "hero": {
      "headline": "تذاكر ثانوية. صُممت للحد من الاحتيال.",
      "subhead": "سوق التذاكر الثانوية مع التحقق من القوائم، حماية المعاملات، ودعم ميداني حقيقي في موقع الفعالية.",
      "ctaFind": "البحث عن تذاكر",
      "ctaSell": "بيع تذكرة",
      "featuredBadge": "إعلان رسمي موثق"
    },
    "trust": {
      "verified": "قوائم موثقة",
      "verifiedDesc": "تخضع كل تذكرة معروضة لضوابط تحقق واضحة ومسبقة.",
      "protected": "معاملات محمية",
      "protectedDesc": "تتم حماية المدفوعات عبر نظام الضمان حتى تأكيد الدخول إلى الفعالية.",
      "venue": "دعم ميداني في الموقع",
      "venueDesc": "للإيفنتات المؤهلة، نوفر منسقاً ميدانياً عند بوابات الفعالية لتقديم المساعدة.",
      "pricing": "شفافية تامة في الأسعار",
      "pricingDesc": "تفصيل كامل لسعر التذكرة والرسوم والضرائب دون أي مبالغ خفية.",
      "pillarVerified": "قوائم موثقة رسمياً",
      "pillarVenue": "دعم ميداني في الموقع",
      "pillarProtected": "معاملات محمية بحساب الضمان",
      "pillarPricing": "أسعار واضحة ومسبقة"
    },
    "trustStates": {
      "VERIFIED": "قائمة موثقة",
      "SUPPORT_AVAILABLE": "دعم ميداني متاح في الفعالية",
      "REMOTE_SUPPORT": "دعم متاح عن بُعد",
      "PENDING": "قيد التحقق",
      "UNAVAILABLE": "الدعم الميداني غير متوفر"
    },
    "operations": {
      "headline": "أكثر من مجرد منصة. نحن معك عند البوابات.",
      "subhead": "مسار تشغيلي واضح وشفاف من لحظة إدراج التذكرة حتى دخول القاعة.",
      "step1Title": "عرض التذكرة",
      "step1Desc": "يقوم البائع بإدخال بيانات التذكرة وإثبات الحجز.",
      "step2Title": "التحقق الدقيق",
      "step2Desc": "فحص إلكتروني وبشري للتأكد من صحة التذكرة وشروطها.",
      "step3Title": "شراء محمي",
      "step3Desc": "تظل أموال المشتري مودعة في حساب الضمان حتى نجاح الدخول.",
      "step4Title": "يوم الفعالية",
      "step4Desc": "يصل المشتري إلى الفعالية ومعه بيانات التذكرة المعتمدة.",
      "step5Title": "الدعم في الموقع",
      "step5Desc": "يتواجد منسق Tikum عند البوابات لمعالجة أي إشكال فوري.",
      "humanEscalation": "تواصل بشري مباشر",
      "humanEscalationDesc": "في حال واجهتك مشكلة، لن تترك في حلقة مفرغة مع روبوت المحادثة."
    },
    "howItWorks": {
      "title": "كيف تعمل منصة Tikum",
      "buyTab": "شراء التذاكر",
      "buy1": "اختر الفعالية التي تفضلها",
      "buy2": "اختر تذكرة معتمدة وموثقة",
      "buy3": "ادفع بأمان عبر حساب الضمان",
      "buy4": "احصل على الدعم حتى يوم الفعالية",
      "sellTab": "بيع التذاكر",
      "sell1": "اعرض تذكرتك الزائدة عن الحاجة",
      "sell2": "أكمل خطوات التحقق من التذكرة",
      "sell3": "التقِ بمشترٍ موثوق",
      "sell4": "استلم مستحقاتك بعد الفعالية"
    },
    "venueSupportSection": {
      "headline": "هل تحتاج إلى مساعدة في الفعالية؟ فريقنا متواجد هناك.",
      "copy": "للإيفنتات المدعومة، نوفر منسقاً محلياً عند البوابات حتى لا يُترك المشترون بمفردهم إذا طرأ أي عائق في نظام التذاكر.",
      "cta": "عرض الفعاليات المدعومة"
    },
    "sellerSection": {
      "headline": "حوّل التذاكر غير المستخدمة إلى سيولة بكل أمان.",
      "copy": "إدراج مبسط، تسعير شفاف، تحقق من الهوية، وتواصل مباشر ومسار تحويل مضمون.",
      "cta": "بيع تذكرتك الآن"
    },
    "principles": {
      "headline": "مبني على الثقة، ومدعوم بفريق ميداني حقيقي.",
      "p1Title": "إعادة بيع موثقة",
      "p1Desc": "فحص منهجي لكل تذكرة قبل طرحها للمشترين.",
      "p2Title": "حماية كاملة بالضمان",
      "p2Desc": "لا يتم تحويل الأموال للبائع إلا بعد تأكيد دخول المشتري.",
      "p3Title": "تواجد ميداني عند البوابات",
      "p3Desc": "موظفون حقيقيون عند البوابات لتذليل أي عقبة في الدخول."
    },
    "footer": {
      "product": "المنتج",
      "company": "الشركة",
      "trust": "الثقة والأمان",
      "legal": "الشؤون القانونية",
      "events": "دليل الفعاليات",
      "sell": "بيع التذاكر",
      "how": "آلية العمل",
      "supported": "الفعاليات المدعومة",
      "about": "من نحن",
      "contact": "اتصل بنا",
      "venuePIC": "الدعم الميداني",
      "buyerProt": "حماية المشتري",
      "sellerProt": "حماية البائع",
      "verifInfo": "آلية التحقق",
      "refund": "سياسة الاسترجاع",
      "terms": "الشروط والأحكام",
      "privacy": "سياسة الخصوصية",
      "cookie": "ملفات تعريف الارتباط",
      "disclaimer": "إخلاء المسؤولية"
    },
    "status": {
      "LISTED": "متاحة",
      "LOCKED": "قيد المعاملة",
      "SOLD": "تم البيع",
      "RESERVED": "محجوزة",
      "PENDING_PAYMENT": "بانتظار الدفع",
      "PAID": "مؤمّنة في الضمان",
      "ENTRY_CONFIRMED": "تم تأكيد الدخول",
      "SETTLED": "تمت التسوية والتحويل",
      "DISPUTED": "قيد التحقيق في البوابة",
      "REFUNDED": "تم رد المبلغ",
      "CANCELLED": "ملغاة",
      "PENDING": "بانتظار الرد",
      "ACCEPTED": "مقبولة",
      "REJECTED": "مرفوضة",
      "COUNTERED": "عرض مقابل",
      "EXPIRED": "منتهية الصلاحية"
    },
    "common": {
      "loading": "جاري التحميل...",
      "searchPlaceholder": "ابحث عن فنان، فعالية، أو موقع...",
      "filter": "تصفية",
      "allCities": "جميع المدن",
      "allCategories": "جميع الفئات",
      "fromPrice": "ابتداءً من",
      "viewTickets": "عرض التذاكر",
      "details": "التفاصيل",
      "officialTickets": "التذاكر الرسمية",
      "noResults": "لم يتم العثور على فعاليات موثقة مطابقة لبحثك."
    },
    "venuePicSection": {
      "kicker": "الميزة التنافسية لـ TIKUM",
      "headline": "هل تحتاج إلى مساعدة في الموقع؟ فريقنا متواجد ميدانياً.",
      "desc": "يتواجد منسقو TIKUM الميدانيون (PIC) في محيط الفعالية لمرافقة المشترين أثناء استلام أساور الدخول وبوابات العبور الإلكترونية.",
      "badgeCoord": "منسق ميداني في الموقع",
      "badgeTurnstile": "مساعدة بوابات الدخول",
      "badgeDispute": "حل فوري للنزاعات عند البوابة"
    },
    "trustArchitectureSection": {
      "kicker": "ركائز الحماية",
      "title": "هندسة الثقة في TIKUM",
      "lead": "ثلاث ركائز تشغيلية ملموسة للحد من مخاطر الاحتيال في تذاكر إعادة البيع.",
      "card1Title": "مؤشرات البائع الموثوق",
      "card1Desc": "يخضع كل بائع للتحقق من الهوية، وتاريخ المعاملات، وسجل إتمام التذاكر قبل نشر القائمة.",
      "card2Title": "حجز الأموال بالضمان حتى البوابة",
      "card2Desc": "تُحفظ أموال المشتري في حساب الضمان الداخلي (Escrow) ولا تُصرف للبائع إلا بعد تأكيد الدخول الفعلي.",
      "card3Title": "منع التذاكر المكررة",
      "card3Desc": "يمنع دفتر الأستاذ وسجل التدقيق غير القابل للتعديل إدراج الرمز الشريطي نفسه أو تداوله مرتين."
    },
    "howItWorksSection": {
      "kicker": "مسار المعاملات الآمن",
      "title": "كيف يعمل سوق TIKUM",
      "lead": "آلية واضحة تحمي المشترين والبائعين من بداية الإدراج وحتى بوابات الفعالية.",
      "buyerColTitle": "للمشترين",
      "buyerStep1": "استكشف الفعاليات والتذاكر الموثقة",
      "buyerStep1Desc": "اختر تذاكر بأسعار واضحة ودون أي رسوم خفية عند إتمام الدفع.",
      "buyerStep2": "دفع آمن عبر حساب الضمان",
      "buyerStep2Desc": "تُحتجز مدفوعاتك بأمان داخل نظام الضمان، ولا تُحول للبائع مسبقاً.",
      "buyerStep3": "استلم التذكرة الرسمية وتصريح الدخول",
      "buyerStep3Desc": "احصل على التذكرة الإلكترونية أو تعليمات استلام السوار مع رمز التحقق للبوابات.",
      "buyerStep4": "ادخل الفعالية بدعم ميداني",
      "buyerStep4Desc": "امسح تذكرتك عند البوابة. إذا حدث أي خلل في الرمز، فإن منسقنا الميداني جاهز لمساعدتك.",
      "sellerColTitle": "للبائعين",
      "sellerStep1": "أدرج التذاكر مجاناً بدون رسوم مسبقة",
      "sellerStep1Desc": "أدخل تفاصيل التذكرة، وإثبات الشراء، وسعر البيع المقترح.",
      "sellerStep2": "تدقيق آلي وبشري مزدوج",
      "sellerStep2Desc": "يفحص النظام صلاحية التذكرة ويمنع تكرار الرموز قبل تنشيط العرض.",
      "sellerStep3": "إشعار فوري عند البيع",
      "sellerStep3Desc": "تلقَ إشعاراً فورياً بمجرد إتمام المشتري للدفع وإيداع الأموال في الضمان.",
      "sellerStep4": "تحويل تلقائي بعد الفعالية",
      "sellerStep4Desc": "بمجرد تأكيد دخول المشتري عبر البوابة، تُحول الأموال مباشرة إلى حسابك البنكي."
    },
    "sellerExperienceSection": {
      "kicker": "تجربة البائع",
      "headline": "هل لديك تذاكر لن تتمكن من حضورها؟",
      "desc": "اعرض تذاكرك مجاناً وبدون أي تكاليف مسبقة. تواصل مع مشترين حقيقيين واستلم مستحقاتك بعد الفعالية.",
      "cta": "عرض تذكرة للبيع"
    },
    "faqPreviewSection": {
      "kicker": "الأسئلة الشائعة",
      "title": "الأسئلة الأكثر تكراراً",
      "lead": "إجابات واضحة حول حماية الضمان، وآلية الدفع، ودور الفريق الميداني.",
      "q1": "كيف تحد منصة TIKUM من احتيال التذاكر؟",
      "a1": "نجمع بين التحقق من ملكية التذكرة، وحجز الأموال حتى إتمام الدخول، وتواجد منسقين ميدانيين في الموقع.",
      "q2": "متى يستلم البائع أمواله؟",
      "a2": "تبقى الأموال في الضمان الداخلي ولا تُفرج إلا بعد تأكيد دخول المشتري عبر بوابات الفعالية.",
      "q3": "ما هو دور منسق TIKUM الميداني؟",
      "a3": "مساعدة الجماهير في استلام الأساور والتدخل السريع في حال تعذر قراءة الرمز الشريطي للبوابة.",
      "q4": "ماذا يحدث إذا واجهت مشكلة في التذكرة عند البوابة؟",
      "a4": "يمكنك إبلاغ المنسق الميداني أو فتح نزاع فوراً. إذا ثبت عدم صلاحية التذكرة، تسترد أموالك كاملة.",
      "viewAll": "عرض كافة الأسئلة وإرشادات المساعدة"
    },
    "finalCtaSection": {
      "kicker": "ابدأ بثقة",
      "title": "هل أنت مستعد لحضور فعاليتك المفضلة؟",
      "lead": "انضم إلى آلاف عشاق الفنون والرياضة في منصة إعادة بيع موثوقة ومحمية.",
      "ctaFind": "ابحث عن تذاكر الآن",
      "ctaSell": "بع تذكرتك الآن"
    }
  },
  "hi": {
    "brand": {
      "name": "Tikum",
      "byline": "by Shinerva",
      "tagline": "रीसेल टिकटें। टिकट धोखाधड़ी रोकने के लिए निर्मित।",
      "slogan": "विश्वास के साथ टिकट खरीदें।",
      "copy": "एक विश्वसनीय रीसेल टिकट मार्केटप्लेस जो सत्यापन, सुरक्षित एस्क्रो लेन-देन और कार्यक्रम स्थल पर वास्तविक मानव सहायता के लिए निर्मित है।",
      "venueSupport": "स्थल पर वास्तविक लोग।",
      "copyright": "© 2026 Tikum — by Shinerva. सर्वाधिकार सुरक्षित।"
    },
    "meta": {
      "title": "Tikum — रीसेल टिकटें। टिकट धोखाधड़ी रोकने के लिए निर्मित। | by Shinerva",
      "description": "विश्वसनीय रीसेल टिकट मार्केटप्लेस, जो सत्यापित विक्रेताओं, एस्क्रो सुरक्षा और स्थल पर उपस्थित समन्वयकों (PIC) द्वारा टिकट धोखाधड़ी कम करने के लिए बनाया गया है।"
    },
    "nav": {
      "events": "सभी कार्यक्रम",
      "concerts": "कॉन्सर्ट",
      "sports": "खेल",
      "festivals": "उत्सव / फेस्ट",
      "theater": "थिएटर",
      "comedy": "कॉमेडी",
      "howItWorks": "यह कैसे काम करता है",
      "search": "खोजें",
      "sellTicket": "टिकट बेचें",
      "myOrders": "मेरे ऑर्डर",
      "myTickets": "मेरे टिकट",
      "support": "सहायता",
      "account": "खाता",
      "signIn": "लॉग इन / साइन अप",
      "findTickets": "टिकट खोजें"
    },
    "hero": {
      "headline": "रीसेल टिकटें। टिकट धोखाधड़ी रोकने के लिए निर्मित।",
      "subhead": "सत्यापित लिस्टिंग, सुरक्षित एस्क्रो लेनदेन और कार्यक्रम स्थल पर प्रत्यक्ष सहायता के साथ रीसेल टिकट मार्केटप्लेस।",
      "ctaFind": "टिकट खोजें",
      "ctaSell": "टिकट बेचें",
      "featuredBadge": "आधिकारिक तौर पर सत्यापित घोषणा"
    },
    "trust": {
      "verified": "सत्यापित लिस्टिंग",
      "verifiedDesc": "प्रत्येक लिस्टिंग स्पष्ट सत्यापन नियंत्रणों से होकर गुजरती है।",
      "protected": "सुरक्षित लेन-देन",
      "protectedDesc": "भुगतान और लेन-देन आंतरिक एस्क्रो प्रणाली द्वारा सुरक्षित रखा जाता है।",
      "venue": "वेन्यू पर मानव सहायता",
      "venueDesc": "समर्थित कार्यक्रमों के लिए, टिकम वेन्यू गेट पर स्थानीय पीआईसी प्रतिनिधि उपलब्ध कराता है।",
      "pricing": "पारदर्शी मूल्य",
      "pricingDesc": "बिना किसी छुपे हुए शुल्क के टिकट मूल्य, सेवा शुल्क और करों का स्पष्ट विवरण।",
      "pillarVerified": "सत्यापित टिकट लिस्टिंग",
      "pillarVenue": "वेन्यू पर फील्ड सहायता",
      "pillarProtected": "एस्क्रो संरक्षित लेन-देन",
      "pillarPricing": "स्पष्ट एवं पारदर्शी मूल्य"
    },
    "trustStates": {
      "VERIFIED": "सत्यापित लिस्टिंग",
      "SUPPORT_AVAILABLE": "वेन्यू सहायता उपलब्ध",
      "REMOTE_SUPPORT": "रिमोट सहायता उपलब्ध",
      "PENDING": "सत्यापन प्रक्रियाधीन",
      "UNAVAILABLE": "सहायता उपलब्ध नहीं"
    },
    "operations": {
      "headline": "सिर्फ एक मार्केटप्लेस नहीं। ज़रूरत पड़ने पर हम वेन्यू पर मौजूद हैं।",
      "subhead": "टिकट लिस्टिंग से लेकर वेन्यू गेट तक एक पूरी तरह से पारदर्शी प्रक्रिया।",
      "step1Title": "लिस्टिंग",
      "step1Desc": "विक्रेता टिकट का विवरण और मूल बुकिंग का प्रमाण दर्ज करता है।",
      "step2Title": "सत्यापन",
      "step2Desc": "सिस्टम और टीम द्वारा टिकट की सत्यता की पुष्टि की जाती है।",
      "step3Title": "सुरक्षित खरीद",
      "step3Desc": "खरीदार का भुगतान वेन्यू में प्रवेश तक सुरक्षित एस्क्रो में रहता है।",
      "step4Title": "इवेंट का दिन",
      "step4Desc": "खरीदार सत्यापित टिकट के साथ कार्यक्रम स्थल पर पहुंचता है।",
      "step5Title": "वेन्यू सहायता",
      "step5Desc": "गेट पर किसी भी रुकावट की स्थिति में टिकम का स्थानीय प्रतिनिधि सहायता करता है।",
      "humanEscalation": "वास्तविक व्यक्ति से संपर्क",
      "humanEscalationDesc": "समस्या आने पर आप चैटबॉट के चक्रव्यूह में नहीं फंसते, हमारी टीम सीधे मदद करती है।"
    },
    "howItWorks": {
      "title": "टिकम कैसे काम करता है",
      "buyTab": "टिकट खरीदें",
      "buy1": "अपना पसंदीदा इवेंट चुनें",
      "buy2": "सत्यापित लिस्टिंग चुनें",
      "buy3": "एस्क्रो के माध्यम से सुरक्षित भुगतान करें",
      "buy4": "इवेंट के दिन तक सहायता प्राप्त करें",
      "sellTab": "टिकट बेचें",
      "sell1": "अपने अतिरिक्त टिकट की लिस्टिंग करें",
      "sell2": "आवश्यक सत्यापन पूरा करें",
      "sell3": "वास्तविक खरीदार से जुड़ें",
      "sell4": "इवेंट के बाद अपना भुगतान प्राप्त करें"
    },
    "venueSupportSection": {
      "headline": "वेन्यू पर सहायता चाहिए? हमारी टीम वहां मौजूद है।",
      "copy": "पात्र कार्यक्रमों के लिए, टिकम वेन्यू पर स्थानीय प्रतिनिधि उपलब्ध कराता है ताकि गेट पर समस्या आने पर दर्शक अकेले न रहें।",
      "cta": "समर्थित कार्यक्रम देखें"
    },
    "sellerSection": {
      "headline": "अप्रयुक्त टिकट को आसानी से नकद में बदलें।",
      "copy": "सरल लिस्टिंग, पारदर्शी शुल्क, पहचान सत्यापन, और सुरक्षित भुगतान प्रक्रिया।",
      "cta": "टिकट अभी बेचें"
    },
    "principles": {
      "headline": "विश्वास पर आधारित। वास्तविक लोगों द्वारा समर्थित।",
      "p1Title": "सत्यापित सेकंडरी रीसेल",
      "p1Desc": "प्रशंसकों तक पहुँचने से पहले प्रत्येक टिकट की जांच की जाती है।",
      "p2Title": "सुरक्षित एस्क्रो सुरक्षा",
      "p2Desc": "सफल प्रवेश की पुष्टि के बाद ही विक्रेता को राशि जारी की जाती है।",
      "p3Title": "वेन्यू पर प्रत्यक्ष उपस्थिति",
      "p3Desc": "गेट पर किसी भी रुकावट को हल करने के लिए वास्तविक कर्मचारी तैनात हैं।"
    },
    "footer": {
      "product": "उत्पाद",
      "company": "कंपनी",
      "trust": "सुरक्षा और विश्वास",
      "legal": "कानूनी",
      "events": "कार्यक्रम सूची",
      "sell": "टिकट बेचें",
      "how": "कार्यप्रणाली",
      "supported": "समर्थित कार्यक्रम",
      "about": "हमारे बारे में",
      "contact": "संपर्क करें",
      "venuePIC": "वेन्यू सहायता",
      "buyerProt": "खरीदार सुरक्षा",
      "sellerProt": "विक्रेता सुरक्षा",
      "verifInfo": "सत्यापन प्रक्रिया",
      "refund": "रिफंड नीति",
      "terms": "सेवा की शर्तें",
      "privacy": "गोपनीयता नीति",
      "cookie": "कुकी नीति",
      "disclaimer": "अस्वीकरण"
    },
    "status": {
      "LISTED": "उपलब्ध",
      "LOCKED": "प्रक्रियाधीन",
      "SOLD": "बिक चुका है",
      "RESERVED": "आरक्षित",
      "PENDING_PAYMENT": "भुगतान प्रतीक्षित",
      "PAID": "एस्क्रो में सुरक्षित",
      "ENTRY_CONFIRMED": "प्रवेश सत्यापित",
      "SETTLED": "भुगतान संपन्न",
      "DISPUTED": "गेट पर जांच जारी",
      "REFUNDED": "धनवापसी पूर्ण",
      "CANCELLED": "रद्द",
      "PENDING": "प्रतीक्षित",
      "ACCEPTED": "स्वीकृत",
      "REJECTED": "अस्वीकृत",
      "COUNTERED": "जवाबी प्रस्ताव",
      "EXPIRED": "समाप्त"
    },
    "common": {
      "loading": "लोड हो रहा है...",
      "searchPlaceholder": "कलाकार, इवेंट या वेन्यू खोजें...",
      "filter": "फ़िल्टर",
      "allCities": "सभी शहर",
      "allCategories": "सभी श्रेणियां",
      "fromPrice": "न्यूनतम",
      "viewTickets": "टिकट देखें",
      "details": "विवरण",
      "officialTickets": "आधिकारिक टिकट",
      "noResults": "आपकी खोज से मेल खाने वाले कोई सत्यापित कार्यक्रम नहीं मिले।"
    },
    "venuePicSection": {
      "kicker": "TIKUM की प्रमुख विशेषता",
      "headline": "वेन्यू पर सहायता चाहिए? हमारी टीम स्थल पर मौजूद है।",
      "desc": "TIKUM के फील्ड कोऑर्डिनेटर (PIC) रिस्टबैंड एक्सचेंज और टर्नस्टाइल प्रवेश द्वार पर सहायता के लिए कार्यक्रम स्थल के पास व्यक्तिगत रूप से उपस्थित रहते हैं।",
      "badgeCoord": "ऑन-साइट कोऑर्डिनेटर",
      "badgeTurnstile": "टर्नस्टाइल प्रवेश सहायता",
      "badgeDispute": "त्वरित प्रवेश विवाद समाधान"
    },
    "trustArchitectureSection": {
      "kicker": "सुरक्षा की नींव",
      "title": "TIKUM सुरक्षा एवं विश्वास आर्किटेक्चर",
      "lead": "रीसेल टिकट धोखाधड़ी को कम करने के लिए तैयार किए गए तीन ठोस परिचालन स्तंभ।",
      "card1Title": "सत्यापित विक्रेता संकेत",
      "card1Desc": "प्रत्येक विक्रेता को लिस्टिंग से पहले पहचान जांच, लेन-देन इतिहास और निपटान रिकॉर्ड से गुजरना होता है।",
      "card2Title": "प्रवेश तक एस्क्रो में सुरक्षित राशि",
      "card2Desc": "खरीदार का भुगतान आंतरिक एस्क्रो में सुरक्षित रहता है और सफल प्रवेश के बाद ही विक्रेता को जारी किया जाता है।",
      "card3Title": "डुप्लिकेट टिकट रोकथाम",
      "card3Desc": "खाताबही और अपरिवर्तनीय ऑडिट ट्रेल एक ही बारकोड को दोबारा सूचीबद्ध या लेन-देन होने से रोकते हैं।"
    },
    "howItWorksSection": {
      "kicker": "सुरक्षित लेन-देन प्रक्रिया",
      "title": "TIKUM मार्केटप्लेस कैसे काम करता है",
      "lead": "लिस्टिंग से लेकर वेन्यू के गेट तक खरीदारों और विक्रेताओं की सुरक्षा करने वाली पारदर्शी प्रणाली।",
      "buyerColTitle": "खरीदारों के लिए",
      "buyerStep1": "सत्यापित कार्यक्रम और टिकट खोजें",
      "buyerStep1Desc": "चेकआउट पर बिना किसी छुपे शुल्क के पारदर्शी कीमतों पर रीसेल टिकट चुनें।",
      "buyerStep2": "एस्क्रो के माध्यम से सुरक्षित भुगतान",
      "buyerStep2Desc": "आपका भुगतान आंतरिक एस्क्रो में सुरक्षित रखा जाता है, विक्रेता को अग्रिम भुगतान नहीं किया जाता।",
      "buyerStep3": "आधिकारिक टिकट और प्रवेश कोड प्राप्त करें",
      "buyerStep3Desc": "टर्नस्टाइल सत्यापन कोड के साथ ई-टिकट या रिस्टबैंड रसीद प्राप्त करें।",
      "buyerStep4": "ऑन-साइट सहायता के साथ प्रवेश करें",
      "buyerStep4Desc": "गेट पर टिकट दिखाएं। बारकोड में कोई समस्या आने पर ऑन-साइट PIC सहायता के लिए तैयार हैं।",
      "sellerColTitle": "विक्रेताओं के लिए",
      "sellerStep1": "बिना किसी अग्रिम शुल्क के लिस्ट करें",
      "sellerStep1Desc": "टिकट विवरण, खरीद का प्रमाण और उचित बिक्री मूल्य दर्ज करें।",
      "sellerStep2": "स्वचालित एवं मैन्युअल सत्यापन",
      "sellerStep2Desc": "सिस्टम टिकट की वैधता की पुष्टि करता है और डुप्लिकेट बारकोड को रोकता है।",
      "sellerStep3": "टिकट बिकने पर तत्काल सूचना",
      "sellerStep3Desc": "खरीदार द्वारा भुगतान एस्क्रो में सुरक्षित होते ही तुरंत सूचना प्राप्त करें।",
      "sellerStep4": "कार्यक्रम उपरांत स्वचालित भुगतान",
      "sellerStep4Desc": "टर्नस्टाइल पर खरीदार के सफल प्रवेश के बाद राशि सीधे आपके बैंक खाते में भेजी जाती है।"
    },
    "sellerExperienceSection": {
      "kicker": "विक्रेता अनुभव",
      "headline": "क्या आपके पास ऐसे टिकट हैं जिनका आप उपयोग नहीं कर सकते?",
      "desc": "बिना किसी प्रारंभिक लागत के निःशुल्क टिकट लिस्ट करें। प्रशंसकों तक पहुंचें और कार्यक्रम के बाद बैंक खाते में भुगतान पाएं।",
      "cta": "टिकट लिस्ट करें"
    },
    "faqPreviewSection": {
      "kicker": "अक्सर पूछे जाने वाले प्रश्न",
      "title": "अक्सर पूछे जाने वाले प्रश्न (FAQ)",
      "lead": "लेन-देन सुरक्षा, एस्क्रो संरक्षण और वेन्यू पर मौजूद कर्मचारियों से जुड़े स्पष्ट उत्तर।",
      "q1": "TIKUM टिकट धोखाधड़ी को कैसे रोकता है?",
      "a1": "हम टिकट स्वामित्व सत्यापन, प्रवेश तक एस्क्रो भुगतान रोक और वेन्यू पर फील्ड स्टाफ की उपस्थिति को जोड़ते हैं।",
      "q2": "विक्रेता को भुगतान कब मिलता है?",
      "a2": "धनराशि एस्क्रो में सुरक्षित रहती है और खरीदार द्वारा गेट से प्रवेश करने के बाद ही जारी की जाती है।",
      "q3": "वेन्यू पर TIKUM PIC की क्या भूमिका है?",
      "a3": "वे रिस्टबैंड वितरण में मदद करते हैं और बारकोड स्कैन में समस्या आने पर तुरंत समाधान करते हैं।",
      "q4": "यदि गेट पर टिकट में समस्या आती है तो क्या होगा?",
      "a4": "आप तुरंत PIC या विवाद प्रणाली में रिपोर्ट कर सकते हैं। टिकट अमान्य साबित होने पर पूर्ण रिफंड दिया जाता है।",
      "viewAll": "सभी प्रश्न और सहायता गाइड देखें"
    },
    "finalCtaSection": {
      "kicker": "विश्वास के साथ शुरुआत करें",
      "title": "अपने पसंदीदा कार्यक्रम में जाने के लिए तैयार हैं?",
      "lead": "सुरक्षित रीसेल टिकट प्लेटफॉर्म में संगीत, खेल और उत्सव के हजारों प्रशंसकों से जुड़ें।",
      "ctaFind": "टिकट खोजें",
      "ctaSell": "टिकट बेचें"
    }
  }
};

  // Locale tags mapping for Intl API
  const LOCALE_TAGS = {
    'id': 'id-ID',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh': 'zh-CN',
    'ar': 'ar-SA',
    'hi': 'hi-IN',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'pt-BR': 'pt-BR',
    'pt': 'pt-BR'
  };

  function getLocaleTag(lang) {
    return LOCALE_TAGS[lang] || LOCALE_TAGS[currentLang] || 'id-ID';
  }

  function normalizeLang(langCode) {
    if (!langCode || typeof langCode !== 'string') return null;
    const clean = langCode.trim().toLowerCase();
    if (clean === 'id' || clean === 'in' || clean.startsWith('id-') || clean.startsWith('in-')) return 'id';
    if (clean === 'en' || clean.startsWith('en-')) return 'en';
    if (clean === 'zh' || clean.startsWith('zh-') || clean.startsWith('zh_')) return 'zh-CN';
    if (clean === 'ar' || clean.startsWith('ar-')) return 'ar';
    if (clean === 'hi' || clean.startsWith('hi-')) return 'hi';
    if (clean === 'es' || clean.startsWith('es-')) return 'es';
    if (clean === 'fr' || clean.startsWith('fr-')) return 'fr';
    if (clean === 'ja' || clean.startsWith('ja-')) return 'ja';
    if (clean === 'ko' || clean.startsWith('ko-')) return 'ko';
    if (clean === 'pt' || clean.startsWith('pt-')) return 'pt-BR';
    if (translations[clean]) return clean;
    return null;
  }

  /**
   * Language resolution priority:
   * 1. Explicit user selection (URL query parameter ?lang= or ?locale=)
   * 2. Stored preference (localStorage.getItem('tikum_lang'))
   * 3. Browser locale (navigator.language / navigator.languages)
   * 4. Default id-ID ('id')
   */
  function resolveInitialLanguage() {
    if (isNode) return 'id';
    // 1. Explicit URL parameter
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlLang = params.get('lang') || params.get('locale');
        if (urlLang) {
          const norm = normalizeLang(urlLang);
          if (norm) return norm;
        }
      } catch (e) {}
    }

    // 2. Stored user preference
    if (hasStorage) {
      try {
        const saved = localStorage.getItem('tikum_lang');
        if (saved) {
          const norm = normalizeLang(saved);
          if (norm) return norm;
        }
      } catch (e) {}
    }

    // 3. Browser locale
    if (typeof navigator !== 'undefined') {
      const candidates = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
      for (const cand of candidates) {
        const norm = normalizeLang(cand);
        if (norm) return norm;
      }
    }

    // 4. Default id-ID
    return 'id';
  }

  // State management
  let currentLang = resolveInitialLanguage();
  let currentTheme = 'dark';

  if (hasStorage) {
    try {
      const savedTheme = localStorage.getItem('tikum_theme');
      if (savedTheme) currentTheme = savedTheme;
    } catch (e) {}
  }

  function getNested(obj, pathStr) {
    if (!obj || !pathStr) return undefined;
    const parts = pathStr.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function t(key, fallback) {
    const activeDict = translations[currentLang] || translations.id;
    let res = getNested(activeDict, key);
    if (res !== undefined) return res;
    // Fallback hierarchy: requested locale -> English -> Indonesian
    if (translations.en) {
      res = getNested(translations.en, key);
      if (res !== undefined) return res;
    }
    if (translations.id) {
      res = getNested(translations.id, key);
      if (res !== undefined) return res;
    }
    return fallback !== undefined ? fallback : key;
  }

  /**
   * Locale-aware Date Formatter (Intl.DateTimeFormat)
   */
  function formatDate(dateInput, options) {
    if (!dateInput) return '-';
    const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    try {
      const defaultOpts = { day: 'numeric', month: 'short', year: 'numeric' };
      return new Intl.DateTimeFormat(getLocaleTag(currentLang), options || defaultOpts).format(d);
    } catch (e) {
      return d.toDateString();
    }
  }

  /**
   * Locale-aware Number Formatter (Intl.NumberFormat)
   */
  function formatNumber(num, options) {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    try {
      return new Intl.NumberFormat(getLocaleTag(currentLang), options).format(Number(num));
    } catch (e) {
      return String(num);
    }
  }

  /**
   * Locale-aware Currency Formatter
   * Preserves authentic event currency (never invents currency conversion).
   */
  function formatCurrency(amount, currency = 'IDR') {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return '0';
    const n = Number(amount);
    const curr = String(currency || 'IDR').toUpperCase();
    try {
      return new Intl.NumberFormat(getLocaleTag(currentLang), {
        style: 'currency',
        currency: curr,
        maximumFractionDigits: (curr === 'IDR' ? 0 : 2)
      }).format(n);
    } catch (e) {
      if (curr === 'IDR') {
        return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }
      return `${curr} ${n.toLocaleString()}`;
    }
  }

  function applyLanguage(lang) {
    const norm = normalizeLang(lang) || 'id';
    currentLang = norm;

    if (hasStorage) {
      try {
        localStorage.setItem('tikum_lang', norm);
      } catch (e) {}
    }

    if (hasDoc) {
      document.documentElement.lang = norm;
      const isRtl = norm === 'ar';
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

      if (isRtl) {
        document.body.classList.add('rtl-mode');
      } else {
        document.body.classList.remove('rtl-mode');
      }

      // Localized Document Title & Meta Tags
      const localizedTitle = t('meta.title', 'Tikum — Tiket Second. Tanpa Scam. | by Shinerva');
      document.title = localizedTitle;

      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', t('meta.description'));
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', localizedTitle);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', t('meta.description'));

      // Translate all DOM elements tagged with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated !== undefined) {
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translated;
          } else {
            el.textContent = translated;
          }
        }
      });

      // Translate placeholders
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = t(key);
        if (translated) el.placeholder = translated;
      });

      // Update Header Lang Switcher Trigger
      const langBtn = document.getElementById('langToggle') || document.getElementById('btnLangToggle');
      if (langBtn) {
        const matched = LANGUAGES.find(l => l.code === norm || l.codeAlias === norm);
        const displayLabel = matched ? matched.pill : norm.toUpperCase();
        const innerLabel = langBtn.querySelector('#langLabel');
        if (innerLabel) {
          innerLabel.textContent = displayLabel;
        } else {
          langBtn.textContent = displayLabel;
        }
      }

      // Notify dynamic rendering engines
      window.dispatchEvent(new CustomEvent('tikum:languageChanged', { detail: { lang: norm } }));
    }
  }

  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    if (hasStorage) {
      try {
        localStorage.setItem('tikum_theme', currentTheme);
      } catch (e) {}
    }
    if (hasDoc) {
      document.documentElement.setAttribute('data-theme', currentTheme);
      if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      const icon = document.getElementById('themeIcon');
      if (icon) {
        icon.className = currentTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      }
    }
  }

  function openLangModal() {
    if (!hasDoc) return;
    let modal = document.getElementById('tikumLangModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tikumLangModal';
      modal.className = 'lang-modal-overlay';
      modal.innerHTML = `
        <div class="lang-modal-box" role="dialog" aria-modal="true" aria-labelledby="langModalTitle">
          <div class="lang-modal-header">
            <div id="langModalTitle" style="font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-globe" style="color: var(--primary);"></i>
              <span>Select Language / Pilih Bahasa</span>
            </div>
            <button type="button" class="lang-modal-close" onclick="window.TikumI18n.closeLangModal()">&times;</button>
          </div>
          <div class="lang-modal-body">
            <div class="lang-tier-title">Global Touring &amp; Music Markets</div>
            <div class="lang-grid" id="langGridContainer"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLangModal();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLangModal();
      });
    }

    const container = modal.querySelector('#langGridContainer');
    if (container) {
      container.innerHTML = '';
      LANGUAGES.forEach(lang => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = (lang.code === currentLang || lang.codeAlias === currentLang);
        btn.className = `lang-select-item ${isActive ? 'active' : ''}`;
        btn.innerHTML = `
          <span class="lang-native">${lang.native}</span>
          <span class="lang-english">${lang.name} (${lang.pill})</span>
        `;
        btn.onclick = () => {
          applyLanguage(lang.code);
          closeLangModal();
        };
        container.appendChild(btn);
      });
    }

    modal.classList.add('visible');
  }

  function closeLangModal() {
    if (!hasDoc) return;
    const modal = document.getElementById('tikumLangModal');
    if (modal) modal.classList.remove('visible');
  }

  // Auto initialize on DOM ready
  if (hasDoc) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        applyTheme(currentTheme);
        applyLanguage(currentLang);
      });
    } else {
      applyTheme(currentTheme);
      applyLanguage(currentLang);
    }
  }

  const TikumI18n = {
    t,
    getLang: () => currentLang,
    getTheme: () => currentTheme,
    setLang: applyLanguage,
    setTheme: applyTheme,
    formatDate,
    formatNumber,
    formatCurrency,
    getLocaleTag,
    normalizeLang,
    resolveInitialLanguage,
    toggleLang: () => openLangModal(),
    openLangModal,
    closeLangModal,
    toggleTheme: () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'),
    translations,
    languages: LANGUAGES,
    tier2Languages: TIER2_LOCALES,
    getTier2Locales: () => TIER2_LOCALES.map(l => ({ ...l })),
    getSupportedLocales: () => LANGUAGES.map(l => ({ ...l }))
  };

  if (!isNode) {
    window.TikumI18n = TikumI18n;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TikumI18n;
  }
})();
