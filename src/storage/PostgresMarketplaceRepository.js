/**
 * TIKUM / ARGUS — Postgres Marketplace Repository
 *
 * Production PostgreSQL implementation of MarketplaceRepository.
 * Provides ACID transactional locking (SELECT ... FOR UPDATE)
 * preventing double-sale across concurrent serverless instances.
 */

const { Pool } = require('pg');
const { MarketplaceRepository } = require('./MarketplaceRepository');
const { InMemoryMarketplaceRepository } = require('./InMemoryMarketplaceRepository');

class PostgresMarketplaceRepository extends MarketplaceRepository {
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.DATABASE_URL;
    this.pool = null;
    this.fallbackRepo = new InMemoryMarketplaceRepository();
    this.degraded = false;
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) {
      if (this.degraded && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
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
          throw new Error('[MarketplaceRepository] Production configuration error: DATABASE_URL is missing.');
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
        this.initialized = true;
        this.degraded = false;
        return true;
      } catch (err) {
        if (isProduction) {
          this.degraded = true;
          this.initialized = true;
          throw new Error(`[MarketplaceRepository] Production database connection failed: ${err.message}`);
        }
        console.warn(`[MarketplaceRepository] DB connection failed, falling back to memory: ${err.message}`);
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
        throw new Error('[MarketplaceRepository] Database operation rejected while degraded in production.');
      }
      return null;
    }
    return await this.pool.query(text, params);
  }

  async withTransaction(fn) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Transaction rejected while degraded in production.');
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

  // Tickets
  async createTicket(ticketData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createTicket(ticketData);
    }

    const id = ticketData.id || ticketData.ticket_id || `tkt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO marketplace_tickets (
        id, seller_id, current_owner_id, canonical_event_id, ticket_type,
        section, row_id, seat, quantity, face_value, currency,
        ticket_format, transfer_method, status, locked_by, barcode_hash, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        current_owner_id = EXCLUDED.current_owner_id,
        locked_by = EXCLUDED.locked_by,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      id,
      ticketData.seller_id,
      ticketData.current_owner_id || ticketData.seller_id,
      ticketData.canonical_event_id || ticketData.event_id,
      ticketData.ticket_type || 'GENERAL_ADMISSION',
      ticketData.section || null,
      ticketData.row_id || ticketData.row || null,
      ticketData.seat || null,
      ticketData.quantity || 1,
      ticketData.face_value || ticketData.faceValue || 0,
      ticketData.currency || 'IDR',
      ticketData.ticket_format || 'E_TICKET',
      ticketData.transfer_method || 'MOBILE_TRANSFER',
      ticketData.status || 'VERIFIED',
      ticketData.locked_by || null,
      ticketData.barcode_hash || null,
      JSON.stringify(ticketData.metadata || {})
    ];

    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getTicketById(ticketId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getTicketById(ticketId);
    }
    const res = await this.query('SELECT * FROM marketplace_tickets WHERE id = $1', [ticketId]);
    return res.rows[0] || null;
  }

  async updateTicketStatus(ticketId, status, lockedBy = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateTicketStatus(ticketId, status, lockedBy);
    }
    const sql = `
      UPDATE marketplace_tickets
      SET status = $2,
          locked_by = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE locked_by END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [ticketId, status, lockedBy]);
    return res.rows[0] || null;
  }

  async listTicketsBySeller(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listTicketsBySeller(sellerId);
    }
    const res = await this.query('SELECT * FROM marketplace_tickets WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
    return res.rows;
  }

  // Listings
  async createListing(listingData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createListing(listingData);
    }
    const id = listingData.id || listingData.listing_id || `list-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO marketplace_listings (
        id, ticket_id, seller_id, canonical_event_id, price, currency,
        status, expires_at, pricing_policy_version, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        price = EXCLUDED.price,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      id,
      listingData.ticket_id,
      listingData.seller_id,
      listingData.canonical_event_id || listingData.event_id,
      listingData.price,
      listingData.currency || 'IDR',
      listingData.status || 'ACTIVE',
      listingData.expires_at || null,
      listingData.pricing_policy_version || 'TIKUM_FEE_POLICY_V1',
      JSON.stringify(listingData.metadata || {})
    ];

    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getListingById(listingId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getListingById(listingId);
    }
    const res = await this.query('SELECT * FROM marketplace_listings WHERE id = $1', [listingId]);
    return res.rows[0] || null;
  }

  async updateListingStatus(listingId, status) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateListingStatus(listingId, status);
    }
    const sql = `
      UPDATE marketplace_listings
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [listingId, status]);
    return res.rows[0] || null;
  }

  async listActiveListings(canonicalEventId = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listActiveListings(canonicalEventId);
    }
    if (canonicalEventId) {
      const res = await this.query(
        "SELECT * FROM marketplace_listings WHERE canonical_event_id = $1 AND status = 'ACTIVE' ORDER BY price ASC",
        [canonicalEventId]
      );
      return res.rows;
    }
    const res = await this.query("SELECT * FROM marketplace_listings WHERE status = 'ACTIVE' ORDER BY created_at DESC");
    return res.rows;
  }

  // Reservations with PostgreSQL Transaction & Row-Level Lock (FOR UPDATE)
  async reserveListing(params, ttlMsOverride = null) {
    const listingId = params.listingId || params.listing_id;
    const buyerId = params.buyerId || params.buyer_id;
    const ttlMs = ttlMsOverride || (params.ttlMinutes ? params.ttlMinutes * 60 * 1000 : 600000);
    return this.createReservation({
      id: params.id,
      listing_id: listingId,
      ticket_id: params.ticketId || params.ticket_id,
      buyer_id: buyerId
    }, ttlMs);
  }

  async createReservation(reservationData, ttlMs = 600000) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createReservation(reservationData, ttlMs);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the listing row exclusively
      const listingRes = await client.query(
        'SELECT * FROM marketplace_listings WHERE id = $1 FOR UPDATE',
        [reservationData.listing_id]
      );
      const listing = listingRes.rows[0];
      if (!listing) {
        throw new Error(`Listing '${reservationData.listing_id}' not found`);
      }
      if (listing.seller_id === (reservationData.buyer_id || reservationData.buyerId)) {
        const err = new Error('Seller cannot reserve their own ticket listing');
        err.code = 'SELF_DEALING_FORBIDDEN';
        throw err;
      }
      if (listing.status !== 'ACTIVE') {
        const err = new Error(`Listing '${reservationData.listing_id}' is not ACTIVE (status: ${listing.status})`);
        err.code = 'LISTING_ALREADY_RESERVED';
        err.status = 409;
        throw err;
      }

      // 2. Lock the ticket row exclusively
      const ticketRes = await client.query(
        'SELECT * FROM marketplace_tickets WHERE id = $1 FOR UPDATE',
        [reservationData.ticket_id || listing.ticket_id]
      );
      const ticket = ticketRes.rows[0];
      if (!ticket) {
        throw new Error('Ticket not found');
      }
      if (ticket.status !== 'LISTED' && ticket.status !== 'VERIFIED') {
        const err = new Error(`Ticket is unavailable (status: ${ticket.status})`);
        err.code = 'TICKET_ALREADY_LOCKED';
        throw err;
      }

      // 3. Create the reservation
      const resId = reservationData.id || `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

      const insertSql = `
        INSERT INTO marketplace_reservations (
          id, listing_id, ticket_id, buyer_id, status, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
        RETURNING *;
      `;
      const resResult = await client.query(insertSql, [
        resId,
        listing.id,
        ticket.id,
        reservationData.buyer_id,
        expiresAt,
        now.toISOString()
      ]);

      // 4. Update listing to RESERVED
      await client.query(
        "UPDATE marketplace_listings SET status = 'RESERVED', updated_at = NOW() WHERE id = $1",
        [listing.id]
      );

      // 5. Update ticket to LOCKED
      await client.query(
        "UPDATE marketplace_tickets SET status = 'LOCKED', locked_by = $2, updated_at = NOW() WHERE id = $1",
        [ticket.id, reservationData.buyer_id]
      );

      await client.query('COMMIT');
      return resResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getReservationById(reservationId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getReservationById(reservationId);
    }
    const res = await this.query('SELECT * FROM marketplace_reservations WHERE id = $1', [reservationId]);
    return res.rows[0] || null;
  }

  async getActiveReservationForListing(listingId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getActiveReservationForListing(listingId);
    }
    const sql = `
      SELECT * FROM marketplace_reservations
      WHERE listing_id = $1 AND status = 'PENDING' AND expires_at > NOW()
      LIMIT 1;
    `;
    const res = await this.query(sql, [listingId]);
    return res.rows[0] || null;
  }

  async expireReservation(reservationId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.expireReservation(reservationId);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rRes = await client.query(
        'SELECT * FROM marketplace_reservations WHERE id = $1 FOR UPDATE',
        [reservationId]
      );
      const r = rRes.rows[0];
      if (!r || r.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return r;
      }

      await client.query(
        "UPDATE marketplace_reservations SET status = 'EXPIRED', expired_at = NOW() WHERE id = $1",
        [reservationId]
      );
      await client.query(
        "UPDATE marketplace_listings SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 AND status = 'RESERVED'",
        [r.listing_id]
      );
      await client.query(
        "UPDATE marketplace_tickets SET status = 'LISTED', locked_by = NULL, updated_at = NOW() WHERE id = $1 AND status = 'LOCKED'",
        [r.ticket_id]
      );

      await client.query('COMMIT');
      return { ...r, status: 'EXPIRED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async releaseReservation(reservationId, actorId = 'SYSTEM', reason = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.releaseReservation(reservationId, actorId, reason);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rRes = await client.query(
        'SELECT * FROM marketplace_reservations WHERE id = $1 FOR UPDATE',
        [reservationId]
      );
      const r = rRes.rows[0];
      if (!r || r.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return r;
      }

      await client.query(
        "UPDATE marketplace_reservations SET status = 'RELEASED', updated_at = NOW() WHERE id = $1",
        [reservationId]
      );
      await client.query(
        "UPDATE marketplace_listings SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 AND status = 'RESERVED'",
        [r.listing_id]
      );
      await client.query(
        "UPDATE marketplace_tickets SET status = 'LISTED', locked_by = NULL, updated_at = NOW() WHERE id = $1 AND status = 'LOCKED'",
        [r.ticket_id]
      );

      await client.query('COMMIT');
      return { ...r, status: 'RELEASED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async convertReservation(reservationId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.convertReservation(reservationId);
    }
    const sql = `
      UPDATE marketplace_reservations
      SET status = 'CONVERTED', converted_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [reservationId]);
    return res.rows[0] || null;
  }

  async cancelReservation(reservationId) {
    return this.expireReservation(reservationId);
  }

  async reconcileExpiredReservations() {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.reconcileExpiredReservations();
    }
    const res = await this.query(
      "SELECT id FROM marketplace_reservations WHERE status = 'PENDING' AND expires_at <= NOW()"
    );
    const expired = [];
    for (const row of res.rows) {
      const exp = await this.expireReservation(row.id);
      if (exp) expired.push(exp);
    }
    return expired;
  }

  // Deliveries
  async createDelivery(deliveryData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createDelivery(deliveryData);
    }
    const id = deliveryData.id || `dlv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO marketplace_deliveries (
        id, order_id, ticket_id, recipient_user_id, delivery_method,
        delivery_reference, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      id,
      deliveryData.order_id,
      deliveryData.ticket_id,
      deliveryData.recipient_user_id || deliveryData.buyer_id,
      deliveryData.delivery_method || 'MOBILE_TRANSFER',
      deliveryData.delivery_reference || null,
      deliveryData.status || 'PENDING',
      deliveryData.notes || null
    ];
    const res = await this.query(sql, params);
    return res.rows[0];
  }

  async getDeliveryById(deliveryId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getDeliveryById(deliveryId);
    }
    const res = await this.query('SELECT * FROM marketplace_deliveries WHERE id = $1', [deliveryId]);
    return res.rows[0] || null;
  }

  async getDeliveryByOrderId(orderId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getDeliveryByOrderId(orderId);
    }
    const res = await this.query('SELECT * FROM marketplace_deliveries WHERE order_id = $1', [orderId]);
    return res.rows[0] || null;
  }

  async updateDeliveryStatus(deliveryId, status, metadata = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateDeliveryStatus(deliveryId, status, metadata);
    }
    const sql = `
      UPDATE marketplace_deliveries
      SET status = $2::varchar,
          delivery_reference = COALESCE($3, delivery_reference),
          notes = COALESCE($4, notes),
          delivered_at = CASE WHEN $2::varchar = 'DELIVERED' THEN NOW() ELSE delivered_at END,
          confirmed_at = CASE WHEN $2::varchar = 'CONFIRMED' THEN NOW() ELSE confirmed_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [
      deliveryId,
      status,
      metadata.delivery_reference || null,
      metadata.notes || metadata.failure_reason || null
    ]);
    return res.rows[0] || null;
  }
}

module.exports = { PostgresMarketplaceRepository };
