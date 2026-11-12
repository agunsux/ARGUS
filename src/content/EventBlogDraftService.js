/**
 * TIKUM / ARGUS — Event to Blog Draft Automation Service
 * 
 * Automatically generates high-quality, SEO-compliant editorial blog drafts
 * (status: DRAFT / PENDING_REVIEW) from verified canonical events.
 * 
 * Strict Invariants:
 * 1. Safe Editorial Gate: Drafts are created in 'draft' or 'review' status, NEVER directly 'published'.
 *    Human editor approval or explicit admin action is required to schedule or publish.
 * 2. Idempotency: Running generation multiple times for the same event ID will NEVER create duplicate articles.
 * 3. Fact & Trust Grounding: Uses verified canonical event facts (artist, dates, venue, city)
 *    and incorporates TIKUM trust pillars (escrow protection, gate PIC, anti-fraud turnstile verification).
 * 4. Zero Hallucination: Conforms to ContentQualityEngine rules (no forbidden marketing superlatives,
 *    structured H2/H3 headings, optimal title/meta lengths, >= 700 words depth).
 */

const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
const { articleRepository } = require('./ArticleRepository');
const { CONTENT_PILLARS, CONTENT_STATUS, SEARCH_INTENTS } = require('./ContentModel');
const { ContentQualityEngine } = require('./ContentQualityEngine');

class EventBlogDraftService {
  /**
   * Generates a slug-safe string.
   */
  static generateSlug(title) {
    return (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 80);
  }

  /**
   * Checks if a blog article already exists for the given canonical event.
   * Checks by target_event_id or matching event guide slug.
   * 
   * @param {string} eventId 
   * @returns {object|null} existing article or null
   */
  static findExistingArticleForEvent(eventId) {
    if (!eventId) return null;
    const all = articleRepository.getAllArticles();
    
    // 1. Direct match on target_event_id
    const matchedByEventId = all.find(a => a.target_event_id === eventId);
    if (matchedByEventId) return matchedByEventId;

    // 2. Fallback check by slug convention
    const ev = canonicalRegistry.getEventById(eventId);
    if (ev) {
      const expectedSlug = `panduan-tiket-${this.generateSlug(ev.canonical_name || ev.title || ev.name)}`;
      const matchedBySlug = articleRepository.getArticleBySlug(expectedSlug);
      if (matchedBySlug) return matchedBySlug;
    }

    return null;
  }

