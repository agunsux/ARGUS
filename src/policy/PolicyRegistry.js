/**
 * PolicyRegistry — Phase 5 Policy Framework
 * 
 * Versioned registry to store, version-control, and resolve compiled Policies.
 */
class PolicyRegistry {
  constructor() {
    this._registry = new Map(); // Key: `${id}:${version}`
    this._latestVersions = new Map(); // Key: id -> latestVersion
  }

  /**
   * Registers a Policy instance.
   */
  register(policy) {
    if (!policy || !policy.id || !policy.version) {
      throw new Error('Invalid policy: id and version are required for registration');
    }
    const key = `${policy.id}:${policy.version}`;
    if (this._registry.has(key)) {
      throw new Error(`Policy '${policy.id}' version '${policy.version}' is already registered`);
    }

    this._registry.set(key, policy);

    const currentLatest = this._latestVersions.get(policy.id);
    if (!currentLatest || this._compareVersions(policy.version, currentLatest) > 0) {
      this._latestVersions.set(policy.id, policy.version);
    }
  }

  /**
   * Resolves a Policy by ID and optional version string.
   */
  resolve(id, version) {
    const targetVersion = version || this._latestVersions.get(id);
    if (!targetVersion) {
      throw new Error(`Policy '${id}' not found in registry`);
    }
    const key = `${id}:${targetVersion}`;
    const policy = this._registry.get(key);
    if (!policy) {
      throw new Error(`Policy '${id}' version '${targetVersion}' not found in registry`);
    }
    return policy;
  }

  list() {
    return Array.from(this._registry.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version
    }));
  }

  clear() {
    this._registry.clear();
    this._latestVersions.clear();
  }

  _compareVersions(v1, v2) {
    const parse = v => v.split('.').map(Number);
    const [maj1, min1, pat1] = parse(v1);
    const [maj2, min2, pat2] = parse(v2);

    if (maj1 !== maj2) return maj1 - maj2;
    if (min1 !== min2) return min1 - min2;
    return pat1 - pat2;
  }
}

const fs = require('fs');
const path = require('path');
const PolicyCompiler = require('./PolicyCompiler');
const PolicyDefinition = require('./PolicyDefinition');

const policyRegistry = new PolicyRegistry();

try {
  const jsonPath = path.resolve(__dirname, '../../fixtures/policy/policy_fixture_v1.json');
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const def = new PolicyDefinition(raw);
    const compiled = PolicyCompiler.compile(def);
    policyRegistry.register(compiled);
  }
} catch (err) {
  // Silent fallback
}

module.exports = {
  PolicyRegistry,
  policyRegistry
};

