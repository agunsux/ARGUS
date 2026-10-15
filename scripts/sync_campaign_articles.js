/**
 * TIKUM — Sync & Audit All 30 Campaign Articles
 * Ensures all 30 articles in EDITORIAL_ARTICLES are audited, scored,
 * enriched with internal links, and synced into articles_snapshot.json & data/articles.json.
 */

const fs = require('fs');
const path = require('path');
const { EDITORIAL_ARTICLES } = require('../src/content/seeds/editorialCampaignArticles');
const { ContentModel } = require('../src/content/ContentModel');
const { ContentQualityEngine } = require('../src/content/ContentQualityEngine');
const { InternalLinkingService } = require('../src/seo/InternalLinkingService');

console.log(`Verifying and syncing all ${EDITORIAL_ARTICLES.length} campaign articles...`);

if (EDITORIAL_ARTICLES.length !== 30) {
  console.error(`[ERROR] Expected 30 articles, found ${EDITORIAL_ARTICLES.length}`);
  process.exit(1);
}

let errors = 0;
const enrichedArticles = [];

// Also include the draft fixture 'art-buying-1' for test workflows
const draftFixture = {
  id: 'art-buying-1',
  title: 'Panduan Memilih Kategori Tiket Konser: Festival vs Seating',
  slug: 'panduan-memilih-kategori-tiket-konser-festival-vs-seating',
  description: 'Tips menentukan kategori tiket konser terbaik: kelebihan tiket standing festival vs nomor kursi seating di stadion besar seperti GBK dan JIS.',
  category: 'ticket-guides',
  search_intent: 'informational',
  keywords: ['kategori tiket konser', 'standing vs seating konser', 'tips nonton konser'],
  status: 'draft',
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

const draftModel = ContentModel.create(draftFixture);
const draftEval = ContentQualityEngine.evaluate(draftModel);
draftModel.seo_score = draftEval.seo_score;
draftModel.quality_score = draftEval.quality_score;
draftModel.trust_score = draftEval.trust_score;
draftModel.readability_score = draftEval.readability_score;
draftModel.internal_links = InternalLinkingService.getRecommendedLinks(draftModel);
enrichedArticles.push(draftModel);

EDITORIAL_ARTICLES.forEach((artData, idx) => {
  const artNumber = idx + 1;
  const article = ContentModel.create(artData);
  const validation = ContentModel.validate(article);

  if (!validation.isValid) {
    console.error(`[FAIL] Article ${artNumber} (${article.slug}): Validation failed: ${validation.errors.join(', ')}`);
    errors++;
  }

  const analysis = ContentQualityEngine.evaluate(article);
  const plainText = article.content.replace(/<[^>]*>/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const flags = analysis.flags || [];

  if (wordCount < 750) {
    console.error(`[FAIL] Article ${artNumber} (${article.slug}): Word count ${wordCount} < 750`);
    errors++;
  }
  if (analysis.seo_score < 100) {
    console.error(`[FAIL] Article ${artNumber} (${article.slug}): SEO score ${analysis.seo_score} < 100. Flags: ${flags.join('; ')}`);
    errors++;
  }
  if (analysis.quality_score < 100) {
    console.error(`[FAIL] Article ${artNumber} (${article.slug}): Quality score ${analysis.quality_score} < 100. Flags: ${flags.join('; ')}`);
    errors++;
  }
  if (flags.length > 0) {
    console.error(`[FAIL] Article ${artNumber} (${article.slug}): Flags present: ${flags.join('; ')}`);
    errors++;
  }

  article.seo_score = analysis.seo_score;
  article.quality_score = analysis.quality_score;
  article.trust_score = analysis.trust_score;
  article.readability_score = analysis.readability_score;
  article.internal_links = InternalLinkingService.getRecommendedLinks(article);

  enrichedArticles.push(article);
  console.log(`[PASS] Art ${String(artNumber).padStart(2, '0')}: ${article.slug.padEnd(58)} | ${wordCount} words | status: ${article.status}`);
});

if (errors > 0) {
  console.error(`\nFound ${errors} audit errors. Cannot sync.`);
  process.exit(1);
}

console.log(`\nAll 30 articles successfully passed audit! Syncing snapshot and data files...`);

const snapshotPath = path.resolve(__dirname, '../src/content/fixtures/articles_snapshot.json');
const dataDir = path.resolve(__dirname, '../data');
const dataFilePath = path.join(dataDir, 'articles.json');

fs.writeFileSync(snapshotPath, JSON.stringify(enrichedArticles, null, 2), 'utf8');
console.log(`Saved ${enrichedArticles.length} articles to ${snapshotPath}`);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
fs.writeFileSync(dataFilePath, JSON.stringify(enrichedArticles, null, 2), 'utf8');
console.log(`Saved ${enrichedArticles.length} articles to ${dataFilePath}`);
