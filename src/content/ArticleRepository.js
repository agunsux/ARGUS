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

