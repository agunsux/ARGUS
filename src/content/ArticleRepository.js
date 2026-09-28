/**
 * TIKUM Article Repository
 * In-memory repository with atomic state transitions, seeding, and audit tracking.
 */

const { ContentModel, CONTENT_PILLARS, CONTENT_STATUS, SEARCH_INTENTS } = require('./ContentModel');
const { ContentQualityEngine } = require('./ContentQualityEngine');
const { InternalLinkingService } = require('../seo/InternalLinkingService');

class ArticleRepository {
  constructor() {
    this.articles = new Map(); // id -> article
    this.slugMap = new Map(); // slug -> id
    this.seedFoundingArticles();
  }

  /**
   * Seeds foundational, high-authority articles across the 5 pillars.
   */
  seedFoundingArticles() {
    const seeds = [
      {
        id: 'art-safety-1',
        title: 'Cara Menghindari Penipuan Tiket Konser di Media Sosial',
        slug: 'cara-menghindari-penipuan-tiket-konser-di-media-sosial',
        description: 'Pelajari modus penipuan tiket konser di Twitter/X dan Instagram, ciri-ciri barcode palsu, dan cara transaksi aman dengan rekening escrow Tikum.',
        category: CONTENT_PILLARS.SAFETY,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['penipuan tiket konser', 'cara aman beli tiket', 'rekening escrow'],
        status: CONTENT_STATUS.APPROVED, // Ready for scheduling
        content: `
          <h2>Fenomena Maraknya Penipuan Tiket Konser di Medsos</h2>
          <p>Setiap kali konser musisi besar diumumkan di Indonesia, media sosial langsung dibanjiri postingan "WTS tiket konser". Sayangnya, ribuan calon penonton menjadi korban penipuan transfer langsung (direct transfer) dengan kerugian mencapai miliaran rupiah.</p>
          
          <h2>3 Red Flags Utama Calo &amp; Penipu Online</h2>
          <p>Berikut adalah tanda-tanda bahaya saat berinteraksi dengan penjual tiket individu di media sosial:</p>
          <ul>
            <li><strong>Memaksa Transfer Langsung:</strong> Penjual menolak menggunakan perantara pihak ketiga atau rekening penampungan escrow dengan alasan sedang butuh uang mendesak.</li>
            <li><strong>Foto Bukti Pembelian Hasil Editan:</strong> Tangkapan layar email atau invoice yang memiliki font tidak konsisten atau resolusi kabur pada bagian nomor booking.</li>
            <li><strong>Harga di Bawah Harga Resmi:</strong> Menawarkan kategori tiket populer dengan harga diskon yang tidak masuk akal saat tiket resmi berstatus sold out.</li>
          </ul>

          <h2>Bagaimana Tikum Melindungi Pembeli</h2>
          <p>Melalui sistem <strong>perlindungan pembeli Tikum</strong>, dana Anda disimpan secara netral di <strong>rekening penampungan escrow</strong> sampai Anda berhasil melewati scanning turnstile di pintu gerbang venue. Jangan pernah mengambil risiko transfer pribadi tanpa jaminan pengembalian dana.</p>

          <h3>Langkah Verifikasi Fisik di Lokasi Venue</h3>
          <p>Jika konser mensyaratkan penukaran gelang wristband fisik, pastikan penjual menyertakan surat kuasa bermeterai dan verifikasi identitas resmi.</p>
        `,
        author: 'Tim Riset Keamanan Tikum',
        source_references: ['Laporan Satgas Waspada Investasi & Cyber Crime Polri']
      },
      {
        id: 'art-resale-1',
        title: 'Apa Itu Ticket Resale dan Bagaimana Sistem Escrow Bekerja?',
        slug: 'apa-itu-ticket-resale-dan-bagaimana-escrow-bekerja',
        description: 'Pahami konsep pasar tiket sekunder (resale) yang legal dan transparan di Indonesia, serta peran rekening penampungan escrow dalam melindungi penggemar.',
        category: CONTENT_PILLARS.RESALE_EDUCATION,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['apa itu ticket resale', 'sistem escrow tiket', 'rekening penampungan'],
        status: CONTENT_STATUS.APPROVED,
        content: `
          <h2>Membedakan Resale Terverifikasi dari Praktik Calo Ilegal</h2>
          <p>Pasar tiket sekunder (secondary ticket marketplace) adalah tempat bertemunya pemilik tiket yang berhalangan hadir dengan penggemar yang belum mendapatkan tiket. Di negara maju, pasar resale beroperasi secara transparan dengan standar perlindungan konsumen yang ketat.</p>

          <h2>Prinsip Kerja Rekening Penampungan Escrow</h2>
          <p>Sistem escrow adalah fondasi utama kepercayaan di Tikum:</p>
          <ol>
            <li>Pembeli mentransfer pembayaran ke rekening penampungan netral Tikum.</li>
            <li>Penjual menerima konfirmasi bahwa dana sudah aman tersimpan, lalu menyerahkan tiket resmi.</li>
            <li>Pembeli menggunakan tiket di turnstile resmi venue.</li>
            <li>Setelah verifikasi berhasil atau batas waktu terlewati tanpa dispute, dana dicairkan ke penjual.</li>
          </ol>

          <h2>Penyelesaian Sengketa Berbasis Bukti</h2>
          <p>Jika tiket bermasalah, pembeli cukup menyertakan slip penolakan turnstile untuk memicu <strong>prosedur resolusi sengketa</strong> dan menerima refund 100%.</p>
        `,
        author: 'Tim Edukasi Tikum',
        source_references: ['Standard Trust & Safety Guidelines Tikum']
      },
      {
        id: 'art-buying-1',
        title: 'Panduan Memilih Kategori Tiket Konser: Festival vs Seating',
        slug: 'panduan-memilih-kategori-tiket-konser-festival-vs-seating',
        description: 'Tips menentukan kategori tiket konser terbaik: kelebihan tiket standing festival vs nomor kursi seating di stadion besar seperti GBK dan JIS.',
        category: CONTENT_PILLARS.TICKET_BUYING,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: ['kategori tiket konser', 'standing vs seating konser', 'tips nonton konser'],
        status: CONTENT_STATUS.DRAFT,
        content: `
          <h2>Memilih Pengalaman Nonton Konser yang Tepat</h2>
          <p>Setiap kategori tiket menawarkan kenyamanan dan sudut pandang yang berbeda. Menentukan pilihan sejak awal akan menghindarkan Anda dari penyesalan di hari acara.</p>

          <h2>Kategori Festival (Standing Area)</h2>
          <p>Cocok untuk Anda yang menginginkan euforia maksimal, dekat dengan panggung utama, dan siap mengantre lebih awal untuk mendapatkan spot barikade depan.</p>

          <h2>Kategori Seating (Numbered Seat)</h2>
          <p>Pilihan ideal jika Anda mengutamakan kenyamanan, tidak ingin lelah berdiri selama berjam-jam, dan datang bersama keluarga atau teman.</p>
        `,
        author: 'Tim Editorial Tikum'
      },

      // ===================================================================
      // EPIC BLOG — ARTIKEL 1
      // Jual Beli Tiket Konser Secondary yang Aman
      // Publication Date: 2026-09-01
      // ===================================================================
      {
        id: 'art-secondary-safe-1',
        title: 'Jual Beli Tiket Konser dan Event Secondary Makin Lumrah — Tapi Bagaimana Memastikan Transaksinya Aman?',
        slug: 'jual-beli-tiket-konser-secondary-yang-aman',
        description: 'Jual beli tiket konser secondary kini semakin umum di Indonesia. Pelajari risiko transaksi langsung, apa itu secondary ticketing, dan bagaimana mekanisme escrow, verifikasi, serta PIC Tikum membangun transaksi yang lebih aman.',
        category: CONTENT_PILLARS.RESALE_EDUCATION,
        search_intent: SEARCH_INTENTS.COMMERCIAL,
        keywords: [
          'jual beli tiket konser',
          'jual tiket konser',
          'beli tiket konser',
          'tiket konser secondary',
          'secondary ticketing Indonesia',
          'tiket event terpercaya',
          'tiket konser aman',
          'marketplace tiket konser',
          'jual tiket event',
          'beli tiket event',
          'tiket konser second',
          'cara aman beli tiket konser',
          'escrow tiket',
          'tiket konser terpercaya'
        ],
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-09-01T09:00:00+07:00',
        updated_at: '2026-09-01T09:00:00+07:00',
        created_at: '2026-08-25T10:00:00+07:00',
        canonical_url: 'https://tikum.app/blog/jual-beli-tiket-konser-secondary-yang-aman',
        author: 'Tim Editorial Tikum',
        human_approved_by: 'admin-1',
        human_approved_at: '2026-08-28T14:00:00+07:00',
        faq: [
          {
            q: 'Apa itu secondary ticketing?',
            a: 'Secondary ticketing adalah transaksi tiket ketika tiket berpindah dari pemilik awal kepada pembeli lain, biasanya karena perubahan rencana atau karena tiket primary sudah tidak tersedia.'
          },
          {
            q: 'Apakah membeli tiket dari calo aman?',
            a: 'Tidak selalu. Transaksi langsung dengan penjual yang tidak terverifikasi dapat memiliki risiko tiket palsu, tiket sudah digunakan, atau penjual menghilang setelah pembayaran.'
          },
          {
            q: 'Apa fungsi escrow dalam transaksi tiket?',
            a: 'Escrow dirancang untuk membantu melindungi proses pembayaran dengan menahan dana sesuai kondisi transaksi sebelum penyelesaian. Dana pembeli ditahan secara netral hingga kondisi transaksi terpenuhi.'
          },
          {
            q: 'Apakah Tikum menjamin tidak ada scam?',
            a: 'Tidak ada platform yang dapat secara jujur menjanjikan risiko fraud nol. Tikum dirancang untuk meminimalisasi risiko melalui mekanisme seperti verifikasi, perlindungan transaksi, pencatatan bukti, dan dukungan operasional.'
          }
        ],
        content: `
<p>Tiket konser sold out dalam hitungan menit. Rencana berubah di menit-menit terakhir. Seseorang memiliki tiket yang tidak bisa digunakan, sementara ribuan orang lain masih ingin hadir. Inilah realita yang membuat pasar tiket secondary — atau yang sering disebut <em>secondary ticketing</em> — tumbuh secara organik di Indonesia.</p>

<p>Pertanyaannya bukan lagi <em>apakah</em> transaksi tiket secondary terjadi. Pertanyaannya adalah: <strong>bagaimana memastikan transaksi itu aman?</strong></p>

<h2>Kenapa Jual Beli Tiket Secondary Semakin Lumrah?</h2>

<p>Ada beberapa situasi nyata yang mendorong pertumbuhan secondary ticketing:</p>
<ul>
  <li>Tiket konser artis besar habis dalam beberapa menit saat pre-sale, meninggalkan ribuan penggemar yang tertinggal.</li>
  <li>Seseorang yang sudah membeli tiket mengalami perubahan rencana — sakit, perjalanan bisnis mendadak, atau keperluan keluarga.</li>
  <li>Kelompok yang ingin pindah dari satu kategori tiket ke kategori lain karena alasan logistik.</li>
  <li>Penggemar yang menginginkan tiket lebih dekat ke tanggal acara karena jadwal yang baru dipastikan.</li>
</ul>

<p>Ini adalah kebutuhan nyata dari penonton nyata. <strong>Secondary ticketing bukan masalah — transaksi yang tidak aman adalah masalahnya.</strong></p>

<h2>Masalah Terbesar Bukan Tiketnya, Tapi Kepercayaan</h2>

<p>Ketika dua orang asing bertransaksi tiket tanpa mekanisme perlindungan, salah satu pihak harus bertindak lebih dulu berdasarkan kepercayaan buta. Pembeli harus mentransfer uang sebelum mendapatkan tiket. Penjual harus menyerahkan tiket sebelum uang cair.</p>

<p>Di lingkungan seperti ini, kepercayaan adalah satu-satunya jaminan — dan itu bukan jaminan yang cukup.</p>

<h2>Apa Risiko Membeli Tiket dari Calo atau Penjual Random?</h2>

<p>Risiko transaksi langsung tanpa perlindungan jauh lebih besar dari yang sering disadari:</p>

<h3>Tiket Palsu</h3>
<p>Barcode atau QR code yang dibuat ulang dengan alat editing sederhana. Tampak meyakinkan di layar, namun ditolak oleh scanner venue.</p>

<h3>Tiket Sudah Dipakai</h3>
<p>QR code valid, tetapi sudah di-scan oleh orang lain sebelumnya. Sistem venue hanya mengizinkan satu entri per kode.</p>

<h3>QR Code Tidak Valid</h3>
<p>Tiket mungkin asli, namun karena transfer kepemilikan dilakukan di luar sistem resmi promotor, QR code menjadi tidak dapat divalidasi di pintu masuk.</p>

<h3>Penjual Menghilang Setelah Pembayaran</h3>
<p>Skenario paling umum: pembeli mentransfer, penjual tidak bisa dihubungi. Tidak ada jejak transaksi yang dapat dijadikan bukti untuk pelaporan.</p>

<h3>Tidak Ada Mekanisme Sengketa</h3>
<p>Bahkan jika pembeli memiliki bukti transfer, tidak ada platform resmi yang dapat memproses klaim atau mengembalikan dana jika transaksi dilakukan di luar sistem yang dilindungi.</p>

<h2>Apa Bedanya Secondary Ticketing dengan Transaksi Langsung?</h2>

<p>Perbedaan mendasar bukan pada jenis tiketnya, melainkan pada <strong>mekanisme perlindungan yang membungkus transaksi</strong>:</p>

<table style="width:100%; border-collapse:collapse; margin:20px 0;">
  <thead>
    <tr style="background:#1e293b;">
      <th style="padding:10px 14px; text-align:left; color:#f8fafc; border-bottom:1px solid #334155;">Aspek</th>
      <th style="padding:10px 14px; text-align:left; color:#38bdf8; border-bottom:1px solid #334155;">Transaksi Langsung</th>
      <th style="padding:10px 14px; text-align:left; color:#4ade80; border-bottom:1px solid #334155;">Secondary Ticketing Terstruktur</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#cbd5e1;">Verifikasi penjual</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#94a3b8;">Tidak ada</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Ada</td>
    </tr>
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#cbd5e1;">Perlindungan pembayaran</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#94a3b8;">Tidak ada</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Escrow</td>
    </tr>
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#cbd5e1;">Jejak transaksi</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#94a3b8;">Tidak ada</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Tercatat</td>
    </tr>
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#cbd5e1;">Mekanisme sengketa</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#94a3b8;">Tidak ada</td>
      <td style="padding:10px 14px; border-bottom:1px solid #1e293b; color:#4ade80;">Ada</td>
    </tr>
  </tbody>
</table>

<h2>Bagaimana Tikum Membangun Transaksi yang Lebih Aman?</h2>

<p>Tikum memposisikan diri sebagai platform secondary ticketing yang membangun transaksi berbasis kepercayaan, dengan mekanisme perlindungan transaksi dan dukungan operasional untuk event yang didukung.</p>

<h3>Escrow</h3>
<p>Pembayaran dari pembeli tidak langsung masuk ke tangan penjual. Dana ditahan di rekening penampungan sesuai kondisi transaksi. Penjual mendapatkan dana setelah proses transaksi selesai sesuai ketentuan yang berlaku. Ini menghilangkan situasi di mana salah satu pihak harus "percaya dulu" tanpa perlindungan.</p>

<h3>Verifikasi</h3>
<p>Sistem dirancang untuk memverifikasi identitas penjual dan klaim kepemilikan tiket — bukan sekadar menerima upload screenshot yang mudah dipalsukan.</p>

<h3>Audit Trail</h3>
<p>Setiap langkah transaksi penting dicatat. Ini bukan hanya untuk keamanan pembeli dan penjual, tetapi juga untuk memberikan dasar bukti yang jelas jika terjadi sengketa yang memerlukan penyelesaian.</p>

<h3>PIC Event / Venue Support</h3>
<p>Untuk event-event yang didukung, Tikum menyediakan atau berencana menyediakan kehadiran PIC (Person in Charge) di sekitar area venue. PIC ini dapat membantu pembeli yang mengalami masalah di gerbang atau membutuhkan bantuan terkait transaksi tiket pada hari acara.</p>

<h2>Kenapa Kehadiran PIC Penting?</h2>

<p>Banyak masalah tiket terjadi justru di hari acara — ketika pembeli sudah berada di venue, antrean panjang, dan waktu sangat terbatas. Memiliki titik bantuan fisik di sekitar area event memberikan jalur eskalasi nyata yang tidak tersedia di transaksi langsung antara dua orang asing.</p>

<p>Ini adalah bagian dari filosofi Tikum yang lebih besar: <em>setiap pembeli yang sah harus memiliki jalur menuju entri event yang berhasil.</em></p>

<h2>Checklist Sebelum Membeli Tiket Secondary</h2>

<ul style="list-style:none; padding:0;">
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Periksa identitas penjual — apakah terverifikasi di platform?</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Pastikan transaksi dilindungi oleh mekanisme escrow atau perlindungan pembayaran</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Hindari transfer langsung ke rekening pribadi penjual yang tidak dikenal</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Simpan semua bukti transaksi dan komunikasi</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Pahami kategori dan nomor kursi tiket yang dibeli</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Ketahui ke mana harus menghubungi jika ada masalah di hari acara</li>
  <li style="padding:8px 0; border-bottom:1px solid #1e293b;">&#9745; Verifikasi status transaksi sebelum berangkat ke venue</li>
</ul>

<h2>Kesimpulan</h2>

<p>Secondary ticketing adalah respons alami terhadap kebutuhan nyata penonton. Yang membedakan transaksi aman dari transaksi berisiko bukan jenis tiketnya — melainkan infrastruktur kepercayaan yang membungkus proses transaksi tersebut.</p>

<p>Tikum hadir bukan untuk mengganti atau bersaing dengan sistem tiket primer, melainkan untuk memastikan bahwa ketika tiket berpindah tangan di pasar sekunder, proses itu terjadi dengan perlindungan yang memadai bagi kedua pihak.</p>

<p>Langkah selanjutnya: kenali juga tanda-tanda penipuan tiket yang makin marak. Baca panduan kami tentang <a href="/blog/cara-menghindari-scam-tiket-konser" title="Cara Menghindari Scam Tiket Konser">cara mengenali red flags penipuan tiket konser dan checklist keamanan pembeli</a>.</p>
        `,
        source_references: ['APMI Indonesia', 'Kemendag RI — Panduan Transaksi Digital']
      },

      // ===================================================================
      // EPIC BLOG — ARTIKEL 2
      // Cara Menghindari Scam Tiket Konser
      // Publication Date: 2026-09-08
      // ===================================================================
      {
        id: 'art-scam-awareness-1',
        title: 'Scam Tiket Konser Makin Marak: Cara Mengenali Penipuan dan Membeli Tiket dengan Lebih Aman',
        slug: 'cara-menghindari-scam-tiket-konser',
        description: 'Scam tiket konser semakin marak di Indonesia. Kenali 10 red flag penipuan tiket, pelajari cara menghindari calo palsu, dan pahami bagaimana Tikum meminimalisasi risiko scam melalui escrow, verifikasi, dan dukungan PIC event.',
        category: CONTENT_PILLARS.SAFETY,
        search_intent: SEARCH_INTENTS.INFORMATIONAL,
        keywords: [
          'scam tiket konser',
          'penipuan tiket konser',
          'cara menghindari scam tiket',
          'tiket konser aman',
          'calo tiket',
          'tiket event palsu',
          'penipuan tiket event',
          'beli tiket konser aman',
          'ciri ciri penipuan tiket konser',
          'cara cek tiket konser',
          'tiket konser terpercaya',
          'jangan tertipu tiket konser',
          'secondary ticketing aman'
        ],
        status: CONTENT_STATUS.PUBLISHED,
        published_at: '2026-09-08T09:00:00+07:00',
        updated_at: '2026-09-08T09:00:00+07:00',
        created_at: '2026-09-01T10:00:00+07:00',
        canonical_url: 'https://tikum.app/blog/cara-menghindari-scam-tiket-konser',
        author: 'Tim Riset Keamanan Tikum',
        human_approved_by: 'admin-1',
        human_approved_at: '2026-09-05T14:00:00+07:00',
        faq: [
          {
            q: 'Apa saja tanda-tanda penipuan tiket konser?',
            a: 'Tanda-tanda utama meliputi: penjual memaksa transfer langsung, menolak mekanisme escrow, memberikan hanya screenshot sebagai bukti, menggunakan tekanan waktu, dan harga yang tidak masuk akal murah.'
          },
          {
            q: 'Apakah screenshot tiket konser bisa dipercaya?',
            a: 'Tidak. Screenshot sangat mudah dipalsukan menggunakan alat edit sederhana. Selalu minta verifikasi tiket melalui platform resmi atau mekanisme yang dapat diverifikasi, bukan hanya screenshot.'
          },
          {
            q: 'Apa yang harus dilakukan jika sudah tertipu beli tiket konser?',
            a: 'Kumpulkan semua bukti komunikasi dan transaksi, laporkan ke platform tempat transaksi terjadi, dan jika ada indikasi penipuan, laporkan ke Polri melalui patrolisiber.id.'
          },
          {
            q: 'Kenapa transfer langsung ke penjual tiket berbahaya?',
            a: 'Transfer langsung tidak memiliki mekanisme perlindungan. Jika penjual tidak mengirim tiket atau tiket palsu, tidak ada pihak ketiga yang dapat memediasi atau mengembalikan dana. Dana yang sudah ditransfer umumnya tidak dapat dipulihkan.'
          }
        ],
        content: `
<p>Setiap musim konser besar di Indonesia, laporan korban penipuan tiket meningkat. Polanya berulang: seseorang menemukan penawaran tiket di media sosial, mentransfer sejumlah uang, dan penjual tidak dapat dihubungi lagi. Tiket tidak pernah diterima.</p>

<p>Pasar tiket secondary sendiri bukan masalah. Yang menjadi masalah adalah lingkungan transaksi yang tidak memiliki cukup perlindungan — sehingga mudah dieksploitasi oleh penipu. Artikel ini dirancang untuk membantu Anda mengenali tanda-tanda bahaya sebelum menjadi korban berikutnya.</p>

<h2>Kenapa Scam Tiket Konser Bisa Terjadi?</h2>

<p>Ada beberapa faktor yang membuat pasar tiket sekunder rentan terhadap penipuan:</p>
<ul>
  <li><strong>Permintaan tinggi, penawaran terbatas:</strong> Tiket konser artis besar sering habis dalam menit. Pembeli yang tertinggal berada dalam posisi terdesak dan lebih mudah tergesa-gesa dalam mengambil keputusan.</li>
  <li><strong>Transaksi antar orang asing:</strong> Tanpa mekanisme verifikasi identitas, pembeli tidak tahu siapa sebenarnya yang mereka ajak bertransaksi.</li>
  <li><strong>Kemudahan memalsukan bukti:</strong> Screenshot e-tiket, invoice, dan bukti pembelian sangat mudah dibuat ulang dengan alat sederhana yang tersedia gratis.</li>
  <li><strong>Tekanan waktu:</strong> Penipu sengaja menciptakan urgensi semu untuk mencegah pembeli berpikir jernih atau melakukan verifikasi.</li>
</ul>

<h2>10 Red Flags Penipuan Tiket Konser</h2>

<p>Kenali tanda-tanda bahaya ini sebelum mentransfer sepeser pun:</p>

<div style="margin:24px 0;">
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #1</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual ngotot minta transfer langsung ke rekening pribadi dan menolak menggunakan platform atau perantara yang memiliki mekanisme perlindungan.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #2</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual menolak verifikasi identitas atau tidak bersedia menunjukkan bukti kepemilikan tiket yang dapat diverifikasi.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #3</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual menolak segala bentuk mekanisme perlindungan transaksi — escrow, rekening bersama, atau platform resmi.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #4</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual menggunakan tekanan waktu: "Transfer sekarang atau saya kasih ke orang lain dalam 10 menit." Urgensi buatan adalah alat penipu klasik.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #5</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual hanya memberikan screenshot sebagai satu-satunya bukti kepemilikan tiket. Screenshot sangat mudah dipalsukan.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #6</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual tidak bersedia memberikan bukti yang dapat diverifikasi secara independen — misalnya nomor booking yang bisa dicek di sistem resmi penyelenggara.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #7</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Harga yang ditawarkan jauh di bawah harga pasar untuk kategori tiket yang sama. Jika terlalu bagus untuk menjadi kenyataan, kemungkinan besar memang bukan kenyataan.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #8</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Akun penjual baru dibuat, tidak memiliki riwayat transaksi yang dapat diverifikasi, atau memiliki pola perilaku mencurigakan.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #9</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual meminta Anda transfer ke rekening yang berbeda dari yang disebutkan sebelumnya, atau mengganti rekening di menit-menit terakhir.</p>
  </div>
  <div style="background:#1a0a0a; border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px; margin-bottom:12px;">
    <strong style="color:#ef4444;">RED FLAG #10</strong>
    <p style="color:#cbd5e1; margin:6px 0 0;">Penjual meminta Anda melanjutkan transaksi di luar platform yang memiliki mekanisme sengketa — misalnya minta pindah ke chat pribadi setelah kontak awal di marketplace.</p>
  </div>
</div>

<h2>Jangan Mudah Percaya Screenshot</h2>

<p>Ini perlu digarisbawahi secara khusus karena sangat umum terjadi: <strong>screenshot e-tiket bukan bukti kepemilikan yang valid.</strong></p>

<p>Dengan alat edit foto yang tersedia gratis di internet, seseorang bisa membuat screenshot e-tiket yang tampak sangat meyakinkan dalam waktu kurang dari 10 menit. Nama, kategori kursi, barcode, dan detail event — semuanya bisa dimodifikasi.</p>

<p>Screenshot hanya boleh dijadikan sebagai penunjang awal, bukan satu-satunya dasar keputusan transfer.</p>

<h2>Kenapa Transfer Langsung ke Orang Random Berisiko?</h2>

<p>Transfer bank adalah transaksi satu arah yang hampir tidak bisa dibatalkan setelah dikonfirmasi. Ketika Anda mentransfer ke rekening pribadi seseorang yang tidak Anda kenal:</p>
<ul>
  <li>Tidak ada pihak ketiga yang dapat menahan dana jika terjadi masalah</li>
  <li>Tidak ada mekanisme klaim yang dapat Anda gunakan</li>
  <li>Proses pelaporan ke bank membutuhkan waktu dan tidak menjamin pemulihan dana</li>
  <li>Penipu berpengalaman menggunakan rekening yang berbeda setiap kali untuk menghindari pelacakan</li>
</ul>

<p>Ini adalah alasan mengapa mekanisme seperti escrow ada — bukan untuk mempersulit transaksi, tetapi untuk melindungi kedua belah pihak.</p>

<h2>Checklist Aman Sebelum Membeli Tiket</h2>

<ul style="list-style:none; padding:0;">
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Periksa detail event — nama, tanggal, venue, dan kategori tiket sesuai yang dijual</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Periksa identitas penjual — apakah terverifikasi dan memiliki riwayat transaksi</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Pastikan transaksi dilindungi mekanisme escrow atau platform dengan perlindungan pembayaran</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Hindari transfer langsung ke rekening pribadi penjual yang tidak Anda kenal</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Simpan semua bukti komunikasi — tangkapan layar chat, konfirmasi transaksi, detail penjual</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Jangan terburu-buru karena tekanan waktu — penipu sengaja menciptakan urgensi palsu</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Verifikasi status transaksi sebelum berangkat ke venue pada hari acara</li>
  <li style="padding:10px 0; border-bottom:1px solid #1e293b;">&#9989; Ketahui ke mana harus menghubungi jika ada masalah di hari acara</li>
</ul>

<h2>Bagaimana Tikum Meminimalisasi Risiko Scam?</h2>

<p>Tidak ada platform yang dapat secara jujur menjanjikan nol risiko fraud. Yang dapat dan harus dilakukan adalah membangun sistem yang secara sistematis <em>meminimalisasi</em> risiko tersebut.</p>

<h3>Escrow</h3>
<p>Dana pembeli tidak langsung mengalir ke penjual. Dana ditahan di rekening penampungan sesuai kondisi transaksi. Penjual tidak bisa kabur dengan uang tanpa memenuhi kewajibannya — dan pembeli tidak perlu mentransfer ke rekening asing tanpa jaminan.</p>

<h3>Verifikasi</h3>
<p>Sistem dirancang untuk memverifikasi identitas penjual dan klaim kepemilikan tiket. Ini berbeda fundamental dari transaksi di media sosial di mana siapa pun bisa mengklaim apa pun tanpa verifikasi.</p>

<h3>Audit Trail</h3>
<p>Setiap langkah penting dalam transaksi dicatat. Jika terjadi sengketa, ada jejak yang dapat dijadikan dasar penyelesaian — bukan hanya kata-kata satu pihak melawan pihak lain.</p>

<h3>PIC Event</h3>
<p>Untuk event yang didukung, Tikum menyediakan atau berencana menyediakan kehadiran PIC di sekitar area venue. Bukan sekadar customer service online, tetapi titik bantuan fisik yang dapat dihubungi ketika masalah terjadi di hari acara.</p>

<h3>Dispute Support</h3>
<p>Jika terjadi masalah, ada prosedur penanganan sengketa yang berbasis bukti. Bukan keputusan subyektif, melainkan proses yang mempertimbangkan bukti transaksi yang telah tercatat.</p>

<h2>Jika Ada Masalah dengan Transaksi Tiket, Apa yang Harus Dilakukan?</h2>

<ol>
  <li><strong>Kumpulkan semua bukti:</strong> Screenshot komunikasi, konfirmasi transaksi, bukti transfer, dan detail penjual.</li>
  <li><strong>Hubungi platform tempat transaksi terjadi</strong> melalui jalur resmi yang tersedia dan jelaskan situasinya secara detail.</li>
  <li><strong>Jangan hapus komunikasi</strong> dengan penjual — bahkan yang tampaknya tidak relevan bisa menjadi bukti penting.</li>
  <li><strong>Jika ada indikasi penipuan pidana</strong>, laporkan ke Polri melalui patrolisiber.id dengan menyertakan semua bukti yang dikumpulkan.</li>
</ol>

<h2>Kesimpulan</h2>

<p>Scam tiket konser bukan fenomena baru, tetapi skalanya terus tumbuh seiring dengan popularitas event live di Indonesia. Senjata terbaik melawan penipuan adalah informasi: kenali polanya, waspadai red flags-nya, dan gunakan mekanisme transaksi yang memberikan perlindungan nyata.</p>

<p>Secondary ticketing yang aman bukan hanya tentang menemukan tiket yang tepat — tetapi tentang memastikan proses transaksinya terlindungi dari awal hingga akhir.</p>

<p>Untuk memahami lebih dalam mengapa secondary ticketing membutuhkan mekanisme perlindungan transaksi, baca panduan kami tentang <a href="/blog/jual-beli-tiket-konser-secondary-yang-aman" title="Jual Beli Tiket Konser Secondary yang Aman">jual beli tiket secondary yang aman dan apa yang membedakannya dari transaksi langsung</a>.</p>
        `,
        source_references: ['Polri Siber — Laporan Kejahatan Digital', 'APMI Indonesia — Panduan Keamanan Event']
      }
    ];

    for (const s of seeds) {
      this.saveArticle(s);
    }
  }

