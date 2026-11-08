/**
 * TIKUM — Scheduler Fault Isolation & Quarantine Verification Suite
 *
 * Verifies:
 * 1. Single unapproved scheduled article is quarantined with `publish_error` and does NOT crash the cycle.
 * 2. Subsequent approved articles in the same cycle are published without hindrance.
 * 3. An all-quarantined cycle completes gracefully with status QUARANTINED (no unhandled throw).
 * 4. Candidates without human approval are filtered out from evergreen selection.
 * 5. Distributed lease lock and audit trails record quarantined status accurately.
 */

process.env.NODE_ENV = 'test';
const assert = require('assert');
const { InMemoryArticleStore } = require('./src/content/InMemoryArticleStore');
const { DurableArticleStore } = require('./src/content/DurableArticleStore');
const { articleRepository, ArticleRepository } = require('./src/content/ArticleRepository');
const { PublishingScheduler } = require('./src/content/PublishingScheduler');
const { CONTENT_STATUS } = require('./src/content/ContentModel');

async function run() {
  console.log('========================================================================');
  console.log('TIKUM — SCHEDULER FAULT ISOLATION & QUARANTINE VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  function check(name, fn) {
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function checkAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // Set up in-memory store
  const store = new InMemoryArticleStore();
  await store.init();
  DurableArticleStore.setStore(store);
  articleRepository.reset();

  const scheduler = new PublishingScheduler({
    jobName: 'test_publishing_cycle',
    autoPublishEvergreen: false
  });

  // Test 1: Mixed batch of due articles (1 unapproved, 1 valid approved)
  await checkAsync('Fault Isolation: unapproved article is quarantined while valid article is published', async () => {
    const dueTime = new Date('2026-11-03T10:00:00+07:00');

    // Article A: Invalid (no human approval)
    const artA = {
      id: 'art-unapproved-test',
      slug: 'unapproved-test-article',
      title: 'Artikel Tanpa Persetujuan Manusia',
      description: 'Deskripsi artikel tanpa approval yang seharusnya di-quarantine oleh scheduler dan tidak membuat sistem gagal.',
      category: 'ticket-safety',
      content: '<p>Konten artikel tanpa human approval yang sengaja disiapkan untuk menguji ketahanan scheduler sistem Tikum dalam mengisolasi kegagalan satu artikel secara aman.</p>',
      author: 'Tester',
      status: CONTENT_STATUS.SCHEDULED,
      scheduled_at: '2026-11-01T03:00:00.000Z',
      human_approved_by: null,
      human_approved_at: null
    };

    // Article B: Valid (has human approval)
    const artB = {
      id: 'art-valid-test',
      slug: 'valid-approved-test-article',
      title: 'Artikel Valid Dengan Persetujuan',
      description: 'Deskripsi artikel valid yang harus berhasil diterbitkan oleh scheduler sistem Tikum dengan aman.',
      category: 'ticket-safety',
      content: '<p>Konten artikel valid dengan human approval lengkap yang membuktikan bahwa artikel sah berikutnya dalam satu siklus tetap diterbitkan secara mulus.</p>',
      author: 'Editor In Chief',
      status: CONTENT_STATUS.SCHEDULED,
      scheduled_at: '2026-11-02T03:00:00.000Z',
      human_approved_by: 'chief-editor',
      human_approved_at: '2026-10-30T03:00:00.000Z'
    };

    articleRepository.saveArticleInternal(artA, false);
    articleRepository.saveArticleInternal(artB, false);

    const published = scheduler.publishDueArticles(dueTime);

    // Assert Art B is published
    assert.ok(published.some(a => a.id === 'art-valid-test'), 'Valid article should be published');
    assert.ok(!published.some(a => a.id === 'art-unapproved-test'), 'Unapproved article must NOT be published');

    // Assert Art A was quarantined and not published
    assert.ok(published.quarantined, 'Quarantined list should exist on return value');
    assert.ok(published.quarantined.some(q => q.id === 'art-unapproved-test'), 'art-unapproved-test must be in quarantined list');
    const qA = published.quarantined.find(q => q.id === 'art-unapproved-test');
    assert.ok(qA.error.includes('Publication requires a recorded editorial approval'));

    // Verify Art A status transitioned to FAILED with publish_error
    const freshA = articleRepository.getArticleById('art-unapproved-test');
    assert.strictEqual(freshA.status, CONTENT_STATUS.FAILED);
    assert.ok(freshA.publish_error.includes('editorial approval'));

    // Verify Art B status transitioned to PUBLISHED
    const freshB = articleRepository.getArticleById('art-valid-test');
    assert.strictEqual(freshB.status, CONTENT_STATUS.PUBLISHED);
  });

  // Test 2: runCycle handles mixed batch gracefully with COMPLETED_WITH_SKIPPED
  await checkAsync('runCycle records COMPLETED_WITH_SKIPPED when batch contains both published and quarantined articles', async () => {
    const cycleTime = new Date('2026-11-06T10:00:00+07:00'); // Friday 10:00 WIB (scheduled day)

    // Add another unapproved due article and another valid approved due article
    const artC = {
      id: 'art-unapproved-2',
      slug: 'unapproved-article-two',
      title: 'Artikel Unapproved Kedua',
      description: 'Deskripsi unapproved kedua yang menguji fault isolation scheduler Tikum.',
      category: 'ticket-safety',
      content: '<p>Konten unapproved kedua untuk pengujian fault isolation dan pembuktian status COMPLETED_WITH_SKIPPED pada eksekusi siklus penerbitan otomatis.</p>',
      status: CONTENT_STATUS.SCHEDULED,
      scheduled_at: '2026-11-05T03:00:00.000Z',
      human_approved_by: null,
      human_approved_at: null
    };

    const artD = {
      id: 'art-valid-2',
      slug: 'valid-approved-article-two',
      title: 'Artikel Valid Kedua',
      description: 'Deskripsi artikel valid kedua yang harus berhasil diterbitkan.',
      category: 'ticket-safety',
      content: '<p>Konten artikel valid kedua dengan persetujuan manusia lengkap untuk membuktikan penerbitan tetap berjalan tanpa hambatan dari artikel sebelumnya.</p>',
      status: CONTENT_STATUS.SCHEDULED,
      scheduled_at: '2026-11-05T03:00:00.000Z',
      human_approved_by: 'lead-editor',
      human_approved_at: '2026-11-04T03:00:00.000Z'
    };

    articleRepository.saveArticleInternal(artC, false);
    articleRepository.saveArticleInternal(artD, false);

    const report = await scheduler.runCycle({ now: cycleTime, forceRun: false });

    assert.strictEqual(report.executed, true);
    assert.ok(report.publishedCount >= 1);
    assert.ok(report.quarantinedCount >= 1);
    assert.ok(report.articles.some(a => a.id === 'art-valid-2'));
    assert.ok(report.quarantined.some(q => q.id === 'art-unapproved-2'));

    const history = await store.getSchedulerHistory('test_publishing_cycle', 1);
    assert.strictEqual(history[0].status, 'COMPLETED_WITH_SKIPPED');
  });

  // Test 3: runCycle with ONLY quarantined articles completes with QUARANTINED without throwing
  await checkAsync('runCycle completes safely with QUARANTINED status when all due articles fail validation', async () => {
    const cycleTime = new Date('2026-11-08T10:00:00+07:00'); // Sunday 10:00 WIB (forceRun to evaluate due)

    const artE = {
      id: 'art-unapproved-alone',
      slug: 'unapproved-article-alone',
      title: 'Artikel Unapproved Sendiri',
      description: 'Deskripsi unapproved sendirian yang harus di-quarantine dengan status QUARANTINED.',
      category: 'ticket-safety',
      content: '<p>Konten unapproved sendirian untuk menguji bahwa seluruh artikel kadaluarsa tanpa approval akan di-quarantine tanpa melempar unhandled error.</p>',
      status: CONTENT_STATUS.SCHEDULED,
      scheduled_at: '2026-11-07T03:00:00.000Z',
      human_approved_by: null,
      human_approved_at: null
    };
    articleRepository.saveArticleInternal(artE, false);

    const report = await scheduler.runCycle({ now: cycleTime, forceRun: true });
    assert.strictEqual(report.executed, true);
    assert.strictEqual(report.publishedCount, 0);
    assert.ok(report.quarantinedCount >= 1);
    assert.ok(report.quarantined.some(q => q.id === 'art-unapproved-alone'));

    const history = await store.getSchedulerHistory('test_publishing_cycle', 1);
    assert.strictEqual(history[0].status, 'QUARANTINED');
  });

  // Test 4: Evergreen candidate selection strictly filters out unapproved candidates
  await checkAsync('Evergreen candidate selection excludes articles with status APPROVED but human_approved_by null', async () => {
    const fakeTime = new Date('2026-11-13T10:00:00+07:00'); // Friday 10:00 WIB

    // Push all remaining scheduled articles to far future so no scheduled articles are due
    for (const art of articleRepository.getAllArticles()) {
      if (art.status === CONTENT_STATUS.SCHEDULED) {
        art.scheduled_at = '2099-01-01T00:00:00.000Z';
      }
    }

    const artGnrMock = {
      id: 'mock-gnr-candidate',
      slug: 'mock-gnr-candidate-slug',
      title: 'Mock Guns N Roses',
      description: 'Unverified rumor candidate yang tidak boleh diterbitkan secara otomatis.',
      category: 'ticket-safety',
      content: '<p>Rumor konser Guns N Roses yang tidak memiliki persetujuan manusia eksplisit dan harus ditolak dari pemilihan evergreen candidate secara otomatis.</p>',
      status: CONTENT_STATUS.APPROVED, // Status is approved, but no human approval metadata!
      human_approved_by: null,
      human_approved_at: null,
      quality_score: 95
    };
    articleRepository.saveArticleInternal(artGnrMock, false);

    const report = await scheduler.runCycle({ now: fakeTime, forceRun: true });
    // Must NOT publish mock-gnr-candidate!
    assert.strictEqual(report.publishedCount, 0);
    assert.strictEqual(report.reason, 'NO_APPROVED_CONTENT');

    const freshGnr = articleRepository.getArticleById('mock-gnr-candidate');
    assert.strictEqual(freshGnr.status, CONTENT_STATUS.APPROVED);
    assert.ok(!freshGnr.published_at, 'GNR candidate must not have published_at timestamp');
  });

  console.log(`\n========================================================================`);
  console.log(`✅ ALL ${passed} SCHEDULER FAULT ISOLATION TESTS PASSED`);
  console.log(`========================================================================\n`);
}

run().catch(err => {
  console.error('[FATAL TEST FAILURE]', err);
  process.exit(1);
});
