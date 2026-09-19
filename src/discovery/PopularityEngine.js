/**
 * TIKUM / ARGUS Popularity & Demand Intelligence Engine
 * 
 * Enforces:
 * 1. Ground-Truth Demand Signals ONLY:
 *    - Sold out status from primary ticketing partners
 *    - Ticket tier exhaustion velocity
 *    - Watchlist & save counts on Tikum
 *    - Secondary marketplace transaction & inquiry velocity
 *    - Search query volume
 * 2. Strict Separation of Context Signals:
 *    - time_remaining is NOT treated as popularity! (An obscure event in 2 days is NOT popular)
 *    - Venue scale factor stored separately as contextual capacity
 * 3. Deterministic LOCAL_GEMS Scoring & Qualification Gate:
 *    - Mathematical scoring based on locality, evidence quality, freshness, and local engagement.
 *    - Strictly excludes national mega-stadium tours to surface genuine regional gems.
 * 4. Zero Fake Metrics / Full Audit Provenance:
 *    - Unobserved signals are omitted rather than fabricated.
 */

const VENUE_CAPACITY_WEIGHTS = {
  STADIUM_MEGA: 1.0,      // GBK, JIS, GBT (50,000+)
  MEGA: 1.0,
  STADIUM_REGIONAL: 0.85,  // Siliwangi, Manahan (20,000+)
  ARENA_LARGE: 0.80,       // Indonesia Arena, ICE BSD, JEC, CCC Makassar (10,000 - 20,000)
  LARGE: 0.80,
  ARENA_MEDIUM: 0.65,      // Sam Poo Kong, Graha Cakrawala (5,000 - 10,000)
  MEDIUM: 0.65,
  HALL_MEDIUM: 0.50,       // De Tjolomadoe, Pos Bloc, Tiara (1,000 - 5,000)
  CULTURAL: 0.50,
  CLUB_RESORT: 0.40,       // Savaya Bali, beach clubs (< 2,000)
  CLUB: 0.40,
  UNKNOWN: 0.40
};

// Cities qualifying as Regional Hubs / Tier-2/3 for LOCAL_GEMS
const NON_MEGA_REGIONAL_CITIES = new Set([
  'bandung', 'surabaya', 'yogyakarta', 'solo', 'surakarta', 'semarang',
  'malang', 'bali', 'denpasar', 'badung', 'gianyar', 'tabanan', 'mataram',
  'medan', 'palembang', 'pekanbaru', 'batam', 'padang', 'bandar lampung',
  'banjarmasin', 'banjarbaru', 'samarinda', 'balikpapan', 'pontianak',
  'makassar', 'manado', 'jayapura', 'tulungagung', 'kediri', 'jember',
  'purwokerto', 'salatiga', 'magelang', 'cirebon', 'tasikmalaya'
]);

