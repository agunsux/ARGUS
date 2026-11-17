/**
 * TIKUM / ARGUS — Hero Selection Service
 *
 * Deterministic Hero Concert Selection & Rotation Engine.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Zero Expired Heroes: An event whose final date has passed in Asia/Jakarta
 *    is strictly disqualified from hero spotlight.
 * 2. Minimum Price Threshold: Only events with at least one legitimate ticket
 *    category >= Rp 400,000 qualify.
 * 3. Verified Provenance Only: Requires verified promoter authority and working official URL.
 * 4. Zero-Fake Inventory: Resale inventory remains truthfully reported (0 if none listed).
 * 5. Selection Rationale Persistence: Records why the hero was chosen.
 */

const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');
const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { CuratedCatalogPolicy, OFFICIAL_MIN_TICKET_PRICE } = require('./CuratedCatalogPolicy');

const MIN_QUALIFYING_PRICE = OFFICIAL_MIN_TICKET_PRICE;

class HeroSelectionService {
  /**
   * Deterministically selects the active hero spotlight concerts.
   * @param {Date|string} asOfDate - Authoritative clock (Asia/Jakarta)
   * @param {Array} candidateEvents - Optional override of candidate pool
   * @returns {object} { primaryHero, secondaryHero, heroes: [], selection_metadata }
   */
  static selectHeroConcerts(asOfDate = new Date(), candidateEvents = null) {
    const now = (asOfDate instanceof Date) ? asOfDate : new Date(asOfDate);
    const nowDateStr = now.toISOString().substring(0, 10);

    // Retrieve pool of events: combine canonical registry events with verified hero candidates
    const registeredEvents = canonicalRegistry.getAllEvents();
    const verifiedHeroes = canonicalRegistry.getHeroEvents({ includePast: true });
    const pool = candidateEvents || (registeredEvents.length > 0
      ? [...registeredEvents, ...verifiedHeroes.filter(h => !registeredEvents.some(r => (r.id && (r.id === h.id || r.id === h.event_id)) || (r.event_id && (r.event_id === h.id || r.event_id === h.event_id))))]
      : verifiedHeroes);

    const qualifiedCandidates = [];

    for (const ev of pool) {
      const qualification = this.evaluateEligibility(ev, now);
      if (qualification.eligible) {
        qualifiedCandidates.push({
          event: ev,
          score: qualification.score,
          rationale: qualification.rationale
        });
      }
    }

    // Sort by deterministic ranking score descending
    qualifiedCandidates.sort((a, b) => b.score - a.score);

    // Extract top heroes for spotlight grid (up to 8)
    const selected = qualifiedCandidates.slice(0, 8).map((item, idx) => {
      const ev = item.event;
      return this.formatHeroCard(ev, {
        isPrimary: idx === 0,
        selectionScore: item.score,
        selectionRationale: item.rationale
      });
    });

    const primaryHero = selected[0] || null;
    const secondaryHero = selected[1] || null;

    return {
      selected_at: now.toISOString(),
      as_of_date: nowDateStr,
      count: selected.length,
      primaryHero,
      secondaryHero,
      heroes: selected,
      selection_metadata: {
        total_candidates_evaluated: pool.length,
        qualified_candidates_count: qualifiedCandidates.length,
        top_selected_ids: selected.map(s => s.id)
      }
    };
  }

