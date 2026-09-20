/**
 * Test Email Provider Adapter
 * 
 * In-memory email sink for deterministic automated testing.
 * Captures outbound emails without network I/O, allowing tests to assert
 * on recipients, subjects, rendered content, headers, and idempotency keys.
 */

const { EmailProvider } = require('./EmailProvider');

class TestEmailProvider extends EmailProvider {
  constructor() {
    super('test');
    this.sentEmails = [];
  }

  /**
   * Captures outbound email into in-memory array
   */
  async send(options) {
    const id = `test-${Date.now()}-${this.sentEmails.length + 1}`;
    const captured = {
      id,
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers || {},
      idempotencyKey: options.idempotencyKey || null,
      timestamp: new Date().toISOString()
    };

    this.sentEmails.push(captured);

    return {
      success: true,
      status: 'MOCKED',
      provider: 'test',
      id,
      isMock: true,
      delivered: false,
      to: options.to,
      from: options.from,
      subject: options.subject,
      idempotencyKey: options.idempotencyKey
    };
  }

  /**
   * Returns all captured emails
   */
  getSentEmails() {
    return [...this.sentEmails];
  }

  /**
   * Returns the most recent captured email
   */
  getLastEmail() {
    return this.sentEmails[this.sentEmails.length - 1] || null;
  }

  /**
   * Finds emails sent to a specific recipient
   */
  findByRecipient(recipient) {
    if (!recipient) return [];
    const norm = recipient.toLowerCase().trim();
    return this.sentEmails.filter(e => {
      if (Array.isArray(e.to)) {
        return e.to.some(t => t.toLowerCase().trim() === norm);
      }
      return (e.to || '').toLowerCase().trim() === norm;
    });
  }

  /**
   * Clears captured emails
   */
  clear() {
    this.sentEmails = [];
  }
}

module.exports = { TestEmailProvider };

