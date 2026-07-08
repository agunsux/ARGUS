# Backfill Verification

## Added Columns Details

This document verifies the backfill strategies for columns added during the Schema Alignment phase to ensure zero data loss or inconsistencies.

### 1. `users.role`
* **Default Value**: `'user'`
* **Null Policy**: `NOT NULL`
* **Backfill Strategy**: Handled entirely at the database layer via `DEFAULT` constraint upon column creation. No script needed.
* **Rollback Strategy**: N/A (Additive, safe to ignore).

### 2. `users.status`
* **Default Value**: `'pending'`
* **Null Policy**: `NOT NULL`
* **Backfill Strategy**: 
  - Execute a batch job that maps legacy Firestore boolean values (`isVerified = true/false`) to the new ENUM (`'verified'`, `'pending'`).
  - Records without the boolean will default to `'pending'`.
* **Rollback Strategy**: The mapping can be paused and rerun if necessary. Data is safely stored in the new column and does not affect legacy application read/writes.

### 3. `events.category_id`
* **Default Value**: `NULL`
* **Null Policy**: `NULL` allowed during transition
* **Backfill Strategy**:
  - Run an idempotent script to map string-based legacy categories to the normalized `categories` table, retrieving the corresponding `category_id`.
  - Batch size: 1000 records per transaction.
* **Rollback Strategy**: Set `category_id` to `NULL` for any batches that fail validation.

---
**Status**: All backfill strategies VERIFIED.