  saveArticle(articleData) {
    const article = ContentModel.create(articleData);
    const validation = ContentModel.validate(article);
    if (!validation.isValid) {
      throw new Error(`Article validation failed: ${validation.errors.join(', ')}`);
    }

    // Auto-calculate scores
    const qualityReport = ContentQualityEngine.evaluate(article);
    article.seo_score = qualityReport.seo_score;
    article.quality_score = qualityReport.quality_score;
    article.trust_score = qualityReport.trust_score;
    article.readability_score = qualityReport.readability_score;

    // Inject links
    const recLinks = InternalLinkingService.getRecommendedLinks(article);
    article.internal_links = recLinks;

    this.articles.set(article.id, article);
    this.slugMap.set(article.slug, article.id);
    return article;
  }

  getArticleById(id) {
    return this.articles.get(id) || null;
  }

  getArticleBySlug(slug) {
    const id = this.slugMap.get(slug);
    return id ? this.articles.get(id) : null;
  }

  getAllArticles(filters = {}) {
    let list = Array.from(this.articles.values());

    if (filters.status) {
      list = list.filter(a => a.status === filters.status);
    }
    if (filters.category) {
      list = list.filter(a => a.category === filters.category);
    }

    list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return list;
  }

  getPublishedArticles() {
    return this.getAllArticles({ status: CONTENT_STATUS.PUBLISHED });
  }

