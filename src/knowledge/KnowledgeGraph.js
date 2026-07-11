const { KnowledgeGraph: BaseKnowledgeGraph } = require('../graph/graph');

/**
 * KnowledgeGraph — EPIC Ω Knowledge & Learning Layer
 * 
 * Extends the baseline identity relation traversal graph to map 
 * abstract facts, dynamic rules, and inferences.
 */
class KnowledgeGraph extends BaseKnowledgeGraph {
  constructor() {
    super();
  }
}

module.exports = KnowledgeGraph;
