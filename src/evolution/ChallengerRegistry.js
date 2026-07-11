/**
 * ChallengerRegistry — Phase 2 Model Evolution
 * 
 * Catalog index for candidate Challenger models running in parallel/shadow mode.
 */
class ChallengerRegistry {
  constructor() {
    this.challengers = new Map();
  }

  /**
   * Registers a Challenger model.
   */
  register(modelCandidate) {
    if (!modelCandidate || !modelCandidate.modelId) {
      throw new Error('Challenger must contain a modelId');
    }
    this.challengers.set(modelCandidate.modelId, modelCandidate);
  }

  /**
   * Recalls a Challenger model.
   */
  get(modelId) {
    return this.challengers.get(modelId);
  }

  /**
   * Lists all active challengers.
   */
  list() {
    return Array.from(this.challengers.values());
  }

  /**
   * Removes a Challenger.
   */
  remove(modelId) {
    this.challengers.delete(modelId);
  }
}

module.exports = ChallengerRegistry;
