/**
 * ChampionRegistry — Phase 2 Model Evolution
 * 
 * Manages deployment and indexing of the active Champion model.
 */
class ChampionRegistry {
  constructor() {
    this.activeChampion = null;
  }

  /**
   * Sets the active Champion model candidate.
   */
  setActive(modelCandidate) {
    this.activeChampion = modelCandidate;
  }

  /**
   * Recalls the active Champion model.
   */
  getActive() {
    return this.activeChampion;
  }
}

module.exports = ChampionRegistry;
