# Index Verification

## PostgreSQL Index Validation

This document verifies that the newly added PostgreSQL schema contains indices that accurately reflect the expected query patterns established by the legacy Firestore repositories.

| Table | Query Pattern | Created Index | Used by Planner | Status |
| :--- | :--- | :--- | :--- | :--- |
| `users` | Lookup by email (Exact match) | `CREATE UNIQUE INDEX idx_users_email ON users(email)` | YES | PASS |
| `users` | Filter by role | `CREATE INDEX idx_users_role ON users(role)` | YES | PASS |
| `events` | Filter by `status` & Sort by `created_at` DESC | `CREATE INDEX idx_events_status_created_at ON events(status, created_at DESC)` | YES | PASS |
| `events` | Lookup by `category_id` | `CREATE INDEX idx_events_category_id ON events(category_id)` | YES | PASS |
| `tickets` | Lookup by `event_id` and `owner_id` | `CREATE INDEX idx_tickets_event_owner ON tickets(event_id, owner_id)` | YES | PASS |

### Notes
- All indices verified using `EXPLAIN ANALYZE` on a seeded test database to ensure the query planner favors index scans over sequential scans for these common paths.
- Firestore composite index equivalents have been accurately mapped to B-Tree composite indices in PostgreSQL.
