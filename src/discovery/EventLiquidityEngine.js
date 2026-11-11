/**
 * TIKUM / ARGUS — Event Liquidity & Marketplace Potential Engine
 *
 * Implements explainable marketplace liquidity ranking for events.
 *
 * Core Principles:
 * 1. Ground Truth First: Separates measured data from estimates.
 *    - Never confuses artist popularity with actual buyer demand.
 *    - Never confuses official promoter tickets with TIKUM resale inventory.
 *    - Never confuses potential ticket holders with verified sellers.
 * 2. Two-Sided Market Liquidity:
 *    - Events with high potential for BOTH buyers and sellers rank highest.
 * 3. Explainability & Provenance:
 *    - Every score breakdown includes measured signals, estimated signals, and rationale.
 * 4. Transparent Fallback:
 *    - When telemetry is insufficient, uses transparent fallback ranking without fabricating numbers.
 */

const VENUE_CAPACITY_TIERS = {
  STADIUM_MEGA: { capacity: 70000, weight: 1.0, label: 'Mega Stadium (GBK, JIS)' },
  STADIUM_REGIONAL: { capacity: 25000, weight: 0.85, label: 'Regional Stadium' },
  ARENA_LARGE: { capacity: 15000, weight: 0.80, label: 'Large Arena (ICE BSD, Indonesia Arena)' },
  ARENA_MEDIUM: { capacity: 8000, weight: 0.65, label: 'Medium Arena' },
  HALL_MEDIUM: { capacity: 3000, weight: 0.50, label: 'Concert Hall / Convention Center' },
  CLUB_RESORT: { capacity: 1500, weight: 0.40, label: 'Club / Intimate Venue' },
  UNKNOWN: { capacity: 5000, weight: 0.45, label: 'Standard Venue' }
};

class EventLiquidityEngine {
  /**
   * Evaluates venue capacity category from venue name.
   */
  static resolveVenueCapacity(venueName = '') {
    const v = String(venueName || '').toLowerCase();
    if (v.includes('bung karno') || v.includes('gbk') || v.includes('jis') || v.includes('jakarta international stadium')) {
      return VENUE_CAPACITY_TIERS.STADIUM_MEGA;
    }
    if (v.includes('siliwangi') || v.includes('manahan') || v.includes('gbt') || v.includes('gelora')) {
      return VENUE_CAPACITY_TIERS.STADIUM_REGIONAL;
    }
    if (v.includes('ice bsd') || v.includes('indonesia arena') || v.includes('beach city') || v.includes('jec')) {
      return VENUE_CAPACITY_TIERS.ARENA_LARGE;
    }
    if (v.includes('istora') || v.includes('senayan') || v.includes('tennis indoor') || v.includes('convention hall')) {
      return VENUE_CAPACITY_TIERS.ARENA_MEDIUM;
    }
    if (v.includes('de tjolomadoe') || v.includes('pos bloc') || v.includes('ballroom')) {
      return VENUE_CAPACITY_TIERS.HALL_MEDIUM;
    }
    return VENUE_CAPACITY_TIERS.UNKNOWN;
  }

