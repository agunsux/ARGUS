/**
 * TIKUM Email Provider Abstraction Layer
 * 
 * Central export and resolution factory for email providers.
 * 
 * Provider Selection Invariants:
 * 1. NODE_ENV === 'test':
 *    -> Resolves to TestEmailProvider (in-memory, network isolated, captures sent messages).
 * 2. NODE_ENV === 'development' and RESEND_API_KEY is absent:
 *    -> Resolves to TestEmailProvider in sandbox mode.
 * 3. NODE_ENV === 'production' and RESEND_API_KEY is absent:
 *    -> FAILS CLOSED.
 *    -> Resolves to UnconfiguredEmailProvider.
 *    -> Never instantiates TestEmailProvider.
 *    -> Never simulates successful delivery.
 *    -> Exposes clear error code EMAIL_PROVIDER_NOT_CONFIGURED.
 * 4. Production (or any environment) with RESEND_API_KEY:
 *    -> Resolves to ResendEmailProvider with the configured API key.
 */

const { EmailProvider } = require('./EmailProvider');
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
  const apiKey = env.RESEND_API_KEY ? env.RESEND_API_KEY.trim() : null;

  if (nodeEnv === 'test') {
    return new TestEmailProvider();
  }

  if (nodeEnv === 'production') {
    if (!apiKey) {
      // Production without RESEND_API_KEY: FAIL CLOSED
      // Do NOT instantiate TestEmailProvider. Do NOT report successful email delivery.
      return new UnconfiguredEmailProvider('EMAIL_PROVIDER_NOT_CONFIGURED: RESEND_API_KEY is not configured in production environment');
    }
    return new ResendEmailProvider({ apiKey });
  }

  // Development: if no key is present, fallback to sandbox TestEmailProvider
  if (!apiKey) {
    return new TestEmailProvider();
  }

  return new ResendEmailProvider({ apiKey });
}

module.exports = {
  EmailProvider,
  ResendEmailProvider,
  TestEmailProvider,
  UnconfiguredEmailProvider,
  resolveEmailProvider,
  RESEND_API_URL
};
