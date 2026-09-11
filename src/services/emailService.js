/**
 * Centralized TIKUM Email Service
 * 
 * Free-tier transactional email delivery via Resend API (Zero-Cost First: Rp0/mo).
 * Features:
 * - Deterministic idempotency tracking (checked against state.audit_logs & state.notifications).
 * - Non-blocking secondary effect isolation (failures never impact transaction state).
 * - Free-tier guardrails (max 100/day, max 3,000/mo) preventing paid overages.
 * - Strict environment separation (Production fails safely as NOT_CONFIGURED; never simulates delivery).
 * - Server-side only API key isolation.
 */

const https = require('https');
const { URL } = require('url');
const { state, recordAuditLog } = require('../database');
const { businessProfile } = require('../config/businessProfile');
const { renderTemplate, SUPPORT_EMAIL, ADMIN_EMAIL } = require('./emailTemplates');

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = `TIKUM <${SUPPORT_EMAIL}>`;

// Quota and free-tier safeguards
const QUOTA_LIMITS = {
  DAILY_MAX: 100,
  MONTHLY_MAX: 3000
};

class EmailService {
  constructor() {
    this.dailyCount = 0;
    this.monthlyCount = 0;
    this.failedCount = 0;
    this.suppressedCount = 0;
    this.lastResetDay = new Date().toISOString().split('T')[0];
    this.lastResetMonth = new Date().toISOString().slice(0, 7);
    this.lastTestTimestamp = null;
    this.processedKeys = new Set();
  }

  /**
   * Reset daily and monthly counters when calendar boundaries are crossed
   */
  _checkAndRotateQuotas() {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (today !== this.lastResetDay) {
      this.dailyCount = 0;
      this.lastResetDay = today;
    }

    if (thisMonth !== this.lastResetMonth) {
      this.monthlyCount = 0;
      this.lastResetMonth = thisMonth;
    }
  }

  /**
   * Check whether deterministic key was already processed
   * Checks local Set, state.audit_logs, and state.notifications to survive memory flushes
   */
  _isAlreadyProcessed(idempotencyKey) {
    if (!idempotencyKey) return false;

    if (this.processedKeys.has(idempotencyKey)) {
      return true;
    }

    // Check existing audit logs
    if (state.audit_logs && Array.isArray(state.audit_logs)) {
      const match = state.audit_logs.find(
        log => log.entity_type === 'EMAIL' && (log.entity_id === idempotencyKey || (log.metadata && log.metadata.includes(idempotencyKey)))
      );
      if (match) {
        this.processedKeys.add(idempotencyKey);
        return true;
      }
    }

    // Check existing notifications metadata
    if (state.notifications && Array.isArray(state.notifications)) {
      const matchNotif = state.notifications.find(
        n => n.metadata && n.metadata.idempotency_key === idempotencyKey
      );
      if (matchNotif) {
        this.processedKeys.add(idempotencyKey);
        return true;
      }
    }

    return false;
  }

