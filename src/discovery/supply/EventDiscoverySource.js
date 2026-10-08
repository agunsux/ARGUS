/**
 * TIKUM / ARGUS — Event Discovery Source Base Class
 *
 * Pluggable discovery adapter contract that normalizes all external sources
 * into DiscoveredEvent models without scraper spaghetti.
 */

const { DiscoveredEvent } = require('../models/DiscoveredEvent');

class EventDiscoverySource {
  constructor(sourceId, name, tier = 2) {
    this.sourceId = sourceId;
    this.name = name;
    this.tier = tier;
  }

  async discover(options = {}) {
    throw new Error('discover() must be implemented by subclass');
  }

  normalizeToDiscoveredEvent(rawItem) {
    throw new Error('normalizeToDiscoveredEvent() must be implemented by subclass');
  }
}

module.exports = {
  EventDiscoverySource
};
