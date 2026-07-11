const BaseContract = require('./BaseContract');
const Decision = require('./Decision');
const Recommendation = require('./Recommendation');
const Trust = require('./Trust');
const Risk = require('./Risk');
const Inference = require('./Inference');
const Evidence = require('./Evidence');

/**
 * ContractRegistry — Phase 4.9.5 Custom Registry
 * 
 * Central registry for looking up, validating, and deserializing canonical objects.
 */
class ContractRegistry {
  constructor() {
    this._registry = new Map();
  }

  /**
   * Registers a contract class under a specific type name.
   */
  register(typeName, contractClass) {
    this._registry.set(typeName, contractClass);
  }

  /**
   * Resolves a contract class by type name.
   */
  resolve(typeName) {
    const cls = this._registry.get(typeName);
    if (!cls) {
      throw new Error(`Contract type '${typeName}' is not registered in the ContractRegistry`);
    }
    return cls;
  }

  /**
   * Retrieves the schema version of the registered contract type.
   */
  version(typeName) {
    const cls = this.resolve(typeName);
    const inst = new cls();
    return inst.schemaVersion;
  }

  /**
   * Validates a raw data payload against a registered contract.
   */
  validate(typeName, data) {
    const cls = this.resolve(typeName);
    const inst = new cls(data);
    return inst.validate();
  }

  /**
   * Reconstructs a contract instance from a JSON object.
   */
  fromJSON(typeName, json) {
    const cls = this.resolve(typeName);
    return cls.fromJSON(json);
  }

  /**
   * Deserializes a string representation back into a class instance.
   */
  deserialize(typeName, str) {
    const cls = this.resolve(typeName);
    return cls.deserialize(str);
  }

  /**
   * Clears the registry.
   */
  clear() {
    this._registry.clear();
  }
}

// Instantiate and seed the canonical global registry
const registry = new ContractRegistry();

registry.register('Decision', Decision);
registry.register('Recommendation', Recommendation);
registry.register('Trust', Trust);
registry.register('Risk', Risk);
registry.register('Inference', Inference);
registry.register('Evidence', Evidence);

module.exports = {
  BaseContract,
  Decision,
  Recommendation,
  Trust,
  Risk,
  Inference,
  Evidence,
  ContractRegistry,
  registry
};