class PopularityEngine {
  /**
   * Computes auditable popularity score from ground-truth signals
   */
  static calculatePopularity(event, externalSignals = {}) {
    const popularitySignals = [];
    const contextSignals = {};

    let totalWeight = 0;
    let weightedSum = 0;

    // 1. Primary Ticketing Sold-Out Signal (Ground Truth)
    const isSoldOut = Boolean(
      externalSignals.is_sold_out || 
      externalSignals.primary_sold_out || 
      event.is_sold_out || 
      event.ticket_availability === 'SOLD_OUT' || 
      event.sale_status === 'SOLD_OUT'
    );
    if (isSoldOut) {
      popularitySignals.push({
        signal: 'primary_sold_out',
        value: true,
        source: externalSignals.ticketing_source || event.ticket_provider || 'primary_ticketing',
        observed_at: new Date().toISOString(),
        weight: 0.35,
        contribution: 100
      });
      weightedSum += 100 * 0.35;
      totalWeight += 0.35;
    }

    // 2. Search Query Index Signal
    const searchIdx = Number(externalSignals.search_volume_index || externalSignals.search_index || 0);
    if (searchIdx > 0) {
      const sVal = Math.min(100, Math.max(0, searchIdx));
      popularitySignals.push({
        signal: 'search_query_volume',
        value: sVal,
        source: 'search_intelligence',
        observed_at: new Date().toISOString(),
        weight: 0.25,
        contribution: sVal
      });
      weightedSum += sVal * 0.25;
      totalWeight += 0.25;
    }

    // 3. View / Engagement Velocity
    const viewCount = Number(externalSignals.view_count_24h || externalSignals.view_count || 0);
    if (viewCount > 0) {
      const vVal = Math.min(100, Math.round(Math.log10(viewCount + 1) * 25));
      popularitySignals.push({
        signal: 'view_velocity_24h',
        value: viewCount,
        normalized_score: vVal,
        observed_at: new Date().toISOString(),
        weight: 0.20,
        contribution: vVal
      });
      weightedSum += vVal * 0.20;
      totalWeight += 0.20;
    }

    // 4. Ticket Velocity / Tier Exhaustion
    if (externalSignals.ticket_velocity !== undefined) {
      const v = Math.min(100, Math.max(0, Number(externalSignals.ticket_velocity)));
      popularitySignals.push({
        signal: 'ticket_tier_velocity',
        value: v,
        source: externalSignals.ticketing_source || 'ticketing_adapter',
        observed_at: new Date().toISOString(),
        weight: 0.25,
        contribution: v
      });
      weightedSum += v * 0.25;
      totalWeight += 0.25;
    }

    // 5. Platform Watchlist / Bookmark Interest
    const watchlistCount = Number(externalSignals.watchlist_count || event.watchlist_count || 0);
    if (watchlistCount > 0) {
      // Scale logarithmic: 10 saves = 50, 100 saves = 80, 500+ saves = 100
      const scaledWatchlist = Math.min(100, Math.round(Math.log10(watchlistCount + 1) * 35));
      popularitySignals.push({
        signal: 'watchlist_saves',
        count: watchlistCount,
        normalized_score: scaledWatchlist,
        observed_at: new Date().toISOString(),
        weight: 0.20,
        contribution: scaledWatchlist
      });
      weightedSum += scaledWatchlist * 0.20;
      totalWeight += 0.20;
    }

    // 6. Secondary Marketplace Transaction Velocity
    const txVelocity = Number(externalSignals.transaction_velocity || event.transaction_velocity || 0);
    if (txVelocity > 0) {
      const scaledTx = Math.min(100, txVelocity * 20);
      popularitySignals.push({
        signal: 'secondary_demand_velocity',
        value: txVelocity,
        normalized_score: scaledTx,
        observed_at: new Date().toISOString(),
        weight: 0.20,
        contribution: scaledTx
      });
      weightedSum += scaledTx * 0.20;
      totalWeight += 0.20;
    }

    // 7. Multi-Source Independent Attention Footprint
    const sourceCount = (event.sources && Array.isArray(event.sources)) ? event.sources.length : (event.source_count || 1);
    if (sourceCount >= 2) {
      const sourceScore = sourceCount >= 3 ? 90 : 70;
      popularitySignals.push({
        signal: 'multi_source_corroboration_demand',
        source_count: sourceCount,
        normalized_score: sourceScore,
        observed_at: new Date().toISOString(),
        weight: 0.15,
        contribution: sourceScore
      });
      weightedSum += sourceScore * 0.15;
      totalWeight += 0.15;
    }

    // Venue Capacity Scale (Contextual Scale Factor)
    const capTier = event.capacity_tier || event.venue_capacity_tier || 'UNKNOWN';
    const venueScale = VENUE_CAPACITY_WEIGHTS[capTier] || 0.50;
    contextSignals.venue_scale = venueScale;
    contextSignals.capacity_tier = capTier;

    // Temporal Proximity (Context Signal ONLY — NOT blended into popularity score!)
    const eventDate = event.start_date || event.date;
    if (eventDate) {
      const daysUntil = Math.round((new Date(eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      contextSignals.event_proximity_days = daysUntil;
      contextSignals.time_remaining_days = daysUntil;
      contextSignals.is_imminent = daysUntil <= 7 && daysUntil >= 0;
      contextSignals.is_this_weekend = daysUntil <= 3 && daysUntil >= 0;
    }

    // Final Popularity Score calculation
    let baseScore = 20; // baseline unobserved score
    let confidence = 20;

    if (totalWeight > 0) {
      baseScore = Math.round(weightedSum / totalWeight);
      confidence = Math.min(95, Math.round(totalWeight * 100));
    }

    // Apply slight venue scale adjustment (up to +/- 10 points)
    const adjustedScore = Math.min(100, Math.max(10, Math.round(baseScore * (0.85 + (venueScale * 0.3)))));

    return {
      popularity_score: adjustedScore,
      popularity_confidence: confidence,
      popularity_signals: popularitySignals,
      context_signals: contextSignals
    };
  }

  /**
   * Deterministic LOCAL_GEMS Evaluation & Scoring:
   * S = Locality * Quality * Freshness * (1.0 + Local_Engagement)
   */
  static evaluateLocalGem(canonicalEvent) {
    const city = (canonicalEvent.city || canonicalEvent.venue_city || '').toLowerCase().trim();
    const verStatus = canonicalEvent.verification_status || canonicalEvent.status;
    const confidence = (canonicalEvent.verification_confidence || 50) / 100;
    const capTier = canonicalEvent.capacity_tier || 'UNKNOWN';

    // Gate 1: Locality - Must be non-Jabodetabek regional cultural hub
    const isRegionalCity = NON_MEGA_REGIONAL_CITIES.has(city);
    if (!isRegionalCity) {
      return { is_eligible: false, is_local_gem: false, local_gems_score: 0, reason: 'NOT_REGIONAL_TIER_2_OR_3_CITY' };
    }

    // Gate 2: Quality - Verification confidence >= 70%
    const isVerified = (verStatus === 'VERIFIED' || verStatus === 'PRIMARY_SOURCE_VERIFIED' || verStatus === 'PARTIALLY_VERIFIED') && confidence >= 0.70;
    if (!isVerified) {
      return { is_eligible: false, is_local_gem: false, local_gems_score: 0, reason: 'VERIFICATION_CONFIDENCE_BELOW_THRESHOLD' };
    }

    // Gate 3: Distinctness - Exclude national mega-stadium tours (GBK/JIS mega scale)
    if (capTier === 'STADIUM_MEGA' || capTier === 'MEGA') {
      return { is_eligible: false, is_local_gem: false, local_gems_score: 0, reason: 'MEGA_STADIUM_TOUR_EXCLUDED_FROM_LOCAL_GEMS' };
    }

    // Gate 4: Completeness - Has verified date, venue, city
    if (!canonicalEvent.start_date || (!canonicalEvent.venue_name && !canonicalEvent.venue)) {
      return { is_eligible: false, is_local_gem: false, local_gems_score: 0, reason: 'INCOMPLETE_TEMPORAL_OR_SPATIAL_METADATA' };
    }

    // Deterministic Formula Computation
    const localityFactor = 0.90; // Verified tier 2/3 city
    const qualityFactor = confidence; // 0.70 to 0.95
    
    // Freshness factor
    const daysUntil = canonicalEvent.start_date ? (new Date(canonicalEvent.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24) : 30;
    const freshnessFactor = Math.min(1.0, Math.max(0.6, 1.0 - (daysUntil > 60 ? 0.3 : 0.0)));

    // Local engagement factor
    const saves = Number(canonicalEvent.watchlist_count || 0);
    const localEngagement = Math.min(0.5, saves * 0.05);

    const rawScore = localityFactor * qualityFactor * freshnessFactor * (1.0 + localEngagement) * 100;
    const finalScore = Math.min(100, Math.max(10, Math.round(rawScore)));

    return {
      is_eligible: true,
      is_local_gem: true,
      local_gems_score: finalScore,
      factors: {
        locality: localityFactor,
        quality: Math.round(qualityFactor * 100) / 100,
        freshness: Math.round(freshnessFactor * 100) / 100,
        local_engagement: Math.round(localEngagement * 100) / 100
      }
    };
  }
}

module.exports = {
  PopularityEngine,
  VENUE_CAPACITY_WEIGHTS,
  NON_MEGA_REGIONAL_CITIES
};
