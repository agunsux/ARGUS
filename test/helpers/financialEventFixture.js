// Synthetic local-test schedule, never official event evidence or production seed data.
function futureEventSchedule(now = new Date()) {
  if (process.env.NODE_ENV !== 'test') throw new Error('TEST_FIXTURE_ONLY');
  const start = new Date(now.getTime() + 3 * 86400000);
  const end = new Date(start.getTime() + 4 * 3600000);
  const date = start.toISOString().slice(0, 10);
  return {
    date, start_date: date, end_date: end.toISOString().slice(0, 10),
    start_datetime: start.toISOString(), event_start_at: start.toISOString(),
    end_datetime: end.toISOString(), event_end_at: end.toISOString(),
    timezone: 'UTC', event_timezone: 'UTC', lifecycle_status: 'UPCOMING',
    is_verified: true, verification_status: 'VERIFIED', verified_at: now.toISOString()
  };
}

module.exports = { futureEventSchedule };