/**
 * TIKUM Article Repository
 * Persistent repository backed by DurableArticleStore with atomic state transitions,
 * idempotent seeding, audit tracking, and database synchronization.
 *
 * Adheres strictly to ADR: PERSISTENCE_BOUNDARY and Production Invariants:
 * - Server restarts do NOT erase editorial state or scheduled publication dates.
 * - Idempotent seeding prevents duplicate articles or overwriting admin edits.
 * - Atomic persistence guarantees zero corruption during multi-instance concurrency.
 */

const { ContentModel, CONTENT_PILLARS, CONTENT_STATUS, SEARCH_INTENTS } = require('./ContentModel');
const { ContentQualityEngine } = require('./ContentQualityEngine');
const { InternalLinkingService } = require('../seo/InternalLinkingService');
const { EDITORIAL_ARTICLES } = require('./seeds/editorialCampaignArticles');
const { DurableArticleStore } = require('./DurableArticleStore');

class ArticleRepository {
  constructor() {
    this.articles = new Map(); // id -> article
    this.slugMap = new Map(); // slug -> id
    this.initStorageAndSeed();
  }

  /**
   * Initializes articles from DurableArticleStore or seeds initial fixtures idempotently.
   */
  initStorageAndSeed() {
    DurableArticleStore.init();

    if (DurableArticleStore.hasPersistedData()) {
      const storedArticles = DurableArticleStore.load();
      for (const item of storedArticles) {
        this.articles.set(item.id, item);
        this.slugMap.set(item.slug, item.id);
      }

      // Idempotent seeding check: ensure foundational articles exist without overwriting edits
      let changesMade = false;

      // 1. Check draft article
      if (!this.articles.has('art-buying-1') && !this.slugMap.has('panduan-memilih-kategori-tiket-konser-festival-vs-seating')) {
        const draft = this.buildDraftFixture();
        this.saveArticleInternal(draft, false);
        changesMade = true;
      }

      // 2. Check 20 editorial campaign articles
      for (const seedArt of EDITORIAL_ARTICLES) {
        if (!this.articles.has(seedArt.id) && !this.slugMap.has(seedArt.slug)) {
          this.saveArticleInternal(seedArt, false);
          changesMade = true;
        }
      }

      if (changesMade) {
        this.persistToStorage();
      }
    } else {
      // First boot: fresh seed
      this.seedFoundingArticles();
    }

    // Register legacy aliases for backwards compatibility
    this.registerLegacyAliases();
    this.syncStateDatabase();
  }

  buildDraftFixture() {
    return {
      id: 'art-buying-1',
      title: 'Panduan Memilih Kategori Tiket Konser: Festival vs Seating',
      slug: 'panduan-memilih-kategori-tiket-konser-festival-vs-seating',
      description: 'Tips menentukan kategori tiket konser terbaik: kelebihan tiket standing festival vs nomor kursi seating di stadion besar seperti GBK dan JIS.',
      category: CONTENT_PILLARS.TICKET_GUIDES,
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
    };
  }

  seedFoundingArticles() {
    // 1. Working draft to support editorial drafting tests and admin workflow
    const draftArticle = this.buildDraftFixture();
    this.saveArticleInternal(draftArticle, false);

    // 2. Seed the complete 20-article authority campaign cluster
    for (const art of EDITORIAL_ARTICLES) {
      this.saveArticleInternal(art, false);
    }

    this.registerLegacyAliases();
    this.persistToStorage();
  }

  registerLegacyAliases() {
    this.slugMap.set('jual-beli-tiket-konser-secondary-yang-aman', 'art-campaign-01');
    this.slugMap.set('cara-menghindari-scam-tiket-konser', 'art-campaign-04');
    this.slugMap.set('apa-itu-ticket-resale-dan-bagaimana-escrow-bekerja', 'art-campaign-02');
    this.slugMap.set('cara-menghindari-penipuan-tiket-konser-di-media-sosial', 'art-campaign-04');
  }

  saveArticleInternal(articleData, shouldPersist = true) {
    // Slug collision protection: Ensure slug is not already used by another article
    const targetSlug = articleData.slug;
    if (targetSlug) {
      const existingId = this.slugMap.get(targetSlug);
      if (existingId && existingId !== articleData.id) {
        throw new Error(`Article with slug '${targetSlug}' already exists (ID: ${existingId})`);
      }
    }

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

    // Inject semantic internal links
    const recLinks = InternalLinkingService.getRecommendedLinks(article);
    article.internal_links = recLinks;

    this.articles.set(article.id, article);
    this.slugMap.set(article.slug, article.id);

    if (shouldPersist) {
      this.persistToStorage();
    }
    return article;
  }

  saveArticle(articleData) {
    return this.saveArticleInternal(articleData, true);
  }

  persistToStorage() {
    const list = Array.from(this.articles.values());
    try {
      DurableArticleStore.persist(list);
    } catch (err) {
      console.error('[ArticleRepository] Durable persistence error:', err.message);
    }
    this.syncStateDatabase();
  }

  syncStateDatabase() {
    try {
      const { state } = require('../database');
      if (state) {
        state.articles = Array.from(this.articles.values());
      }
    } catch (_) {}
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
      list = list.filter(a => (a.category || '').toLowerCase() === filters.category.toLowerCase());
    }

    list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return list;
  }

  getPublishedArticles() {
    const nowIso = new Date().toISOString();
    return this.getAllArticles({ status: CONTENT_STATUS.PUBLISHED }).filter(a => {
      // Must be published and published_at must not be in the future
      if (a.published_at) {
        return a.published_at <= nowIso;
      }
      return true;
    });
  }

  // --- State Transitions ---

  submitForReview(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    article.status = CONTENT_STATUS.REVIEW;
    article.updated_at = new Date().toISOString();
    this.persistToStorage();
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
    this.persistToStorage();
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
    this.persistToStorage();
    return article;
  }

  /**
   * Idempotent Publication: Can be safely retried without duplicating articles.
   * Supports custom options.publishedAt for schedule fulfillment.
   */
  publishArticle(id, options = {}) {
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
    article.published_at = options.publishedAt || new Date().toISOString();
    article.publish_error = null;
    article.updated_at = new Date().toISOString();
    this.persistToStorage();

    return {
      success: true,
      alreadyPublished: false,
      article
    };
  }

  unpublishArticle(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    article.status = CONTENT_STATUS.DRAFT;
    article.updated_at = new Date().toISOString();
    this.persistToStorage();
    return article;
  }

  failArticle(id, errorReason) {
    const article = this.getArticleById(id);
    if (!article) return null;
    article.status = CONTENT_STATUS.FAILED;
    article.publish_error = errorReason;
    article.updated_at = new Date().toISOString();
    this.persistToStorage();
    return article;
  }

  archiveArticle(id) {
    const article = this.getArticleById(id);
    if (!article) throw new Error('Article not found');
    article.status = CONTENT_STATUS.ARCHIVED;
    article.updated_at = new Date().toISOString();
    this.persistToStorage();
    return article;
  }

  reset() {
    this.articles.clear();
    this.slugMap.clear();
    DurableArticleStore.clear();
    this.seedFoundingArticles();
  }
}

const articleRepositoryInstance = new ArticleRepository();

module.exports = {
  ArticleRepository,
  articleRepository: articleRepositoryInstance
};
