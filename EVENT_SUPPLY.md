# TIKUM / ARGUS — Event Supply & Truth Engine

## 1. Event Ingestion & Provenance Preservation
Every event observation ingested preserves:
- `source_id`: Originating source identifier
- `external_id`: Native ID at source
- `source_url`: URL of official announcement
- `content_hash`: Deterministic SHA-256 hash of payload
- `adapter_version`: Code version of adapter
- `observed_at`: Ingestion timestamp
- `source_tier`: Tier 1 (Authoritative), Tier 2 (Commercial), Tier 3 (Community)

## 2. Canonical States & Strict Transitions
```text
[DISCOVERED]
     │
     ▼
[NORMALIZED]
     │
     ├─────────────┬─────────────┬─────────────┐
     ▼             ▼             ▼             ▼
[VERIFIED]   [UNVERIFIED]   [CONFLICT]    [REJECTED]
     │             │             │
     ▼             ▼             │
 [EXPIRED] ◄───────┴─────────────┘
```

- `UNVERIFIED` → `VERIFIED`: Permitted only after Tier 1 authoritative evidence is attached.
- `CONFLICT` → `VERIFIED`: Permitted only after formal conflict resolution.
- `EXPIRED` → `VERIFIED`: Permitted only after fresh authoritative observation.
- `REJECTED`: Terminal state. Must NEVER silently re-enter canonical marketplace.

## 3. Event Quality Gate & Marketplace Eligibility
The `EventQualityGate` computes an authoritative `event_quality_score` (0–100) based on:
1. Valid Event Identity (20 pts)
2. Temporal Sanity & Future Validity (20 pts)
3. Spatial Authority — Venue & City (20 pts)
4. Source Tier & Freshness (20 pts)
5. Absence of Unresolved Conflicts (20 pts)

Eligibility outcomes:
- `ELIGIBLE`: Tier 1 source, score >= 80, no conflicts.
- `CONDITIONALLY_ELIGIBLE`: Tier 2 source, score >= 60, no conflicts.
- `UNVERIFIED`: Lacks authoritative source or score < 60.
- `BLOCKED`: Critical conflict, expired observation, missing required fields, or cancelled.
