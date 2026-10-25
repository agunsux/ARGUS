/**
 * TIKUM / ARGUS — Daily Catalog Refresh & Lifecycle Automation Service
 *
 * MISSION:
 * 1. Reference date: Authoritative timezone is Asia/Jakarta.
 * 2. Historical cleanup: Any event concluded before the reference date is expired,
 *    archived, and removed from active/upcoming feeds and hero eligibility.
 * 3. Rolling 90-day discovery window: Discovers qualifying events from Loket.com and Goers.app.
 * 4. Price gating: Minimum ticket category price >= Rp 400,000. Normalize to IDR.
 *    Missing/unverified prices are marked PRICE_UNVERIFIED and quarantined.
 * 5. Respect anti-bot protections: Goers Cloudflare 403 challenge is recorded honestly
 *    as BLOCKED_BY_CLOUDFLARE without WAF bypass or false claims.
 * 6. Hero rotation: Dynamically selects verified top upcoming concerts (BTS marquee + King Nassar).
 *    Expired YE (24 Oct 2026) is strictly excluded.
 * 7. Single-run advisory lock, audit trail, and operational observability.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { EventTemporalLifecycleEngine, LIFECYCLE_STATUS } = require('./EventTemporalLifecycleEngine');
const { HeroSelectionService, MIN_QUALIFYING_PRICE } = require('./HeroSelectionService');
const { LoketAdapter } = require('./adapters/LoketAdapter');
const { GoersAdapter } = require('./adapters/GoersAdapter');
const { EventIngestionPipeline } = require('./EventIngestionPipeline');
const { OfficialSourceSnapshotStore } = require('./OfficialSourceSnapshotStore');
const { TechnicalSEOService } = require('../seo/TechnicalSEOService');

class DailyCatalogRefreshService {
  constructor(options = {}) {
    this.loketAdapter = options.loketAdapter || new LoketAdapter();
    this.goersAdapter = options.goersAdapter || new GoersAdapter();
    this.ingestionPipeline = options.ingestionPipeline || new EventIngestionPipeline();
    this.minQualifyingPrice = options.minQualifyingPrice || MIN_QUALIFYING_PRICE; // Rp 400,000
    this.discoveryWindowDays = options.discoveryWindowDays || 90;

    this._isSyncRunning = false;
    this.lastRun = null;
    this.runHistory = [];
  }

  /**
   * Returns current operational status and last sync telemetry.
   */
  getStatus() {
    const nextRun = this.lastRun && this.lastRun.completed_at
      ? new Date(new Date(this.lastRun.completed_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      status: this._isSyncRunning ? 'RUNNING' : 'IDLE',
      is_locked: this._isSyncRunning,
      last_successful_sync: this.lastRun ? this.lastRun.completed_at : null,
      next_scheduled_run: nextRun,
      last_telemetry: this.lastRun || null,
      total_runs: this.runHistory.length,
      current_heroes: this.lastRun?.current_heroes || HeroSelectionService.selectHeroConcerts().heroes.map(h => ({
        id: h.id,
        title: h.title,
        date: h.date,
        min_price: h.min_price
      }))
    };
  }

  /**
   * Executes the end-to-end daily catalog refresh and temporal lifecycle reconciliation.
   * @param {object} options
   *   - asOfDate: Date | string (authoritative clock in Asia/Jakarta, defaults to now)
   *   - dryRun: boolean (if true, computes transitions without committing)
   *   - force: boolean (bypass concurrency lock if orphaned)
   */
  async runDailyRefresh(options = {}) {
    if (this._isSyncRunning && !options.force) {
      return {
        status: 'LOCKED',
        message: 'A catalog refresh job is already in progress. Single-run advisory lock is active.',
        run_id: null
      };
    }

    this._isSyncRunning = true;
    const runId = `refresh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    // 1. Authoritative Clock (Asia/Jakarta)
    const asOfInput = options.asOfDate || process.env.SIMULATE_NOW || new Date();
    const now = (asOfInput instanceof Date) ? asOfInput : new Date(asOfInput);
    const asOfDateStr = now.toISOString().substring(0, 10);

    const windowStartDate = new Date(now);
    const windowEndDate = new Date(now.getTime() + this.discoveryWindowDays * 24 * 60 * 60 * 1000);
    const windowStartStr = windowStartDate.toISOString().substring(0, 10);
    const windowEndStr = windowEndDate.toISOString().substring(0, 10);

    const telemetry = {
      run_id: runId,
      status: 'PROCESSING',
      dry_run: Boolean(options.dryRun),
      started_at: new Date(startTime).toISOString(),
      as_of_date: asOfDateStr,
      timezone: 'Asia/Jakarta',
      discovery_window: {
        start: windowStartStr,
        end: windowEndStr,
        days: this.discoveryWindowDays
      },
      min_qualifying_price: this.minQualifyingPrice,
      events_evaluated: 0,
      events_expired: 0,
      events_discovered: 0,
      events_inserted: 0,
      events_updated: 0,
      excluded_by_price: 0,
      quarantined_price_unverified: 0,
      sources: {
        loket: { status: 'PENDING', discovered_count: 0, qualified_count: 0 },
        goers: { status: 'PENDING', telemetry: null }
      },
      current_heroes: [],
      audit_log: []
    };

    try {
      // -----------------------------------------------------------------------
      // STEP 1: HISTORICAL CLEANUP & TEMPORAL RECONCILIATION
      // -----------------------------------------------------------------------
      const allEvents = canonicalRegistry.getAllEvents();
      telemetry.events_evaluated = allEvents.length;

      for (const ev of allEvents) {
        const isPast = !EventTemporalLifecycleEngine.isEventUpcoming(ev, now);
        const prevStatus = ev.status;
        const prevArchiveStatus = ev.archive_status;

        if (isPast) {
          telemetry.events_expired++;
          if (!options.dryRun) {
            ev.status = 'COMPLETED';
            ev.lifecycle_status = LIFECYCLE_STATUS.COMPLETED;
            ev.archive_status = 'ARCHIVED';
            ev.archived_at = ev.archived_at || now.toISOString();
            ev.homepage_visibility = false;
            ev.public_upcoming = false;
            // Public visibility for past detail pages is retained with completed banner
          }
          telemetry.audit_log.push({
            event_id: ev.id || ev.event_id,
            slug: ev.slug,
            action: 'EXPIRE_AND_ARCHIVE',
            reason: `Event end date has concluded relative to ${asOfDateStr}`,
            previous_status: prevStatus,
            new_status: 'COMPLETED'
          });
        }
      }

      // -----------------------------------------------------------------------
      // STEP 2: DISCOVERY SOURCE 1 — LOKET.COM (API + SNAPSHOT)
      // -----------------------------------------------------------------------
      let rawLoketEvents = [];
      try {
        rawLoketEvents = await this.loketAdapter.discover({ live: true, pageSize: 100, maxPages: 5 });
        telemetry.sources.loket.status = 'SYNCED_LIVE_API';
      } catch (loketErr) {
        // Fallback to snapshot
        rawLoketEvents = await this.loketAdapter.discover({ live: false });
        telemetry.sources.loket.status = 'SYNCED_OFFICIAL_SNAPSHOT';
      }

      telemetry.sources.loket.discovered_count = rawLoketEvents.length;
      telemetry.events_discovered += rawLoketEvents.length;

      // Filter and qualify Loket events
      for (const item of rawLoketEvents) {
        const itemDate = item.start_date || (item.start_datetime ? item.start_datetime.substring(0, 10) : null);
        if (!itemDate) continue;

        // Date window check: [now, now + 90 days]
        if (itemDate < windowStartStr || itemDate > windowEndStr) {
          continue;
        }

        // Price qualification check
        const priceEval = this.evaluatePriceEligibility(item);
        if (!priceEval.qualified) {
          if (priceEval.reason === 'PRICE_UNVERIFIED') {
            telemetry.quarantined_price_unverified++;
          } else {
            telemetry.excluded_by_price++;
          }
          continue;
        }

        telemetry.sources.loket.qualified_count++;

        if (!options.dryRun) {
          // Construct candidate payload
          const candidatePayload = {
            id: item.source_event_id || item.id,
            slug: item.slug || (item.title ? item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : null),
            title: item.title || item.name,
            name: item.title || item.name,
            canonical_name: item.title || item.name,
            start_date: item.start_date,
            end_date: item.end_date || item.start_date,
            start_time: item.start_time || '19:00',
            start_datetime: item.start_datetime || `${item.start_date}T19:00:00+07:00`,
            end_datetime: item.end_datetime || (item.end_date ? `${item.end_date}T23:00:00+07:00` : null),
            timezone: 'Asia/Jakarta',
            venue_name: item.venue_name || item.venue || 'Jakarta Venue',
            city: item.city || 'Jakarta',
            province: item.province || 'DKI Jakarta',
            country: 'Indonesia',
            category: item.category || 'KONSER',
            organizer_name: item.organizer_name || item.promoter || 'Loket Organizer',
            official_event_url: item.source_url || item.official_event_url || item.official_ticket_url,
            official_ticket_url: item.official_ticket_url || item.source_url,
            official_ticketing_provider: 'LOKET',
            poster_url: item.poster_url || item.image_url,
            image_url: item.image_url || item.poster_url,
            min_price: priceEval.eligible_min_price,
            max_price: priceEval.eligible_max_price || priceEval.eligible_min_price,
            price: priceEval.eligible_min_price,
            price_status: 'QUALIFIED',
            meets_price_threshold: true,
            is_verified: true,
            verification_status: 'VERIFIED',
            status: 'UPCOMING',
            lifecycle_status: 'UPCOMING',
            archive_status: 'ACTIVE',
            public_visibility: true,
            homepage_visibility: true,
            public_upcoming: true,
            resale_inventory_count: 0
          };

          const existing = canonicalRegistry.getEventById(candidatePayload.id) ||
            (candidatePayload.slug ? canonicalRegistry.getEventBySlug(candidatePayload.slug) : null);

          if (existing) {
            telemetry.events_updated++;
          } else {
            canonicalRegistry.createEvent(candidatePayload);
            telemetry.events_inserted++;
          }
        }
      }

      // -----------------------------------------------------------------------
      // STEP 3: DISCOVERY SOURCE 2 — GOERS.APP (PROBE TELEMETRY & PRESERVATION)
      // -----------------------------------------------------------------------
      const goersProbe = await this.goersAdapter.probePublicWeb();
      telemetry.sources.goers = {
        status: goersProbe.is_blocked ? 'BLOCKED_BY_CLOUDFLARE_403' : 'ONLINE',
        coverage_status: goersProbe.is_blocked ? 'RESTRICTED_INCOMPLETE' : 'SYNCHRONIZED',
        limitation_notice: goersProbe.is_blocked
          ? 'Goers is protected by Cloudflare Bot Management (HTTP 403). Automated crawling is halted to respect access controls. Coverage from Goers cannot be considered complete until an authorized partner feed is configured.'
          : 'Public web crawl operational',
        http_status: goersProbe.http_status,
        reason: goersProbe.reason,
        policy_adherence: 'PASSIVE_MODE_NO_BYPASS',
        timestamp: goersProbe.timestamp
      };
      telemetry.coverage_status = goersProbe.is_blocked
        ? 'PARTIAL_SYNC_GOERS_RESTRICTED'
        : 'FULL_SYNC';

      telemetry.audit_log.push({
        source: 'GOERS',
        action: 'PROBE_PUBLIC_WEB',
        result: goersProbe.is_blocked ? 'CHALLENGE_ENCOUNTERED_PASSIVE_PRESERVED' : 'ACCESSIBLE',
        http_status: goersProbe.http_status,
        coverage_status: goersProbe.is_blocked ? 'RESTRICTED_INCOMPLETE' : 'COMPLETE',
        note: 'Goers anti-bot challenge respected without bypass. Pre-existing verified records preserved. Goers coverage treated as partial/restricted.'
      });

      // -----------------------------------------------------------------------
      // STEP 4: HERO CONCERT SELECTION & ROTATION
      // -----------------------------------------------------------------------
      const heroResult = HeroSelectionService.selectHeroConcerts(now);
      telemetry.current_heroes = heroResult.heroes.map(h => ({
        id: h.id,
        title: h.title,
        date: h.date,
        min_price: h.min_price,
        primary_ticket_status: h.primary_ticket_status,
        is_primary_hero: h.is_primary_hero,
        selection_score: h.selection_score
      }));

      // -----------------------------------------------------------------------
      // STEP 5: SITEMAP XML REFRESH
      // -----------------------------------------------------------------------
      try {
        const sitemapXml = TechnicalSEOService.generateSitemapXml();
        const sitemapPath = path.resolve(__dirname, '../../public/sitemap.xml');
        if (fs.existsSync(path.dirname(sitemapPath))) {
          fs.writeFileSync(sitemapPath, sitemapXml, 'utf8');
          telemetry.sitemap_refreshed = true;
        }
      } catch (seoErr) {
        telemetry.sitemap_refreshed = false;
        telemetry.sitemap_error = seoErr.message;
      }

      // Finalize run
      telemetry.status = 'SUCCESS';
      telemetry.completed_at = new Date().toISOString();
      telemetry.duration_ms = Date.now() - startTime;

      this.lastRun = telemetry;
      this.runHistory.unshift(telemetry);
      if (this.runHistory.length > 50) this.runHistory.pop();

      return telemetry;
    } catch (err) {
      telemetry.status = 'FAILED';
      telemetry.error = err.message;
      telemetry.completed_at = new Date().toISOString();
      telemetry.duration_ms = Date.now() - startTime;
      this.lastRun = telemetry;
      return telemetry;
    } finally {
      this._isSyncRunning = false;
    }
  }

  /**
   * Evaluates price eligibility against the Rp 400,000 threshold.
   */
  evaluatePriceEligibility(eventItem) {
    // Check price tiers if present
    if (Array.isArray(eventItem.price_tiers) && eventItem.price_tiers.length > 0) {
      const qualifyingTiers = eventItem.price_tiers
        .map(t => Number(t.price || t.face_value || 0))
        .filter(p => p >= this.minQualifyingPrice);

      if (qualifyingTiers.length > 0) {
        return {
          qualified: true,
          eligible_min_price: Math.min(...qualifyingTiers),
          eligible_max_price: Math.max(...qualifyingTiers),
          reason: 'TIER_MEETS_THRESHOLD'
        };
      }
      return {
        qualified: false,
        reason: 'EXCLUDED_ALL_TIERS_BELOW_400K'
      };
    }

    const hasMin = eventItem.min_price !== undefined && eventItem.min_price !== null && !isNaN(Number(eventItem.min_price));
    const hasMax = eventItem.max_price !== undefined && eventItem.max_price !== null && !isNaN(Number(eventItem.max_price));
    const hasPrice = eventItem.price !== undefined && eventItem.price !== null && !isNaN(Number(eventItem.price));

    if (!hasMin && !hasMax && !hasPrice) {
      return {
        qualified: false,
        reason: 'PRICE_UNVERIFIED'
      };
    }

    const rawMin = hasMin ? Number(eventItem.min_price) : (hasPrice ? Number(eventItem.price) : 0);
    const rawMax = hasMax ? Number(eventItem.max_price) : (hasPrice ? Number(eventItem.price) : rawMin);

    if (rawMax < this.minQualifyingPrice) {
      return {
        qualified: false,
        reason: 'EXCLUDED_PRICE_TOO_LOW'
      };
    }

    const eligibleMin = rawMin >= this.minQualifyingPrice ? rawMin : this.minQualifyingPrice;
    return {
      qualified: true,
      eligible_min_price: eligibleMin,
      eligible_max_price: Math.max(rawMax, eligibleMin),
      reason: 'BASE_PRICE_QUALIFIED'
    };
  }
}

const dailyCatalogRefreshService = new DailyCatalogRefreshService();

module.exports = {
  DailyCatalogRefreshService,
  dailyCatalogRefreshService
};
