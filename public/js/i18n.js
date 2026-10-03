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
    { code: 'en', name: 'English', native: 'English', dir: 'ltr', pill: 'EN' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', pill: 'ID' },
    { code: 'zh-CN', codeAlias: 'zh', name: 'Chinese (Simplified)', native: '中文', dir: 'ltr', pill: '中文' },
    { code: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr', pill: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr', pill: '한국어' },
    { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', pill: 'ES' },
    { code: 'pt-BR', codeAlias: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr', pill: 'PT' },
    { code: 'fr', name: 'French', native: 'Français', dir: 'ltr', pill: 'FR' },
    { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', pill: 'العربية' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', pill: 'हिन्दी' }
  ];

  const translations = {
    id: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'Beli Tiket Resale dengan Percaya Diri.',
        copy: 'Listing terverifikasi, transaksi terlindungi, dan bantuan manusia di venue saat Anda membutuhkannya.',
        venueSupport: 'Orang sungguhan. Di venue.',
        copyright: '© 2026 Tikum — by Shinerva. Seluruh hak cipta dilindungi undang-undang.'
      },
      meta: {
        title: 'Tikum — Verified Resale. Real Support. | by Shinerva',
        description: 'Marketplace tiket sekunder terverifikasi. Transaksi terlindungi rekening penampungan internal (escrow) dan pendampingan PIC di gerbang venue.'
      },
      nav: {
        events: 'Semua Event',
        concerts: 'Konser',
        sports: 'Olahraga',
        festivals: 'Festival',
        theater: 'Teater',
        comedy: 'Komedi',
        howItWorks: 'Cara Kerja',
        search: 'Cari',
        sellTicket: 'Jual Tiket',
        myOrders: 'Pesanan Saya',
        myTickets: 'Tiket Saya',
        support: 'Bantuan',
        account: 'Akun',
        signIn: 'Masuk / Daftar',
        findTickets: 'Cari Tiket'
      },
      hero: {
        headline: 'Tiket yang Kamu Cari Mungkin Sudah Ada di Sini.',
        subhead: 'Beli dan jual tiket sekunder dengan listing terverifikasi, harga transparan, dan bantuan langsung di venue saat kamu membutuhkannya.',
        ctaFind: 'Cari Tiket',
        ctaSell: 'Jual Tiket',
        featuredBadge: 'PENGUMUMAN RESMI TERVERIFIKASI'
      },
      trust: {
        verified: 'Listing Terverifikasi',
        verifiedDesc: 'Setiap listing melalui kontrol verifikasi yang jelas dan terstandarisasi.',
        protected: 'Transaksi Terlindungi',
        protectedDesc: 'Status pembayaran dan dana diamankan melalui rekening penampungan internal (escrow).',
        venue: 'Dukungan Nyata di Venue',
        venueDesc: 'Untuk event yang didukung, Tikum menyediakan PIC operasional langsung di sekitar venue.',
        pricing: 'Harga Transparan',
        pricingDesc: 'Rincian harga tiket, biaya layanan, dan pajak ditampilkan jelas tanpa markup tersembunyi.'
      },
      trustStates: {
        VERIFIED: 'Listing Terverifikasi',
        SUPPORT_AVAILABLE: 'Dukungan Venue Tersedia',
        REMOTE_SUPPORT: 'Dukungan Jarak Jauh',
        PENDING: 'Verifikasi Tertunda',
        UNAVAILABLE: 'Dukungan Belum Tersedia'
      },
      operations: {
        headline: 'Lebih dari Sekadar Marketplace. Kami Hadir Saat Kamu Membutuhkan.',
        subhead: 'Alur operasional transparan dari listing hingga pintu gerbang acara.',
        step1Title: 'Listing Tiket',
        step1Desc: 'Penjual memasukkan data tiket dan bukti pemesanan awal.',
        step2Title: 'Verifikasi',
        step2Desc: 'Pemeriksaan kesesuaian data tiket dan kepemilikan oleh sistem & tim.',
        step3Title: 'Pembelian Terlindungi',
        step3Desc: 'Dana pembeli disimpan aman di rekening penampungan internal (escrow).',
        step4Title: 'Hari Acara',
        step4Desc: 'Pembeli hadir di venue dengan tiket dan kode verifikasi.',
        step5Title: 'Dukungan di Venue',
        step5Desc: 'PIC Tikum siap mendampingi di lokasi jika terjadi kendala pada gerbang tiket.',
        humanEscalation: 'Eskalasi Manusia Nyata',
        humanEscalationDesc: 'Jika ada masalah tiket, Anda tidak dilempar ke jalan buntu chatbot. Tim operasional kami menindaklanjuti secara langsung.'
      },
      howItWorks: {
        title: 'Cara Kerja Tikum',
        buyTab: 'Membeli Tiket',
        buy1: 'Temukan event pilihanmu',
        buy2: 'Pilih listing yang terverifikasi',
        buy3: 'Bayar dengan aman via escrow',
        buy4: 'Dapatkan bantuan hingga hari acara',
        sellTab: 'Menjual Tiket',
        sell1: 'Daftarkan tiket yang ingin dijual',
        sell2: 'Lengkapi bukti verifikasi listing',
        sell3: 'Dapatkan pembeli dengan harga wajar',
        sell4: 'Terima pencairan dana setelah acara'
      },
      venueSupportSection: {
        headline: 'Butuh Bantuan di Venue? Kami Punya Tim di Sana.',
        copy: 'Untuk event yang memenuhi syarat, Tikum menyediakan PIC lokal di area venue agar pembeli tidak ditinggal sendirian saat terjadi kendala gerbang masuk.',
        cta: 'Lihat Event yang Didukung'
      },
      sellerSection: {
        headline: 'Ubah Tiket Tak Terpakai Menjadi Uang Tunai.',
        copy: 'Pendaftaran mudah, harga transparan, verifikasi akurat, komunikasi terarah, dan alur pencairan dana yang terkontrol.',
        cta: 'Jual Tiket Sekarang'
      },
      principles: {
        headline: 'Dibangun Berdasarkan Kepercayaan. Didukung Manusia Nyata.',
        p1Title: 'Listing Sekunder Terverifikasi',
        p1Desc: 'Kami memeriksa kepemilikan dan integritas setiap tiket sebelum dapat ditransaksikan.',
        p2Title: 'Perlindungan Dana Terkendali',
        p2Desc: 'Dana baru dicairkan ke penjual setelah pembeli terkonfirmasi berhasil masuk venue.',
        p3Title: 'Kehadiran Operasional di Lapangan',
        p3Desc: 'Kami tidak sekadar beroperasi di balik layar; tim kami hadir di lapangan saat event berlangsung.'
      },
      footer: {
        product: 'Produk',
        company: 'Perusahaan',
        trust: 'Keamanan & Kepercayaan',
        legal: 'Legalitas',
        events: 'Katalog Event',
        sell: 'Jual Tiket',
        how: 'Cara Kerja',
        supported: 'Event yang Didukung',
        about: 'Tentang Tikum',
        contact: 'Kontak Kami',
        venuePIC: 'Dukungan Venue',
        buyerProt: 'Perlindungan Pembeli',
        sellerProt: 'Perlindungan Penjual',
        verifInfo: 'Verifikasi Tiket',
        refund: 'Kebijakan Pengembalian Dana',
        terms: 'Syarat & Ketentuan',
        privacy: 'Kebijakan Privasi',
        cookie: 'Kebijakan Cookie',
        disclaimer: 'Pernyataan Sanggahan'
      },
      status: {
        LISTED: 'Tersedia',
        LOCKED: 'Dalam Transaksi',
        SOLD: 'Terjual',
        RESERVED: 'Dipesan',
        PENDING_PAYMENT: 'Menunggu Pembayaran',
        PAID: 'Dana Diamankan di Escrow',
        ENTRY_CONFIRMED: 'Sukses Masuk Venue',
        SETTLED: 'Selesai & Dicairkan',
        DISPUTED: 'Dalam Investigasi PIC Gate',
        REFUNDED: 'Dana Dikembalikan',
        CANCELLED: 'Dibatalkan',
        PENDING: 'Menunggu Tanggapan',
        ACCEPTED: 'Disepakati',
        REJECTED: 'Ditolak',
        COUNTERED: 'Penawaran Balasan',
        EXPIRED: 'Kedaluwarsa'
      },
      common: {
        loading: 'Memuat data...',
        searchPlaceholder: 'Cari artis, event, atau venue...',
        filter: 'Saring',
        allCities: 'Semua Kota',
        allCategories: 'Semua Kategori',
        fromPrice: 'Dari',
        viewTickets: 'Lihat Tiket',
        details: 'Detail',
        officialTickets: 'Tiket Resmi',
        noResults: 'Tidak ada event terverifikasi yang sesuai dengan pencarian Anda.'
      }
    },

    en: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'Buy Resale Tickets With Confidence.',
        copy: 'Verified listings, protected transactions, and real human support when you need it.',
        venueSupport: 'Real people. At the venue.',
        copyright: '© 2026 Tikum — by Shinerva. All rights reserved.'
      },
      meta: {
        title: 'Tikum — Verified Resale. Real Support. | by Shinerva',
        description: 'Verified secondary ticket marketplace. Protected by escrow infrastructure and dedicated venue gate support.'
      },
      nav: {
        events: 'Events',
        concerts: 'Concerts',
        sports: 'Sports',
        festivals: 'Festivals',
        theater: 'Theater',
        comedy: 'Comedy',
        howItWorks: 'How It Works',
        search: 'Search',
        sellTicket: 'Sell Ticket',
        myOrders: 'My Orders',
        myTickets: 'My Tickets',
        support: 'Support',
        account: 'Account',
        signIn: 'Sign In / Register',
        findTickets: 'Find Tickets'
      },
      hero: {
        headline: 'The Ticket You Want May Already Be Here.',
        subhead: 'Buy and sell resale tickets with verified listings, transparent pricing, and real support when it matters.',
        ctaFind: 'Find Tickets',
        ctaSell: 'Sell a Ticket',
        featuredBadge: 'FEATURED OFFICIAL ANNOUNCEMENT'
      },
      trust: {
        verified: 'Verified Listings',
        verifiedDesc: 'Listings go through defined verification controls.',
        protected: 'Protected Transactions',
        protectedDesc: 'Payment and transaction state are handled through controlled marketplace escrow infrastructure.',
        venue: 'Real Venue Support',
        venueDesc: 'For supported events, TIKUM provides an identifiable operational PIC at or near the venue.',
        pricing: 'Transparent Pricing',
        pricingDesc: 'Clear line-item pricing with no hidden checkout markups.'
      },
      trustStates: {
        VERIFIED: 'Verified Listing',
        SUPPORT_AVAILABLE: 'Venue Support Available',
        REMOTE_SUPPORT: 'Remote Support Available',
        PENDING: 'Verification Pending',
        UNAVAILABLE: 'Support Unavailable'
      },
      operations: {
        headline: 'More Than a Marketplace. We\'re There When You Need Us.',
        subhead: 'A transparent operational flow from ticket listing to the event gates.',
        step1Title: 'Listing',
        step1Desc: 'Seller submits ticket details and booking credentials.',
        step2Title: 'Verification',
        step2Desc: 'Automated and human checks confirm authenticity and ticket terms.',
        step3Title: 'Protected Purchase',
        step3Desc: 'Buyer funds are held safely in internal escrow until event admission.',
        step4Title: 'Event Day',
        step4Desc: 'Buyer arrives at the venue with verified access credentials.',
        step5Title: 'Venue Support',
        step5Desc: 'Identified Tikum PIC is available on-site if turnstile issues arise.',
        humanEscalation: 'Human Escalation',
        humanEscalationDesc: 'When something goes wrong, you are never abandoned in a chatbot-only dead end.'
      },
      howItWorks: {
        title: 'How Tikum Works',
        buyTab: 'Buying Tickets',
        buy1: 'Find your event',
        buy2: 'Choose a verified listing',
        buy3: 'Pay securely with escrow',
        buy4: 'Get support through event day',
        sellTab: 'Selling Tickets',
        sell1: 'List your unused ticket',
        sell2: 'Verify your listing',
        sell3: 'Find a verified buyer',
        sell4: 'Complete transaction & receive payout'
      },
      venueSupportSection: {
        headline: 'Need Help at the Venue? We Have People There.',
        copy: 'For eligible events, TIKUM provides a local event PIC so buyers aren\'t left alone when something goes wrong at the gate.',
        cta: 'See Supported Events'
      },
      sellerSection: {
        headline: 'Turn an Unused Ticket Into Cash.',
        copy: 'Simple listing, transparent pricing, identity verification, buyer communication, and controlled payout process.',
        cta: 'Sell Your Ticket'
      },
      principles: {
        headline: 'Built on Trust. Backed by Real People.',
        p1Title: 'Verified Secondary Resale',
        p1Desc: 'Every ticket is systematically screened before being offered to fans.',
        p2Title: 'Protected Escrow Rail',
        p2Desc: 'Sellers are compensated only after successful attendee entry into the venue.',
        p3Title: 'Physical On-Site PICs',
        p3Desc: 'Real personnel deployed to concert gates to troubleshoot any ticketing friction.'
      },
      footer: {
        product: 'Product',
        company: 'Company',
        trust: 'Trust & Safety',
        legal: 'Legal',
        events: 'Events',
        sell: 'Sell Tickets',
        how: 'How It Works',
        supported: 'Supported Events',
        about: 'About Us',
        contact: 'Contact Us',
        venuePIC: 'Venue Support',
        buyerProt: 'Buyer Protection',
        sellerProt: 'Seller Protection',
        verifInfo: 'Verification',
        refund: 'Refund Policy',
        terms: 'Terms of Service',
        privacy: 'Privacy Policy',
        cookie: 'Cookie Policy',
        disclaimer: 'Disclaimer'
      },
      status: {
        LISTED: 'Listed',
        LOCKED: 'In Transaction',
        SOLD: 'Sold',
        RESERVED: 'Reserved',
        PENDING_PAYMENT: 'Pending Payment',
        PAID: 'Escrow Secured',
        ENTRY_CONFIRMED: 'Entry Confirmed',
        SETTLED: 'Settled & Paid Out',
        DISPUTED: 'Under Gate Investigation',
        REFUNDED: 'Refunded',
        CANCELLED: 'Cancelled',
        PENDING: 'Pending Review',
        ACCEPTED: 'Accepted',
        REJECTED: 'Rejected',
        COUNTERED: 'Counter Offer',
        EXPIRED: 'Expired'
      },
      common: {
        loading: 'Loading data...',
        searchPlaceholder: 'Search artist, event, or venue...',
        filter: 'Filter',
        allCities: 'All Cities',
        allCategories: 'All Categories',
        fromPrice: 'From',
        viewTickets: 'View Tickets',
        details: 'Details',
        officialTickets: 'Official Tickets',
        noResults: 'No verified events found matching your search.'
      }
    },

    'zh-CN': {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: '官方核验转售 · 现场专人支持',
        slogan: '安心购买转售门票，信赖尽在 Tikum。',
        copy: '严格核验的票源、资金托管保障，以及关键时刻演出场地的现场专人协助。',
        venueSupport: '真人团队，常驻现场。',
        copyright: '© 2026 Tikum — by Shinerva. 版权所有。'
      },
      meta: {
        title: 'Tikum — 官方核验转售 · 现场专人支持 | by Shinerva',
        description: '经过严格核验的二手门票市场。依托安全托管基础设施与演出场地专属现场支持。'
      },
      nav: {
        events: '全部活动',
        concerts: '演唱会',
        sports: '体育赛事',
        festivals: '音乐节',
        theater: '戏剧话剧',
        comedy: '脱口秀',
        howItWorks: '运作流程',
        search: '搜索',
        sellTicket: '转售门票',
        myOrders: '我的订单',
        myTickets: '我的门票',
        support: '客户支持',
        account: '账户中心',
        signIn: '登录 / 注册',
        findTickets: '查找门票'
      },
      hero: {
        headline: '你心仪的演出门票，或许就在这里。',
        subhead: '购买与转售经严格核验的二手门票，尊享透明定价，关键时刻更有现场专人鼎力协助。',
        ctaFind: '查找门票',
        ctaSell: '转售门票',
        featuredBadge: '官方重磅发布 · 经官方验证'
      },
      trust: {
        verified: '官方核验票源',
        verifiedDesc: '所有门票均通过明确、严格的真实性与合规性审查。',
        protected: '托管安全交易',
        protectedDesc: '支付与交易全流程由受控的托管架构保障，入场后方才结算。',
        venue: '场馆现场支持',
        venueDesc: '针对指定演出，Tikum 在检票口及场馆周边设立专人对接服务。',
        pricing: '透明公允定价',
        pricingDesc: '票价、服务费与税费明细清晰展示，绝无隐性加价。'
      },
      trustStates: {
        VERIFIED: '已核验门票',
        SUPPORT_AVAILABLE: '现场专人支持可用',
        REMOTE_SUPPORT: '远程实时协助',
        PENDING: '核验审核中',
        UNAVAILABLE: '暂无现场协助'
      },
      operations: {
        headline: '不止是交易平台，更在关键时刻伴你同行。',
        subhead: '从门票挂牌到入场检票的全流程透明运作。',
        step1Title: '门票挂牌',
        step1Desc: '卖家提交票面信息与购票凭证。',
        step2Title: '严格核验',
        step2Desc: '系统与人工团队双重核查票品真伪。',
        step3Title: '安全交易',
        step3Desc: '买家付款暂存于托管账户中，保障资金安全。',
        step4Title: '演出当天',
        step4Desc: '买家携带有效入场凭证抵达演出场馆。',
        step5Title: '现场专人',
        step5Desc: '若遇闸机或核验异常，Tikum 专人就近协调处理。',
        humanEscalation: '真人客服介入',
        humanEscalationDesc: '遭遇问题时无需苦等机器人，我们的运营团队直接跟进解决。'
      },
      howItWorks: {
        title: 'Tikum 运作流程',
        buyTab: '购买门票',
        buy1: '挑选你心仪的活动',
        buy2: '选择经核验的门票',
        buy3: '通过托管账户安全支付',
        buy4: '享受演出当天的贴心协助',
        sellTab: '转售门票',
        sell1: '发布你闲置的门票',
        sell2: '提交必要核验信息',
        sell3: '与真实买家达成交易',
        sell4: '演出成功入场后获取款项'
      },
      venueSupportSection: {
        headline: '演出入场遇阻？我们现场有人。',
        copy: '针对指定热门演出，Tikum 派驻现场负责人（PIC），确保买家在闸机检票遇阻时绝不孤立无援。',
        cta: '查看支持的演出'
      },
      sellerSection: {
        headline: '让闲置门票变现，轻松无忧。',
        copy: '发布简单、费用透明、官方核验、畅通沟通与规范结算流程。',
        cta: '立即转售门票'
      },
      principles: {
        headline: '立足信任，真人护航。',
        p1Title: '官方级二次核验',
        p1Desc: '每张票品均经过详尽的凭证查验。',
        p2Title: '资金托管隔离',
        p2Desc: '买家顺利入场前，款项不予划拨。',
        p3Title: '线下现场驻点',
        p3Desc: '核心场馆部署现场工作人员，提供直接支援。'
      },
      footer: {
        product: '产品',
        company: '公司',
        trust: '安全与信任',
        legal: '法律与条款',
        events: '活动日程',
        sell: '转售门票',
        how: '运作方式',
        supported: '支持的活动',
        about: '关于我们',
        contact: '联系我们',
        venuePIC: '现场支持',
        buyerProt: '买家保护',
        sellerProt: '卖家保障',
        verifInfo: '票源核验',
        refund: '退款政策',
        terms: '服务条款',
        privacy: '隐私政策',
        cookie: 'Cookie 政策',
        disclaimer: '免责声明'
      },
      status: {
        LISTED: '在售',
        LOCKED: '交易锁定中',
        SOLD: '已售出',
        RESERVED: '已预订',
        PENDING_PAYMENT: '等待买家付款',
        PAID: '资金已入托管账户',
        ENTRY_CONFIRMED: '入场已确认',
        SETTLED: '已结算放款',
        DISPUTED: '闸机争议调查中',
        REFUNDED: '款项已退回',
        CANCELLED: '交易已取消',
        PENDING: '等待确认',
        ACCEPTED: '已接受',
        REJECTED: '已拒绝',
        COUNTERED: '还价中',
        EXPIRED: '已过期'
      },
      common: {
        loading: '正在加载...',
        searchPlaceholder: '搜索艺人、活动名称或场馆...',
        filter: '筛选',
        allCities: '全部城市',
        allCategories: '全部类型',
        fromPrice: '起价',
        viewTickets: '查看门票',
        details: '详情',
        officialTickets: '官方售票',
        noResults: '未找到符合条件的核验活动。'
      }
    },

    ja: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: '確かなリセール、確かなサポート。',
        copy: '検証済みチケット、エスクロー保護取引、そして会場でのリアルスタッフ対応。',
        venueSupport: '会場に、本物のスタッフを。',
        copyright: '© 2026 Tikum — by Shinerva. All rights reserved.'
      },
      meta: {
        title: 'Tikum — 検証済みリセール · 会場対面サポート | by Shinerva',
        description: '安心の公式検証リセールマーケットプレイス。エスクローによる資金保護と会場ゲートでの専任サポート。'
      },
      nav: {
        events: '全イベント',
        concerts: 'コンサート',
        sports: 'スポーツ',
        festivals: 'フェス',
        theater: '演劇·舞台',
        comedy: 'お笑い·コメディ',
        howItWorks: 'ご利用方法',
        search: '検索',
        sellTicket: 'チケット出品',
        myOrders: '購入履歴',
        myTickets: '保有チケット',
        support: 'サポート',
        account: 'アカウント',
        signIn: 'ログイン / 登録',
        findTickets: 'チケットを探す'
      },
      hero: {
        headline: '求めていたチケットが、ここに。',
        subhead: '公式検証済みリスティングと透明な価格設定。必要な時は会場でリアルスタッフがサポートします。',
        ctaFind: 'チケットを探す',
        ctaSell: 'チケットを出品',
        featuredBadge: '注目の公式発表 · 検証済み'
      },
      trust: {
        verified: '検証済みリスティング',
        verifiedDesc: 'すべての出品は明確な検証基準に従って審査されています。',
        protected: '保護された取引',
        protectedDesc: '決済と取引状況は安全なエスクロー機構によって厳重に管理されます。',
        venue: '会場対面サポート',
        venueDesc: '対象公演では会場近辺に専任の現地スタッフ（PIC）を配置します。',
        pricing: '透明な価格体系',
        pricingDesc: 'チケット代金、手数料、税金を明示。隠れた追加費用はありません。'
      },
      trustStates: {
        VERIFIED: '検証済みリスティング',
        SUPPORT_AVAILABLE: '会場現地サポート対応',
        REMOTE_SUPPORT: 'リモートサポート対応',
        PENDING: '確認審査中',
        UNAVAILABLE: '現地サポート未対応'
      },
      operations: {
        headline: 'ただの市場ではない。困った時に、そこにいる安心。',
        subhead: '出品から入場ゲートまで、透明なオペレーションフロー。',
        step1Title: '出品登録',
        step1Desc: '出品者がチケット情報と購入証明を提出します。',
        step2Title: '公式検証',
        step2Desc: 'システムと専門チームがチケットの真正性を精査します。',
        step3Title: '安全な購入',
        step3Desc: '購入代金は入場確認までエスクロー口座で安全に預託されます。',
        step4Title: '公演当日',
        step4Desc: '購入者は検証済みアクセス情報を持って会場へ向かいます。',
        step5Title: '会場サポート',
        step5Desc: '入場ゲートでのトラブル発生時、現地スタッフが迅速に対応します。',
        humanEscalation: '専任担当者による対応',
        humanEscalationDesc: 'AIチャットの堂々巡りではなく、実際の運営チームが問題解決に当たります。'
      },
      howItWorks: {
        title: 'Tikum の仕組み',
        buyTab: 'チケットを買う',
        buy1: '希望のイベントを探す',
        buy2: '検証済みチケットを選択',
        buy3: 'エスクローで安全にお支払い',
        buy4: '公演当日まで安心サポート',
        sellTab: 'チケットを売る',
        sell1: '不要になったチケットを出品',
        sell2: '証明書類を提出し検証を受ける',
        sell3: '購入者と取引が成立',
        sell4: '無事入場後に売上金をお受け取り'
      },
      venueSupportSection: {
        headline: '会場ゲートでお困りですか？現地にスタッフがいます。',
        copy: '対象公演では、入場時にトラブルが発生しても孤立しないよう、Tikum現地PICスタッフが会場で待機しています。',
        cta: '対象イベント一覧を見る'
      },
      sellerSection: {
        headline: '行けなくなったチケットを、安心・確実に。',
        copy: 'シンプルな出品、透明な手数料、本人確認、確実な送金フロー。',
        cta: '今すぐ出品する'
      },
      principles: {
        headline: '信頼の上に構築。人が支えるマーケット。',
        p1Title: '徹底した二次検証',
        p1Desc: 'すべての出品に対して厳正な確認を実施します。',
        p2Title: 'エスクローによる資金保護',
        p2Desc: '入場が完了するまで代金の引き渡しは保留されます。',
        p3Title: '会場現地オペレーション',
        p3Desc: '主要公演のゲートにリアルな運営スタッフを派遣します。'
      },
      footer: {
        product: 'プロダクト',
        company: '企業情報',
        trust: '安全と信頼',
        legal: '法的規約',
        events: 'イベント一覧',
        sell: 'チケット出品',
        how: 'ご利用の流れ',
        supported: 'サポート対象イベント',
        about: '会社概要',
        contact: 'お問い合わせ',
        venuePIC: '会場サポート',
        buyerProt: '購入者保護',
        sellerProt: '出品者保護',
        verifInfo: '検証体制について',
        refund: '返金ポリシー',
        terms: '利用規約',
        privacy: 'プライバシーポリシー',
        cookie: 'Cookie ポリシー',
        disclaimer: '免責事項'
      },
      status: {
        LISTED: '出品中',
        LOCKED: '取引中',
        SOLD: '売約済み',
        RESERVED: '予約済み',
        PENDING_PAYMENT: '支払い待ち',
        PAID: 'エスクロー預託済み',
        ENTRY_CONFIRMED: '入場完了確認',
        SETTLED: '決済精算済み',
        DISPUTED: 'ゲート照会調査中',
        REFUNDED: '返金完了',
        CANCELLED: 'キャンセル',
        PENDING: '確認待ち',
        ACCEPTED: '承諾',
        REJECTED: '却下',
        COUNTERED: '対抗提案中',
        EXPIRED: '期限切れ'
      },
      common: {
        loading: '読み込み中...',
        searchPlaceholder: 'アーティスト、イベント、会場名で検索...',
        filter: '絞り込み',
        allCities: 'すべての都市',
        allCategories: '全カテゴリー',
        fromPrice: '最安値',
        viewTickets: 'チケットを見る',
        details: '詳細',
        officialTickets: '公式プレイガイド',
        noResults: '条件に一致する検証済みイベントは見つかりませんでした。'
      }
    },

    ko: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: '믿을 수 있는 티켓 리셀, 현장 지원까지.',
        copy: '검증된 리스팅, 에스크로 보호 거래, 그리고 필요한 순간 현장에서 제공되는 실제 인력 지원.',
        venueSupport: '현장에서 함께하는 실제 담당자.',
        copyright: '© 2026 Tikum — by Shinerva. All rights reserved.'
      },
      meta: {
        title: 'Tikum — 검증된 리셀 · 현장 전담 지원 | by Shinerva',
        description: '검증된 2차 티켓 마켓플레이스. 내부 에스크로 인프라 보호 및 공연장 현장 전담 지원.'
      },
      nav: {
        events: '전체 공연',
        concerts: '콘서트',
        sports: '스포츠',
        festivals: '페스티벌',
        theater: '뮤지컬·연극',
        comedy: '코미디·쇼',
        howItWorks: '이용 안내',
        search: '검색',
        sellTicket: '티켓 판매',
        myOrders: '내 주문',
        myTickets: '내 티켓',
        support: '고객지원',
        account: '계정',
        signIn: '로그인 / 회원가입',
        findTickets: '티켓 찾기'
      },
      hero: {
        headline: '원하던 바로 그 티켓, 여기에 있습니다.',
        subhead: '검증된 공식 리스팅과 투명한 가격으로 안전하게 거래하세요. 현장 도움이 필요할 때 전담 지원을 제공합니다.',
        ctaFind: '티켓 찾기',
        ctaSell: '티켓 판매하기',
        featuredBadge: '공식 발표 · 검증 완료'
      },
      trust: {
        verified: '검증된 리스팅',
        verifiedDesc: '모든 티켓은 명확한 인증 및 검증 절차를 거칩니다.',
        protected: '안전한 에스크로 거래',
        protectedDesc: '결제 대금은 안전한 내부 에스크로 시스템에 보호되며 입장 확인 후 정산됩니다.',
        venue: '공연장 현장 지원',
        venueDesc: '지원 대상 공연의 경우 공연장 게이트 인근에 Tikum 전담 현장 담당자(PIC)가 상주합니다.',
        pricing: '투명한 가격 정찰제',
        pricingDesc: '티켓 가격, 수수료, 세금을 명확하게 표기하여 숨은 추가 비용이 없습니다.'
      },
      trustStates: {
        VERIFIED: '검증된 리스팅',
        SUPPORT_AVAILABLE: '공연장 현장 지원 가능',
        REMOTE_SUPPORT: '원격 전담 지원',
        PENDING: '검증 심사 중',
        UNAVAILABLE: '현장 지원 미제공'
      },
      operations: {
        headline: '단순한 마켓플레이스를 넘어, 현장에서 힘이 됩니다.',
        subhead: '티켓 등록부터 공연장 입장까지 투명한 운영 흐름.',
        step1Title: '티켓 등록',
        step1Desc: '판매자가 티켓 정보와 예매 증빙을 입력합니다.',
        step2Title: '철저한 검증',
        step2Desc: '시스템과 검증팀이 티켓의 유효성을 정밀 심사합니다.',
        step3Title: '에스크로 보호 구매',
        step3Desc: '구매 대금은 안전하게 보관되어 구매자를 보호합니다.',
        step4Title: '공연 당일',
        step4Desc: '구매자는 검증된 티켓 정보를 지참하고 공연장으로 이동합니다.',
        step5Title: '현장 지원',
        step5Desc: '게이트 입장 문제 발생 시 현장 PIC가 직접 도움을 제공합니다.',
        humanEscalation: '실제 담당자 즉시 대응',
        humanEscalationDesc: '단순 챗봇의 반복 답변이 아닌 실제 운영팀이 직접 소통하여 해결합니다.'
      },
      howItWorks: {
        title: 'Tikum 이용 방법',
        buyTab: '티켓 구매하기',
        buy1: '원하는 공연을 검색하세요',
        buy2: '검증된 리스팅을 선택하세요',
        buy3: '에스크로로 안전하게 결제하세요',
        buy4: '공연 당일까지 안심 지원을 받으세요',
        sellTab: '티켓 판매하기',
        sell1: '남는 티켓을 간편하게 등록하세요',
        sell2: '간단한 검증 절차를 완료하세요',
        sell3: '실제 구매자와 안전하게 매칭됩니다',
        sell4: '구매자 입장 확인 후 정산금을 수령하세요'
      },
      venueSupportSection: {
        headline: '공연장 게이트에서 도움이 필요하신가요? 현장에 저희가 있습니다.',
        copy: '지원 대상 이벤트의 경우 공연장 현장에 전담 인력을 배치하여 입장 오류나 문제 발생 시 관람객을 홀로 두지 않습니다.',
        cta: '지원 공연 목록 확인'
      },
      sellerSection: {
        headline: '사용하지 못하는 티켓을 안전하게 현금화하세요.',
        copy: '간편 등록, 투명한 수수료, 본인 확인, 안전한 정산 프로세스.',
        cta: '지금 티켓 판매하기'
      },
      principles: {
        headline: '신뢰로 시작하여 사람이 완성하는 경험.',
        p1Title: '엄격한 2차 검증',
        p1Desc: '모든 티켓은 등록 전 엄격한 사전 확인을 거칩니다.',
        p2Title: '에스크로 보호망',
        p2Desc: '정상적인 공연장 입장 확인 후에만 판매 대금이 정산됩니다.',
        p3Title: '현장 실물 지원 인력',
        p3Desc: '주요 콘서트 게이트에 실무진을 직접 배치합니다.'
      },
      footer: {
        product: '서비스',
        company: '회사 정보',
        trust: '신뢰 및 안전',
        legal: '법적 고지',
        events: '공연 일정',
        sell: '티켓 판매',
        how: '이용 방법',
        supported: '지원 대상 공연',
        about: '회사 소개',
        contact: '고객센터',
        venuePIC: '현장 지원 안내',
        buyerProt: '구매자 보호',
        sellerProt: '판매자 보호',
        verifInfo: '티켓 검증 기준',
        refund: '환불 규정',
        terms: '이용약관',
        privacy: '개인정보처리방침',
        cookie: '쿠키 정책',
        disclaimer: '책임의 한계'
      },
      status: {
        LISTED: '판매 중',
        LOCKED: '거래 진행 중',
        SOLD: '판매 완료',
        RESERVED: '예약 완료',
        PENDING_PAYMENT: '결제 대기',
        PAID: '에스크로 보관 완료',
        ENTRY_CONFIRMED: '입장 완료 확인',
        SETTLED: '정산 완료',
        DISPUTED: '게이트 확인 중',
        REFUNDED: '환불 완료',
        CANCELLED: '취소됨',
        PENDING: '응답 대기',
        ACCEPTED: '수락됨',
        REJECTED: '거절됨',
        COUNTERED: '역제안 진행 중',
        EXPIRED: '만료됨'
      },
      common: {
        loading: '불러오는 중...',
        searchPlaceholder: '아티스트, 공연, 공연장 검색...',
        filter: '필터',
        allCities: '전체 도시',
        allCategories: '전체 카테고리',
        fromPrice: '최저가',
        viewTickets: '티켓 보기',
        details: '상세 정보',
        officialTickets: '공식 예매처',
        noResults: '조건에 맞는 검증된 공연을 찾을 수 없습니다.'
      }
    },

    es: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'Compra Entradas de Reventa con Confianza.',
        copy: 'Publicaciones verificadas, transacciones protegidas y soporte presencial en el recinto cuando lo necesites.',
        venueSupport: 'Personas reales. En el recinto.',
        copyright: '© 2026 Tikum — by Shinerva. Todos los derechos reservados.'
      },
      meta: {
        title: 'Tikum — Reventa Verificada · Soporte Real en Venue | by Shinerva',
        description: 'Marketplace de reventa de entradas verificado. Protegido por custodia (escrow) y soporte presencial en el recinto.'
      },
      nav: {
        events: 'Eventos',
        concerts: 'Conciertos',
        sports: 'Deportes',
        festivals: 'Festivales',
        theater: 'Teatro',
        comedy: 'Comedia',
        howItWorks: 'Cómo Funciona',
        search: 'Buscar',
        sellTicket: 'Vender Entrada',
        myOrders: 'Mis Pedidos',
        myTickets: 'Mis Entradas',
        support: 'Soporte',
        account: 'Cuenta',
        signIn: 'Iniciar Sesión / Registro',
        findTickets: 'Buscar Entradas'
      },
      hero: {
        headline: 'La entrada que buscas puede estar aquí.',
        subhead: 'Compra y vende entradas de reventa con publicaciones verificadas, precios transparentes y soporte humano en el recinto cuando realmente importa.',
        ctaFind: 'Buscar Entradas',
        ctaSell: 'Vender Entrada',
        featuredBadge: 'ANUNCIO OFICIAL DESTACADO'
      },
      trust: {
        verified: 'Listados Verificados',
        verifiedDesc: 'Cada entrada pasa por controles definidos de autenticidad.',
        protected: 'Transacciones Protegidas',
        protectedDesc: 'El pago se custodia de forma segura hasta confirmar la entrada al evento.',
        venue: 'Soporte Presencial en Venue',
        venueDesc: 'Para eventos seleccionados, Tikum cuenta con personal de soporte en el recinto.',
        pricing: 'Precios Transparentes',
        pricingDesc: 'Desglose claro de precio base, tasas e impuestos sin cargos ocultos.'
      },
      trustStates: {
        VERIFIED: 'Listado Verificado',
        SUPPORT_AVAILABLE: 'Soporte en Venue Disponible',
        REMOTE_SUPPORT: 'Soporte Remoto Disponible',
        PENDING: 'Verificación Pendiente',
        UNAVAILABLE: 'Soporte No Disponible'
      },
      operations: {
        headline: 'Más que un Marketplace. Estamos allí cuando nos necesitas.',
        subhead: 'Un flujo operativo transparente desde la publicación hasta la puerta del evento.',
        step1Title: 'Publicación',
        step1Desc: 'El vendedor ingresa los datos y comprobantes de la entrada.',
        step2Title: 'Verificación',
        step2Desc: 'Controles automatizados y humanos comprueban la validez del ticket.',
        step3Title: 'Compra Protegida',
        step3Desc: 'Los fondos del comprador quedan retenidos en custodia segura (escrow).',
        step4Title: 'Día del Evento',
        step4Desc: 'El comprador acude al recinto con sus credenciales verificadas.',
        step5Title: 'Soporte en Venue',
        step5Desc: 'Un coordinador de Tikum asiste en el lugar si surge un imprevisto en el torno.',
        humanEscalation: 'Escalación Humana Real',
        humanEscalationDesc: 'Si algo sale mal, no quedas atrapado en un chatbot sin salida.'
      },
      howItWorks: {
        title: 'Cómo Funciona Tikum',
        buyTab: 'Comprar Entradas',
        buy1: 'Encuentra tu evento',
        buy2: 'Elige una publicación verificada',
        buy3: 'Paga de forma segura con custodia',
        buy4: 'Recibe soporte hasta el día del evento',
        sellTab: 'Vender Entradas',
        sell1: 'Publica tu entrada no utilizada',
        sell2: 'Verifica tu publicación',
        sell3: 'Conéctate con un comprador',
        sell4: 'Recibe el pago tras el acceso al evento'
      },
      venueSupportSection: {
        headline: '¿Necesitas ayuda en el recinto? Tenemos personas allí.',
        copy: 'Para eventos compatibles, Tikum proporciona un coordinador local en el lugar para que los compradores nunca queden desamparados ante problemas en el acceso.',
        cta: 'Ver Eventos con Soporte'
      },
      sellerSection: {
        headline: 'Convierte una entrada no utilizada en dinero.',
        copy: 'Publicación sencilla, precios transparentes, verificación de identidad, comunicación directa y liquidación segura.',
        cta: 'Vender Entrada'
      },
      principles: {
        headline: 'Construido sobre la Confianza. Respaldado por Personas Reales.',
        p1Title: 'Reventa Secundaria Verificada',
        p1Desc: 'Cada entrada se revisa metódicamente antes de ser ofrecida.',
        p2Title: 'Carril de Custodia Protegido',
        p2Desc: 'El vendedor cobra únicamente tras el acceso exitoso del asistente.',
        p3Title: 'Presencia Física en el Recinto',
        p3Desc: 'Personal desplegado en los accesos para resolver incidencias.'
      },
      footer: {
        product: 'Producto',
        company: 'Empresa',
        trust: 'Seguridad y Confianza',
        legal: 'Legal',
        events: 'Eventos',
        sell: 'Vender Entradas',
        how: 'Cómo Funciona',
        supported: 'Eventos con Soporte',
        about: 'Sobre Nosotros',
        contact: 'Contacto',
        venuePIC: 'Soporte en Venue',
        buyerProt: 'Protección al Comprador',
        sellerProt: 'Protección al Vendedor',
        verifInfo: 'Verificación',
        refund: 'Política de Reembolso',
        terms: 'Términos y Condiciones',
        privacy: 'Política de Privacidad',
        cookie: 'Política de Cookies',
        disclaimer: 'Aviso Legal'
      },
      status: {
        LISTED: 'Disponible',
        LOCKED: 'En Transacción',
        SOLD: 'Vendida',
        RESERVED: 'Reservada',
        PENDING_PAYMENT: 'Pendiente de Pago',
        PAID: 'Custodia Asegurada',
        ENTRY_CONFIRMED: 'Entrada Confirmada',
        SETTLED: 'Liquidado y Pagado',
        DISPUTED: 'En Investigación en Acceso',
        REFUNDED: 'Reembolsado',
        CANCELLED: 'Cancelado',
        PENDING: 'Pendiente',
        ACCEPTED: 'Aceptado',
        REJECTED: 'Rechazado',
        COUNTERED: 'Contraoferta',
        EXPIRED: 'Expirado'
      },
      common: {
        loading: 'Cargando datos...',
        searchPlaceholder: 'Buscar artista, evento o recinto...',
        filter: 'Filtrar',
        allCities: 'Todas las Ciudades',
        allCategories: 'Todas las Categorías',
        fromPrice: 'Desde',
        viewTickets: 'Ver Entradas',
        details: 'Detalles',
        officialTickets: 'Entradas Oficiales',
        noResults: 'No se encontraron eventos verificados con tu búsqueda.'
      }
    },

    'pt-BR': {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'Compre Ingressos de Revenda com Confiança.',
        copy: 'Anúncios verificados, transações protegidas e suporte presencial quando você precisar.',
        venueSupport: 'Pessoas reais. No local do evento.',
        copyright: '© 2026 Tikum — by Shinerva. Todos os direitos reservados.'
      },
      meta: {
        title: 'Tikum — Revenda Verificada · Suporte Real no Local | by Shinerva',
        description: 'Marketplace de revenda de ingressos verificado. Protegido por custódia (escrow) e suporte presencial no local do evento.'
      },
      nav: {
        events: 'Eventos',
        concerts: 'Shows',
        sports: 'Esportes',
        festivals: 'Festivais',
        theater: 'Teatro',
        comedy: 'Comédia',
        howItWorks: 'Como Funciona',
        search: 'Buscar',
        sellTicket: 'Vender Ingresso',
        myOrders: 'Meus Pedidos',
        myTickets: 'Meus Ingressos',
        support: 'Suporte',
        account: 'Conta',
        signIn: 'Entrar / Cadastrar',
        findTickets: 'Encontrar Ingressos'
      },
      hero: {
        headline: 'O ingresso que você procura pode estar aqui.',
        subhead: 'Compre e venda ingressos com anúncios verificados, preços transparentes e suporte presencial quando você precisar.',
        ctaFind: 'Encontrar Ingressos',
        ctaSell: 'Vender Ingresso',
        featuredBadge: 'ANÚNCIO OFICIAL EM DESTAQUE'
      },
      trust: {
        verified: 'Anúncios Verificados',
        verifiedDesc: 'Todos os ingressos passam por rigoroso controle de autenticidade.',
        protected: 'Transações Protegidas',
        protectedDesc: 'Pagamentos retidos com segurança em garantia (escrow) até a entrada confirmada.',
        venue: 'Suporte no Local do Evento',
        venueDesc: 'Para eventos selecionados, disponibilizamos equipe de apoio presencial nos portões.',
        pricing: 'Preço Transparente',
        pricingDesc: 'Detalhamento explícito de ingressos, taxas e impostos sem cobranças ocultas.'
      },
      trustStates: {
        VERIFIED: 'Anúncio Verificado',
        SUPPORT_AVAILABLE: 'Suporte no Local Disponível',
        REMOTE_SUPPORT: 'Suporte Remoto Disponível',
        PENDING: 'Verificação Pendente',
        UNAVAILABLE: 'Suporte Indisponível'
      },
      operations: {
        headline: 'Mais que um Marketplace. Estamos lá quando você precisa.',
        subhead: 'Fluxo operacional transparente desde o anúncio até a entrada no show.',
        step1Title: 'Anúncio',
        step1Desc: 'O vendedor envia as informações e comprovantes do ingresso.',
        step2Title: 'Verificação',
        step2Desc: 'Checagem rigorosa de autenticidade e regras do ingresso.',
        step3Title: 'Compra Protegida',
        step3Desc: 'O valor pago fica retido em custódia segura até o evento.',
        step4Title: 'Dia do Evento',
        step4Desc: 'O comprador chega ao local com as credenciais validadas.',
        step5Title: 'Suporte Presencial',
        step5Desc: 'Equipe Tikum à disposição nos portões caso ocorra algum problema na catraca.',
        humanEscalation: 'Atendimento Humano Direto',
        humanEscalationDesc: 'Quando algo dá errado, você fala com pessoas de verdade, sem ficar preso em chatbots.'
      },
      howItWorks: {
        title: 'Como Funciona a Tikum',
        buyTab: 'Comprar Ingressos',
        buy1: 'Encontre o seu evento',
        buy2: 'Escolha um anúncio verificado',
        buy3: 'Pague com segurança via garantia',
        buy4: 'Conte com suporte até o dia do evento',
        sellTab: 'Vender Ingressos',
        sell1: 'Cadastre o ingresso que não vai usar',
        sell2: 'Complete a verificação do anúncio',
        sell3: 'Conecte-se com um comprador',
        sell4: 'Receba o pagamento após o evento'
      },
      venueSupportSection: {
        headline: 'Precisa de ajuda no local? Nós estamos lá.',
        copy: 'Para eventos selecionados, a Tikum mantém um coordenador no local para que os fãs nunca fiquem desamparados caso haja problemas na entrada.',
        cta: 'Ver Eventos Suportados'
      },
      sellerSection: {
        headline: 'Transforme ingressos parados em dinheiro.',
        copy: 'Cadastro simples, tarifas claras, verificação de identidade, comunicação direta e repasse seguro.',
        cta: 'Vender Meu Ingresso'
      },
      principles: {
        headline: 'Baseado na Confiança. Apoiado por Pessoas Reais.',
        p1Title: 'Revenda Verificada',
        p1Desc: 'Análise minuciosa de cada ingresso antes de ser ofertado.',
        p2Title: 'Custódia em Garantia',
        p2Desc: 'O vendedor só recebe após a entrada confirmada no local.',
        p3Title: 'Apoio Presencial no Portão',
        p3Desc: 'Equipe no local para resolver quaisquer atritos de entrada.'
      },
      footer: {
        product: 'Produto',
        company: 'Empresa',
        trust: 'Segurança e Confiança',
        legal: 'Jurídico',
        events: 'Eventos',
        sell: 'Vender Ingressos',
        how: 'Como Funciona',
        supported: 'Eventos Suportados',
        about: 'Sobre Nós',
        contact: 'Contato',
        venuePIC: 'Suporte Presencial',
        buyerProt: 'Proteção ao Comprador',
        sellerProt: 'Proteção ao Vendedor',
        verifInfo: 'Verificação',
        refund: 'Política de Reembolso',
        terms: 'Termos de Serviço',
        privacy: 'Política de Privacidade',
        cookie: 'Política de Cookies',
        disclaimer: 'Aviso Legal'
      },
      status: {
        LISTED: 'Disponível',
        LOCKED: 'Em Transação',
        SOLD: 'Vendido',
        RESERVED: 'Reservado',
        PENDING_PAYMENT: 'Aguardando Pagamento',
        PAID: 'Garantia Assegurada',
        ENTRY_CONFIRMED: 'Entrada Confirmada',
        SETTLED: 'Liquidado e Pago',
        DISPUTED: 'Em Investigação no Portão',
        REFUNDED: 'Reembolsado',
        CANCELLED: 'Cancelado',
        PENDING: 'Pendente',
        ACCEPTED: 'Aceito',
        REJECTED: 'Recusado',
        COUNTERED: 'Contraproposta',
        EXPIRED: 'Expirado'
      },
      common: {
        loading: 'Carregando...',
        searchPlaceholder: 'Buscar artista, evento ou local...',
        filter: 'Filtrar',
        allCities: 'Todas as Cidades',
        allCategories: 'Todas as Categorias',
        fromPrice: 'A partir de',
        viewTickets: 'Ver Ingressos',
        details: 'Detalhes',
        officialTickets: 'Ingressos Oficiais',
        noResults: 'Nenhum evento verificado encontrado para a sua busca.'
      }
    },

    fr: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'Achetez des Billets de Revente en Toute Confiance.',
        copy: 'Annonces vérifiées, transactions protégées et assistance humaine sur place en cas de besoin.',
        venueSupport: 'Des personnes réelles. Sur place.',
        copyright: '© 2026 Tikum — by Shinerva. Tous droits réservés.'
      },
      meta: {
        title: 'Tikum — Revente Vérifiée · Support Réel sur Place | by Shinerva',
        description: 'Place de marché de revente de billets vérifiée. Protection par séquestre (escrow) et présence opérationnelle aux portes de la salle.'
      },
      nav: {
        events: 'Événements',
        concerts: 'Concerts',
        sports: 'Sports',
        festivals: 'Festivals',
        theater: 'Théâtre',
        comedy: 'Humour',
        howItWorks: 'Comment ça marche',
        search: 'Recherche',
        sellTicket: 'Vendre un Billet',
        myOrders: 'Mes Commandes',
        myTickets: 'Mes Billets',
        support: 'Assistance',
        account: 'Compte',
        signIn: 'Connexion / Inscription',
        findTickets: 'Trouver des Billets'
      },
      hero: {
        headline: 'Le billet que vous cherchez est peut-être déjà ici.',
        subhead: 'Achetez et revendez vos billets avec des annonces vérifiées, des prix transparents et une assistance humaine sur place lorsque cela compte.',
        ctaFind: 'Trouver des Billets',
        ctaSell: 'Vendre un Billet',
        featuredBadge: 'ANNONCE OFFICIELLE VÉRIFIÉE'
      },
      trust: {
        verified: 'Annonces Vérifiées',
        verifiedDesc: 'Chaque billet fait l\'objet d\'un contrôle de conformité strict.',
        protected: 'Transactions Protégées',
        protectedDesc: 'Fonds sécurisés sous séquestre (escrow) jusqu\'à confirmation de l\'accès à l\'événement.',
        venue: 'Assistance sur Place',
        venueDesc: 'Pour les événements éligibles, un référent Tikum est présent aux abords de la salle.',
        pricing: 'Tarification Transparente',
        pricingDesc: 'Détail précis du billet, des frais de service et des taxes sans frais cachés.'
      },
      trustStates: {
        VERIFIED: 'Annonce Vérifiée',
        SUPPORT_AVAILABLE: 'Assistance sur Place Disponible',
        REMOTE_SUPPORT: 'Assistance à Distance Disponible',
        PENDING: 'Vérification en Cours',
        UNAVAILABLE: 'Assistance Non Disponible'
      },
      operations: {
        headline: 'Plus qu\'une Plateforme. Nous sommes là quand vous en avez besoin.',
        subhead: 'Un parcours opérationnel transparent, de la mise en vente aux portes de l\'événement.',
        step1Title: 'Mise en vente',
        step1Desc: 'Le vendeur fournit les détails et la preuve d\'achat du billet.',
        step2Title: 'Vérification',
        step2Desc: 'Contrôles humains et techniques pour valider l\'authenticité.',
        step3Title: 'Achat Sécurisé',
        step3Desc: 'Le paiement est consigné sous séquestre jusqu\'à l\'admission.',
        step4Title: 'Jour de l\'événement',
        step4Desc: 'L\'acheteur se présente à la salle avec son titre vérifié.',
        step5Title: 'Support sur Place',
        step5Desc: 'Un coordinateur Tikum est mobilisable sur site en cas d\'anomalie au tourniquet.',
        humanEscalation: 'Interlocuteur Humain Dédié',
        humanEscalationDesc: 'En cas de difficulté, vous n\'êtes jamais abandonné face à un chatbot sans issue.'
      },
      howItWorks: {
        title: 'Comment Fonctionne Tikum',
        buyTab: 'Acheter des Billets',
        buy1: 'Trouvez votre événement',
        buy2: 'Choisissez une annonce vérifiée',
        buy3: 'Payez en toute sécurité via séquestre',
        buy4: 'Profitez d\'un support jusqu\'au jour J',
        sellTab: 'Vendre des Billets',
        sell1: 'Publiez votre billet inutilisé',
        sell2: 'Faites vérifier votre annonce',
        sell3: 'Trouvez un acheteur en toute simplicité',
        sell4: 'Recevez votre paiement après le concert'
      },
      venueSupportSection: {
        headline: 'Besoin d\'aide sur place ? Nos équipes sont présentes.',
        copy: 'Sur les événements majeurs, Tikum détache un coordinateur local aux abords du site pour éviter toute déconvenue aux portes de la salle.',
        cta: 'Voir les Événements Couverts'
      },
      sellerSection: {
        headline: 'Transformez un billet inutilisé en argent en toute sécurité.',
        copy: 'Mise en ligne intuitive, tarifs clairs, contrôle d\'identité et virement garanti.',
        cta: 'Vendre Mon Billet'
      },
      principles: {
        headline: 'Fondé sur la Confiance. Porté par de Vraies Équipes.',
        p1Title: 'Revente Contrôlée',
        p1Desc: 'Contrôle minutieux de chaque billet avant publication.',
        p2Title: 'Séquestre Intégral',
        p2Desc: 'Paiement débloqué uniquement après admission réussie.',
        p3Title: 'Présence Terrain Réelle',
        p3Desc: 'Équipes physiques déployées sur les principaux événements.'
      },
      footer: {
        product: 'Produit',
        company: 'Société',
        trust: 'Confiance & Sécurité',
        legal: 'Mentions Légales',
        events: 'Événements',
        sell: 'Vendre des Billets',
        how: 'Fonctionnement',
        supported: 'Événements Couverts',
        about: 'À Propos',
        contact: 'Contactez-nous',
        venuePIC: 'Assistance sur Place',
        buyerProt: 'Protection Acheteur',
        sellerProt: 'Protection Vendeur',
        verifInfo: 'Vérification des Billets',
        refund: 'Politique de Remboursement',
        terms: 'Conditions Générales',
        privacy: 'Politique de Confidentialité',
        cookie: 'Politique de Cookies',
        disclaimer: 'Avertissement Légal'
      },
      status: {
        LISTED: 'Disponible',
        LOCKED: 'En Transaction',
        SOLD: 'Vendu',
        RESERVED: 'Réservé',
        PENDING_PAYMENT: 'En Attente de Paiement',
        PAID: 'Fonds sous Séquestre',
        ENTRY_CONFIRMED: 'Entrée Confirmée',
        SETTLED: 'Paiement Débloqué',
        DISPUTED: 'Contrôle Tourniquet en Cours',
        REFUNDED: 'Remboursé',
        CANCELLED: 'Annulé',
        PENDING: 'En Attente',
        ACCEPTED: 'Accepté',
        REJECTED: 'Refusé',
        COUNTERED: 'Contre-offre',
        EXPIRED: 'Expiré'
      },
      common: {
        loading: 'Chargement en cours...',
        searchPlaceholder: 'Rechercher un artiste, concert ou salle...',
        filter: 'Filtrer',
        allCities: 'Toutes les Villes',
        allCategories: 'Toutes les Catégories',
        fromPrice: 'Dès',
        viewTickets: 'Voir les Billets',
        details: 'Détails',
        officialTickets: 'Billetterie Officielle',
        noResults: 'Aucun événement vérifié ne correspond à votre recherche.'
      }
    },

    ar: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'شراء تذاكر إعادة البيع بكل ثقة.',
        copy: 'قوائم تذاكر موثوقة، معاملات محمية بالضمان، ودعم بشري حقيقي في موقع الفعالية عند حاجتك.',
        venueSupport: 'أشخاص حقيقيون. في موقع الفعالية.',
        copyright: '© 2026 Tikum — by Shinerva. جميع الحقوق محفوظة.'
      },
      meta: {
        title: 'Tikum — إعادة بيع موثوقة · دعم ميداني حقيقي | by Shinerva',
        description: 'سوق تذاكر الفعاليات المعاد بيعها بعد التحقق الموثق. معاملات محمية عبر نظام الضمان وحضور ميداني عند البوابات.'
      },
      nav: {
        events: 'جميع الفعاليات',
        concerts: 'الحفلات الموسيقية',
        sports: 'الرياضة',
        festivals: 'المهرجانات',
        theater: 'المسرح',
        comedy: 'الكوميديا',
        howItWorks: 'كيف نعمل',
        search: 'بحث',
        sellTicket: 'بيع تذكرة',
        myOrders: 'طلباتي',
        myTickets: 'تذاكري',
        support: 'المساعدة',
        account: 'الحساب',
        signIn: 'تسجيل الدخول / إنشاء حساب',
        findTickets: 'البحث عن التذاكر'
      },
      hero: {
        headline: 'التذكرة التي تبحث عنها قد تكون هنا بالفعل.',
        subhead: 'اشترِ وبِع تذاكر الفعاليات مع قوائم موثوقة، وأسعار شفافة، ودعم بشري حقيقي في موقع الفعالية عند حاجتك.',
        ctaFind: 'البحث عن التذاكر',
        ctaSell: 'بيع تذكرة',
        featuredBadge: 'إعلان رسمي موثق'
      },
      trust: {
        verified: 'قوائم موثقة',
        verifiedDesc: 'تخضع كل تذكرة معروضة لضوابط تحقق واضحة ومسبقة.',
        protected: 'معاملات محمية',
        protectedDesc: 'تتم حماية المدفوعات عبر نظام الضمان حتى تأكيد الدخول إلى الفعالية.',
        venue: 'دعم ميداني في الموقع',
        venueDesc: 'للإيفنتات المؤهلة، نوفر منسقاً ميدانياً عند بوابات الفعالية لتقديم المساعدة.',
        pricing: 'شفافية تامة في الأسعار',
        pricingDesc: 'تفصيل كامل لسعر التذكرة والرسوم والضرائب دون أي مبالغ خفية.'
      },
      trustStates: {
        VERIFIED: 'قائمة موثقة',
        SUPPORT_AVAILABLE: 'دعم ميداني متاح في الفعالية',
        REMOTE_SUPPORT: 'دعم متاح عن بُعد',
        PENDING: 'قيد التحقق',
        UNAVAILABLE: 'الدعم الميداني غير متوفر'
      },
      operations: {
        headline: 'أكثر من مجرد منصة. نحن معك عند البوابات.',
        subhead: 'مسار تشغيلي واضح وشفاف من لحظة إدراج التذكرة حتى دخول القاعة.',
        step1Title: 'عرض التذكرة',
        step1Desc: 'يقوم البائع بإدخال بيانات التذكرة وإثبات الحجز.',
        step2Title: 'التحقق الدقيق',
        step2Desc: 'فحص إلكتروني وبشري للتأكد من صحة التذكرة وشروطها.',
        step3Title: 'شراء محمي',
        step3Desc: 'تظل أموال المشتري مودعة في حساب الضمان حتى نجاح الدخول.',
        step4Title: 'يوم الفعالية',
        step4Desc: 'يصل المشتري إلى الفعالية ومعه بيانات التذكرة المعتمدة.',
        step5Title: 'الدعم في الموقع',
        step5Desc: 'يتواجد منسق Tikum عند البوابات لمعالجة أي إشكال فوري.',
        humanEscalation: 'تواصل بشري مباشر',
        humanEscalationDesc: 'في حال واجهتك مشكلة، لن تترك في حلقة مفرغة مع روبوت المحادثة.'
      },
      howItWorks: {
        title: 'كيف تعمل منصة Tikum',
        buyTab: 'شراء التذاكر',
        buy1: 'اختر الفعالية التي تفضلها',
        buy2: 'اختر تذكرة معتمدة وموثقة',
        buy3: 'ادفع بأمان عبر حساب الضمان',
        buy4: 'احصل على الدعم حتى يوم الفعالية',
        sellTab: 'بيع التذاكر',
        sell1: 'اعرض تذكرتك الزائدة عن الحاجة',
        sell2: 'أكمل خطوات التحقق من التذكرة',
        sell3: 'التقِ بمشترٍ موثوق',
        sell4: 'استلم مستحقاتك بعد الفعالية'
      },
      venueSupportSection: {
        headline: 'هل تحتاج إلى مساعدة في الفعالية؟ فريقنا متواجد هناك.',
        copy: 'للإيفنتات المدعومة، نوفر منسقاً محلياً عند البوابات حتى لا يُترك المشترون بمفردهم إذا طرأ أي عائق في نظام التذاكر.',
        cta: 'عرض الفعاليات المدعومة'
      },
      sellerSection: {
        headline: 'حوّل التذاكر غير المستخدمة إلى سيولة بكل أمان.',
        copy: 'إدراج مبسط، تسعير شفاف، تحقق من الهوية، وتواصل مباشر ومسار تحويل مضمون.',
        cta: 'بيع تذكرتك الآن'
      },
      principles: {
        headline: 'مبني على الثقة، ومدعوم بفريق ميداني حقيقي.',
        p1Title: 'إعادة بيع موثقة',
        p1Desc: 'فحص منهجي لكل تذكرة قبل طرحها للمشترين.',
        p2Title: 'حماية كاملة بالضمان',
        p2Desc: 'لا يتم تحويل الأموال للبائع إلا بعد تأكيد دخول المشتري.',
        p3Title: 'تواجد ميداني عند البوابات',
        p3Desc: 'موظفون حقيقيون عند البوابات لتذليل أي عقبة في الدخول.'
      },
      footer: {
        product: 'المنتج',
        company: 'الشركة',
        trust: 'الثقة والأمان',
        legal: 'الشؤون القانونية',
        events: 'دليل الفعاليات',
        sell: 'بيع التذاكر',
        how: 'آلية العمل',
        supported: 'الفعاليات المدعومة',
        about: 'من نحن',
        contact: 'اتصل بنا',
        venuePIC: 'الدعم الميداني',
        buyerProt: 'حماية المشتري',
        sellerProt: 'حماية البائع',
        verifInfo: 'آلية التحقق',
        refund: 'سياسة الاسترجاع',
        terms: 'الشروط والأحكام',
        privacy: 'سياسة الخصوصية',
        cookie: 'ملفات تعريف الارتباط',
        disclaimer: 'إخلاء المسؤولية'
      },
      status: {
        LISTED: 'متاحة',
        LOCKED: 'قيد المعاملة',
        SOLD: 'تم البيع',
        RESERVED: 'محجوزة',
        PENDING_PAYMENT: 'بانتظار الدفع',
        PAID: 'مؤمّنة في الضمان',
        ENTRY_CONFIRMED: 'تم تأكيد الدخول',
        SETTLED: 'تمت التسوية والتحويل',
        DISPUTED: 'قيد التحقيق في البوابة',
        REFUNDED: 'تم رد المبلغ',
        CANCELLED: 'ملغاة',
        PENDING: 'بانتظار الرد',
        ACCEPTED: 'مقبولة',
        REJECTED: 'مرفوضة',
        COUNTERED: 'عرض مقابل',
        EXPIRED: 'منتهية الصلاحية'
      },
      common: {
        loading: 'جاري التحميل...',
        searchPlaceholder: 'ابحث عن فنان، فعالية، أو موقع...',
        filter: 'تصفية',
        allCities: 'جميع المدن',
        allCategories: 'جميع الفئات',
        fromPrice: 'ابتداءً من',
        viewTickets: 'عرض التذاكر',
        details: 'التفاصيل',
        officialTickets: 'التذاكر الرسمية',
        noResults: 'لم يتم العثور على فعاليات موثقة مطابقة لبحثك.'
      }
    },

    hi: {
      brand: {
        name: 'Tikum',
        byline: 'by Shinerva',
        tagline: 'Verified Resale. Real Support.',
        slogan: 'पूरे विश्वास के साथ रीसेल टिकट खरीदें।',
        copy: 'सत्यापित लिस्टिंग, सुरक्षित लेन-देन और ज़रूरत पड़ने पर कार्यक्रम स्थल पर वास्तविक मानव सहायता।',
        venueSupport: 'वास्तविक लोग। वेन्यू पर।',
        copyright: '© 2026 Tikum — by Shinerva. सर्वाधिकार सुरक्षित।'
      },
      meta: {
        title: 'Tikum — सत्यापित रीसेल · वास्तविक वेन्यू सहायता | by Shinerva',
        description: 'सत्यापित सेकंडरी टिकट मार्केटप्लेस। एस्क्रो सुरक्षा और वेन्यू गेट पर समर्पित प्रतिनिधि सहायता।'
      },
      nav: {
        events: 'सभी कार्यक्रम',
        concerts: 'कॉन्सर्ट',
        sports: 'खेल',
        festivals: 'उत्सव / फेस्ट',
        theater: 'थिएटर',
        comedy: 'कॉमेडी',
        howItWorks: 'यह कैसे काम करता है',
        search: 'खोजें',
        sellTicket: 'टिकट बेचें',
        myOrders: 'मेरे ऑर्डर',
        myTickets: 'मेरे टिकट',
        support: 'सहायता',
        account: 'खाता',
        signIn: 'लॉग इन / साइन अप',
        findTickets: 'टिकट खोजें'
      },
      hero: {
        headline: 'जो टिकट आप चाहते हैं, वह शायद यहीं है।',
        subhead: 'सत्यापित लिस्टिंग, पारदर्शी मूल्य निर्धारण और कार्यक्रम स्थल पर वास्तविक मानव सहायता के साथ टिकट खरीदें और बेचें।',
        ctaFind: 'टिकट खोजें',
        ctaSell: 'टिकट बेचें',
        featuredBadge: 'विशेष आधिकारिक घोषणा'
      },
      trust: {
        verified: 'सत्यापित लिस्टिंग',
        verifiedDesc: 'प्रत्येक लिस्टिंग स्पष्ट सत्यापन नियंत्रणों से होकर गुजरती है।',
        protected: 'सुरक्षित लेन-देन',
        protectedDesc: 'भुगतान और लेन-देन आंतरिक एस्क्रो प्रणाली द्वारा सुरक्षित रखा जाता है।',
        venue: 'वेन्यू पर मानव सहायता',
        venueDesc: 'समर्थित कार्यक्रमों के लिए, टिकम वेन्यू गेट पर स्थानीय पीआईसी प्रतिनिधि उपलब्ध कराता है।',
        pricing: 'पारदर्शी मूल्य',
        pricingDesc: 'बिना किसी छुपे हुए शुल्क के टिकट मूल्य, सेवा शुल्क और करों का स्पष्ट विवरण।'
      },
      trustStates: {
        VERIFIED: 'सत्यापित लिस्टिंग',
        SUPPORT_AVAILABLE: 'वेन्यू सहायता उपलब्ध',
        REMOTE_SUPPORT: 'रिमोट सहायता उपलब्ध',
        PENDING: 'सत्यापन प्रक्रियाधीन',
        UNAVAILABLE: 'सहायता उपलब्ध नहीं'
      },
      operations: {
        headline: 'सिर्फ एक मार्केटप्लेस नहीं। ज़रूरत पड़ने पर हम वेन्यू पर मौजूद हैं।',
        subhead: 'टिकट लिस्टिंग से लेकर वेन्यू गेट तक एक पूरी तरह से पारदर्शी प्रक्रिया।',
        step1Title: 'लिस्टिंग',
        step1Desc: 'विक्रेता टिकट का विवरण और मूल बुकिंग का प्रमाण दर्ज करता है।',
        step2Title: 'सत्यापन',
        step2Desc: 'सिस्टम और टीम द्वारा टिकट की सत्यता की पुष्टि की जाती है।',
        step3Title: 'सुरक्षित खरीद',
        step3Desc: 'खरीदार का भुगतान वेन्यू में प्रवेश तक सुरक्षित एस्क्रो में रहता है।',
        step4Title: 'इवेंट का दिन',
        step4Desc: 'खरीदार सत्यापित टिकट के साथ कार्यक्रम स्थल पर पहुंचता है।',
        step5Title: 'वेन्यू सहायता',
        step5Desc: 'गेट पर किसी भी रुकावट की स्थिति में टिकम का स्थानीय प्रतिनिधि सहायता करता है।',
        humanEscalation: 'वास्तविक व्यक्ति से संपर्क',
        humanEscalationDesc: 'समस्या आने पर आप चैटबॉट के चक्रव्यूह में नहीं फंसते, हमारी टीम सीधे मदद करती है।'
      },
      howItWorks: {
        title: 'टिकम कैसे काम करता है',
        buyTab: 'टिकट खरीदें',
        buy1: 'अपना पसंदीदा इवेंट चुनें',
        buy2: 'सत्यापित लिस्टिंग चुनें',
        buy3: 'एस्क्रो के माध्यम से सुरक्षित भुगतान करें',
        buy4: 'इवेंट के दिन तक सहायता प्राप्त करें',
        sellTab: 'टिकट बेचें',
        sell1: 'अपने अतिरिक्त टिकट की लिस्टिंग करें',
        sell2: 'आवश्यक सत्यापन पूरा करें',
        sell3: 'वास्तविक खरीदार से जुड़ें',
        sell4: 'इवेंट के बाद अपना भुगतान प्राप्त करें'
      },
      venueSupportSection: {
        headline: 'वेन्यू पर सहायता चाहिए? हमारी टीम वहां मौजूद है।',
        copy: 'पात्र कार्यक्रमों के लिए, टिकम वेन्यू पर स्थानीय प्रतिनिधि उपलब्ध कराता है ताकि गेट पर समस्या आने पर दर्शक अकेले न रहें।',
        cta: 'समर्थित कार्यक्रम देखें'
      },
      sellerSection: {
        headline: 'अप्रयुक्त टिकट को आसानी से नकद में बदलें।',
        copy: 'सरल लिस्टिंग, पारदर्शी शुल्क, पहचान सत्यापन, और सुरक्षित भुगतान प्रक्रिया।',
        cta: 'टिकट अभी बेचें'
      },
      principles: {
        headline: 'विश्वास पर आधारित। वास्तविक लोगों द्वारा समर्थित।',
        p1Title: 'सत्यापित सेकंडरी रीसेल',
        p1Desc: 'प्रशंसकों तक पहुँचने से पहले प्रत्येक टिकट की जांच की जाती है।',
        p2Title: 'सुरक्षित एस्क्रो सुरक्षा',
        p2Desc: 'सफल प्रवेश की पुष्टि के बाद ही विक्रेता को राशि जारी की जाती है।',
        p3Title: 'वेन्यू पर प्रत्यक्ष उपस्थिति',
        p3Desc: 'गेट पर किसी भी रुकावट को हल करने के लिए वास्तविक कर्मचारी तैनात हैं।'
      },
      footer: {
        product: 'उत्पाद',
        company: 'कंपनी',
        trust: 'सुरक्षा और विश्वास',
        legal: 'कानूनी',
        events: 'कार्यक्रम सूची',
        sell: 'टिकट बेचें',
        how: 'कार्यप्रणाली',
        supported: 'समर्थित कार्यक्रम',
        about: 'हमारे बारे में',
        contact: 'संपर्क करें',
        venuePIC: 'वेन्यू सहायता',
        buyerProt: 'खरीदार सुरक्षा',
        sellerProt: 'विक्रेता सुरक्षा',
        verifInfo: 'सत्यापन प्रक्रिया',
        refund: 'रिफंड नीति',
        terms: 'सेवा की शर्तें',
        privacy: 'गोपनीयता नीति',
        cookie: 'कुकी नीति',
        disclaimer: 'अस्वीकरण'
      },
      status: {
        LISTED: 'उपलब्ध',
        LOCKED: 'प्रक्रियाधीन',
        SOLD: 'बिक चुका है',
        RESERVED: 'आरक्षित',
        PENDING_PAYMENT: 'भुगतान प्रतीक्षित',
        PAID: 'एस्क्रो में सुरक्षित',
        ENTRY_CONFIRMED: 'प्रवेश सत्यापित',
        SETTLED: 'भुगतान संपन्न',
        DISPUTED: 'गेट पर जांच जारी',
        REFUNDED: 'धनवापसी पूर्ण',
        CANCELLED: 'रद्द',
        PENDING: 'प्रतीक्षित',
        ACCEPTED: 'स्वीकृत',
        REJECTED: 'अस्वीकृत',
        COUNTERED: 'जवाबी प्रस्ताव',
        EXPIRED: 'समाप्त'
      },
      common: {
        loading: 'लोड हो रहा है...',
        searchPlaceholder: 'कलाकार, इवेंट या वेन्यू खोजें...',
        filter: 'फ़िल्टर',
        allCities: 'सभी शहर',
        allCategories: 'सभी श्रेणियां',
        fromPrice: 'न्यूनतम',
        viewTickets: 'टिकट देखें',
        details: 'विवरण',
        officialTickets: 'आधिकारिक टिकट',
        noResults: 'आपकी खोज से मेल खाने वाले कोई सत्यापित कार्यक्रम नहीं मिले।'
      }
    }
  };

  // State management
  let currentLang = 'id';
  let currentTheme = 'dark';

  if (hasStorage) {
    try {
      const savedLang = localStorage.getItem('tikum_lang');
      if (savedLang) {
        if (savedLang === 'zh') currentLang = 'zh-CN';
        else if (savedLang === 'pt') currentLang = 'pt-BR';
        else if (translations[savedLang]) currentLang = savedLang;
      }
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
    res = getNested(translations.id, key);
    if (res !== undefined) return res;
    res = getNested(translations.en, key);
    if (res !== undefined) return res;
    return fallback !== undefined ? fallback : key;
  }

  function applyLanguage(lang) {
    if (lang === 'zh') lang = 'zh-CN';
    if (lang === 'pt') lang = 'pt-BR';
    if (!translations[lang]) lang = 'id';
    currentLang = lang;

    if (hasStorage) {
      try {
        localStorage.setItem('tikum_lang', lang);
      } catch (e) {}
    }

    if (hasDoc) {
      document.documentElement.lang = lang;
      const isRtl = lang === 'ar';
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

      if (isRtl) {
        document.body.classList.add('rtl-mode');
      } else {
        document.body.classList.remove('rtl-mode');
      }

      // Localized Document Title & Meta Tags
      const localizedTitle = t('meta.title', 'Tikum — Verified Resale. Real Support. | by Shinerva');
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
        const matched = LANGUAGES.find(l => l.code === lang || l.codeAlias === lang);
        const displayLabel = matched ? matched.pill : lang.toUpperCase();
        const innerLabel = langBtn.querySelector('#langLabel');
        if (innerLabel) {
          innerLabel.textContent = displayLabel;
        } else {
          langBtn.textContent = displayLabel;
        }
      }

      // Notify dynamic rendering engines (e.g. renderAllSections)
      window.dispatchEvent(new CustomEvent('tikum:languageChanged', { detail: { lang } }));
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
            <div class="lang-tier-title">10 Global Music &amp; Touring Markets</div>
            <div class="lang-grid" id="langGridContainer"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLangModal();
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
    toggleLang: () => openLangModal(),
    openLangModal,
    closeLangModal,
    toggleTheme: () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'),
    translations,
    languages: LANGUAGES
  };

  if (!isNode) {
    window.TikumI18n = TikumI18n;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TikumI18n;
  }
})();
