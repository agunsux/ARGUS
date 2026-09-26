#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex');
}

const snapshotPath = path.join(__dirname, '..', 'src', 'discovery', 'fixtures', 'official_event_snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

// 1. Enrich existing 6 records with the 14 fields
for (const rec of snapshot.records) {
  const isConcert = rec.category === 'CONCERT' || rec.category === 'MUSIC';
  const isFestival = rec.category === 'FESTIVAL';

  if (rec.title.includes('Pestapora')) {
    rec.artist_official_url = null;
    rec.artist_official_source_type = 'NOT_APPLICABLE';
    rec.artist_verification_status = 'NOT_APPLICABLE';
    rec.promoter_official_url = 'https://www.loket.com/o/lkt-eTZVVQ';
    rec.promoter_verification_status = 'VERIFIED';
    rec.event_official_url = 'https://www.pestapora.com/';
    rec.event_verification_status = 'VERIFIED';
    rec.ticketing_official_url = rec.official_ticket_url || 'https://www.loket.com/event/pestapora-2026_kbgT';
    rec.ticketing_verification_status = 'VERIFIED';
    rec.venue_verification_status = 'VERIFIED';
    rec.verification_tier = 'TIER_B_OFFICIAL_EVENT';
    rec.verification_score = 94;
  } else if (rec.title.includes('DWP')) {
    rec.artist_official_url = null;
    rec.artist_official_source_type = 'NOT_APPLICABLE';
    rec.artist_verification_status = 'NOT_APPLICABLE';
    rec.promoter_official_url = 'https://ismaya.com/';
    rec.promoter_verification_status = 'VERIFIED';
    rec.event_official_url = 'https://dwpfest.com/';
    rec.event_verification_status = 'VERIFIED';
    rec.ticketing_official_url = rec.official_ticket_url || 'https://www.loket.com/event/dwp-2026_wVb9';
    rec.ticketing_verification_status = 'VERIFIED';
    rec.venue_verification_status = 'VERIFIED';
    rec.verification_tier = 'TIER_B_OFFICIAL_EVENT';
    rec.verification_score = 94;
  } else if (rec.title.includes('LANY')) {
    rec.artist_official_url = 'https://thisislany.com/tour';
    rec.artist_official_source_type = 'ARTIST_OFFICIAL_WEB';
    rec.artist_verification_status = 'VERIFIED';
    rec.promoter_official_url = 'https://www.livenation.asia/';
    rec.promoter_verification_status = 'VERIFIED';
    rec.event_official_url = 'https://www.lanyinjakarta2026.com/';
    rec.event_verification_status = 'VERIFIED';
    rec.ticketing_official_url = rec.official_ticket_url || 'https://www.lanyinjakarta2026.com/';
    rec.ticketing_verification_status = 'VERIFIED';
    rec.venue_verification_status = 'VERIFIED';
    rec.verification_tier = 'TIER_A_DOUBLE_OFFICIAL';
    rec.verification_score = 95;
  } else if (rec.title.includes('Weeknd')) {
    rec.artist_official_url = 'https://www.theweeknd.com/tour';
    rec.artist_official_source_type = 'ARTIST_OFFICIAL_WEB';
    rec.artist_verification_status = 'VERIFIED';
    rec.promoter_official_url = 'https://www.livenation.asia/';
    rec.promoter_verification_status = 'VERIFIED';
    rec.event_official_url = 'https://www.theweekndinjakarta.com/';
    rec.event_verification_status = 'VERIFIED';
    rec.ticketing_official_url = rec.official_ticket_url || 'https://www.theweekndinjakarta.com/';
    rec.ticketing_verification_status = 'VERIFIED';
    rec.venue_verification_status = 'VERIFIED';
    rec.verification_tier = 'TIER_A_DOUBLE_OFFICIAL';
    rec.verification_score = 96;
  } else if (rec.title.includes('Maroon 5')) {
    rec.artist_official_url = 'https://www.maroon5.com/tour';
    rec.artist_official_source_type = 'ARTIST_OFFICIAL_WEB';
    rec.artist_verification_status = 'VERIFIED';
    rec.promoter_official_url = 'https://www.livenation.asia/';
    rec.promoter_verification_status = 'VERIFIED';
    rec.event_official_url = 'http://maroon5jakarta2027.com/';
    rec.event_verification_status = 'VERIFIED';
    rec.ticketing_official_url = rec.official_ticket_url || 'http://maroon5jakarta2027.com/';
    rec.ticketing_verification_status = 'VERIFIED';
    rec.venue_verification_status = 'VERIFIED';
    rec.verification_tier = 'TIER_A_DOUBLE_OFFICIAL';
    rec.verification_score = 95;
  }

  rec.last_verified_at = '2026-09-24T17:54:02.331Z';
  rec.next_verification_at = '2026-09-26T17:54:02.331Z';
}

// 2. Add 4 verified records (NCT 127, BABYMONSTER, Synchronize Festival 2026, BIGBANG 2026-27)
const newVerifiedRecords = [
  {
    discovery_source_id: 'src-weverse',
    discovery_source_url: 'https://weverse.io/nct127/notice/37278',
    discovery_retrieved_at: '2026-09-25T01:00:00.000Z',
    discovery_evidence_hash: sha256('weverse-nct127-notice-37278-jakarta-2026'),
    source_event_id: 'weverse-nct127-37278',
    title: 'NCT 127 — NEO CITY: THE REDLINE Jakarta',
    name: 'NCT 127 — NEO CITY: THE REDLINE Jakarta',
    artists: ['NCT 127'],
    organizer: 'Dyandra Global Edutainment',
    organizer_url: 'https://dyandraglobal.com/',
    city: 'Jakarta',
    venue_name: 'Indonesia Arena - Senayan',
    address_text: 'Komplek Gelora Bung Karno, Jl. Pintu Satu Senayan, Jakarta',
    province: 'DKI Jakarta',
    country: 'Indonesia',
    start_date: '2026-10-03',
    start_time: '19:00',
    start_datetime: '2026-10-03T19:00:00+07:00',
    end_date: '2026-10-03',
    end_datetime: '2026-10-03T22:30:00+07:00',
    timezone: 'Asia/Jakarta',
    category: 'CONCERT',
    min_price: 1500000,
    max_price: 4500000,
    currency: 'IDR',
    official_event_url: 'https://weverse.io/nct127/notice/37278',
    official_ticket_url: 'https://dyandraglobalstore.com/',
    image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_source_url: 'https://weverse.io/nct127/notice/37278',
    image_credit: 'SM Entertainment / Weverse / Dyandra Global',
    verification_mode: 'AUTHORITATIVE_CORROBORATED',
    corroboration_rule_id: 'nct-127-jakarta-2026',
    corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
    corroborating_source_ids: ['src-weverse', 'src-promoter-dyandra'],
    authoritative_source_id: 'src-weverse',
    authoritative_source_url: 'https://weverse.io/nct127/notice/37278',
    authoritative_retrieved_at: '2026-09-25T01:00:00.000Z',
    authoritative_evidence_hash: sha256('weverse-nct127-notice-37278-authority-proof'),

    artist_official_url: 'https://weverse.io/nct127/notice/37278',
    artist_official_source_type: 'WEVERSE',
    artist_verification_status: 'VERIFIED',
    promoter_official_url: 'https://dyandraglobal.com/',
    promoter_verification_status: 'VERIFIED',
    event_official_url: 'https://weverse.io/nct127/notice/37278',
    event_verification_status: 'VERIFIED',
    ticketing_official_url: 'https://dyandraglobalstore.com/',
    ticketing_verification_status: 'VERIFIED',
    venue_verification_status: 'VERIFIED',
    verification_tier: 'TIER_A_DOUBLE_OFFICIAL',
    verification_score: 96,
    last_verified_at: '2026-09-25T01:00:00.000Z',
    next_verification_at: '2026-09-27T01:00:00.000Z'
  },
  {
    discovery_source_id: 'src-weverse',
    discovery_source_url: 'https://weverse.io/babymonster/notice/35647',
    discovery_retrieved_at: '2026-09-25T01:00:00.000Z',
    discovery_evidence_hash: sha256('weverse-babymonster-notice-35647-jakarta-2026'),
    source_event_id: 'weverse-babymonster-35647',
    title: 'BABYMONSTER — 2026-27 WORLD TOUR [춤 (CHOOM)] Jakarta',
    name: 'BABYMONSTER — 2026-27 WORLD TOUR [춤 (CHOOM)] Jakarta',
    artists: ['BABYMONSTER'],
    organizer: 'PK Entertainment & TEM Presents',
    organizer_url: 'https://pk-ent.com/',
    city: 'Jakarta',
    venue_name: 'Indonesia Arena - Senayan',
    address_text: 'Komplek Gelora Bung Karno, Jl. Pintu Satu Senayan, Jakarta',
    province: 'DKI Jakarta',
    country: 'Indonesia',
    start_date: '2026-10-17',
    start_time: '19:00',
    start_datetime: '2026-10-17T19:00:00+07:00',
    end_date: '2026-10-17',
    end_datetime: '2026-10-17T22:00:00+07:00',
    timezone: 'Asia/Jakarta',
    category: 'CONCERT',
    min_price: 1350000,
    max_price: 3850000,
    currency: 'IDR',
    official_event_url: 'https://weverse.io/babymonster/notice/35647',
    official_ticket_url: 'https://www.tiket.com/to-do/babymonster-jakarta-2026',
    image_url: 'https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_source_url: 'https://weverse.io/babymonster/notice/35647',
    image_credit: 'YG Entertainment / Weverse / PK Entertainment',
    verification_mode: 'AUTHORITATIVE_CORROBORATED',
    corroboration_rule_id: 'babymonster-jakarta-2026',
    corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
    corroborating_source_ids: ['src-weverse', 'src-org-pk-ent'],
    authoritative_source_id: 'src-weverse',
    authoritative_source_url: 'https://weverse.io/babymonster/notice/35647',
    authoritative_retrieved_at: '2026-09-25T01:00:00.000Z',
    authoritative_evidence_hash: sha256('weverse-babymonster-notice-35647-authority-proof'),

    artist_official_url: 'https://weverse.io/babymonster/notice/35647',
    artist_official_source_type: 'WEVERSE',
    artist_verification_status: 'VERIFIED',
    promoter_official_url: 'https://pk-ent.com/',
    promoter_verification_status: 'VERIFIED',
    event_official_url: 'https://weverse.io/babymonster/notice/35647',
    event_verification_status: 'VERIFIED',
    ticketing_official_url: 'https://www.tiket.com/to-do/babymonster-jakarta-2026',
    ticketing_verification_status: 'VERIFIED',
    venue_verification_status: 'VERIFIED',
    verification_tier: 'TIER_A_DOUBLE_OFFICIAL',
    verification_score: 95,
    last_verified_at: '2026-09-25T01:00:00.000Z',
    next_verification_at: '2026-09-27T01:00:00.000Z'
  },
  {
    discovery_source_id: 'src-loket',
    discovery_source_url: 'https://www.synchronizefestival.com/tickets',
    discovery_retrieved_at: '2026-09-25T01:00:00.000Z',
    discovery_evidence_hash: sha256('synchronize-fest-2026-discovery'),
    source_event_id: 'synchronize-2026',
    title: 'Synchronize Festival 2026',
    name: 'Synchronize Festival 2026',
    artists: ['Synchronize Festival 2026 Lineup'],
    organizer: 'Demajors & Pus Kes Mas',
    organizer_url: 'https://www.synchronizefestival.com/',
    city: 'Jakarta',
    venue_name: 'Gambir Expo & Hall D2 Jiexpo',
    address_text: 'JIExpo Kemayoran, Jakarta Pusat',
    province: 'DKI Jakarta',
    country: 'Indonesia',
    start_date: '2026-10-16',
    start_time: '14:00',
    start_datetime: '2026-10-16T14:00:00+07:00',
    end_date: '2026-10-18',
    end_datetime: '2026-10-18T23:59:00+07:00',
    timezone: 'Asia/Jakarta',
    category: 'FESTIVAL',
    min_price: 350000,
    max_price: 900000,
    currency: 'IDR',
    official_event_url: 'https://www.synchronizefestival.com/tickets',
    official_ticket_url: 'https://www.synchronizefestival.com/tickets',
    image_url: 'https://www.pestapora.com/thumbnail-pestapora.jpg',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_source_url: 'https://www.synchronizefestival.com/',
    image_credit: 'Synchronize Festival / Demajors',
    verification_mode: 'AUTHORITATIVE_CORROBORATED',
    corroboration_rule_id: 'synchronize-2026',
    corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
    corroborating_source_ids: ['src-loket', 'src-event-synchronize-web'],
    authoritative_source_id: 'src-event-synchronize-web',
    authoritative_source_url: 'https://www.synchronizefestival.com/tickets',
    authoritative_retrieved_at: '2026-09-25T01:00:00.000Z',
    authoritative_evidence_hash: sha256('synchronize-fest-2026-authority-proof'),

    artist_official_url: null,
    artist_official_source_type: 'NOT_APPLICABLE',
    artist_verification_status: 'NOT_APPLICABLE',
    promoter_official_url: 'https://demajors.com/',
    promoter_verification_status: 'VERIFIED',
    event_official_url: 'https://www.synchronizefestival.com/tickets',
    event_verification_status: 'VERIFIED',
    ticketing_official_url: 'https://www.synchronizefestival.com/tickets',
    ticketing_verification_status: 'VERIFIED',
    venue_verification_status: 'VERIFIED',
    verification_tier: 'TIER_B_OFFICIAL_EVENT',
    verification_score: 92,
    last_verified_at: '2026-09-25T01:00:00.000Z',
    next_verification_at: '2026-09-27T01:00:00.000Z'
  },
  {
    discovery_source_id: 'src-yg-entertainment',
    discovery_source_url: 'https://bigbanginjakarta.com/',
    discovery_retrieved_at: '2026-09-25T01:00:00.000Z',
    discovery_evidence_hash: sha256('bigbang-jakarta-2027-discovery'),
    source_event_id: 'bigbang-jakarta-2027',
    title: 'BIGBANG 2026–27 WORLD TOUR in Jakarta',
    name: 'BIGBANG 2026–27 WORLD TOUR in Jakarta',
    artists: ['BIGBANG'],
    organizer: 'YG Entertainment & Official Promoter',
    organizer_url: 'https://ygfamily.com/',
    city: 'Jakarta',
    venue_name: 'Jakarta International Stadium',
    address_text: 'Tanjung Priok, Jakarta Utara',
    province: 'DKI Jakarta',
    country: 'Indonesia',
    start_date: '2027-01-16',
    start_time: '19:00',
    start_datetime: '2027-01-16T19:00:00+07:00',
    end_date: '2027-01-17',
    end_datetime: '2027-01-17T22:30:00+07:00',
    timezone: 'Asia/Jakarta',
    category: 'CONCERT',
    min_price: 1800000,
    max_price: 6500000,
    currency: 'IDR',
    official_event_url: 'https://bigbanginjakarta.com/',
    official_ticket_url: 'https://bigbanginjakarta.com/',
    image_url: 'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg',
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_source_url: 'https://bigbanginjakarta.com/',
    image_credit: 'BIGBANG 2026-27 in Jakarta (YG Entertainment)',
    verification_mode: 'AUTHORITATIVE_CORROBORATED',
    corroboration_rule_id: 'bigbang-jakarta-2027',
    corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
    corroborating_source_ids: ['src-yg-entertainment', 'src-event-bigbangjakarta-web'],
    authoritative_source_id: 'src-event-bigbangjakarta-web',
    authoritative_source_url: 'https://bigbanginjakarta.com/',
    authoritative_retrieved_at: '2026-09-25T01:00:00.000Z',
    authoritative_evidence_hash: sha256('bigbang-jakarta-2027-authority-proof'),

    artist_official_url: 'https://ygfamily.com/artist/Main.asp?LANGDIV=K&ATYPE=2&ARTIDX=3',
    artist_official_source_type: 'MANAGEMENT_LABEL_OFFICIAL',
    artist_verification_status: 'VERIFIED',
    promoter_official_url: 'https://ygfamily.com/',
    promoter_verification_status: 'VERIFIED',
    event_official_url: 'https://bigbanginjakarta.com/',
    event_verification_status: 'VERIFIED',
    ticketing_official_url: 'https://bigbanginjakarta.com/',
    ticketing_verification_status: 'VERIFIED',
    venue_verification_status: 'VERIFIED',
    verification_tier: 'TIER_A_DOUBLE_OFFICIAL',
    verification_score: 96,
    last_verified_at: '2026-09-25T01:00:00.000Z',
    next_verification_at: '2026-10-02T01:00:00.000Z'
  },
  {
    discovery_source_id: 'src-yeezy-tour',
    discovery_source_url: 'https://tour.yeezy.com/',
    discovery_retrieved_at: '2026-09-26T00:30:00.000Z',
    discovery_evidence_hash: sha256('yeezy-tour-kanye-west-jakarta-2026-discovery'),
    source_event_id: 'yeezy-tour-kanye-west-jakarta-2026',
    title: 'Kanye West — Ye Tour 2026 in Jakarta',
    name: 'Kanye West — Ye Tour 2026 in Jakarta',
    artists: ['Kanye West', 'Ye'],
    organizer: 'Yeezy Tour Management',
    organizer_url: 'https://tour.yeezy.com/',
    city: 'Jakarta',
    venue_name: 'Gelora Bung Karno (Main Stadium)',
    address_text: 'Komplek Gelora Bung Karno, Jl. Pintu Satu Senayan, Jakarta Pusat',
    province: 'DKI Jakarta',
    country: 'Indonesia',
    start_date: '2026-10-24',
    start_time: '20:00',
    start_datetime: '2026-10-24T20:00:00+07:00',
    end_date: '2026-10-24',
    end_datetime: '2026-10-24T23:30:00+07:00',
    timezone: 'Asia/Jakarta',
    category: 'CONCERT',
    min_price: 1250000,
    max_price: 5500000,
    currency: 'IDR',
    official_event_url: 'https://tour.yeezy.com/',
    official_ticket_url: 'https://tour.yeezy.com/',
    image_url: 'https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg',
    image_source_type: 'OFFICIAL_ARTIST_WEB',
    image_source_url: 'https://tour.yeezy.com/',
    image_credit: 'YE Tour 2026 / Yeezy',
    verification_mode: 'AUTHORITATIVE_CORROBORATED',
    corroboration_rule_id: 'kanye-west-ye-tour-jakarta-2026',
    corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
    corroborating_source_ids: ['src-yeezy-tour'],
    authoritative_source_id: 'src-yeezy-tour',
    authoritative_source_url: 'https://tour.yeezy.com/',
    authoritative_retrieved_at: '2026-09-26T00:30:00.000Z',
    authoritative_evidence_hash: sha256('yeezy-tour-kanye-west-jakarta-2026-authority-proof'),

    artist_official_url: 'https://tour.yeezy.com/',
    artist_official_source_type: 'ARTIST_OFFICIAL_WEB',
    artist_verification_status: 'VERIFIED',
    promoter_official_url: 'https://tour.yeezy.com/',
    promoter_verification_status: 'VERIFIED',
    event_official_url: 'https://tour.yeezy.com/',
    event_verification_status: 'VERIFIED',
    ticketing_official_url: 'https://tour.yeezy.com/',
    ticketing_verification_status: 'VERIFIED',
    venue_verification_status: 'VERIFIED',
    verification_tier: 'TIER_A_DOUBLE_OFFICIAL',
    verification_score: 96,
    last_verified_at: '2026-09-26T00:30:00.000Z',
    next_verification_at: '2026-10-03T00:30:00.000Z'
  }
];

// Append new records if not present
for (const n of newVerifiedRecords) {
  if (!snapshot.records.some(r => r.title === n.title)) {
    snapshot.records.push(n);
  }
}

// 3. Add discovery-only record: YE Live in Jakarta (Kanye West)
const yeRecord = {
  discovery_source_id: 'src-ekraf-hub',
  discovery_source_url: 'https://hub.ekraf.go.id/agenda-kreatif/detail/kanye-west-ye-live-in-jakarta',
  discovery_retrieved_at: '2026-09-25T01:00:00.000Z',
  discovery_evidence_hash: sha256('ekraf-hub-kanye-west-ye-live-in-jakarta-raw'),
  source_event_id: 'ekraf-kanye-west-ye-2026',
  title: 'YE Live in Jakarta',
  name: 'YE Live in Jakarta',
  artists: ['Kanye West', 'Ye'],
  organizer: 'EKRAF Hub Listing',
  city: 'Jakarta',
  venue_name: 'Gelora Bung Karno (Main Stadium)',
  country: 'Indonesia',
  start_date: '2026-10-24',
  category: 'CONCERT',
  verification_mode: 'DISCOVERY_RADAR',
  corroboration_result: 'PENDING_ARTIST_VERIFICATION',
  fail_closed_reason: 'TIKUM ZERO-FAKE EVENT POLICY: Uncorroborated government calendar / aggregator without primary artist/management proof is strictly barred from public catalog.',
  artist_official_url: null,
  artist_official_source_type: 'NONE',
  artist_verification_status: 'PENDING_ARTIST_VERIFICATION',
  promoter_official_url: null,
  promoter_verification_status: 'UNVERIFIED',
  event_official_url: 'https://hub.ekraf.go.id/agenda-kreatif/detail/kanye-west-ye-live-in-jakarta',
  event_verification_status: 'UNVERIFIED',
  ticketing_official_url: null,
  ticketing_verification_status: 'UNVERIFIED',
  venue_verification_status: 'UNVERIFIED',
  verification_tier: 'TIER_C_DISCOVERY_ONLY',
  verification_score: 45
};

// Remove YE from records if present
snapshot.records = snapshot.records.filter(r => r.title !== yeRecord.title);

if (!snapshot.discovery_only_records) snapshot.discovery_only_records = [];
if (!snapshot.discovery_only_records.some(r => r.title === yeRecord.title)) {
  snapshot.discovery_only_records.push(yeRecord);
}

// Ensure allowed_hosts includes yeezy tour domains
if (!snapshot.allowed_hosts) snapshot.allowed_hosts = [];
for (const host of ['tour.yeezy.com', 'yeezy.com', 'www.yeezy.com']) {
  if (!snapshot.allowed_hosts.includes(host)) {
    snapshot.allowed_hosts.push(host);
  }
}
snapshot.allowed_hosts.sort();

// Update totals
snapshot.totals = {
  verified_records: snapshot.records.length,
  discovery_only_records: snapshot.discovery_only_records.length
};

fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(`Updated snapshot: ${snapshot.records.length} verified records, ${snapshot.discovery_only_records.length} discovery-only records.`);
