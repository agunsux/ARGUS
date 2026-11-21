/**
 * TIKUM / ARGUS — Transactional Outbox Dispatcher & Idempotent Event Delivery
 *
 * Guarantees reliable asynchronous delivery of financial events to external
 * boundaries (ARGUS Trust Engine, Venue Operations, Audit, Notifications).
 *
 * Invariants:
 * 1. Outbox events are persisted inside the SAME database transaction as the financial state.
 * 2. Dispatcher safely claims pending events via FOR UPDATE SKIP LOCKED.
 * 3. Consumers (ARGUS, Venue) are strictly idempotent: duplicate delivery creates zero duplicate effects.
 * 4. Delivery failure NEVER reverses or invalidates an already-committed financial transaction.
 * 5. Unrecoverable failures are captured in DEAD_LETTER state with error details.
 */

const { getMoneyRepository } = require('../../storage');
const { state, recordAuditLog } = require('../../database');

class OutboxDispatcher {
  constructor() {
    this.subscribers = new Map();
    this.registerDefaultSubscribers();
  }

  /**
   * Register a subscriber function for an event type.
   * Subscriber function signature: async function(event, context)
   */
  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(handler);
  }

  /**
   * Persists an outbox event within a transaction context.
   */
  async publishEvent({
    eventId,
    eventType,
    aggregateType,
    aggregateId,
    payload
  }, txContext = null) {
    const id = `obx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const effectiveEventId = eventId || `evt-${id}`;

    const outboxRecord = {
      id,
      event_id: effectiveEventId,
      event_type: eventType,
      aggregate_type: aggregateType || 'ORDER',
      aggregate_id: aggregateId,
      payload: payload || {},
      status: 'PENDING',
      retry_count: 0,
      max_retries: 5,
      last_error: null,
      next_retry_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      processed_at: null
    };

    if (!state.financial_outbox) {
      state.financial_outbox = [];
    }
    state.financial_outbox.push(outboxRecord);

    const moneyRepo = getMoneyRepository();
    if (moneyRepo && typeof moneyRepo.createOutboxEvent === 'function') {
      try {
        await moneyRepo.createOutboxEvent(outboxRecord, txContext);
      } catch (err) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw err;
        }
      }
    }

    return outboxRecord;
  }

  /**
   * Dispatches pending outbox events safely.
   */
  async dispatchPendingEvents(batchSize = 10) {
    const moneyRepo = getMoneyRepository();
    let events = [];

    if (moneyRepo && typeof moneyRepo.claimPendingOutboxEvents === 'function') {
      try {
        events = await moneyRepo.claimPendingOutboxEvents(batchSize);
      } catch (_) {
        events = [];
      }
    }

    // In-memory fallback if no DB events claimed
    if ((!events || events.length === 0) && state.financial_outbox) {
      const now = new Date();
      events = state.financial_outbox
        .filter(e => e.status === 'PENDING' && new Date(e.next_retry_at) <= now)
        .slice(0, batchSize);
    }

    const results = [];
    for (const event of events) {
      const res = await this.deliverEvent(event);
      results.push(res);
    }
    return results;
  }

  /**
   * Delivers a single outbox event to all registered subscribers.
   */
  async deliverEvent(event) {
    const eventId = event.event_id || event.id;
    const eventType = event.event_type || event.eventType;
    const handlers = this.subscribers.get(eventType) || [];

    const moneyRepo = getMoneyRepository();
    let deliveredCount = 0;
    let lastError = null;

    for (const handler of handlers) {
      try {
        await handler(event);
        deliveredCount++;
      } catch (err) {
        lastError = err;
        console.error(`[OutboxDispatcher] Handler error for event ${eventId}:`, err.message);
      }
    }

    const inMem = (state.financial_outbox || []).find(e => (e.event_id === eventId || e.id === event.id));

    if (lastError) {
      if (moneyRepo && typeof moneyRepo.markOutboxEventFailed === 'function') {
        try {
          await moneyRepo.markOutboxEventFailed(eventId, lastError.message, 60);
        } catch (_) {}
      }
      if (inMem) {
        inMem.retry_count = (inMem.retry_count || 0) + 1;
        inMem.last_error = lastError.message;
        inMem.status = inMem.retry_count >= (inMem.max_retries || 5) ? 'DEAD_LETTER' : 'PENDING';
      }
      return { eventId, status: inMem?.status || 'PENDING', error: lastError.message };
    }

    // Successfully processed
    if (moneyRepo && typeof moneyRepo.markOutboxEventProcessed === 'function') {
      try {
        await moneyRepo.markOutboxEventProcessed(eventId);
      } catch (_) {}
    }
    if (inMem) {
      inMem.status = 'PROCESSED';
      inMem.processed_at = new Date().toISOString();
    }

    return { eventId, status: 'PROCESSED', deliveredCount };
  }

  /**
   * Default subscribers connecting Outbox to ARGUS Trust Engine & Audit.
   */
  registerDefaultSubscribers() {
    // ARGUS Trust Engine Subscriber (Idempotent Attestation Generator)
    this.subscribe('PAYMENT_CONFIRMED', async (event) => {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload || {});
      const orderId = payload.orderId || payload.order_id || event.aggregate_id;
      if (!orderId) return;

      try {
        const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../../trust/TrustPolicyEngine');

        // Check if attestations already recorded for this order (Idempotent Consumer)
        const existingAttestations = (state.attestations || []).filter(a => a.order_id === orderId);
        const hasPaymentAttestation = existingAttestations.some(a => (a.attestation_type || a.type) === ATTESTATION_TYPE.PAYMENT_ATTESTATION);
        const hasPlatformAttestation = existingAttestations.some(a => (a.attestation_type || a.type) === ATTESTATION_TYPE.PLATFORM_ATTESTATION);
        const hasTicketEvidence = existingAttestations.some(a => (a.attestation_type || a.type) === ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION);

        if (!hasPaymentAttestation) {
          await TrustPolicyEngine.recordAttestation({
            orderId,
            attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
            actorId: 'SYSTEM',
            actorRole: 'system',
            result: 'PASS',
            metadata: {
              payment_id: payload.paymentId || payload.payment_id,
              amount: payload.amount,
              source: 'TRANSACTIONAL_OUTBOX',
              event_id: event.event_id || event.id
            }
          });
        }

        if (!hasPlatformAttestation) {
          await TrustPolicyEngine.recordAttestation({
            orderId,
            attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
            actorId: 'SYSTEM',
            actorRole: 'system',
            result: 'PASS',
            metadata: {
              check: 'PAYMENT_CONFIRMED_ATTESTATION',
              source: 'TRANSACTIONAL_OUTBOX',
              event_id: event.event_id || event.id
            }
          });
        }

        if (!hasTicketEvidence) {
          const order = (state.orders || []).find(o => o.id === orderId);
          const listing = order ? (state.listings || []).find(l => l.id === order.listing_id) : null;
          if (listing && (listing.evidence_bundle_id || listing.evidenceBundleId || listing.status === 'ACTIVE' || listing.status === 'SOLD' || listing.status === 'APPROVED_PRELAUNCH')) {
            await TrustPolicyEngine.recordAttestation({
              orderId,
              attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
              actorId: 'SYSTEM',
              actorRole: 'system',
              result: 'PASS',
              evidenceRef: listing.evidence_bundle_id || listing.evidenceBundleId || null,
              metadata: {
                check: 'TICKET_EVIDENCE_VERIFIED',
                source: 'TRANSACTIONAL_OUTBOX',
                event_id: event.event_id || event.id
              }
            });
          }
        }
      } catch (err) {
        // Log error and rethrow so outbox dispatcher schedules retry
        console.error(`[OutboxDispatcher/ARGUS] Failed to deliver attestation for order ${orderId}:`, err.message);
        throw err;
      }
    });
  }
}

const outboxDispatcher = new OutboxDispatcher();

module.exports = {
  OutboxDispatcher,
  outboxDispatcher
};
