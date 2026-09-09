/**
 * ARGUS Demand Capture Service (Epic: Event Discovery & SEO Engine)
 * 
 * Lightweight demand capture for zero-inventory or sold-out events.
 * Enables "Notify me when tickets become available" waitlist and market intelligence.
 */

const { v4: uuidv4 } = require('uuid');

class DemandCaptureService {
  constructor() {
    this.demands = [];
  }

  /**
   * Records interest in an event when inventory is zero or sold out.
   */
  registerInterest({ eventId, contactInfo, targetCategory = 'ANY', maxBudget = null }) {
    if (!eventId || !contactInfo) {
      throw new Error('eventId and contactInfo (email or phone) are required');
    }

    const demandRecord = {
      id: `dem-${uuidv4().substring(0, 8)}`,
      event_id: eventId,
      contact_info: String(contactInfo).trim(),
      target_category: targetCategory,
      max_budget: maxBudget ? parseInt(maxBudget, 10) : null,
      status: 'WAITING',
      created_at: new Date().toISOString()
    };

    this.demands.push(demandRecord);
    return demandRecord;
  }

  getDemandForEvent(eventId) {
    return this.demands.filter(d => d.event_id === eventId);
  }

  getAllDemands() {
    return [...this.demands];
  }

  /**
   * Aggregates demand intelligence across events.
   */
  getDemandIntelligence(canonicalEvents = []) {
    const demandByEvent = {};
    for (const d of this.demands) {
      demandByEvent[d.event_id] = (demandByEvent[d.event_id] || 0) + 1;
    }

    const report = Object.entries(demandByEvent).map(([eventId, count]) => {
      const event = canonicalEvents.find(e => e.event_id === eventId || e.id === eventId) || {};
      return {
        event_id: eventId,
        event_name: event.canonical_name || event.name || eventId,
        city: event.city || event.venue_city || 'Unknown',
        category: event.event_type || event.category || 'General',
        waiting_count: count
      };
    });

    return report.sort((a, b) => b.waiting_count - a.waiting_count);
  }

  reset() {
    this.demands = [];
  }
}

const demandCaptureInstance = new DemandCaptureService();

module.exports = {
  DemandCaptureService,
  demandCapture: demandCaptureInstance
};