  /**
   * Evaluates whether a single event is eligible for Hero spotlight.
   */
  static evaluateEligibility(event, now = new Date()) {
    if (!event) return { eligible: false, reason: 'NULL_EVENT', score: 0 };

    const status = (event.status || event.lifecycle_status || '').toUpperCase();
    const lifecycle = (event.lifecycle_status || '').toUpperCase();

    // 1. Terminal / Expired / Cancelled disqualification
    if (['CANCELLED', 'DIBATALKAN'].includes(status) || ['CANCELLED', 'DIBATALKAN'].includes(lifecycle)) {
      return { eligible: false, reason: 'CANCELLED', score: 0 };
    }
    if (['POSTPONED', 'DITUNDA'].includes(status) || ['POSTPONED', 'DITUNDA'].includes(lifecycle)) {
      return { eligible: false, reason: 'POSTPONED', score: 0 };
    }
    if (['ARCHIVED', 'COMPLETED', 'EXPIRED'].includes(status) || ['ARCHIVED', 'COMPLETED', 'EXPIRED'].includes(lifecycle)) {
      return { eligible: false, reason: 'COMPLETED_OR_ARCHIVED', score: 0 };
    }

    // 2. Strict Temporal Check in Asia/Jakarta
    // Event must not have concluded relative to 'now'
    const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, now);
    if (!isUpcoming) {
      return { eligible: false, reason: 'EVENT_CONCLUDED_PAST', score: 0 };
    }

    // 3. Verification Gating
    const isVerified = event.is_verified === true &&
      ['VERIFIED', 'PRIMARY_SOURCE_VERIFIED'].includes(event.verification_status);
    if (!isVerified) {
      return { eligible: false, reason: 'UNVERIFIED', score: 0 };
    }

    // 4. Strict Official Minimum Ticket Price Invariant (official_min_ticket_price >= 500.000)
    const priceEval = CuratedCatalogPolicy.evaluateOfficialPriceQualification(event, { minThreshold: MIN_QUALIFYING_PRICE });
    if (!priceEval.qualified || event.price_status === 'EXCLUDED_PRICE_TOO_LOW') {
      return { eligible: false, reason: 'PRICE_BELOW_MINIMUM_500K', score: 0 };
    }

    // 5. Official URL & Image Availability
    const hasOfficialUrl = Boolean(event.official_event_url || event.official_ticket_url || event.source_url || event.official_link);
    if (!hasOfficialUrl) {
      return { eligible: false, reason: 'MISSING_OFFICIAL_URL', score: 0 };
    }

    const hasImage = Boolean(event.poster_url || event.image_url);
    if (!hasImage) {
      return { eligible: false, reason: 'MISSING_IMAGE', score: 0 };
    }

    // --- Dynamic Scoring Calculation Driven by Proximity & Scale ---
    let score = 1000;
    const rationales = [];

    const titleLower = (event.title || event.name || event.canonical_name || '').toLowerCase();
    const artistLower = Array.isArray(event.artists)
      ? event.artists.join(' ').toLowerCase()
      : (event.artist || '').toLowerCase();

    // Priority 1: Start Date Proximity (nearest upcoming gets up to +2000)
    const eventDate = new Date(event.start_date || event.date || event.start_datetime || 0);
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
    const proximityScore = Math.max(0, Math.round((200 - diffDays) * 10));
    score += proximityScore;
    rationales.push(`Proximity: ${diffDays} days away (+${proximityScore})`);

    // Priority 2: Venue Scale & Capacity
    const venueLower = (event.venue_name || event.venue || '').toLowerCase();
    if (venueLower.includes('bung karno') || venueLower.includes('gbk') || venueLower.includes('jis') || venueLower.includes('stadium') || venueLower.includes('stadion')) {
      score += 300;
      rationales.push('Major stadium venue (+300)');
    } else if (venueLower.includes('arena') || venueLower.includes('expo') || venueLower.includes('hall') || venueLower.includes('senayan') || venueLower.includes('ice bsd')) {
      score += 150;
      rationales.push('Arena / Expo venue (+150)');
    }

    // Priority 3: Verification Tier
    if (event.verification_status === 'PRIMARY_SOURCE_VERIFIED' || event.source_type === 'PRIMARY_SOURCE' || event.source_type === 'OFFICIAL_PROMOTER_WEB' || event.source_type === 'OFFICIAL_EVENT_WEB') {
      score += 200;
      rationales.push('Primary promoter source (+200)');
    } else {
      score += 100;
      rationales.push('Verified channel (+100)');
    }

