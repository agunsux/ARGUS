# TIKUM — EVENT INGESTION OPERATIONAL PLAN
**Implementation, Cadence & Sync Engineering Plan**  
**Version:** 1.0.0  
**Target:** Production Ingestion Pipeline & Scheduler

---

## 1. Ingestion Scheduling Architecture

Ingestion schedules are decoupled from adapter logic and managed declaratively via `SourceRegistry`:

```
+-------------------------------------------------------------------------+
|                       CENTRAL INGESTION SCHEDULER                       |
+-------------------------------------------------------------------------+
       |                           |                          |
       | (Every 24h)               | (Every 72h)              | (Every 7d / 14d)
       v                           v                          v
+------------------+      +------------------+       +------------------+
| DAILY RUNNER     |      | EVERY 3 DAYS     |       | WEEKLY / BIWEEKLY|
| - Tier S Sources |      | - Tier A Sources |       | - Tourism Boards |
| - High-Cap Venues|      | - Discovery APIs |       | - Discovery Sweep|
+------------------+      +------------------+       +------------------+
```

### Supported Ingestion Frequencies:
1. `SYNC_FREQUENCY.DAILY` (24 Hours):
   - Reserved for Tier S high-impact promoters (PK Entertainment, Ismaya Live, Sound Rhythm), major venues (PPK GBK, JIExpo, ICE BSD), and national leagues (IBL, LIB).
2. `SYNC_FREQUENCY.EVERY_3_DAYS` (72 Hours):
   - Reserved for Tier A licensed discovery platforms (Bandsintown, Eventbrite Dev API).
3. `SYNC_FREQUENCY.WEEKLY` (7 Days):
   - Reserved for government tourism boards (Kemenparekraf Kharisma Event Nusantara, Enjoy Jakarta).
4. `SYNC_FREQUENCY.BIWEEKLY` (14 Days):
   - Full broad sweep across secondary event directories and regional cultural councils.

---

## 2. Ingestion Pipeline Execution Stages

Every ingestion batch executes through 9 strictly observable, fault-isolated stages:

```
[ STAGE 1: COMPLIANCE CHECK ]
       │ Verify robots.txt, terms, scraping_allowed, circuit breaker status
       ▼
[ STAGE 2: ADAPTER FETCH ]
       │ Authenticate, request payload, respect rate limits, backoff retries
       ▼
[ STAGE 3: PII SANITIZATION & PARSING ]
       │ Strip NIK, phone, personal emails; extract structured fields
       ▼
[ STAGE 4: NORMALIZATION ]
       │ Standardize title, resolve canonical venue & city, format ISO timestamps
       ▼
[ STAGE 5: DETERMINISTIC FINGERPRINTING ]
       │ Compute artist::title::venue::city::date fingerprint key
       ▼
[ STAGE 6: ENTITY RESOLUTION & DEDUPLICATION ]
       │ Match against canonical events or corroboration buffer
       ▼
[ STAGE 7: CONFLICT ARBITRATION & SCORING ]
       │ Check date/venue parity; compute composite confidence score
       ▼
[ STAGE 8: PERSISTENCE & AUDIT LEDGER ]
       │ Write EventSourceObservation, CanonicalEvent, EventChanges
       ▼
[ STAGE 9: MARKETPLACE & ARCHIVE BRIDGE ]
       │ Synchronize with state.events; update indexable SEO slugs
```

---

## 3. Geographic Coverage Matrix (Indonesian Cities & Provinces)

TIKUM's normalization service supports all 38 Indonesian provinces, with primary tier-1 venue dictionaries for at minimum:

| City | Province | Timezone | Primary Monitored Venues |
| :--- | :--- | :--- | :--- |
| **Jakarta** | DKI Jakarta | WIB (UTC+7) | Gelora Bung Karno, JIS, Indonesia Arena, JIExpo Kemayoran, TIM, Istora Senayan |
| **Bandung** | Jawa Barat | WIB (UTC+7) | Stadion Siliwangi, GBLA, Eldorado Dome, Sabuga ITB |
| **Surabaya** | Jawa Timur | WIB (UTC+7) | Stadion Gelora Bung Tomo (GBT), Grand City Convention Center, DBL Arena |
| **Bali (Denpasar/Badung)**| Bali | WITA (UTC+8) | Peninsula Island Nusa Dua, GWK Cultural Park, Bali International Convention Centre |
| **Yogyakarta** | DI Yogyakarta | WIB (UTC+7) | Candi Prambanan Open Theater, JEC (Jogja Expo Center), Stadion Maguwoharjo |
| **Medan** | Sumatera Utara | WIB (UTC+7) | Stadion Teladan, Regale International Convention Centre |
| **Makassar** | Sulawesi Selatan| WITA (UTC+8) | Celebes Convention Center, Stadion Gelora B.J. Habibie |
| **Semarang** | Jawa Tengah | WIB (UTC+7) | Stadion Jatidiri, Marina Convention Center |
| **Palembang** | Sumatera Selatan | WIB (UTC+7) | Kompleks Jakabaring Sport City |
| **Tangerang** | Banten | WIB (UTC+7) | Indonesia Convention Exhibition (ICE BSD) |
| **Bekasi** | Jawa Barat | WIB (UTC+7) | Stadion Patriot Candrabhaga |
| **Bogor** | Jawa Barat | WIB (UTC+7) | Sentul International Convention Center (SICC), Stadion Pakansari |
| **Batam** | Kepulauan Riau | WIB (UTC+7) | Batam International Expo |
| **Manado** | Sulawesi Utara | WITA (UTC+8) | Grand Kawanua Convention Center |
| **Balikpapan** | Kalimantan Timur| WITA (UTC+8) | Balikpapan Sport and Convention Center (DOME), BSCC |

---

## 4. Operational Error Handling & Circuit Breaker Logic

- **Transient Network Failures:** 3 retries using jittered exponential backoff ($1\text{s}, 2\text{s}, 4\text{s}$).
- **Permanent Failures (401, 403, 404, 429, 500):**
  - Failure incremented on `SourceRegistry.consecutive_failures`.
  - If `consecutive_failures >= 3`: Source transitioned to `DEGRADED`, circuit breaker trips `OPEN`.
  - Incident logged to `audit_logs` with severity `WARNING`.
  - Ingestion run terminates gracefully for that source without halting the pipeline for other sources.
