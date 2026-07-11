/**
 * Snapshot Manager — Phase 3 Operational Foundation
 *
 * Creates automatic snapshots every configurable N events.
 * Supports aggregate reconstruction from latest snapshot + remaining events.
 *
 * Requirements:
 * - Deterministic
 * - Hash verification
 * - Version validation
 * - Replay compatibility
 * - Snapshot invalidation
 */
const crypto = require('crypto');

class SnapshotManager {
  /**
   * @param {Object} options
   * @param {SnapshotStore} options.store - Snapshot store implementation
   * @param {number} options.snapshotFrequency - Create snapshot every N events (default: 50)
   */
  constructor({ store, snapshotFrequency = 50 } = {}) {
    if (!store) throw new Error('SnapshotManager: store is required');
    this._store = store;
    this._snapshotFrequency = snapshotFrequency;
  }

  /**
   * Checks if a snapshot should be created based on aggregate version.
   */
  shouldSnapshot(aggregateVersion) {
    return aggregateVersion > 0 && aggregateVersion % this._snapshotFrequency === 0;
  }

  /**
   * Creates a snapshot of an aggregate state.
   * Returns the snapshot or null if snapshot frequency not met.
   */
  createSnapshot(aggregate) {
    if (!this.shouldSnapshot(aggregate.version)) return null;

    const snapshot = {
      transactionId: aggregate.transactionId,
      version: aggregate.version,
      state: aggregate.state,
      data: {
        currentOwnerId: aggregate.currentOwnerId,
        currentBuyerId: aggregate.currentBuyerId,
        price: aggregate.price,
        escrowId: aggregate.escrowId,
        escrowStatus: aggregate.escrowStatus,
        evidenceChain: aggregate.evidenceChain,
        history: aggregate.history,
        riskScore: aggregate.riskScore,
        errors: aggregate.errors
      },
      hash: null,
      createdAt: new Date().toISOString()
    };

    // Hash for verification
    const hashInput = {
      transactionId: snapshot.transactionId,
      version: snapshot.version,
      state: snapshot.state,
      data: snapshot.data
    };
    snapshot.hash = crypto.createHash('sha256')
      .update(JSON.stringify(hashInput))
      .digest('hex');

    this._store.save(aggregate.transactionId, snapshot);
    return snapshot;
  }

  /**
   * Loads the latest snapshot for a transaction.
   * Returns null if no snapshot exists.
   * Validates hash integrity.
   */
  loadSnapshot(transactionId) {
    const snapshot = this._store.loadLatest(transactionId);
    if (!snapshot) return null;

    // Verify hash
    if (!this._verifySnapshot(snapshot)) {
      // Hash mismatch — invalidate snapshot
      this._store.delete(transactionId);
      return null;
    }

    return snapshot;
  }

  /**
   * Reconstructs an aggregate from the latest snapshot + remaining events.
   * @param {function} AggregateClass - The aggregate class (must have static rebuild)
   * @param {string} transactionId
   * @param {Array} events - All events for this transaction (sorted)
   * @returns {Object} { aggregate, fromSnapshot, replayCount }
   */
  reconstructFromSnapshot(AggregateClass, transactionId, events) {
    const snapshot = this.loadSnapshot(transactionId);

    if (!snapshot) {
      // No snapshot — full replay
      const aggregate = AggregateClass.rebuild(transactionId, events);
      return { aggregate, fromSnapshot: null, replayCount: events.length };
    }

    // Replay only events after snapshot version
    const remainingEvents = events.filter(
      e => (e.aggregateVersion || 0) > snapshot.version
    );

    // Build aggregate from snapshot state
    const aggregate = new AggregateClass(transactionId);
    aggregate.version = snapshot.version;
    aggregate.state = snapshot.state;
    Object.assign(aggregate, snapshot.data);

    // Apply remaining events
    for (const event of remainingEvents.sort(
      (a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0)
    )) {
      aggregate.applyEvent(event);
    }

    return { aggregate, fromSnapshot: snapshot, replayCount: remainingEvents.length };
  }

  /**
   * Invalidates a snapshot (for testing or schema changes).
   */
  invalidate(transactionId) {
    this._store.delete(transactionId);
  }

  /**
   * Returns the snapshot frequency.
   */
  get frequency() {
    return this._snapshotFrequency;
  }

  /**
   * Verifies a snapshot's hash integrity.
   */
  _verifySnapshot(snapshot) {
    try {
      const hashInput = {
        transactionId: snapshot.transactionId,
        version: snapshot.version,
        state: snapshot.state,
        data: snapshot.data
      };
      const computed = crypto.createHash('sha256')
        .update(JSON.stringify(hashInput))
        .digest('hex');
      return computed === snapshot.hash;
    } catch {
      return false;
    }
  }
}

module.exports = { SnapshotManager };