  /**
   * Dispatch HTTP request to Resend API
   */
  _sendViaResend({ from, to, subject, html, text, replyTo, idempotencyKey, apiKey }) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        reply_to: replyTo || SUPPORT_EMAIL,
        headers: idempotencyKey ? { 'X-Entity-Ref-ID': idempotencyKey } : undefined
      });

      const parsedUrl = new URL(RESEND_API_URL);
      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        timeout: 10000 // 10s timeout
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(responseBody);
          } catch (e) {
            parsed = { raw: responseBody };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: parsed });
          } else {
            const err = new Error(parsed.message || `Resend HTTP error ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.response = parsed;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Resend API request timed out after 10000ms'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Main transactional email dispatch method
   * NON-BLOCKING GUARANTEE: Never throws or interrupts caller execution flow
   */
  async sendEmail({
    to,
    subject = null,
    template = null,
    data = {},
    html = null,
    text = null,
    replyTo = null,
    sender = null,
    idempotencyKey = null
  }) {
    this._checkAndRotateQuotas();

    const isProd = process.env.NODE_ENV === 'production';
    const apiKey = process.env.RESEND_API_KEY;

    try {
      // 1. Validate destination
      if (!to) {
        throw new Error('Destination email address (to) is required');
      }

      // 2. Deterministic Idempotency deduplication
      if (idempotencyKey && this._isAlreadyProcessed(idempotencyKey)) {
        return {
          success: true,
          status: 'IDEMPOTENT_SKIPPED',
          message: `Email already processed with idempotency key: ${idempotencyKey}`,
          idempotencyKey,
          delivered: false
        };
      }

      // 3. Free-tier quota guard (Rp0 Cost Protection)
      if (this.dailyCount >= QUOTA_LIMITS.DAILY_MAX || this.monthlyCount >= QUOTA_LIMITS.MONTHLY_MAX) {
        this.suppressedCount++;
        const quotaErr = `Free-tier quota threshold reached: daily=${this.dailyCount}/${QUOTA_LIMITS.DAILY_MAX}, monthly=${this.monthlyCount}/${QUOTA_LIMITS.MONTHLY_MAX}`;
        console.warn(`[TIKUM:EmailService:QuotaGuard] ${quotaErr}. Suppressing send to prevent paid overage.`);
        
        const quotaResult = {
          success: false,
          status: 'QUOTA_EXCEEDED',
          error: quotaErr,
          delivered: false,
          idempotencyKey
        };

        if (idempotencyKey) {
          await recordAuditLog('EMAIL', idempotencyKey, 'QUOTA_SUPPRESSED', 'SYSTEM', quotaResult);
        }
        return quotaResult;
      }

      // 4. Render template or custom content
      let renderedSubject = subject;
      let renderedHtml = html;
      let renderedText = text;

      if (template) {
        const rendered = renderTemplate(template, data);
        renderedSubject = renderedSubject || rendered.subject;
        renderedHtml = renderedHtml || rendered.html;
        renderedText = renderedText || rendered.text;
      }

      if (!renderedSubject || (!renderedHtml && !renderedText)) {
        throw new Error('Email subject and body (template or html/text) are required');
      }

      const fromAddress = sender || DEFAULT_FROM;
      const effectiveReplyTo = replyTo || SUPPORT_EMAIL;

      // 5. Check API key configuration
      if (!apiKey) {
        if (isProd) {
          // Mandatory P0: In production, NEVER simulate success. Fail safely as NOT_CONFIGURED.
          this.failedCount++;
          const failureResult = {
            success: false,
            status: 'NOT_CONFIGURED',
            error: 'RESEND_API_KEY is not configured in production environment',
            delivered: false,
            idempotencyKey
          };
          if (idempotencyKey) {
            this.processedKeys.add(idempotencyKey);
            await recordAuditLog('EMAIL', idempotencyKey, 'NOT_CONFIGURED', 'SYSTEM', failureResult);
          }
          console.warn('[TIKUM:EmailService:ProdWarning] Outbound email skipped: RESEND_API_KEY not configured.');
          return failureResult;
        } else {
          // In test/development: sandbox mock is permitted
          this.dailyCount++;
          this.monthlyCount++;
          if (idempotencyKey) this.processedKeys.add(idempotencyKey);

          const mockResult = {
            success: true,
            status: 'MOCKED',
            id: `mock-resend-${Date.now()}`,
            isMock: true,
            delivered: false,
            to,
            from: fromAddress,
            replyTo: effectiveReplyTo,
            subject: renderedSubject,
            idempotencyKey
          };

          if (idempotencyKey) {
            await recordAuditLog('EMAIL', idempotencyKey, 'MOCKED', 'SYSTEM', {
              to,
              subject: renderedSubject,
              template: template || 'CUSTOM'
            });
          }
          return mockResult;
        }
      }

      // 6. Execute Live Send via Resend
      const resendRes = await this._sendViaResend({
        from: fromAddress,
        to,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        replyTo: effectiveReplyTo,
        idempotencyKey,
        apiKey
      });

      this.dailyCount++;
      this.monthlyCount++;
      if (idempotencyKey) this.processedKeys.add(idempotencyKey);

      const deliveryResult = {
        success: true,
        status: 'DELIVERED',
        id: resendRes.body?.id || `resend-${Date.now()}`,
        delivered: true,
        to,
        idempotencyKey
      };

      if (idempotencyKey) {
        await recordAuditLog('EMAIL', idempotencyKey, 'DELIVERED', 'SYSTEM', {
          to,
          subject: renderedSubject,
          resend_id: deliveryResult.id
        });
      }

      return deliveryResult;

    } catch (err) {
      this.failedCount++;
      const errorResult = {
        success: false,
        status: 'FAILED',
        error: err.message,
        code: err.statusCode || 'SEND_ERROR',
        delivered: false,
        idempotencyKey
      };

      try {
        if (idempotencyKey) {
          await recordAuditLog('EMAIL', idempotencyKey, 'FAILED', 'SYSTEM', {
            error: err.message,
            statusCode: err.statusCode
          });
        }
      } catch (logErr) {
        // Suppress audit log failure to keep secondary effect guarantee
      }

      console.error(`[TIKUM:EmailService:SendError] Failed to send email to ${to}:`, err.message);
      return errorResult;
    }
  }

  // ===========================================================================
  // CONVENIENCE EVENT HELPERS (Product-justified secondary effects)
  // ===========================================================================

  async sendOrderCreatedEmail({ order, buyer, ticket, event, pricing }) {
    if (!buyer || !buyer.email) return;
    const idempotencyKey = `order:${order.id}:created`;
    return this.sendEmail({
      to: buyer.email,
      template: 'ORDER_CREATED',
      replyTo: SUPPORT_EMAIL,
      idempotencyKey,
      data: {
        orderId: order.id,
        eventTitle: event?.title || 'Event TIKUM',
        ticketCategory: ticket?.category || 'General Admission',
        totalAmount: pricing?.total || order.total_amount
      }
    });
  }

  async sendPaymentSuccessfulEmail({ order, payment, buyer, seller, event }) {
    const idempotencyKey = `order:${order.id}:payment-confirmed`;

    // 1. Notify Buyer
    if (buyer && buyer.email) {
      this.sendEmail({
        to: buyer.email,
        template: 'PAYMENT_SUCCESSFUL',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:buyer`,
        data: {
          orderId: order.id,
          eventTitle: event?.title || 'Event TIKUM',
          amount: payment.amount
        }
      }).catch(err => console.error('[EmailService:PaymentBuyer] Secondary effect error:', err.message));
    }

    // 2. Notify Seller that ticket is sold
    if (seller && seller.email) {
      this.sendEmail({
        to: seller.email,
        template: 'SELLER_TICKET_SOLD',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:seller`,
        data: {
          orderId: order.id,
          eventTitle: event?.title || 'Event TIKUM',
          sellerEarnings: order.total_amount
        }
      }).catch(err => console.error('[EmailService:PaymentSeller] Secondary effect error:', err.message));
    }
  }

  async sendOfferReceivedEmail({ offer, seller, listing, event }) {
    if (!seller || !seller.email) return;
    const idempotencyKey = `offer:${offer.id}:received`;
    return this.sendEmail({
      to: seller.email,
      template: 'OFFER_RECEIVED',
      replyTo: SUPPORT_EMAIL,
      idempotencyKey,
      data: {
        offerId: offer.id,
        eventTitle: event?.title || 'Event TIKUM',
        originalPrice: listing?.price || 0,
        offeredPrice: offer.price
      }
    });
  }

  async sendOfferAcceptedEmail({ offer, buyer, event }) {
    if (!buyer || !buyer.email) return;
    const idempotencyKey = `offer:${offer.id}:accepted`;
    return this.sendEmail({
      to: buyer.email,
      template: 'OFFER_ACCEPTED',
      replyTo: SUPPORT_EMAIL,
      idempotencyKey,
      data: {
        offerId: offer.id,
        orderId: offer.order_id || offer.id,
        finalPrice: offer.price,
        eventTitle: event?.title || 'Event TIKUM'
      }
    });
  }

  async sendOfferRejectedEmail({ offer, buyer, event }) {
    if (!buyer || !buyer.email) return;
    const idempotencyKey = `offer:${offer.id}:rejected`;
    return this.sendEmail({
      to: buyer.email,
      template: 'OFFER_REJECTED',
      replyTo: SUPPORT_EMAIL,
      idempotencyKey,
      data: {
        offerId: offer.id,
        offeredPrice: offer.price,
        eventTitle: event?.title || 'Event TIKUM'
      }
    });
  }

  async sendCounterOfferEmail({ offer, buyer, counterPrice, event }) {
    if (!buyer || !buyer.email) return;
    const idempotencyKey = `offer:${offer.id}:countered:${counterPrice}`;
    return this.sendEmail({
      to: buyer.email,
      template: 'COUNTER_OFFER',
      replyTo: SUPPORT_EMAIL,
      idempotencyKey,
      data: {
        offerId: offer.id,
        counterPrice,
        eventTitle: event?.title || 'Event TIKUM'
      }
    });
  }

  async sendDisputeOpenedEmail({ dispute, order, buyer, seller, pic }) {
    const idempotencyKey = `dispute:${dispute.id}:opened`;

    // Notify Buyer
    if (buyer && buyer.email) {
      this.sendEmail({
        to: buyer.email,
        template: 'DISPUTE_OPENED',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:buyer`,
        data: { orderId: dispute.order_id, reason: dispute.reason }
      }).catch(e => {});
    }

    // Notify Seller
    if (seller && seller.email) {
      this.sendEmail({
        to: seller.email,
        template: 'DISPUTE_OPENED',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:seller`,
        data: { orderId: dispute.order_id, reason: dispute.reason }
      }).catch(e => {});
    }

    // Notify Admin / Operations
    this.sendEmail({
      to: ADMIN_EMAIL,
      template: 'SYSTEM_ALERT',
      replyTo: ADMIN_EMAIL,
      idempotencyKey: `${idempotencyKey}:admin`,
      data: {
        title: `Sengketa Baru Dibuka #${dispute.order_id}`,
        message: `Dispute ${dispute.id} dibuka oleh pembeli. Escrow telah dibekukan otomatis.`,
        details: { disputeId: dispute.id, orderId: dispute.order_id, reason: dispute.reason }
      }
    }).catch(e => {});
  }

  async sendDisputeResolvedEmail({ dispute, outcome, decisionNotes, buyer, seller }) {
    const idempotencyKey = `dispute:${dispute.id}:resolved:${outcome}`;

    if (buyer && buyer.email) {
      this.sendEmail({
        to: buyer.email,
        template: 'DISPUTE_STATUS_CHANGED',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:buyer`,
        data: { orderId: dispute.order_id, outcome, decisionNotes }
      }).catch(e => {});
    }

    if (seller && seller.email) {
      this.sendEmail({
        to: seller.email,
        template: 'DISPUTE_STATUS_CHANGED',
        replyTo: SUPPORT_EMAIL,
        idempotencyKey: `${idempotencyKey}:seller`,
        data: { orderId: dispute.order_id, outcome, decisionNotes }
      }).catch(e => {});
    }
  }

  // ===========================================================================
  // TELEMETRY & STATUS INSPECTION
  // ===========================================================================

  getTelemetry() {
    this._checkAndRotateQuotas();
    const hasKey = Boolean(process.env.RESEND_API_KEY);
    const isProd = process.env.NODE_ENV === 'production';

    let status = 'SANDBOX';
    if (hasKey) {
      status = 'CONFIGURED';
    } else if (isProd) {
      status = 'NOT_CONFIGURED';
    }

    return {
      provider: 'Resend (Free Tier)',
      status,
      fromAddress: DEFAULT_FROM,
      supportAddress: SUPPORT_EMAIL,
      adminAddress: ADMIN_EMAIL,
      lastTest: this.lastTestTimestamp,
      dailyUsage: `${this.dailyCount} / ${QUOTA_LIMITS.DAILY_MAX}`,
      monthlyUsage: `${this.monthlyCount} / ${QUOTA_LIMITS.MONTHLY_MAX}`,
      failedCount: this.failedCount,
      suppressedCount: this.suppressedCount,
      dailyCount: this.dailyCount,
      monthlyCount: this.monthlyCount,
      quotaLimits: QUOTA_LIMITS,
      hasApiKey: hasKey
    };
  }

  /**
   * Reset instance state for clean testing
   */
  resetState() {
    this.dailyCount = 0;
    this.monthlyCount = 0;
    this.failedCount = 0;
    this.suppressedCount = 0;
    this.lastTestTimestamp = null;
    this.processedKeys.clear();
  }
}

const emailService = new EmailService();

module.exports = {
  EmailService,
  emailService,
  QUOTA_LIMITS,
  DEFAULT_FROM
};
