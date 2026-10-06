/**
 * TIKUM 20-Article Authority Campaign Seed Data
 * 
 * Strict Editorial Standards:
 * - Topical authority cluster: Pillar page (Art 20) + 19 supporting articles
 * - 2x/Week publishing cadence (Tuesday & Friday)
 * - Flagship positioning article (Art 17) published this week (2026-10-06)
 * - Non-negotiable claim discipline: zero unsupported first-in-Indonesia, zero 100% scam-free
 * - GEO / AI search ready: direct answers at top, definitions, structured sections, FAQ schema
 * - Technical SEO optimized: Title 40-75 chars, Meta desc 100-165 chars, H2 & H3 hierarchy
 */

const { CONTENT_PILLARS, CONTENT_STATUS, SEARCH_INTENTS } = require('../ContentModel');

const EDITORIAL_ARTICLES = [
  // ===================================================================
  // ARTICLE 01 — BRAND / CATEGORY AUTHORITY (Week 1, Art 1)
  // ===================================================================
  {
    id: 'art-campaign-01',
    title: 'Secondary Ticketing Indonesia: Cara Beli Tiket Event Lebih Aman',
    slug: 'secondary-ticketing-indonesia-cara-baru-beli-tiket-event',
    description: 'Panduan secondary ticketing Indonesia: cara aman beli tiket konser sold out, perbedaan tiket primer vs sekunder, serta perlindungan escrow dan PIC di venue.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'secondary ticketing Indonesia',
      'jual beli tiket konser',
      'tiket resale Indonesia',
      'marketplace tiket',
      'tiket konser sold out'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/secondary-ticketing-indonesia-cara-baru-beli-tiket-event',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apa itu secondary ticketing di Indonesia?',
        a: 'Secondary ticketing adalah pasar jual beli tiket setelah penjualan resmi pertama (primary ticketing) berlangsung, biasanya karena pemilik awal berhalangan hadir atau tiket resmi sudah habis terjual.'
      },
      {
        q: 'Mengapa secondary ticketing marak di Indonesia?',
        a: 'Tingginya antusiasme konser besar dan cepatnya tiket primary habis dalam hitungan menit membuat banyak penggemar mencari tiket alternatif dari penonton lain.'
      },
      {
        q: 'Bagaimana cara memastikan jual beli tiket sekunder aman?',
        a: 'Gunakan platform dengan sistem rekening penampungan escrow, verifikasi keabsahan identitas penjual, dan dukungan penanganan kendala di area venue.'
      },
      {
        q: 'Apakah Tikum menjamin tidak ada risiko sama sekali?',
        a: 'Tidak ada platform yang dapat menjanjikan risiko nol secara mutlak. Tikum dirancang untuk meminimalisasi risiko penipuan secara sistematis melalui penahanan dana aman dan verifikasi bukti.'
      }
    ],
    content: `
      <p><strong>Secondary ticketing adalah pasar jual beli tiket setelah penjualan resmi pertama selesai.</strong> Masalah utamanya di Indonesia bukan sekadar ketersediaan atau harga tiket, melainkan bagaimana memastikan tiket tersebut benar-benar valid dan pembeli tidak menjadi korban penipuan saat bertransaksi.</p>

      <p>Ketika konser musisi ternama diumumkan di Jakarta atau kota besar lainnya, kuota tiket resmi kerap ludes dalam hitungan menit. Di sisi lain, ribuan penonton mengalami perubahan rencana mendadak—jadwal kerja bertabrakan, keperluan keluarga, atau kondisi kesehatan—sehingga perlu melepaskan tiket mereka. Dari situlah secondary ticketing lahir secara organik.</p>

      <h2>Masalah Terbesar: Transaksi Informal Penuh Risiko</h2>
      <p>Selama bertahun-tahun di Indonesia, pertukaran tiket sekunder terjadi di kanal informal seperti kolom komentar media sosial, grup perpesanan, atau akun jastip anonim. Di kanal-kanal ini, pembeli berada pada posisi sangat rentan.</p>

      <h3>Kelemahan Transaksi Direct Transfer</h3>
      <ul>
        <li><strong>Kewajiban transfer buta:</strong> Pembeli dipaksa mentransfer uang terlebih dahulu ke rekening bank pribadi tanpa jaminan tiket akan dikirim.</li>
        <li><strong>Tangkapan layar palsu:</strong> Gambar e-ticket atau barcode dapat dimanipulasi dengan mudah menggunakan aplikasi edit gambar dasar.</li>
        <li><strong>Hilangnya jejak pelaku:</strong> Akun anonim dapat langsung memblokir nomor telepon pembeli setelah dana diterima.</li>
      </ul>

      <h2>4 Pilar Model Baru Secondary Ticketing di Tikum</h2>
      <p>Tikum membangun marketplace secondary ticketing dengan fokus pada keamanan transaksi, escrow, dan dukungan operasional di venue. Empat pilar utamanya adalah:</p>

      <h3>Mekanisme Perlindungan Transaksi</h3>
      <ol>
        <li><strong>Escrow (Penahanan Dana Netral):</strong> Uang pembeli tidak langsung masuk ke rekening penjual. Dana disimpan di rekening penampungan netral hingga syarat transaksi terpenuhi.</li>
        <li><strong>Verifikasi Dokumen Tiket:</strong> Penjual wajib mengunggah dokumen bukti pembelian resmi yang divalidasi sebelum listing dinyatakan aktif.</li>
        <li><strong>Pendampingan PIC di Venue:</strong> Representasi Person in Charge (PIC) Tikum hadir di sekitar venue pada hari acara untuk mendampingi penukaran fisik atau validasi masuk.</li>
        <li><strong>Perlindungan Berbasis Bukti:</strong> Jika tiket terbukti ditolak oleh turnstile gate resmi karena duplikasi atau ketidakvalidan, pembeli terlindungi mekanisme sengketa dan pengembalian dana.</li>
      </ol>

      <h2>Perbedaan Primary Ticketing vs Secondary Ticketing Terstruktur</h2>
      <table style="width:100%; border-collapse:collapse; margin:20px 0;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:10px 14px; text-align:left; color:#f8fafc;">Parameter</th>
            <th style="padding:10px 14px; text-align:left; color:#38bdf8;">Primary Ticketing</th>
            <th style="padding:10px 14px; text-align:left; color:#4ade80;">Secondary Terstruktur (Tikum)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Penyedia Tiket</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Promotor resmi & vendor tiket utama</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Pemilik tiket asli yang berhalangan hadir</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Perlindungan Pembayaran</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Payment gateway terintegrasi</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Escrow otomatis hingga validasi hari-H</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Bantuan Lapangan</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Helpdesk promotor resmi</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">PIC lapangan Tikum di sekitar venue</td>
          </tr>
        </tbody>
      </table>

      <h3>Menuju Budaya Transaksi yang Transparan</h3>
      <p>Secondary ticketing bukan musuh penonton, melainkan jembatan kebutuhan. Yang harus dihentikan adalah penipuan berkedok jual beli tiket. Melalui edukasi dan teknologi perlindungan, penggemar musik dan event di Indonesia kini memiliki alternatif bertransaksi yang jauh lebih rasional dan terlindungi.</p>
    `,
    source_references: ['Asosiasi Promotor Musik Indonesia (APMI)', 'Kementerian Perdagangan RI']
  },

  // ===================================================================
  // ARTICLE 02 — TIKUM DIFFERENTIATION: ESCROW (Week 1, Art 2)
  // ===================================================================
  {
    id: 'art-campaign-02',
    title: 'Kenapa Tikum Menggunakan Escrow untuk Transaksi Tiket Konser?',
    slug: 'kenapa-tikum-menggunakan-escrow-untuk-transaksi-tiket',
    description: 'Mekanisme escrow tiket di Tikum: bagaimana rekening penampungan netral melindungi pembeli dari penipuan dan menjamin pembayaran aman bagi penjual sah.',
    category: CONTENT_PILLARS.TIKUM,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'escrow tiket',
      'rekening bersama tiket',
      'aman beli tiket konser',
      'escrow marketplace'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-tikum-menggunakan-escrow-untuk-transaksi-tiket',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apa itu sistem escrow tiket di Tikum?',
        a: 'Escrow tiket adalah mekanisme penahanan dana pembayaran secara netral di mana uang pembeli tidak diserahkan ke penjual sebelum syarat keabsahan tiket dan serah terima terpenuhi.'
      },
      {
        q: 'Kapan dana dicairkan ke penjual tiket?',
        a: 'Dana diteruskan ke penjual setelah tiket berhasil divalidasi pembeli pada hari acara atau batas waktu klaim terlampaui tanpa laporan sengketa valid.'
      },
      {
        q: 'Bagaimana jika tiket bermasalah saat konser?',
        a: 'Pembeli dapat mengajukan sengketa dengan menyertakan bukti penolakan turnstile. Karena dana masih tersimpan di escrow, platform dapat memproses pengembalian dana.'
      }
    ],
    content: `
      <p><strong>Escrow adalah sistem penahanan dana netral yang menjadi benteng pertahanan utama melawan penipuan tiket konser.</strong> Di pasar sekunder konvensional, transaksi selalu diwarnai dilema: siapa yang harus mengambil risiko lebih dulu? Pembeli takut mentransfer sebelum tiket ada, sedangkan penjual takut mengirim tiket sebelum uang diterima.</p>

      <h2>Kelemahan Fatal Transfer Langsung (Direct Bank Transfer)</h2>
      <p>Dalam transaksi tiket media sosial, 95% penipuan terjadi karena pembeli mentransfer dana langsung ke rekening pribadi penjual. Begitu uang berpindah tangan:</p>
      <ul>
        <li>Bank pengirim tidak dapat membatalkan transaksi secara sepihak tanpa putusan hukum resmi.</li>
        <li>Penjual dapat seketika menonaktifkan akun atau memblokir kontak pembeli.</li>
        <li>Pembeli tidak memiliki daya tawar apa pun jika tiket yang diterima ternyata barcode duplikat.</li>
      </ul>

      <h2>Alur Kerja Escrow di Platform Tikum</h2>
      <p>Tikum memutus mata rantai risiko tersebut dengan alur transaksi empat tahap terstruktur:</p>

      <h3>4 Tahap Perlindungan Pembayaran</h3>
      <ol>
        <li><strong>Pembayaran Masuk ke Rekening Penampungan:</strong> Pembeli memilih tiket terverifikasi dan membayar melalui channel resmi Tikum. Dana ditahan secara aman di sistem penampungan netral.</li>
        <li><strong>Notifikasi &amp; Penyerahan Tiket:</strong> Penjual menerima notifikasi bahwa pembayaran sah telah terkunci, lalu mengunggah tiket atau menyerahkan akses sesuai ketentuan.</li>
        <li><strong>Fase Verifikasi &amp; Pintu Masuk:</strong> Tiket digunakan oleh pembeli untuk penukaran wristband fisik atau pemindaian turnstile di lokasi konser.</li>
        <li><strong>Penyelesaian Transaksi (Settlement):</strong> Setelah konfirmasi validasi sukses tanpa sengketa, dana secara otomatis dicairkan ke saldo penjual.</li>
      </ol>

      <h2>Perlindungan Seimbang bagi Penjual</h2>
      <p>Escrow Tikum tidak hanya melindungi pembeli. Penjual sah juga terlindungi dari tuduhan palsu pembeli nakal, penipuan slip transfer editan, dan pembatalan sepihak setelah tiket diserahkan. Semua transaksi memiliki jejak digital audit yang tidak dapat dimanipulasi.</p>

      <h3>Mencegah Bukti Transfer Palsu</h3>
      <p>Dengan sistem escrow otomatis, penjual tidak perlu menebak apakah bukti transfer yang dikirim pembeli asli atau hasil editan. Platform hanya memberi instruksi penyerahan tiket setelah mutasi dana perbankan dinyatakan sah.</p>
    `,
    source_references: ['Protokol Transaksi Keuangan Digital Kemendag RI', 'Tikum Trust Engine Architecture']
  },

  // ===================================================================
  // ARTICLE 03 — VENUE PIC (Week 2, Art 1)
  // ===================================================================
  {
    id: 'art-campaign-03',
    title: 'Kenapa Tikum Punya PIC di Venue? Ini Bedanya dengan Calo Medsos',
    slug: 'kenapa-tikum-punya-pic-di-venue',
    description: 'Peran PIC venue tiket Tikum: pendampingan fisik penukaran wristband gelang di lokasi konser dan verifikasi gerbang masuk untuk mencegah penipuan.',
    category: CONTENT_PILLARS.TIKUM,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'PIC venue tiket',
      'verifikasi tiket konser',
      'beli tiket aman',
      'scam tiket konser'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-tikum-punya-pic-di-venue',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apa itu PIC venue tiket Tikum?',
        a: 'PIC venue adalah perwakilan operasional lapangan Tikum yang bertugas di sekitar area konser untuk mendampingi pengguna, membantu verifikasi fisik, dan merespons kendala transaksi di hari acara.'
      },
      {
        q: 'Apakah PIC Tikum berwenang memaksa masuk jika tiket ditolak promotor?',
        a: 'Tidak. PIC tidak menggantikan kewenangan promotor resmi. Peran PIC adalah mengumpulkan bukti teknis penolakan, mengidentifikasi keabsahan sengketa, dan memfasilitasi proses refund escrow jika terbukti ada kecurangan penjual.'
      },
      {
        q: 'Bagaimana cara menemukan PIC Tikum di lokasi konser?',
        a: 'Informasi titik temu PIC (meeting point), nomor kontak darurat, dan jam operasional dibagikan melalui dashboard transaksi pesanan Tikum pada H-1 acara.'
      }
    ],
    content: `
      <p><strong>Mayoritas masalah tiket konser terjadi di lapangan pada hari acara, bukan di depan layar ponsel beberapa minggu sebelumnya.</strong> Saat antrean penukaran gelang mengular atau pintu turnstile menolak barcode, pembeli yang bertransaksi via media sosial tidak memiliki tempat mengadu. Di sinilah kehadiran PIC venue Tikum menjadi pembeda mendasar.</p>

      <h2>Celah Besar Marketplace Murni Digital</h2>
      <p>Marketplace P2P biasa berhenti beroperasi begitu file e-ticket terkirim ke email pembeli. Namun di dunia nyata, konser musik memiliki kompleksitas fisik:</p>
      <ul>
        <li>Kewajiban membawa surat kuasa bermeterai dan fotokopi KTP pemilik asli saat penukaran wristband.</li>
        <li>Risiko barcode ganda yang telah di-scan oleh orang lain beberapa detik lebih awal.</li>
        <li>Kebingungan titik penukaran tiket kategori festival vs seating.</li>
      </ul>

      <h2>Model Kepercayaan Online-to-Offline (O2O)</h2>
      <p>Tikum menggabungkan keamanan software escrow di cloud dengan kehadiran manusia terlatih di lokasi acara:</p>

      <h3>Peran Nyata PIC Lapangan</h3>
      <ol>
        <li><strong>Bantuan Serah Terima Fisik:</strong> Memfasilitasi serah terima wristband atau surat kuasa di titik temu yang disepakati di luar gerbang.</li>
        <li><strong>Pencatatan Bukti Lapangan:</strong> Jika tiket mengalami penolakan di pintu masuk scanner, PIC mendokumentasikan log error untuk dasar investigasi tim sengketa.</li>
        <li><strong>Titik Eskalasi Nyata:</strong> Memberikan ketenangan psikologis bagi penonton bahwa mereka didampingi ekosistem yang bertanggung jawab.</li>
      </ol>

      <h2>Batas Kewenangan yang Jelas</h2>
      <p>Perlu dipahami secara transparan bahwa PIC Tikum bukan bagian dari manajemen promotor dan tidak memiliki hak melanggar ketentuan resmi acara. Keberadaan PIC semata-mata adalah instrumen perlindungan konsumen independen untuk memastikan transaksi tiket sekunder diselesaikan secara adil dan berbasis bukti.</p>
    `,
    source_references: ['Standard Operating Procedures Ground Ops Tikum', 'APMI Safety Guidelines']
  },

  // ===================================================================
  // ARTICLE 04 — SCAM PREVENTION: 10 MODUS (Week 2, Art 2)
  // ===================================================================
  {
    id: 'art-campaign-04',
    title: '10 Modus Penipuan Tiket Konser yang Paling Sering Terjadi',
    slug: '10-modus-penipuan-tiket-konser-harus-diwaspadai',
    description: 'Waspadai 10 modus penipuan tiket konser di media sosial: invoice palsu, double selling barcode, trik rekening bersama bodong, dan tips aman menghindarinya.',
    category: CONTENT_PILLARS.SCAM_PREVENTION,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'penipuan tiket konser',
      'scam tiket konser',
      'tiket palsu',
      'cara cek tiket asli',
      'modus penipuan tiket'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/10-modus-penipuan-tiket-konser-harus-diwaspadai',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apa modus penipuan tiket konser yang paling sering terjadi?',
        a: 'Penipuan transfer langsung dengan bukti tangkapan layar invoice editan dan modus double selling di mana satu barcode dijual ke banyak korban.'
      },
      {
        q: 'Bagaimana cara membedakan invoice tiket asli dengan editan?',
        a: 'Periksa keselarasan jenis font, ketajaman pixel teks nomor pesanan, serta kecocokan waktu transaksi dengan jadwal presale promotor resmi.'
      },
      {
        q: 'Apa yang harus dilakukan jika sudah menjadi korban penipuan tiket?',
        a: 'Amankan seluruh riwayat percakapan dan bukti mutasi bank, lalu buat laporan resmi ke bank tujuan dan portal Patroli Siber Polri.'
      }
    ],
    content: `
      <p><strong>Penipuan tiket konser di Indonesia memanfaatkan dua hal: kepanikan penonton yang kehabisan tiket (FOMO) dan kebiasaan mentransfer uang tanpa perantara aman.</strong> Berdasarkan pemantauan pola kejahatan siber, berikut 10 modus paling marak yang wajib Anda ketahui.</p>

      <h2>Daftar 10 Modus Penipuan Tiket Konser</h2>
      <ol>
        <li><strong>Tangkapan Layar Invoice Editan:</strong> Penipu mengedit nama pemesan dan nomor invoice pada email konfirmasi resmi dari vendor tiket menggunakan aplikasi editing foto.</li>
        <li><strong>Akun Media Sosial Bajakan / Impersonator:</strong> Menggunakan akun yang tampak aktif atau akun centang biru sewaan agar terkesan terpercaya.</li>
        <li><strong>Double Selling (Satu Barcode Banyak Korban):</strong> Penjual benar-benar memiliki 1 tiket sah, namun file PDF e-ticket dikirimkan ke 5 hingga 10 pembeli berbeda secara bersamaan.</li>
        <li><strong>Bukti Pembayaran Palsu (Menipu Penjual):</strong> Calon pembeli nakal mengirimkan struk ATM atau screenshot m-banking palsu untuk meminta tiket segera diserahkan.</li>
        <li><strong>Menciptakan Urgensi Semu:</strong> Menekan calon korban dengan kalimat "Antrean penawaran ada 5 orang, transfer dalam 10 menit atau tiket saya lepas".</li>
        <li><strong>Pencurian Identitas KTP:</strong> Meminta foto KTP korban dengan alasan verifikasi, lalu menggunakan foto KTP tersebut untuk menipu korban berikutnya.</li>
        <li><strong>Barcode / QR Code Kadaluwarsa:</strong> Mengirimkan barcode event lama atau tiket yang telah dibatalkan oleh promotor resmi.</li>
        <li><strong>Skema Refund Palsu:</strong> Mengaku tiket batal terbit lalu mengirim link phishing yang meminta kode OTP rekening korban.</li>
        <li><strong>Social Engineering &amp; Akting Ramah:</strong> Bersikap seolah sesama fans setia (fellow fandom) untuk melumpuhkan kewaspadaan korban.</li>
        <li><strong>Rekening Bersama (Rekber) Bodong:</strong> Penipu mengajak menggunakan "admin rekber" yang sebenarnya merupakan nomor WhatsApp komplotannya sendiri.</li>
      </ol>

      <h2>Anatomi Manipulasi Psikologis Penipu</h2>
      <p>Penipu jarang berdebat soal harga; mereka justru setuju dengan cepat lalu memindahkan fokus pada ketergesaan waktu. Mereka tahu bahwa ketika emosi penggemar memuncak, akal kritis cenderung menurun.</p>

      <h3>Checklist Cepat Pencegahan</h3>
      <ul>
        <li>Tolak segala bentuk transaksi langsung tanpa mekanisme escrow resmi.</li>
        <li>Jangan percaya pada tangkapan layar semata—selalu minta bukti kepemilikan yang tertelusuri.</li>
        <li>Pastikan rekening tujuan pembayaran terdaftar atas nama institusi berbadan hukum resmi, bukan rekening perseorangan yang berganti-ganti.</li>
      </ul>
    `,
    source_references: ['Laporan Patroli Siber Bareskrim Polri', 'Database Kasus Tiket Konser Jabodetabek']
  },

  // ===================================================================
  // ARTICLE 05 — BUYER GUIDE (Week 3, Art 1)
  // ===================================================================
  {
    id: 'art-campaign-05',
    title: 'Cara Aman Membeli Tiket Konser dari Secondary Market Indonesia',
    slug: 'cara-aman-membeli-tiket-konser-dari-secondary-market',
    description: 'Tips dan cara aman beli tiket konser dari pasar sekunder: verifikasi syarat surat kuasa promotor, cek bukti pembelian asli, dan bertransaksi via escrow.',
    category: CONTENT_PILLARS.TICKET_SAFETY,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'cara aman beli tiket konser',
      'beli tiket konser sold out',
      'tiket resale aman',
      'tips beli tiket konser'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/cara-aman-membeli-tiket-konser-dari-secondary-market',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Kapan waktu terbaik membeli tiket dari secondary market?',
        a: 'Biasanya beberapa minggu hingga hari-H menjelang konser saat pemilik tiket yang mendadak berhalangan hadir mulai melepaskan tiket mereka dengan harga wajar.'
      },
      {
        q: 'Apakah aman membeli tiket atas nama orang lain?',
        a: 'Aman asalkan penjual menyertakan surat kuasa bermeterai asli, fotokopi KTP sesuai nama pemesan pertama, dan bukti pembelian resmi sesuai ketentuan promotor.'
      }
    ],
    content: `
      <p><strong>Membeli tiket konser yang sudah sold out dari pasar sekunder bukan hal terlarang, namun membutuhkan kewaspadaan metodis.</strong> Penggemar musik yang cerdas tidak bertindak impulsif demi tiket impian, melainkan menerapkan langkah pengamanan yang terstruktur.</p>

      <h2>Langkah 1: Baca Ketentuan Resmi Promotor Acara</h2>
      <p>Setiap promotor memiliki regulasi berbeda terkait pengalihan tiket. Ada promotor yang mengizinkan penukaran dengan surat kuasa bermeterai dan fotokopi KTP, namun ada pula yang menerapkan gelang bernafas ketat (strict ID check). Mengetahui aturan dasar ini menghindarkan Anda dari membeli tiket yang mustahil digunakan.</p>

      <h3>Pemeriksaan Persyaratan Penukaran Gelang</h3>
      <ul>
        <li>Surat kuasa bermeterai Rp 10.000 dengan tanda tangan basah pemilik akun asli.</li>
        <li>Fotokopi kartu identitas resmi yang identik dengan nama pada konfirmasi pemesanan.</li>
        <li>Tanda bukti pelunasan invoice awal dari penyedia tiket primer.</li>
      </ul>

      <h2>Langkah 2: Gunakan Platform Berpenahanan Dana Netral</h2>
      <p>Hindari bertransaksi via transfer antar-rekening pribadi. Di platform seperti Tikum, uang Anda tertahan aman hingga Anda tiba di lokasi acara dan membuktikan tiket berfungsi di turnstile gate.</p>

      <h3>Antisipasi Hari Acara di Venue</h3>
      <p>Datang lebih awal ke lokasi penukaran memungkinkan Anda menyelesaikan antrean fisik dengan tenang, menemui PIC pendamping jika menggunakan Tikum, dan memastikan wristband terpasang rapi sebelum konser dimulai.</p>
    `,
    source_references: ['Petunjuk Teknis Penukaran Tiket Konser APMI', 'Panduan Konsumen Cerdas Kemendag']
  },

  // ===================================================================
  // ARTICLE 06 — SOLD OUT & SECONDARY MARKET (Week 3, Art 2)
  // ===================================================================
  {
    id: 'art-campaign-06',
    title: 'Kenapa Tiket Konser Cepat Sold Out? Fakta Secondary Ticket Market',
    slug: 'kenapa-tiket-konser-cepat-sold-out-secondary-market',
    description: 'Penyebab tiket konser cepat sold out: kapasitas venue fisik vs jutaan peminat, dan peran pasar sekunder teratur sebagai solusi penonton yang berhalangan.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'tiket konser sold out',
      'secondary ticket market',
      'ticket resale',
      'tiket habis'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-tiket-konser-cepat-sold-out-secondary-market',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Kenapa war tiket konser di Indonesia selalu cepat habis?',
        a: 'Kapasitas venue (biasanya 10.000 hingga 70.000 kursi) jauh lebih kecil dibanding ratusan ribu hingga jutaan calon penonton yang mengakses web secara bersamaan.'
      },
      {
        q: 'Apakah keberadaan secondary market selalu merugikan penonton?',
        a: 'Tidak. Secondary market yang terstruktur dan aman justru memberikan ruang likuiditas bagi penonton yang berhalangan hadir dan peluang kedua bagi penggemar yang gagal saat war tiket.'
      }
    ],
    content: `
      <p><strong>Fenomena tiket konser habis dalam hitungan detik (war tiket) adalah cermin kesenjangan matematis antara kapasitas venue fisik dan permintaan digital yang masif.</strong> Stadion Utama Gelora Bung Karno memiliki kapasitas maksimal sekitar 77.000 penonton, sementara jumlah orang yang memperebutkan tiket konser artis dunia kerap melampaui 1,5 juta orang secara simultan.</p>

      <h2>Hukum Dasar Supply dan Demand</h2>
      <p>Ketika penawaran terbatas dan permintaan meledak, kuota resmi pasti habis seketika. Banyak penonton membeli tiket bersama teman atau keluarga, namun seiring berjalannya waktu menjelang hari acara, faktor kehidupan nyata terjadi.</p>

      <h3>Dinamika Pemilik Tiket Berhalangan Hadir</h3>
      <ul>
        <li>Tugas luar kota atau ujian akademik mendadak yang tidak dapat dihindari.</li>
        <li>Kondisi darurat finansial atau kesehatan keluarga.</li>
        <li>Perubahan preferensi kategori tempat duduk antar-penonton.</li>
      </ul>

      <h2>Pasar Sekunder Sebagai Penyeimbang</h2>
      <p>Tanpa pasar sekunder resmi, tiket-tiket tersebut akan hangus sia-sia atau dijual lewat transaksi gelap tanpa perlindungan. Secondary market yang beroperasi secara transparan memberikan solusi sehat: pemilik tiket mendapatkan pengembalian dana, sementara penggemar lain yang sebelumnya kehabisan kuota tetap dapat menonton konser impian mereka.</p>

      <h3>Mencegah Calo Liar yang Spekulatif</h3>
      <p>Edukasi pasar sekunder bukan untuk mendorong spekulasi calo, melainkan memastikan pertukaran tiket yang memang sudah ada terjadi di tempat yang aman, terdaftar, dan terlindungi teknologi penahanan dana.</p>
    `,
    source_references: ['Kajian Ekonomi Kreatif Kemenparekraf RI', 'Studi Kapasitas Venue Live Nation Global']
  },

  // ===================================================================
  // ARTICLE 07 — SOCIAL MEDIA SCAMS (Week 4, Art 1)
  // ===================================================================
  {
    id: 'art-campaign-07',
    title: 'Kenapa Beli Tiket Konser Lewat DM Instagram atau X Sangat Berisiko?',
    slug: 'kenapa-beli-tiket-konser-lewat-dm-instagram-atau-x-berisiko',
    description: 'Risiko beli tiket konser lewat Instagram dan X: ketiadaan rekening penampungan netral, bukti transfer palsu, akun anonim, dan cara bertransaksi aman.',
    category: CONTENT_PILLARS.SCAM_PREVENTION,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'beli tiket konser lewat Instagram',
      'scam tiket Instagram',
      'jual tiket konser X',
      'penipuan tiket media sosial'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-beli-tiket-konser-lewat-dm-instagram-atau-x-berisiko',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apakah semua penjual tiket di media sosial penipu?',
        a: 'Tentu tidak. Banyak penggemar jujur yang benar-benar berhalangan hadir. Masalahnya, sistem media sosial tidak memiliki filter keamanan untuk membedakan orang jujur dari pelaku penipuan.'
      },
      {
        q: 'Bagaimana cara mengajak penjual medsos bertransaksi dengan aman?',
        a: 'Ajak penjual memindahkan transaksi ke marketplace sekunder ber-escrow seperti Tikum agar dana Anda aman dan penjual juga terjamin menerima pembayaran.'
      }
    ],
    content: `
      <p><strong>Media sosial dirancang untuk interaksi komunikasi publik, bukan sebagai tempat penyelesaian transaksi keuangan yang aman.</strong> Ketika Anda bertransaksi tiket bernilai jutaan rupiah di direct message (DM), Anda melepaskan seluruh instrumen perlindungan konsumen standar perbankan dan e-commerce.</p>

      <h2>3 Faktor Utama Kerentanan di Medsos</h2>
      <ol>
        <li><strong>Anonimitas Ekstrem:</strong> Membuat akun baru di X atau Instagram hanya butuh email sekali pakai. Akun dengan ribuan pengikut pun kini dapat dibeli murah atau dibajak.</li>
        <li><strong>Ketiadaan Rekening Penampungan:</strong> Tidak ada fitur "tahan dana" di dalam direct message. Transfer bank langsung bersifat final dan tidak bisa ditarik kembali.</li>
        <li><strong>Mudahnya Memalsukan Testimoni:</strong> Screenshot "bukti sukses transaksi" antar-akun sangat mudah dibuat menggunakan dua ponsel berbeda milik komplotan yang sama.</li>
      </ol>

      <h3>Bahaya Modus Rekening Bersama Palsu</h3>
      <p>Sering kali pelaku menawarkan "rekber" di WhatsApp atau Telegram. Waspadalah: nomor admin rekber tersebut hampir selalu merupakan nomor kedua milik penipu yang sama.</p>

      <h2>Cara Menguji Niat Penjual</h2>
      <p>Katakan kepada penjual: <em>"Saya siap beli dengan harga yang disepakati, tapi transaksi kita selesaikan lewat Tikum supaya dana ditahan escrow dan kita sama-sama aman."</em> Penjual yang jujur akan menyambut tawaran ini karena dananya terjamin, sedangkan penipu akan langsung menolak dan mencari alasan.</p>
    `,
    source_references: ['Panduan Literasi Keuangan Digital OJK', 'Laporan Siber Crime Polri']
  },

  // ===================================================================
  // ARTICLE 08 — TICKET VERIFICATION (Week 4, Art 2)
  // ===================================================================
  {
    id: 'art-campaign-08',
    title: 'Cara Cek Tiket Konser Asli Sebelum Melakukan Pembayaran',
    slug: 'bagaimana-cara-memverifikasi-tiket-konser-sebelum-membayar',
    description: 'Panduan cara cek tiket konser dan verifikasi barcode asli: kenapa screenshot tidak cukup, cara validasi nomor booking, dan perlindungan penahanan dana.',
    category: CONTENT_PILLARS.TICKET_SAFETY,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'cara cek tiket konser',
      'verifikasi tiket',
      'cek tiket asli',
      'cek QR tiket'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/bagaimana-cara-memverifikasi-tiket-konser-sebelum-membayar',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apakah QR code tiket bisa dicek keasliannya sebelum konser?',
        a: 'Secara mandiri tidak bisa, karena sistem pemindai resmi hanya diaktifkan oleh vendor tiket di gerbang turnstile pada hari acara untuk mencegah pembocoran database.'
      },
      {
        q: 'Jika QR code tidak bisa dicek sendiri, bagaimana cara terlindung?',
        a: 'Gunakan sistem penahanan dana escrow. Pembayaran Anda hanya diselesaikan ke penjual setelah QR code berhasil dipindai di pintu turnstile.'
      }
    ],
    content: `
      <p><strong>Tangkapan layar (screenshot) barcode e-ticket bukan bukti sah kepemilikan maupun keaslian tiket.</strong> Barcode hanyalah representasi grafis angka biner yang dapat disalin, digandakan ratusan kali, atau diedit dalam hitungan detik tanpa mengubah tampilan visualnya.</p>

      <h2>Keterbatasan Verifikasi Mandiri</h2>
      <p>Banyak calon pembeli mengira mereka bisa memindai QR code tiket menggunakan kamera ponsel untuk membuktikan keasliannya. Faktanya, vendor tiket resmi mengenkripsi string barcode dengan kunci server tertutup. Hanya mesin turnstile resmi di venue yang dapat memvalidasi apakah tiket tersebut asli, aktif, dan belum pernah dipindai sebelumnya.</p>

      <h3>3 Data Kunci yang Perlu Diverifikasi</h3>
      <ul>
        <li><strong>Email Konfirmasi Pembelian Asli:</strong> Minta penjual melakukan screen-record (rekaman layar) mulai dari aplikasi email resmi, menampilkan header pengirim, waktu penerimaan, dan invoice.</li>
        <li><strong>Konsistensi Identitas:</strong> Nama di email pemesanan harus identik dengan nama di KTP penjual.</li>
        <li><strong>Kategori dan Nomor Kursi:</strong> Cocokkan denah venue resmi (seating plan) dengan nomor kursi yang tertera.</li>
      </ul>

      <h2>Solusi Definitif: Verifikasi Berbasis Penahanan Dana</h2>
      <p>Karena verifikasi mandiri memiliki batas teknis, perlindungan terbaik adalah tidak melepas dana sebelum tiket terbukti berhasil digunakan di pintu turnstile.</p>
    `,
    source_references: ['Spesifikasi Teknis Sistem Tiket Elektronik APMI', 'Tikum Security Whitepaper']
  },

  // ===================================================================
  // ARTICLE 09 — DOUBLE SELLING (Week 5, Art 1)
  // ===================================================================
  {
    id: 'art-campaign-09',
    title: 'Apa Itu Double Selling Tiket Konser? Modus Scam Barcode Ganda',
    slug: 'apa-itu-double-selling-tiket-modus-scam',
    description: 'Mengenal bahaya double selling tiket: satu e-ticket asli yang dijual ke banyak korban sekaligus, risiko penolakan turnstile gate, dan solusi proteksinya.',
    category: CONTENT_PILLARS.SCAM_PREVENTION,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'double selling tiket',
      'tiket konser duplikat',
      'barcode sama',
      'turnstile rejection'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/apa-itu-double-selling-tiket-modus-scam',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apa itu double selling tiket konser?',
        a: 'Double selling adalah tindakan curang di mana satu tiket asli yang sah dijual oleh pelaku kepada lebih dari satu orang pembeli.'
      },
      {
        q: 'Siapa yang bisa masuk jika tiket kena double selling?',
        a: 'Hanya pembeli pertama yang tiba di gerbang dan memindai barcode di mesin turnstile. Pembeli lain yang tiba berikutnya akan ditolak dengan status barcode already used.'
      }
    ],
    content: `
      <p><strong>Double selling adalah modus penipuan paling berbahaya karena tiket yang dijual berstatus 100% asli saat dikirimkan.</strong> Penjual memang membeli tiket resmi dari promotor, namun file PDF e-ticket tersebut dikirimkan kepada 5 atau 10 orang pembeli berbeda.</p>

      <h2>Tragedi di Depan Pintu Gerbang Turnstile</h2>
      <p>Semua korban merasa aman karena dokumen PDF yang mereka terima asli dan terdaftar di database promotor. Petaka baru terjadi pada jam 17:00 di hari konser.</p>

      <h3>Kronologi Benturan Barcode di Gate</h3>
      <ul>
        <li>Korban A tiba jam 16:30 dan menempelkan barcode ke scanner turnstile. Lampu hijau menyala, pintu terbuka, Korban A masuk.</li>
        <li>Korban B tiba jam 17:00 dan menempelkan barcode yang sama. Lampu merah menyala dengan bunyi alarm: <em>"Ticket Already Scanned at 16:30"</em>.</li>
        <li>Petugas keamanan venue tidak memiliki pilihan selain menolak Korban B karena sistem turnstile hanya mengizinkan satu kali pemindaian per barcode unik.</li>
      </ul>

      <h2>Solusi: Kontrol Penahanan Dana Sampai Gerbang Berhasil Dilewati</h2>
      <p>Karena tidak ada cara visual membedakan siapa pemilik file PDF yang sah di luar sistem promotor, satu-satunya perlindungan finansial bagi penonton adalah <strong>menahan pembayaran di escrow hingga turnstile terlewati</strong>. Di Tikum, jika Anda ditolak di gerbang akibat duplikasi barcode, Anda tidak kehilangan uang karena dana penjual dibekukan.</p>
    `,
    source_references: ['Analisis Kejahatan Akses Kontrol Venue', 'Polri Cyber Patrol Case Studies']
  },

  // ===================================================================
  // ARTICLE 10 — ESCROW VS TRANSFER LANGSUNG (Week 5, Art 2)
  // ===================================================================
  {
    id: 'art-campaign-10',
    title: 'Escrow vs Transfer Langsung: Mana Lebih Aman Beli Tiket Konser?',
    slug: 'escrow-vs-transfer-langsung-mana-yang-lebih-aman',
    description: 'Perbandingan escrow vs transfer langsung untuk transaksi tiket event: analisis risiko kehilangan uang, jejak transaksi, dan perlindungan sengketa.',
    category: CONTENT_PILLARS.TICKET_SAFETY,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'escrow vs transfer langsung',
      'rekening bersama',
      'jual beli tiket aman',
      'perbandingan transfer tiket'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-10-06T08:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/escrow-vs-transfer-langsung-mana-yang-lebih-aman',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-06T08:30:00+07:00',
    faq: [
      {
        q: 'Apakah biaya admin escrow sebanding dengan perlindungannya?',
        a: 'Sangat sebanding. Biaya platform kecil jauh lebih murah dibanding risiko kehilangan 100% uang tiket jutaan rupiah akibat ditipu calo medsos.'
      },
      {
        q: 'Bisakah penjual kabur membawa uang pada sistem escrow?',
        a: 'Tidak bisa, karena dana berada di rekening penampungan platform dan baru dicairkan setelah proses verifikasi tiket tuntas.'
      }
    ],
    content: `
      <p><strong>Dalam transaksi secondary ticketing, metode pembayaran menentukan 90% tingkat keselamatan dana Anda.</strong> Memilih antara transfer bank langsung dan sistem escrow adalah pilihan antara mengambil risiko total atau bertransaksi dengan jaminan perlindungan terstruktur.</p>

      <h2>Tabel Perbandingan Menyeluruh</h2>
      <table style="width:100%; border-collapse:collapse; margin:20px 0;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:10px 14px; text-align:left; color:#f8fafc;">Fitur Keamanan</th>
            <th style="padding:10px 14px; text-align:left; color:#ef4444;">Transfer Langsung (Medsos)</th>
            <th style="padding:10px 14px; text-align:left; color:#4ade80;">Escrow Netral (Tikum)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Posisi Dana Sebelum Masuk Venue</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#f87171;">Sudah di kantong penjual</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Tertahan di rekening netral</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Penyelesaian Jika Tiket Ditolak</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#f87171;">Nol (kontak sering diblokir)</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Klaim sengketa & pengembalian dana</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Perlindungan Bagi Penjual Sah</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#f87171;">Rawan bukti transfer palsu</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Jaminan pembayaran nyata terverifikasi</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Jejak Audit Hukum</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#f87171;">Sulit dilacak (akun anonim)</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Tercatat lengkap dengan identitas resmi</td>
          </tr>
        </tbody>
      </table>

      <h3>Studi Kasus: Skenario Gagal Masuk Turnstile</h3>
      <p>Jika tiket bermasalah di pintu turnstile gate, pembeli transfer langsung tidak memiliki harapan pengembalian dana. Pada sistem escrow Tikum, bukti penolakan memicu pembekuan settlement dan pencairan pengembalian dana.</p>

      <h2>Kesimpulan Rasional</h2>
      <p>Transfer langsung mungkin tampak cepat dan tanpa biaya platform tambahan, tetapi harga yang dipertaruhkan adalah keamanan seluruh uang tiket Anda. Escrow adalah standar modern bertransaksi di era digital.</p>
    `,
    source_references: ['Kajian Hukum Perjanjian E-Commerce Universitas Indonesia', 'Pedoman OJK Perlindungan Konsumen Fintek']
  },

  // ===================================================================
  // ARTICLE 11 — SELLER GUIDE (Week 6, Art 2 - Scheduled 2026-10-09)
  // ===================================================================
  {
    id: 'art-campaign-11',
    title: 'Cara Menjual Tiket Konser dengan Aman Tanpa Takut Pembeli Scam',
    slug: 'cara-menjual-tiket-konser-dengan-aman',
    description: 'Panduan jual tiket konser aman bagi pemilik tiket yang berhalangan hadir: hindari struk pembayaran palsu dan pastikan dana terkunci di rekening escrow.',
    category: CONTENT_PILLARS.TICKET_GUIDES,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'jual tiket konser aman',
      'cara jual tiket konser',
      'resell tiket',
      'jual tiket sold out'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-09T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/cara-menjual-tiket-konser-dengan-aman',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-03T14:00:00+07:00',
    faq: [
      {
        q: 'Apa risiko terbesar yang dihadapi penjual tiket konser?',
        a: 'Menerima bukti pembayaran palsu dari pembeli nakal dan menyerahkan barcode tiket sebelum dana benar-benar masuk ke rekening.'
      },
      {
        q: 'Bagaimana Tikum melindungi penjual tiket?',
        a: 'Tikum mengunci pembayaran pembeli di rekening escrow sebelum meminta penjual menyerahkan dokumen, memastikan dana sah sudah tersedia.'
      }
    ],
    content: `
      <p><strong>Banyak orang lupa bahwa penjual tiket yang sah juga sering menjadi korban penipuan di pasar sekunder.</strong> Ketika Anda berhalangan hadir dan ingin menjual tiket konser, Anda rentan berhadapan dengan pembeli nakal yang mengirimkan slip transfer editan atau mengklaim tiket tidak berfungsi padahal sudah berhasil digunakan.</p>

      <h2>Modus Penipuan yang Mengintai Penjual</h2>
      <ul>
        <li><strong>Struk M-Banking Editan:</strong> Pembeli mengirimkan tangkapan layar transfer sukses dan mendesak penjual segera mengirim file e-ticket karena antrean sudah dibuka.</li>
        <li><strong>Klaim Sepihak Tanpa Bukti:</strong> Pembeli masuk ke venue dengan lancar, lalu melapor ke media sosial bahwa tiket palsu untuk memeras penjual.</li>
        <li><strong>Penyalahgunaan Identitas KTP Penjual:</strong> Penjual diminta foto KTP lengkap tanpa watermark, lalu KTP tersebut disalahgunakan di luar konteks transaksi.</li>
      </ul>

      <h3>Tips Menentukan Harga Jual yang Masuk Akal</h3>
      <p>Tetapkan harga yang transparan dan mencerminkan biaya modal resmi serta fee administrasi wajar. Hindari menetapkan harga ekstrem yang memicu kecurigaan calon pembeli.</p>

      <h2>Langkah Menjual Tiket dengan Aman di Tikum</h2>
      <ol>
        <li>Listing tiket Anda dengan harga transparan dan data kategori yang akurat.</li>
        <li>Tunggu verifikasi otomatis bahwa pembeli telah menyetorkan dana sah ke sistem penampungan Tikum.</li>
        <li>Serahkan file tiket resmi dan dokumen pendukung sesuai panduan platform.</li>
        <li>Dana dicairkan dengan aman setelah hari acara tanpa risiko klaim sepihak yang tidak beralasan.</li>
      </ol>
    `,
    source_references: ['Standar Perlindungan Merchant Fintek Indonesia', 'Panduan Komunitas Penjual Tikum']
  },

  // ===================================================================
  // ARTICLE 12 — BUYER & SELLER TRUST (Week 7, Art 1 - Scheduled 2026-10-13)
  // ===================================================================
  {
    id: 'art-campaign-12',
    title: 'Marketplace Tiket yang Aman Harus Melindungi Pembeli dan Penjual',
    slug: 'marketplace-tiket-yang-aman-harus-melindungi-pembeli-dan-penjual',
    description: 'Pentingnya marketplace tiket aman dengan perlindungan seimbang: proteksi dana pembeli saat tiket bermasalah dan jaminan pembayaran bagi penjual jujur.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'marketplace tiket aman',
      'perlindungan pembeli tiket',
      'perlindungan penjual tiket',
      'ekosistem tiket terpercaya'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-13T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/marketplace-tiket-yang-aman-harus-melindungi-pembeli-dan-penjual',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-03T14:00:00+07:00',
    faq: [
      {
        q: 'Kenapa platform tiket tidak boleh hanya memihak pembeli?',
        a: 'Jika platform hanya memihak pembeli secara buta, penjual jujur akan takut melepaskan tiket mereka karena rentan diperas pembeli nakal dengan klaim palsu.'
      },
      {
        q: 'Bagaimana Tikum menentukan keputusan dalam sengketa transaksi?',
        a: 'Keputusan didasarkan pada audit trail teknis: log waktu pemindaian turnstile, bukti penolakan fisik, dan verifikasi dokumen yang diajukan kedua belah pihak.'
      }
    ],
    content: `
      <p><strong>Pasar tiket sekunder yang berkelanjutan tidak dapat dibangun di atas asimetri perlindungan yang timpang.</strong> Jika sebuah platform hanya melindungi pembeli, penjual yang berniat baik akan meninggalkan platform. Sebaliknya, jika platform membiarkan penjual bertindak bebas tanpa kontrol, pembeli akan menjadi korban penipuan.</p>

      <h2>Menyeimbangkan Hak Dua Belah Pihak</h2>
      <p>Kepercayaan sejati lahir dari transparansi aturan main yang mengikat kedua pihak secara adil:</p>
      <ul>
        <li><strong>Hak Pembeli:</strong> Mendapatkan jaminan bahwa tiket yang dibeli valid, dokumen penukaran lengkap, dan dana tidak akan dilepas ke penjual jika tiket gagal digunakan akibat kesalahan penjual.</li>
        <li><strong>Hak Penjual:</strong> Mendapatkan jaminan bahwa dana pembeli sudah terkunci aman sebelum tiket diserahkan, serta perlindungan dari pembatalan sepihak tanpa bukti teknis yang sah.</li>
      </ul>

      <h3>Desain Sistem Netral di Tengah</h3>
      <p>Platform tidak boleh bertindak sebagai pihak yang mencari keuntungan dari perselisihan, melainkan sebagai fasilitator netral yang menjaga kepatuhan perjanjian bersama.</p>

      <h2>Penyelesaian Sengketa Berbasis Bukti Objektif</h2>
      <p>Tikum menolak klaim emosional sepihak. Setiap sengketa diverifikasi melalui parameter konkret: timestamp scan turnstile, foto slip penolakan resmi dari pintu masuk, serta verifikasi kelengkapan identitas. Inilah fondasi trust infrastructure yang membedakan Tikum dari forum jual beli bebas.</p>
    `,
    source_references: ['Prinsip Perlindungan Konsumen Seimbang Kemendag', 'Tikum Dispute Resolution Policy']
  },

  // ===================================================================
  // ARTICLE 13 — SECONDARY MARKET EXPLAINER (Week 7, Art 2 - Scheduled 2026-10-16)
  // ===================================================================
  {
    id: 'art-campaign-13',
    title: 'Apa Itu Secondary Ticket Market? Panduan Edukasi untuk Pemula',
    slug: 'apa-itu-secondary-ticket-market-panduan-lengkap',
    description: 'Pelajari apa itu secondary ticket market di Indonesia: perbedaan dengan primary market resmi promotor, status hukum, dan mekanisme transaksi terstruktur.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'secondary ticket market',
      'secondary ticketing',
      'ticket resale',
      'pasar sekunder tiket'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-16T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/apa-itu-secondary-ticket-market-panduan-lengkap',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-04T14:00:00+07:00',
    faq: [
      {
        q: 'Apakah menjual kembali tiket konser legal di Indonesia?',
        a: 'Menjual kembali tiket milik pribadi pada dasarnya adalah hak kepemilikan konsumen, namun pembeli dan penjual tetap wajib mematuhi syarat dan ketentuan yang ditetapkan oleh promotor penyelenggara acara.'
      },
      {
        q: 'Apa beda calo liar dengan secondary marketplace terstruktur?',
        a: 'Calo liar beroperasi tanpa verifikasi, tanpa rekber/escrow, dan tanpa tanggung jawab jika tiket bermasalah. Marketplace terstruktur menerapkan escrow, verifikasi identitas, dan jaminan pengembalian dana.'
      }
    ],
    content: `
      <p><strong>Secondary ticket market adalah pasar tempat tiket yang sudah dibeli dari penyelenggara resmi (primary market) diperjualbelikan kembali antarindividu.</strong> Di era industri hiburan live modern, pasar sekunder merupakan bagian tak terpisahkan dari ekosistem event global.</p>

      <h2>Anatomi Pasar Tiket: Primer vs Sekunder</h2>
      <p>Untuk memahami pasar sekunder, kita perlu melihat dua jalurnya:</p>
      <ul>
        <li><strong>Primary Market:</strong> Titik pertama penjualan tiket oleh promotor melalui vendor resmi yang ditunjuk. Harga tiket ditetapkan oleh penyelenggara berdasarkan kategori tempat duduk.</li>
        <li><strong>Secondary Market:</strong> Pertukaran tiket setelah fase primary selesai. Terjadi antara penonton yang sudah memegang tiket dengan calon penonton yang belum memilikinya.</li>
      </ul>

      <h3>Peran Ekosistem Penjualan Tiket</h3>
      <p>Pasar primer menyediakan pasokan awal tiket konser, sedangkan pasar sekunder memberikan likuiditas bagi penggemar yang mendadak berhalangan hadir atau yang belum beruntung mendapatkan tiket pada periode presale.</p>

      <h2>Memahami Ketentuan Promotor dan Batasan Hukum</h2>
      <p>Penting untuk dicatat bahwa promotor berhak memberlakukan syarat dan ketentuan tertentu pada tiket mereka, seperti larangan memperjualbelikan tiket di atas harga tertentu atau kewajiban verifikasi kartu identitas asli. Edukasi konsumen yang bertanggung jawab selalu mengingatkan penonton untuk memeriksa regulasi spesifik tiap acara sebelum bertransaksi.</p>
    `,
    source_references: ['UU Perlindungan Konsumen No. 8 Tahun 1999', 'APMI Regulatory Overview']
  },

  // ===================================================================
  // ARTICLE 14 — PRICE TRANSPARENCY (Week 8, Art 1 - Scheduled 2026-10-20)
  // ===================================================================
  {
    id: 'art-campaign-14',
    title: 'Kenapa Harga Tiket Resale Bisa Lebih Mahal dari Harga Tiket Resmi?',
    slug: 'kenapa-harga-tiket-resale-bisa-lebih-mahal',
    description: 'Faktor penentu harga tiket resale konser: hukum kelangkaan kuota, biaya operasional platform, pajak hiburan, dan tips menilai kewajaran penawaran.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'harga tiket resale',
      'harga tiket konser',
      'ticket markup',
      'secondary market ticket price'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-20T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-harga-tiket-resale-bisa-lebih-mahal',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-04T14:00:00+07:00',
    faq: [
      {
        q: 'Apakah semua tiket resale pasti lebih mahal?',
        a: 'Tidak selalu. Pada banyak event, tiket resale justru bisa dijual setara harga modal atau bahkan lebih murah menjelang hari acara jika penjual sangat mendesak ingin melepas tiketnya.'
      },
      {
        q: 'Bagaimana Tikum memandang transparansi harga?',
        a: 'Tikum mengutamakan transparansi rincian biaya: harga tiket pokok, biaya platform, dan biaya layanan ditampilkan secara jujur di awal tanpa biaya tersembunyi.'
      }
    ],
    content: `
      <p><strong>Perbedaan harga antara tiket resmi dan pasar sekunder terjadi karena dinamika kelangkaan, struktur biaya operasional, dan kebebasan penjual menetapkan nilai tiket mereka.</strong> Memahami bagaimana struktur harga terbentuk membantu pembeli mengambil keputusan rasional.</p>

      <h2>Komponen yang Membentuk Harga Resale</h2>
      <ol>
        <li><strong>Nilai Kelangkaan (Scarcity Premium):</strong> Semakin populer musisi dan semakin terbatas kapasitas kursi, semakin tinggi nilai yang diberikan oleh pemegang tiket saat melepaskan hak tontonnya.</li>
        <li><strong>Biaya Transaksi &amp; Perlindungan Platform:</strong> Pengoperasian sistem escrow, verifikasi berkas, dan penempatan tim PIC lapangan di venue membutuhkan infrastruktur teknologi dan operasional yang transparan.</li>
        <li><strong>Pajak Hiburan dan Biaya Penanganan:</strong> Harga awal tiket di promotor resmi umumnya sudah mencakup pajak daerah dan fee ticketing yang telah dibayar penuh oleh pembeli pertama.</li>
      </ol>

      <h3>Menilai Kewajaran Harga Tiket Sekunder</h3>
      <p>Bandingkan harga yang ditawarkan dengan harga modal resmi ditambah biaya administrasi wajar. Jika markup melampaui batas kewajaran, pembeli disarankan menunggu mendekati hari acara ketika harga biasanya melandai.</p>

      <h2>Sikap Tikum Terhadap Transparansi Pasar</h2>
      <p>Tikum menolak praktik mark-up predatoris yang eksploitatif. Di platform Tikum, calon pembeli selalu disajikan perincian harga yang jelas sejak awal. Tidak ada jebakan biaya tersembunyi (drip pricing) saat proses checkout.</p>
    `,
    source_references: ['Prinsip Transparansi Harga Kemendag RI', 'Studi Dinamika Pasar Hiburan Live']
  },

  // ===================================================================
  // ARTICLE 15 — SCAM CHECKLIST (Week 8, Art 2 - Scheduled 2026-10-23)
  // ===================================================================
  {
    id: 'art-campaign-15',
    title: 'Checklist Anti-Scam Sebelum Beli Tiket Konser Online di Indonesia',
    slug: 'checklist-anti-scam-sebelum-membeli-tiket-konser-online',
    description: 'Gunakan checklist anti scam tiket sebelum mentransfer uang: 10 langkah verifikasi keaslian akun, bukti pembelian, kelengkapan KTP, dan proteksi escrow.',
    category: CONTENT_PILLARS.SCAM_PREVENTION,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'checklist anti scam tiket',
      'tips aman beli tiket',
      'verifikasi tiket konser',
      'anti calo penipu'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-23T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/checklist-anti-scam-sebelum-membeli-tiket-konser-online',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-04T14:00:00+07:00',
    faq: [
      {
        q: 'Apa yang harus dilakukan jika penjual menolak menggunakan checklist ini?',
        a: 'Jika penjual menolak verifikasi mendasar atau menolak sistem escrow, hentikan komunikasi seketika. Itu adalah red flag terbesar penipuan.'
      }
    ],
    content: `
      <p><strong>Gunakan checklist cepat 10 langkah ini sebelum mentransfer dana untuk membeli tiket konser dari siapa pun di internet.</strong> Jika salah satu poin bertanda merah muncul, segera batalkan transaksi.</p>

      <h2>Checklist 10 Poin Anti-Scam</h2>
      <ul style="list-style:none; padding:0;">
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>1. Rekening Penampungan:</strong> Transaksi dilindungi rekening penampungan netral (escrow), bukan rekening pribadi penjual.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>2. Bukti Pembelian Otentik:</strong> Penjual menunjukkan invoice asli lengkap dengan nama akun pemesan yang sesuai dengan kartu identitas.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>3. Dokumen Surat Kuasa:</strong> Penjual bersedia memberikan surat kuasa bertanda tangan meterai asli jika penukaran fisik diwajibkan.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>4. Tidak Ada Tekanan Waktu:</strong> Penjual tidak menciptakan urgensi panik buatan (misal "transfer dalam 5 menit").</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>5. Rekam Jejak Akun:</strong> Akun memiliki riwayat aktivitas organik, bukan akun baru dibuat beberapa hari lalu.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>6. Harga Wajar:</strong> Harga tidak di bawah harga resmi untuk kategori yang sudah sold out (indikator umpan klasik penipu).</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>7. Tidak Mengganti Rekening:</strong> Nama rekening bank sama persis dengan nama identitas yang dikonfirmasi di awal.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>8. Tolak Bukti Screenshot Semata:</strong> Penjual bersedia menunjukkan bukti video screen-record aplikasi resmi tiket.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>9. Titik Bantuan Venue:</strong> Tersedia jalur eskalasi resmi jika terjadi kendala pada saat acara berlangsung di venue.</li>
        <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; <strong>10. Jejak Digital Tercatat:</strong> Riwayat transaksi tercatat secara resmi di dalam platform yang dapat dipertanggungjawabkan.</li>
      </ul>

      <h3>Tanda Bahaya Merah (Red Flags)</h3>
      <p>Jika penjual bersikeras meminta uang muka (DP) tanpa jaminan platform, mengubah rekening tujuan di menit-menit akhir, atau menolak video call saat menunjukkan dokumen tiket, segera tinggalkan obrolan.</p>
    `,
    source_references: ['Checklist Keamanan Siber Patroli Siber Polri', 'Standar Transaksi Aman Tikum']
  },

  // ===================================================================
  // ARTICLE 16 — VENUE DAY EMERGENCY (Week 9, Art 1 - Scheduled 2026-10-27)
  // ===================================================================
  {
    id: 'art-campaign-16',
    title: 'Apa yang Harus Dilakukan Jika Tiket Bermasalah Saat Hari Konser?',
    slug: 'apa-yang-harus-dilakukan-jika-tiket-bermasalah-saat-hari-konser',
    description: 'Langkah darurat jika tiket bermasalah saat konser: cara mendokumentasikan penolakan gate turnstile, menemui helpdesk, dan perlindungan refund di Tikum.',
    category: CONTENT_PILLARS.TICKET_SAFETY,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'tiket bermasalah saat konser',
      'tiket tidak bisa masuk',
      'QR tiket tidak valid',
      'masalah tiket konser'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-27T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/apa-yang-harus-dilakukan-jika-tiket-bermasalah-saat-hari-konser',
    author: 'Tim Riset Keamanan Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-05T14:00:00+07:00',
    faq: [
      {
        q: 'Bukti apa yang paling penting jika barcode tiket ditolak turnstile?',
        a: 'Foto layar pemindai turnstile yang menunjukkan pesan error/penolakan dan slip penolakan fisik resmi dari petugas ticketing venue.'
      },
      {
        q: 'Bagaimana pembeli Tikum menghubungi bantuan di venue?',
        a: 'Gunakan tombol Bantuan Lapangan di dashboard pesanan Tikum untuk terhubung langsung dengan PIC venue yang bertugas di lokasi acara.'
      }
    ],
    content: `
      <p><strong>Menghadapi lampu merah menyala di gerbang turnstile venue konser adalah situasi yang menegangkan, namun tetap berkepala dingin adalah kunci penyelamatan hak Anda.</strong> Ikuti panduan darurat ini langkah demi langkah.</p>

      <h2>Langkah 1: Jangan Tinggalkan Gerbang Tanpa Dokumentasi</h2>
      <p>Minta petugas pemindai memperlihatkan layar scanner dan foto pesan kesalahannya (misalnya: <em>"Barcode Already Scanned"</em> atau <em>"Ticket Revoked"</em>). Catat jam pasti kejadian, nomor gerbang (gate), dan nama petugas yang bertugas.</p>

      <h3>Mendapatkan Slip Penolakan Resmi</h3>
      <p>Sebagian besar vendor turnstile profesional dapat mencetak slip log penolakan (gate rejection slip). Dokumen fisik ini adalah bukti nomor satu yang tidak dapat disanggah oleh penjual.</p>

      <h2>Langkah 2: Temui Helpdesk Resmi Promotor</h2>
      <p>Tanyakan apakah kendala tersebut bersifat teknis pada sistem scanner promotor atau murni kesalahan pada nomor tiket yang Anda bawa. Mintalah surat keterangan atau catatan penolakan jika tersedia.</p>

      <h2>Langkah 3: Hubungi PIC Tikum di Lokasi Acara</h2>
      <p>Jika transaksi Anda dilakukan melalui platform Tikum, segera hubungi PIC Tikum di titik temu venue yang telah ditentukan. PIC akan memverifikasi log pesanan dan memicu protokol pengamanan dana sengketa sehingga uang Anda tidak dicairkan ke pihak penjual.</p>
    `,
    source_references: ['Protokol Lapangan Tikum Venue Operations', 'Tata Tertib Penonton Konser Musik Indonesia']
  },

  // ===================================================================
  // ARTICLE 17 — FLAGSHIP: TIKUM BRAND STORY (Week 6, Art 1 - PUBLISHED TODAY 2026-10-06)
  // ===================================================================
  {
    id: 'art-campaign-17',
    title: 'Kenapa Tikum Dibangun? Mengubah Cara Transaksi Tiket di Indonesia',
    slug: 'kenapa-tikum-dibangun-mengubah-secondary-ticketing-indonesia',
    description: 'Kisah di balik Tikum tiket: marketplace secondary ticketing aman di Indonesia dengan sistem escrow terproteksi, verifikasi berkas, dan PIC di venue.',
    category: CONTENT_PILLARS.TIKUM,
    search_intent: SEARCH_INTENTS.COMMERCIAL,
    keywords: [
      'Tikum tiket',
      'Tikum secondary ticketing',
      'marketplace tiket aman',
      'escrow tiket',
      'jual beli tiket konser aman',
      'tiket konser sold out',
      'anti scam tiket',
      'PIC venue'
    ],
    status: CONTENT_STATUS.PUBLISHED,
    published_at: '2026-10-06T09:00:00+07:00',
    updated_at: '2026-10-06T09:00:00+07:00',
    created_at: '2026-09-30T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/kenapa-tikum-dibangun-mengubah-secondary-ticketing-indonesia',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-05T14:00:00+07:00',
    faq: [
      {
        q: 'Apa itu Tikum tiket dan apa fokus utamanya?',
        a: 'Tikum adalah marketplace secondary ticketing di Indonesia yang dibangun dengan fokus pada keamanan transaksi: penahanan dana escrow, verifikasi berkas tiket, dan kehadiran perwakilan PIC di venue konser.'
      },
      {
        q: 'Apa yang membedakan Tikum dari jual beli tiket di media sosial?',
        a: 'Di media sosial, pembeli harus mentransfer langsung ke rekening asing tanpa perlindungan. Di Tikum, uang pembeli tertahan di rekening escrow netral hingga tiket berhasil divalidasi pada hari acara.'
      },
      {
        q: 'Apakah Tikum menjamin bebas penipuan 100%?',
        a: 'Tidak ada platform yang dapat secara jujur mengklaim risiko nol. Tikum meminimalisasi risiko fraud secara sistematis melalui escrow, verifikasi dokumen, pencatatan jejak audit, dan resolusi sengketa berbasis bukti.'
      },
      {
        q: 'Bagaimana peran PIC Tikum di lokasi acara?',
        a: 'Untuk event-event yang didukung, PIC Tikum hadir di area venue untuk membantu koordinasi serah terima fisik wristband dan mendokumentasikan kendala teknis gerbang masuk.'
      }
    ],
    content: `
      <p><strong>Tikum hadir dengan pendekatan baru terhadap secondary ticketing di Indonesia: membangun ekosistem jual beli tiket konser yang mengutamakan rasa aman, perlindungan dana escrow, dan pendampingan nyata di lapangan.</strong></p>

      <p>Setiap kali konser musisi besar diumumkan di Indonesia, antusiasme masyarakat selalu luar biasa. Namun di balik kegembiraan itu, ribuan penonton mengalami kerugian hingga miliaran rupiah akibat penipuan transfer langsung di media sosial, duplikasi barcode, dan calo anonim yang menghilang setelah menerima uang. Tikum dibangun untuk mengakhiri kecemasan tersebut.</p>

      <h2>Masalah Nyata di Pasar Sekunder Indonesia</h2>
      <p>Pasar sekunder tiket di Indonesia tumbuh organik karena kebutuhan riil: kuota tiket primary habis dalam menit, sementara ribuan pemilik tiket mengalami perubahan rencana mendadak. Masalahnya bukan pada keberadaan pasar sekunder itu sendiri, melainkan pada kanal transaksi yang tidak memiliki infrastruktur kepercayaan:</p>
      <ul>
        <li><strong>Tangkapan layar bukan bukti:</strong> Gambar barcode e-ticket dapat dipalsukan hanya dalam hitungan menit menggunakan alat edit sederhana.</li>
        <li><strong>Transfer bank satu arah:</strong> Begitu uang ditransfer antar-rekening pribadi, pembeli kehilangan daya tawar dan kontrol atas dananya.</li>
        <li><strong>Ketiadaan bantuan hari-H:</strong> Saat turnstile gate di venue menolak tiket, penonton di media sosial tidak memiliki titik eskalasi sama sekali.</li>
      </ul>

      <h2>Solusi Tikum: Trust Infrastructure untuk Live Events</h2>
      <p>Tikum dirancang dengan 9 pilar diferensiasi operasional yang saling melengkapi:</p>

      <h3>9 Pilar Kepercayaan Tikum</h3>
      <ol>
        <li><strong>Escrow / Protected Payment Flow:</strong> Dana pembeli aman di rekening penampungan netral hingga syarat transaksi terpenuhi.</li>
        <li><strong>Ticket Verification Protocol:</strong> Validasi dokumen identitas dan bukti pembelian resmi sebelum listing tiket disetujui.</li>
        <li><strong>Venue PIC &amp; Field Presence:</strong> Kehadiran Person in Charge (PIC) di area venue konser untuk mendampingi penukaran fisik dan verifikasi masuk.</li>
        <li><strong>Buyer Protection:</strong> Hak pengembalian dana penuh jika tiket terbukti tidak valid atau ditolak oleh sistem resmi promotor.</li>
        <li><strong>Seller Protection:</strong> Jaminan dana sah terkunci di escrow sebelum tiket diserahkan, bebas dari bukti transfer palsu.</li>
        <li><strong>Transparent Transaction Flow:</strong> Seluruh tahapan transaksi dapat dipantau secara real-time oleh kedua belah pihak.</li>
        <li><strong>Evidence-Based Dispute Resolution:</strong> Penyelesaian sengketa berbasis bukti teknis (slip turnstile, timestamp, foto error).</li>
        <li><strong>Local Indonesian Customer Support:</strong> Layanan dukungan pelanggan berbahasa Indonesia yang tanggap dan memahami konteks lokal.</li>
        <li><strong>Anti-Scam Operating Model:</strong> Pencegahan sistematis akun fiktif, blacklist penipu, dan pelaporan terintegrasi.</li>
      </ol>

      <h2>Apa yang Dikelola Hari Ini vs Roadmap Masa Depan</h2>
      <p>Kami meyakini kejujuran adalah mata uang kepercayaan tertinggi. Oleh karena itu, penting membedakan apa yang telah beroperasi saat ini dan rencana pengembangan ke depan:</p>
      <ul>
        <li><strong>Berjalan Hari Ini (Live Today):</strong> Marketplace secondary ticketing dengan pembayaran escrow terproteksi, verifikasi manual dokumen tiket, pendampingan PIC pada event-event pilihan, dan mekanisme sengketa berbasis bukti.</li>
        <li><strong>Peta Jalan Masa Depan (Roadmap):</strong> Integrasi API verifikasi langsung dengan promotor, reputasi skor kredibilitas penjual, dan ekspansi otomatisasi verifikasi turnstile skala nasional.</li>
      </ul>

      <h3>Komitmen Mematuhi Ketentuan Promotor</h3>
      <p>Tikum adalah platform independen yang menghormati ketentuan dan regulasi masing-masing penyelenggara acara. Kami selalu mengingatkan pengguna bahwa syarat penukaran tiket, pencocokan kartu identitas, dan kebijakan pemindahan hak tonton sepenuhnya mengacu pada ketentuan resmi promotor.</p>
    `,
    source_references: ['Grand Design Reseller Platform Tikum', 'APMI Live Event Ecosystem Analysis']
  },

  // ===================================================================
  // ARTICLE 18 — VIAGOGO / STUBHUB COMPARISON (Week 9, Art 2 - Scheduled 2026-10-30)
  // ===================================================================
  {
    id: 'art-campaign-18',
    title: 'Viagogo, StubHub, atau Marketplace Lokal untuk Tiket Konser?',
    slug: 'viagogo-stubhub-atau-marketplace-lokal-perbandingan',
    description: 'Perbandingan Viagogo Indonesia, StubHub, dan marketplace lokal: analisis metode pembayaran rupiah, dukungan PIC venue, customer service, dan biaya.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'Viagogo Indonesia',
      'StubHub Indonesia',
      'secondary ticket marketplace',
      'beli tiket resale'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-10-30T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/viagogo-stubhub-atau-marketplace-lokal-perbandingan',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-05T14:00:00+07:00',
    faq: [
      {
        q: 'Apakah platform global seperti Viagogo aman untuk konser di Indonesia?',
        a: 'Platform global memiliki garansi pembeli resmi internasional, namun tantangan utamanya adalah customer service yang tidak berbahasa Indonesia, tidak adanya pendampingan fisik untuk penukaran gelang di venue, dan biaya konversi valuta asing.'
      },
      {
        q: 'Apa keunggulan marketplace lokal seperti Tikum dibanding platform global?',
        a: 'Dukungan customer service berbahasa Indonesia, metode pembayaran lokal (QRIS, Virtual Account, e-wallet), pemahaman mendalam atas regulasi promotor Indonesia, dan kehadiran PIC di sekitar lokasi venue.'
      }
    ],
    content: `
      <p><strong>Memilih antara platform secondary ticketing internasional dan platform lokal terverifikasi memerlukan pertimbangan objektif atas karakteristik konser di Indonesia.</strong> Setiap platform memiliki model operasional berbeda yang berdampak langsung pada pengalaman hari-H penonton.</p>

      <h2>Karakteristik Unik Konser di Indonesia</h2>
      <p>Tidak seperti negara barat di mana tiket digital langsung dipindai di pintu masuk stasiun, konser di Indonesia sering mewajibkan penukaran gelang (wristband exchange) beberapa hari sebelum acara dengan syarat surat kuasa fisik dan fotokopi KTP pemilik pertama. Prosedur lokal ini sering membingungkan penjual dan pembeli pada platform global.</p>

      <h3>Analisis Kelebihan dan Batasan Platform Global</h3>
      <p>Platform global memiliki jangkauan inventaris tiket seluruh dunia yang luas. Namun ketika pembeli di Jakarta mengalami kendala teknis penukaran gelang pada jam 15:00 di hari konser, pusat bantuan global yang beroperasi di zona waktu berbeda dengan respon email berjam-jam sering kali terlambat membantu.</p>

      <h2>Perbandingan Faktor Utama Transaksi</h2>
      <table style="width:100%; border-collapse:collapse; margin:20px 0;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:10px 14px; text-align:left; color:#f8fafc;">Parameter Kebutuhan</th>
            <th style="padding:10px 14px; text-align:left; color:#38bdf8;">Platform Resale Global</th>
            <th style="padding:10px 14px; text-align:left; color:#4ade80;">Marketplace Lokal Terverifikasi (Tikum)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Bahasa Layanan Pelanggan</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Mayoritas Bahasa Inggris / Bot terjemahan</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Bahasa Indonesia asli & respons cepat</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Metode Pembayaran</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Kartu kredit valas (biaya konversi FX)</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Rupiah (IDR), QRIS, Virtual Account bank lokal</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Dukungan di Venue Fisik</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Tidak ada perwakilan di lapangan</td>
            <td style="padding:10px 14px; border-bottom:1px solid #1e293b;">Dukungan PIC di venue pada event tertentu</td>
          </tr>
        </tbody>
      </table>

      <h3>Pertimbangan Akhir untuk Pembeli</h3>
      <p>Bagi penonton di Indonesia yang menginginkan kepastian komunikasi, kemudahan pembayaran rupiah, dan bantuan operasional saat penukaran gelang fisik, platform lokal terstruktur menawarkan relevansi yang jauh lebih tinggi.</p>
    `,
    source_references: ['Perbandingan Model Bisnis Tiketing Sekunder Global', 'Kajian Perlindungan Konsumen Lintas Batas']
  },

  // ===================================================================
  // ARTICLE 19 — EVENT-SPECIFIC TEMPLATE (Week 10, Art 1 - Scheduled 2026-11-03)
  // ===================================================================
  {
    id: 'art-campaign-19',
    title: 'Tiket Konser Sold Out? Panduan Mencari Tiket Secondary yang Aman',
    slug: 'event-favorit-sold-out-panduan-mencari-tiket-secondary',
    description: 'Panduan mencari tiket konser sold out secondary secara aman: verifikasi syarat promotor, penukaran wristband, dan menghindari calo liar tak berizin.',
    category: CONTENT_PILLARS.TICKET_GUIDES,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'tiket konser sold out secondary',
      'tiket coldplay resale',
      'tiket kpop sold out',
      'tiket konser habis'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-11-03T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/event-favorit-sold-out-panduan-mencari-tiket-secondary',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-05T14:00:00+07:00',
    faq: [
      {
        q: 'Bagaimana mencari tiket konser K-Pop yang sold out tanpa tertipu?',
        a: 'Pastikan penjual bersedia menyediakan surat kuasa bermeterai dan fotokopi KTP pemesan asli, serta transaksikan tiket tersebut melalui sistem escrow Tikum.'
      },
      {
        q: 'Apakah harga tiket sekunder akan turun menjelang hari konser?',
        a: 'Pada beberapa konser, harga tiket sekunder cenderung melandai pada H-3 hingga hari-H karena penjual yang berhalangan hadir ingin segera melepas tiket mereka.'
      }
    ],
    content: `
      <p><strong>Gagal mendapatkan tiket saat penjualan resmi pertama bukan akhir dari segalanya.</strong> Dengan kerangka kerja verifikasi yang tepat, Anda tetap dapat memperoleh tiket sekunder yang sah tanpa harus mempertaruhkan tabungan Anda kepada calo jalanan.</p>

      <h2>Kerangka 4 Langkah Mencari Tiket Sold Out</h2>
      <ol>
        <li><strong>Pantau Arus Tiket Ber-Escrow:</strong> Cari tiket di katalog terverifikasi Tikum di mana setiap listing wajib melalui tahapan kurasi data dan dilindungi penahanan dana otomatis.</li>
        <li><strong>Ketahui Karakteristik Tiap Genre:</strong> Konser K-Pop biasanya menerapkan pencocokan identitas kartu identitas yang sangat ketat, sementara festival multi-day memerlukan penukaran gelang terpisah.</li>
        <li><strong>Hindari Tawaran yang Terlalu Murah:</strong> Jika harga resmi Rp 2.500.000 dan tiket sudah sold out, waspadai penawaran di media sosial yang menjual seharga Rp 1.500.000—itu hampir pasti umpan scam.</li>
        <li><strong>Koordinasikan Jadwal Serah Terima:</strong> Tentukan apakah tiket diserahkan berupa file PDF sebelum acara atau wristband fisik di lokasi penukaran bersama PIC Tikum.</li>
      </ol>

      <h3>Kekhasan Kategori Standing vs Seating</h3>
      <p>Periksa nomor queue (antrean) jika membeli tiket festival standing, atau nomor section dan row jika membeli tiket seating bernomor. Jangan terima tiket jika data kategori tempat duduk tidak dicantumkan secara transparan.</p>
    `,
    source_references: ['Panduan Menonton Konser Musik Aman APMI', 'Tikum Event Catalog Guidelines']
  },

  // ===================================================================
  // ARTICLE 20 — PILLAR PAGE: CATEGORY AUTHORITY (Week 10, Art 2 - Scheduled 2026-11-06)
  // ===================================================================
  {
    id: 'art-campaign-20',
    title: 'Panduan Lengkap Secondary Ticketing di Indonesia: Regulasi & Tips',
    slug: 'panduan-lengkap-secondary-ticketing-di-indonesia',
    description: 'Panduan lengkap secondary ticketing Indonesia: hukum resale, cara kerja rekening escrow, pencegahan penipuan, verifikasi tiket, dan perlindungan konsumen.',
    category: CONTENT_PILLARS.SECONDARY_TICKETING,
    search_intent: SEARCH_INTENTS.INFORMATIONAL,
    keywords: [
      'secondary ticketing Indonesia',
      'jual beli tiket secondary',
      'ticket resale Indonesia',
      'marketplace tiket Indonesia',
      'tiket konser aman'
    ],
    status: CONTENT_STATUS.SCHEDULED,
    scheduled_at: '2026-11-06T09:00:00+07:00',
    published_at: null,
    updated_at: '2026-10-06T10:00:00+07:00',
    created_at: '2026-10-01T10:00:00+07:00',
    canonical_url: 'https://tikum.app/blog/panduan-lengkap-secondary-ticketing-di-indonesia',
    author: 'Tim Editorial Tikum',
    human_approved_by: 'admin-1',
    human_approved_at: '2026-10-05T14:00:00+07:00',
    faq: [
      {
        q: 'Apa itu secondary ticketing di Indonesia?',
        a: 'Pasar jual beli tiket event setelah penjualan resmi pertama usai, menghubungkan pemilik tiket yang berhalangan hadir dengan penggemar yang belum mendapatkan tiket.'
      },
      {
        q: 'Bagaimana masa depan pasar sekunder tiket di Indonesia?',
        a: 'Pasar sekunder di Indonesia bergerak dari kanal informal liar menuju ekosistem terstruktur yang berbasis teknologi escrow, transparansi harga, dan perlindungan konsumen dua arah.'
      },
      {
        q: 'Bagaimana cara memulai transaksi tiket yang aman?',
        a: 'Kunjungi marketplace Tikum, pilih event terverifikasi, dan nikmati perlindungan pembayaran escrow serta pendampingan operasional di venue.'
      }
    ],
    content: `
      <p><strong>Secondary ticketing di Indonesia adalah ekosistem transaksi tiket setelah penjualan resmi pertama selesai.</strong> Panduan komprehensif ini merangkum seluruh aspek penting pasar tiket sekunder: legalitas dan syarat promotor, cara kerja sistem pembayaran escrow, metode verifikasi keaslian tiket, peran perwakilan fisik di venue, serta panduan lengkap perlindungan pembeli dan penjual.</p>

      <h2>1. Apa Itu Secondary Ticketing dan Mengapa Terjadi?</h2>
      <p>Secondary ticketing bukanlah anomali, melainkan respons alami terhadap keterbatasan kapasitas venue hiburan di Indonesia. Ketika ratusan ribu orang memperebutkan puluhan ribu tiket resmi di primary market, pasar sekunder menjadi jembatan likuiditas bagi mereka yang berhalangan hadir maupun mereka yang mencari kesempatan kedua.</p>

      <h2>2. Mengapa Kanal Transaksi Tradisional Gagal Melindungi Penonton</h2>
      <p>Transaksi lewat media sosial dan grup chat informal memiliki kelemahan mendasar: ketiadaan pihak ketiga yang netral untuk memegang dana, mudahnya manipulasi tangkapan layar e-ticket, dan tingginya kasus <a href="/blog/apa-itu-double-selling-tiket-modus-scam">double selling tiket</a> di mana satu barcode dijual ke banyak pembeli berbeda.</p>

      <h2>3. Pilar Keamanan Secondary Ticketing Modern</h2>
      <p>Infrastruktur kepercayaan di pasar sekunder bertumpu pada empat pilar utama:</p>
      <ul>
        <li><strong>Penahanan Dana Escrow:</strong> Pembayaran ditahan secara aman di rekening penampungan dan hanya dilepas ke penjual setelah tiket divalidasi berhasil. Pelajari selengkapnya di artikel <a href="/blog/kenapa-tikum-menggunakan-escrow-untuk-transaksi-tiket">Kenapa Tikum Menggunakan Escrow</a>.</li>
        <li><strong>Verifikasi Dokumen:</strong> Pengecekan ketat identitas penjual dan dokumen pembelian resmi. Baca selengkapnya di panduan <a href="/blog/bagaimana-cara-memverifikasi-tiket-konser-sebelum-membayar">Cara Memverifikasi Tiket Konser Sebelum Membayar</a>.</li>
        <li><strong>Kehadiran PIC di Venue:</strong> Representasi lapangan yang mendampingi penukaran gelang dan memverifikasi kendala gerbang turnstile. Simak penjelasannya di <a href="/blog/kenapa-tikum-punya-pic-di-venue">Kenapa Tikum Punya PIC di Venue</a>.</li>
        <li><strong>Resolusi Sengketa Berbasis Bukti:</strong> Pengembalian dana penuh jika tiket terbukti tidak dapat digunakan karena kesalahan penjual.</li>
      </ul>

      <h3>Daftar Rujukan Penting Kluster Otoritas</h3>
      <p>Jelajahi panduan mendalam kami seputar keamanan dan ekosistem tiket:</p>
      <ul>
        <li><a href="/blog/10-modus-penipuan-tiket-konser-harus-diwaspadai">10 Modus Penipuan Tiket Konser yang Harus Diwaspadai</a></li>
        <li><a href="/blog/cara-aman-membeli-tiket-konser-dari-secondary-market">Panduan Pembeli: Cara Aman Membeli Tiket Secondary Market</a></li>
        <li><a href="/blog/cara-menjual-tiket-konser-dengan-aman">Panduan Penjual: Cara Menjual Tiket Konser dengan Aman</a></li>
        <li><a href="/blog/escrow-vs-transfer-langsung-mana-yang-lebih-aman">Perbandingan: Escrow vs Transfer Langsung</a></li>
        <li><a href="/blog/checklist-anti-scam-sebelum-membeli-tiket-konser-online">Checklist 10 Poin Anti-Scam Sebelum Membeli Tiket Online</a></li>
        <li><a href="/blog/apa-yang-harus-dilakukan-jika-tiket-bermasalah-saat-hari-konser">Prosedur Darurat: Apa yang Harus Dilakukan Jika Tiket Bermasalah di Venue</a></li>
        <li><a href="/blog/kenapa-harga-tiket-resale-bisa-lebih-mahal">Transparansi: Kenapa Harga Tiket Resale Bisa Berbeda dari Harga Resmi</a></li>
        <li><a href="/blog/viagogo-stubhub-atau-marketplace-lokal-perbandingan">Analisis: Viagogo, StubHub, atau Marketplace Lokal Terverifikasi</a></li>
        <li><a href="/blog/kenapa-tikum-dibangun-mengubah-secondary-ticketing-indonesia">Manifesto Tikum: Mengubah Cara Orang Bertransaksi Secondary Ticketing di Indonesia</a></li>
      </ul>

      <h2>4. Kesimpulan</h2>
      <p>Masa depan industri live event di Indonesia bergantung pada ekosistem yang sehat dan tepercaya. Tikum hadir sebagai katalis transformasi tersebut—menghadirkan trust infrastructure yang melindungi pembeli, menghargai penjual jujur, dan menghormati ketentuan promotor acara.</p>
    `,
    source_references: ['Grand Design Reseller Platform Tikum', 'APMI National Ticketing Standard Framework']
  }
];

module.exports = {
  EDITORIAL_ARTICLES
};
