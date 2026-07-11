/**
 * Event Store Interfaces — Phase 3 Operational Foundation
 *
 * Current implementation remains untouched.
 * These interfaces enable swapping implementations (memory, filesystem, database)
 * without changing domain code.
 *
 * Repository must depend on interfaces only.
 */

/**
 * @typedef {Object} EventStore
 * @property {function} append - Appends one or more events
 * @property {function} getEvents - Gets all events for a transaction
 * @property {function} getAllEvents - Gets all events (for replay)
 * @property {function} count - Returns event count
 * @property {function} clear - Clears store (testing)
 */

/**
 * @typedef {Object} ProjectionStore
 * @property {function} save - Saves a projection state
 * @property {function} load - Loads a projection state
 * @property {function} delete - Deletes a projection
 * @property {function} list - Lists all projection names
 * @property {function} clear - Clears store (testing)
 */

/**
 * @typedef {Object} SnapshotStore
 * @property {function} save - Saves a snapshot
 * @property {function} loadLatest - Loads the latest snapshot for an aggregate
 * @property {function} loadAtVersion - Loads snapshot at specific version
 * @property {function} delete - Deletes a snapshot
 * @property {function} clear - Clears store (testing)
 */

// ==================== In-Memory Implementations ====================

class InMemoryEventStore {
  constructor() {
    this._events = [];
    this._byTransaction = new Map();
  }

  /**
   * Appends one or more events.
   */
  append(eventOrEvents) {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    for (const event of events) {
      this._events.push(event);
      const txId = event.transactionId;
      if (!this._byTransaction.has(txId)) {
        this._byTransaction.set(txId, []);
      }
      this._byTransaction.get(txId).push(event);
    }
  }

  /**
   * Gets all events for a transaction, sorted by version.
   */
  getEvents(transactionId) {
    const events = this._byTransaction.get(transactionId) || [];
    return [...events].sort((a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0));
  }

  /**
   * Gets all events, sorted by version.
   */
  getAllEvents() {
    return [...this._events].sort((a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0));
  }

  /**
   * Returns the total event count.
   */
  count() {
    return this._events.length;
  }

  /**
   * Clears all events.
   */
  clear() {
    this._events = [];
    this._byTransaction.clear();
  }
}

class InMemoryProjectionStore {
  constructor() {
    this._projections = new Map();
  }

  save(name, state) {
    this._projections.set(name, state);
  }

  load(name) {
    return this._projections.get(name) || null;
  }

  delete(name) {
    this._projections.delete(name);
  }

  list() {
    return Array.from(this._projections.keys());
  }

  clear() {
    this._projections.clear();
  }
}

class InMemorySnapshotStore {
  constructor() {
    this._snapshots = new Map(); // key: `${transactionId}:${version}`
    this._byAggregate = new Map(); // key: transactionId -> [{version, snapshot}]
  }

  save(transactionId, snapshot) {
    const key = `${transactionId}:${snapshot.version}`;
    this._snapshots.set(key, snapshot);
    if (!this._byAggregate.has(transactionId)) {
      this._byAggregate.set(transactionId, []);
    }
    this._byAggregate.get(transactionId).push({ version: snapshot.version, key });
  }

  loadLatest(transactionId) {
    const versions = this._byAggregate.get(transactionId);
    if (!versions || versions.length === 0) return null;
    const latest = versions.reduce((a, b) => a.version > b.version ? a : b);
    return this._snapshots.get(latest.key) || null;
  }

  loadAtVersion(transactionId, version) {
    const key = `${transactionId}:${version}`;
    return this._snapshots.get(key) || null;
  }

  delete(transactionId) {
    const versions = this._byAggregate.get(transactionId) || [];
    for (const v of versions) {
      this._snapshots.delete(v.key);
    }
    this._byAggregate.delete(transactionId);
  }

  clear() {
    this._snapshots.clear();
    this._byAggregate.clear();
  }
}

module.exports = {
  InMemoryEventStore,
  InMemoryProjectionStore,
  InMemorySnapshotStore
};