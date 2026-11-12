const crypto = require('crypto');

// Cron credentials belong in headers, never URLs, cookies or user-controlled IDs.
function requireCronBearer(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== 'string' || !secret.trim()) {
    return res.status(503).json({ success: false, code: 'CRON_SECRET_NOT_CONFIGURED' });
  }
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, code: 'CRON_SECRET_REQUIRED' });
  }
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
    return res.status(401).json({ success: false, code: 'INVALID_CRON_SECRET' });
  }
  return next();
}

function requireOperationalClock(req, res, next) {
  const overrides = [req.query?.now, req.query?.asOfDate, req.body?.now,
    req.body?.asOfDate, req.headers?.['x-simulate-clock'], process.env.SIMULATE_NOW];
  if (process.env.NODE_ENV !== 'test' && overrides.some(value => value !== undefined)) {
    return res.status(400).json({ success: false, code: 'CLOCK_OVERRIDE_FORBIDDEN' });
  }
  return next();
}

module.exports = { requireCronBearer, requireOperationalClock };