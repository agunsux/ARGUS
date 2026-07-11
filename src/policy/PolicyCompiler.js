const Policy = require('./Policy');
const RuleSet = require('./RuleSet');
const PolicyRule = require('./PolicyRule');
const Constraint = require('./Constraint');
const Predicate = require('./Predicate');

/**
 * PolicyCompiler — Phase 5 Policy Framework
 * 
 * Compiles a declarative PolicyDefinition containing nested JSON constraints 
 * into executable Policy and RuleSet structures.
 */
class PolicyCompiler {
  /**
   * Compiles a PolicyDefinition.
   */
  static compile(definition) {
    if (!definition) {
      throw new Error('PolicyDefinition is required for compilation');
    }

    const ruleSet = new RuleSet();

    for (const rawRule of definition.rules) {
      const constraints = (rawRule.constraints || []).map(c => PolicyCompiler._compileNode(c));
      const rule = new PolicyRule({
        id: rawRule.id,
        name: rawRule.name,
        description: rawRule.description,
        action: rawRule.action,
        reasonCode: rawRule.reasonCode,
        constraints,
        evidenceRequirements: rawRule.evidenceRequirements
      });
      ruleSet.add(rule);
    }

    return new Policy({
      id: definition.id,
      name: definition.name,
      version: definition.version,
      schemaVersion: definition.schemaVersion,
      compatibleSince: definition.compatibleSince,
      deprecatedSince: definition.deprecatedSince,
      ruleSet
    });
  }

  static _compileNode(raw) {
    if (raw.type === 'AND' || raw.type === 'OR' || raw.type === 'NOT') {
      const children = (raw.children || []).map(c => PolicyCompiler._compileNode(c));
      return new Predicate(raw.type, children);
    }
    return new Constraint(raw);
  }
}

module.exports = PolicyCompiler;
