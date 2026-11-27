# Verified event import

Copy `verified_events.sample.json` and replace every placeholder. The sample is intentionally not importable. Use `SPORTS`, `COMEDY`, `CONCERT`, `FESTIVAL`, `THEATER` or `KPOP`. Each row needs a stable lowercase `id` (optional `slug`, default `id`), official title (`canonical_name`), `venue`, `city`, `start_date` (calendar date in WIB, today or later), and the verified lowest official `min_price` (integer IDR, at least 500,000).

Set `VERIFIED_EVENT_SOURCE_HOSTS` to a separately reviewed comma-separated list of exact publisher hostnames. `source_url` must be an HTTPS event-specific page on one of those hosts. Before submitting, inspect the page and verify the event, date, venue, city and price against it. Retain the evidence outside the import file and record its SHA-256, reviewer and UTC review time in `provenance`, with type `PROMOTER` or `OFFICIAL_TICKETING`. The tool checks this attestation and the allowlist; it does not fetch the page or prove publisher authority or ticket availability.

Omit `poster_url` to use the app's generated dark SVG. Otherwise use an existing `/assets/posters/<id>.svg`, an existing `/images/events/*.svg`, or a credential-free HTTPS image URL. Remote URL syntax is validated offline, not remote uptime. Check remote image availability, attribution and the deployed fallback before applying.

```sh
node scripts/import_verified_events.js events.json --dry-run --offline
node scripts/import_verified_events.js events.json --dry-run
node scripts/import_verified_events.js events.json --apply --confirm-verified-provenance
```

Omitting the mode defaults to dry-run. Offline validates the file and checks for within-batch duplicates only. Database mode requires explicit `VERIFIED_EVENT_DATABASE_URL` (not ambient application credentials); use a read-only role for dry runs. Apply rechecks collisions while holding a table write lock and commits all inserts together or none. Exact reruns are no-ops; edited rows with an existing ID or slug require separate review, not an overwrite. No migration or asset generation runs. Stop if any validation fails.