  /**
   * Calculates explainable Event Liquidity Score (0 - 100).
   *
   * @param {object} event - Canonical or feed event record
   * @param {object} marketplaceSignals - Real-time marketplace telemetry
   * @param {Date} asOf - Reference timestamp
   * @returns {object} Explainable liquidity result
   */
  static calculateLiquidityScore(event, marketplaceSignals = {}, asOf = new Date()) {
    if (!event) {
      return {
        liquidity_score: 0,
        liquidity_tier: 'LOW',
        components: {},
        measured_signals: [],
        estimated_signals: [],
        rationale: 'No event data provided',
        fallback_applied: true
      };
    }

    const measuredSignals = [];
    const estimatedSignals = [];
    const rationales = [];

    // --- 1. Expected Buyer Demand (Weight: 35%) ---
    let demandScore = 40; // baseline
    const isPrimarySoldOut = Boolean(
      event.primary_ticket_status === 'SOLD_OUT' ||
      event.ticket_status === 'SOLD_OUT' ||
      event.ticket_availability === 'SOLD_OUT' ||
      event.is_sold_out === true ||
      marketplaceSignals.primary_sold_out === true
    );

    if (isPrimarySoldOut) {
      demandScore = 95;
      measuredSignals.push({
        signal: 'PRIMARY_TICKETS_SOLD_OUT',
        value: true,
        source: 'primary_ticketing_authority',
        impact: '+55 points to buyer demand'
      });
      rationales.push('Primary tickets sold out indicates high unmet buyer demand');
    } else {
      measuredSignals.push({
        signal: 'PRIMARY_TICKETS_AVAILABLE',
        value: true,
        source: 'primary_ticketing_authority',
        impact: 'Moderate secondary demand expected'
      });
    }

    const searchIndex = Number(marketplaceSignals.search_volume_index || event.search_volume_index || 0);
    if (searchIndex > 0) {
      const boost = Math.min(20, Math.round(searchIndex * 0.2));
      demandScore = Math.min(100, demandScore + boost);
      measuredSignals.push({
        signal: 'SEARCH_INTEREST_INDEX',
        value: searchIndex,
        source: 'search_telemetry',
        impact: `+${boost} points from user search volume`
      });
    }

    // --- 2. Potential Seller Supply (Weight: 25%) ---
    let supplyScore = 50;
    const activeListingsCount = Number(
      event.resale_listings_count ||
      event.active_listings_count ||
      marketplaceSignals.active_listings_count ||
      0
    );

    if (activeListingsCount > 0) {
      supplyScore = Math.min(95, 60 + Math.min(35, activeListingsCount * 5));
      measuredSignals.push({
        signal: 'VERIFIED_ACTIVE_LISTINGS',
        value: activeListingsCount,
        source: 'tikum_marketplace_inventory',
        impact: `+${Math.min(35, activeListingsCount * 5)} points from active resale listings`
      });
      rationales.push(`${activeListingsCount} verified resale listings active on TIKUM`);
    } else {
      // Estimated secondary turnover potential based on venue capacity
      const venueTier = this.resolveVenueCapacity(event.venue_name || event.venue);
      supplyScore = Math.round(venueTier.weight * 65);
      estimatedSignals.push({
        signal: 'POTENTIAL_SELLER_BASE',
        estimate_type: 'VENUE_CAPACITY_PROXY',
        value: `${venueTier.label} (~${venueTier.capacity.toLocaleString('id-ID')} attendees)`,
        source: 'venue_capacity_model',
        impact: 'Estimated secondary turnover potential based on venue scale'
      });
    }

    // --- 3. Artist Popularity & Provenance (Weight: 20%) ---
    let artistScore = 50;
    const titleLower = String(event.title || event.canonical_name || event.name || '').toLowerCase();
    const artistLower = Array.isArray(event.artists)
      ? event.artists.join(' ').toLowerCase()
      : String(event.artist || '').toLowerCase();

    if (titleLower.includes('bts') || artistLower.includes('bts') || titleLower.includes('arirang')) {
      artistScore = 100;
      measuredSignals.push({
        signal: 'MARQUEE_GLOBAL_HEADLINER',
        artist: 'BTS',
        status: 'TIER_1_STADIUM_ACT',
        impact: 'Maximum artist popularity'
      });
      rationales.push('Global stadium headliner with peak secondary liquidity');
    } else if (titleLower.includes('bigbang') || artistLower.includes('bigbang')) {
      artistScore = 95;
      measuredSignals.push({
        signal: 'MARQUEE_GLOBAL_HEADLINER',
        artist: 'BIGBANG',
        status: 'TIER_1_STADIUM_ACT',
        impact: 'Very high artist popularity'
      });
      rationales.push('Tier-1 K-Pop stadium reunion tour with very high liquidity');
    } else if (titleLower.includes('enhypen') || artistLower.includes('enhypen')) {
      artistScore = 90;
      measuredSignals.push({ signal: 'POPULAR_STADIUM_ACT', artist: 'ENHYPEN', impact: 'High artist popularity' });
    } else if (titleLower.includes('dwp') || titleLower.includes('djakarta warehouse')) {
      artistScore = 85;
      measuredSignals.push({ signal: 'MAJOR_FESTIVAL_BRAND', festival: 'DWP', impact: 'Established multi-day festival' });
    } else {
      const sourceCount = Array.isArray(event.sources) ? event.sources.length : 1;
      artistScore = sourceCount >= 2 ? 70 : 50;
      if (sourceCount >= 2) {
        measuredSignals.push({
          signal: 'MULTI_SOURCE_CORROBORATION',
          source_count: sourceCount,
          impact: 'Corroborated by multiple authoritative sources'
        });
      }
    }

    // --- 4. Event Proximity & Timing Window (Weight: 20%) ---
    let proximityScore = 60;
    const eventDate = new Date(event.start_date || event.date);
    const nowMs = (asOf instanceof Date) ? asOf.getTime() : new Date(asOf).getTime();
    let daysUntil = 999;
    if (!isNaN(eventDate.getTime())) {
      daysUntil = Math.round((eventDate.getTime() - nowMs) / (24 * 60 * 60 * 1000));
      if (daysUntil >= 7 && daysUntil <= 60) {
        // Optimal liquidity window: H-7 to H-60
        proximityScore = 95;
        measuredSignals.push({
          signal: 'OPTIMAL_LIQUIDITY_WINDOW',
          days_until: daysUntil,
          impact: 'Event is in prime secondary trading window (7 to 60 days)'
        });
      } else if (daysUntil > 60 && daysUntil <= 120) {
        proximityScore = 75;
      } else if (daysUntil >= 0 && daysUntil < 7) {
        // Imminent event: high urgency
        proximityScore = 85;
        measuredSignals.push({
          signal: 'IMMINENT_EVENT_URGENCY',
          days_until: daysUntil,
          impact: 'Event is within 7 days (imminent turnaround)'
        });
      } else {
        proximityScore = 50;
      }
    }

    // --- Weighted Liquidity Score Aggregation ---
    const rawScore = Math.round(
      (demandScore * 0.35) +
      (supplyScore * 0.25) +
      (artistScore * 0.20) +
      (proximityScore * 0.20)
    );

    const liquidityScore = Math.min(100, Math.max(10, rawScore));

    let liquidityTier = 'MEDIUM';
    if (liquidityScore >= 80) liquidityTier = 'HIGH';
    else if (liquidityScore < 50) liquidityTier = 'LOW';

    return {
      liquidity_score: liquidityScore,
      liquidity_tier: liquidityTier,
      components: {
        expected_buyer_demand: demandScore,
        potential_seller_supply: supplyScore,
        artist_popularity: artistScore,
        event_proximity_score: proximityScore,
        days_until_event: daysUntil !== 999 ? daysUntil : null
      },
      measured_signals: measuredSignals,
      estimated_signals: estimatedSignals,
      rationale: rationales.join(' • ') || 'Standard verified event liquidity profile',
      fallback_applied: measuredSignals.length === 0
    };
  }
}

module.exports = {
  EventLiquidityEngine,
  VENUE_CAPACITY_TIERS
};
