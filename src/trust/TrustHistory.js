/**
 * TrustHistory — Phase 8/EPIC I Trust Intelligence
 * 
 * Stores chronological snapshots of entity trust states.
 */
class TrustHistory {
  constructor() {
    this._snapshots = [];
  }

  add(snapshot) {
    if (!snapshot) return;
    this._snapshots.push(snapshot);
  }

  list() {
    return this._snapshots;
  }

  clear() {
    this._snapshots = [];
  }
}

module.exports = TrustHistory;
