/**
 * Centralized Recipient Configuration for TIKUM Admin & Operational Notifications
 * 
 * Invariants:
 * - Defaults to admin@tikum.app and support@tikum.app.
 * - Both recipients receive operational notifications by default.
 * - Configurable via NOTIFICATION_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL, SUPPORT_NOTIFICATION_EMAIL.
 * - Validated syntax (RFC 5322 syntax and CRLF injection rejection).
 * - Never leaks configuration to public frontend responses.
 */

const DEFAULT_ADMIN_NOTIFICATION_EMAIL = 'admin@tikum.app';
const DEFAULT_SUPPORT_NOTIFICATION_EMAIL = 'support@tikum.app';

function validateEmailSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return re.test(trimmed);
}

function resolveNotificationRecipients(env = process.env) {
  const rawRecipients = env.NOTIFICATION_RECIPIENTS;
  const adminEmail = (env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_NOTIFICATION_EMAIL).trim().toLowerCase();
  const supportEmail = (env.SUPPORT_NOTIFICATION_EMAIL || DEFAULT_SUPPORT_NOTIFICATION_EMAIL).trim().toLowerCase();

  let recipientList = [];

  if (rawRecipients && typeof rawRecipients === 'string' && rawRecipients.trim().length > 0) {
    recipientList = rawRecipients
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
  } else {
    recipientList = [adminEmail, supportEmail];
  }

  // Deduplicate and validate syntax
  const validRecipients = [];
  const seen = new Set();

  for (const email of recipientList) {
    if (!seen.has(email) && validateEmailSyntax(email)) {
      seen.add(email);
      validRecipients.push(email);
    }
  }

  // Fallback guarantee
  if (validRecipients.length === 0) {
    validRecipients.push(DEFAULT_ADMIN_NOTIFICATION_EMAIL, DEFAULT_SUPPORT_NOTIFICATION_EMAIL);
  }

  return validRecipients;
}

module.exports = {
  DEFAULT_ADMIN_NOTIFICATION_EMAIL,
  DEFAULT_SUPPORT_NOTIFICATION_EMAIL,
  validateEmailSyntax,
  resolveNotificationRecipients
};
