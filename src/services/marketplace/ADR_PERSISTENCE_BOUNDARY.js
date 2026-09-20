/**
 * ADR: PERSISTENCE_BOUNDARY
 *
 * Date: 2026-09-20
 * Status: ACCEPTED
 * Context: Epic 6 — Marketplace Core P0
 *
 * DECISION:
 * All marketplace state mutations in Epic 6 operate on in-memory state
 * (state object in database.js), consistent with the existing ARGUS architecture.
 * 
 * PERSISTENCE IS NOT PRODUCTION-SAFE:
 * - In-memory state is lost on server restart.
 * - Vercel serverless is NOT a guaranteed single-process runtime.
 * - The OrderReleaseMutex and any marketplace reservation mutex provide
 *   development/test concurrency protection ONLY — they are NOT production-grade
 *   distributed locking mechanisms.
 *
 * HARD PRODUCTION GATE:
 * Real buyer/seller/payment marketplace transactions MUST NOT be enabled
 * as production capability until durable persistence (PostgreSQL, SQLite, etc.)
 * is implemented. This is a mandatory prerequisite, not a nice-to-have.
 *
 * DESIGN CONSTRAINT:
 * All services and state machines in this epic are designed so that:
 * 1. Business semantics are independent from persistence implementation.
 * 2. Every state mutation is marked with @PERSISTENCE_BOUNDARY comments.
 * 3. Migrating to a real database requires implementing the same operations
 *    against SQL instead of array manipulation — the state machine logic,
 *    validation rules, and domain invariants remain identical.
 *
 * MIGRATION PATH:
 * A dedicated P0/P1 infrastructure epic should:
 * 1. Introduce a persistence abstraction layer (Repository pattern)
 * 2. Implement PostgreSQL/SQLite adapters for each state table
 * 3. Replace state.X.find/filter/push with repository methods
 * 4. Introduce true ACID transactions for atomic reservation
 * 5. Replace mutex-based concurrency with SELECT ... FOR UPDATE
 * 6. Add connection pooling and retry logic
 *
 * AFFECTED FILES (Phase 1A):
 * - src/services/marketplace/TicketInventoryService.js
 * - src/services/listingService.js (wrapped createListing)
 *
 * All future marketplace services must include @PERSISTENCE_BOUNDARY
 * annotations at every state mutation point.
 */
module.exports = {
  ADR_ID: 'PERSISTENCE_BOUNDARY',
  STATUS: 'ACCEPTED',
  PRODUCTION_SAFE: false,
  REQUIRES_DURABLE_PERSISTENCE: true
};

