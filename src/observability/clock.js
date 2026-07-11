/**
 * Clock Abstraction — Phase 3 Operational Foundation
 *
 * Never call Date.now() directly in domain code.
 * Use clock.now() for deterministic replay and testable time.
 *
 * Supports FixedClock (deterministic), SystemClock (real time),
 * and TestClock (manual control).
 */

class AbstractClock {
  now() { throw new Error('Not implemented'); }
  timestampMs() { throw new Error('Not implemented'); }
  elapsedSince(timestamp) {
    const then = new Date(timestamp).getTime();
    return this.timestampMs() - then;
  }
  isExpired(timestamp, durationMs) {
    return this.elapsedSince(timestamp) > durationMs;
  }
}

class SystemClock extends AbstractClock {
  now() { return new Date().toISOString(); }
  timestampMs() { return Date.now(); }
}

class FixedClock extends AbstractClock {
  constructor(fixedTime) {
    super();
    this._fixed = fixedTime || '2026-01-01T00:00:00.000Z';
  }

  now() { return this._fixed; }
  timestampMs() { return new Date(this._fixed).getTime(); }

  setTime(time) { this._fixed = time; }
}

class TestClock extends AbstractClock {
  constructor() {
    super();
    this._currentTime = null;
    this._ticks = 0;
  }

  now() {
    if (this._currentTime) return this._currentTime;
    return new Date().toISOString();
  }

  timestampMs() {
    if (this._currentTime) return new Date(this._currentTime).getTime();
    return Date.now();
  }

  freeze(time) {
    this._currentTime = time || new Date().toISOString();
  }

  advance(ms) {
    if (this._currentTime) {
      const current = new Date(this._currentTime).getTime();
      this._currentTime = new Date(current + ms).toISOString();
    }
  }

  tick(ms = 1) {
    this._ticks++;
    this.advance(ms);
  }

  unfreeze() {
    this._currentTime = null;
  }

  get ticks() { return this._ticks; }

  reset() {
    this._currentTime = null;
    this._ticks = 0;
  }
}

// Default clock is system clock
const clock = new SystemClock();

module.exports = { AbstractClock, SystemClock, FixedClock, TestClock, clock };