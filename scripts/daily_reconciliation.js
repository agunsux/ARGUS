/**
 * TIKUM / ARGUS — Daily Payment & Financial Reconciliation Job (Invariant I8)
 *
 * Reconciles provider settlement transactions against internal canonical orders,
 * escrows, and double-entry ledger entries.
 *
 * Usage:
 *   node scripts/daily_reconciliation.js [--dry-run] [--date=YYYY-MM-DD] [--provider=doku]
 */

const { PaymentService } = require('../src/services/payment/PaymentService');
const { FinancialLedger } = require('../src/settlement/FinancialLedger');
const { state } = require('../src/database');

async function runDailyReconciliation() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const dateArg = args.find(a => a.startsWith('--date='));
  const providerArg = args.find(a => a.startsWith('--provider='));

  const date = dateArg ? dateArg.split('=')[1] : new Date().toISOString().split('T')[0];
  const providerName = providerArg ? providerArg.split('=')[1] : 'doku';

  console.log('================================================================');
  console.log(`  TIKUM DAILY FINANCIAL RECONCILIATION BATCH — [${providerName.toUpperCase()}]`);
  console.log(`  Target Date: ${date} | Mode: ${isDryRun ? 'DRY-RUN (AUDIT ONLY)' : 'COMMITTED AUDIT'}`);
  console.log('================================================================\n');

  // Step 1: Double-Entry Solvency Assertion
  console.log('── Step 1: Ledger Solvency & Balancing ──');
  let solvency;
  try {
    solvency = FinancialLedger.assertSolvency();
    console.log(`  [OK] Double-entry ledger balanced: Debits = Rp ${solvency.grandDebits}, Credits = Rp ${solvency.grandCredits}`);
  } catch (solvErr) {
    console.error(`  [CRITICAL] Ledger Solvency Failure: ${solvErr.message}`);
    if (!isDryRun) process.exit(1);
  }

  // Step 2: Gateway Settlement vs Canonical Orders Reconcile
  console.log('\n── Step 2: Gateway Transactions vs Tikum Orders ──');
  const report = await PaymentService.reconcileTransactions({
    date,
    providerName
  });

  console.log(`  Batch ID: ${report.batch_id}`);
  console.log(`  Total Transactions Inspected: ${report.reconciled_count}`);
  console.log(`  Matched Transactions: ${report.reconciled_count - report.variances_found}`);
  console.log(`  Variances / Exceptions: ${report.variances_found}`);

  if (report.variances_found > 0) {
    console.log('\n── Step 3: Reconciliation Exceptions Report ──');
    const exceptions = (report.records || []).filter(r => r.status !== 'MATCHED');
    console.table(exceptions.map(e => ({
      Order: e.order_id,
      Status: e.status,
      Variance: e.variance,
      Notes: e.notes
    })));

    if (!isDryRun) {
      console.error('\n[ALERT] Daily reconciliation detected financial exceptions. Alerting ops.');
      process.exit(1);
    }
  } else {
    console.log('\n  [SUCCESS] All transactions balanced with zero variance.');
  }

  return report;
}

if (require.main === module) {
  runDailyReconciliation().catch(err => {
    console.error('Fatal error during daily reconciliation:', err);
    process.exit(1);
  });
}

module.exports = { runDailyReconciliation };
