const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/fixtures/official_event_snapshot.json', 'utf8'));
const { EventDeduplicationService } = require('c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/EventDeduplicationService');
const { EventTemporalLifecycleEngine } = require('c:/Users/RYZEN/.antigravity-ide/ARGUS/src/discovery/EventTemporalLifecycleEngine');

const allRecords = [...(snap.records || []), ...(snap.discovery_only_records || [])];
console.log('Total records:', allRecords.length);

const now = new Date('2026-10-26T03:00:00+07:00');
let upcoming = 0;
let past = 0;
let invalidDate = 0;

allRecords.forEach((r, i) => {
  const d = r.start_date || (r.start_datetime ? r.start_datetime.substring(0, 10) : null);
  const isValid = d && !isNaN(new Date(d).getTime());
  const name = r.title || r.name;
  if (!isValid) {
    invalidDate++;
    console.log('[INVALID DATE] #' + i + ': ' + name);
  } else {
    const isUp = EventTemporalLifecycleEngine.isEventUpcoming(r, now);
    if (isUp) upcoming++;
    else past++;
    console.log('[' + (isUp ? 'UPCOMING' : 'PAST    ') + '] ' + d + ' | ' + name + ' (' + r.city + ')');
  }
});

console.log('\nSummary:');
console.log('Upcoming:', upcoming);
console.log('Past:    ', past);
console.log('Invalid: ', invalidDate);
