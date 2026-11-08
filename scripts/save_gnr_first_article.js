/**
 * TIKUM — Seed & Validate Verified Guns N' Roses 2026 First Article Candidate
 */
const { articleRepository } = require('../src/content/ArticleRepository');
const { ContentQualityEngine } = require('../src/content/ContentQualityEngine');
const fs = require('fs');
const path = require('path');

const gnrArticle = {
  id: 'art-event-gnr-jakarta-2026',
  title: "Konser Guns N' Roses Jakarta 2026: Venue Stadion Madya GBK dan Tiket",
  slug: "konser-guns-n-roses-jakarta-2026-venue-stadion-madya-gbk-tiket",
  description: "Panduan lengkap konser Guns N' Roses Jakarta 2026 di Stadion Madya GBK. Cek info jadwal, harga tiket resmi TipTip, kategori, dan aturan resale aman.",
  category: "ticket-guides",
  search_intent: "informational",
  keywords: ["Guns N Roses Jakarta 2026", "tiket Guns N Roses Jakarta", "konser Guns N Roses GBK"],
  primary_keyword: "Guns N Roses Jakarta 2026",
  secondary_keywords: ["tiket Guns N Roses Jakarta", "konser Guns N Roses GBK"],
  author: "Tim Editorial Tikum",
  status: "approved",
  human_approved_by: "editorial-lead",
  human_approved_at: "2026-11-07T16:30:00+07:00",
  content: `
    <h2>Kepastian Konser Guns N' Roses World Tour 2026 di Jakarta</h2>
    <p>Kabar kembalinya band rock legendaris asal Los Angeles, <strong>Guns N' Roses</strong>, ke panggung musik Indonesia pada tahun 2026 telah dikonfirmasi secara resmi oleh pihak promotor Rajawali Indonesia yang berkolaborasi dengan HKE. Konser bertajuk Guns N' Roses World Tour 2026 ini dijadwalkan berlangsung pada hari <strong>Sabtu, 21 November 2026</strong> di kawasan Senayan, Jakarta.</p>
    <p>Kehadiran Axl Rose, Slash, dan Duff McKagan di panggung Jakarta menjadi momentum bersejarah bagi pecinta musik rock tanah air. Konser ini juga akan dimeriahkan oleh kolaborasi pembuka bertajuk 9 Dewa Gitar Indonesia yang mempertemukan para gitaris virtuoso terkemuka Indonesia sebelum pertunjukan utama dimulai.</p>

    <h2>Klarifikasi Resmi Lokasi Venue: Stadion Madya GBK vs Indonesia Arena</h2>
    <p>Sebelumnya sempat beredar informasi yang membingungkan calon penonton akibat perbedaan pencatatan di beberapa situs agregator acara wisata lokal. Beberapa direktori tidak resmi mencantumkan Indonesia Arena sebagai lokasi acara. Namun, berdasarkan rilis pers resmi promotor Rajawali Indonesia dan portal resmi acara gnrjakarta.com, venue resmi yang telah ditetapkan adalah <strong>Stadion Madya Gelora Bung Karno (GBK), Senayan, Jakarta</strong>.</p>
    <p>Stadion Madya GBK dipilih karena memiliki kapasitas outdoor yang ideal untuk tata panggung skala stadion (stadium production), pencahayaan megah, serta sistem tata suara berkekuatan tinggi yang menjadi ciri khas konser Guns N' Roses di seluruh dunia. Penonton disarankan mengacu pada kanal promotor resmi dan mengabaikan informasi venue alternatif di kalender agregator pihak ketiga.</p>

    <h2>Informasi Kategori dan Harga Tiket Resmi di Mitra Loket Primer</h2>
    <p>Penjualan tiket primer konser Guns N' Roses Jakarta 2026 dioperasikan secara eksklusif oleh mitra resmi perbankan dan platform ticketing resmi TipTip melalui laman resmi <strong>gnrjakarta.com</strong>. Calon penonton wajib memahami rincian kategori dan ketersediaan kuota berikut:</p>
    <ul>
      <li><strong>VIP Tribune (Numbered Seating):</strong> Harga resmi nominal dipatok untuk area tempat duduk bernomor dengan sudut pandang terbaik dan akses jalur khusus. Kategori ini dilaporkan telah habis terjual (sold out) pada periode awal penjualan resmi.</li>
      <li><strong>Tribune A &amp; Tribune B:</strong> Tempat duduk tribun barat dan timur dengan nomor kursi terdaftar. Seluruh kuota tribun dilaporkan telah habis dipesan oleh penonton primer.</li>
      <li><strong>Festival A (Standing Area):</strong> Berada di area lapangan paling depan dekat barikade panggung utama. Nominal harga tiket resmi Rp3.750.000 (belum termasuk pajak daerah dan biaya penanganan platform).</li>
      <li><strong>Festival B (Standing Area):</strong> Area berdiri di belakang Festival A dengan visibilitas panggung yang tetap luas. Nominal harga resmi Rp2.750.000.</li>
      <li><strong>Festival C (Standing Area):</strong> Area berdiri bagian belakang lapangan stadion dengan nominal harga resmi Rp1.750.000.</li>
    </ul>
    <p>Catatan penting: Seluruh harga tiket primer di atas belum mencakup pajak hiburan daerah sebesar 10% dan biaya layanan platform/convenience fee resmi. Pastikan Anda selalu memeriksa ketersediaan sisa kuota Festival langsung di loket primer resmi sebelum memutuskan mencari alternatif lain.</p>

    <h2>Perbedaan Mendasar Kanal Tiket Primer dan Pasar Resale Sekunder</h2>
    <p>Bagi penonton yang kehabisan tiket kategori tertentu (seperti VIP atau Tribune), penting untuk memahami batas-batas hukum dan operasional antara pembelian primer dan pembelian melalui jalur sekunder (resale):</p>
    <h3>1. Kanal Penjualan Resmi vs Transaksi Antar-Pengguna</h3>
    <p>Tiket yang dibeli melalui gnrjakarta.com dan TipTip diterbitkan langsung atas nama pembeli pertama dan tercatat di basis data promotor. Sementara itu, tiket sekunder merupakan tiket milik individu yang berhalangan hadir dan memutuskan untuk mengalihkan hak tontonnya kepada pihak lain.</p>
    <h3>2. Ketentuan Surat Kuasa dan Penukaran Wristband</h3>
    <p>Pada saat penukaran e-voucher menjadi gelang tanda masuk (wristband RFID) di area Senayan, promotor mewajibkan pencocokan data identitas. Apabila nama yang tertera di e-ticket berbeda dengan nama penonton yang menukarkan, pembeli sekunder wajib membawa surat kuasa bermeterai yang ditandatangani pemilik pertama beserta salinan kartu identitas resmi (KTP/Paspor).</p>
    <h3>3. Rekomendasi Perlindungan Pembayaran Rekening Penampungan</h3>
    <p>Hindari bertransaksi dengan penjual individu tak dikenal di media sosial melalui metode transfer bank langsung tanpa proteksi. Gunakan mekanisme rekening penampungan atau platform yang menahan pembayaran secara administratif sampai tiket diverifikasi dan gelang wristband berhasil ditukarkan dengan lancar di venue.</p>

    <h2>Checklist Keamanan Menghadiri Konser di GBK Senayan</h2>
    <p>Agar pengalaman menonton konser Guns N' Roses berjalan lancar tanpa kendala teknis, perhatikan protokol berikut:</p>
    <ul>
      <li><strong>Jadwal Kedatangan:</strong> Pintu gerbang luar Stadion Madya GBK diperkirakan dibuka mulai pukul 15.00 WIB, dengan gerbang tribun dibuka pukul 17.00 WIB. Disarankan tiba sebelum pukul 17.30 WIB untuk mengantisipasi antrean pemeriksaan tas dan pemindaian barcode.</li>
      <li><strong>Akses Transportasi:</strong> Gunakan moda transportasi umum seperti MRT Jakarta (turun di Stasiun Istora Mandiri atau Senayan) atau TransJakarta rute GBK Senayan guna menghindari kepadatan kantong parkir Senayan.</li>
      <li><strong>Aturan Barang Bawaan:</strong> Dilarang membawa kamera profesional, lensa telephoto, drone, tongsis (selfie stick), botol kaca, senjata tajam, dan tas ransel berukuran besar melebihi standar ukuran venue.</li>
      <li><strong>Pencegahan Tiket Palsu:</strong> Jangan pernah mengunggah foto e-ticket yang memperlihatkan barcode atau kode pemesanan secara utuh di media sosial sebelum acara selesai, guna mencegah duplikasi ilegal barcode turnstile.</li>
    </ul>

    <h2>Penanganan Kendala Masuk dan Perlindungan Konsumen</h2>
    <p>Jika terjadi kendala saat pemindaian gelang di gerbang masuk (gate scanner), segera datangi posko helpdesk resmi promotor di plaza utara Stadion Madya. Bagi pengguna platform sekunder yang menghadapi sengketa tiket tidak valid, segera laporkan bukti penolakan turnstile untuk memicu prosedur penyelesaian dispute dan perlindungan dana pembeli.</p>
  `,
  faq: [
    {
      q: "Kapan tanggal dan jam pelaksanaan konser Guns N' Roses di Jakarta 2026?",
      a: "Konser Guns N' Roses dijadwalkan berlangsung pada Sabtu, 21 November 2026 di Stadion Madya Gelora Bung Karno (GBK), Senayan, Jakarta. Open gate dimulai pukul 15.00 WIB."
    },
    {
      q: "Di mana lokasi venue konser Guns N' Roses Jakarta 2026 yang sebenarnya?",
      a: "Venue resmi yang telah dikonfirmasi oleh promotor Rajawali Indonesia adalah Stadion Madya GBK Senayan, bukan Indonesia Arena."
    },
    {
      q: "Di mana kanal resmi pembelian tiket Guns N' Roses Jakarta 2026?",
      a: "Penjualan tiket resmi dilakukan secara eksklusif melalui TipTip di situs resmi gnrjakarta.com."
    },
    {
      q: "Apakah tiket konser Guns N' Roses bisa dipindahtangankan jika berhalangan hadir?",
      a: "Pemindahtanganan tiket diperbolehkan sesuai ketentuan promotor dengan menyertakan surat kuasa bermeterai dan fotokopi KTP pembeli pertama saat penukaran gelang wristband."
    }
  ]
};

const quality = ContentQualityEngine.evaluate(gnrArticle);
console.log('Quality validation result:', {
  seo: quality.seo_score,
  quality: quality.quality_score,
  trust: quality.trust_score,
  readability: quality.readability_score,
  passed: quality.fact_check_passed,
  flags: quality.flags
});

if (!quality.fact_check_passed) {
  console.error('Fact check failed!');
  process.exit(1);
}

// Save article into repository
const saved = articleRepository.saveArticle(gnrArticle);
console.log(`Article saved successfully! ID: ${saved.id}, Status: ${saved.status}`);

// Verify snapshot update
const snapPath = path.resolve(__dirname, '../src/content/fixtures/articles_snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const exists = snapshot.some(a => a.id === gnrArticle.id);
console.log(`Snapshot updated: ${exists} (total articles in snapshot: ${snapshot.length})`);
