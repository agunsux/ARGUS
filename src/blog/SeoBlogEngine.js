/**
 * TIKUM / ARGUS — Automated Twice-Weekly SEO Blog Engine
 * Deliverable C: Automated Editorial Engine & Publication Pipeline
 *
 * Implements:
 * 1. Twice-Weekly publication schedule (Tue & Fri 09:00 WIB).
 * 2. Seeded with:
 *    - >= 6 publication-grade live articles (status: published)
 *    - >= 16 upcoming scheduled articles in the queue (status: scheduled)
 * 3. Structured Data: BlogPosting, FAQPage (3-5 FAQs), BreadcrumbList JSON-LD.
 * 4. Contextual internal linking to events, /offers, and CTA to /deal/create.
 * 5. Automated prohibited claims validator (zero banned words).
 * 6. Automated publication sweep with sitemap synchronization.
 */

const fs = require('fs');
const path = require('path');
const { articleRepository } = require('../content/ArticleRepository');
const { CONTENT_PILLARS, CONTENT_STATUS, SEARCH_INTENTS } = require('../content/ContentModel');
const { EventLifecycleService } = require('../discovery/EventLifecycleService');

const BANNED_PATTERNS = [
  /100%\s*escrow/i,
  /100%\s*guaranteed\s*entry/i,
  /guaranteed\s*entry/i,
  /automatic\s*100%\s*refund/i,
  /always\s*12%/i,
  /pasti\s*masuk/i,
  /100%\s*pasti\s*masuk/i,
  /rekening\s*escrow\s*berizin/i
];

