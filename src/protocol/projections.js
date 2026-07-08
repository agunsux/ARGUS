/**
 * Projection Engine — Wave 2 Protocol Layer
 * 
 * Read models built from domain events.
 * Projections can be deleted and rebuilt from event log at any time.
 * If a projection is corrupted, the system continues operating.
 */
class ProjectionEngine {
  constructor(eventBus) {
    this._projections = new Map();
    this._builders = new Map();

    // Auto-subscribe to events if eventBus provided
    if (eventBus) {
      eventBus.subscribe('*', (event) => this._handleEvent(event));
    }
  }

  /**
   * Registers a projection builder for a specific projection type.
   */
  register(name, builderFn) {
    this._builders.set(name, builderFn);
    this._projections.set(name, null);
  }

  /**
   * Handles an incoming event and updates all projections.
   */
  _handleEvent(event) {
    for (const [name, builder] of this._builders) {
      const current = this._projections.get(name);
      this._projections.set(name, builder(current, event));
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
   * Rebuilds all projections from an array of events.
   * This completely resets projections and replays all events.
   */
  rebuild(events) {
    this._projections.clear();
    for (const [name, builder] of this._builders) {
      this._projections.set(name, null);
    }
    const sorted = [...events].sort((a, b) => (a.aggregateVersion || 0) - (b.aggregateVersion || 0));
    for (const event of sorted) {
      this._handleEvent(event);
    }
  }

  /**
   * Registers standard ARGUS projections.
   */
  static registerDefaults(engine) {
    // Current transaction states
    engine.register('currentStates', (state, event) => {
      if (!state) state = {};
      state[event.transactionId] = {
        state: event.type,
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
      state.push({ type: event.type, transactionId: event.transactionId, actor: event.actor, timestamp: event.timestamp });
      if (state.length > 100) state.shift();
      return state;
    });

    // Failure events
    engine.register('failures', (state, event) => {
      if (event.type === 'TransactionFailed') {
        if (!state) state = [];
        state.push({ transactionId: event.transactionId, reason: event.data.reason, timestamp: event.timestamp });
        if (state.length > 50) state.shift();
      }
      return state || [];
    });
  }
}

module.exports = { ProjectionEngine };
