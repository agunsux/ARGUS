/**
 * TIKUM / ARGUS — Zero-Wrong-Date Forensics & Ingestion Test Suite
 * 
 * Verifies:
 * 1. Source parsing & ingestion (@love_gbk, tiket.com, loket.com, goersapp.com)
 * 2. Deterministic Calendar & Date Validity (Leap years, 30-day months, impossible dates like Feb 30)
 * 3. Ambiguous Numerical Format Rejection (03/04/2027 quarantine)
 * 4. Ticket Sales Period vs Concert Date Disambiguation (presale rejection)
 * 5. Mandatory Section 5 Historical Tour Regressions:
 *    - Scenario 1: Coldplay Music of the Spheres (2026-11-15) -> REJECTED (HISTORICAL_TOUR_CONFLICT)
 *    - Scenario 2: Sheila on 7 Tunggu Aku Di Jakarta (2026-11-20) -> REJECTED (HISTORICAL_TOUR_CONFLICT)
 *    - Scenario 3: Sheila on 7 Tunggu Aku Di Bandung (2026-11-27) -> REJECTED (HISTORICAL_TOUR_CONFLICT)
 *    - Scenario 4: Multi-city tour stops (Jakarta vs Bandung) -> NEVER merge or swap dates
 *    - Scenario 5: Event with date 2026-02-30 -> REJECTED (INVALID_CALENDAR_DATE)
 *    - Scenario 6: Ambiguous date format 03/04/2027 -> REJECTED (AMBIGUOUS_DATE_FORMAT)
 *    - Scenario 7: Ticket sales announcement disguised as event date -> REJECTED (SALES_PERIOD_MISINTERPRETED)
 *    - Scenario 8: Multi-source date conflict for same event -> QUARANTINED (NEEDS_REVIEW)
 *    - Scenario 9: Event completed -> H+2 ARCHIVED -> Non-resurrection guarantee
 *    - Scenario 10: Event discovery run -> Zero ticket inventory, zero ledger entries, zero escrow created
 * 6. Admin intelligence endpoints:
 *    - GET /api/discovery/source-audit
 *    - GET /api/discovery/audit-trail/:eventId
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('./src/server');
const { EventDateForensicsEngine, AUDIT_WINDOW, PUBLICATION_STATES } = require('./src/discovery/EventDateForensicsEngine');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./src/discovery/EventTemporalLifecycleEngine');
const { canonicalRegistry } = require('./src/discovery/CanonicalEventRegistry');
const { sourceRegistry } = require('./src/discovery/SourceRegistry');
const { EventDeduplicationService } = require('./src/discovery/EventDeduplicationService');
const { state } = require('./src/database');

let server;
let baseUrl;
let passedTests = 0;
let failedTests = 0;

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`      Error: ${err.message}`);
    failedTests++;
  }
}

async function runSuite() {
  await new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
    server.on('error', reject);
  });

  console.log('================================================================');
  console.log('TIKUM — ZERO-WRONG-DATE FORENSICS & INGESTION AUDIT SUITE');
  console.log(`Audit Window: ${AUDIT_WINDOW.START} to ${AUDIT_WINDOW.END} (WIB)`);
  console.log('================================================================\n');

  console.log('── Section 1: Deterministic Calendar & Date Parsing Forensics ──');

  await test('Calendar: Correctly calculates leap year days for February', () => {
    assert.strictEqual(EventDateForensicsEngine.isLeapYear(2024), true);
    assert.strictEqual(EventDateForensicsEngine.isLeapYear(2026), false);
    assert.strictEqual(EventDateForensicsEngine.isLeapYear(2028), true);
    assert.strictEqual(EventDateForensicsEngine.isLeapYear(2000), true);
    assert.strictEqual(EventDateForensicsEngine.isLeapYear(1900), false);

    assert.strictEqual(EventDateForensicsEngine.getDaysInMonth(2024, 2), 29);
    assert.strictEqual(EventDateForensicsEngine.getDaysInMonth(2026, 2), 28);
    assert.strictEqual(EventDateForensicsEngine.getDaysInMonth(2026, 4), 30);
    assert.strictEqual(EventDateForensicsEngine.getDaysInMonth(2026, 11), 30);
    assert.strictEqual(EventDateForensicsEngine.getDaysInMonth(2026, 12), 31);
  });

  await test('Calendar: Scenario 5 — Rejects impossible calendar dates (e.g. 2026-02-30 or 2026-04-31)', () => {
    const resFeb30 = EventDateForensicsEngine.parseAndValidateDate('2026-02-30');
    assert.strictEqual(resFeb30.is_valid, false);
    assert.ok(resFeb30.rejection_reason.includes('INVALID_CALENDAR_DATE'));

    const resApr31 = EventDateForensicsEngine.parseAndValidateDate('2026-04-31');
    assert.strictEqual(resApr31.is_valid, false);
    assert.ok(resApr31.rejection_reason.includes('INVALID_CALENDAR_DATE'));

    const resTextFeb30 = EventDateForensicsEngine.parseAndValidateDate('30 Februari 2026');
    assert.strictEqual(resTextFeb30.is_valid, false);
    assert.ok(resTextFeb30.rejection_reason.includes('INVALID_CALENDAR_DATE'));
  });

  await test('Calendar: Scenario 6 — Rejects ambiguous date formats (e.g. 03/04/2027)', () => {
    const resAmbiguous = EventDateForensicsEngine.parseAndValidateDate('03/04/2027');
    assert.strictEqual(resAmbiguous.is_valid, false);
    assert.strictEqual(resAmbiguous.is_ambiguous, true);
    assert.ok(resAmbiguous.rejection_reason.includes('AMBIGUOUS_DATE_FORMAT'));

    // Unambiguous: 25/11/2026 (day 25 > 12)
    const resUnambiguous = EventDateForensicsEngine.parseAndValidateDate('25/11/2026');
    assert.strictEqual(resUnambiguous.is_valid, true);
    assert.strictEqual(resUnambiguous.normalized_date, '2026-11-25');
  });

  await test('Calendar: Scenario 7 — Disambiguates Ticket Sales/War from Event Date', () => {
    const presaleInputs = [
      'Presale ticket war mulai 15 November 2026',
      'General public sale starts 20 Nov 2026',
      'War tiket dibuka 01 Desember 2026'
    ];

    for (const inp of presaleInputs) {
      const res = EventDateForensicsEngine.parseAndValidateDate(inp);
      assert.strictEqual(res.is_valid, false);
      assert.strictEqual(res.is_sales_date, true);
      assert.ok(res.rejection_reason.includes('SALES_PERIOD_MISINTERPRETED'));
    }
  });

  await test('Calendar: Parses Indonesian and English textual dates accurately', () => {
    const resID = EventDateForensicsEngine.parseAndValidateDate('21 November 2026');
    assert.strictEqual(resID.is_valid, true);
    assert.strictEqual(resID.normalized_date, '2026-11-21');

    const resEN = EventDateForensicsEngine.parseAndValidateDate('Jan 16, 2027');
    assert.strictEqual(resEN.is_valid, true);
    assert.strictEqual(resEN.normalized_date, '2027-01-16');
  });

  console.log('\n── Section 2: Historical Tour Regression Prevention (Section 5 Scenarios) ──');

  await test('Regression 1: Coldplay Music of the Spheres (2026-11-15) -> REJECTED (HISTORICAL_TOUR_CONFLICT)', () => {
    const coldplayRecord = {
      name: 'Coldplay: Music of the Spheres Jakarta',
      artist: 'Coldplay',
      event_date: '2026-11-15',
      source_url: null
    };

    const conflict = EventDateForensicsEngine.checkHistoricalTourConflict(coldplayRecord);
    assert.strictEqual(conflict.is_historical_conflict, true);
    assert.ok(conflict.rejection_reason.includes('HISTORICAL_TOUR_CONFLICT'));
    assert.strictEqual(conflict.historical_record.concluded_date, '2023-11-15');

    // In lifecycle engine, must NEVER be upcoming or homepage eligible
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(coldplayRecord), false);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(coldplayRecord), false);
  });

  await test('Regression 2: Sheila on 7 Tunggu Aku Di Jakarta (2026-11-20) -> REJECTED (HISTORICAL_TOUR_CONFLICT)', () => {
    const so7Jakarta = {
      name: 'Sheila on 7: Tunggu Aku Di Jakarta',
      artist: 'Sheila on 7',
      event_date: '2026-11-20',
      source_url: null
    };

    const conflict = EventDateForensicsEngine.checkHistoricalTourConflict(so7Jakarta);
    assert.strictEqual(conflict.is_historical_conflict, true);
    assert.ok(conflict.rejection_reason.includes('HISTORICAL_TOUR_CONFLICT'));
    assert.strictEqual(conflict.historical_record.concluded_date, '2023-01-28');

    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(so7Jakarta), false);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(so7Jakarta), false);
  });

  await test('Regression 3: Sheila on 7 Tunggu Aku Di Bandung (2026-11-27) -> REJECTED (HISTORICAL_TOUR_CONFLICT)', () => {
    const so7Bandung = {
      name: 'Sheila on 7: Tunggu Aku Di Bandung',
      artist: 'Sheila on 7',
      event_date: '2026-11-27',
      source_url: null
    };

    const conflict = EventDateForensicsEngine.checkHistoricalTourConflict(so7Bandung);
    assert.strictEqual(conflict.is_historical_conflict, true);
    assert.ok(conflict.rejection_reason.includes('HISTORICAL_TOUR_CONFLICT'));
    assert.strictEqual(conflict.historical_record.concluded_date, '2024-09-28');

    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(so7Bandung), false);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(so7Bandung), false);
  });

  await test('Regression 4: Multi-city tour stops (Jakarta vs Bandung) must NEVER merge or swap dates', () => {
    const tourJakarta = {
      event_id: 'ev-so7-jkt-leg',
      title: 'Sheila On 7 Tour 2027',
      canonical_name: 'Sheila On 7 Tour 2027',
      artist: 'Sheila On 7',
      start_date: '2027-01-10',
      venue_name: 'JIExpo Kemayoran',
      city: 'Jakarta'
    };

    const tourBandung = {
      event_id: 'ev-so7-bdg-leg',
      title: 'Sheila On 7 Tour 2027',
      canonical_name: 'Sheila On 7 Tour 2027',
      artist: 'Sheila On 7',
      start_date: '2027-01-17',
      venue_name: 'Stadion Siliwangi',
      city: 'Bandung'
    };

    const dupCheck = EventDeduplicationService.findDuplicateCandidate(tourBandung, [tourJakarta]);
    assert.strictEqual(dupCheck.isMatch, false, 'Multi-city stops must NOT be flagged as duplicate or merged');
  });

  await test('Regression 8: Multi-source date conflict for same event -> QUARANTINED (NEEDS_REVIEW)', () => {
    const existing = [
      {
        source_id: 'src-loket',
        source_name: 'Loket.com',
        source_event_date_text: '2026-12-11',
        source_venue_text: 'JIExpo Kemayoran'
      }
    ];

    const conflictingIncoming = {
      source_id: 'src-unverified-blog',
      source_name: 'Music Blog X',
      source_event_date_text: '2026-12-18', // Conflicting date!
      source_venue_text: 'JIExpo Kemayoran'
    };

    const conflict = EventDateForensicsEngine.detectSourceConflicts(existing, conflictingIncoming);
    assert.strictEqual(conflict.has_conflict, true);
    assert.strictEqual(conflict.conflicts[0].type, 'DATE_CONFLICT');
    assert.strictEqual(conflict.conflicts[0].severity, 'HIGH_QUARANTINE_REQUIRED');

    // Contract evaluation on conflicting record results in NEEDS_REVIEW
    const contract = EventDateForensicsEngine.evaluateAndBuildContract(
      {
        event_name: 'DWP 2026',
        event_date: '2026-12-18',
        venue_name: 'JIExpo Kemayoran',
        source_url: 'https://blog.example.com/dwp-dates'
      },
      {
        source_id: 'src-unverified-blog',
        source_name: 'Blog',
        source_type: 'BLOG',
        tier: 4
      },
      { existingObservations: existing }
    );

    assert.strictEqual(contract.event_status, PUBLICATION_STATES.NEEDS_REVIEW);
    assert.strictEqual(contract.is_upcoming_eligible, false);
    assert.strictEqual(contract.review_required, true);
  });

  await test('Regression 9: Completed Event -> H+2 ARCHIVED -> Irreversible Non-Resurrection', async () => {
    const concludedEvent = {
      id: 'ev-test-concluded-001',
      canonical_name: 'Concluded Test Concert 2026',
      start_date: '2026-11-01',
      start_datetime: '2026-11-01T19:00:00+07:00',
      end_date: '2026-11-01',
      end_datetime: '2026-11-01T23:00:00+07:00',
      archive_status: 'ARCHIVED',
      lifecycle_status: 'ARCHIVED',
      status: 'ARCHIVED',
      is_verified: true
    };

    // Attempt to reconcile at current date (Nov 12, past H+2)
    const reconciled = await EventTemporalLifecycleEngine.reconcileEvent(concludedEvent, new Date('2026-11-12T12:00:00+07:00'));
    assert.strictEqual(concludedEvent.archive_status, 'ARCHIVED');
    assert.strictEqual(concludedEvent.lifecycle_status, 'ARCHIVED');
    assert.strictEqual(concludedEvent.public_visibility, false);
    assert.strictEqual(concludedEvent.homepage_visibility, false);

    // Event must NEVER be upcoming
    assert.strictEqual(EventTemporalLifecycleEngine.isEventUpcoming(concludedEvent), false);
    assert.strictEqual(EventTemporalLifecycleEngine.isEventHomepageEligible(concludedEvent), false);
  });

  await test('Regression 10: Marketplace Safety Assertion (Zero Side Effects)', () => {
    const initialListingsCount = (state.listings || []).length;
    const initialLedgerCount = (state.ledger_entries || []).length;
    const initialEscrowCount = (state.escrows || []).length;

    // Run contract evaluation for an event
    const contract = EventDateForensicsEngine.evaluateAndBuildContract(
      {
        event_name: 'Lomba Sihir – Konser Ujung Dunia',
        event_date: '2026-11-21',
        venue_name: 'Basket Hall GBK',
        source_url: 'https://www.instagram.com/love_gbk/'
      },
      {
        source_id: 'src-venue-love-gbk-instagram',
        source_name: '@love_gbk',
        source_type: 'OFFICIAL_VENUE_WEB',
        tier: 1
      }
    );

    assert.strictEqual(contract.is_upcoming_eligible, true);
    assert.strictEqual((state.listings || []).length, initialListingsCount, 'Zero ticket listings must be created');
    assert.strictEqual((state.ledger_entries || []).length, initialLedgerCount, 'Zero ledger entries must be created');
    assert.strictEqual((state.escrows || []).length, initialEscrowCount, 'Zero escrows must be created');
  });

  console.log('\n── Section 3: Verified Primary Source Ingestion & Registry ──');

  await test('SourceRegistry: Registers @love_gbk as Tier 1 Primary Authority', () => {
    const loveGbk = sourceRegistry.getSource('src-venue-love-gbk-instagram');
    assert.ok(loveGbk, '@love_gbk must be registered in SourceRegistry');
    assert.strictEqual(loveGbk.tier, 1);
    assert.strictEqual(loveGbk.source_type, 'OFFICIAL_VENUE_WEB');
    assert.strictEqual(loveGbk.authority_level, 'HIGH');
  });

  await test('Contract: 24-Field Zero-Wrong-Date Contract Generation with Audit Trail', () => {
    const rawPayload = {
      canonical_event_id: 'ev-can-lomba-sihir-2026',
      event_name: 'Lomba Sihir – Konser Ujung Dunia',
      artist_or_performer: 'Lomba Sihir',
      event_date: '2026-11-21',
      event_start_time: '19:00',
      timezone: 'Asia/Jakarta',
      venue_name: 'Basket Hall GBK',
      city: 'Jakarta',
      organizer_or_promoter: 'Sun Eater'
    };

    const sourceRecord = {
      source_id: 'src-venue-love-gbk-instagram',
      source_name: '@love_gbk',
      source_type: 'OFFICIAL_VENUE_WEB',
      source_url: 'https://www.instagram.com/love_gbk/',
      tier: 1
    };

    const contract = EventDateForensicsEngine.evaluateAndBuildContract(rawPayload, sourceRecord);
    assert.strictEqual(contract.date_verification_status, 'VERIFIED');
    assert.strictEqual(contract.venue_verification_status, 'VERIFIED');
    assert.strictEqual(contract.event_status, PUBLICATION_STATES.VERIFIED);
    assert.strictEqual(contract.is_upcoming_eligible, true);
    assert.ok(contract.evidence_snapshot.evidence_hash);

    const trail = EventDateForensicsEngine.generateAuditTrail(contract);
    assert.strictEqual(trail.stage_1_original_source.source_id, 'src-venue-love-gbk-instagram');
    assert.strictEqual(trail.stage_2_extracted_data.raw_date_text, '2026-11-21');
    assert.strictEqual(trail.stage_3_normalized_data.normalized_date, '2026-11-21');
    assert.strictEqual(trail.stage_4_verification.date_status, 'VERIFIED');
    assert.strictEqual(trail.stage_5_canonical_event.status, PUBLICATION_STATES.VERIFIED);
    assert.strictEqual(trail.stage_6_publication.is_published_to_upcoming, true);
  });

  console.log('\n── Section 4: Public & Admin Endpoints Verification ──');

  await test('Endpoint: GET /api/discovery/source-audit returns per-source audit counts', async () => {
    const res = await request('/api/discovery/source-audit');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.primary_sources['src-venue-love-gbk-instagram']);
    assert.ok(res.body.primary_sources['src-tiket']);
    assert.ok(res.body.primary_sources['src-loket']);
    assert.ok(res.body.primary_sources['src-goers']);
    assert.strictEqual(res.body.summary.zero_wrong_date_enforcement, 'ACTIVE');
  });

  await test('Endpoint: GET /api/discovery/audit-trail/:eventId returns 6-stage audit trail', async () => {
    // Ingest sample into canonicalRegistry
    canonicalRegistry.createEvent({
      id: 'bts-world-tour-arirang-jakarta-2026',
      canonical_name: 'BTS WORLD TOUR ARIRANG IN JAKARTA',
      artist: 'BTS',
      start_date: '2026-12-26',
      venue_name: 'GBK Main Stadium',
      city: 'Jakarta',
      official_ticket_url: 'https://www.tiket.com/en-id/to-do/bts-jakarta-day1',
      official_ticketing_provider: 'TIKET_COM',
      is_verified: true,
      verification_status: 'PRIMARY_SOURCE_VERIFIED'
    });

    const res = await request('/api/discovery/audit-trail/bts-world-tour-arirang-jakarta-2026');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.canonical_event_id, 'bts-world-tour-arirang-jakarta-2026');
    assert.strictEqual(res.body.is_published_to_upcoming, true);
    assert.ok(res.body.audit_trail.stage_1_original_source);
    assert.ok(res.body.audit_trail.stage_6_publication);
  });

  await test('Endpoint: Public Upcoming Feed does NOT contain phantom Sheila on 7 or Coldplay 2026', async () => {
    const feedRes = await request('/api/events/home-feed?now=2026-11-12T12:00:00%2B07:00');
    assert.strictEqual(feedRes.status, 200);

    const allFeedEvents = [
      ...(feedRes.body.sections?.today || []),
      ...(feedRes.body.sections?.upcoming || []),
      ...(feedRes.body.events || [])
    ];

    const hasColdplay = allFeedEvents.some(e => (e.title || e.canonical_name || '').toLowerCase().includes('coldplay'));
    assert.strictEqual(hasColdplay, false, 'Coldplay must NEVER appear in public upcoming feed');

    const hasPhantomSheila = allFeedEvents.some(e => {
      const name = (e.title || e.canonical_name || '').toLowerCase();
      return name.includes('sheila on 7') && (e.id === 'ev-can-4263d6ff' || e.id === 'ev-can-8c07f8fe' || name.includes('tunggu aku di'));
    });
    assert.strictEqual(hasPhantomSheila, false, 'Phantom Sheila on 7 records must NEVER appear in upcoming feed');
  });

  console.log('\n================================================================');
  console.log(`ZERO-WRONG-DATE FORENSICS SUITE: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (server) {
    server.close();
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
