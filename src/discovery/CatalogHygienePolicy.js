'use strict';

const EXCLUDED = new Set(['PAST', 'COMPLETED', 'CANCELLED', 'DIBATALKAN', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS', 'DUPLICATE_MERGED', 'EXPIRED']);
const TERMINAL_STATUSES = Object.freeze(['PAST', 'ARCHIVED', 'DUPLICATE_MERGED', 'CANCELLED', 'COMPLETED']);
const ACTIVE = new Set(['UPCOMING', 'PUBLISHED', 'ON_SALE', 'ACTIVE', 'VERIFIED_ACTIVE']);
const CANONICAL_DATE_OVERRIDES = Object.freeze({
  'event-mcr-jakarta-2026': '2026-11-22',
  'evt_songkick-mcr-jakarta-2026': '2026-11-22',
  'ev-can-afa-id-2026': '2026-08-15'
});
const SUPPRESSED_FALLBACK_IDS = Object.freeze(new Set([
  // Duplicate non-survivors
  'ev-can-36de50c4',
  'evt_bigbang-jakarta-2027',
  'evt_celestix_the_15th_efestaphoria_539',
  // Unverified legacy seed claims & flagged NYE placeholders
  'event-joyland-2026',
  'event-teater-koma-desember-2026',
  'event-tulus-bandung',
  'event-java-jazz-on-the-move-2026',
  'event-big-bang-2026',
  'ev-can-midnight-soul-garden-2027',
  'ev-can-odyssey-nye-2027'
]));
function isTerminalEvent(event) {
  return ['status', 'lifecycle_status', 'archive_status'].some(key => TERMINAL_STATUSES.includes(String(event?.[key] || '').toUpperCase())) ||
    TERMINAL_STATUSES.includes(String(event?.metadata?.status || '').toUpperCase());
}
function canTransitionStatus(currentStatus, nextStatus, { allowAdminOverride = false } = {}) {
  return allowAdminOverride || !TERMINAL_STATUSES.includes(String(currentStatus || '').toUpperCase()) || TERMINAL_STATUSES.includes(String(nextStatus || '').toUpperCase());
}

function getTodayWibIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function normalizeCategory(raw) {
  const value = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    KONSER: 'CONCERT',
    MUSIC: 'CONCERT',
    SPORT: 'SPORTS',
    OLAHRAGA: 'SPORTS',
    STANDUP: 'COMEDY',
    STAND_UP: 'COMEDY',
    STAND_UP_COMEDY: 'COMEDY',
    STANDUP_COMEDY: 'COMEDY',
    SHOWS_COMEDY: 'COMEDY',
    KOMEDI: 'COMEDY',
    TEATER: 'THEATER',
    LAINNYA: 'OTHER'
  };
  return aliases[value] || value;
}

function normalizeEventForCatalog(event) {
  const copy = { ...event };
  const id = String(copy.id || copy.event_id || '');
  const override = CANONICAL_DATE_OVERRIDES[id];
  if (override) {
    copy.start_date = override;
    copy.date = override;
    copy.lifecycle_status = 'PAST';
    copy.archive_status = 'ARCHIVED';
  }
  return copy;
}

function isEligibleForActiveResale(event, todayWib = getTodayWibIso()) {
  const e = normalizeEventForCatalog(event);
  const id = String(e.id || e.event_id || '');
  if (id && SUPPRESSED_FALLBACK_IDS.has(id)) return false;
  const statuses = [e.status, e.lifecycle_status, e.archive_status, e.metadata?.status].filter(Boolean).map(s => String(s).toUpperCase());
  if (statuses.some(s => EXCLUDED.has(s))) return false;
  if (!statuses.some(s => ACTIVE.has(s))) return false;
  const date = String(e.start_date || e.event_date || e.date || e.start_datetime || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayWib;
}

function deduplicateEvents(events) {
  const result = new Map();
  for (const event of events) {
    // A similar title/date is not proof of identity: it may be a separate session.
    // Only collapse repeated references to the same canonical ID; leave all other
    // candidates visible for provenance review.
    const id = event.id || event.event_id;
    const key = id ? `id:${id}` : Symbol('unidentified event');
    const score = (Number(event.active_listing_count || 0) > 0 ? 100 : 0) + (event.is_verified ? 10 : 0);
    const existing = result.get(key);
    if (!existing || score > existing.score) result.set(key, { event, score });
  }
  return Array.from(result.values(), entry => entry.event);
}

module.exports = { TERMINAL_STATUSES, isTerminalEvent, canTransitionStatus, CANONICAL_DATE_OVERRIDES, SUPPRESSED_FALLBACK_IDS, getTodayWibIso, normalizeCategory, normalizeEventForCatalog, isEligibleForActiveResale, deduplicateEvents };