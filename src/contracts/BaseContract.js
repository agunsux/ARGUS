const crypto = require('crypto');

/**
 * BaseContract — Phase 4.9.5 Canonical Contracts
 * 
 * Enforces standardized metadata, object identity (lineage), schema evolution, 
 * immutability, deterministic serialization, and hashing.
 */
class BaseContract {
  constructor(data = {}) {
    // Object Identity & Lineage Traceability
    this.id = data.id !== undefined ? data.id : '';
    this.entityId = data.entityId !== undefined ? data.entityId : '';
    this.parentId = data.parentId !== undefined ? data.parentId : '';
    this.rootId = data.rootId !== undefined ? data.rootId : '';
    this.executionId = data.executionId !== undefined ? data.executionId : '';
    this.correlationId = data.correlationId !== undefined ? data.correlationId : '';
    this.causationId = data.causationId !== undefined ? data.causationId : '';

    // Schema Versioning & Evolution
    this.version = typeof data.version === 'number' ? data.version : 1;
    this.schemaVersion = data.schemaVersion !== undefined ? data.schemaVersion : '1.0.0';
    this.migrationVersion = typeof data.migrationVersion === 'number' ? data.migrationVersion : 0;
    this.compatibleSince = data.compatibleSince !== undefined ? data.compatibleSince : '1.0.0';
    this.deprecatedSince = data.deprecatedSince !== undefined ? data.deprecatedSince : '';

    // Metadata & Telemetry Context
    this.createdAt = data.createdAt !== undefined ? data.createdAt : new Date().toISOString();
    this.metadata = data.metadata !== undefined ? data.metadata : {};
    this.trace = data.trace !== undefined ? data.trace : { traceId: '', spanId: '' };
    this.audit = data.audit !== undefined ? data.audit : { actor: '', action: '' };
  }

  /**
   * Validates structural invariants of the BaseContract.
   * Returns { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];
    if (typeof this.id !== 'string' || !this.id.trim()) {
      errors.push('id must be a non-empty string');
    }
    if (typeof this.entityId !== 'string') {
      errors.push('entityId must be a string');
    }
    if (typeof this.parentId !== 'string') {
      errors.push('parentId must be a string');
    }
    if (typeof this.rootId !== 'string') {
      errors.push('rootId must be a string');
    }
    if (typeof this.executionId !== 'string' || !this.executionId.trim()) {
      errors.push('executionId must be a non-empty string');
    }
    if (typeof this.correlationId !== 'string' || !this.correlationId.trim()) {
      errors.push('correlationId must be a non-empty string');
    }
    if (typeof this.causationId !== 'string') {
      errors.push('causationId must be a string');
    }

    if (typeof this.version !== 'number' || this.version < 1) {
      errors.push('version must be a number >= 1');
    }
    if (typeof this.schemaVersion !== 'string' || !this.schemaVersion.trim()) {
      errors.push('schemaVersion must be a non-empty string');
    }
    if (typeof this.migrationVersion !== 'number') {
      errors.push('migrationVersion must be a number');
    }
    if (typeof this.compatibleSince !== 'string') {
      errors.push('compatibleSince must be a string');
    }
    if (typeof this.deprecatedSince !== 'string') {
      errors.push('deprecatedSince must be a string');
    }

    if (typeof this.createdAt !== 'string' || isNaN(Date.parse(this.createdAt))) {
      errors.push('createdAt must be a valid ISO date string');
    }
    if (typeof this.metadata !== 'object' || this.metadata === null) {
      errors.push('metadata must be an object');
    }
    if (typeof this.trace !== 'object' || this.trace === null) {
      errors.push('trace must be an object');
    }
    if (typeof this.audit !== 'object' || this.audit === null) {
      errors.push('audit must be an object');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Performs a deep clone of the object.
   * Returns a new instance of the same class (unfrozen).
   */
  clone() {
    const raw = JSON.parse(JSON.stringify(this.toJSON()));
    return new this.constructor(raw);
  }

  /**
   * Deeply freezes the object to enforce absolute immutability.
   */
  freeze() {
    const deepFreeze = (obj) => {
      if (obj === null || typeof obj !== 'object') return obj;
      Object.freeze(obj);
      Object.getOwnPropertyNames(obj).forEach(prop => {
        if (Object.prototype.hasOwnProperty.call(obj, prop) &&
            obj[prop] !== null &&
            (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') &&
            !Object.isFrozen(obj[prop])) {
          deepFreeze(obj[prop]);
        }
      });
      return obj;
    };
    deepFreeze(this);
    return this;
  }

  /**
   * Checks if the object has been frozen.
   */
  isFrozen() {
    return Object.isFrozen(this);
  }

  /**
   * Deterministically stringifies the object, sorting keys alphabetically.
   */
  serialize() {
    return BaseContract.deterministicStringify(this.toJSON());
  }

  /**
   * Computes a SHA-256 cryptographic hash of the deterministic stringified payload.
   */
  hash() {
    return crypto.createHash('sha256').update(this.serialize()).digest('hex');
  }

  /**
   * Converts the contract to a plain object.
   */
  toJSON() {
    return {
      id: this.id,
      entityId: this.entityId,
      parentId: this.parentId,
      rootId: this.rootId,
      executionId: this.executionId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      version: this.version,
      schemaVersion: this.schemaVersion,
      migrationVersion: this.migrationVersion,
      compatibleSince: this.compatibleSince,
      deprecatedSince: this.deprecatedSince,
      createdAt: this.createdAt,
      metadata: this.metadata,
      trace: this.trace,
      audit: this.audit
    };
  }

  /**
   * Reconstructs an instance of the class from a plain JSON object.
   */
  static fromJSON(json) {
    return new this(json);
  }

  /**
   * Deserializes a string representation back into a class instance.
   */
  static deserialize(str) {
    return this.fromJSON(JSON.parse(str));
  }

  /**
   * Recursively stringifies an object sorting keys alphabetically.
   */
  static deterministicStringify(obj) {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => BaseContract.deterministicStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const parts = keys.map(k => `${JSON.stringify(k)}:${BaseContract.deterministicStringify(obj[k])}`);
    return '{' + parts.join(',') + '}';
  }
}

module.exports = BaseContract;
