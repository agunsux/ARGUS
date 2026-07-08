# Schema Alignment Report

## Objective
Document the resolution of schema drift between the legacy Firestore structure and the target PostgreSQL schema for Sprint 2A (Atomic Commit #5). All changes listed below are strictly additive and compatible.

## Drift Resolution Matrix

| Issue | Before (Firestore) | After (PostgreSQL) | Compatibility | Migration Label | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `role` field missing in some legacy docs | Missing | Added `role` VARCHAR(50) DEFAULT 'user' | 100% | **SAFE** | PASS |
| `verified` / `status` boolean vs string | Mapped arbitrarily | Normalized to `status` enum ('pending', 'verified', 'rejected') | PASS | **COMPATIBLE** | PASS |
| `category` nested object vs string | Alias/Nested | Normalized to `category_id` FK with view | PASS | **COMPATIBLE** | PASS |
| Missing timestamp precision | `createdAt` (ms) | `created_at` TIMESTAMPTZ | 100% | **SAFE** | PASS |

## Migration Constraints
* **No DROP COLUMN** or **DROP TABLE** allowed.
* **No RENAME COLUMN** allowed without setting up a compatibility view.
* **No DELETE DATA** or **TRUNCATE** operations included.
* Only **SAFE** and **COMPATIBLE** migration labels are permitted in this sprint.
