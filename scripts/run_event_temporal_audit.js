/**
 * TIKUM — Event Temporal Lifecycle Dry-Run Audit
 * 
 * Inspects all registered events and verifies their canonical temporal classification.
 */

const { resetDatabase } = require('../src/database');
resetDatabase();

const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');

const now = new Date('2026-09-22T12:00:00+07:00');
const audit = EventTemporalLifecycleEngine.auditHistoricalEvents(now);

console.log('================================================================');
console.log(`TIKUM EVENT TEMPORAL INTEGRITY AUDIT REPORT`);
console.log(`Evaluated At: ${audit.audit_time}`);
console.log(`Total Events Audited: ${audit.total_audited}`);
console.log(`Expired Events: ${audit.expired_count}`);
console.log(`Status Mismatches: ${audit.mismatched_count}`);
console.log('================================================================\n');

console.log(
  '| Event ID'.padEnd(32) +
  '| Event Name'.padEnd(35) +
  '| City'.padEnd(14) +
  '| End Datetime'.padEnd(28) +
  '| Status'.padEnd(16) +
  '| Upcoming? |'
);
console.log('-'.repeat(135));

for (const item of audit.report) {
  let isUpStr = item.homepage_visibility ? 'YES' : 'NO';
  if (item.is_past && item.homepage_visibility) {
    isUpStr = 'LEAK!';
  } else if (item.is_past && !item.homepage_visibility) {
    isUpStr = 'NO (ARCHIVED)';
  }
  console.log(
    `| ${item.event_id.padEnd(30)}` +
    `| ${(item.event_name || '').substring(0, 32).padEnd(33)}` +
    `| ${(item.city || '').padEnd(12)}` +
    `| ${(item.event_end_at || '').padEnd(26)}` +
    `| ${(item.computed_status || '').padEnd(14)}` +
    `| ${isUpStr.padEnd(14)} |`
  );
}

console.log('\n================================================================');
console.log('AUDIT SUMMARY:');
const pastLeaks = audit.report.filter(r => r.is_past && r.homepage_visibility);
if (pastLeaks.length === 0) {
  console.log('✅ ZERO EXPIRED EVENTS LEAKING INTO HOMEPAGE/UPCOMING.');
} else {
  console.log(`❌ DANGER: ${pastLeaks.length} EXPIRED EVENTS ARE LEAKING INTO UPCOMING!`);
}
console.log('================================================================');
