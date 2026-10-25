/**
 * TIKUM / ARGUS — Neon PostgreSQL Catalog Repository Adapter
 *
 * Implements CatalogRepository against PostgreSQL / Neon serverless.
 * Architecture & Safety Invariants:
 * - Connection pooling: max 1 client per lambda container to avoid exhaustion
 * - Parameterized queries only (ZERO string interpolation)
 * - Safe migration runner (reads migrations/001_catalog_schema.sql)
 * - Fail-closed / Graceful degradation: falls back to in-memory mode if DB down (degraded: true)
 * - Anti-resurrection logic on upsert
 * - Postgres Advisory Locking (pg_try_advisory_lock) for concurrency control
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { CatalogRepository } = require('./CatalogRepository');
const { InMemoryCatalogRepository } = require('./InMemoryCatalogRepository');
const { EventVisualProvenanceService } = require('../EventVisualProvenanceService');

const CANONICAL_EVENT_SELECT_FIELDS = `
  id, slug, canonical_name, event_type, category,
  start_date, start_datetime, end_date, end_datetime, timezone,
  venue_name, venue_city, city, province, country,
  organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
  min_price, max_price, is_verified, verification_status,
  lifecycle_status, archive_status, archived_at,
  public_visibility, homepage_visibility,
  (metadata - 'observations') AS metadata,
  created_at, updated_at
`.replace(/\s+/g, ' ').trim();

class PostgresCatalogRepository extends CatalogRepository {
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
    this.readOnly = options.readOnly === true || process.env.ARGUS_DB_READ_ONLY === 'true';
    this.skipMigrations = options.skipMigrations === true || this.readOnly || process.env.ARGUS_SKIP_MIGRATIONS === 'true';
    this.pool = null;
    this.fallbackRepo = new InMemoryCatalogRepository();
    this.degraded = false;
    this.initialized = false;
  }

  async init() {
    if (!this.connectionString) {
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
        max: 3, // Sized to allow advisory lock client + active transaction/query clients without pool starvation
        idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 10000,
        connectionTimeoutMillis: 5000
      });

      // Test connection
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      // Execute migration 001 only when explicitly permitted (never implicitly mutate production schema in read-only mode)
      if (!this.readOnly && !this.skipMigrations) {
        await this.runMigrations();
      }

      this.initialized = true;
      this.degraded = false;
      return true;
    } catch (err) {
      console.warn(`[CatalogRepository] PostgreSQL connection/migration failed: ${err.message}. Falling back to in-memory mode.`);
      this.degraded = true;
      await this.fallbackRepo.init();
      this.initialized = true;
      return false;
    }
  }

  async runMigrations() {
    if (this.readOnly || this.skipMigrations) return;
    const migrationPath = path.resolve(__dirname, '../../../migrations/001_catalog_schema.sql');
    if (!fs.existsSync(migrationPath)) {
      return;
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const client = await this.pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }

  async query(text, params = []) {
    if (this.degraded || !this.pool) {
      return null;
    }
    if (this.readOnly) {
      const normalized = String(text || '').trim().toUpperCase();
      if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        throw new Error('[CatalogRepository] Write query blocked by ARGUS_DB_READ_ONLY safety gate');
      }
    }
    try {
      return await this.pool.query(text, params);
    } catch (err) {
      console.error(`[CatalogRepository] Query error: ${err.message}`);
      throw err;
    }
  }

  async getEventById(id) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getEventById(id);
    }
    try {
      const res = await this.query(`SELECT ${CANONICAL_EVENT_SELECT_FIELDS} FROM canonical_events WHERE id = $1`, [id]);
      return res.rows[0] ? this.mapRowToEvent(res.rows[0]) : null;
    } catch (_) {
      return this.fallbackRepo.getEventById(id);
    }
  }

  async getEventBySlug(slug) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getEventBySlug(slug);
    }
    try {
      const res = await this.query(`SELECT ${CANONICAL_EVENT_SELECT_FIELDS} FROM canonical_events WHERE slug = $1`, [slug]);
      return res.rows[0] ? this.mapRowToEvent(res.rows[0]) : null;
    } catch (_) {
      return this.fallbackRepo.getEventBySlug(slug);
    }
  }

  async getAllEvents() {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getAllEvents();
    }
    try {
      const res = await this.query(`SELECT ${CANONICAL_EVENT_SELECT_FIELDS} FROM canonical_events ORDER BY start_date ASC`);
      return res.rows.map(r => this.mapRowToEvent(r));
    } catch (_) {
      return this.fallbackRepo.getAllEvents();
    }
  }

  async getUpcomingEvents(now = new Date()) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getUpcomingEvents(now);
    }
    try {
      const nowDateStr = (now instanceof Date ? now : new Date(now)).toISOString().substring(0, 10);
      const res = await this.query(
        `SELECT ${CANONICAL_EVENT_SELECT_FIELDS} FROM canonical_events
         WHERE archive_status != 'ARCHIVED'
           AND lifecycle_status != 'ARCHIVED'
           AND start_date >= $1
         ORDER BY start_date ASC`,
        [nowDateStr]
      );
      return res.rows.map(r => this.mapRowToEvent(r));
    } catch (_) {
      return this.fallbackRepo.getUpcomingEvents(now);
    }
  }

  async getArchivedEvents() {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getArchivedEvents();
    }
    try {
      const res = await this.query(
        `SELECT ${CANONICAL_EVENT_SELECT_FIELDS} FROM canonical_events
         WHERE archive_status = 'ARCHIVED' OR lifecycle_status = 'ARCHIVED'
         ORDER BY start_date DESC`
      );
      return res.rows.map(r => this.mapRowToEvent(r));
    } catch (_) {
      return this.fallbackRepo.getArchivedEvents();
    }
  }

  async getEventWithObservations(id) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getEventById(id);
    }
    try {
      const res = await this.query('SELECT * FROM canonical_events WHERE id = $1', [id]);
      return res.rows[0] ? this.mapRowToEvent(res.rows[0]) : null;
    } catch (_) {
      return this.fallbackRepo.getEventById(id);
    }
  }

  async upsertCanonicalEvent(eventData) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.upsertCanonicalEvent(eventData);
    }

    let id = eventData.id || eventData.event_id;
    const slug = eventData.slug;

    // Check anti-resurrection and retrieve existing event for preservation
    const existing = (id ? await this.getEventById(id) : null) || (slug ? await this.getEventBySlug(slug) : null);
    if (existing && existing.id) {
      id = existing.id;
    }
    if (!id) throw new Error('Event must have an id');

    const title = eventData.canonical_name || eventData.title || eventData.name;
    const eventType = eventData.event_type || eventData.category || 'CONCERT';
    const category = eventData.category || eventType;
    const startDate = eventData.start_date || (eventData.start_datetime ? eventData.start_datetime.substring(0, 10) : null);
    const startDatetime = eventData.start_datetime || null;
    const endDate = eventData.end_date || null;
    const endDatetime = eventData.end_datetime || null;
    const timezone = eventData.timezone || 'Asia/Jakarta';
    const venueName = eventData.venue_name || eventData.venue || 'TBA';
    const venueCity = eventData.venue_city || eventData.city || null;
    const city = eventData.city || 'Jakarta';
    const province = eventData.province || null;
    const country = eventData.country || 'Indonesia';
    const organizer = eventData.organizer_name || eventData.organizer || null;
    const officialEventUrl = eventData.official_event_url || null;
    const officialTicketUrl = eventData.official_ticket_url || null;
    const ticketingProvider = eventData.official_ticketing_provider || null;
    const minPrice = eventData.min_price || null;
    const maxPrice = eventData.max_price || null;
    const isVerified = eventData.is_verified === true;
    const verificationStatus = eventData.verification_status || (isVerified ? 'VERIFIED' : 'UNVERIFIED');
    let lifecycleStatus = eventData.lifecycle_status || 'UPCOMING';
    let archiveStatus = eventData.archive_status || 'ACTIVE';
    const archivedAt = eventData.archived_at || null;
    const publicVisibility = eventData.public_visibility !== false;
    let homepageVisibility = eventData.homepage_visibility === true;

    const existingMeta = existing ? (existing.metadata || {}) : {};

    if (existing) {
      const isTerminal = (
        existing.archive_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'ARCHIVED' ||
        existing.lifecycle_status === 'COMPLETED'
      );
      if (isTerminal && (lifecycleStatus === 'UPCOMING' || !eventData.lifecycle_status)) {
        archiveStatus = 'ARCHIVED';
        lifecycleStatus = existing.lifecycle_status;
        homepageVisibility = false;
      }
    }

    const resolvedIncomingImg = EventVisualProvenanceService.resolveCatalogEventImageProvenance(
      {
        ...eventData,
        id,
        event_id: id,
        official_event_url: officialEventUrl,
        official_ticket_url: officialTicketUrl,
        official_ticketing_provider: ticketingProvider,
        organizer_name: organizer,
        is_verified: isVerified
      },
      { ...existingMeta, ...(eventData.metadata || {}) }
    );
    const preferredImg = existing
      ? EventVisualProvenanceService.selectPreferredImage(existing, { ...eventData, ...resolvedIncomingImg })
      : resolvedIncomingImg;

    const imageUrl = preferredImg.image_url || null;

    const metadataObj = {
      ...existingMeta,
      ...(eventData.metadata || {}),
      artist: eventData.artist || (eventData.metadata && eventData.metadata.artist) || existingMeta.artist || null,
      artists: Array.isArray(eventData.artists) && eventData.artists.length > 0
        ? eventData.artists
        : (eventData.metadata && Array.isArray(eventData.metadata.artists) ? eventData.metadata.artists : (existingMeta.artists || (eventData.artist ? [eventData.artist] : []))),
      image_url: imageUrl,
      poster_url: imageUrl,
      event_image: imageUrl,
      thumbnail_url: preferredImg.thumbnail_url || imageUrl,
      image_verified: preferredImg.image_verified ?? Boolean(imageUrl),
      image_verified_at: preferredImg.image_verified_at || null,
      image_status: preferredImg.image_status || (imageUrl ? 'VERIFIED_AUTHORIZED_SELLER' : 'MISSING'),
      image_type: eventData.image_type || (eventData.metadata && eventData.metadata.image_type) || existingMeta.image_type || (imageUrl ? 'OFFICIAL_POSTER' : null),
      image_confidence: eventData.image_confidence || (eventData.metadata && eventData.metadata.image_confidence) || existingMeta.image_confidence || (imageUrl ? 'HIGH' : null),
      image_source_type: preferredImg.image_source_type || null,
      image_source_url: preferredImg.image_source_url || null,
      image_credit: preferredImg.image_credit || null,
      image_attribution: preferredImg.image_attribution || null,
      broken_image_url: preferredImg.broken_image_url || null,
      image_license_status: eventData.image_license_status || (eventData.metadata && eventData.metadata.image_license_status) || existingMeta.image_license_status || null,
      is_fallback_image: preferredImg.is_fallback_image ?? !imageUrl,
      fallback_meta: eventData.fallback_meta || (eventData.metadata && eventData.metadata.fallback_meta) || existingMeta.fallback_meta || null,
      description: eventData.description || (eventData.metadata && eventData.metadata.description) || existingMeta.description || null,
      event_history: (Array.isArray(eventData.event_history) ? eventData.event_history : (eventData.metadata && Array.isArray(eventData.metadata.event_history) ? eventData.metadata.event_history : (Array.isArray(existingMeta.event_history) ? existingMeta.event_history : []))).slice(-10),
      observations: (Array.isArray(eventData.observations) ? eventData.observations : (eventData.metadata && Array.isArray(eventData.metadata.observations) ? eventData.metadata.observations : (Array.isArray(existingMeta.observations) ? existingMeta.observations : []))).slice(-10),
      sources: Array.isArray(eventData.sources) ? eventData.sources : (eventData.metadata && Array.isArray(eventData.metadata.sources) ? eventData.metadata.sources : (Array.isArray(existingMeta.sources) ? existingMeta.sources : [])),
      conflicts: Array.isArray(eventData.conflicts) ? eventData.conflicts : (eventData.metadata && Array.isArray(eventData.metadata.conflicts) ? eventData.metadata.conflicts : (Array.isArray(existingMeta.conflicts) ? existingMeta.conflicts : [])),
      field_provenance: eventData.field_provenance || (eventData.metadata && eventData.metadata.field_provenance) || existingMeta.field_provenance || {},
      verification_reasons: Array.isArray(eventData.verification_reasons) ? eventData.verification_reasons : (eventData.metadata && Array.isArray(eventData.metadata.verification_reasons) ? eventData.verification_reasons : (Array.isArray(existingMeta.verification_reasons) ? existingMeta.verification_reasons : [])),
      event_quality_score: eventData.event_quality_score ?? (eventData.metadata && eventData.metadata.event_quality_score) ?? existingMeta.event_quality_score ?? null,
      marketplace_eligibility: eventData.marketplace_eligibility || (eventData.metadata && eventData.metadata.marketplace_eligibility) || existingMeta.marketplace_eligibility || null,
      quality_factors: eventData.quality_factors || (eventData.metadata && eventData.metadata.quality_factors) || existingMeta.quality_factors || null
    };
    const metadata = JSON.stringify(metadataObj);

    const sql = `
      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, archived_at,
        public_visibility, homepage_visibility, metadata, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26,
        $27, $28, $29, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        event_type = EXCLUDED.event_type,
        category = EXCLUDED.category,
        start_date = EXCLUDED.start_date,
        start_datetime = EXCLUDED.start_datetime,
        end_date = EXCLUDED.end_date,
        end_datetime = EXCLUDED.end_datetime,
        timezone = EXCLUDED.timezone,
        venue_name = EXCLUDED.venue_name,
        venue_city = EXCLUDED.venue_city,
        city = EXCLUDED.city,
        province = EXCLUDED.province,
        country = EXCLUDED.country,
        organizer_name = EXCLUDED.organizer_name,
        official_event_url = COALESCE(EXCLUDED.official_event_url, canonical_events.official_event_url),
        official_ticket_url = COALESCE(EXCLUDED.official_ticket_url, canonical_events.official_ticket_url),
        official_ticketing_provider = COALESCE(EXCLUDED.official_ticketing_provider, canonical_events.official_ticketing_provider),
        min_price = COALESCE(EXCLUDED.min_price, canonical_events.min_price),
        max_price = COALESCE(EXCLUDED.max_price, canonical_events.max_price),
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = CASE
          WHEN canonical_events.archive_status = 'ARCHIVED' THEN canonical_events.lifecycle_status
          ELSE EXCLUDED.lifecycle_status
        END,
        archive_status = CASE
          WHEN canonical_events.archive_status = 'ARCHIVED' THEN 'ARCHIVED'
          ELSE EXCLUDED.archive_status
        END,
        archived_at = COALESCE(EXCLUDED.archived_at, canonical_events.archived_at),
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = CASE
          WHEN canonical_events.archive_status = 'ARCHIVED' THEN FALSE
          ELSE EXCLUDED.homepage_visibility
        END,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING ${CANONICAL_EVENT_SELECT_FIELDS};
    `;

    const params = [
      id, slug, title, eventType, category,
      startDate, startDatetime, endDate, endDatetime, timezone,
      venueName, venueCity, city, province, country,
      organizer, officialEventUrl, officialTicketUrl, ticketingProvider,
      minPrice, maxPrice, isVerified, verificationStatus,
      lifecycleStatus, archiveStatus, archivedAt,
      publicVisibility, homepageVisibility, metadata
    ];

    try {
      const res = await this.query(sql, params);
      const row = res.rows[0];
      const event = this.mapRowToEvent(row);
      // also keep in-memory fallback in sync
      this.fallbackRepo.upsertCanonicalEvent(event);
      return event;
    } catch (err) {
      console.warn(`[CatalogRepository] Database upsert failed: ${err.message}. Saving to fallback.`);
      return this.fallbackRepo.upsertCanonicalEvent(eventData);
    }
  }

  async upsertEvent(eventData) {
    return this.upsertCanonicalEvent(eventData);
  }

  async insertEventIfAbsent(eventData) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.insertEventIfAbsent(eventData);
    }
    const id = eventData.id || eventData.event_id;
    const existing = await this.getEventById(id);
    if (existing) {
      return { inserted: false, event: existing };
    }
    const event = await this.upsertCanonicalEvent(eventData);
    return { inserted: true, event };
  }

  async attachSourceLink(linkData) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.attachSourceLink(linkData);
    }
    const rawId = linkData.id || `${linkData.event_id}_${linkData.source_id}_${linkData.source_record_id || 'default'}`;
    const id = rawId.length <= 64 ? rawId : `esl-${crypto.createHash('sha256').update(rawId).digest('hex').substring(0, 56)}`;
    const sql = `
      INSERT INTO event_source_links (
        id, event_id, source_id, source_record_id, role, tier, source_url, ticket_url, confidence, attached_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (event_id, source_id, source_record_id) DO UPDATE SET
        source_url = COALESCE(EXCLUDED.source_url, event_source_links.source_url),
        ticket_url = COALESCE(EXCLUDED.ticket_url, event_source_links.ticket_url),
        confidence = EXCLUDED.confidence
      RETURNING *;
    `;
    const params = [
      id,
      linkData.event_id,
      linkData.source_id,
      linkData.source_record_id || null,
      linkData.role || 'DISCOVERY',
      linkData.tier || 2,
      linkData.source_url || null,
      linkData.ticket_url || null,
      linkData.confidence || 1.0
    ];
    try {
      const res = await this.query(sql, params);
      return res.rows[0];
    } catch (_) {
      return this.fallbackRepo.attachSourceLink(linkData);
    }
  }

  async getSourceLinksForEvent(eventId) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getSourceLinksForEvent(eventId);
    }
    try {
      const res = await this.query('SELECT * FROM event_source_links WHERE event_id = $1', [eventId]);
      return res.rows;
    } catch (_) {
      return this.fallbackRepo.getSourceLinksForEvent(eventId);
    }
  }

  async recordReconciliationRun(runData) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.recordReconciliationRun(runData);
    }
    const id = runData.id || `rec-run-${Date.now()}`;
    const sql = `
      INSERT INTO reconciliation_runs (
        id, trigger_type, started_at, status, records_discovered, records_ingested, duplicates_merged, error_count, report, run_by
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const params = [
      id,
      runData.trigger_type || 'CRON',
      runData.status || 'RUNNING',
      runData.records_discovered || 0,
      runData.records_ingested || 0,
      runData.duplicates_merged || 0,
      runData.error_count || 0,
      JSON.stringify(runData.report || {}),
      runData.run_by || 'SYSTEM'
    ];
    try {
      const res = await this.query(sql, params);
      return res.rows[0];
    } catch (_) {
      return this.fallbackRepo.recordReconciliationRun(runData);
    }
  }

  async updateReconciliationRun(id, updateData) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.updateReconciliationRun(id, updateData);
    }
    const sql = `
      UPDATE reconciliation_runs SET
        status = COALESCE($2, status),
        records_discovered = COALESCE($3, records_discovered),
        records_ingested = COALESCE($4, records_ingested),
        duplicates_merged = COALESCE($5, duplicates_merged),
        error_count = COALESCE($6, error_count),
        report = COALESCE($7, report),
        completed_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const params = [
      id,
      updateData.status || null,
      updateData.records_discovered !== undefined ? updateData.records_discovered : null,
      updateData.records_ingested !== undefined ? updateData.records_ingested : null,
      updateData.duplicates_merged !== undefined ? updateData.duplicates_merged : null,
      updateData.error_count !== undefined ? updateData.error_count : null,
      updateData.report ? JSON.stringify(updateData.report) : null
    ];
    try {
      const res = await this.query(sql, params);
      return res.rows[0];
    } catch (_) {
      return this.fallbackRepo.updateReconciliationRun(id, updateData);
    }
  }

  async acquireAdvisoryLock(lockId) {
    if (this.readOnly || this.degraded || !this.pool) {
      return this.fallbackRepo.acquireAdvisoryLock(lockId);
    }
    try {
      // Postgres advisory lock ID must be a signed 64-bit int or 32-bit int
      const numericId = typeof lockId === 'number' ? lockId : 17913001;
      if (!this._lockClients) this._lockClients = new Map();

      // If this instance already holds the lock on a client, return false to prevent re-entrancy
      if (this._lockClients.has(numericId)) {
        return false;
      }

      const client = await this.pool.connect();
      try {
        const res = await client.query('SELECT pg_try_advisory_lock($1) as locked', [numericId]);
        if (res.rows[0] && res.rows[0].locked === true) {
          this._lockClients.set(numericId, client);
          return true;
        }
        client.release();
        return false;
      } catch (err) {
        client.release();
        throw err;
      }
    } catch (_) {
      return this.fallbackRepo.acquireAdvisoryLock(lockId);
    }
  }

  async releaseAdvisoryLock(lockId) {
    if (this.readOnly || this.degraded || !this.pool) {
      return this.fallbackRepo.releaseAdvisoryLock(lockId);
    }
    try {
      const numericId = typeof lockId === 'number' ? lockId : 17913001;
      if (this._lockClients && this._lockClients.has(numericId)) {
        const client = this._lockClients.get(numericId);
        this._lockClients.delete(numericId);
        try {
          const res = await client.query('SELECT pg_advisory_unlock($1) as unlocked', [numericId]);
          return res.rows[0] && res.rows[0].unlocked === true;
        } finally {
          client.release();
        }
      }
      const res = await this.query('SELECT pg_advisory_unlock($1) as unlocked', [numericId]);
      return res.rows[0] && res.rows[0].unlocked === true;
    } catch (_) {
      return this.fallbackRepo.releaseAdvisoryLock(lockId);
    }
  }

  async _ensureSchedulerStateTable() {
    if (this._schedulerTableEnsured) return;
    await this.query(`
      CREATE TABLE IF NOT EXISTS discovery_scheduler_state (
        job_name TEXT PRIMARY KEY,
        source_cursor INTEGER NOT NULL DEFAULT 0,
        page_cursor INTEGER NOT NULL DEFAULT 1,
        last_source_id TEXT,
        lease_owner TEXT,
        lease_acquired_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        last_run_id TEXT,
        last_status TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this._schedulerTableEnsured = true;
  }

  async acquireJobLease(jobName, leaseOwner, ttlMs = 55000) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.acquireJobLease(jobName, leaseOwner, ttlMs);
    }
    try {
      await this._ensureSchedulerStateTable();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      const res = await this.query(
        `INSERT INTO discovery_scheduler_state (
           job_name, source_cursor, page_cursor, lease_owner, lease_acquired_at, lease_expires_at, updated_at
         )
         VALUES ($1, 0, 1, $2, $3, $4, $3)
         ON CONFLICT (job_name) DO UPDATE SET
           lease_owner = EXCLUDED.lease_owner,
           lease_acquired_at = EXCLUDED.lease_acquired_at,
           lease_expires_at = EXCLUDED.lease_expires_at,
           updated_at = EXCLUDED.updated_at
         WHERE discovery_scheduler_state.lease_owner IS NULL
            OR discovery_scheduler_state.lease_expires_at <= $3
            OR discovery_scheduler_state.lease_owner = $2
         RETURNING *`,
        [jobName, leaseOwner, now.toISOString(), expiresAt.toISOString()]
      );
      if (res.rows && res.rows.length > 0) {
        return {
          acquired: true,
          state: {
            job_name: res.rows[0].job_name,
            source_cursor: Number(res.rows[0].source_cursor || 0),
            page_cursor: Number(res.rows[0].page_cursor || 1),
            last_source_id: res.rows[0].last_source_id || null,
            lease_owner: res.rows[0].lease_owner,
            lease_acquired_at: res.rows[0].lease_acquired_at instanceof Date ? res.rows[0].lease_acquired_at.toISOString() : res.rows[0].lease_acquired_at,
            lease_expires_at: res.rows[0].lease_expires_at instanceof Date ? res.rows[0].lease_expires_at.toISOString() : res.rows[0].lease_expires_at,
            last_run_id: res.rows[0].last_run_id || null,
            last_status: res.rows[0].last_status || null,
            updated_at: res.rows[0].updated_at instanceof Date ? res.rows[0].updated_at.toISOString() : res.rows[0].updated_at
          }
        };
      }
      const existing = await this.getJobSchedulerState(jobName);
      return { acquired: false, state: existing };
    } catch (_) {
      return this.fallbackRepo.acquireJobLease(jobName, leaseOwner, ttlMs);
    }
  }

  async updateJobCursorAndReleaseLease(jobName, leaseOwner, statePatch = {}) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.updateJobCursorAndReleaseLease(jobName, leaseOwner, statePatch);
    }
    try {
      await this._ensureSchedulerStateTable();
      const nowIso = new Date().toISOString();
      const existing = (await this.getJobSchedulerState(jobName)) || {
        source_cursor: 0,
        page_cursor: 1,
        last_source_id: null,
        last_run_id: null,
        last_status: null
      };
      const sourceCursor = statePatch.source_cursor !== undefined ? Number(statePatch.source_cursor) : Number(existing.source_cursor || 0);
      const pageCursor = statePatch.page_cursor !== undefined ? Number(statePatch.page_cursor) : Number(existing.page_cursor || 1);
      const lastSourceId = statePatch.last_source_id !== undefined ? statePatch.last_source_id : existing.last_source_id;
      const lastRunId = statePatch.last_run_id !== undefined ? statePatch.last_run_id : existing.last_run_id;
      const lastStatus = statePatch.last_status !== undefined ? statePatch.last_status : existing.last_status;

      const res = await this.query(
        `UPDATE discovery_scheduler_state
         SET source_cursor = $2,
             page_cursor = $3,
             last_source_id = $4,
             last_run_id = $5,
             last_status = $6,
             lease_owner = NULL,
             lease_acquired_at = NULL,
             lease_expires_at = NULL,
             updated_at = $7
         WHERE job_name = $1
           AND (lease_owner = $8 OR lease_owner IS NULL)
         RETURNING *`,
        [jobName, sourceCursor, pageCursor, lastSourceId, lastRunId, lastStatus, nowIso, leaseOwner]
      );
      if (res.rows && res.rows[0]) {
        return {
          job_name: res.rows[0].job_name,
          source_cursor: Number(res.rows[0].source_cursor || 0),
          page_cursor: Number(res.rows[0].page_cursor || 1),
          last_source_id: res.rows[0].last_source_id || null,
          lease_owner: res.rows[0].lease_owner || null,
          lease_acquired_at: null,
          lease_expires_at: null,
          last_run_id: res.rows[0].last_run_id || null,
          last_status: res.rows[0].last_status || null,
          updated_at: res.rows[0].updated_at instanceof Date ? res.rows[0].updated_at.toISOString() : res.rows[0].updated_at
        };
      }
      return this.getJobSchedulerState(jobName);
    } catch (_) {
      return this.fallbackRepo.updateJobCursorAndReleaseLease(jobName, leaseOwner, statePatch);
    }
  }

  async getJobSchedulerState(jobName) {
    if (this.degraded || !this.pool) {
      return this.fallbackRepo.getJobSchedulerState(jobName);
    }
    try {
      await this._ensureSchedulerStateTable();
      const res = await this.query(`SELECT * FROM discovery_scheduler_state WHERE job_name = $1`, [jobName]);
      if (!res.rows || res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        job_name: row.job_name,
        source_cursor: Number(row.source_cursor || 0),
        page_cursor: Number(row.page_cursor || 1),
        last_source_id: row.last_source_id || null,
        lease_owner: row.lease_owner || null,
        lease_acquired_at: row.lease_acquired_at instanceof Date ? row.lease_acquired_at.toISOString() : (row.lease_acquired_at || null),
        lease_expires_at: row.lease_expires_at instanceof Date ? row.lease_expires_at.toISOString() : (row.lease_expires_at || null),
        last_run_id: row.last_run_id || null,
        last_status: row.last_status || null,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || null)
      };
    } catch (_) {
      return this.fallbackRepo.getJobSchedulerState(jobName);
    }
  }

  mapRowToEvent(row) {
    if (!row) return null;
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    const artists = Array.isArray(meta.artists) && meta.artists.length > 0
      ? meta.artists
      : (meta.artist ? [meta.artist] : []);
    const artist = meta.artist || (artists.length > 0 ? artists[0] : null);

    const imageUrl = meta.image_url || meta.poster_url || meta.event_image || null;

    const formatPgDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return String(val).substring(0, 10);
    };

    const resolvedSourceUrl = meta.source_url || meta.provenance?.official_source || meta.provenance?.ticket_source || row.official_event_url || row.official_ticket_url || null;
    const resolvedSourceId = meta.source_id || meta.provenance?.discovery_source || (row.is_verified ? 'src-official-verified' : 'src-loket');
    const resolvedVerifiedAt = meta.verified_at || meta.image_verified_at || (row.is_verified ? (row.updated_at ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at) : (row.created_at ? (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at) : new Date().toISOString())) : null);

    // Normalize verification_status for verified DB-persisted authoritative events (e.g. LOKET Tier-1 rows stored as PARTIALLY_VERIFIED)
    const isVerifiedBool = row.is_verified === true;
    const normalizedVerificationStatus = (isVerifiedBool && row.public_visibility === true && row.verification_status === 'PARTIALLY_VERIFIED')
      ? 'VERIFIED'
      : row.verification_status;

    const hydratedSources = Array.isArray(meta.sources) && meta.sources.length > 0
      ? meta.sources
      : (isVerifiedBool && resolvedSourceId
          ? [{
              source_id: resolvedSourceId === 'src-official-verified' ? 'src-loket' : resolvedSourceId,
              source_name: row.official_ticketing_provider || row.organizer_name || 'Official Ticketing Source',
              tier: 1,
              authority_level: 'HIGH',
              source_url: resolvedSourceUrl,
              retrieved_at: resolvedVerifiedAt
            }]
          : []);

    const startDateStr = formatPgDate(row.start_date);
    const endDateStr = formatPgDate(row.end_date);

    const resolvedImageProvenance = EventVisualProvenanceService.resolveCatalogEventImageProvenance(
      {
        id: row.id,
        event_id: row.id,
        slug: row.slug,
        canonical_name: row.canonical_name,
        official_event_url: row.official_event_url,
        official_ticket_url: row.official_ticket_url,
        official_ticketing_provider: row.official_ticketing_provider,
        organizer_name: row.organizer_name,
        source_url: resolvedSourceUrl,
        source_id: resolvedSourceId,
        is_verified: isVerifiedBool,
        verified_at: resolvedVerifiedAt,
        sources: hydratedSources
      },
      meta
    );

    const resolvedImgUrl = resolvedImageProvenance.image_url;

    return {
      id: row.id,
      event_id: row.id,
      slug: row.slug,
      canonical_name: row.canonical_name,
      title: row.canonical_name,
      name: row.canonical_name,
      artist: artist,
      artists: artists,
      event_type: row.event_type,
      category: row.category,
      start_date: startDateStr,
      date: startDateStr,
      start_datetime: row.start_datetime instanceof Date ? row.start_datetime.toISOString() : (row.start_datetime || null),
      end_date: endDateStr,
      end_datetime: row.end_datetime instanceof Date ? row.end_datetime.toISOString() : (row.end_datetime || null),
      timezone: row.timezone || 'Asia/Jakarta',
      venue_name: row.venue_name,
      venue: row.venue_name,
      venue_city: row.venue_city || row.city,
      city: row.city,
      province: row.province,
      country: row.country || 'Indonesia',
      organizer_name: row.organizer_name,
      official_event_url: row.official_event_url,
      official_ticket_url: row.official_ticket_url,
      official_ticketing_provider: row.official_ticketing_provider,
      min_price: row.min_price ? parseFloat(row.min_price) : null,
      max_price: row.max_price ? parseFloat(row.max_price) : null,
      is_verified: isVerifiedBool,
      verification_status: normalizedVerificationStatus,
      lifecycle_status: row.lifecycle_status,
      archive_status: row.archive_status,
      archived_at: row.archived_at ? (row.archived_at instanceof Date ? row.archived_at.toISOString() : row.archived_at) : null,
      public_visibility: row.public_visibility === true,
      homepage_visibility: row.homepage_visibility === true || (isVerifiedBool && row.public_visibility === true && row.archive_status !== 'ARCHIVED' && row.lifecycle_status !== 'ARCHIVED'),
      // Source & Verification Provenance attributes
      source_url: resolvedSourceUrl,
      source_id: resolvedSourceId,
      evidence_hash: meta.evidence_hash || meta.image_evidence_hash || (row.canonical_name ? crypto.createHash('sha256').update(String(row.canonical_name) + String(startDateStr || '')).digest('hex') : null),
      verified_at: resolvedVerifiedAt,
      last_verified_at: meta.last_verified_at || resolvedVerifiedAt,
      meets_price_threshold: (row.max_price || row.min_price || 0) >= 500000 || meta.price_status === 'PRICE_PARTIAL',
      price_status: meta.price_status || meta.pricing_status || ((row.max_price || row.min_price || 0) >= 500000 ? 'HIGH_VALUE_QUALIFIED' : 'STANDARD_VALUE'),
      // S1 & S2 Tier, Seating & Map Standards (W5 Honesty: never fabricate fake tiers or guess seating types)
      price_tiers: Array.isArray(meta.price_tiers) && meta.price_tiers.length > 0 ? meta.price_tiers : [],
      tier_data_status: Array.isArray(meta.price_tiers) && meta.price_tiers.length > 0
        ? 'VERIFIED_TIERS'
        : (row.min_price ? (row.max_price && Number(row.max_price) !== Number(row.min_price) ? 'SOURCE_MIN_MAX_RANGE_ONLY' : 'SOURCE_SINGLE_PRICE_ONLY') : 'TIER_DATA_UNAVAILABLE'),
      seating_type: meta.seating_type || 'UNKNOWN',
      seat_map_url: meta.seat_map_url || null,
      tier_enrichment_needed: Boolean(meta.tier_enrichment_needed || meta.price_status === 'PRICE_PARTIAL' || (!Array.isArray(meta.price_tiers) || meta.price_tiers.length === 0)),
      // Visual provenance attributes (Resolved & HTTP-verified)
      image_url: resolvedImgUrl,
      poster_url: resolvedImgUrl,
      event_image: resolvedImgUrl,
      thumbnail_url: resolvedImageProvenance.thumbnail_url || resolvedImgUrl,
      image_verified: resolvedImageProvenance.image_verified,
      image_verified_at: resolvedImageProvenance.image_verified_at,
      image_status: resolvedImageProvenance.image_status,
      image_type: meta.image_type || (resolvedImgUrl ? 'OFFICIAL_POSTER' : null),
      image_confidence: meta.image_confidence || (resolvedImgUrl ? 'HIGH' : null),
      image_source_type: resolvedImageProvenance.image_source_type,
      image_source_url: resolvedImageProvenance.image_source_url,
      image_credit: resolvedImageProvenance.image_credit,
      image_attribution: resolvedImageProvenance.image_attribution,
      broken_image_url: resolvedImageProvenance.broken_image_url || null,
      image_license_status: meta.image_license_status || null,
      is_fallback_image: resolvedImageProvenance.is_fallback_image,
      fallback_meta: meta.fallback_meta || null,
      description: meta.description || null,
      // Domain history & provenance arrays (defensive: always arrays/objects)
      event_history: Array.isArray(meta.event_history) ? meta.event_history : [],
      observations: Array.isArray(meta.observations) ? meta.observations : [],
      sources: hydratedSources,
      conflicts: Array.isArray(meta.conflicts) ? meta.conflicts : [],
      field_provenance: meta.field_provenance && typeof meta.field_provenance === 'object' ? meta.field_provenance : {},
      verification_reasons: Array.isArray(meta.verification_reasons) ? meta.verification_reasons : [],
      event_quality_score: meta.event_quality_score ?? null,
      marketplace_eligibility: meta.marketplace_eligibility || null,
      quality_factors: meta.quality_factors || null,
      metadata: {
        ...meta,
        ...resolvedImageProvenance,
        price_tiers: Array.isArray(meta.price_tiers) && meta.price_tiers.length > 0 ? meta.price_tiers : [],
        seating_type: meta.seating_type || 'UNKNOWN',
        seat_map_url: meta.seat_map_url || null
      },
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || null),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || null)
    };
  }

  isDegraded() {
    return this.degraded;
  }
}

module.exports = { PostgresCatalogRepository };
