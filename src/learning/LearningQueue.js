/**
 * LearningQueue — Phase 1 Continuous Learning
 * 
 * Buffers operational case resolutions, market movements, and drift parameters 
 * before processing batch updates.
 */
class LearningQueue {
  constructor() {
    this.queue = [];
  }

  /**
   * Pushes a new learning event into the queue.
   */
  enqueue(event) {
    if (!event) return;
    this.queue.push({
      eventId: `learn-ev-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      payload: event,
      status: 'QUEUED'
    });
  }

  /**
   * Dequeues a batch of items.
   */
  dequeueBatch(limit = 10) {
    const batch = [];
    while (this.queue.length > 0 && batch.length < limit) {
      batch.push(this.queue.shift());
    }
    return batch;
  }

  /**
   * Returns current buffer size.
   */
  size() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}

module.exports = LearningQueue;
