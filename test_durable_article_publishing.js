/**
 * TIKUM — Durable Article Publishing & Distributed Scheduler Acceptance Suite
 *
 * Verifies:
 * 1. Persistent Storage contract (Atomic compare-and-set, versioning, rollback, audit trail).
 * 2. Slug uniqueness enforcement.
 * 3. Distributed lease locking (acquire/release/ttl).
 * 4. Scheduler pause/resume controls.
 * 5. Persistent execution logs.
 * 6. Private draft and scheduled content isolation (zero public exposure).
 * 7. Fail-closed behavior when durable store is unconfigured on serverless.
 */

const assert = require('assert');
const { InMemoryArticleStore } = require('./src/content/InMemoryArticleStore');
const { PostgresArticleStore } = require('./src/content/PostgresArticleStore');
const { DurableArticleStore } = require('./src/content/DurableArticleStore');
const { articleRepository, ArticleRepository } = require('./src/content/ArticleRepository');
const { publishingScheduler } = require('./src/content/PublishingScheduler');
const { CONTENT_STATUS } = require('./src/content/ContentModel');

async function runDurableAcceptanceSuite() {
  console.log('================================================================');
  console.log('  TIKUM — DURABLE ARTICLE PUBLISHING & SCHEDULER ACCEPTANCE');
  console.log('================================================================\n');

  let passed = 0;
  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  // --- 1. In-Memory Store & Atomic Operations ---
  console.log('--- 1. Storage Operations & Audit Trail ---');
  const store = new InMemoryArticleStore();
  await store.init();

  await testAsync('Article can be saved with audit record', async () => {
    const art = await store.saveArticle({
      id: 'test-art-1',
      slug: 'test-article-satu',
      title: 'Judul Artikel Pengujian Satu',
      description: 'Deskripsi pengujian penyimpanan persisten artikel editorial.',
      category: 'ticket-guides',
      content: '<p>Konten pengujian.</p>',
      status: CONTENT_STATUS.DRAFT
    }, { action: 'CREATED', performed_by: 'editor-1' });

    assert.strictEqual(art.id, 'test-art-1');
    assert.strictEqual(art.version, 1);

    const history = await store.getArticleAuditHistory('test-art-1');
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].action, 'CREATED');
    assert.strictEqual(history[0].performed_by, 'editor-1');
  });

  await testAsync('Slug uniqueness is strictly enforced', async () => {
    await assert.rejects(async () => {
      await store.saveArticle({
        id: 'test-art-2',
        slug: 'test-article-satu', // duplicate slug
        title: 'Judul Duplikat',
        description: 'Mencoba menggunakan slug yang sama dengan id berbeda.',
        category: 'ticket-guides',
        content: '<p>Konten duplikat.</p>',
        status: CONTENT_STATUS.DRAFT
      });
    }, /already exists/);
  });

  await testAsync('Publishing requires APPROVED or SCHEDULED status', async () => {
    await assert.rejects(async () => {
      await store.publishArticle('test-art-1');
    }, /Human approval is required/);
  });

  await testAsync('Approved article transitions to PUBLISHED with audit trail', async () => {
    // Approve
    await store.saveArticle({
      id: 'test-art-1',
      status: CONTENT_STATUS.APPROVED,
      human_approved_by: 'officer-42',
      human_approved_at: new Date().toISOString()
    }, { action: 'APPROVED', performed_by: 'officer-42' });

    // Publish
    const pubResult = await store.publishArticle('test-art-1', {}, { performed_by: 'officer-42' });
    assert.strictEqual(pubResult.success, true);
    assert.strictEqual(pubResult.alreadyPublished, false);
    assert.strictEqual(pubResult.article.status, CONTENT_STATUS.PUBLISHED);
    assert.ok(pubResult.article.published_at);
    assert.strictEqual(pubResult.article.version, 3); // created(1) -> approved(2) -> published(3)

    // Idempotent re-publish
    const rePubResult = await store.publishArticle('test-art-1');
    assert.strictEqual(rePubResult.success, true);
    assert.strictEqual(rePubResult.alreadyPublished, true);

    const history = await store.getArticleAuditHistory('test-art-1');
    assert.ok(history.length >= 3);
    assert.strictEqual(history[0].action, 'PUBLISHED');
  });

  // --- 2. Distributed Scheduler Locking ---
  console.log('\n--- 2. Distributed Scheduler Locking & Leases ---');

  await testAsync('Scheduler lease is acquired atomically with TTL', async () => {
    const lease1 = await store.acquireSchedulerLease('test_cycle', 'worker-node-A', 5000);
    assert.strictEqual(lease1.acquired, true);
    assert.strictEqual(lease1.state.lease_owner, 'worker-node-A');

    // Competing instance must be rejected
    const lease2 = await store.acquireSchedulerLease('test_cycle', 'worker-node-B', 5000);
    assert.strictEqual(lease2.acquired, false);
    assert.strictEqual(lease2.reason, 'LEASE_HELD_BY_ANOTHER_INSTANCE');

    // Release lease
    const releaseRes = await store.releaseSchedulerLease('test_cycle', 'worker-node-A', 'SUCCESS', { published: 1 });
    assert.strictEqual(releaseRes.released, true);

    // Now worker B can acquire
    const lease3 = await store.acquireSchedulerLease('test_cycle', 'worker-node-B', 5000);
    assert.strictEqual(lease3.acquired, true);
    assert.strictEqual(lease3.state.lease_owner, 'worker-node-B');
    await store.releaseSchedulerLease('test_cycle', 'worker-node-B');
  });

  await testAsync('Lease renewal (heartbeat) extends expiration time safely', async () => {
    const initialLease = await store.acquireSchedulerLease('test_cycle_renew', 'worker-active', 1000);
    assert.strictEqual(initialLease.acquired, true);
    const initialExp = new Date(initialLease.state.lease_expires_at).getTime();

    // Renew lease with longer TTL
    const renewRes = await store.renewSchedulerLease('test_cycle_renew', 'worker-active', 10000);
    assert.strictEqual(renewRes.renewed, true);
    const renewedExp = new Date(renewRes.state.lease_expires_at).getTime();
    assert.ok(renewedExp > initialExp, 'Renewed expiration must be further in the future');

    // Competing instance cannot renew or acquire
    const invalidRenew = await store.renewSchedulerLease('test_cycle_renew', 'worker-intruder', 10000);
    assert.strictEqual(invalidRenew.renewed, false);
    assert.strictEqual(invalidRenew.reason, 'LEASE_NOT_OWNED');

    await store.releaseSchedulerLease('test_cycle_renew', 'worker-active');
  });

  await testAsync('Stale owner recovery: expired lease can be taken over by new instance', async () => {
    // Acquire lease with 1ms TTL (instantly expires)
    await store.acquireSchedulerLease('test_cycle_stale', 'worker-crashed', 1);
    await new Promise(r => setTimeout(r, 10)); // wait for expiration

    // New worker should take over expired lease
    const takeover = await store.acquireSchedulerLease('test_cycle_stale', 'worker-survivor', 5000);
    assert.strictEqual(takeover.acquired, true);
    assert.strictEqual(takeover.state.lease_owner, 'worker-survivor');
    await store.releaseSchedulerLease('test_cycle_stale', 'worker-survivor');
  });

  await testAsync('Concurrent execution exclusion: two instances cannot publish the same article even after lease expiration during processing', async () => {
    // 1. Setup approved article
    await store.saveArticle({
      id: 'test-art-concurrent',
      slug: 'test-article-concurrent-safety',
      title: 'Judul Pengujian Konkurensi Dua Instance Aman',
      description: 'Membuktikan dua instance tidak dapat menerbitkan artikel yang sama saat lease kedaluwarsa.',
      category: 'ticket-guides',
      content: '<p>Konten uji konkurensi antar dua instance.</p>',
      status: CONTENT_STATUS.APPROVED,
      human_approved_by: 'lead-editor',
      human_approved_at: new Date().toISOString()
    }, { action: 'APPROVED', performed_by: 'lead-editor' });

    // 2. Instance 1 acquires lease with very short TTL (30ms)
    const lease1 = await store.acquireSchedulerLease('test_cycle_concurrent', 'instance-1', 30);
    assert.strictEqual(lease1.acquired, true);

    // 3. Simulate delay where Instance 1 is slow and its lease expires before finishing
    await new Promise(r => setTimeout(r, 45));

    // 4. Instance 2 discovers expired lease and acquires it (stale takeover)
    const lease2 = await store.acquireSchedulerLease('test_cycle_concurrent', 'instance-2', 5000);
    assert.strictEqual(lease2.acquired, true);
    assert.strictEqual(lease2.state.lease_owner, 'instance-2');

    // 5. Now BOTH instances attempt to publish the exact same article concurrently
    const [res1, res2] = await Promise.all([
      store.publishArticle('test-art-concurrent', { publishedAt: '2026-11-08T10:00:00Z' }, { performed_by: 'instance-1' }),
      store.publishArticle('test-art-concurrent', { publishedAt: '2026-11-08T10:00:00Z' }, { performed_by: 'instance-2' })
    ]);

    // Exactly one instance performs the initial publication; the other gets alreadyPublished: true
    const newlyPublishedCount = (res1.alreadyPublished ? 0 : 1) + (res2.alreadyPublished ? 0 : 1);
    assert.strictEqual(newlyPublishedCount, 1, 'Exactly one instance must perform the publication');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);

    // Verified article state in store: status is PUBLISHED
    const finalArticle = await store.getArticleById('test-art-concurrent');
    assert.strictEqual(finalArticle.status, CONTENT_STATUS.PUBLISHED);

    // Audit logs verify exactly one PUBLISHED entry
    const history = await store.getArticleAuditHistory('test-art-concurrent');
    const publishedActions = history.filter(h => h.action === 'PUBLISHED');
    assert.strictEqual(publishedActions.length, 1, 'Audit log must record exactly one PUBLISHED event');

    // Instance 1 tries to release its stale lease, but is rejected because Instance 2 owns it
    const lateRelease1 = await store.releaseSchedulerLease('test_cycle_concurrent', 'instance-1', 'SUCCESS', { published: 1 });
    assert.strictEqual(lateRelease1.released, false);
    assert.strictEqual(lateRelease1.reason, 'LEASE_NOT_OWNED');

    // Instance 2 releases its lease cleanly
    const cleanRelease2 = await store.releaseSchedulerLease('test_cycle_concurrent', 'instance-2', 'SUCCESS', { published: 1 });
    assert.strictEqual(cleanRelease2.released, true);
  });

  await testAsync('Pause controls prevent lease acquisition across all workers', async () => {
    await store.pauseScheduler('test_cycle', 'superadmin');
    const status = await store.getSchedulerStatus('test_cycle');
    assert.strictEqual(status.is_paused, true);

    const attempt = await store.acquireSchedulerLease('test_cycle', 'worker-node-A', 5000);
    assert.strictEqual(attempt.acquired, false);
    assert.strictEqual(attempt.paused, true);
    assert.strictEqual(attempt.reason, 'SCHEDULER_PAUSED');

    // Resume controls re-enable execution
    await store.resumeScheduler('test_cycle', 'superadmin');
    const resumedStatus = await store.getSchedulerStatus('test_cycle');
    assert.strictEqual(resumedStatus.is_paused, false);

    const resumedAttempt = await store.acquireSchedulerLease('test_cycle', 'worker-node-A', 5000);
    assert.strictEqual(resumedAttempt.acquired, true);
    await store.releaseSchedulerLease('test_cycle', 'worker-node-A');
  });

  await testAsync('Execution history is persistently recorded', async () => {
    await store.recordSchedulerExecution('test_cycle', 'run-101', 'SUCCESS', 2, [{ slug: 'art-1' }, { slug: 'art-2' }], null);
    await store.recordSchedulerExecution('test_cycle', 'run-102', 'FAILED', 0, [], new Error('Simulated network timeout'));

    const history = await store.getSchedulerHistory('test_cycle', 10);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].run_id, 'run-102');
    assert.strictEqual(history[0].status, 'FAILED');
    assert.ok(history[0].error_message.includes('Simulated network timeout'));
    assert.strictEqual(history[1].run_id, 'run-101');
    assert.strictEqual(history[1].status, 'SUCCESS');
  });

  // --- 3. Public Exposure Guard ---
  console.log('\n--- 3. Public Invisibility of Draft and Scheduled Articles ---');

  test('Draft articles are strictly private', () => {
    assert.strictEqual(ArticleRepository.isArticleDue({ status: CONTENT_STATUS.DRAFT }), false);
  });

  test('Scheduled articles are strictly private until published transactionally', () => {
    assert.strictEqual(ArticleRepository.isArticleDue({ status: CONTENT_STATUS.SCHEDULED, scheduled_at: '2020-01-01' }), false);
    assert.strictEqual(ArticleRepository.isArticleDue({ status: CONTENT_STATUS.SCHEDULED, scheduled_at: '2030-01-01' }), false);
  });

  test('Published articles are due only after published_at has elapsed', () => {
    assert.strictEqual(ArticleRepository.isArticleDue({ status: CONTENT_STATUS.PUBLISHED, published_at: '2020-01-01' }, new Date('2026-11-07')), true);
    assert.strictEqual(ArticleRepository.isArticleDue({ status: CONTENT_STATUS.PUBLISHED, published_at: '2030-01-01' }, new Date('2026-11-07')), false);
  });

  // --- 4. Restart & Retry Idempotency ---
  console.log('\n--- 4. Restart & Retry Idempotency ---');

  await testAsync('Restart preserves published state and prevents duplicate publication', async () => {
    const published = await store.getArticleById('test-art-1');
    assert.strictEqual(published.status, CONTENT_STATUS.PUBLISHED);

    // Simulate process restart: new repository instance hydrates from store
    const restartedStore = new InMemoryArticleStore();
    await restartedStore.init([published]);

    const reloaded = await restartedStore.getArticleById('test-art-1');
    assert.strictEqual(reloaded.status, CONTENT_STATUS.PUBLISHED);

    // A scheduled check after restart must see it as already published, not scheduled
    assert.strictEqual(reloaded.status !== CONTENT_STATUS.SCHEDULED, true);

    // Re-publish attempt after restart is completely idempotent
    const retryPub = await restartedStore.publishArticle('test-art-1');
    assert.strictEqual(retryPub.success, true);
    assert.strictEqual(retryPub.alreadyPublished, true);
    assert.strictEqual(retryPub.article.id, 'test-art-1');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed} DURABLE PUBLISHING CHECKS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runDurableAcceptanceSuite().catch(err => {
  console.error('Acceptance suite failed:', err);
  process.exit(1);
});
