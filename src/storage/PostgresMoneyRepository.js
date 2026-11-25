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
const { applyTransactionSchema, normalizeConnectionString } = require('./connectionPool');

function resolveEntriesAndTx(entriesList, txContext) {
  if (entriesList && !Array.isArray(entriesList) &&
      (entriesList.isPostgres !== undefined || entriesList.isInMemory !== undefined || entriesList.client !== undefined)) {
    return { entriesArg: null, resolvedTx: entriesList };
  }
  return { entriesArg: entriesList, resolvedTx: txContext };
}

class PostgresMoneyRepository extends MoneyRepository {
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
    this.schema = options.schema || process.env.TEST_DATABASE_SCHEMA || null;
    this.pool = null;
    this.fallbackRepo = new InMemoryMoneyRepository();
    this.degraded = false;
    this.initialized = false;
    this.initPromise = null;
  }

  _createSnapshot() {
    return this.degraded ? this.fallbackRepo._createSnapshot() : null;
  }

  _restoreSnapshot(snap) {
    if (this.degraded && snap) {
      this.fallbackRepo._restoreSnapshot(snap);
    }
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
        try {
          const u = new URL(cleanConnStr);
          u.searchParams.delete('channel_binding');
          u.searchParams.delete('sslmode');
          cleanConnStr = u.toString();
        } catch (_) {}

        const isLocalhost = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');
        const ssl = isLocalhost ? undefined : { rejectUnauthorized: false };

        this.pool = new Pool({
          connectionString: cleanConnStr,
          ssl,
          max: 5,
          idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 10000,
          connectionTimeoutMillis: 10000
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

  async _exec(text, params = [], txContext = null) {
    if (txContext && txContext.client) {
      return await txContext.client.query(text, params);
    }
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Database operation rejected while degraded in production.');
      }
      return null;
    }
    const targetSchema = (txContext && txContext.schema) || this.schema;
    if (targetSchema) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await applyTransactionSchema(client, targetSchema);
        const res = await client.query(text, params);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }
    return await this.pool.query(text, params);
  }

  async query(text, params = [], txContext = null) {
    return await this._exec(text, params, txContext);
  }

  async _withClient(txContext, fn) {
    if (txContext && txContext.client) {
      return await fn(txContext.client, true);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (this.schema) {
        await applyTransactionSchema(client, this.schema);
      }
      const result = await fn(client, false);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
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
      if (this.schema) {
        await applyTransactionSchema(client, this.schema);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  // Quotes
  async createQuote(quoteData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createQuote(quoteData, txContext);
      }
    }
    const id = quoteData.quote_id || quoteData.id || `quo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ticketPrice = Number(quoteData.ticket_price ?? quoteData.ticketPrice);
    const quantity = Number(quoteData.quantity || 1);
    const grossTicketValue = quoteData.gross_ticket_value !== undefined
      ? Number(quoteData.gross_ticket_value)
      : (Number.isFinite(ticketPrice) ? ticketPrice * quantity : null);
    const sql = `
      INSERT INTO financial_quotes (
        quote_id, listing_id, buyer_id, seller_id, ticket_price, quantity,
        buyer_fee, seller_fee, buyer_tax, seller_tax, payment_fee,
        buyer_total, seller_payout, currency, pricing_policy_version,
        tax_policy_version, status, expires_at,
        gross_ticket_value, fulfillment_option, offer_id, consumed_by_order_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (quote_id) DO UPDATE SET
        status = EXCLUDED.status
      RETURNING *;
    `;
    const params = [
      id,
      quoteData.listing_id,
      quoteData.buyer_id,
      quoteData.seller_id,
      ticketPrice,
      quantity,
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
      quoteData.expires_at || quoteData.expiresAt,
      grossTicketValue,
      quoteData.fulfillment_option || null,
      quoteData.offer_id || null,
      quoteData.consumed_by_order_id || null
    ];
    const res = await this._exec(sql, params, txContext);
    return res.rows[0];
  }

  async getQuoteById(quoteId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getQuoteById(quoteId, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_quotes WHERE quote_id = $1', [quoteId], txContext);
    return res.rows[0] || null;
  }

  async consumeQuote(quoteId, orderContextOrTx = null, txContext = null) {
    if (orderContextOrTx && typeof orderContextOrTx === 'object' &&
        (orderContextOrTx.orderId || orderContextOrTx.order_id || orderContextOrTx.buyerId || orderContextOrTx.buyer_id || orderContextOrTx.listingId || orderContextOrTx.listing_id)) {
      return await this.consumeQuoteForOrder(quoteId, orderContextOrTx, txContext);
    }
    const resolvedTx = (orderContextOrTx && (orderContextOrTx.client || orderContextOrTx.isPostgres !== undefined || orderContextOrTx.isInMemory !== undefined))
      ? orderContextOrTx
      : txContext;

    if (!resolvedTx?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.consumeQuote(quoteId, resolvedTx);
      }
    }
    const sql = `
      UPDATE financial_quotes
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE quote_id = $1 AND status = 'ACTIVE' AND expires_at > NOW()
      RETURNING *;
    `;
    const res = await this._exec(sql, [quoteId], resolvedTx);
    if (res.rows[0]) return res.rows[0];
    const existing = await this.getQuoteById(quoteId, resolvedTx);
    if (!existing) return null;
    if (existing.status === 'CONSUMED') {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed`);
      err.code = 'QUOTE_ALREADY_CONSUMED';
      err.status = 409;
      throw err;
    }
    if (existing.status === 'EXPIRED' || new Date(existing.expires_at).getTime() <= Date.now()) {
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      err.status = 410;
      throw err;
    }
    const err = new Error(`Transaction quote '${quoteId}' is not active (status: ${existing.status})`);
    err.code = 'QUOTE_NOT_ACTIVE';
    err.status = 409;
    throw err;
  }

  async consumeQuoteForOrder(quoteId, expectedContext = {}, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.consumeQuoteForOrder(quoteId, expectedContext, txContext);
      }
    }

    const orderId = expectedContext.order_id ?? expectedContext.orderId ?? null;
    const buyerId = expectedContext.buyer_id ?? expectedContext.buyerId;
    const listingId = expectedContext.listing_id ?? expectedContext.listingId;
    const quantity = expectedContext.quantity;
    const ticketPrice = expectedContext.ticket_price ?? expectedContext.ticketPrice;
    const grossTicketValue = expectedContext.gross_ticket_value ?? expectedContext.grossTicketValue;
    const currency = expectedContext.currency ? String(expectedContext.currency).toUpperCase() : null;
    const fulfillmentOption = expectedContext.fulfillment_option ?? expectedContext.fulfillmentOption ?? null;
    const pricingPolicyVersion = expectedContext.pricing_policy_version ?? expectedContext.pricingPolicyVersion ?? expectedContext.fee_policy_version ?? null;

    const sql = `
      UPDATE financial_quotes
      SET status = 'CONSUMED',
          consumed_at = NOW(),
          consumed_by_order_id = COALESCE($2, consumed_by_order_id)
      WHERE quote_id = $1
        AND status = 'ACTIVE'
        AND expires_at > NOW()
        AND consumed_by_order_id IS NULL
        AND ($3::varchar IS NULL OR buyer_id = $3)
        AND ($4::varchar IS NULL OR listing_id = $4)
        AND ($5::int IS NULL OR quantity = $5)
        AND ($6::bigint IS NULL OR ticket_price = $6)
        AND ($7::bigint IS NULL OR COALESCE(gross_ticket_value, ticket_price * quantity) = $7)
        AND ($8::varchar IS NULL OR UPPER(currency) = UPPER($8))
        AND ($9::varchar IS NULL OR fulfillment_option = $9)
        AND ($10::varchar IS NULL OR pricing_policy_version = $10)
      RETURNING *;
    `;
    const res = await this._exec(sql, [
      quoteId,
      orderId,
      buyerId || null,
      listingId || null,
      quantity !== undefined && quantity !== null ? Number(quantity) : null,
      ticketPrice !== undefined && ticketPrice !== null ? Number(ticketPrice) : null,
      grossTicketValue !== undefined && grossTicketValue !== null ? Number(grossTicketValue) : null,
      currency,
      fulfillmentOption,
      pricingPolicyVersion
    ], txContext);

    if (res.rows && res.rows[0]) {
      return res.rows[0];
    }

    const existing = await this.getQuoteById(quoteId, txContext);
    if (!existing) {
      const err = new Error(`Transaction quote '${quoteId}' not found`);
      err.code = 'QUOTE_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if (existing.status === 'CONSUMED' || existing.consumed_by_order_id) {
      const err = new Error(`Transaction quote '${quoteId}' has already been consumed by order ${existing.consumed_by_order_id || 'unknown'}`);
      err.code = 'QUOTE_ALREADY_CONSUMED';
      err.status = 409;
      throw err;
    }
    if (existing.status === 'EXPIRED' || new Date(existing.expires_at).getTime() <= Date.now()) {
      const err = new Error(`Transaction quote '${quoteId}' has expired`);
      err.code = 'QUOTE_EXPIRED';
      err.status = 410;
      throw err;
    }
    if (existing.status !== 'ACTIVE') {
      const err = new Error(`Transaction quote '${quoteId}' is not active (status: ${existing.status})`);
      err.code = 'QUOTE_NOT_ACTIVE';
      err.status = 409;
      throw err;
    }

    const err = new Error(`Transaction quote '${quoteId}' does not match expected order context`);
    err.code = 'QUOTE_CONTEXT_MISMATCH';
    err.status = 422;
    throw err;
  }

  // Orders
  async createOrder(orderData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createOrder(orderData, txContext);
      }
    }
    const id = orderData.id || orderData.order_id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ticketPrice = orderData.ticket_price !== undefined ? orderData.ticket_price : (orderData.gross_amount !== undefined ? orderData.gross_amount : null);
    const quantity = orderData.quantity || orderData.order_quantity || null;
    const grossTicketValue = orderData.gross_ticket_value !== undefined
      ? orderData.gross_ticket_value
      : (ticketPrice !== null && quantity !== null ? Number(ticketPrice) * Number(quantity) : null);
    const fulfillmentOption = orderData.fulfillment_option || orderData.fulfillment_type || null;
    const policyVersion = orderData.fee_policy_version || orderData.pricing_policy_version || null;

    const sql = `
      INSERT INTO financial_orders (
        id, idempotency_key, buyer_id, seller_id, listing_id, ticket_id,
        canonical_event_id, quote_id, status, total_amount, buyer_total,
        seller_payout, service_fee, buyer_tax, seller_tax, currency,
        is_sandbox, payment_deadline,
        ticket_price, quantity, gross_ticket_value, fulfillment_option,
        buyer_fee, seller_fee, fee_policy_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        quote_id = COALESCE(EXCLUDED.quote_id, financial_orders.quote_id),
        ticket_price = COALESCE(EXCLUDED.ticket_price, financial_orders.ticket_price),
        quantity = COALESCE(EXCLUDED.quantity, financial_orders.quantity),
        gross_ticket_value = COALESCE(EXCLUDED.gross_ticket_value, financial_orders.gross_ticket_value),
        fulfillment_option = COALESCE(EXCLUDED.fulfillment_option, financial_orders.fulfillment_option),
        buyer_fee = COALESCE(EXCLUDED.buyer_fee, financial_orders.buyer_fee),
        seller_fee = COALESCE(EXCLUDED.seller_fee, financial_orders.seller_fee),
        fee_policy_version = COALESCE(EXCLUDED.fee_policy_version, financial_orders.fee_policy_version),
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
      orderData.seller_tax !== undefined ? orderData.seller_tax : (orderData.seller_tax_withholding || 0),
      orderData.currency || 'IDR',
      orderData.is_sandbox === true,
      orderData.payment_deadline || null,
      ticketPrice,
      quantity,
      grossTicketValue,
      fulfillmentOption,
      orderData.buyer_fee !== undefined ? orderData.buyer_fee : null,
      orderData.seller_fee !== undefined ? orderData.seller_fee : null,
      policyVersion
    ];
    const res = await this._exec(sql, params, txContext);
    return res.rows[0];
  }

  async getOrderById(orderId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getOrderById(orderId, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_orders WHERE id = $1', [orderId], txContext);
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

  async listOrdersBySellerId(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listOrdersBySellerId(sellerId);
    }
    const res = await this.query('SELECT * FROM financial_orders WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
    return res.rows;
  }

  async listAllOrders(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllOrders(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM financial_orders ORDER BY created_at DESC LIMIT $1', [safeLimit]);
    return res.rows;
  }

  async updateOrderStatus(orderId, status, metadata = {}, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.updateOrderStatus(orderId, status, metadata, txContext);
      }
    }
    const sql = 'UPDATE financial_orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *;';
    const res = await this._exec(sql, [orderId, status], txContext);
    return res.rows[0] || null;
  }

  // Canonical Payments
  async createPayment(paymentData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createPayment(paymentData, txContext);
      }
    }
    const id = paymentData.id || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const internalId = paymentData.internal_payment_id || id;
    const status = paymentData.status || 'PAYMENT_PENDING';
    const paidAt = paymentData.paid_at || (['SETTLED', 'PAID', 'ESCROW_HELD'].includes(status) ? new Date().toISOString() : null);
    const sql = `
      INSERT INTO financial_payments (
        id, internal_payment_id, order_id, buyer_id, seller_id, provider,
        provider_transaction_id, provider_reference, currency, gross_amount,
        provider_fee, status, money_state, payment_method, idempotency_key, paid_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
      status,
      paymentData.money_state || status || 'PAYMENT_PENDING',
      paymentData.payment_method || 'QRIS',
      paymentData.idempotency_key || paymentData.idempotencyKey || null,
      paidAt,
      JSON.stringify(paymentData.metadata || {})
    ];
    const res = await this._exec(sql, params, txContext);
    return res.rows[0];
  }

  async getPaymentById(paymentId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getPaymentById(paymentId, txContext);
      }
    }
    const sql = `
      SELECT * FROM financial_payments
      WHERE id = $1 OR internal_payment_id = $1 OR provider_reference = $1
      LIMIT 1;
    `;
    const res = await this._exec(sql, [paymentId], txContext);
    return res.rows[0] || null;
  }

  async getPaymentByOrderId(orderId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getPaymentByOrderId(orderId, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [orderId], txContext);
    return res.rows[0] || null;
  }

  async getLatestSettledPaymentByOrderId(orderId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getLatestSettledPaymentByOrderId(orderId, txContext);
      }
    }
    const sql = `
      SELECT * FROM financial_payments
      WHERE order_id = $1
        AND UPPER(status) IN ('SETTLED', 'PAID', 'ESCROW_HELD', 'CAPTURED_PLATFORM_SETTLEMENT')
      ORDER BY COALESCE(paid_at, updated_at, created_at) DESC
      LIMIT 1;
    `;
    const res = await this._exec(sql, [orderId], txContext);
    return res.rows[0] || null;
  }

  async updatePaymentStatus(paymentId, status, metadata = {}, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.updatePaymentStatus(paymentId, status, metadata, txContext);
      }
    }
    const sql = `
      UPDATE financial_payments
      SET status = $2::varchar,
          money_state = $2::varchar,
          paid_at = CASE WHEN $2::varchar IN ('PAID', 'ESCROW_HELD', 'SETTLED') THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
          provider_transaction_id = COALESCE($3, provider_transaction_id),
          updated_at = NOW()
      WHERE id = $1 OR internal_payment_id = $1
      RETURNING *;
    `;
    const res = await this._exec(sql, [paymentId, status, metadata.provider_transaction_id || null], txContext);
    return res.rows[0] || null;
  }

  async recordPaymentAttempt(attemptData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.recordPaymentAttempt(attemptData, txContext);
      }
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
    const res = await this._exec(sql, params, txContext);
    return res.rows[0];
  }

  // Webhook Deduplication (Database-Enforced Replay Proof & Safe Failed-Retry Reclaim)
  async recordWebhook(webhookData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.recordWebhook(webhookData, txContext);
      }
    }
    const id = webhookData.id || `pwh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const providerEventId = webhookData.provider_event_id || webhookData.providerEventId;
    const eventType = webhookData.event_type || webhookData.eventType || 'PAYMENT_EVENT';
    const payloadHash = webhookData.payload_hash || webhookData.payloadHash || 'hash';
    const signatureStatus = webhookData.signature_status || 'VALID';
    const processingStatus = webhookData.processing_status || 'PROCESSING';
    const rawPayloadJson = JSON.stringify(webhookData.raw_payload || webhookData.rawPayload || {});
    const staleAfterSeconds = Number.isFinite(Number(webhookData.staleAfterSeconds))
      ? Math.max(0, Number(webhookData.staleAfterSeconds))
      : 120;

    const insertSql = `
      INSERT INTO financial_provider_webhooks (
        id, provider, provider_event_id, event_type, payload_hash,
        signature_status, processing_status, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *;
    `;
    const insertRes = await this._exec(insertSql, [
      id,
      webhookData.provider,
      providerEventId,
      eventType,
      payloadHash,
      signatureStatus,
      processingStatus,
      rawPayloadJson
    ], txContext);

    if (insertRes.rows && insertRes.rows.length > 0) {
      return { id: insertRes.rows[0].id, inserted: true, retried: false, duplicate: false, idempotent: false, record: insertRes.rows[0] };
    }

    // Reclaim safely if prior attempt failed or went stale before completion
    const reclaimSql = `
      UPDATE financial_provider_webhooks
      SET event_type = $3,
          payload_hash = $4,
          signature_status = $5,
          processing_status = $6,
          raw_payload = $7,
          error_message = NULL,
          processed_at = NULL,
          received_at = NOW()
      WHERE provider = $1
        AND provider_event_id = $2
        AND (
          processing_status IN ('FAILED', 'PROCESSING_FAILED', 'FAILED_RETRYABLE')
          OR (
            processing_status IN ('PENDING', 'PROCESSING')
            AND received_at < NOW() - ($8 * INTERVAL '1 second')
          )
        )
      RETURNING *;
    `;
    const reclaimRes = await this._exec(reclaimSql, [
      webhookData.provider,
      providerEventId,
      eventType,
      payloadHash,
      signatureStatus,
      processingStatus,
      rawPayloadJson,
      staleAfterSeconds
    ], txContext);

    if (reclaimRes.rows && reclaimRes.rows.length > 0) {
      return { id: reclaimRes.rows[0].id, inserted: true, retried: true, duplicate: false, idempotent: false, record: reclaimRes.rows[0] };
    }

    const existing = await this.getWebhook(webhookData.provider, providerEventId, txContext);
    return { id: existing?.id, inserted: false, duplicate: true, idempotent: true, record: existing };
  }

  async getWebhook(provider, providerEventId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getWebhook(provider, providerEventId, txContext);
      }
    }
    const res = await this._exec(
      'SELECT * FROM financial_provider_webhooks WHERE provider = $1 AND provider_event_id = $2',
      [provider, providerEventId],
      txContext
    );
    return res.rows[0] || null;
  }

  async markWebhookProcessed(provider, providerEventId, status = 'PROCESSED', metadataOrTx = null, txContext = null) {
    const isTxObj = metadataOrTx && (metadataOrTx.isPostgres !== undefined || metadataOrTx.isInMemory !== undefined || metadataOrTx.client !== undefined);
    const resolvedTx = isTxObj ? metadataOrTx : txContext;
    const meta = (!isTxObj && typeof metadataOrTx === 'object' && metadataOrTx !== null) ? metadataOrTx : {};

    if (!resolvedTx?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.markWebhookProcessed(provider, providerEventId, status, meta, resolvedTx);
      }
    }
    const sql = `
      UPDATE financial_provider_webhooks
      SET processing_status = $3::varchar,
          processed_at = CASE WHEN $3::varchar = 'PROCESSED' THEN NOW() ELSE NULL END,
          error_message = CASE WHEN $3::varchar = 'PROCESSED' THEN NULL ELSE COALESCE($4, error_message) END
      WHERE provider = $1 AND provider_event_id = $2
      RETURNING *;
    `;
    const res = await this._exec(sql, [provider, providerEventId, status, meta.error_message || null], resolvedTx);
    return res.rows[0] || null;
  }

  // Escrows (With Row-Level Lock on Release)
  async createEscrow(escrowData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createEscrow(escrowData, txContext);
      }
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
        const ordRes = await this._exec('SELECT buyer_id, seller_id FROM financial_orders WHERE id = $1', [escrowData.order_id], txContext);
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
    const res = await this._exec(sql, params, txContext);
    return res.rows[0];
  }

  async getEscrowByOrderId(orderId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getEscrowByOrderId(orderId, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_escrows WHERE order_id = $1', [orderId], txContext);
    return res.rows[0] || null;
  }

  async listEscrowsByBuyerId(buyerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listEscrowsByBuyerId(buyerId);
    }
    const res = await this.query('SELECT * FROM financial_escrows WHERE buyer_id = $1 ORDER BY created_at DESC', [buyerId]);
    return res.rows;
  }

  async listEscrowsBySellerId(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listEscrowsBySellerId(sellerId);
    }
    const res = await this.query('SELECT * FROM financial_escrows WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
    return res.rows;
  }

  async listAllEscrows(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllEscrows(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM financial_escrows ORDER BY created_at DESC LIMIT $1', [safeLimit]);
    return res.rows;
  }

  async updateEscrowStatus(orderId, status, metadata = {}, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.updateEscrowStatus(orderId, status, metadata, txContext);
      }
    }
    const sql = `
      UPDATE financial_escrows
      SET status = $2::varchar,
          funded_at = CASE WHEN $2::varchar = 'ESCROWED' THEN COALESCE(funded_at, NOW()) ELSE funded_at END,
          provider_escrow_id = COALESCE($3, provider_escrow_id),
          updated_at = NOW()
      WHERE order_id = $1
      RETURNING *;
    `;
    const res = await this._exec(sql, [orderId, status, metadata.provider_escrow_id || null], txContext);
    return res.rows[0] || null;
  }

  async releaseEscrow(orderIdParam, actorIdParam = 'SYSTEM', reason = null, txContext = null) {
    let orderId = orderIdParam;
    let actorId = actorIdParam;
    if (typeof orderIdParam === 'object' && orderIdParam !== null) {
      orderId = orderIdParam.orderId || orderIdParam.order_id;
      actorId = orderIdParam.actorId || orderIdParam.actor_id || 'SYSTEM';
    }
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.releaseEscrow(orderId, actorId, reason, txContext);
      }
    }

    return await this._withClient(txContext, async (client, inherited) => {
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

      return { escrow: updateRes.rows[0], alreadyReleased: false, idempotent: false, inheritedTx: inherited };
    });
  }

  async refundEscrow(orderId, actorId, reason, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.refundEscrow(orderId, actorId, reason, txContext);
      }
    }

    return await this._withClient(txContext, async (client) => {
      const escRes = await client.query('SELECT * FROM financial_escrows WHERE order_id = $1 FOR UPDATE', [orderId]);
      const escrow = escRes.rows[0];
      if (!escrow) throw new Error(`Escrow for order '${orderId}' not found`);

      if (escrow.status === 'REFUNDED') {
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

      return { escrow: updateRes.rows[0], alreadyRefunded: false };
    });
  }

  async setDisputeHold(orderId, hold = true, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.setDisputeHold(orderId, hold, txContext);
      }
    }
    const sql = `
      UPDATE financial_escrows
      SET dispute_hold = $2::boolean,
          status = CASE WHEN $2::boolean = TRUE THEN 'DISPUTED' ELSE status END,
          updated_at = NOW()
      WHERE order_id = $1
      RETURNING *;
    `;
    const res = await this._exec(sql, [orderId, hold], txContext);
    return res.rows[0] || null;
  }

  // Settlements
  async createSettlement(settlementData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createSettlement(settlementData, txContext);
      }
    }
    const id = settlementData.id || `stl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_settlements (
        id, order_id, seller_id, officer_id, amount, currency,
        status, settlement_mode, payout_ref, bank_account, idempotency_key,
        bank_reference_number, proof_document_url, authorization_id, authorized_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      settlementData.idempotency_key || null,
      settlementData.bank_reference_number || null,
      settlementData.proof_document_url || null,
      settlementData.authorization_id || null,
      settlementData.authorized_by || null
    ];
    const res = await this._exec(sql, params, txContext);
    if (!res.rows || res.rows.length === 0) {
      const existing = await this.getSettlementByOrderId(settlementData.order_id, txContext);
      return { settlement: existing, idempotent: true };
    }
    return { settlement: res.rows[0], idempotent: false };
  }

  async getSettlementByOrderId(orderId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getSettlementByOrderId(orderId, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_settlements WHERE order_id = $1', [orderId], txContext);
    return res.rows[0] || null;
  }

  async listSettlementsBySellerId(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listSettlementsBySellerId(sellerId);
    }
    const res = await this.query('SELECT * FROM financial_settlements WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
    return res.rows;
  }

  async listAllSettlements(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllSettlements(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM financial_settlements ORDER BY created_at DESC LIMIT $1', [safeLimit]);
    return res.rows;
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

  async listDisputesByBuyerId(buyerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listDisputesByBuyerId(buyerId);
    }
    const res = await this.query('SELECT * FROM financial_disputes WHERE buyer_id = $1 ORDER BY created_at DESC', [buyerId]);
    return res.rows;
  }

  async listDisputesBySellerId(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listDisputesBySellerId(sellerId);
    }
    const res = await this.query('SELECT * FROM financial_disputes WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
    return res.rows;
  }

  async listAllDisputes(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllDisputes(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM financial_disputes ORDER BY created_at DESC LIMIT $1', [safeLimit]);
    return res.rows;
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
  async recordLedgerTransaction(txData, entriesList = null, txContext = null) {
    const { entriesArg, resolvedTx } = resolveEntriesAndTx(entriesList, txContext);
    const entries = entriesArg || txData.entries || [];
    if (!Array.isArray(entries) || entries.length < 2) {
      const err = new Error('Ledger transaction requires at least two balancing entries');
      err.code = 'INVALID_LEDGER_TRANSACTION';
      throw err;
    }

    const eventType = txData.event_type || txData.eventType || txData.source_event;
    if (!eventType) {
      const err = new Error('Ledger transaction requires a non-empty event_type');
      err.code = 'INVALID_EVENT_TYPE';
      throw err;
    }

    if (!resolvedTx?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.recordLedgerTransaction(txData, entries, resolvedTx);
      }
    }

    // Mathematical balancing check: sum(debit) === sum(credit) & positive integers
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      const etype = e.type || e.entry_type;
      if (!Number.isSafeInteger(amt) || amt <= 0) {
        const err = new Error(`Ledger entry amount must be a positive integer, got: ${e.amount}`);
        err.code = 'INVALID_ENTRY_AMOUNT';
        throw err;
      }
      if (etype === 'DEBIT') totalDebit += amt;
      else if (etype === 'CREDIT') totalCredit += amt;
      else {
        const err = new Error(`Invalid ledger entry type: '${etype}'`);
        err.code = 'INVALID_ENTRY_TYPE';
        throw err;
      }
    }
    if (totalDebit !== totalCredit) {
      const err = new Error(`Double-entry imbalance: totalDebit (${totalDebit}) !== totalCredit (${totalCredit})`);
      err.code = 'LEDGER_UNBALANCED';
      throw err;
    }

    const orderId = txData.order_id || txData.orderId;
    const txId = txData.transaction_id || txData.transactionId || txData.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const currency = txData.currency || 'IDR';

    try {
      return await this._withClient(resolvedTx, async (client) => {
        const txSql = `
          INSERT INTO financial_ledger_transactions (
            transaction_id, order_id, quote_id, event_type, total_amount, currency, description, actor_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `;
        const txParams = [
          txId,
          orderId,
          txData.quote_id || txData.quoteId || null,
          eventType,
          totalDebit,
          currency,
          txData.description,
          txData.actor_id || txData.actorId || 'SYSTEM'
        ];
        const txResult = await client.query(txSql, txParams);

        const entrySql = `
          INSERT INTO financial_ledger_entries (
            entry_id, transaction_id, order_id, ledger_account, entry_type, amount, currency, source_event
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `;
        const insertedEntries = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const entryId = e.entry_id || `${txId}-${i + 1}`;
          const eRes = await client.query(entrySql, [
            entryId,
            txId,
            orderId,
            e.account || e.ledger_account,
            e.type || e.entry_type,
            parseInt(e.amount, 10),
            e.currency || currency,
            eventType
          ]);
          insertedEntries.push(eRes.rows[0]);
        }

        const tx = txResult.rows[0];
        tx.entries = insertedEntries;
        return tx;
      });
    } catch (err) {
      if (err.code === '23505' && (eventType === 'CAPTURE' || eventType === 'RELEASE')) {
        const dupErr = new Error(`Duplicate ledger ${eventType} transaction for order '${orderId}'`);
        dupErr.code = 'DUPLICATE_LEDGER_EVENT';
        dupErr.status = 409;
        dupErr.constraint = err.constraint;
        throw dupErr;
      }
      throw err;
    }
  }

  async getAccountBalances(txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getAccountBalances(txContext);
      }
    }
    const sql = `
      SELECT ledger_account,
             SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) as balance
      FROM financial_ledger_entries
      GROUP BY ledger_account;
    `;
    const res = await this._exec(sql, [], txContext);
    const balances = {};
    for (const r of res.rows) {
      balances[r.ledger_account] = parseInt(r.balance, 10);
    }
    return balances;
  }

  async getLedgerTransactionsByOrderId(orderId, txContext = null) {
    return await this.getLedgerTransactionsWithEntriesByOrderId(orderId, null, txContext);
  }

  async getLedgerTransactionsWithEntriesByOrderId(orderId, eventType = null, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.getLedgerTransactionsWithEntriesByOrderId(orderId, eventType, txContext);
      }
    }

    const txSql = eventType
      ? 'SELECT * FROM financial_ledger_transactions WHERE order_id = $1 AND event_type = $2 ORDER BY created_at ASC'
      : 'SELECT * FROM financial_ledger_transactions WHERE order_id = $1 ORDER BY created_at ASC';
    const txParams = eventType ? [orderId, eventType] : [orderId];
    const txRes = await this._exec(txSql, txParams, txContext);
    const txs = txRes.rows || [];
    if (txs.length === 0) return [];

    const txIds = txs.map(t => t.transaction_id);
    const entryRes = await this._exec(
      'SELECT * FROM financial_ledger_entries WHERE order_id = $1 AND transaction_id = ANY($2::varchar[]) ORDER BY entry_id ASC',
      [orderId, txIds],
      txContext
    );
    const entriesByTx = new Map();
    for (const row of (entryRes.rows || [])) {
      if (!entriesByTx.has(row.transaction_id)) {
        entriesByTx.set(row.transaction_id, []);
      }
      entriesByTx.get(row.transaction_id).push({
        ...row,
        account: row.ledger_account,
        type: row.entry_type
      });
    }

    return txs.map(tx => ({
      ...tx,
      entries: entriesByTx.get(tx.transaction_id) || []
    }));
  }

  // Idempotency
  async checkIdempotency(key, scope, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.checkIdempotency(key, scope, txContext);
      }
    }
    const res = await this._exec('SELECT * FROM financial_idempotency_records WHERE key = $1 AND scope = $2', [key, scope], txContext);
    return res.rows[0] || null;
  }

  async saveIdempotency(key, scope, responsePayload, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.saveIdempotency(key, scope, responsePayload, txContext);
      }
    }
    const sql = `
      INSERT INTO financial_idempotency_records (key, scope, status, response_payload, completed_at)
      VALUES ($1, $2, 'COMPLETED', $3, NOW())
      ON CONFLICT (key) DO UPDATE SET
        response_payload = EXCLUDED.response_payload,
        completed_at = NOW()
      RETURNING *;
    `;
    const res = await this._exec(sql, [key, scope, JSON.stringify(responsePayload || {})], txContext);
    return res.rows[0];
  }

  // Transactional Outbox
  async createOutboxEvent(outboxData, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.createOutboxEvent(outboxData, txContext);
      }
    }
    const id = outboxData.id || `obx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const eventId = outboxData.event_id || outboxData.eventId;
    const sql = `
      INSERT INTO financial_outbox (
        id, event_id, event_type, aggregate_type, aggregate_id,
        payload, status, retry_count, max_retries, next_retry_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))
      ON CONFLICT (event_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      id,
      eventId,
      outboxData.event_type || outboxData.eventType,
      outboxData.aggregate_type || outboxData.aggregateType || 'ORDER',
      outboxData.aggregate_id || outboxData.aggregateId,
      JSON.stringify(outboxData.payload || {}),
      outboxData.status || 'PENDING',
      outboxData.retry_count || 0,
      outboxData.max_retries || 5,
      outboxData.next_retry_at || null
    ];
    const res = await this._exec(sql, params, txContext);
    if (res.rows && res.rows[0]) return res.rows[0];
    const existingRes = await this._exec('SELECT * FROM financial_outbox WHERE event_id = $1', [eventId], txContext);
    return existingRes.rows[0] ? { ...existingRes.rows[0], idempotent: true } : null;
  }

  async claimPendingOutboxEvents(batchSize = 10) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.claimPendingOutboxEvents(batchSize);
    }
    const safeBatch = Math.min(Math.max(parseInt(batchSize, 10) || 10, 1), 100);
    return await this._withClient(null, async (client) => {
      const claimSql = `
        UPDATE financial_outbox
        SET status = 'PROCESSING'
        WHERE id IN (
          SELECT id FROM financial_outbox
          WHERE status = 'PENDING' AND next_retry_at <= NOW()
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        RETURNING *;
      `;
      const res = await client.query(claimSql, [safeBatch]);
      return res.rows || [];
    });
  }

  async markOutboxEventProcessed(eventId, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.markOutboxEventProcessed(eventId, txContext);
      }
    }
    const sql = `
      UPDATE financial_outbox
      SET status = 'PROCESSED', processed_at = NOW(), last_error = NULL
      WHERE event_id = $1 OR id = $1
      RETURNING *;
    `;
    const res = await this._exec(sql, [eventId], txContext);
    return res.rows[0] || null;
  }

  async markOutboxEventFailed(eventId, errorMessage, backoffSeconds = 60, txContext = null) {
    if (!txContext?.client) {
      await this.ensureInitialized();
      if (this.degraded) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
        }
        return this.fallbackRepo.markOutboxEventFailed(eventId, errorMessage, backoffSeconds, txContext);
      }
    }
    const safeBackoff = Math.max(1, parseInt(backoffSeconds, 10) || 60);
    const sql = `
      UPDATE financial_outbox
      SET retry_count = retry_count + 1,
          last_error = $2,
          status = CASE WHEN retry_count + 1 >= max_retries THEN 'DEAD_LETTER' ELSE 'PENDING' END,
          next_retry_at = NOW() + ($3 * INTERVAL '1 second')
      WHERE event_id = $1 OR id = $1
      RETURNING *;
    `;
    const res = await this._exec(sql, [eventId, errorMessage || 'UNKNOWN_ERROR', safeBackoff], txContext);
    return res.rows[0] || null;
  }

  // Financial Dual Authorization (Maker-Checker Gate)
  async createFinancialAuthorization(authData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createFinancialAuthorization(authData);
    }
    const id = authData.authorization_id || authData.id || `fauth-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO financial_authorizations (
        id, authorization_id, order_id, action_type, maker_id, checker_id,
        status, amount, currency, payout_destination, reason, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NULL, 'PENDING_APPROVAL', $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (order_id, action_type) WHERE status = 'PENDING_APPROVAL' DO NOTHING
      RETURNING *;
    `;
    const params = [
      id,
      id,
      authData.order_id,
      authData.action_type,
      authData.maker_id,
      parseInt(authData.amount || 0, 10),
      authData.currency || 'IDR',
      authData.payout_destination || authData.bankAccount || null,
      authData.reason,
      JSON.stringify(authData.metadata || {})
    ];
    const res = await this.query(sql, params);
    if (!res.rows || res.rows.length === 0) {
      const existing = await this.getPendingFinancialAuthorization(authData.order_id, authData.action_type);
      return { authorization: existing, idempotent: true };
    }
    return { authorization: res.rows[0], idempotent: false };
  }

  async getFinancialAuthorizationById(id) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getFinancialAuthorizationById(id);
    }
    const res = await this.query(
      'SELECT * FROM financial_authorizations WHERE id = $1 OR authorization_id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  async getPendingFinancialAuthorization(orderId, actionType) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getPendingFinancialAuthorization(orderId, actionType);
    }
    const res = await this.query(
      "SELECT * FROM financial_authorizations WHERE order_id = $1 AND action_type = $2 AND status = 'PENDING_APPROVAL'",
      [orderId, actionType]
    );
    return res.rows[0] || null;
  }

  async approveFinancialAuthorization(authorizationId, checkerId, notes = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.approveFinancialAuthorization(authorizationId, checkerId, notes);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selectRes = await client.query(
        'SELECT * FROM financial_authorizations WHERE id = $1 OR authorization_id = $1 FOR UPDATE',
        [authorizationId]
      );
      const auth = selectRes.rows[0];
      if (!auth) {
        await client.query('ROLLBACK');
        const err = new Error(`Financial authorization '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (auth.status !== 'PENDING_APPROVAL') {
        await client.query('ROLLBACK');
        const err = new Error(`Cannot approve: authorization request is already ${auth.status}`);
        err.code = 'AUTHORIZATION_NOT_PENDING';
        err.status = 400;
        throw err;
      }
      if (auth.maker_id === checkerId) {
        await client.query('ROLLBACK');
        const err = new Error('Maker-Checker violation: Initiator (Maker) cannot approve their own financial authorization request');
        err.code = 'MAKER_CHECKER_VIOLATION';
        err.status = 403;
        throw err;
      }

      const updateRes = await client.query(
        `UPDATE financial_authorizations
         SET status = 'APPROVED', checker_id = $1, approval_notes = $2, approved_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [checkerId, notes, auth.id]
      );
      await client.query('COMMIT');
      return { success: true, authorization: updateRes.rows[0] };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }

  async rejectFinancialAuthorization(authorizationId, checkerId, rejectionReason) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.rejectFinancialAuthorization(authorizationId, checkerId, rejectionReason);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selectRes = await client.query(
        'SELECT * FROM financial_authorizations WHERE id = $1 OR authorization_id = $1 FOR UPDATE',
        [authorizationId]
      );
      const auth = selectRes.rows[0];
      if (!auth) {
        await client.query('ROLLBACK');
        const err = new Error(`Financial authorization '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (auth.status !== 'PENDING_APPROVAL') {
        await client.query('ROLLBACK');
        const err = new Error(`Cannot reject: authorization request is already ${auth.status}`);
        err.code = 'AUTHORIZATION_NOT_PENDING';
        err.status = 400;
        throw err;
      }

      const updateRes = await client.query(
        `UPDATE financial_authorizations
         SET status = 'REJECTED', checker_id = $1, rejection_reason = $2, rejected_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [checkerId, rejectionReason, auth.id]
      );
      await client.query('COMMIT');
      return { success: true, authorization: updateRes.rows[0] };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }

  async consumeFinancialAuthorization(authorizationId, settlementId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.consumeFinancialAuthorization(authorizationId, settlementId);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selectRes = await client.query(
        'SELECT * FROM financial_authorizations WHERE id = $1 OR authorization_id = $1 FOR UPDATE',
        [authorizationId]
      );
      const auth = selectRes.rows[0];
      if (!auth) {
        await client.query('ROLLBACK');
        const err = new Error(`Financial authorization '${authorizationId}' not found`);
        err.code = 'AUTHORIZATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (auth.status !== 'APPROVED') {
        await client.query('ROLLBACK');
        const err = new Error(`Cannot consume authorization: status is ${auth.status}`);
        err.code = 'AUTHORIZATION_NOT_APPROVED';
        err.status = 400;
        throw err;
      }

      const updateRes = await client.query(
        `UPDATE financial_authorizations
         SET status = 'CONSUMED', consumed_at = NOW(), consumed_by_settlement_id = $1
         WHERE id = $2
         RETURNING *`,
        [settlementId, auth.id]
      );
      await client.query('COMMIT');
      return { success: true, authorization: updateRes.rows[0] };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }

  async listFinancialAuthorizations(filter = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listFinancialAuthorizations(filter);
    }

    const clauses = [];
    const params = [];
    if (filter.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filter.orderId) {
      params.push(filter.orderId);
      clauses.push(`order_id = $${params.length}`);
    }
    if (filter.actionType) {
      params.push(filter.actionType);
      clauses.push(`action_type = $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT * FROM financial_authorizations ${where} ORDER BY created_at DESC LIMIT 200`;
    const res = await this.query(sql, params);
    return res.rows;
  }

  async confirmSettlementDisbursement({
    settlementId,
    orderId,
    officerId,
    bankReferenceNumber,
    proofDocumentUrl = null,
    bankAccount = null
  }) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MoneyRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.confirmSettlementDisbursement({
        settlementId, orderId, officerId, bankReferenceNumber, proofDocumentUrl, bankAccount
      });
    }

    if (!bankReferenceNumber || typeof bankReferenceNumber !== 'string' || bankReferenceNumber.trim().length < 5) {
      const err = new Error('Authentic bank transaction reference number is required (min 5 characters)');
      err.code = 'INVALID_BANK_REFERENCE';
      err.status = 400;
      throw err;
    }
    const cleanRef = bankReferenceNumber.trim();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const dupCheck = await client.query(
        'SELECT id, bank_account FROM financial_settlements WHERE bank_reference_number = $1 AND id <> $2',
        [cleanRef, settlementId]
      );
      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0];
        if (!bankAccount || dup.bank_account === bankAccount) {
          await client.query('ROLLBACK');
          const err = new Error(`Duplicate bank reference number '${cleanRef}' has already been used for settlement '${dup.id}'`);
          err.code = 'DUPLICATE_BANK_REFERENCE';
          err.status = 400;
          throw err;
        }
      }

      const updateRes = await client.query(
        `UPDATE financial_settlements
         SET status = 'DISBURSED',
             bank_reference_number = $1,
             proof_document_url = $2,
             confirmed_by_officer = $3,
             disbursed_at = NOW(),
             updated_at = NOW()
         WHERE (id = $4 OR (order_id = $5 AND $5 IS NOT NULL))
         RETURNING *`,
        [cleanRef, proofDocumentUrl, officerId, settlementId, orderId || null]
      );

      if (updateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error(`Settlement '${settlementId || orderId}' not found`);
        err.code = 'SETTLEMENT_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      await client.query('COMMIT');
      return {
        success: true,
        status: 'DISBURSED',
        settlement: updateRes.rows[0],
        bankReferenceNumber: cleanRef,
        confirmedAt: updateRes.rows[0].disbursed_at
      };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = { PostgresMoneyRepository };
