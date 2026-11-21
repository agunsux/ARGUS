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
    this.connectionString = options.connectionString || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
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

        // Ensure Event PIC assignments table exists
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS event_pic_assignments (
            id VARCHAR(100) PRIMARY KEY,
            event_id VARCHAR(100) NOT NULL,
            venue_id VARCHAR(100) NOT NULL,
            pic_user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            event_date DATE,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            contact_phone VARCHAR(50),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_event_pic_assignments_event ON event_pic_assignments (event_id, status);
          CREATE INDEX IF NOT EXISTS idx_event_pic_assignments_user ON event_pic_assignments (pic_user_id, status);

          CREATE TABLE IF NOT EXISTS buyer_inquiries (
            id VARCHAR(100) PRIMARY KEY,
            listing_id VARCHAR(100) NOT NULL,
            buyer_id VARCHAR(100) NOT NULL,
            seller_id VARCHAR(100) NOT NULL,
            event_id VARCHAR(120),
            ticket_id VARCHAR(100),
            quantity INTEGER DEFAULT 1,
            proposed_price BIGINT,
            message TEXT,
            buyer_name VARCHAR(150),
            buyer_email VARCHAR(255),
            contact_phone VARCHAR(60),
            follow_up_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_FOLLOWUP',
            admin_notes TEXT,
            notification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            notification_error TEXT,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_listing ON buyer_inquiries (listing_id);
          CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_buyer ON buyer_inquiries (buyer_id);
          CREATE INDEX IF NOT EXISTS idx_buyer_inquiries_status ON buyer_inquiries (follow_up_status);
        `).catch(err => {
          console.warn('[PostgresMarketplaceRepository] PIC/Inquiry assignments DDL notice:', err.message);
        });

        // Hydrate state.event_pics for synchronous lookup compatibility
        try {
          const picRes = await this.pool.query('SELECT * FROM event_pic_assignments WHERE status = $1', ['ACTIVE']);
          if (picRes && picRes.rows && picRes.rows.length > 0) {
            const { state } = require('../database');
            if (state) {
              const existingMap = new Map();
              for (const p of (state.event_pics || [])) existingMap.set(p.id, p);
              for (const r of picRes.rows) existingMap.set(r.id, r);
              state.event_pics = Array.from(existingMap.values());
            }
          }
        } catch (_) {}
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

  sanitizeDbError(err) {
    if (!err) return err;
    if (err.code === '23503' || err.code === 'PARENT_TICKET_MISSING') {
      const sanitized = new Error('Referensi data tidak valid atau belum terdaftar.');
      sanitized.code = 'INVALID_RELATIONAL_REFERENCE';
      sanitized.statusCode = 400;
      sanitized.originalDetail = err.detail || err.message;
      sanitized.constraint = err.constraint || 'marketplace_listings_ticket_id_fkey';
      sanitized.bilingual = {
        id: 'Referensi data tiket, event, atau akun penjual tidak valid atau belum terdaftar.',
        en: 'Invalid or unregistered relational reference (ticket, event, or seller account).'
      };
      return sanitized;
    }
    if (err.code === '23505') {
      const sanitized = new Error('Data sudah terdaftar sebelumnya.');
      sanitized.code = 'DUPLICATE_RESOURCE';
      sanitized.statusCode = 409;
      sanitized.constraint = err.constraint;
      sanitized.bilingual = {
        id: 'Data sudah terdaftar sebelumnya dalam sistem.',
        en: 'This resource is already registered in the system.'
      };
      return sanitized;
    }
    if (err.code === '23502') {
      const sanitized = new Error('Kolom data wajib tidak boleh kosong.');
      sanitized.code = 'MISSING_REQUIRED_COLUMN';
      sanitized.statusCode = 400;
      sanitized.column = err.column;
      sanitized.bilingual = {
        id: 'Kolom data wajib tidak boleh kosong.',
        en: 'Required data field cannot be empty.'
      };
      return sanitized;
    }
    return err;
  }

  async ensureEventExists(eventId, client = null) {
    if (!eventId) return null;
    const queryExecutor = client || this;
    try {
      const evRes = await queryExecutor.query('SELECT id FROM canonical_events WHERE id = $1', [eventId]);
      if (evRes.rows && evRes.rows.length > 0) return evRes.rows[0];
    } catch (_) {}

    // Find in memory or registries
    let event = null;
    try {
      const { state } = require('../database');
      if (state && state.events) {
        event = state.events.find(e => e.id === eventId || e.event_id === eventId);
      }
    } catch (_) {}

    if (!event) {
      try {
        const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
        if (canonicalRegistry && typeof canonicalRegistry.getEventById === 'function') {
          event = canonicalRegistry.getEventById(eventId);
        }
      } catch (_) {}
    }

    if (!event) {
      try {
        const { EventPolicyRegistry } = require('../policy/EventPolicyRegistry');
        if (EventPolicyRegistry && typeof EventPolicyRegistry.getEventById === 'function') {
          event = EventPolicyRegistry.getEventById(eventId);
        }
      } catch (_) {}
    }

    if (!event) return null;

    const slug = event.slug || event.id || `event-${Date.now()}`;
    const name = event.canonical_name || event.name || event.title || 'Event Tikum';
    const eventType = event.event_type || event.category || 'CONCERT';
    const category = event.category || 'CONCERT';
    const startDate = event.start_date || (event.start_datetime ? new Date(event.start_datetime).toISOString().split('T')[0] : null);
    const startDatetime = event.start_datetime || (startDate ? new Date(startDate).toISOString() : null);
    const venueName = event.venue_name || event.venue || 'Venue Indonesia';
    const city = event.city || event.venue_city || 'Jakarta';
    const isVerified = Boolean(event.is_verified || event.verification_status === 'VERIFIED');
    const verificationStatus = event.verification_status || (isVerified ? 'VERIFIED' : 'UNVERIFIED');
    const lifecycleStatus = event.lifecycle_status || event.status || 'UPCOMING';
    const archiveStatus = event.archive_status || 'ACTIVE';
    const publicVisibility = event.public_visibility !== false;
    const meta = event.metadata || {};

    const insertSql = `
      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category, start_date, start_datetime,
        venue_name, city, is_verified, verification_status, lifecycle_status,
        archive_status, public_visibility, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *;
    `;
    try {
      const res = await queryExecutor.query(insertSql, [
        eventId, slug, name, eventType, category, startDate, startDatetime,
        venueName, city, isVerified, verificationStatus, lifecycleStatus,
        archiveStatus, publicVisibility, JSON.stringify(meta)
      ]);
      return res.rows[0];
    } catch (_) {
      return null;
    }
  }

  async ensureUserExists(userId, client = null) {
    if (!userId) return null;
    const queryExecutor = client || this;
    try {
      const uRes = await queryExecutor.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (uRes.rows && uRes.rows.length > 0) return uRes.rows[0];
    } catch (_) {}

    let user = null;
    try {
      const { state } = require('../database');
      if (state && state.users) {
        user = state.users.find(u => u.id === userId);
      }
    } catch (_) {}

    if (!user) return null;

    const email = user.email || `${userId}@user.tikum.app`;
    const normEmail = email.toLowerCase().trim();
    const name = user.name || user.display_name || 'Pengguna Tikum';
    const role = user.role || 'SELLER';
    const status = user.status || 'ACTIVE';
    const metadata = user.metadata || {};

    const insertSql = `
      INSERT INTO users (
        id, email, normalized_email, name, role, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        updated_at = NOW()
      RETURNING *;
    `;
    try {
      const res = await queryExecutor.query(insertSql, [
        userId, email, normEmail, name, role, status, JSON.stringify(metadata)
      ]);
      return res.rows[0];
    } catch (_) {
      return null;
    }
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

    try {
      const eventId = ticketData.canonical_event_id || ticketData.event_id;
      const sellerId = ticketData.seller_id || ticketData.original_owner_id;
      if (sellerId) await this.ensureUserExists(sellerId);
      if (eventId) await this.ensureEventExists(eventId);

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
        eventId,
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
        typeof ticketData.locked_by === 'string' ? ticketData.locked_by.slice(0, 64) : null,
        ticketData.barcode_hash || null,
        JSON.stringify(ticketData.metadata || {})
      ];

      const res = await this.query(sql, params);
      return res.rows[0];
    } catch (err) {
      throw this.sanitizeDbError(err);
    }
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
    const lockedByStr = typeof lockedBy === 'string' ? lockedBy.slice(0, 64) : (lockedBy?.locked_by ? String(lockedBy.locked_by).slice(0, 64) : null);
    const extraMeta = typeof lockedBy === 'object' && lockedBy !== null ? lockedBy : null;
    const sql = `
      UPDATE marketplace_tickets
      SET status = $2,
          locked_by = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE locked_by END,
          metadata = CASE WHEN $4::text IS NOT NULL THEN COALESCE(metadata, '{}'::jsonb) || $4::jsonb ELSE metadata END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [ticketId, status, lockedByStr, extraMeta ? JSON.stringify(extraMeta) : null]);
      return res.rows[0] || null;
    } catch (err) {
      throw this.sanitizeDbError(err);
    }
  }

  async createTicketAndListing({ ticketData, listingData }) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.createTicketAndListing({ ticketData, listingData });
    }

    try {
      return await this.withTransaction(async (client) => {
        const eventId = ticketData.canonical_event_id || ticketData.event_id || listingData.canonical_event_id || listingData.event_id;
        const sellerId = ticketData.seller_id || listingData.seller_id;

        // 1. Ensure parent user exists
        if (sellerId) {
          await this.ensureUserExists(sellerId, client);
        }

        // 2. Ensure parent event exists
        if (eventId) {
          await this.ensureEventExists(eventId, client);
        }

        // 3. Insert parent ticket FIRST
        const ticketId = ticketData.id || ticketData.ticket_id || `tkt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const ticketSql = `
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
        const ticketParams = [
          ticketId,
          ticketData.seller_id || ticketData.original_owner_id,
          ticketData.current_owner_id || ticketData.seller_id || ticketData.original_owner_id,
          eventId,
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
          typeof ticketData.locked_by === 'string' ? ticketData.locked_by.slice(0, 64) : null,
          ticketData.barcode_hash || null,
          JSON.stringify(ticketData.metadata || {})
        ];
        const tktRes = await client.query(ticketSql, ticketParams);
        const persistedTicket = tktRes.rows[0];

        // 4. Insert child listing SECOND referencing persisted ticket ID
        const listingId = listingData.id || listingData.listing_id || `list-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const listingSql = `
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
        const listingParams = [
          listingId,
          persistedTicket.id,
          sellerId,
          eventId,
          listingData.price,
          listingData.currency || 'IDR',
          listingData.status || 'ACTIVE',
          listingData.expires_at || null,
          listingData.pricing_policy_version || 'TIKUM_FEE_POLICY_V1',
          JSON.stringify(listingData.metadata || {})
        ];
        const listRes = await client.query(listingSql, listingParams);
        const persistedListing = listRes.rows[0];

        return { ticket: persistedTicket, listing: persistedListing };
      });
    } catch (err) {
      throw this.sanitizeDbError(err);
    }
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

    const eventId = listingData.canonical_event_id || listingData.event_id;
    if (eventId) {
      const evRes = await this.query(
        'SELECT id, lifecycle_status, archive_status, start_date, end_date, end_datetime, timezone FROM canonical_events WHERE id = $1',
        [eventId]
      );
      if (evRes.rows.length > 0) {
        const ev = evRes.rows[0];
        const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
        if (ev.lifecycle_status === 'COMPLETED' || ev.lifecycle_status === 'ARCHIVED' || ev.archive_status === 'ARCHIVED' || EventTemporalLifecycleEngine.isEventExpired(ev)) {
          const err = new Error(`Cannot create listing for concluded or expired event '${eventId}'`);
          err.code = 'EVENT_EXPIRED';
          throw err;
        }
      }
    }

    try {
      if (listingData.seller_id) await this.ensureUserExists(listingData.seller_id);
      if (eventId) await this.ensureEventExists(eventId);

      if (listingData.ticket_id) {
        const tCheck = await this.query('SELECT id FROM marketplace_tickets WHERE id = $1', [listingData.ticket_id]);
        if (!tCheck || !tCheck.rows || tCheck.rows.length === 0) {
          const err = new Error(`Parent ticket '${listingData.ticket_id}' not found in database.`);
          err.code = 'PARENT_TICKET_MISSING';
          err.statusCode = 400;
          throw err;
        }
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
    } catch (err) {
      throw this.sanitizeDbError(err);
    }
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

  async updateListingInventory(listingId, updates = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.updateListingInventory(listingId, updates);
    }
    const current = await this.getListingById(listingId);
    if (!current) return null;
    let meta = current.metadata || {};
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
    }
    if (updates.available_quantity !== undefined) meta.available_quantity = updates.available_quantity;
    if (updates.reserved_quantity !== undefined) meta.reserved_quantity = updates.reserved_quantity;
    if (updates.sold_quantity !== undefined) meta.sold_quantity = updates.sold_quantity;
    if (updates.total_quantity !== undefined) meta.total_quantity = updates.total_quantity;
    if (updates.fulfillment_type) meta.fulfillment_type = updates.fulfillment_type;
    if (updates.pic_assistance_status) meta.pic_assistance_status = updates.pic_assistance_status;

    const newStatus = updates.status || current.status;
    const sql = `
      UPDATE marketplace_listings
      SET status = $2, metadata = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [listingId, newStatus, JSON.stringify(meta)]);
    return res.rows[0] || null;
  }

  async atomicReserveInventory(listingId, requestedQty = 1) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.atomicReserveInventory(listingId, requestedQty);
    }

    const checkListing = await this.query(
      `SELECT l.id, l.status, l.metadata, l.canonical_event_id, e.lifecycle_status, e.archive_status, e.start_date, e.end_date, e.end_datetime, e.timezone
       FROM marketplace_listings l
       LEFT JOIN canonical_events e ON e.id = l.canonical_event_id
       WHERE l.id = $1`,
      [listingId]
    );
    if (checkListing.rows.length === 0) {
      const err = new Error(`Listing '${listingId}' not found`);
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }
    const currentListing = checkListing.rows[0];
    if (currentListing.lifecycle_status) {
      const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
      if (currentListing.lifecycle_status === 'COMPLETED' || currentListing.lifecycle_status === 'ARCHIVED' || currentListing.archive_status === 'ARCHIVED' || EventTemporalLifecycleEngine.isEventExpired(currentListing)) {
        const err = new Error(`Cannot reserve tickets for concluded or expired event`);
        err.code = 'EVENT_EXPIRED';
        throw err;
      }
    }

    const req = Math.max(1, parseInt(requestedQty, 10) || 1);

    const sql = `
      UPDATE marketplace_listings
      SET metadata = jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{available_quantity}',
              to_jsonb(GREATEST(0, COALESCE((metadata->>'available_quantity')::int, 1) - $2))
            ),
            '{reserved_quantity}',
            to_jsonb(COALESCE((metadata->>'reserved_quantity')::int, 0) + $2)
          ),
          status = CASE 
                     WHEN COALESCE((metadata->>'available_quantity')::int, 1) - $2 <= 0 THEN 'RESERVED'
                     ELSE status 
                   END,
          updated_at = NOW()
      WHERE id = $1
        AND status = 'ACTIVE'
        AND COALESCE((metadata->>'available_quantity')::int, 1) >= $2
      RETURNING *;
    `;
    const res = await this.query(sql, [listingId, req]);
    if (res.rowCount === 0) {
      const checkRes = await this.query('SELECT id, status, metadata FROM marketplace_listings WHERE id = $1', [listingId]);
      if (checkRes.rowCount === 0) {
        const err = new Error(`Listing '${listingId}' not found`);
        err.code = 'LISTING_NOT_FOUND';
        throw err;
      }
      const row = checkRes.rows[0];
      if (row.status !== 'ACTIVE') {
        const err = new Error(`Listing '${listingId}' is not available for purchase (status: ${row.status})`);
        err.code = 'LISTING_NOT_ACTIVE';
        throw err;
      }
      let meta = row.metadata || {};
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
      }
      const avail = meta.available_quantity !== undefined ? parseInt(meta.available_quantity, 10) : 1;
      const err = new Error(`Hanya tersisa ${avail} tiket untuk listing ini (diminta: ${req})`);
      err.code = 'INSUFFICIENT_INVENTORY';
      throw err;
    }
    return res.rows[0];
  }

  async atomicReleaseInventory(listingId, quantity = 1) {
    await this.ensureInitialized();
    if (this.degraded) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw new Error('[MarketplaceRepository] Production database is degraded / unavailable.');
      }
      return this.fallbackRepo.atomicReleaseInventory(listingId, quantity);
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const sql = `
      UPDATE marketplace_listings
      SET metadata = jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{available_quantity}',
              to_jsonb(COALESCE((metadata->>'available_quantity')::int, 0) + $2)
            ),
            '{reserved_quantity}',
            to_jsonb(GREATEST(0, COALESCE((metadata->>'reserved_quantity')::int, 0) - $2))
          ),
          status = CASE 
                     WHEN status = 'RESERVED' AND (COALESCE((metadata->>'available_quantity')::int, 0) + $2) > 0 THEN 'ACTIVE'
                     ELSE status 
                   END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [listingId, qty]);
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
    const { isPrelaunchListingMode } = require('../config/marketplaceMode');
    const isPrelaunch = isPrelaunchListingMode();
    const statusCondition = isPrelaunch
      ? "(status = 'ACTIVE' OR status = 'APPROVED_PRELAUNCH')"
      : "status = 'ACTIVE'";

    if (canonicalEventId) {
      const res = await this.query(
        `SELECT * FROM marketplace_listings WHERE canonical_event_id = $1 AND ${statusCondition} ORDER BY price ASC`,
        [canonicalEventId]
      );
      return res.rows;
    }
    const res = await this.query(`SELECT * FROM marketplace_listings WHERE ${statusCondition} ORDER BY created_at DESC`);
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

  // --- EVENT PIC ASSIGNMENTS (Epic PIC-01) ---

  async createPicAssignment(data) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.createPicAssignment(data);
    }
    const id = data.id || `pic-assign-${crypto.randomUUID().substring(0, 8)}`;
    const sql = `
      INSERT INTO event_pic_assignments (
        id, event_id, venue_id, pic_user_id, event_date, status, contact_phone, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        contact_phone = EXCLUDED.contact_phone,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `;
    const res = await this.query(sql, [
      id,
      data.event_id || data.eventId,
      data.venue_id || data.venueId,
      data.pic_user_id || data.picUserId,
      data.event_date || data.eventDate || null,
      (data.status || 'ACTIVE').toUpperCase(),
      data.contact_phone || data.contactPhone || null,
      data.notes || null
    ]);
    return res && res.rows[0] ? res.rows[0] : null;
  }

  async getPicAssignmentById(id) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getPicAssignmentById(id);
    }
    const res = await this.query('SELECT * FROM event_pic_assignments WHERE id = $1', [id]);
    return res && res.rows[0] ? res.rows[0] : null;
  }

  async listPicAssignments(filter = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listPicAssignments(filter);
    }
    let sql = 'SELECT * FROM event_pic_assignments WHERE 1=1';
    const params = [];
    let idx = 1;
    if (filter.event_id || filter.eventId) {
      sql += ` AND event_id = $${idx++}`;
      params.push(filter.event_id || filter.eventId);
    }
    if (filter.pic_user_id || filter.picUserId) {
      sql += ` AND pic_user_id = $${idx++}`;
      params.push(filter.pic_user_id || filter.picUserId);
    }
    if (filter.status) {
      sql += ` AND status = $${idx++}`;
      params.push(filter.status.toUpperCase());
    }
    sql += ' ORDER BY created_at DESC;';
    const res = await this.query(sql, params);
    return res ? res.rows : [];
  }

  async updatePicAssignmentStatus(id, status) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.updatePicAssignmentStatus(id, status);
    }
    const sql = `
      UPDATE event_pic_assignments
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.query(sql, [id, (status || 'INACTIVE').toUpperCase()]);
    return res && res.rows[0] ? res.rows[0] : null;
  }

  // Buyer Inquiries / Lead Capture (Phase 1 Manual Marketplace)
  async createBuyerInquiry(inquiryData) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.createBuyerInquiry(inquiryData);
    }
    const id = inquiryData.id || `inq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sql = `
      INSERT INTO buyer_inquiries (
        id, listing_id, buyer_id, seller_id, event_id, ticket_id,
        quantity, proposed_price, message, buyer_name, buyer_email,
        contact_phone, follow_up_status, notification_status, metadata,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *;
    `;
    const params = [
      id,
      inquiryData.listing_id,
      inquiryData.buyer_id,
      inquiryData.seller_id,
      inquiryData.event_id || null,
      inquiryData.ticket_id || null,
      inquiryData.quantity || inquiryData.requested_quantity || 1,
      inquiryData.proposed_price || inquiryData.offer_amount || null,
      inquiryData.message || null,
      inquiryData.buyer_name || null,
      inquiryData.buyer_email || null,
      inquiryData.contact_phone || inquiryData.contact_whatsapp || null,
      inquiryData.follow_up_status || 'PENDING_FOLLOWUP',
      inquiryData.notification_status || 'PENDING',
      JSON.stringify(inquiryData.metadata || {})
    ];
    try {
      const res = await this.query(sql, params);
      return res && res.rows[0] ? res.rows[0] : inquiryData;
    } catch (err) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw err;
      }
      return this.fallbackRepo.createBuyerInquiry(inquiryData);
    }
  }

  async getBuyerInquiryById(inquiryId) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.getBuyerInquiryById(inquiryId);
    }
    const sql = 'SELECT * FROM buyer_inquiries WHERE id = $1;';
    const res = await this.query(sql, [inquiryId]);
    return res && res.rows[0] ? res.rows[0] : null;
  }

  async listBuyerInquiries(filter = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.listBuyerInquiries(filter);
    }
    let sql = 'SELECT * FROM buyer_inquiries WHERE 1=1';
    const params = [];
    let idx = 1;
    if (filter.listing_id || filter.listingId) {
      sql += ` AND listing_id = $${idx++}`;
      params.push(filter.listing_id || filter.listingId);
    }
    if (filter.buyer_id || filter.buyerId) {
      sql += ` AND buyer_id = $${idx++}`;
      params.push(filter.buyer_id || filter.buyerId);
    }
    if (filter.seller_id || filter.sellerId) {
      sql += ` AND seller_id = $${idx++}`;
      params.push(filter.seller_id || filter.sellerId);
    }
    if (filter.status || filter.follow_up_status) {
      sql += ` AND follow_up_status = $${idx++}`;
      params.push((filter.status || filter.follow_up_status).toUpperCase());
    }
    sql += ' ORDER BY created_at DESC;';
    const res = await this.query(sql, params);
    return res ? res.rows : [];
  }

  async updateBuyerInquiryStatus(inquiryId, status, metadata = {}) {
    await this.ensureInitialized();
    if (this.degraded) {
      return this.fallbackRepo.updateBuyerInquiryStatus(inquiryId, status, metadata);
    }
    const sql = `
      UPDATE buyer_inquiries
      SET follow_up_status = $2,
          admin_notes = COALESCE($3, admin_notes),
          notification_status = COALESCE($4, notification_status),
          notification_error = COALESCE($5, notification_error),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const params = [
      inquiryId,
      status,
      metadata.admin_notes || null,
      metadata.notification_status || null,
      metadata.notification_error || null
    ];
    const res = await this.query(sql, params);
    return res && res.rows[0] ? res.rows[0] : null;
  }
}

module.exports = { PostgresMarketplaceRepository };
