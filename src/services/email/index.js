/**
 * TIKUM Email Provider Abstraction Layer
 * 
 * Central export and resolution factory for email providers.
 * 
 * Provider Selection Invariants:
 * 1. NODE_ENV === 'test':
 *    -> Resolves to TestEmailProvider (in-memory, network isolated, captures sent messages).
 * 2. Official Provider: Purelymail SMTP (smtp.purelymail.com:465)
 *    -> Resolves to SmtpEmailProvider when SMTP credentials (SMTP_PASS or EMAIL_PASS) are present.
 * 3. NODE_ENV === 'production' and SMTP credentials are absent:
 *    -> FAILS CLOSED.
 *    -> Resolves to UnconfiguredEmailProvider.
 *    -> Never instantiates TestEmailProvider.
 *    -> Never simulates successful delivery.
 *    -> Exposes clear error code EMAIL_PROVIDER_NOT_CONFIGURED.
 * 4. Development without SMTP credentials:
 *    -> Fallback to sandbox TestEmailProvider so local development remains operable.
 */

const { EmailProvider } = require('./EmailProvider');
const { SmtpEmailProvider } = require('./SmtpEmailProvider');
const { ResendEmailProvider, RESEND_API_URL } = require('./ResendEmailProvider');
const { TestEmailProvider } = require('./TestEmailProvider');
const { UnconfiguredEmailProvider } = require('./UnconfiguredEmailProvider');

/**
 * Resolves the appropriate EmailProvider based on runtime environment configuration.
 * @param {Object} [env=process.env]
 * @returns {EmailProvider}
 */
function resolveEmailProvider(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const smtpPass = (env.SMTP_PASS || env.EMAIL_PASS || '').trim();
  const smtpUser = (env.SMTP_USER || env.EMAIL_USER || 'admin@tikum.app').trim();
  const smtpHost = (env.SMTP_HOST || env.EMAIL_HOST || 'smtp.purelymail.com').trim();
  const smtpPort = parseInt(env.SMTP_PORT || env.EMAIL_PORT || '465', 10);
  const smtpSecure = env.SMTP_SECURE !== undefined
    ? env.SMTP_SECURE === 'true'
    : (env.EMAIL_SECURE !== undefined ? env.EMAIL_SECURE === 'true' : (smtpPort === 465));
  const resendApiKey = env.RESEND_API_KEY ? env.RESEND_API_KEY.trim() : null;

  if (nodeEnv === 'test') {
    return new TestEmailProvider();
  }

  // 1. Primary Official Provider: Purelymail SMTP
  if (smtpPass) {
    return new SmtpEmailProvider({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      pass: smtpPass
    });
  }

  // 2. Legacy fallback if explicitly passed in tests
  if (resendApiKey) {
    return new ResendEmailProvider({ apiKey: resendApiKey });
  }

  if (nodeEnv === 'production') {
    // Production without SMTP credentials: FAIL CLOSED
    // Do NOT instantiate TestEmailProvider. Do NOT report successful email delivery.
    return new UnconfiguredEmailProvider('EMAIL_PROVIDER_NOT_CONFIGURED: Purelymail SMTP credentials (SMTP_PASS or EMAIL_PASS) are not configured in production environment');
  }

  // Development: if no credentials are present, fallback to sandbox TestEmailProvider
  return new TestEmailProvider();
}

module.exports = {
  EmailProvider,
  SmtpEmailProvider,
  ResendEmailProvider,
  TestEmailProvider,
  UnconfiguredEmailProvider,
  resolveEmailProvider,
  RESEND_API_URL
};
