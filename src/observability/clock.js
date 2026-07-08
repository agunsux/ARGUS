/**
 * Clock Abstraction — Wave 2.5 Observability
 * 
 * Never call Date.now() directly in domain code.
 * Use clock.now() for deterministic replay and testable time.
 */
class Clock {
  constructor() {
    this._currentTime = null;
    this._ticks = 0;
  }

  /**
   * Returns the current time as ISO string.
   * If frozen (for replay/testing), returns the frozen time.
   */
  now() {
    if (this._currentTime) {
      return this._currentTime;
    }
    return new Date().toISOString();
  }

  /**
   * Returns the current time as timestamp (ms).
   */
  timestampMs() {
    if (this._currentTime) {
      return new Date(this._currentTime).getTime();
    }
    return Date.now();
  }

  /**
   * Freezes time at a specific point (for replay determinism).
   */
  freeze(time) {
    this._currentTime = time || new Date().toISOString();
  }

  /**
   * Advances frozen time by milliseconds (for testing timeouts).
   */
  advance(ms) {
    if (this._currentTime) {
      const current = new Date(this._currentTime).getTime();
      this._currentTime = new Date(current + ms).toISOString();
    }
  }

  /**
   * Releases the frozen time.
   */
  unfreeze() {
    this._currentTime = null;
  }

  /**
   * Returns elapsed ms since a given timestamp.
   */
  elapsedSince(timestamp) {
    const then = new Date(timestamp).getTime();
    return this.timestampMs() - then;
  }

  /**
   * Returns true if elapsed time exceeds the given duration in ms.
   */
  isExpired(timestamp, durationMs) {
    return this.elapsedSince(timestamp) > durationMs;
  }
}

// Singleton
const clock = new Clock();

module.exports = { Clock, clock };
