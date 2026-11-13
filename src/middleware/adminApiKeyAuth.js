/** Admin APIs require a verified human identity, never an API key. */
const { requireAdminIdentity } = require('./adminSecurity');
function requireAdminApiKey(req, res, next) { return requireAdminIdentity(req, res, next); }
// Compatibility export; authentication uses shared PostgreSQL limits.
function resetAdminRateLimits() {}
module.exports = { requireAdminApiKey, resetAdminRateLimits };