  // --- State Transitions ---

  submitForReview(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    article.status = CONTENT_STATUS.REVIEW;
    article.updated_at = new Date().toISOString();
    return article;
  }

  /**
   * Human Approval Gate: An authorized officer must explicitly approve the article.
   */
  approveArticle(id, officerId = 'admin-1') {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    
    // Evaluate quality before approving
    const quality = ContentQualityEngine.evaluate(article);
    if (!quality.fact_check_passed) {
      throw new Error(`Cannot approve article: failed fact check (${quality.flags.join(', ')})`);
    }

    article.status = CONTENT_STATUS.APPROVED;
    article.human_approved_by = officerId;
    article.human_approved_at = new Date().toISOString();
    article.updated_at = new Date().toISOString();
    return article;
  }

  scheduleArticle(id, targetDate) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    if (article.status !== CONTENT_STATUS.APPROVED) {
      throw new Error('Only approved articles can be scheduled for publication');
    }

    article.status = CONTENT_STATUS.SCHEDULED;
    article.scheduled_at = new Date(targetDate).toISOString();
    article.updated_at = new Date().toISOString();
    return article;
  }

  /**
   * Idempotent Publication: Can be safely retried without duplicating articles.
   */
  publishArticle(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');

    // Idempotency check: if already published, return immediately
    if (article.status === CONTENT_STATUS.PUBLISHED) {
      return {
        success: true,
        alreadyPublished: true,
        article
      };
    }

    // Must be in approved or scheduled status
    if (article.status !== CONTENT_STATUS.APPROVED && article.status !== CONTENT_STATUS.SCHEDULED) {
      throw new Error(`Cannot publish article with status '${article.status}'. Human approval is required.`);
    }

    article.status = CONTENT_STATUS.PUBLISHED;
    article.published_at = new Date().toISOString();
    article.publish_error = null;
    article.updated_at = new Date().toISOString();

    return {
      success: true,
      alreadyPublished: false,
      article
    };
  }

  failArticle(id, errorReason) {
    const article = this.getArticleById(id);
    if (!article) return null;
    article.status = CONTENT_STATUS.FAILED;
    article.publish_error = errorReason;
    article.updated_at = new Date().toISOString();
    return article;
  }

  archiveArticle(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    article.status = CONTENT_STATUS.ARCHIVED;
    article.updated_at = new Date().toISOString();
    return article;
  }

  reset() {
    this.articles.clear();
    this.slugMap.clear();
    this.seedFoundingArticles();
  }
}

const articleRepositoryInstance = new ArticleRepository();

module.exports = {
  ArticleRepository,
  articleRepository: articleRepositoryInstance
};

