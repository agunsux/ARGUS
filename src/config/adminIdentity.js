// Security policy, not a user-controlled or environment-overridable role grant.
const ADMIN_EMAIL = 'admin@tikum.app';
const ADMIN_ROLES = Object.freeze(['ADMIN', 'SUPER_ADMIN', 'OPS', 'TRUST_OFFICER',
  'EDITOR', 'EVENT_OPERATIONS', 'SUPPORT', 'FINANCE_READ_ONLY', 'FINANCE', 'FINANCE_OPERATOR']);
const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
const isAdminRole = role => typeof role === 'string' && ADMIN_ROLES.includes(role.toUpperCase());
const isAdminIdentity = user => Boolean(user && normalizeEmail(user.email) === ADMIN_EMAIL &&
  isAdminRole(user.role) && String(user.status || '').toUpperCase() === 'ACTIVE');
module.exports = { ADMIN_EMAIL, ADMIN_ROLES, normalizeEmail, isAdminRole, isAdminIdentity };