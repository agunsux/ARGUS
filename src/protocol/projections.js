/**
 * Projection Engine — Phase 3 Operational Foundation
 *
 * Read models built from domain events.
 * Projections can be:
 * - Deleted and rebuilt from zero
 * - Incrementally updated
 * - Partially rebuilt
 * - Verified by replay and hash comparison
 */

const crypto = require('crypto');
const { InMemoryProjectionStore } = require('../store/interfaces');

class ProjectionEngine {
  constructor(eventBus, store) {
    this._projections = new Map();
    this._builders = new Map();
    this._store = store || new InMemoryProjectionStore();
    this._metrics = { builds: 0, rebuilds: 0, errors: 0 };
    this._hashes = new Map(); // projectionName -> hash of current state

    // Auto-subscribe to events if eventBus provided
    if (eventBus) {
      eventBus.subscribe('*', (event) => {
        const start = Date.now();
        try {
          this._handleEvent(event);
        } finally {
          // Track latency
        }
      });
    }
  }

  /**
   * Registers a projection builder for a specific projection type.
   */
  register(name, builderFn) {
    if (typeof builderFn !== 'function') throw new Error('Projection builder must be a function');
    this._builders.set(name, builderFn);
    this._projections.set(name, null);
  }

  /**
   * Handles an incoming event and updates all projections.
   */
  _handleEvent(event) {
    for (const [name, builder] of this._builders) {
      const current = this._projections.get(name);
      try {
        const updated = builder(current, event);
        this._projections.set(name, updated);
      } catch (err) {
        this._metrics.errors++;
        // Projection error must not crash the system
      }
    }
  }

  /**
   * Gets the current state of a projection.
   */
  get(name) {
    return this._projections.get(name) || null;
  }

  /**
   * Gets all projection states.
   */
  getAll() {
    const result = {};
    for (const [name, value] of this._projections) {
      result[name] = value;
    }
    return result;
  }

  /**
   * Projects a single event through all builders.
   * Used for incremental updates.
   */
  projectEvent(event) {
    this._handleEvent(event);
    this._metrics.builds++;
  }

  // ==================== Rebuild Operations ====================

  /**
   * Rebuilds all projections from zero using an array of events.
   */
  rebuild(events) {
    const start = Date.now();

    // Clear all projections
    this._projections.clear();
    for (const [name, builder] of this._builders) {
      this._projections.set(name, null);
    }

    // Sort and replay all events
    const sorted = [...events].sort(
      (a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0)
    );
    for (const event of sorted) {
      this._handleEvent(event);
    }

    // Compute hashes
    for (const [name] of this._builders) {
      this._computeHash(name);
    }

    this._metrics.rebuilds++;
    const duration = Date.now() - start;
    return { duration, eventCount: sorted.length };
  }

  /**
   * Rebuilds a single projection from zero.
   */
  rebuildOne(name, events) {
    const start = Date.now();

    if (!this._builders.has(name)) {
      throw new Error(`Unknown projection: ${name}`);
    }

    // Reset single projection
    this._projections.set(name, null);

    // Replay all events
    const sorted = [...events].sort(
      (a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0)
    );
    const builder = this._builders.get(name);
    for (const event of sorted) {
      try {
        const current = this._projections.get(name);
        this._projections.set(name, builder(current, event));
      } catch (err) {
        this._metrics.errors++;
      }
    }

    this._computeHash(name);
    this._metrics.rebuilds++;
    return { duration: Date.now() - start, eventCount: sorted.length };
  }

  /**
   * Deletes a projection entirely.
   */
  delete(name) {
    this._projections.delete(name);
    this._builders.delete(name);
    this._hashes.delete(name);
    this._store.delete(name);
  }

  /**
   * Returns hash comparison between current state and stored state.
   */
  verifyHash(name) {
    const currentHash = this._hashes.get(name);
    const storedState = this._store.load(name);
    if (!storedState) return { match: false, reason: 'No stored state' };

    const storedHash = this._computeHashFor(storedState);
    return {
      match: currentHash === storedHash,
      currentHash,
      storedHash
    };
  }

  /**
   * Verifies projection by replaying events and comparing results.
   */
  verifyReplay(name, events) {
    const original = this.get(name);

    // Rebuild from zero
    const savedBuilder = this._builders.get(name);
    if (!savedBuilder) throw new Error(`Unknown projection: ${name}`);

    let rebuilt = null;
    const sorted = [...events].sort(
      (a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0)
    );
    for (const event of sorted) {
      rebuilt = savedBuilder(rebuilt, event);
    }

    const match = JSON.stringify(original) === JSON.stringify(rebuilt);
    return { match, originalHash: this._computeHashFor(original), rebuiltHash: this._computeHashFor(rebuilt) };
  }

  /**
   * Returns performance metrics.
   */
  getMetrics() {
    return { ...this._metrics };
  }

  // ==================== Internal ====================

  _computeHash(name) {
    const state = this._projections.get(name);
    this._hashes.set(name, this._computeHashFor(state));
  }

  _computeHashFor(state) {
    try {
      return crypto.createHash('sha256')
        .update(JSON.stringify(state))
        .digest('hex');
    } catch {
      return null;
    }
  }

  // ==================== Standard Projections ====================

  static registerDefaults(engine) {
    // Current transaction states
    engine.register('currentStates', (state, event) => {
      if (!state) state = {};
      state[event.transactionId] = {
        type: event.type,
        version: event.aggregateVersion,
        updatedAt: event.timestamp
      };
      return state;
    });

    // Event count
    engine.register('eventCount', (state, event) => {
      return (state || 0) + 1;
    });

    // Transaction count by type
    engine.register('transactionCounts', (state, event) => {
      if (!state) state = {};
      state[event.type] = (state[event.type] || 0) + 1;
      state.total = (state.total || 0) + 1;
      return state;
    });

    // Recent events (keep last 100)
    engine.register('recentEvents', (state, event) => {
      if (!state) state = [];
      state.push({
        type: event.type,
        transactionId: event.transactionId,
        actor: event.actor,
        timestamp: event.timestamp,
        version: event.aggregateVersion
      });
      if (state.length > 100) state.shift();
      return state;
    });

    // Failure events
    engine.register('failures', (state, event) => {
      if (event.type === 'TransactionFailed') {
        if (!state) state = [];
        state.push({
          transactionId: event.transactionId,
          reason: event.data.reason,
          code: event.data.code,
          timestamp: event.timestamp
        });
        if (state.length > 50) state.shift();
      }
      return state || [];
    });

    // Actor activity
    engine.register('actorActivity', (state, event) => {
      if (!state) state = {};
      if (!state[event.actor]) state[event.actor] = { actions: 0, lastAction: null, transactions: new Set() };
      state[event.actor].actions++;
      state[event.actor].lastAction = { type: event.type, timestamp: event.timestamp };
      state[event.actor].transactions.add(event.transactionId);
      return state;
    });
  }
}

module.exports = { ProjectionEngine };