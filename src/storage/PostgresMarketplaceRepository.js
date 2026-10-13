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
const { assertTestDatabaseIsolation } = require('./testIsolation');

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
        await assertTestDatabaseIsolation(this.pool);
        if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_SEEDING === 'true') {
          await this.pool.query(`
            INSERT INTO marketplace_tickets (
              id, seller_id, current_owner_id, canonical_event_id, ticket_type,
              section, row_id, seat, quantity, face_value, currency,
              ticket_format, transfer_method, status
            ) VALUES (
              'ticket-demo-pestapora', 'seller-1', 'seller-1', 'event-pestapora-2026', 'GENERAL_ADMISSION',
              'General', 'A', '1', 1, 1250000, 'IDR',
              'E_TICKET', 'MOBILE_TRANSFER', 'VERIFIED'
            ) ON CONFLICT (id) DO NOTHING;

            INSERT INTO marketplace_listings (
              id, ticket_id, seller_id, canonical_event_id, price, currency, status
            ) VALUES (
              'list-demo-pestapora', 'ticket-demo-pestapora', 'seller-1', 'event-pestapora-2026', 1500000, 'IDR', 'ACTIVE'
            ) ON CONFLICT (id) DO NOTHING;
          `);
        }
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
      ticketData.seller_id || ticketData.original_owner_id,
      ticketData.current_owner_id || ticketData.seller_id || ticketData.original_owner_id,
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

  async listAllTickets(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllTickets(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM marketplace_tickets ORDER BY created_at DESC LIMIT $1', [safeLimit]);
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

  async listListingsBySeller(sellerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listListingsBySeller(sellerId);
    }
    const res = await this.query(
      'SELECT * FROM marketplace_listings WHERE seller_id = $1 ORDER BY created_at DESC',
      [sellerId]
    );
    return res.rows;
  }

  async listAllListings(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllListings(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query('SELECT * FROM marketplace_listings ORDER BY created_at DESC LIMIT $1', [safeLimit]);
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

  // --- OFFERS & NEGOTIATIONS (DURABLE POSTGRESQL PERSISTENCE) ---

  _normalizeOfferRow(row) {
    if (!row) return null;
    const seq = Number(row.sequence_number || row.proposal_count || 1);
    const count = Number(row.proposal_count || seq);
    const maxProposals = Number(row.max_proposals || 5);
    const limitReached = count >= maxProposals || row.negotiation_status === 'NEGOTIATION_LIMIT_REACHED';
    return {
      id: row.id,
      listing_id: row.listing_id,
      ticket_id: row.ticket_id,
      event_id: row.event_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      original_price: Number(row.original_price),
      offer_amount: Number(row.offer_amount),
      counter_amount: row.counter_amount !== null && row.counter_amount !== undefined ? Number(row.counter_amount) : null,
      countered_at: row.countered_at ? new Date(row.countered_at).toISOString() : null,
      status: row.status,
      decline_reason: row.decline_reason || null,
      accepted_order_id: row.accepted_order_id || null,
      sequence_number: seq,
      proposal_count: count,
      max_proposals: maxProposals,
      negotiation_id: row.negotiation_id || null,
      negotiation_status: row.negotiation_status || 'ACTIVE',
      ui_counter_text: `Tawaran ${seq}/${maxProposals}`,
      ui_limit_text: limitReached
        ? `Batas tawar-menawar tercapai (${maxProposals}/${maxProposals}). Negosiasi untuk listing ini sudah berakhir.`
        : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
      withdrawn_at: row.withdrawn_at ? new Date(row.withdrawn_at).toISOString() : null,
      superseded_at: row.superseded_at ? new Date(row.superseded_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      metadata: row.metadata || {}
    };
  }

  _normalizeNegotiationRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      listing_id: row.listing_id,
      ticket_id: row.ticket_id,
      event_id: row.event_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      listing_price: Number(row.listing_price),
      proposal_count: Number(row.proposal_count || 0),
      max_proposals: Number(row.max_proposals || 5),
      status: row.status,
      current_amount: row.current_amount !== null && row.current_amount !== undefined ? Number(row.current_amount) : null,
      current_turn: row.current_turn || null,
      active_offer_id: row.active_offer_id || null,
      proposals: Array.isArray(row.proposals) ? row.proposals : [],
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }

  async createOfferWithNegotiation(offerRecord, negotiationRecord, auditEntry = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createOfferWithNegotiation(offerRecord, negotiationRecord, auditEntry);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the listing row if present in DB to serialize concurrent offers on same listing
      await client.query(
        'SELECT id, status FROM marketplace_listings WHERE id = $1 FOR UPDATE',
        [offerRecord.listing_id]
      );

      // 2. Check if an ACCEPTED offer already exists on this listing
      const acceptedRes = await client.query(
        "SELECT id FROM marketplace_offers WHERE listing_id = $1 AND status = 'ACCEPTED' LIMIT 1",
        [offerRecord.listing_id]
      );
      if (acceptedRes.rows.length > 0) {
        const err = new Error('Negosiasi telah disepakati (ACCEPTED).');
        err.code = 'NEGOTIATION_ALREADY_ACCEPTED';
        err.statusCode = 409;
        throw err;
      }

      // 3. Check if an active PENDING offer already exists for (listing_id, buyer_id)
      const dupRes = await client.query(
        "SELECT id FROM marketplace_offers WHERE listing_id = $1 AND buyer_id = $2 AND status = 'PENDING' LIMIT 1",
        [offerRecord.listing_id, offerRecord.buyer_id]
      );
      if (dupRes.rows.length > 0) {
        const err = new Error('You already have an active pending offer on this listing');
        err.code = 'ACTIVE_OFFER_EXISTS';
        err.statusCode = 409;
        throw err;
      }

      // 4. Upsert negotiation record
      let storedNeg = null;
      if (negotiationRecord && negotiationRecord.id) {
        const negSql = `
          INSERT INTO marketplace_negotiations (
            id, listing_id, ticket_id, event_id, buyer_id, seller_id,
            listing_price, proposal_count, max_proposals, status,
            current_amount, current_turn, active_offer_id, proposals,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW())
          ON CONFLICT (id) DO UPDATE SET
            proposal_count = EXCLUDED.proposal_count,
            status = EXCLUDED.status,
            current_amount = EXCLUDED.current_amount,
            current_turn = EXCLUDED.current_turn,
            active_offer_id = EXCLUDED.active_offer_id,
            proposals = EXCLUDED.proposals,
            updated_at = NOW()
          RETURNING *;
        `;
        const negRes = await client.query(negSql, [
          negotiationRecord.id,
          negotiationRecord.listing_id || offerRecord.listing_id,
          negotiationRecord.ticket_id || offerRecord.ticket_id,
          negotiationRecord.event_id || offerRecord.event_id,
          negotiationRecord.buyer_id || offerRecord.buyer_id,
          negotiationRecord.seller_id || offerRecord.seller_id,
          negotiationRecord.listing_price || offerRecord.original_price,
          negotiationRecord.proposal_count || 1,
          negotiationRecord.max_proposals || 5,
          negotiationRecord.status || 'ACTIVE',
          negotiationRecord.current_amount || offerRecord.offer_amount,
          negotiationRecord.current_turn || 'SELLER',
          negotiationRecord.active_offer_id || offerRecord.id,
          JSON.stringify(negotiationRecord.proposals || []),
          negotiationRecord.created_at || new Date().toISOString()
        ]);
        storedNeg = this._normalizeNegotiationRow(negRes.rows[0]);
      }

      // 5. Insert offer record
      const offerSql = `
        INSERT INTO marketplace_offers (
          id, listing_id, ticket_id, event_id, buyer_id, seller_id,
          original_price, offer_amount, counter_amount, status,
          decline_reason, sequence_number, proposal_count, max_proposals,
          negotiation_id, negotiation_status, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        RETURNING *;
      `;
      const offerRes = await client.query(offerSql, [
        offerRecord.id,
        offerRecord.listing_id,
        offerRecord.ticket_id,
        offerRecord.event_id,
        offerRecord.buyer_id,
        offerRecord.seller_id,
        offerRecord.original_price,
        offerRecord.offer_amount,
        offerRecord.counter_amount || null,
        offerRecord.status || 'PENDING',
        offerRecord.decline_reason || null,
        offerRecord.sequence_number || 1,
        offerRecord.proposal_count || 1,
        offerRecord.max_proposals || 5,
        offerRecord.negotiation_id || (storedNeg ? storedNeg.id : null),
        offerRecord.negotiation_status || (storedNeg ? storedNeg.status : 'ACTIVE'),
        offerRecord.expires_at,
        offerRecord.created_at || new Date().toISOString()
      ]);
      const storedOffer = this._normalizeOfferRow(offerRes.rows[0]);

      // 6. Insert audit log if provided
      if (auditEntry) {
        const auditId = auditEntry.id || `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await client.query(
          `INSERT INTO marketplace_offer_audit_logs (
            id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
          [
            auditId,
            storedOffer.id,
            auditEntry.actorId || auditEntry.actor_id,
            auditEntry.actorRole || auditEntry.actor_role,
            auditEntry.fromStatus !== undefined ? auditEntry.fromStatus : (auditEntry.from_status || null),
            auditEntry.toStatus || auditEntry.to_status,
            auditEntry.ipAddress || auditEntry.ip_address || '127.0.0.1',
            JSON.stringify(auditEntry.metadata || {})
          ]
        );
      }

      await client.query('COMMIT');
      return { offer: storedOffer, negotiation: storedNeg };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        const conflictErr = new Error('You already have an active pending offer on this listing');
        conflictErr.code = 'ACTIVE_OFFER_EXISTS';
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async getOfferById(offerId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getOfferById(offerId);
    }
    const res = await this.query('SELECT * FROM marketplace_offers WHERE id = $1', [offerId]);
    return res && res.rows[0] ? this._normalizeOfferRow(res.rows[0]) : null;
  }

  async listOffersByUser(userId, role = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listOffersByUser(userId, role);
    }
    const normRole = role ? String(role).toUpperCase() : null;
    let sql = 'SELECT * FROM marketplace_offers WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC';
    if (normRole === 'SELLER') {
      sql = 'SELECT * FROM marketplace_offers WHERE seller_id = $1 ORDER BY created_at DESC';
    } else if (normRole === 'BUYER') {
      sql = 'SELECT * FROM marketplace_offers WHERE buyer_id = $1 ORDER BY created_at DESC';
    }
    const res = await this.query(sql, [userId]);
    return (res ? res.rows : []).map(r => this._normalizeOfferRow(r));
  }

  async listOffersByListing(listingId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listOffersByListing(listingId);
    }
    const res = await this.query(
      'SELECT * FROM marketplace_offers WHERE listing_id = $1 ORDER BY created_at DESC',
      [listingId]
    );
    return (res ? res.rows : []).map(r => this._normalizeOfferRow(r));
  }

  async listAllOffers(limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listAllOffers(limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const res = await this.query(
      'SELECT * FROM marketplace_offers ORDER BY created_at DESC LIMIT $1',
      [safeLimit]
    );
    return (res ? res.rows : []).map(r => this._normalizeOfferRow(r));
  }

  async transitionOfferStatus(offerId, expectedStatuses, updates = {}, negotiationUpdates = null, auditEntry = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.transitionOfferStatus(offerId, expectedStatuses, updates, negotiationUpdates, auditEntry);
    }

    const allowed = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const curRes = await client.query(
        'SELECT * FROM marketplace_offers WHERE id = $1 FOR UPDATE',
        [offerId]
      );
      const current = curRes.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return { updated: false, currentOffer: null, supersededOffers: [] };
      }
      if (!allowed.includes(current.status)) {
        await client.query('ROLLBACK');
        return { updated: false, currentOffer: this._normalizeOfferRow(current), supersededOffers: [] };
      }

      const { supersedeOtherOffersForListing, ...fieldUpdates } = updates;
      const setClauses = ['updated_at = NOW()'];
      const values = [offerId, allowed];
      let idx = 3;

      const allowedColumns = [
        'status', 'offer_amount', 'counter_amount', 'countered_at',
        'decline_reason', 'accepted_order_id', 'sequence_number',
        'proposal_count', 'negotiation_id', 'negotiation_status',
        'decided_at', 'withdrawn_at', 'superseded_at'
      ];
      for (const col of allowedColumns) {
        if (fieldUpdates[col] !== undefined) {
          setClauses.push(`${col} = $${idx++}`);
          values.push(fieldUpdates[col]);
        }
      }

      const updSql = `
        UPDATE marketplace_offers
        SET ${setClauses.join(', ')}
        WHERE id = $1 AND status = ANY($2::varchar[])
        RETURNING *;
      `;
      const updRes = await client.query(updSql, values);
      if (updRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { updated: false, currentOffer: this._normalizeOfferRow(current), supersededOffers: [] };
      }
      const updatedOffer = this._normalizeOfferRow(updRes.rows[0]);

      const supersededOffers = [];
      if (supersedeOtherOffersForListing) {
        const supRes = await client.query(
          `UPDATE marketplace_offers
           SET status = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
           WHERE listing_id = $1 AND id <> $2 AND status IN ('PENDING', 'COUNTERED')
           RETURNING *;`,
          [current.listing_id, offerId]
        );
        for (const supRow of supRes.rows) {
          const normSup = this._normalizeOfferRow(supRow);
          supersededOffers.push(normSup);
          const supAuditId = `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await client.query(
            `INSERT INTO marketplace_offer_audit_logs (
              id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
            ) VALUES ($1, $2, 'SYSTEM', 'SYSTEM', 'PENDING', 'SUPERSEDED', $3, $4::jsonb, NOW())`,
            [
              supAuditId,
              supRow.id,
              (auditEntry && auditEntry.ipAddress) || '127.0.0.1',
              JSON.stringify({ winning_offer_id: offerId })
            ]
          );
        }
      }

      if (negotiationUpdates && negotiationUpdates.id) {
        await client.query(
          `INSERT INTO marketplace_negotiations (
            id, listing_id, ticket_id, event_id, buyer_id, seller_id,
            listing_price, proposal_count, max_proposals, status,
            current_amount, current_turn, active_offer_id, proposals,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            proposal_count = EXCLUDED.proposal_count,
            status = EXCLUDED.status,
            current_amount = EXCLUDED.current_amount,
            current_turn = EXCLUDED.current_turn,
            active_offer_id = EXCLUDED.active_offer_id,
            proposals = EXCLUDED.proposals,
            updated_at = NOW();`,
          [
            negotiationUpdates.id,
            negotiationUpdates.listing_id || current.listing_id,
            negotiationUpdates.ticket_id || current.ticket_id,
            negotiationUpdates.event_id || current.event_id,
            negotiationUpdates.buyer_id || current.buyer_id,
            negotiationUpdates.seller_id || current.seller_id,
            negotiationUpdates.listing_price || current.original_price,
            negotiationUpdates.proposal_count || updatedOffer.proposal_count,
            negotiationUpdates.max_proposals || 5,
            negotiationUpdates.status || updatedOffer.negotiation_status,
            negotiationUpdates.current_amount !== undefined ? negotiationUpdates.current_amount : updatedOffer.offer_amount,
            negotiationUpdates.current_turn !== undefined ? negotiationUpdates.current_turn : null,
            negotiationUpdates.active_offer_id || offerId,
            JSON.stringify(negotiationUpdates.proposals || [])
          ]
        );
      }

      if (auditEntry) {
        const auditId = auditEntry.id || `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await client.query(
          `INSERT INTO marketplace_offer_audit_logs (
            id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
          [
            auditId,
            offerId,
            auditEntry.actorId || auditEntry.actor_id,
            auditEntry.actorRole || auditEntry.actor_role,
            auditEntry.fromStatus !== undefined ? auditEntry.fromStatus : (auditEntry.from_status || null),
            auditEntry.toStatus || auditEntry.to_status,
            auditEntry.ipAddress || auditEntry.ip_address || '127.0.0.1',
            JSON.stringify(auditEntry.metadata || {})
          ]
        );
      }

      await client.query('COMMIT');
      return { updated: true, offer: updatedOffer, supersededOffers };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async supersedeOffersForListing(listingId, excludeOfferId = null, reason = 'DIRECT_BUY_SUPERSEDED', actorId = 'SYSTEM') {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.supersedeOffersForListing(listingId, excludeOfferId, reason, actorId);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sql = excludeOfferId
        ? `UPDATE marketplace_offers
           SET status = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
           WHERE listing_id = $1 AND id <> $2 AND status IN ('PENDING', 'COUNTERED')
           RETURNING *;`
        : `UPDATE marketplace_offers
           SET status = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
           WHERE listing_id = $1 AND status IN ('PENDING', 'COUNTERED')
           RETURNING *;`;
      const params = excludeOfferId ? [listingId, excludeOfferId] : [listingId];
      const res = await client.query(sql, params);
      const superseded = [];
      for (const row of res.rows) {
        superseded.push(this._normalizeOfferRow(row));
        const auditId = `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await client.query(
          `INSERT INTO marketplace_offer_audit_logs (
            id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
          ) VALUES ($1, $2, $3, 'SYSTEM', 'PENDING', 'SUPERSEDED', '127.0.0.1', $4::jsonb, NOW())`,
          [auditId, row.id, actorId, JSON.stringify({ reason, listing_id: listingId })]
        );
      }
      await client.query('COMMIT');
      return superseded;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async expirePendingOffers(nowIso = null) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.expirePendingOffers(nowIso);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cutoff = nowIso || new Date().toISOString();
      const res = await client.query(
        `UPDATE marketplace_offers
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE status = 'PENDING' AND expires_at <= $1
         RETURNING *;`,
        [cutoff]
      );
      const expired = [];
      for (const row of res.rows) {
        expired.push(this._normalizeOfferRow(row));
        const auditId = `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await client.query(
          `INSERT INTO marketplace_offer_audit_logs (
            id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
          ) VALUES ($1, $2, 'SYSTEM', 'SYSTEM', 'PENDING', 'EXPIRED', '127.0.0.1', $3::jsonb, NOW())`,
          [auditId, row.id, JSON.stringify({ reason: 'Offer TTL expired' })]
        );
      }
      await client.query('COMMIT');
      return expired;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getNegotiationById(negotiationId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getNegotiationById(negotiationId);
    }
    const res = await this.query('SELECT * FROM marketplace_negotiations WHERE id = $1', [negotiationId]);
    return res && res.rows[0] ? this._normalizeNegotiationRow(res.rows[0]) : null;
  }

  async getNegotiationByBuyerAndListing(buyerId, listingId) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.getNegotiationByBuyerAndListing(buyerId, listingId);
    }
    const sql = buyerId
      ? 'SELECT * FROM marketplace_negotiations WHERE listing_id = $1 AND buyer_id = $2 ORDER BY updated_at DESC LIMIT 1'
      : 'SELECT * FROM marketplace_negotiations WHERE listing_id = $1 ORDER BY updated_at DESC LIMIT 1';
    const params = buyerId ? [listingId, buyerId] : [listingId];
    const res = await this.query(sql, params);
    return res && res.rows[0] ? this._normalizeNegotiationRow(res.rows[0]) : null;
  }

  async upsertNegotiation(negotiationData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.upsertNegotiation(negotiationData);
    }
    const sql = `
      INSERT INTO marketplace_negotiations (
        id, listing_id, ticket_id, event_id, buyer_id, seller_id,
        listing_price, proposal_count, max_proposals, status,
        current_amount, current_turn, active_offer_id, proposals,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        proposal_count = EXCLUDED.proposal_count,
        status = EXCLUDED.status,
        current_amount = EXCLUDED.current_amount,
        current_turn = EXCLUDED.current_turn,
        active_offer_id = EXCLUDED.active_offer_id,
        proposals = EXCLUDED.proposals,
        updated_at = NOW()
      RETURNING *;
    `;
    const res = await this.query(sql, [
      negotiationData.id,
      negotiationData.listing_id,
      negotiationData.ticket_id,
      negotiationData.event_id,
      negotiationData.buyer_id,
      negotiationData.seller_id,
      negotiationData.listing_price || 0,
      negotiationData.proposal_count || 0,
      negotiationData.max_proposals || 5,
      negotiationData.status || 'ACTIVE',
      negotiationData.current_amount || null,
      negotiationData.current_turn || null,
      negotiationData.active_offer_id || null,
      JSON.stringify(negotiationData.proposals || [])
    ]);
    return res && res.rows[0] ? this._normalizeNegotiationRow(res.rows[0]) : null;
  }

  async recordOfferAuditLog(auditData) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.recordOfferAuditLog(auditData);
    }
    const id = auditData.id || `oal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO marketplace_offer_audit_logs (
        id, offer_id, actor_id, actor_role, from_status, to_status, ip_address, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      RETURNING *;
    `;
    const res = await this.query(sql, [
      id,
      auditData.offerId || auditData.offer_id,
      auditData.actorId || auditData.actor_id,
      auditData.actorRole || auditData.actor_role,
      auditData.fromStatus !== undefined ? auditData.fromStatus : (auditData.from_status || null),
      auditData.toStatus || auditData.to_status,
      auditData.ipAddress || auditData.ip_address || '127.0.0.1',
      JSON.stringify(auditData.metadata || {})
    ]);
    return res && res.rows[0] ? res.rows[0] : null;
  }

  async listOfferAuditLogs(offerId = null, limit = 200) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.listOfferAuditLogs(offerId, limit);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    if (offerId) {
      const res = await this.query(
        'SELECT * FROM marketplace_offer_audit_logs WHERE offer_id = $1 ORDER BY created_at ASC LIMIT $2',
        [offerId, safeLimit]
      );
      return res ? res.rows : [];
    }
    const res = await this.query(
      'SELECT * FROM marketplace_offer_audit_logs ORDER BY created_at DESC LIMIT $1',
      [safeLimit]
    );
    return res ? res.rows : [];
  }
}

module.exports = { PostgresMarketplaceRepository };