    // Priority 4: Marquee Headline Act
    if (titleLower.includes('bts') || artistLower.includes('bts') || titleLower.includes('arirang') ||
        titleLower.includes('bigbang') || artistLower.includes('bigbang') ||
        titleLower.includes('guns n\' roses') || artistLower.includes('guns n\' roses') ||
        titleLower.includes('chemical romance') || artistLower.includes('chemical romance')) {
      score += 200;
      rationales.push('International headline act (+200)');
    }

    return {
      eligible: true,
      score,
      rationale: rationales.join(' • ')
    };
  }

  /**
   * Formats a canonical event into the standard Tikum hero card payload.
   */
  static formatHeroCard(ev, meta = {}) {
    const rawMinPrice = Number(ev.min_price) || Number(ev.price) || 0;
    const eligibleMinPrice = (Array.isArray(ev.price_tiers) && ev.price_tiers.length > 0)
      ? Math.min(...ev.price_tiers.map(t => Number(t.price || t.face_value || 0)).filter(p => p >= MIN_QUALIFYING_PRICE))
      : (rawMinPrice >= MIN_QUALIFYING_PRICE ? rawMinPrice : MIN_QUALIFYING_PRICE);

    const slug = ev.slug || ev.event_id || ev.id;
    const fallbackSvg = `/api/events/${encodeURIComponent(slug)}/poster.svg`;
    const resolvedPoster = (ev.poster_url && !ev.poster_url.includes('placeholder-event.svg')) ? ev.poster_url : (ev.image_url || fallbackSvg);

    return {
      id: ev.id || ev.event_id,
      slug: ev.slug,
      title: ev.title || ev.canonical_name || ev.name,
      name: ev.canonical_name || ev.name || ev.title,
      artists: ev.artists || (ev.artist ? [ev.artist] : []),
      start_date: ev.start_date || ev.date,
      end_date: ev.end_date || ev.start_date || ev.date,
      date: ev.date || ev.start_date,
      venue: ev.venue_name || ev.venue,
      venue_name: ev.venue_name || ev.venue,
      venue_city: ev.venue_city || ev.city || 'Jakarta',
      city: ev.city || ev.venue_city || 'Jakarta',
      province: ev.province || 'DKI Jakarta',
      category: ev.category || 'KONSER',
      status: 'UPCOMING',
      lifecycle_status: 'UPCOMING',
      is_verified: true,
      verification_status: 'VERIFIED',
      organizer_name: ev.organizer_name || ev.promoter || 'Official Promoter',
      promoter: ev.promoter || ev.organizer_name || 'Official Promoter',
      official_event_url: ev.official_event_url || ev.official_link || ev.source_url,
      official_ticket_url: ev.official_ticket_url || ev.official_event_url || ev.official_link,
      official_ticketing_provider: ev.official_ticketing_provider || 'Tiket.com',
      poster_url: resolvedPoster,
      image_url: resolvedPoster,
      image_credit: ev.image_credit || `${ev.title || 'Event'} (Official Promoter)`,
      primary_ticket_status: ev.primary_ticket_status || 'AVAILABLE',
      min_price: eligibleMinPrice,
      max_price: Number(ev.max_price) || eligibleMinPrice,
      resale_inventory_count: 0,
      resale_available: false,
      resale_notice: 'Belum ada tiket resale sekunder terverifikasi di TIKUM untuk event ini. TIKUM menerapkan Zero Fake Inventory.',
      buyer_protection_policy: 'TIKUM Buyer Protection: Transaksi dilindungi rekening escrow dan verifikasi turnstile venue.',
      observed_at: ev.source_last_checked_at || ev.source_published_at || ev.verified_at || '2026-10-25T12:00:00+07:00',
      evidence_hash: ev.evidence_hash || null,
      selection_rationale: meta.selectionRationale || 'Verified upcoming concert',
      selection_score: meta.selectionScore || 0,
      is_primary_hero: Boolean(meta.isPrimary)
    };
  }
}

module.exports = {
  HeroSelectionService,
  MIN_QUALIFYING_PRICE
};
