/**
 * CaseMemory — EPIC Ω Knowledge & Learning Layer
 * 
 * In-memory repository caching past Decisions for similarity comparisons.
 */
class CaseMemory {
  constructor() {
    this.cases = [];
  }

  /**
   * Stores a Decision contract in memory.
   */
  store(decision) {
    if (!decision) return;
    this.cases.push(decision);
  }

  /**
   * Recalls a decision by ID.
   */
  recall(caseId) {
    return this.cases.find(c => c.id === caseId);
  }

  /**
   * Returns all stored cases.
   */
  list() {
    return this.cases;
  }

  /**
   * Clears case memory.
   */
  clear() {
    this.cases = [];
  }
}

module.exports = CaseMemory;
