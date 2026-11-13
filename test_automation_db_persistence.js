/**
 * TIKUM / ARGUS — Automated Test Suite: Database-Backed Automation Persistence & Distributed Lease
 * 
 * Verifies P0 Requirements:
 * 1. Survives serverless runtime without relying on local JSON files.
 * 2. Database state persistence (toggle, last_run_at, run_count, last_result).
 * 3. Atomic distributed lease locking: prevents concurrent job runs.
 * 4. Automatic recovery when a lease expires past TTL.
 * 5. Durable reconciliation history persisted in database.
 */

const assert = require('assert');
const { InMemoryCatalogRepository } = require('./src/discovery/repository/InMemoryCatalogRepository');
const { EventIngestionScheduler, JOB_TYPES, JOB_STATUS } = require('./src/discovery/EventIngestionScheduler');

async function runSuite() {
  console.log('--- TEST SUITE: DB-Backed Automation Persistence & Lease Concurrency ---');

  const repo = new InMemoryCatalogRepository();

  // Test 1: Initialize scheduler with repository and check safe passive defaults
  console.log('Test 1: Scheduler initial state with DB repo');
  const scheduler = new EventIngestionScheduler({ repository: repo });
  assert.strictEqual(scheduler.enabled, false, 'Default scheduler should be disabled (safe passive mode)');
  const allJobs = scheduler.getAllJobs();
  assert.strictEqual(allJobs.length >= 9, true, 'All 9 default jobs registered');
  const discoveryJob = scheduler.getJobStatus(JOB_TYPES.EVENT_DISCOVERY_DAILY);
  assert.strictEqual(discoveryJob.enabled, false, 'Discovery job initially disabled');

  // Test 2: Toggle job updates DB repository
  console.log('Test 2: Toggle job persists to database repository');
  await scheduler.toggleJob(JOB_TYPES.EVENT_DISCOVERY_DAILY, true);
  assert.strictEqual(scheduler.getJobStatus(JOB_TYPES.EVENT_DISCOVERY_DAILY).enabled, true);
  
  const dbState = await repo.getJobSchedulerState(JOB_TYPES.EVENT_DISCOVERY_DAILY);
  assert.ok(dbState, 'State must exist in repository');
  assert.strictEqual(dbState.enabled, true, 'Repository must store enabled=true');

  // Test 3: New scheduler instance restores state from DB (simulating serverless cold boot)
  console.log('Test 3: New scheduler instance restores state from DB repository');
  const coldBootScheduler = new EventIngestionScheduler({ repository: repo });
  await coldBootScheduler.syncStateFromDb();
  const restoredJob = coldBootScheduler.getJobStatus(JOB_TYPES.EVENT_DISCOVERY_DAILY);
  assert.strictEqual(restoredJob.enabled, true, 'Cold boot scheduler restored enabled=true from DB');

  // Test 4: Run job acquires lease, records reconciliation run, and releases lease
  console.log('Test 4: Job execution with DB lease and audit history');
  const runResult = await scheduler.runJob(JOB_TYPES.EXPIRATION_SWEEP, {
    operator: 'ADMIN_TEST',
    trigger: 'TEST_SUITE'
  });
  assert.ok(runResult, 'Run result returned');
  assert.strictEqual(runResult.job, JOB_TYPES.EXPIRATION_SWEEP);

  const updatedState = await repo.getJobSchedulerState(JOB_TYPES.EXPIRATION_SWEEP);
  assert.ok(updatedState, 'Updated state exists in DB');
  assert.strictEqual(updatedState.last_status, 'COMPLETED');
  assert.strictEqual(updatedState.run_count, 1);
  assert.strictEqual(updatedState.lease_owner, null, 'Lease must be released after completion');

  const runs = await repo.getRecentReconciliationRuns(10);
  assert.strictEqual(runs.length >= 1, true, 'Reconciliation run must be recorded in DB');
  assert.strictEqual(runs[0].status, 'COMPLETED');
  assert.strictEqual(runs[0].run_by, 'ADMIN_TEST');

  // Test 5: Concurrency protection — active lease blocks concurrent run
  console.log('Test 5: Concurrency block when lease is held by another worker');
  // Simulate active lease held by worker-A with 30s TTL
  const leaseRes = await repo.acquireJobLease(JOB_TYPES.EVENT_REFRESH_DAILY, 'worker-instance-A', 30000);
  assert.strictEqual(leaseRes.acquired, true, 'Worker A acquired lease');

  // Worker B attempts to run the same job
  let blocked = false;
  try {
    await scheduler.runJob(JOB_TYPES.EVENT_REFRESH_DAILY, {
      leaseOwner: 'worker-instance-B'
    });
  } catch (err) {
    blocked = true;
    assert.strictEqual(err.code, 'JOB_ALREADY_RUNNING', 'Must throw JOB_ALREADY_RUNNING error code');
    assert.ok(err.message.includes('locked'), 'Message indicates lock is held');
  }
  assert.strictEqual(blocked, true, 'Concurrent execution was strictly blocked');

  // Test 6: Expired lease auto-recovery
  console.log('Test 6: Expired lease auto-recovery');
  // Force lease expiration by setting lease_expires_at to past timestamp
  const pastTime = new Date(Date.now() - 5000).toISOString();
  repo.schedulerStates.set(JOB_TYPES.EVENT_REFRESH_DAILY, {
    ...repo.schedulerStates.get(JOB_TYPES.EVENT_REFRESH_DAILY),
    lease_expires_at: pastTime
  });

  // Now Worker B should be able to acquire lease and run the job
  const recoveryResult = await scheduler.runJob(JOB_TYPES.EVENT_REFRESH_DAILY, {
    leaseOwner: 'worker-instance-B'
  });
  assert.ok(recoveryResult, 'Job succeeded after expired lease auto-recovery');
  const recoveredState = await repo.getJobSchedulerState(JOB_TYPES.EVENT_REFRESH_DAILY);
  assert.strictEqual(recoveredState.last_status, 'COMPLETED');
  assert.strictEqual(recoveredState.lease_owner, null, 'Lease released after auto-recovered run');

  // Test 7: History query retrieves from DB
  console.log('Test 7: History retrieval from database repository');
  const history = await scheduler.getJobHistory(10);
  assert.strictEqual(history.length >= 2, true, 'At least 2 runs retrieved from DB history');
  assert.strictEqual(history[0].status, 'COMPLETED');

  console.log('ALL DB AUTOMATION PERSISTENCE TESTS PASSED (7/7)');
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
