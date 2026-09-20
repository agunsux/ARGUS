/**
 * Abstract Base Class for Email Providers
 * 
 * Defines the standard provider boundary contract for all outbound email dispatchers.
 */

class EmailProvider {
  /**
   * @param {string} name - Name of the provider (e.g. 'resend', 'test')
   */
  constructor(name = 'base') {
    if (new.target === EmailProvider) {
      throw new TypeError('Cannot construct EmailProvider instances directly');
    }
    this.name = name;
  }

  /**
   * Dispatches an outbound email
   * @param {Object} options
   * @param {string} options.from - Formatted sender string (e.g. "TIKUM <no-reply@tikum.app>")
   * @param {string|string[]} options.to - Recipient email address(es)
   * @param {string} options.subject - Email subject line
   * @param {string} [options.html] - HTML body
   * @param {string} [options.text] - Plain-text fallback body
   * @param {string} [options.replyTo] - Reply-To address
   * @param {Object} [options.headers] - Additional safe headers
   * @param {string} [options.idempotencyKey] - Idempotency key for deduplication
   * @returns {Promise<{ success: boolean, id?: string, status: string, provider: string, delivered?: boolean, error?: string, code?: string }>}
   */
  async send(options) {
    throw new Error('EmailProvider.send() must be implemented by subclass');
  }
}

module.exports = { EmailProvider };

