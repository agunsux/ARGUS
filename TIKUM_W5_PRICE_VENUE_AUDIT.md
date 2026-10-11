# TIKUM — W5: PRICE TIER, STARTING-PRICE ("MULAI DARI") & VENUE HONESTY AUDIT

**Date:** 2026-10-12 (WIB)
**Baseline Commit:** `76b4d924b62412e6435e11941cd7a0909964f5bb` (`76b4d92`)
**Target Modules:**
- `src/discovery/models/DiscoveredEvent.js`
- `src/discovery/repository/PostgresCatalogRepository.js`
- `src/discovery/EventNormalizationService.js`
- `src/discovery/supply/LoketDiscoverySource.js`

---

## 1. The `"Mulai Dari"` (Starting-Price) Trap & `PRICE_PARTIAL` Remediation (`W5.1` & `W5.2`)

### A. Root Cause Identified
Ticketing aggregators—most notably LOKET's public discover API (`https://rest.loket.com/fusio/api/v1/public/discover`)—return only a single lowest starting price (`min_price`) on listing cards without exposing upper-tier VIP/Festival prices unless the detail page's full ticket widget is available:
- In `neondb`, the **17 single-source live-discovered LOKET events** had `min_price === max_price` (for example, `OFFSIDE FEST` at Rp 350.000, `Raisa Handmade Night` at Rp 500.000, `Men I Trust` at Rp 950.000, `ROSETOPIA` at Rp 1.250.000) and `metadata.price_tiers = []`.
- Previously, if a concert, festival, sports, or stand-up comedy event had a single starting price between Rp 200.000 and Rp 299.999 (`price_min = 250000, price_max = 250000, price_tiers = []`), `DiscoveredEvent.evaluatePriceStatus()` treated `maxP < 300000` as a known upper bound and rejected the event as `EXCLUDED_PRICE_TOO_LOW`—silently dropping events whose VIP/Gold tiers were >= Rp 500.000!

### B. Fix Implemented in `src/discovery/models/DiscoveredEvent.js` (Lines 192–206)
We updated `DiscoveredEvent.evaluatePriceStatus()` so that any event in high-tier live categories (`CONCERT`, `FESTIVAL`, `COMEDY`, `SPORTS`, `THEATER`, `FANMEET`) with a single starting price `>= Rp 200.000` where `price_max === null || price_max === price_min` and `price_tiers.length <= 1` is classified as:
- `price_status = 'PRICE_PARTIAL'`
- `isQualified() = true` (queued for tier enrichment rather than discarded as `EXCLUDED_PRICE_TOO_LOW`)
- Conversely, events with an explicit low multi-tier range (`Rp 50.000 – Rp 150.000`) or starting price `< Rp 200.000` remain `EXCLUDED_PRICE_TOO_LOW`.

---

## 2. Eliminating Fabricated Price Tiers & Guessed Seating Types (`W5.2` & `W5.3`)

### A. Defect Found in `src/discovery/repository/PostgresCatalogRepository.js` (Lines 793–795)
Prior to W5, `PostgresCatalogRepository.mapRowToEvent()` contained two fallback expressions that violated the W5 Zero-Fabrication rule whenever `metadata.price_tiers` or `metadata.seating_type` was absent in PostgreSQL:
```javascript
// BEFORE W5 (Fabricated tier name & guessed seating type):
price_tiers: meta.price_tiers || (row.min_price ? [{ name: 'General Admission', price: parseFloat(row.min_price), currency: 'IDR' }] : []),
seating_type: meta.seating_type || (row.category === 'CONCERT' || row.category === 'FESTIVAL' ? 'MIXED' : 'ASSIGNED_SEATING'),
```
Because 53 of the 63 rows in `neondb` had no `metadata.price_tiers`, `mapRowToEvent()` was synthesizing a single `{ name: 'General Admission', price: min_price }` tier and guessing `MIXED` or `ASSIGNED_SEATING` for every row!

### B. Fix Implemented in `src/discovery/repository/PostgresCatalogRepository.js` (Lines 792–800)
We removed the synthetic fallback and replaced it with honest tier & seating telemetry:
```javascript
// AFTER W5 (Strict Zero-Fabrication):
price_tiers: Array.isArray(meta.price_tiers) && meta.price_tiers.length > 0 ? meta.price_tiers : [],
tier_data_status: Array.isArray(meta.price_tiers) && meta.price_tiers.length > 0
  ? 'VERIFIED_TIERS'
  : (row.min_price ? (row.max_price && Number(row.max_price) !== Number(row.min_price) ? 'SOURCE_MIN_MAX_RANGE_ONLY' : 'SOURCE_SINGLE_PRICE_ONLY') : 'TIER_DATA_UNAVAILABLE'),
seating_type: meta.seating_type || 'UNKNOWN',
seat_map_url: meta.seat_map_url || null,
tier_enrichment_needed: Boolean(meta.tier_enrichment_needed || meta.price_status === 'PRICE_PARTIAL' || (!Array.isArray(meta.price_tiers) || meta.price_tiers.length === 0)),
```