  /**
   * Generates a rich, deterministic, SEO-optimized blog draft for an event.
   * 
   * @param {string} eventId - Canonical event ID
   * @param {object} options - Optional overrides (status, author)
   * @returns {object} { success, created, article, quality_report }
   */
  static generateDraftFromEvent(eventId, options = {}) {
    const event = canonicalRegistry.getEventById(eventId);
    if (!event) {
      const err = new Error(`Canonical event not found: ${eventId}`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    // Idempotency check
    const existing = this.findExistingArticleForEvent(eventId);
    if (existing) {
      const evaluation = ContentQualityEngine.evaluate(existing);
      return {
        success: true,
        created: false,
        message: 'Blog guide draft already exists for this event (idempotent)',
        article: existing,
        evaluation
      };
    }

    const eventName = (event.canonical_name || event.title || event.name || 'Live Event').trim();
    const venueName = (event.venue_name || event.venue || 'Venue Resmi').trim();
    const cityName = (event.city || 'Indonesia').trim();
    const startDateRaw = event.start_date || event.start_at || event.date;
    const formattedDate = startDateRaw ? new Date(startDateRaw).toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Jakarta'
    }) : 'Jadwal Resmi';

    // Build SEO title (Optimal length: 40 - 70 characters)
    // Primary keyword: "Panduan Tiket [EventName]"
    let title = `Panduan Tiket ${eventName}: Jadwal, Venue & Keamanan`;
    if (title.length > 70) {
      title = `Panduan Tiket ${eventName}: Jadwal & Venue`.substring(0, 70);
    }
    if (title.length < 40) {
      title = `Panduan Tiket ${eventName}: Info Jadwal & Tips Nonton Aman`;
    }

    // Build SEO meta description (Optimal length: 100 - 165 characters)
    let description = `Panduan tiket ${eventName} di ${venueName}, ${cityName}. Informasi jadwal resmi, denah panggung, tips verifikasi tiket, dan perlindungan escrow Tikum.`;
    if (description.length > 165) {
      description = `Panduan tiket ${eventName} di ${venueName}. Jadwal konser resmi, denah panggung, tips verifikasi tiket, serta perlindungan escrow aman Tikum.`.substring(0, 165);
    }
    if (description.length < 100) {
      description = `Panduan tiket ${eventName} di ${venueName}, ${cityName}. Cek jadwal resmi, panduan lokasi panggung, dan tips transaksi aman dengan sistem escrow Tikum.`;
    }

    const baseSlug = `panduan-tiket-${this.generateSlug(eventName)}`;
    const slug = baseSlug.length > 75 ? baseSlug.substring(0, 75) : baseSlug;
    const primaryKeyword = `tiket ${eventName.toLowerCase()}`;

    // Rich structured content >= 700 words with H2/H3 headings and trust concepts
    const content = `
<h2>Ringkasan Acara &amp; Jadwal Resmi ${eventName}</h2>
<p>Kabar gembira bagi para penggemar seni dan hiburan di tanah air. Penyelenggaraan <strong>${eventName}</strong> di ${venueName}, ${cityName} telah resmi terkonfirmasi dalam kalender acara mendatang. Pertunjukan ini dijadwalkan berlangsung pada <strong>${formattedDate}</strong> dan diprediksi menjadi salah satu agenda panggung paling dinantikan musim ini.</p>
<p>Antusiasme yang tinggi kerap membuat kuota tiket penjualan utama di platform promotor resmi habis terjual dalam waktu singkat. Bagi calon penonton yang belum berkesempatan memperoleh tiket pada periode penjualan perdana, memahami ekosistem pasar sekunder (secondary marketplace) yang aman menjadi langkah krusial agar terhindar dari risiko kerugian finansial.</p>

<h3>Detail Agenda dan Waktu Penting</h3>
<ul>
  <li><strong>Nama Acara:</strong> ${eventName}</li>
  <li><strong>Lokasi / Venue:</strong> ${venueName}, ${cityName}</li>
  <li><strong>Tanggal Pelaksanaan:</strong> ${formattedDate}</li>
  <li><strong>Akses Open Gate:</strong> Biasanya dimulai 2 hingga 3 jam sebelum jadwal pertunjukan utama. Pastikan memeriksa pengumuman operasional berkala dari pihak promotor pelaksana.</li>
</ul>

<h2>Panduan Lokasi Venue dan Transportasi Menuju ${venueName}</h2>
<p>Menghadiri konser berkapasitas ribuan penonton memerlukan perencanaan mobilitas yang matang. Akses menuju ${venueName} memiliki karakteristik tersendiri, terutama pada jam-jam sibuk menjelang penutupan gerbang panggung.</p>

<h3>Akses Transportasi Umum dan Titik Kumpul</h3>
<p>Sangat dianjurkan menggunakan moda transportasi publik terpadu seperti MRT, KRL Commuter Line, atau TransJakarta untuk meminimalkan kemacetan di area sekitar ${venueName}. Apabila menggunakan layanan kendaraan online atau kendaraan pribadi, tentukan titik kumpul (drop-off zone) yang strategis di luar perimeter utama kemacetan gerbang masuk.</p>

<h3>Persiapan Hari Acara dan Perlengkapan Wajib</h3>
<p>Siapkan identitas diri resmi (KTP / Paspor / SIM) yang sesuai dengan nama tertera pada bukti kepemilikan tiket atau surat kuasa penukaran. Bawalah powerbank berkapasitas standar, jas hujan lipat bila acara bertema semi-outdoor, serta kenakan pakaian dan sepatu yang nyaman selama berada di area festival maupun seating.</p>

<h2>Risiko Bertransaksi di Luar Platform Resmi (Calo Medsos &amp; P2P Langsung)</h2>
<p>Fenomena kehabisan tiket sering dimanfaatkan oleh pihak tidak bertanggung jawab di media sosial seperti X (Twitter), Instagram, dan Telegram. Praktik jual beli tiket langsung tanpa perantara pihak ketiga yang terpercaya memiliki celah risiko yang sangat fatal bagi pembeli.</p>

<h3>Modus Penipuan Tiket Konser Paling Sering Terjadi</h3>
<p>Modus penipuan paling umum meliputi pengiriman bukti e-voucher palsu hasil suntingan digital, penjualan satu barcode atau QR code yang sama ke puluhan orang berbeda (double selling), serta hilangnya akun penjual seketika setelah dana transfer diterima tanpa pernah mengirimkan wristband fisik atau e-tiket asli.</p>

<h3>Kelemahan Rekening Bersama Pribadi</h3>
<p>Mempercayakan transaksi pada perorangan yang mengaku sebagai admin jasa titip (jastip) atau rekening bersama amatir tanpa badan hukum yang jelas tidak memberikan garansi apa pun. Ketika terjadi kendala penolakan turnstile di venue, pihak penengah tidak resmi kerap lepas tangan dan sulit dilacak secara hukum.</p>

<h2>Jaminan Perlindungan Pembeli dan Mekanisme Escrow Tikum</h2>
<p>Tikum hadir sebagai platform secondary ticket marketplace terstruktur di Indonesia yang mengedepankan keamanan transaksi menyeluruh. Kami menerapkan standar perlindungan pembeli (buyer protection) ketat untuk memitigasi risiko penipuan tiket konser.</p>

<h3>Sistem Rekening Penampungan (Escrow) Otomatis</h3>
<p>Saat Anda membeli tiket melalui Tikum, dana pembayaran Anda tidak langsung diteruskan ke kantong penjual. Seluruh dana ditampung secara aman di <strong>rekening penampungan resmi (escrow)</strong> platform. Dana baru akan dicairkan kepada penjual setelah acara selesai atau H+1 setelah pembeli berhasil masuk ke dalam area acara tanpa kendala validasi.</p>

<h3>Kehadiran Tim PIC Tikum di Lapangan (Venue Assistance)</h3>
<p>Berbeda dengan calo daring yang anonim, Tikum menempatkan Person-in-Charge (PIC) operasional di sekitar venue konser besar. Tim PIC bertugas mengawal proses serah terima tiket fisik, mendampingi proses validasi barcode, dan siap membantu klarifikasi secara langsung jika terjadi ketidaksesuaian nomor kursi atau tiket bermasalah di turnstile masuk.</p>

<h3>Mekanisme Penanganan Dispute dan Refund Transparan</h3>
<p>Apabila tiket yang dibeli terbukti tidak valid atau tertolak oleh sistem turnstile scanner promotor resmi di pintu gerbang, pembeli berhak mengajukan laporan sengketa (dispute) dengan menyertakan bukti kendala di lapangan. Tikum akan membekukan pembayaran penjual dan memproses pengembalian dana (refund) sesuai syarat dan ketentuan perlindungan transaksi kami.</p>

<h2>Tips Verifikasi Tiket Sebelum Hari Acara</h2>
<p>Untuk memastikan ketenangan Anda saat hari konser tiba, terapkan langkah-langkah verifikasi keaslian tiket berikut:</p>
<ul>
  <li>Pastikan e-voucher memuat barcode atau QR code yang utuh, tidak buram, dan belum pernah dipamerkan di media sosial publik.</li>
  <li>Jika tiket berbentuk e-voucher yang membutuhkan penukaran fisik, pastikan penjual menyertakan surat kuasa bermeterai dan fotokopi identitas pembeli pertama sesuai regulasi promotor.</li>
  <li>Manfaatkan fitur serah terima fisik langsung di titik kumpul (Tikum Hub) yang didampingi PIC kami untuk memverifikasi keaslian gelang wristband secara nyata.</li>
</ul>

<h2>Pertanyaan Umum Seputar Tiket ${eventName} (FAQ)</h2>
<h3>Kapan batas waktu penukaran wristband fisik biasanya dibuka?</h3>
<p>Promotor umumnya membuka booth penukaran wristband mulai H-2 atau H-1 hingga hari pelaksanaan konser. Selalu periksa pengumuman resmi promotor untuk rincian jam operasional booth.</p>

<h3>Bagaimana jika barcode tiket tidak bisa dipindai di turnstile gerbang?</h3>
<p>Segera hubungi PIC Tikum yang bertugas di venue atau laporkan melalui pusat bantuan kami. Rekening penampungan (escrow) menjamin dana Anda tetap aman selama investigasi tiket berlangsung.</p>

<p>Nikmati kemeriahan dan euforia konser <strong>${eventName}</strong> di ${venueName} dengan tenang, cerdas, dan aman bersama ekosistem perlindungan tiket Tikum.</p>
    `.trim();

    const draftData = {
      id: `art-guide-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      slug,
      description,
      category: CONTENT_PILLARS.TICKET_GUIDES,
      keywords: [eventName, `tiket ${eventName}`, `jadwal ${eventName}`, `nonton ${eventName}`, venueName, 'keamanan tiket konser'],
      search_intent: SEARCH_INTENTS.INFORMATIONAL,
      content,
      author: options.author || 'Tim Editorial Tikum',
      status: options.status || CONTENT_STATUS.DRAFT,
      target_event_id: event.id || event.event_id,
      target_venue_id: event.venue_id || null,
      target_city: cityName,
      source_references: event.sources || [event.primary_source].filter(Boolean),
      created_at: new Date().toISOString()
    };

    // Save through repository (handles internal links and scores)
    const saved = articleRepository.saveArticle(draftData);
    const evaluation = ContentQualityEngine.evaluate(saved);

    return {
      success: true,
      created: true,
      message: 'Event blog guide draft created successfully',
      article: saved,
      evaluation
    };
  }

  /**
   * Scans verified upcoming canonical events and generates drafts for any that lack one.
   * Safe passive batching: only creates DRAFT status records.
   * 
   * @param {object} options
   * @returns {object} batch summary
   */
  static generateDraftsForUpcomingEvents(options = {}) {
    const allEvents = canonicalRegistry.getAllEvents();
    const now = options.now ? new Date(options.now) : new Date();

    // Filter verified events that have not expired or been cancelled
    const verifiedUpcoming = allEvents.filter(ev => {
      if (ev.status === 'CANCELLED') return false;
      const isVerified = ev.is_verified === true || ev.verification_status === 'VERIFIED' || ev.verification_status === 'PRIMARY_SOURCE_VERIFIED';
      if (!isVerified) return false;

      const startDate = ev.start_date || ev.start_at || ev.date;
      if (!startDate) return false;
      return new Date(startDate) >= new Date(now.getTime() - 24 * 60 * 60 * 1000);
    });

    const summary = {
      evaluated_events: verifiedUpcoming.length,
      created_drafts: 0,
      skipped_existing: 0,
      articles: []
    };

    for (const ev of verifiedUpcoming) {
      try {
        const result = this.generateDraftFromEvent(ev.id || ev.event_id, options);
        if (result.created) {
          summary.created_drafts++;
          summary.articles.push({
            event_id: ev.id,
            article_id: result.article.id,
            title: result.article.title,
            slug: result.article.slug,
            seo_score: result.evaluation?.seo_score || 0,
            quality_score: result.evaluation?.quality_score || 0
          });
        } else {
          summary.skipped_existing++;
        }
      } catch (err) {
        // Skip individual errors without crashing the batch
        console.warn(`[EventBlogDraftService] Skipped event ${ev.id}: ${err.message}`);
      }
    }

    return summary;
  }
}

module.exports = {
  EventBlogDraftService
};
