/** Evidence-aware planning utilities. Missing measurements never become zero demand. */
const WEIGHTS = Object.freeze({ demand: 25, momentum: 15, intent: 20, opportunity: 15, inventory: 15, conversion: 10 });
const CONTENT_TYPES = Object.freeze(['upcoming', 'historical', 'evergreen', 'transactional']);

function scoreOpportunity(candidate) {
  if (!CONTENT_TYPES.includes(candidate.type)) throw new Error('Unknown content type');
  let earned = 0;
  let coverage = 0;
  const missing = [];
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const measure = candidate.factors?.[key];
    if (!measure || measure.value == null || !measure.source || !measure.researched_at) {
      missing.push(key);
      continue;
    }
    if (!Number.isFinite(measure.value) || measure.value < 0 || measure.value > 100) {
      throw new Error(`Invalid score factor: ${key}`);
    }
    if (!Number.isFinite(Date.parse(measure.researched_at))) throw new Error('Invalid research timestamp');
    earned += measure.value * weight / 100;
    coverage += weight;
  }
  return {
    type: candidate.type,
    score: missing.length ? null : Math.round(earned),
    evidence_coverage_percent: coverage,
    missing,
    eligible_for_selection: missing.length === 0 && (candidate.type !== 'historical' || candidate.event_occurred_verified === true)
  };
}

function editorialSlots(after, days = 30) {
  const start = new Date(after);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error('Valid reference timestamp and 1–366 days required');
  }
  const end = start.getTime() + days * 86400000;
  const local = new Date(start.getTime() + 7 * 3600000);
  const cursor = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
  const slots = [];
  while (cursor.getTime() < end) {
    if (cursor > start && [2, 5].includes(cursor.getUTCDay())) {
      slots.push({ scheduled_at: cursor.toISOString(), timezone: 'Asia/Jakarta', local_time: '10:00 WIB', status: 'research_required' });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

module.exports = { WEIGHTS, CONTENT_TYPES, scoreOpportunity, editorialSlots };