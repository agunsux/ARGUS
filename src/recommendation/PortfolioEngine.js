/**
 * PortfolioEngine — Phase 6/EPIC H Recommendation Platform
 * 
 * Aggregates and monitors transaction portfolios, tracking cumulative 
 * exposures across different identities and assets.
 */
class PortfolioEngine {
  constructor() {
    this._exposures = new Map(); // Key: entityId -> Value: totalExposureAmount
  }

  /**
   * Records a transaction amount against an entity's exposure portfolio.
   */
  recordTransaction(entityId, amount) {
    if (!entityId) throw new Error('entityId is required');
    const numericAmount = typeof amount === 'number' ? amount : 0;
    
    const current = this._exposures.get(entityId) || 0;
    this._exposures.set(entityId, current + numericAmount);
  }

  /**
   * Returns current exposure level for a given entity.
   */
  getExposure(entityId) {
    return this._exposures.get(entityId) || 0;
  }

  /**
   * Resets all exposure records.
   */
  clear() {
    this._exposures.clear();
  }
}

module.exports = PortfolioEngine;
