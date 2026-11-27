'use strict';

const EXCLUDED = new Set(['PAST', 'COMPLETED', 'CANCELLED', 'DIBATALKAN', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS', 'DUPLICATE_MERGED', 'EXPIRED']);
const TERMINAL_STATUSES = Object.freeze(['PAST', 'ARCHIVED', 'DUPLICATE_MERGED', 'CANCELLED', 'COMPLETED']);
const PRESERVED_TERMINAL_REASONS = Object.freeze(['DUPLICATE_MERGED', 'CANCELLED', 'COMPLETED']);
const PRESERVED_TERMINAL_REASON_SET = new Set(PRESERVED_TERMINAL_REASONS);
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
  return Boolean(event?.metadata?.merged_into || event?.merged_into) ||
    ['status', 'lifecycle_status', 'archive_status'].some(key => EXCLUDED.has(String(event?.[key] || '').toUpperCase())) ||
    EXCLUDED.has(String(event?.metadata?.status || '').toUpperCase());
}
function preserveTerminalStates(collections, fn) {
  const fields = ['status', 'lifecycle_status', 'archive_status', 'public_visibility', 'homepage_visibility', 'public_upcoming', 'resale_enabled'];
  const lists = collections.map(collection => collection instanceof Map ? Array.from(collection.values()) : Array.isArray(collection) ? collection : Array.from(collection?.events?.values() || []));
  const records = lists.flat().filter(event => event && typeof event === 'object');
  const terminalIds = new Set(records.filter(isTerminalEvent).map(event => event.id || event.event_id).filter(Boolean));
  const snapshots = records.filter(event => isTerminalEvent(event) || terminalIds.has(event.id || event.event_id)).map(event => ({
    event,
    fields: fields.map(key => ({ key, present: Object.prototype.hasOwnProperty.call(event, key), value: event[key] }))
  }));
  try {
    return fn();
  } finally {
    for (const snapshot of snapshots) {
      for (const { key, present, value } of snapshot.fields) {
        if (present) snapshot.event[key] = value;
        else delete snapshot.event[key];
      }
    }
  }
}
function canTransitionStatus(currentStatus, nextStatus, { allowAdminOverride = false } = {}) {
  return allowAdminOverride || !TERMINAL_STATUSES.includes(String(currentStatus || '').toUpperCase()) || TERMINAL_STATUSES.includes(String(nextStatus || '').toUpperCase());
}

function getTodayWibIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function getEffectiveEventDateWib(event) {
  if (!event || typeof event !== 'object') return null;
  for (const candidate of [event.start_date, event.event_date, event.date]) {
    if (!candidate) continue;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return getTodayWibIso(candidate);
    }
    const raw = String(candidate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return getTodayWibIso(parsed);
      return raw.slice(0, 10);
    }
  }
  if (event.start_datetime) {
    const parsed = event.start_datetime instanceof Date ? event.start_datetime : new Date(event.start_datetime);
    if (!Number.isNaN(parsed.getTime())) return getTodayWibIso(parsed);
  }
  return null;
}

function resolvePreservedTerminalReason(event) {
  if (!event || typeof event !== 'object') return null;
  for (const candidate of [event.lifecycle_status, event.status, event.metadata?.status]) {
    const upper = String(candidate || '').trim().toUpperCase();
    if (PRESERVED_TERMINAL_REASON_SET.has(upper)) return upper;
  }
  if (event.merged_into || event.metadata?.merged_into) {
    return 'DUPLICATE_MERGED';
  }
  return null;
}

function applyPastArchiveFieldsToRecord(record, { nowIso = new Date().toISOString(), archivedLifecycle = null } = {}) {
  if (!record || typeof record !== 'object') return record;
  const resolvedLifecycle = (archivedLifecycle && PRESERVED_TERMINAL_REASON_SET.has(String(archivedLifecycle).toUpperCase()))
    ? String(archivedLifecycle).toUpperCase()
    : (resolvePreservedTerminalReason(record) || 'PAST');
  const nextMeta = {
    ...(record.metadata && typeof record.metadata === 'object' ? record.metadata : {}),
    status: resolvedLifecycle,
    auto_archived_at: nowIso,
    auto_archive_reason: 'WIB_DATE_PASSED',
    source_updated_at: nowIso
  };
  record.lifecycle_status = resolvedLifecycle;
  record.status = resolvedLifecycle;
  record.archive_status = 'ARCHIVED';
  record.archived_at = record.archived_at || nowIso;
  record.public_visibility = false;
  record.homepage_visibility = false;
  record.public_upcoming = false;
  record.resale_enabled = false;
  record.updated_at = nowIso;
  record.source_updated_at = nowIso;
  record.metadata = nextMeta;
  return record;
}

function syncArchivedEventsInMemory(archivedEntries, { canonicalRegistry = null, stateEvents = null, nowIso = new Date().toISOString() } = {}) {
  if (!Array.isArray(archivedEntries) || archivedEntries.length === 0) return 0;
  const lifecycleById = new Map();
  for (const entry of archivedEntries) {
    if (typeof entry === 'string' && entry) {
      lifecycleById.set(entry, null);
    } else if (entry && (entry.id || entry.event_id)) {
      lifecycleById.set(entry.id || entry.event_id, entry.lifecycle_status || null);
    }
  }
  if (lifecycleById.size === 0) return 0;

  let synced = 0;
  const registryEvents = canonicalRegistry?.events instanceof Map ? canonicalRegistry.events : null;
  if (registryEvents) {
    for (const [id, archivedLifecycle] of lifecycleById.entries()) {
      const existing = registryEvents.get(id);
      if (existing) {
        applyPastArchiveFieldsToRecord(existing, { nowIso, archivedLifecycle });
        synced++;
      }
    }
  }
  if (Array.isArray(stateEvents)) {
    for (const ev of stateEvents) {
      const id = ev?.id || ev?.event_id;
      if (id && lifecycleById.has(id)) {
        applyPastArchiveFieldsToRecord(ev, { nowIso, archivedLifecycle: lifecycleById.get(id) });
        synced++;
      }
    }
  }
  return synced;
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
  if (isTerminalEvent(e)) return false;
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

module.exports = {
  TERMINAL_STATUSES,
  PRESERVED_TERMINAL_REASONS,
  isTerminalEvent,
  preserveTerminalStates,
  canTransitionStatus,
  CANONICAL_DATE_OVERRIDES,
  SUPPRESSED_FALLBACK_IDS,
  getTodayWibIso,
  getEffectiveEventDateWib,
  resolvePreservedTerminalReason,
  applyPastArchiveFieldsToRecord,
  syncArchivedEventsInMemory,
  normalizeCategory,
  normalizeEventForCatalog,
  isEligibleForActiveResale,
  deduplicateEvents
};