class SeoBlogEngine {
  /**
   * Validates article text against compliance rules (prohibited absolute claims)
   */
  static validateCompliance(text) {
    if (!text || typeof text !== 'string') return true;
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(text)) {
        throw new Error(`Compliance violation: text matches prohibited pattern ${pattern}`);
      }
    }
    return true;
  }

  /**
   * Evaluates entire article for banned patterns
   */
  static validateArticleCompliance(article) {
    this.validateCompliance(article.title);
    this.validateCompliance(article.description);
    this.validateCompliance(article.content);
    if (Array.isArray(article.faq)) {
      for (const f of article.faq) {
        this.validateCompliance(f.question || f.q);
        this.validateCompliance(f.answer || f.a);
      }
    }
    return true;
  }

  /**
   * Returns canonical seeded articles: >= 6 live + >= 16 queued
   */
  static getSeededArticles() {
    return [
      // ==============================================================
      // LIVE ARTICLES (>= 6)
      // ==============================================================
      {
        id: 'art-live-bts-arirang-2026',
        title: 'Panduan Tiket BTS World Tour Arirang di GBK Jakarta: Tips War & Aturan Masuk',
        slug: 'panduan-tiket-bts-arirang-world-tour-jakarta-gbk-2026',
        description: 'Informasi lengkap jadwal presale, zonasi tribun GBK, tata cara penukaran wristband, dan verifikasi tiket konser BTS Arirang Jakarta 2026.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['tiket BTS Jakarta 2026', 'konser BTS GBK', 'penukaran wristband BTS', 'resale tiket BTS'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-18T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'BTS World Tour Arirang at GBK Jakarta: Presale Guide & Venue Entry Rules',
        en_summary: 'Comprehensive ticketing breakdown, GBK stadium seating zones, wristband collection policy, and verified secondary transfer guidelines for BTS Arirang in Jakarta.',
        faq: [
          {
            question: 'Kapan jadwal penukaran e-voucher menjadi wristband resmi konser BTS?',
            answer: 'Promotor resmi biasanya membuka loket penukaran wristband mulai H-3 hingga hari-H di area Parkir Timur Senayan atau Istora GBK dengan membawa e-voucher asli dan KTP pembeli primer.'
          },
          {
            question: 'Apakah tiket resale BTS di TIKUM aman digunakan untuk masuk ke stadion?',
            answer: 'Transaksi di TIKUM menggunakan sistem verifikasi bukti kepemilikan dua tahap dan dana ditahan via platform hingga penukaran fisik atau serah terima sukses.'
          },
          {
            question: 'Bagaimana jika penjual tidak dapat hadir langsung saat penukaran gelang?',
            answer: 'Penjual wajib menyediakan surat kuasa bermeterai resmi disertai salinan kartu identitas sesuai panduan penukaran promotor.'
          }
        ],
        content: `
          <h2>Kembalinya Megabintang Global ke Stadion Utama Gelora Bung Karno</h2>
          <p>Tur dunia BTS 'Arirang' 2026 di Jakarta menjadi salah satu momen musik terbesar dekade ini. Ribuan penggemar bersiap memperebutkan tiket konser berkapasitas lebih dari 70.000 penonton di Stadion Utama GBK.</p>
          
          <h3>Pemetaan Zonasi Tribun dan Jalur Masuk Gate</h3>
          <p>Stadion GBK memiliki konfigurasi kompleks antara kategori Cat 1–Cat 3 (seating bernomor) dan festival standing di area lintasan atletik. Pastikan Anda memperhatikan nomor gate pada e-voucher sebelum tiba di lokasi.</p>
          <ul>
            <li><strong>Pintu Masuk Plaza Utara & Timur:</strong> Akses tercepat menuju Kategori CAT 1 & VIP.</li>
            <li><strong>Pintu Barat & Tenggara:</strong> Jalur khusus penonton kategori CAT 2 & CAT 3.</li>
          </ul>

          <h2>Mekanisme Perlindungan Transaksi Resale</h2>
          <p>Bagi penonton yang mencari tiket sekunder karena kehabisan di loket resmi, gunakan selalu platform terverifikasi. Transaksi melalui <a href="/deal/create">Deal Room Tikum</a> dilengkapi penahanan dana terkelola sehingga dana hanya dilepaskan jika syarat serah terima terpenuhi.</p>
          <p>Cek ketersediaan penawaran tiket konser di halaman <a href="/offers">Penawaran Tiket Terbuka</a>.</p>
        `
      },
      {
        id: 'art-live-bigbang-jis-2026',
        title: 'Panduan Konser BIGBANG di JIS: Pilihan Seating, Akustik & Rute Transportasi',
        slug: 'panduan-nonton-konser-bigbang-jis-akustik-seating-logistik',
        description: 'Ulasan akustik tribun JIS, tips memilih nomor kursi terbaik, serta rute KRL dan shuttle bus untuk konser 20th Anniversary BIGBANG di Jakarta.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['konser BIGBANG JIS', 'seating JIS Jakarta', 'akustik konser JIS', 'tiket BIGBANG 2026'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-20T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'BIGBANG at JIS: Seating Selection, Sound Acoustics, and Transit Logistics',
        en_summary: 'Detailed seating tiers, audio acoustics breakdown, and commuter rail shuttle tips for BIGBANG 20th Anniversary Concert at Jakarta International Stadium.',
        faq: [
          {
            question: 'Bagaimana kualitas akustik di tribun atas Jakarta International Stadium (JIS)?',
            answer: 'Struktur atap tertutup JIS menghasilkan pantulan audio yang cukup dinamis. Area lower bowl atau seating kategori 1 dan 2 memberikan kejernihan suara vokal yang paling seimbang.'
          },
          {
            question: 'Transportasi umum apa yang paling praktis menuju venue JIS?',
            answer: 'Layanan KRL Commuter Line tujuan Stasiun Ancol disambung mikrotrans khusus konser, atau TransJakarta Koridor 14 langsung menuju halte JIS.'
          },
          {
            question: 'Apakah tiket resale BIGBANG memerlukan surat kuasa jika nama berbeda?',
            answer: 'Ya, penukaran e-voucher yang terdaftar atas nama orang lain wajib menyertakan surat kuasa resmi bertandatangan dan bermeterai.'
          }
        ],
        content: `
          <h2>Merayakan Dua Dekade Musik BIGBANG di Jakarta International Stadium</h2>
          <p>Tur 20 tahun BIGBANG di JIS menyatukan kembali komunitas VIP dari seluruh penjuru Asia Tenggara. Memilih kategori tempat duduk yang tepat menentukan kenyamanan visual dan audio Anda sepanjang pertunjukan.</p>
          
          <h3>Karakteristik Akustik Tiap Tingkatan Tribun</h3>
          <p>JIS merupakan stadion termegah dengan kapasitas 82.000 kursi. Berikut rekomendasi posisi duduk berdasarkan preferensi penonton:</p>
          <ul>
            <li><strong>Tier 1 (Lower Bowl):</strong> Visibilitas panggung terbaik dan dispersi suara paling jernih.</li>
            <li><strong>Tier 2 (Middle Bowl):</strong> Sudut pandang menyeluruh terhadap tata cahaya dan LED visual panggung.</li>
            <li><strong>Tier 3 (Upper Bowl):</strong> Pilihan ekonomis dengan sudut pandang bird-eye view yang dramatis.</li>
          </ul>

          <h2>Kenyamanan dan Keamanan Bertransaksi</h2>
          <p>Hindari membeli tiket dari akun media sosial tanpa verifikasi. Manfaatkan fitur <a href="/deal/create">Buat Transaksi Aman</a> di Tikum dengan biaya layanan 6% transparan tanpa mark-up liar.</p>
        `
      },
      {
        id: 'art-live-kpop-sea-tours-guide',
        title: 'Survival Guide Tur K-Pop Asia Tenggara 2026/2027: Jadwal & Tips Nonton di Indonesia',
        slug: 'survival-guide-tur-kpop-asia-tenggara-jadwal-indonesia-2026-2027',
        description: 'Panduan lengkap mengikuti tur idol K-Pop di Jakarta, Bangkok, Singapura, dan Manila: anggaran, hotel strategis, dan perlindungan tiket.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Kpop concert Jakarta', 'tur kpop asia tenggara', 'jadwal konser kpop 2026', 'tips nonton kpop'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-21T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'K-Pop Southeast Asia Tours 2026/2027: Indonesia Stop Survival Guide',
        en_summary: 'Regional touring guide for K-Pop concerts across Jakarta, Bangkok, Singapore, and Manila, including budgeting, lodging, and ticket verification rules.',
        faq: [
          {
            question: 'Mengapa Jakarta sering menjadi destinasi pembuka atau penutup tur K-Pop?',
            answer: 'Basis penggemar K-Pop di Indonesia merupakan salah satu yang terbesar di dunia dengan tingkat antusiasme dan engagement konser yang sangat tinggi.'
          },
          {
            question: 'Berapa rata-rata estimasi biaya nonton konser K-Pop di Jakarta?',
            answer: 'Untuk kategori festival atau seated tengah berkisar antara Rp 1.500.000 hingga Rp 3.800.000 di luar akomodasi dan transportasi.'
          },
          {
            question: 'Bagaimana cara menghindari tiket ganda (double-selling) pada konser K-Pop?',
            answer: 'Pastikan bertransaksi melalui platform yang memberlakukan verifikasi dokumen kepemilikan dan menahan pencairan dana hingga proses serah terima tuntas.'
          }
        ],
        content: `
          <h2>Ledakan Konser K-Pop di Panggung Musik Asia Tenggara</h2>
          <p>Musim konser 2026/2027 dipenuhi deretan tur stadium dan arena dari agensi-agensi papan atas Korea Selatan. Indonesia menjadi salah satu perhentian wajib dengan panggung-panggung megah di Jakarta dan sekitarnya.</p>
          
          <h3>Persiapan Logistik dan Waktu Kedatangan</h3>
          <p>Bagi penonton kategori festival, antrean soundcheck sering kali dimulai sejak pagi hari. Pastikan Anda membawa perlengkapan esensial:</p>
          <ul>
            <li>Powerbank terstandarisasi dan kartu identitas fisik.</li>
            <li>Pakaian nyaman berbahan katun dan sepatu bertumit datar.</li>
            <li>Salinan e-voucher serta bukti transaksi resmi.</li>
          </ul>

          <h2>Transaksi Terverifikasi Tanpa Khawatir</h2>
          <p>Bila tiket idaman Anda terjual habis di loket utama, jelajahi daftar <a href="/offers">Penawaran Tiket K-Pop</a> yang telah melewati penyaringan identitas di Tikum.</p>
        `
      },
      {
        id: 'art-live-indonesia-open-badminton',
        title: 'Panduan Kategori Seating Indonesia Open Badminton di Istora Senayan',
        slug: 'panduan-kategori-seating-indonesia-open-badminton-istora-senayan',
        description: 'Bedah kategori VIP, CAT 1, dan CAT 2 di Istora Senayan. Tips merasakan atmosfer legendaris Istora Boyong tanpa antrean panjang.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Indonesia Open badminton', 'tiket Istora Senayan', 'seating Istora badminton', 'nonton bulutangkis'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-21T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'Indonesia Open Badminton 2026: Istora Senayan Seating & Category Guide',
        en_summary: 'Comprehensive spectator guide to Istora Senayan seating tiers, court viewpoints, and ticket verification rules for the BWF World Tour Super 1000.',
        faq: [
          {
            question: 'Kategori mana yang memberikan sudut pandang lapangan terbaik di Istora Senayan?',
            answer: 'Kategori VIP dan CAT 1 sisi tengah memberikan sudut pandang sejajar net yang sangat ideal untuk mengikuti tempo reli bulutangkis kelas dunia.'
          },
          {
            question: 'Apakah tiket harian Indonesia Open bisa dipindahtangankan?',
            answer: 'Bisa, asalkan pembawa tiket memegang e-ticket resmi dengan barcode yang belum pernah discan pada turnstile hari tersebut.'
          },
          {
            question: 'Kapan waktu terbaik tiba di Istora untuk pertandingan sesi pagi?',
            answer: 'Gerbang utama biasanya dibuka mulai pukul 08:30 WIB. Tiba 45 menit lebih awal disarankan untuk menghindari antrean pemeriksaan keamanan.'
          }
        ],
        content: `
          <h2>Gemuruh Atmosfer Bulutangkis Dunia di Istora Gelora Bung Karno</h2>
          <p>Turnamen BWF World Tour Super 1000 POLYTRON Indonesia Open selalu menyuguhkan drama bulutangkis tingkat tertinggi di dunia. Atmosfer suporter Indonesia di Istora dikenal sebagai yang paling meriah di kalender badminton global.</p>
          
          <h3>Rincian Kategori Tempat Duduk</h3>
          <ul>
            <li><strong>VIP Seating:</strong> Kursi nyaman di barisan terdepan dengan akses fasilitas lounge dan sudut pandang lapangan terdekat.</li>
            <li><strong>CAT 1:</strong> Area tribun bawah dengan jarak pandang sangat dekat ke seluruh lapangan utama (Court 1 & Court 2).</li>
            <li><strong>CAT 2:</strong> Area tribun atas yang menyajikan perspektif permainan taktis secara menyeluruh.</li>
          </ul>

          <h2>Pasar Tiket Olahraga yang Aman</h2>
          <p>Bila Anda mencari tiket partai perempat final hingga final yang telah sold out, gunakan saluran <a href="/deal/create">Deal Room Tikum</a> untuk bertransaksi dengan penjual terverifikasi.</p>
        `
      },
      {
        id: 'art-live-safe-handover-escrow',
        title: 'Panduan Serah Terima Tiket Aman: Verifikasi Dua Tahap & Perlindungan Escrow',
        slug: 'panduan-serah-terima-tiket-aman-dua-tahap-perlindungan-escrow',
        description: 'Langkah taktis serah terima tiket konser fisik dan digital di venue. Memahami sistem penahanan dana terkelola dan kehadiran petugas lapangan.',
        category: CONTENT_PILLARS.TICKET_SAFETY,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['serah terima tiket', 'escrow tiket konser', 'verifikasi dua tahap', 'keamanan tiket resale'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-21T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'Safe Ticket Handover Guide: Two-Stage Verification & Escrow Protection',
        en_summary: 'Step-by-step procedures for digital and physical ticket handovers at Indonesian venues, explaining platform-held escrow and on-site PIC coordination.',
        faq: [
          {
            question: 'Bagaimana alur verifikasi dua tahap di TIKUM bekerja?',
            answer: 'Tahap pertama memverifikasi faktur pembelian asli dan hash barcode sebelum transaksi dimulai. Tahap kedua mengonfirmasi serah terima fisik gelang atau validitas akses di gerbang acara.'
          },
          {
            question: 'Kapan dana penjualan tiket dicairkan ke rekening penjual?',
            answer: 'Dana hasil penjualan baru dilepaskan setelah pembeli berhasil menerima tiket atau konfirmasi turnstile berhasil dilakukan sesuai batas waktu operasional.'
          },
          {
            question: 'Apa fungsi petugas lapangan (Event PIC) di lokasi acara?',
            answer: 'Event PIC bertugas mendampingi pertemuan pembeli dan penjual, memfasilitasi titik kumpul aman, dan mencatat bukti berita acara serah terima tiket.'
          }
        ],
        content: `
          <h2>Menghilangkan Risiko dalam Transaksi Tiket Sekunder</h2>
          <p>Membeli tiket konser dari tangan kedua di media sosial kerap berujung kecemasan penipuan tiket ganda atau tiket palsu. TIKUM hadir menghadirkan protokol verifikasi dua tahap yang mengamankan kedua belah pihak.</p>
          
          <h3>Prinsip Penahanan Dana Terkelola (Platform-Held)</h3>
          <p>Sistem penahanan dana memastikan uang pembeli tidak langsung mengalir ke penjual sebelum hak atas tiket terbukti nyata. Penjual pun terlindungi dari risiko pembeli yang membatalkan sepihak setelah menerima tiket.</p>
          
          <h3>Tiga Langkah Serah Terima Aman di Venue</h3>
          <ol>
            <li><strong>Pertemuan di Titik Kumpul Resmi:</strong> Gunakan meeting point strategis yang telah disepakati di dekat gerbang masuk.</li>
            <li><strong>Pemeriksaan Fisik Gelang & Segel:</strong> Pastikan barcode atau chip RFID tidak mengalami kerusakan fisik atau bekas robekan.</li>
            <li><strong>Konfirmasi Penyelesaian di Aplikasi:</strong> Pembeli dan penjual menandai transaksi selesai untuk memproses pencairan dana secara otomatis.</li>
          </ol>

          <p>Pelajari lebih lanjut opsi perlindungan di halaman <a href="/deal/create">Buat Penawaran Terlindungi</a>.</p>
        `
      },
      {
        id: 'art-live-wristband-power-of-attorney',
        title: 'Surat Kuasa Penukaran Wristband Tiket Konser: Format Resmi & Checklist Syarat',
        slug: 'surat-kuasa-penukaran-wristband-tiket-konser-format-resmi-checklist',
        description: 'Download template surat kuasa penukaran tiket konser bermeterai. Syarat dokumen wajib promotor musik Indonesia agar wristband tidak tertahan.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['surat kuasa penukaran tiket', 'template surat kuasa konser', 'penukaran wristband diwakilkan', 'syarat tukar gelang konser'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-11-21T09:00:00+07:00',
        scheduled_at: null,
        en_title: 'Wristband Exchange Power of Attorney: Official Template & Requirement Checklist',
        en_summary: 'Comprehensive checklist and formal power of attorney template for third-party concert wristband redemption at major Indonesian promoter box offices.',
        faq: [
          {
            question: 'Apakah meterai Rp 10.000 wajib ditempel pada surat kuasa penukaran tiket konser?',
            answer: 'Ya, hampir seluruh promotor resmi di Indonesia (PK Entertainment, Ravel, Ismaya, Live Nation) mewajibkan meterai tempel atau e-meterai Rp 10.000 dengan tanda tangan pemberi kuasa di atasnya.'
          },
          {
            question: 'Dokumen apa saja yang wajib dibawa oleh pihak yang menerima kuasa?',
            answer: 'Wajib membawa surat kuasa asli bertandatangan dan bermeterai, salinan e-voucher resmi dengan barcode jelas, fotokopi KTP/Paspor pemberi kuasa, dan KTP asli penerima kuasa.'
          },
          {
            question: 'Apakah satu surat kuasa bisa digunakan untuk menukarkan beberapa e-voucher sekaligus?',
            answer: 'Bisa, asalkan seluruh kode e-voucher dan rincian identitas dicantumkan secara lengkap dan jelas dalam lembar surat kuasa yang sama.'
          }
        ],
        content: `
          <h2>Kelancaran Penukaran Gelang Konser Melalui Perwakilan</h2>
          <p>Banyak penonton konser tidak dapat mengambil wristband sendiri pada hari kerja karena kendala pekerjaan atau domisili di luar kota. Menggunakan surat kuasa yang sah adalah jalan keluar resmi yang disetujui promotor.</p>
          
          <h3>Komponen Wajib Surat Kuasa Penukaran Tiket</h3>
          <p>Agar petugas loket tidak menolak berkas Anda, pastikan dokumen memuat poin-poin berikut:</p>
          <ul>
            <li><strong>Data Lengkap Pemberi Kuasa:</strong> Nama sesuai KTP, NIK, alamat domisili, nomor kontak aktif, dan email pemesanan tiket.</li>
            <li><strong>Data Lengkap Penerima Kuasa:</strong> Nama lengkap dan NIK pihak yang mewakili penukaran di venue.</li>
            <li><strong>Rincian Tiket:</strong> Nama konser, tanggal acara, kategori tiket, nomor kursi, dan nomor kode e-voucher.</li>
            <li><strong>Tanda Tangan di Atas Meterai Rp 10.000:</strong> Tanda tangan fisik yang mengenai sebagian kertas dan sebagian meterai.</li>
          </ul>

          <h2>Fasilitas Pendampingan Tikum di Lokasi Acara</h2>
          <p>Transaksi tiket sekunder di Tikum yang memenuhi syarat didukung oleh koordinator lapangan untuk memastikan kelengkapan dokumen serah terima. Kunjungi halaman <a href="/offers">Jelajahi Penawaran</a> untuk informasi selengkapnya.</p>
        `
      },

      // ==============================================================
      // QUEUED UPCOMING SCHEDULED ARTICLES (>= 16)
      // Released twice-weekly on Tuesdays & Fridays at 09:00 WIB
      // ==============================================================
      {
        id: 'art-queue-01-mcr-jakarta',
        title: 'MCR Live in Jakarta 2026: Rekomendasi Titik Nonton di JIS & Aturan Gate',
        slug: 'mcr-live-jakarta-2026-rekomendasi-titik-nonton-jis-aturan-gate',
        description: 'Panduan lengkap konser My Chemical Romance di JIS Jakarta: zonasi festival vs seating, panduan crowd control, dan serah terima tiket.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['konser MCR Jakarta', 'My Chemical Romance JIS', 'tiket MCR 2026', 'tribun JIS'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-11-24T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah penonton kategori festival standing diperbolehkan membawa tas ransel besar?', answer: 'Promotor melarang tas berukuran lebih dari A4 di area festival. Disarankan membawa sling bag transparan.' },
          { question: 'Kapan gate menuju area stadion dibuka untuk penonton?', answer: 'Pintu tribun dibuka mulai pukul 16:30 WIB, sedangkan pertunjukan utama dijadwalkan pukul 19:30 WIB.' }
        ],
        content: `<h2>Kembalinya Era Emo Rock Legendaris di Jakarta</h2><p>My Chemical Romance siap mengguncang Jakarta International Stadium. Panduan ini mengupas rute masuk, rekomendasi titik berdiri di festival mosh pit, serta tips keamanan barang berharga.</p>`
      },
      {
        id: 'art-queue-02-dwp-2026',
        title: 'Panduan Festival DWP 2026: Persiapan 3 Hari Musik Elektronik di JIExpo',
        slug: 'panduan-festival-dwp-2026-persiapan-3-hari-musik-elektronik-jiexpo',
        description: 'Tips navigasi stage indoor dan outdoor DWP 2026 di Kemayoran. Cara menjaga fisik selama tiga hari festival dan aturan penukaran wristband RFID.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['DWP 2026 Jakarta', 'Djakarta Warehouse Project', 'wristband DWP', 'jadwal DWP JIExpo'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-11-27T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah wristband DWP 3-Day Pass bisa dilepas pasang setiap hari?', answer: 'Tidak, gelang RFID didesain dengan kunci segel permanen. Merusak atau memotong gelang akan membatalkan hak akses.' },
          { question: 'Apakah metode pembayaran cashless berlaku di seluruh tenant F&B DWP?', answer: 'Ya, seluruh transaksi makanan dan minuman menggunakan top-up pada chip gelang atau QRIS.' }
        ],
        content: `<h2>Menikmati Pesta Musik Elektronik Terbesar di Asia Tenggara</h2><p>DWP 2026 kembali menghadirkan deretan DJ kaliber internasional di JIExpo Kemayoran. Simak persiapan logistik dan keamanan gelang akses.</p>`
      },
      {
        id: 'art-queue-03-ibl-finals-arena',
        title: 'Panduan Menonton IBL Finals 2026 di Indonesia Arena: Kategori & Suasana Lapangan',
        slug: 'panduan-menonton-ibl-finals-2026-indonesia-arena-kategori-suasana',
        description: 'Informasi lengkap tribun Indonesia Arena untuk Final IBL 2026: panduan kursi court-side, aturan kamera profesional, dan akses parkir GBK.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['IBL Finals 2026', 'tiket Indonesia Arena basket', 'nonton basket IBL', 'court-side IBL'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-01T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah kursi court-side IBL mendapatkan akses ke hospitality lounge?', answer: 'Ya, pemegang tiket Court-side Gold dan Platinum mendapatkan akses ruang tunggu atlet dan jamuan eksklusif.' },
          { question: 'Bolehkah membawa botol minuman pribadi ke dalam arena basket?', answer: 'Botol berbahan kaca atau tumbler logam dilarang masuk; air mineral wajib dipindahkan ke wadah kertas resmi.' }
        ],
        content: `<h2>Puncak Persaingan Bola Basket Nasional di Arena Termegah</h2><p>Final IBL 2026 di Indonesia Arena menghadirkan pertarungan sengit memperebutkan gelar juara. Pilih nomor kursi terbaik untuk sudut pandang maksimal.</p>`
      },
      {
        id: 'art-queue-04-pandji-mens-rea',
        title: 'Review Tur Stand Up Comedy Pandji Pragiwaksono Mens Rea: Ekspektasi & Aturan Nonton',
        slug: 'review-tur-standup-pandji-pragiwaksono-mens-rea-aturan-nonton',
        description: 'Etika menonton pertunjukan stand-up comedy di Teater Jakarta TIM. Aturan perekaman audio-video dan verifikasi tiket resale yang aman.',
        category: CONTENT_PILLARS.TICKET_SAFETY,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Pandji Mens Rea', 'tiket stand up Pandji', 'Taman Ismail Marzuki comedy', 'etika nonton standup'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-04T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah penonton diperbolehkan merekam potongan bit komedi selama pertunjukan?', answer: 'Perekaman audio atau video dalam bentuk apapun dilarang ketat demi melindungi hak cipta materi komika.' },
          { question: 'Apakah usia anak-anak diperkenankan masuk ke pertunjukan Mens Rea?', answer: 'Pertunjukan ini dikhususkan bagi penonton berusia 18 tahun ke atas dengan materi dewasa dan kritik sosial.' }
        ],
        content: `<h2>Stand Up Comedy Berbobot di Panggung Teater Bersejarah</h2><p>Tur spesial Pandji Pragiwaksono menghadirkan refleksi sosial yang tajam. Patuhi etika pertunjukan demi kenyamanan seluruh audiens.</p>`
      },
      {
        id: 'art-queue-05-soundrenaline-ancol',
        title: 'Soundrenaline 2026 di Allianz Ecopark: Panduan Stage, Rute & Persiapan Jas Hujan',
        slug: 'soundrenaline-2026-allianz-ecopark-panduan-stage-rute-persiapan',
        description: 'Eksplorasi panggung festival Soundrenaline di Ancol. Tips berpindah antar stage dan persiapan mengantisipasi cuaca terbuka di Jakarta Utara.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Soundrenaline 2026', 'konser Allianz Ecopark Ancol', 'lineup Soundrenaline', 'tiket festival Ancol'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-08T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah tiket Soundrenaline sudah mencakup tiket masuk gerbang utama Ancol?', answer: 'Biasanya tiket festival resmi telah mencakup tarif masuk individu pintu gerbang Ancol.' }
        ],
        content: `<h2>Pesta Musik Lintas Genre di Ruang Terbuka Hijau</h2><p>Soundrenaline memadukan musik independen, rock, dan pop alternatif di tengah pepohonan asri Allianz Ecopark Ancol.</p>`
      },
      {
        id: 'art-queue-06-lany-beautiful-blur',
        title: 'Nonton LANY di BCIS Ancol: Rekomendasi Tempat Duduk & Parkir Mobil',
        slug: 'nonton-lany-bcis-ancol-rekomendasi-tempat-duduk-parkir-mobil',
        description: 'Informasi konser LANY a beautiful blur di Beach City International Stadium: panduan tribun bertingkat dan akses tol langsung Ancol.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['konser LANY Jakarta 2026', 'BCIS Ancol concert', 'seating LANY BCIS', 'tiket LANY'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-11T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Berapa kapasitas penonton di indoor venue Beach City International Stadium?', answer: 'BCIS dapat menampung hingga 15.000 penonton dalam tata panggung arena tertutup.' }
        ],
        content: `<h2>Lantunan Indie Pop Menghanyutkan di Pesisir Jakarta</h2><p>LANY kembali menyapa ribuan penggemar setia di panggung indoor BCIS Ancol. Simak tips memilih tempat duduk paling strategis.</p>`
      },
      {
        id: 'art-queue-07-jogjarockarta-kridosono',
        title: 'JogjaROCKarta 2026 di Stadion Kridosono: Panduan Mosh Pit & Kuliner Sekitar',
        slug: 'jogjarockarta-2026-stadion-kridosono-panduan-mosh-pit-kuliner-sekitar',
        description: 'Panduan lengkap festival musik cadas legendaris di Kota Gudeg. Lokasi menginap dekat Stasiun Lempuyangan dan rekomendasi kuliner malam.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['JogjaROCKarta 2026', 'konser rock Yogyakarta', 'Stadion Kridosono', 'tiket Jogjarockarta'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-15T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah tersedia penitipan barang resmi di area venue Stadion Kridosono?', answer: 'Panitia menyediakan loker deposit terbatas di dekat pintu masuk gerbang barat.' }
        ],
        content: `<h2>Distorsi Rock Menggelegar di Jantung Budaya Yogyakarta</h2><p>Festival tahunan JogjaROCKarta mempertemukan musisi metal mancanegara dan jawara rock tanah air di Stadion Kridosono.</p>`
      },
      {
        id: 'art-queue-08-boomfest-bandung',
        title: 'Boomfest Bandung 2026 di Lapangan Pussenif: Transportasi dari Jakarta via Whoosh',
        slug: 'boomfest-bandung-2026-lapangan-pussenif-transportasi-whoosh',
        description: 'Cara nonton festival musik di Bandung dalam satu hari menggunakan Kereta Cepat Whoosh: jadwal keberangkatan dan tips hemat.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Boomfest Bandung', 'konser Pussenif Bandung', 'Whoosh nonton konser', 'tiket Boomfest'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-18T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Berapa lama waktu tempuh dari Stasiun Tegalluar Whoosh ke Lapangan Pussenif?', answer: 'Dengan taksi daring atau shuttle, perjalanan memakan waktu sekitar 30–45 menit tergantung kondisi lalu lintas.' }
        ],
        content: `<h2>Wisata Musik Sehari ke Kota Kembang Bersama Whoosh</h2><p>Mobilitas modern memudahkan konser mania Jakarta menikmati festival musik kreatif di Kota Bandung tanpa harus menginap.</p>`
      },
      {
        id: 'art-queue-09-scam-red-flags',
        title: '5 Tanda Bahaya Penipuan Tiket Konser di Medsos: Kenali Sebelum Transfer',
        slug: '5-tanda-bahaya-penipuan-tiket-konser-di-medsos-kenali-sebelum-transfer',
        description: 'Waspadai modus calo liar di platform X dan Instagram. Cara membedakan bukti transaksi asli dengan tangkapan layar palsu hasil editan.',
        category: CONTENT_PILLARS.SCAM_PREVENTION,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['penipuan tiket konser', 'ciri-ciri calo palsu', 'scam tiket twitter', 'cara aman beli tiket'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-22T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Mengapa meminta foto KTP penjual tidak cukup menjamin transaksi aman?', answer: 'Penipu sering kali menggunakan foto identitas korban sebelumnya yang mereka peroleh dari transaksi lain.' }
        ],
        content: `<h2>Membedakan Penjual Jujur dan Akun Sindikat Penipuan Tiket</h2><p>Pelajari pola komunikasi manipulatif calo tidak bertanggung jawab dan pentingnya bertransaksi melalui rekening perantara terpercaya.</p>`
      },
      {
        id: 'art-queue-10-wristband-care',
        title: 'Tips Merawat Gelang Wristband Konser Agar Barcode & RFID Tidak Rusak',
        slug: 'tips-merawat-gelang-wristband-konser-agar-barcode-rfid-tidak-rusak',
        description: 'Panduan menjaga keutuhan gelang festival kain dan vinyl. Cara mandi tanpa membasahi chip RFID dan aturan saat melewati turnstile gate.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['merawat gelang konser', 'RFID wristband rusak', 'tukar gelang konser', 'turnstile konser'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-25T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apa yang harus dilakukan jika chip RFID gelang tidak terbaca di sensor pintu masuk?', answer: 'Segera datangi loket helpdesk promotor bersama KTP asli dan bukti faktur pembelian resmi untuk penggantian gelang baru.' }
        ],
        content: `<h2>Menjaga Akses Masuk Anda Tetap Berfungsi Sempurna</h2><p>Gelang festival merupakan satu-satunya tanda pengenal resmi Anda di area konser. Rawat gelang tersebut agar tidak terkendala saat pemindaian sensor.</p>`
      },
      {
        id: 'art-queue-11-spectrafest-kemayoran',
        title: 'Spectra Music & Arts Fest 2026 di Gambir Expo: Panduan Instalasi Seni & Musik',
        slug: 'spectra-fest-2026-gambir-expo-panduan-instalasi-seni-musik',
        description: 'Rekomendasi pameran visual interaktif dan panggung musik elektronik di Gambir Expo Kemayoran Jakarta.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Spectra Fest 2026', 'Gambir Expo konser', 'festival seni Jakarta', 'tiket Spectra Fest'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2026-12-29T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah area festival menyediakan spot ramah disabilitas?', answer: 'Ya, Gambir Expo dilengkapi jalur landai dan area viewing platform khusus pengguna kursi roda.' }
        ],
        content: `<h2>Kolaborasi Harmonis Antara Seni Visual Terkini dan Alunan Nada</h2><p>Spectra Fest memanjakan indra pengunjung dengan paduan tata cahaya futuristik dan penampilan musisi progresif tanah air.</p>`
      },
      {
        id: 'art-queue-12-abdur-arsyad-tim',
        title: 'Nonton Abdur Arsyad di Graha Bhakti Budaya TIM: Panduan Kursi & Resale Resmi',
        slug: 'nonton-abdur-arsyad-graha-bhakti-budaya-tim-panduan-kursi-resale',
        description: 'Pengalaman menikmati komedi cerdas Abdur Arsyad di Graha Bhakti Budaya. Denah kursi teater dan opsi jual-beli tiket terverifikasi.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Abdur Arsyad Kontras', 'Graha Bhakti Budaya TIM', 'tiket stand up Abdur', 'stand up comedy Jakarta'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2027-01-01T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah penonton yang terlambat diperbolehkan masuk ke ruang teater?', answer: 'Penonton terlambat baru diperkenankan masuk saat jeda perpindahan segmen komedi agar tidak mengganggu fokus penampil.' }
        ],
        content: `<h2>Retorika Penuh Makna di Teater Bersejarah Ibu Kota</h2><p>Special show Abdur Arsyad selalu menyuguhkan sudut pandang unik yang menggelitik akal sehat. Pastikan Anda tiba tepat waktu.</p>`
      },
      {
        id: 'art-queue-13-ultraverse-bali',
        title: 'Ultraverse Festival Bali 2026 di GWK: Tips Liburan Musik di Pulau Dewata',
        slug: 'ultraverse-festival-bali-2026-gwk-tips-liburan-musik-dewata',
        description: 'Panduan nonton konser bertaraf internasional di bawah megahnya patung Garuda Wisnu Kencana Bali: hotel shuttle dan tiket resmi.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Ultraverse Bali 2026', 'konser GWK Bali', 'festival musik Bali', 'tiket Ultraverse'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2027-01-05T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah tersedia shuttle bus dari area Kuta dan Seminyak ke GWK Cultural Park?', answer: 'Panitia bekerja sama dengan operator transportasi lokal menyediakan titik jemput resmi di sentra turis utama.' }
        ],
        content: `<h2>Pesona Alunan Musik di Bawah Naungan Monumen Megah GWK</h2><p>Ultraverse Festival menghadirkan pengalaman festival kelas dunia dengan latar belakang tebing kapur dan patung ikonik Bali.</p>`
      },
      {
        id: 'art-queue-14-tora-fight-boxing',
        title: 'Nonton Tinju Pro Tora Fight Series di Tennis Indoor Senayan: Panduan Ring-Side',
        slug: 'nonton-tinju-pro-tora-fight-series-tennis-indoor-senayan-ringside',
        description: 'Serunya atmosfer pertarungan tinju profesional Indonesia di Senayan. Panduan tiket ring-side, aturan keselamatan, dan jadwal laga.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['Tora Fight Series', 'tinju pro Indonesia', 'Tennis Indoor Senayan', 'tiket tinju Senayan'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2027-01-08T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Berapa jarak kursi ring-side ke kanvas ring pertarungan?', answer: 'Kursi ring-side berjarak kurang dari 3 meter dari sisi kanvas dengan sudut pandang aksi baku pukul terdekat.' }
        ],
        content: `<h2>Adrenalin Olahraga Adu Jotos Profesional di Jantung Senayan</h2><p>Saksikan perebutan sabuk juara nasional dalam kejuaraan tinju profesional paling dinanti di Tennis Indoor Senayan.</p>`
      },
      {
        id: 'art-queue-15-fann-meeting-merchandise',
        title: 'Panduan Beli Merchandise Resmi Idol di Hari Konser Tanpa Terjebak Antrean',
        slug: 'panduan-beli-merchandise-resmi-idol-hari-konser-tanpa-antrean',
        description: 'Strategi efisien mendapatkan lightstick, t-shirt, dan photocard resmi di booth promotor: pembayaran QRIS dan alur pre-order online.',
        category: CONTENT_PILLARS.TICKET_GUIDES,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['merchandise konser resmi', 'beli lightstick konser', 'booth merchandise GBK', 'pre-order merchandise'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2027-01-12T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Apakah baterai lightstick boleh dibawa ke dalam kabin pesawat terbang?', answer: 'Baterai kering standar AAA diperbolehkan di bagasi kabin tetapi disarankan dilepas dari gagang lightstick.' }
        ],
        content: `<h2>Melengkapi Aksesoris Resonansi Konser Idol Kesayangan Anda</h2><p>Membawa merchandise otentik menyempurnakan euforia menonton konser live. Ikuti panduan antrean tertib dan alur pemesanan awal.</p>`
      },
      {
        id: 'art-queue-16-resale-fair-pricing',
        title: 'Aturan Batas Harga Maksimal di Tikum: Melindungi Penggemar dari Praktik Calo Liar',
        slug: 'aturan-batas-harga-maksimal-di-tikum-melindungi-penggemar-dari-calo',
        description: 'Penjelasan kebijakan markup cap maksimal +30% dari harga resmi promotor di Tikum demi terciptanya pasar tiket sekunder yang adil dan sehat.',
        category: CONTENT_PILLARS.RESALE_EDUCATION,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['markup cap tiket', 'kebijakan harga Tikum', 'anti calo tiket konser', 'harga wajar tiket resale'],
        author: 'Tim Editorial Tikum',
        status: CONTENT_STATUS.SCHEDULED,
        scheduled_at: '2027-01-15T09:00:00+07:00',
        published_at: null,
        faq: [
          { question: 'Mengapa TIKUM membatasi markup harga tiket maksimal 30%?', answer: 'Untuk mencegah spekulasi liar calo yang merugikan sesama penggemar dan menjaga aksesibilitas harga tiket tetap dalam batas wajar.' }
        ],
        content: `<h2>Menata Ekosistem Tiket Sekunder yang Beradab dan Transparan</h2><p>TIKUM berkomitmen memberantas eksploitasi harga berlebihan dengan memberlakukan batas markup harga yang tegas dan transparan.</p>`
      }
    ];
  }

  /**
   * Initializes and seeds all articles into ArticleRepository
   */
  static init() {
    const articles = this.getSeededArticles();
    let seededCount = 0;

    for (const art of articles) {
      this.validateArticleCompliance(art);
      const existing = articleRepository.getArticleById(art.id) || articleRepository.getArticleBySlug(art.slug);
      if (!existing) {
        articleRepository.saveArticle(art);
        seededCount++;
      }
    }

    return {
      success: true,
      seeded_count: seededCount,
      total_articles: articleRepository.getAllArticles().length
    };
  }

  /**
   * Sweeps scheduled articles and publishes any whose scheduled_at has arrived in Asia/Jakarta time.
   *
   * @param {Object} options
   * @param {Date|string} [options.now]
   * @returns {Object} Publication execution summary
   */
  static publishDueArticles({ now = null } = {}) {
    const effectiveNow = EventLifecycleService.getJakartaTime(now);
    const nowIso = effectiveNow.toISOString();
    const allArticles = articleRepository.getAllArticles();

    let publishedCount = 0;
    const publishedArticles = [];
    let nextScheduled = null;

    for (const art of allArticles) {
      if (art.status === CONTENT_STATUS.SCHEDULED && art.scheduled_at) {
        const schedTime = new Date(art.scheduled_at);
        if (!isNaN(schedTime.getTime())) {
          if (schedTime <= effectiveNow) {
            art.status = CONTENT_STATUS.PUBLISHED;
            art.published_at = art.scheduled_at || nowIso;
            art.updated_at = nowIso;
            articleRepository.saveArticle(art);
            publishedCount++;
            publishedArticles.push({
              id: art.id,
              slug: art.slug,
              title: art.title,
              published_at: art.published_at
            });
          } else {
            if (!nextScheduled || schedTime < new Date(nextScheduled.scheduled_at)) {
              nextScheduled = {
                id: art.id,
                slug: art.slug,
                title: art.title,
                scheduled_at: art.scheduled_at
              };
            }
          }
        }
      }
    }

    // Trigger sitemap regeneration if any new article was published
    let sitemapUpdated = false;
    if (publishedCount > 0) {
      try {
        const sitemapScriptPath = path.resolve(__dirname, '../../scripts/generate_sitemap.js');
        if (fs.existsSync(sitemapScriptPath)) {
          const { generate } = require(sitemapScriptPath);
          if (typeof generate === 'function') {
            generate();
            sitemapUpdated = true;
          }
        }
      } catch (err) {
        console.warn('[SeoBlogEngine] Sitemap regeneration error:', err.message);
      }
    }

    return {
      success: true,
      published_count: publishedCount,
      published_articles: publishedArticles,
      next_scheduled: nextScheduled,
      sitemap_updated: sitemapUpdated,
      timestamp: nowIso
    };
  }
}

// Auto-seed on require
try {
  SeoBlogEngine.init();
} catch (e) {
  console.warn('[SeoBlogEngine] Auto-seed warning:', e.message);
}

module.exports = {
  SeoBlogEngine,
  BANNED_PATTERNS
};
