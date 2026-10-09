/**
 * TIKUM / ARGUS — Postgres Money Repository
 *
 * Production PostgreSQL implementation of MoneyRepository.
 * Guarantees ACID transactions, append-only double-entry ledger,
 * replay-safe webhook deduplication, and row-level locking.
 */

const { Pool } = require('pg');
const { MoneyRepository } = require('./MoneyRepository');
const { InMemoryMoneyRepository } = require('./InMemoryMoneyRepository');
const { assertTestDatabaseIsolation } = require('./testIsolation');

class PostgresMoneyRepository extends MoneyRepository {
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.DATABASE_URL;
    this.pool = null;
    this.fallbackRepo = new InMemoryMoneyRepository();
    this.degraded = false;
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) {
      if (this.degraded && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return;
    }
    await this.init();
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
      if (!this.connectionString) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error('[MoneyRepository] Production configuration error: DATABASE_URL is missing.');
        }
        this.degraded = true;
        await this.fallbackRepo.init();
        this.initialized = true;
        return false;
      }

      try {
        let cleanConnStr = this.connectionString.trim();
        if (cleanConnStr.startsWith('"') && cleanConnStr.endsWith('"')) cleanConnStr = cleanConnStr.slice(1, -1);
        if (cleanConnStr.startsWith("'") && cleanConnStr.endsWith("'")) cleanConnStr = cleanConnStr.slice(1, -1);
        if (cleanConnStr.includes('channel_binding=')) {
          try {
            const u = new URL(cleanConnStr);
            u.searchParams.delete('channel_binding');
            cleanConnStr = u.toString();
          } catch (_) {}
        }

        const isLocalhost = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');
        const ssl = isLocalhost ? undefined : { rejectUnauthorized: false };

        this.pool = new Pool({
          connectionString: cleanConnStr,
          ssl,
          max: 5,
          idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 10000,
          connectionTimeoutMillis: 5000
        });

        await this.pool.query('SELECT NOW()');
        await assertTestDatabaseIsolation(this.pool);
        this.initialized = true;
        this.degraded = false;
        return true;
      } catch (err) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error(`[MoneyRepository] Production database connection failed: ${err.message}`);
        }
        console.warn(`[MoneyRepository] DB connection failed, falling back to memory: ${err.message}`);
        this.degraded = true;
        await this.fallbackRepo.init();
        this.initialized = true;
        return false;
      }
    })();
    return this.initPromise;
  }

  async query(text, params = []) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Database operation rejected while degraded in production.');
      }
      return null;
    }
    return await this.pool.query(text, params);
  }

  async withTransaction(fn) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Transaction rejected while degraded in production.');
      }
      return fn(null);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Quotes
  async createQuote(quoteData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createQuote(quoteData);
    }
    const id = quoteData.quote_id || quoteData.id || `quo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_quotes (
        quote_id, listing_id, buyer_id, seller_id, ticket_price, quantity,
        buyer_fee, seller_fee, buyer_tax, seller_tax, payment_fee,
        buyer_total, seller_payout, currency, pricing_policy_version,
        tax_policy_version, status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (quote_id) DO UPDATE SET
        status = EXCLUDED.status
      RETURNING *;
    `;
    const params = [
      id,
      quoteData.listing_id,
      quoteData.buyer_id,
      quoteData.seller_id,
      quoteData.ticket_price || quoteData.ticketPrice,
      quoteData.quantity || 1,
      quoteData.buyer_fee || quoteData.buyerFee || 0,
      quoteData.seller_fee || quoteData.sellerFee || 0,
      quoteData.buyer_tax || quoteData.buyerTax || 0,
      quoteData.seller_tax || quoteData.sellerTax || 0,
      quoteData.payment_fee || quoteData.paymentFee || 0,
      quoteData.buyer_total || quoteData.buyerTotal,
      quoteData.seller_payout || quoteData.sellerPayout,
      quoteData.currency || 'IDR',
      quoteData.pricing_policy_version || quoteData.pricingPolicyVersion || 'TIKUM_FEE_POLICY_V1',
      quoteData.tax_policy_version || quoteData.taxPolicyVersion || '2026.1-ID-TAX',
      quoteData.status || 'ACTIVE',
      quoteData.expires_at || quoteData.expiresAt
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getQuoteById(quoteId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getQuoteById(quoteId);
    }
    const res = await this.query('SELECT * FROM financial_quotes WHERE quote_id = $1', [quoteId]);
    return res.rows[0] || null;
  }

  async consumeQuote(quoteId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.consumeQuote(quoteId);
    }
    const sql = "UPDATE financial_quotes SET status = 'CONSUMED', consumed_at = NOW() WHERE quote_id = $1 RETURNING *;";
    const res = await this.query(sql, [quoteId]);
    return res.rows[0] || null;
  }

  // Orders
  async createOrder(orderData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createOrder(orderData);
    }
    const id = orderData.id || orderData.order_id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_orders (
        id, idempotency_key, buyer_id, seller_id, listing_id, ticket_id,
        canonical_event_id, quote_id, status, total_amount, buyer_total,
        seller_payout, service_fee, buyer_tax, seller_tax, currency,
        is_sandbox, payment_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      id,
      orderData.idempotency_key || null,
      orderData.buyer_id,
      orderData.seller_id,
      orderData.listing_id,
      orderData.ticket_id,
      orderData.canonical_event_id || orderData.event_id,
      orderData.quote_id || null,
      orderData.status || 'CREATED',
      orderData.total_amount || orderData.buyer_total,
      orderData.buyer_total || orderData.total_amount,
      orderData.seller_payout,
      orderData.service_fee || 0,
      orderData.buyer_tax || 0,
      orderData.seller_tax || 0,
      orderData.currency || 'IDR',
      orderData.is_sandbox === true,
      orderData.payment_deadline || null
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getOrderById(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getOrderById(orderId);
    }
    const res = await this.query('SELECT * FROM financial_orders WHERE id = $1', [orderId]);
    return res.rows[0] || null;
  }

  async listOrdersByBuyerId(buyerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listOrdersByBuyerId(buyerId);
    }
    const res = await this.query('SELECT * FROM financial_orders WHERE buyer_id = $1 ORDER BY created_at DESC', [buyerId]);
    return res.rows;
  }

  async updateOrderStatus(orderId, status, metadata = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateOrderStatus(orderId, status, metadata);
    }
    const sql = 'UPDATE financial_orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *;';
    const res = await this.query(sql, [orderId, status]);
    return res.rows[0] || null;
  }

  // Canonical Payments
  async createPayment(paymentData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createPayment(paymentData);
    }
    const id = paymentData.id || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const internalId = paymentData.internal_payment_id || id;
    const sql = `
      INSERT INTO financial_payments (
        id, internal_payment_id, order_id, buyer_id, seller_id, provider,
        provider_transaction_id, provider_reference, currency, gross_amount,
        provider_fee, status, money_state, payment_method, idempotency_key, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        money_state = EXCLUDED.money_state,
        provider_transaction_id = COALESCE(EXCLUDED.provider_transaction_id, financial_payments.provider_transaction_id),
        provider_reference = COALESCE(EXCLUDED.provider_reference, financial_payments.provider_reference),
        paid_at = COALESCE(EXCLUDED.paid_at, financial_payments.paid_at),
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      id,
      internalId,
      paymentData.order_id,
      paymentData.buyer_id,
      paymentData.seller_id,
      paymentData.provider || 'doku',
      paymentData.provider_transaction_id || null,
      paymentData.provider_reference || null,
      paymentData.currency || 'IDR',
      paymentData.gross_amount || paymentData.amount,
      paymentData.provider_fee || 0,
      paymentData.status || 'PAYMENT_PENDING',
      paymentData.money_state || paymentData.status || 'PAYMENT_PENDING',
      paymentData.payment_method || 'QRIS',
      paymentData.idempotency_key || paymentData.idempotencyKey || null,
      JSON.stringify(paymentData.metadata || {})
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getPaymentById(paymentId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getPaymentById(paymentId);
    }
    const sql = `
      SELECT * FROM financial_payments
      WHERE id = $1 OR internal_payment_id = $1 OR provider_reference = $1
      LIMIT 1;
    `;
    const res = await this.query(sql, [paymentId]);
    return res.rows[0] || null;
  }

  async getPaymentByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getPaymentByOrderId(orderId);
    }
    const res = await this.query('SELECT * FROM financial_payments WHERE order_id = $1 LIMIT 1', [orderId]);
    return res.rows[0] || null;
  }

  async updatePaymentStatus(paymentId, status, metadata = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updatePaymentStatus(paymentId, status, metadata);
    }
    const sql = `
      UPDATE financial_payments
      SET status = $2::varchar,
          money_state = $2::varchar,
          paid_at = CASE WHEN $2::varchar IN ('PAID', 'ESCROW_HELD', 'SETTLED') THEN NOW() ELSE paid_at END,
          provider_transaction_id = COALESCE($3, provider_transaction_id),
          updated_at = NOW()
      WHERE id = $1 OR internal_payment_id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [paymentId, status, metadata.provider_transaction_id || null]);
    return res.rows[0] || null;
  }

  async recordPaymentAttempt(attemptData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.recordPaymentAttempt(attemptData);
    }
    const id = attemptData.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_payment_attempts (
        id, payment_id, order_id, provider, channel, attempt_number,
        status, provider_ref, error_code, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const params = [
      id,
      attemptData.payment_id,
      attemptData.order_id,
      attemptData.provider,
      attemptData.channel || 'QRIS',
      attemptData.attempt_number || 1,
      attemptData.status || 'PENDING',
      attemptData.provider_ref || null,
      attemptData.error_code || null,
      attemptData.error_message || null
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  // Webhook Deduplication (Database-Enforced Replay Proof)
  async recordWebhook(webhookData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.recordWebhook(webhookData);
    }
    const id = webhookData.id || `pwh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const providerEventId = webhookData.provider_event_id || webhookData.providerEventId;
    const sql = `
      INSERT INTO financial_provider_webhooks (
        id, provider, provider_event_id, event_type, payload_hash,
        signature_status, processing_status, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      id,
      webhookData.provider,
      providerEventId,
      webhookData.event_type || webhookData.eventType || 'PAYMENT_EVENT',
      webhookData.payload_hash || webhookData.payloadHash || 'hash',
      webhookData.signature_status || 'VALID',
      webhookData.processing_status || 'PROCESSING',
      JSON.stringify(webhookData.raw_payload || webhookData.rawPayload || {})
    ];

    const res = await this.query(sql, params);
    if (!res.rows || res.rows.length === 0) {
      // Conflict: Webhook already recorded!
      const existing = await this.getWebhook(webhookData.provider, providerEventId);
      return { id: existing?.id, inserted: false, duplicate: true, idempotent: true, record: existing };
    }
    return { id: res.rows[0].id, inserted: true, duplicate: false, idempotent: false, record: res.rows[0] };
  }

  async getWebhook(provider, providerEventId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getWebhook(provider, providerEventId);
    }
    const res = await this.query(
      'SELECT * FROM financial_provider_webhooks WHERE provider = $1 AND provider_event_id = $2',
      [provider, providerEventId]
    );
    return res.rows[0] || null;
  }

  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED') {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.markWebhookProcessed(provider, providerEventId, status);
    }
    const sql = `
      UPDATE financial_provider_webhooks
      SET processing_status = $3, processed_at = NOW()
      WHERE provider = $1 AND provider_event_id = $2
      RETURNING *;
    `;
    const res = await this.query(sql, [provider, providerEventId, status]);
    return res.rows[0] || null;
  }

  // Escrows (With Row-Level Lock on Release)
  async createEscrow(escrowData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createEscrow(escrowData);
    }
    const id = escrowData.id || `esc-${escrowData.order_id}`;
    const sql = `
      INSERT INTO financial_escrows (
        id, order_id, buyer_id, seller_id, amount, currency,
        status, held_by, provider_escrow_id, dispute_hold, is_sandbox
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (order_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    let buyerId = escrowData.buyer_id;
    let sellerId = escrowData.seller_id;
    if (!buyerId || !sellerId) {
      try {
        const ordRes = await this.query('SELECT buyer_id, seller_id FROM financial_orders WHERE id = $1', [escrowData.order_id]);
        if (ordRes.rows[0]) {
          buyerId = buyerId || ordRes.rows[0].buyer_id;
          sellerId = sellerId || ordRes.rows[0].seller_id;
        }
      } catch (_) {}
    }
    const params = [
      id,
      escrowData.order_id,
      buyerId,
      sellerId,
      escrowData.amount,
      escrowData.currency || 'IDR',
      escrowData.status || 'PENDING_PAYMENT',
      escrowData.held_by || 'DOKU_ESCROW',
      escrowData.provider_escrow_id || null,
      escrowData.dispute_hold === true,
      escrowData.is_sandbox === true
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getEscrowByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getEscrowByOrderId(orderId);
    }
    const res = await this.query('SELECT * FROM financial_escrows WHERE order_id = $1', [orderId]);
    return res.rows[0] || null;
  }

  async updateEscrowStatus(orderId, status, metadata = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateEscrowStatus(orderId, status, metadata);
    }
    const sql = `
      UPDATE financial_escrows
      SET status = $2::varchar,
          funded_at = CASE WHEN $2::varchar = 'ESCROWED' THEN NOW() ELSE funded_at END,
          provider_escrow_id = COALESCE($3, provider_escrow_id),
          updated_at = NOW()
      WHERE order_id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [orderId, status, metadata.provider_escrow_id || null]);
    return res.rows[0] || null;
  }

  async releaseEscrow(orderIdParam, actorIdParam = 'SYSTEM', reason = null) {
    let orderId = orderIdParam;
    let actorId = actorIdParam;
    if (typeof orderIdParam === 'object' && orderIdParam !== null) {
      orderId = orderIdParam.orderId || orderIdParam.order_id;
      actorId = orderIdParam.actorId || orderIdParam.actor_id || 'SYSTEM';
    }
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.releaseEscrow(orderId, actorId, reason);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock escrow row exclusively
      const escRes = await client.query('SELECT * FROM financial_escrows WHERE order_id = $1 FOR UPDATE', [orderId]);
      const escrow = escRes.rows[0];
      if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);

      if (escrow.dispute_hold || escrow.status === 'DISPUTED') {
        const err = new Error('Cannot release escrow: transaction is in disputed state');
        err.code = 'TRANSACTION_IN_DISPUTED_STATE';
        throw err;
      }

      if (escrow.status === 'FROZEN') {
        const err = new Error('Cannot release escrow: transaction is in frozen state');
        err.code = 'TRANSACTION_IN_FROZEN_STATE';
        throw err;
      }

      if (escrow.status === 'RELEASED') {
        await client.query('COMMIT');
        return { escrow, alreadyReleased: true, idempotent: true };
      }

      const updateRes = await client.query(
        "UPDATE financial_escrows SET status = 'RELEASED', released_at = NOW(), updated_at = NOW() WHERE order_id = $1 RETURNING *",
        [orderId]
      );
      await client.query(
        "UPDATE financial_orders SET status = 'SETTLED', updated_at = NOW() WHERE id = $1",
        [orderId]
      );

      await client.query('COMMIT');
      return { escrow: updateRes.rows[0], alreadyReleased: false, idempotent: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async refundEscrow(orderId, actorId, reason) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.refundEscrow(orderId, actorId, reason);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const escRes = await client.query('SELECT * FROM financial_escrows WHERE order_id = $1 FOR UPDATE', [orderId]);
      const escrow = escRes.rows[0];
      if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);

      if (escrow.status === 'REFUNDED') {
        await client.query('COMMIT');
        return { escrow, alreadyRefunded: true };
      }

      const updateRes = await client.query(
        "UPDATE financial_escrows SET status = 'REFUNDED', refunded_at = NOW(), updated_at = NOW() WHERE order_id = $1 RETURNING *",
        [orderId]
      );
      await client.query(
        "UPDATE financial_orders SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1",
        [orderId]
      );

      await client.query('COMMIT');
      return { escrow: updateRes.rows[0], alreadyRefunded: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async setDisputeHold(orderId, hold = true) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.setDisputeHold(orderId, hold);
    }
    const sql = `
      UPDATE financial_escrows
      SET dispute_hold = $2::boolean,
          status = CASE WHEN $2::boolean = TRUE THEN 'DISPUTED' ELSE status END,
          updated_at = NOW()
      WHERE order_id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [orderId, hold]);
    return res.rows[0] || null;
  }

  // Settlements
  async createSettlement(settlementData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createSettlement(settlementData);
    }
    const id = settlementData.id || `stl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_settlements (
        id, order_id, seller_id, officer_id, amount, currency,
        status, settlement_mode, payout_ref, bank_account, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (order_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      id,
      settlementData.order_id,
      settlementData.seller_id,
      settlementData.officer_id || null,
      settlementData.amount,
      settlementData.currency || 'IDR',
      settlementData.status || 'PENDING',
      settlementData.settlement_mode || 'MANUAL_BANK_TRANSFER',
      settlementData.payout_ref || null,
      settlementData.bank_account || null,
      settlementData.idempotency_key || null
    ];
    const res = await this.query(sql, params);
    if (!res.rows || res.rows.length === 0) {
      const existing = await this.getSettlementByOrderId(settlementData.order_id);
      return { settlement: existing, idempotent: true };
    }
    return { settlement: res.rows[0], idempotent: false };
  }

  async getSettlementByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getSettlementByOrderId(orderId);
    }
    const res = await this.query('SELECT * FROM financial_settlements WHERE order_id = $1', [orderId]);
    return res.rows[0] || null;
  }

  // Disputes
  async createDispute(disputeData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createDispute(disputeData);
    }
    const id = disputeData.id || disputeData.dispute_id || `dsp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_disputes (
        id, dispute_id, order_id, buyer_id, seller_id, ticket_id,
        canonical_event_id, pic_id, status, outcome, reason,
        claim_details, evidence_bundle_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (order_id) DO UPDATE SET
        status = EXCLUDED.status
      RETURNING *;
    `;
    const params = [
      id,
      id,
      disputeData.order_id,
      disputeData.buyer_id,
      disputeData.seller_id,
      disputeData.ticket_id,
      disputeData.canonical_event_id || disputeData.event_id,
      disputeData.pic_id || null,
      disputeData.status || 'OPEN',
      disputeData.outcome || 'PENDING',
      disputeData.reason || 'DISPUTE_OPENED',
      disputeData.claim_details || null,
      disputeData.evidence_bundle_id || null
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getDisputeByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getDisputeByOrderId(orderId);
    }
    const res = await this.query('SELECT * FROM financial_disputes WHERE order_id = $1', [orderId]);
    return res.rows[0] || null;
  }

  async resolveDispute(disputeId, outcome, notes) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.resolveDispute(disputeId, outcome, notes);
    }
    const sql = `
      UPDATE financial_disputes
      SET status = 'RESOLVED', outcome = $2, decision_notes = $3, resolved_at = NOW()
      WHERE id = $1 OR dispute_id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [disputeId, outcome, notes]);
    return res.rows[0] || null;
  }

  // Chargebacks
  async createChargeback(chargebackData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createChargeback(chargebackData);
    }
    const id = chargebackData.id || `chg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_chargebacks (
        id, order_id, provider, provider_ref, amount, reason, status, deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const params = [
      id,
      chargebackData.order_id,
      chargebackData.provider,
      chargebackData.provider_ref,
      chargebackData.amount,
      chargebackData.reason || null,
      chargebackData.status || 'OPEN',
      chargebackData.deadline || null
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  // Append-Only Financial Ledger
  async recordLedgerTransaction(txData, entriesList = null) {
    const entries = entriesList || txData.entries || [];
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.recordLedgerTransaction(txData, entries);
    }

    // Mathematical balancing check: sum(debit) === sum(credit)
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      const amt = parseInt(e.amount, 10);
      if (e.type === 'DEBIT') totalDebit += amt;
      else if (e.type === 'CREDIT') totalCredit += amt;
    }
    if (totalDebit !== totalCredit) {
      const err = new Error(`Double-entry imbalance: totalDebit (${totalDebit}) !== totalCredit (${totalCredit})`);
      err.code = 'LEDGER_UNBALANCED';
      throw err;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const txId = txData.transaction_id || txData.transactionId || txData.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const txSql = `
        INSERT INTO financial_ledger_transactions (
          transaction_id, order_id, quote_id, event_type, total_amount, currency, description, actor_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      const txParams = [
        txId,
        txData.order_id || txData.orderId,
        txData.quote_id || txData.quoteId || null,
        txData.event_type || txData.eventType,
        totalDebit,
        txData.currency || 'IDR',
        txData.description,
        txData.actor_id || txData.actorId || 'SYSTEM'
      ];
      const txResult = await client.query(txSql, txParams);

      const entrySql = `
        INSERT INTO financial_ledger_entries (
          entry_id, transaction_id, order_id, ledger_account, entry_type, amount, currency, source_event
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const entryId = `${txId}-${i + 1}`;
        await client.query(entrySql, [
          entryId,
          txId,
          txData.order_id || txData.orderId,
          e.account || e.ledger_account,
          e.type || e.entry_type,
          parseInt(e.amount, 10),
          e.currency || 'IDR',
          txData.event_type || txData.eventType
        ]);
      }

      await client.query('COMMIT');
      const tx = txResult.rows[0];
      tx.entries = entries;
      return tx;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getAccountBalances() {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getAccountBalances();
    }
    const sql = `
      SELECT ledger_account,
             SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) as balance
      FROM financial_ledger_entries
      GROUP BY ledger_account;
    `;
    const res = await this.query(sql);
    const balances = {};
    for (const r of res.rows) {
      balances[r.ledger_account] = parseInt(r.balance, 10);
    }
    return balances;
  }

  async getLedgerTransactionsByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getLedgerTransactionsByOrderId(orderId);
    }
    const res = await this.query(
      'SELECT * FROM financial_ledger_transactions WHERE order_id = $1 ORDER BY created_at ASC',
      [orderId]
    );
    return res.rows;
  }

  // Idempotency
  async checkIdempotency(key, scope) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.checkIdempotency(key, scope);
    }
    const res = await this.query('SELECT * FROM financial_idempotency_records WHERE key = $1 AND scope = $2', [key, scope]);
    return res.rows[0] || null;
  }

  async saveIdempotency(key, scope, responsePayload) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.saveIdempotency(key, scope, responsePayload);
    }
    const sql = `
      INSERT INTO financial_idempotency_records (key, scope, status, response_payload, completed_at)
      VALUES ($1, $2, 'COMPLETED', $3, NOW())
      ON CONFLICT (key) DO UPDATE SET
        response_payload = EXCLUDED.response_payload,
        completed_at = NOW()
      RETURNING *;
    `;
    const res = await this.query(sql, [key, scope, JSON.stringify(responsePayload || {})]);
    return res.rows[0];
  }
}

module.exports = { PostgresMoneyRepository };