---

## 3. Audit of All 63 Events in `neondb` by Price & Tier Completeness

| Tier Data Status (`tier_data_status`) | Row Count in `neondb` | Public Upcoming Count | Meaning & Examples |
| :--- | :---: | :---: | :--- |
| **`VERIFIED_TIERS`** | **10** | **9** | Explicit multi-tier breakdown stored in `metadata.price_tiers` (`LaLaLa Festival Jakarta 2027` [4 tiers: Rp 1,35M–Rp 28M], `Atsuko Okatsuka` [4 tiers: Silver/Gold/Diamond/Blue Diamond], `Morgan Jay` [2 tiers], `The Script 2027` [2 tiers], `Abdur Arsyad: Kontras` [2 tiers], `Pandji: Mens Rea` [2 tiers], `DWP 2026` [3 tiers], `Joyland 2026` [3 tiers], `Synchronize 2026` [2 tiers], `MotoGP Mandalika` [2 tiers, past]). |
| **`SOURCE_MIN_MAX_RANGE_ONLY`** | **33** | **6** | Source provided verified `min_price` and `max_price` bounds (`min_price < max_price`), but individual tier names/quotas were not published in structured metadata (`BABYMONSTER` [Rp 1,25M–Rp 3,85M], `Kanye West — Ye Tour` [Rp 1,95M–Rp 6,5M], `LANY Night 1 & 2` [Rp 1,55M–Rp 5,2M], `BIGBANG` [Rp 1,85M–Rp 5,5M], `Maroon 5` [Rp 1,45M–Rp 4,5M]). Flagged with `tier_enrichment_needed: true`. |
| **`SOURCE_SINGLE_PRICE_ONLY`** | **20** | **20** *(19 unique after `Men I Trust` dedup)* | Source (LOKET public API / JSON-LD) provided only a single starting price (`min_price === max_price`, e.g., `ROSETOPIA` Rp 1.250.000, `Men I Trust` Rp 950.000, `Touché Amoré` Rp 935.000, `Maddix` Rp 400.000, `Raisa Handmade Night` Rp 500.000). Flagged with `tier_data_status: 'SOURCE_SINGLE_PRICE_ONLY'` and `tier_enrichment_needed: true`. |
| **TOTAL** | **63** | **35** *(34 unique)* | **0 fabricated tiers, 0 fabricated seat maps (`seat_map_url: null` when source provides none).** |

---

## 4. Venue Normalization & Canonical Venue Registry Audit (`W5.4`)

`EventNormalizationService.js` (`KNOWN_VENUES`, lines 119–480) normalizes raw venue strings into canonical Indonesian venues with verified city, province, coordinates (`lat`/`lng`), and `capacity_tier` without defaulting unmapped cities to Jakarta:

| Raw Venue String Observed in Sources | Resolved `venue_id` | Canonical Venue Name | Canonical City & Province | Timezone |
| :--- | :--- | :--- | :--- | :--- |
| `"Gelora Bung Karno Main Stadium, Senayan"` / `"SUGBK"` / `"GBK"` | `venue-gbk` | `Gelora Bung Karno (Main Stadium)` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Indonesia Arena, Senayan"` / `"Indonesia Arena"` / `"IMS GBK"` | `venue-indonesia-arena` | `Indonesia Arena, Senayan` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"ICE BSD City"` / `"ICE BSD City Hall 5-6"` | `venue-ice-bsd` | `Indonesia Convention Exhibition (ICE BSD)` | `Tangerang`, `Banten` | `Asia/Jakarta` (`+07:00`) |
| `"JIExpo Kemayoran"` / `"Gambir Expo, Kemayoran"` | `venue-kemayoran` | `Gambir Expo / JIExpo Kemayoran` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Jakarta International Stadium (JIS)"` | `venue-jis` | `Jakarta International Stadium (JIS)` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Beach City International Stadium, Ancol"` | `venue-beach-city` | `Beach City International Stadium (BCIS)` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Istora Senayan"` | `venue-istora` | `Istora Senayan` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Basket Hall GBK Senayan"` / `"GBK Basketball Hall, Senayan"` | `venue-gbk-basket` | `Basket Hall GBK Senayan` | `Jakarta`, `DKI Jakarta` | `Asia/Jakarta` (`+07:00`) |
| `"Pertamina Mandalika International Circuit"` | `venue-mandalika` | `Pertamina Mandalika International Circuit` | `Lombok Tengah`, `Nusa Tenggara Barat` | `Asia/Makassar` (`+08:00`) |
| `"Candi Prambanan"` | `venue-prambanan` | `Candi Prambanan` | `Sleman`, `DI Yogyakarta` | `Asia/Jakarta` (`+07:00`) |
