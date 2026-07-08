/**
 * Event Bus — Wave 2 Protocol Layer
 * 
 * Interface-based, in-memory first implementation.
 * Can be swapped for Redis Streams, Kafka, or Google Pub/Sub
 * without changing domain code.
 */
class EventBus {
  constructor() {
    this._handlers = new Map();
    this._history = [];
  }

  /**
   * Publishes a domain event to all registered handlers.
   * Events are always published AFTER being persisted.
   */
  publish(event) {
    if (!event || !event.type) throw new Error('Cannot publish event without type');
    
    // Store in history for replay
    this._history.push(event);
    
    // Notify handlers
    const handlers = this._handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Handler error for ${event.type}:`, err.message);
      }
    }
    
    // Also notify wildcard handlers
    const wildcards = this._handlers.get('*') || [];
    for (const handler of wildcards) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Wildcard handler error:`, err.message);
      }
    }
  }

  /**
   * Registers a handler for a specific event type.
   * Use '*' for all events.
   */
  subscribe(eventType, handler) {
    if (typeof handler !== 'function') throw new Error('Handler must be a function');
    
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, []);
    }
    this._handlers.get(eventType).push(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this._handlers.get(eventType);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  /**
   * Returns all events published since start (for testing / replay).
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Clears history (for test isolation).
   */
  clear() {
    this._history = [];
  }
}

module.exports = { EventBus };
