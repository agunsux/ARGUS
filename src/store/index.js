/**
 * Store Module — Phase 3 Operational Foundation
 *
 * Central exports for all store interfaces and implementations.
 */
const { InMemoryEventStore, InMemoryProjectionStore, InMemorySnapshotStore } = require('./interfaces');
const { SnapshotManager } = require('./snapshotManager');

module.exports = {
  InMemoryEventStore,
  InMemoryProjectionStore,
  InMemorySnapshotStore,
  SnapshotManager
};