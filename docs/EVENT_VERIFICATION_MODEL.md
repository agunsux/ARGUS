# TIKUM — EVENT VERIFICATION & EVIDENCE MODEL
**Document ID:** `DOC-VER-2026-001`  
**Compliance Authority:** SHINERVA HQ Core Infrastructure  
**Version:** 1.0.0  
**Status:** Canonical System Design  

---

## 1. Foundational Axiom

> [!CAUTION]
> **EVIDENCE OVER INFERENCE. TRUST IS AN OUTPUT, NOT A LABEL.**
> 1. ARGUS and TIKUM must never treat discovery as verification.
> 2. No evidence = NO verification (`UNVERIFIED`).
> 3. Never use absolute marketing claims such as *"100% safe"*, *"100% authentic"*, or *"guaranteed entry"*.
> 4. Physical presence of an Event PIC at the venue gates improves operational confidence; it does **NOT** magically establish cryptographic ticket validity.

---

## 2. Verification State Machine

Every event in the Canonical Event Registry resides in exactly one explicit lifecycle verification state:

| State | Description | SEO Indexability | Primary Evidence Requirement |
| :--- | :--- | :--- | :--- |
| **`UNVERIFIED`** | Default initial state. Event discovered via Tier 2/3 but lacks authoritative Tier 1 proof. | **`NOINDEX`** | Any discovery observation without primary proof. |
| **`PARTIALLY_VERIFIED`** | Corroborated by trusted commercial sources (Tier 2) or multiple independent secondary signals. | **`NOINDEX`** | 2+ independent Tier 2 sources; pending primary confirmation. |
| **`VERIFIED`** | Confirmed by an authoritative Tier 1 source (promoter, venue, league, primary ticketing partner). | **`INDEXABLE`** | Tier 1 official announcement or verified feed. |
| **`CONFLICTED`** | Unresolved discrepancy between sources on date, venue, title, or status. | **`NOINDEX`** | Multiple sources reporting conflicting data. |
| **`CHANGED`** | Material update officially announced by Tier 1 source (reschedule, venue move, lineup change). | **`INDEXABLE`** *(with change badge)* | Authoritative notice of change. |
| **`POSTPONED`** | Official announcement that the event is postponed; new date pending. | **`NOINDEX`** | Authoritative postponement notice. |
| **`CANCELLED`** | Official announcement that the event is cancelled. | **`NOINDEX`** *(Historical notice retained)* | Authoritative cancellation announcement. |
| **`EXPIRED`** | Time-to-live expired without fresh authoritative verification. | **`NOINDEX`** | `Date.now() > expires_at`. |
| **`LEGAL_REVIEW_REQUIRED`**| Rights, trademark, or territorial exclusivity ambiguity flagged for counsel. | **`NOINDEX`** | Legal boundary trigger. |
| **`REJECTED`** | Corrupted data, failed schema validation, or confirmed fraudulent signal. | **`404 / NOINDEX`** | Malformed payload or failed quality check. |

---

## 3. QR Code & Barcode Verification Abstraction

When evaluating ticket validity or event admission protocols, the system must **NEVER** treat a successful QR/barcode scan as proof that a ticket is *"valid, authentic, and unused"*.

The system enforces a 7-layer verification abstraction:

```
+-------------------------------------------------------------------------+
|                  7-LAYER TICKET VERIFICATION ABSTRACTION                 |
+-------------------------------------------------------------------------+
Layer 1: SYNTACTIC VALIDITY
         Checks if barcode / QR string matches standard format (e.g., Code128, PDF417, QR).
Layer 2: TICKET IDENTITY VALIDITY
         Verifies whether the identifier corresponds to a recognized ticket record.
Layer 3: OWNERSHIP VALIDITY
         Verifies whether the current presenter holds legitimate title to the ticket.
Layer 4: TRANSFERABILITY
         Determines whether the primary promoter/ticketing terms permit resale or reassignment.
Layer 5: REDEMPTION STATUS
         Checks whether the barcode has already been scanned at turnstiles or redemption booths.
Layer 6: VENUE ACCEPTANCE
         Verifies whether venue security / promoter turnstiles accept this ticket class.
Layer 7: PRIMARY TICKETING CONFIRMATION
         Cryptographic / direct API confirmation from the issuing primary ticketing system.
```

> [!IMPORTANT]
> **Mandatory Limitation Disclosure:**
> Unless Layer 7 (Primary Ticketing Confirmation) is directly integrated via authorized API, the verification engine must explicitly record:
> `"primary_ticketing_confirmation": false`
> and append the limitation notice:
> *"Verifikasi fisik gerbang oleh Event PIC memvalidasi kepemilikan dan integritas barcode, namun tidak menggantikan validasi kriptografis langsung dari promotor penerbit tiket."*

---

## 4. Confidence Scoring Formula

The verification engine calculates a deterministic confidence score $S \in [0, 100]$:

$$S = \min\left(100, \; S_{\text{source}} + S_{\text{corroboration}} + S_{\text{ticket\_url}} + S_{\text{temporal\_spatial}}\right) - P_{\text{conflict}}$$

### Scoring Components:
1. **Base Source Tier ($S_{\text{source}}$):**
   - Tier 1 Authoritative Promoter / Venue / League: $+60$
   - Tier 2 Trusted Commercial / Ticketing Platform: $+35$
   - Tier 3 Social Discovery Signal: $+10$
2. **Independent Corroboration ($S_{\text{corroboration}}$):**
   - 2 independent sources in agreement: $+25$
   - 3+ independent sources in agreement: $+30$
3. **Official Ticket URL Verified ($S_{\text{ticket\_url}}$):** $+15$
4. **Complete Spatial & Temporal Data ($S_{\text{temporal\_spatial}}$):** $+15$
5. **Conflict Penalty ($P_{\text{conflict}}$):**
   - Disagreement on date or venue: $-50$ (caps score at 50, transitions state to `CONFLICTED`).

---

## 5. Temporal Freshness & Expiration Policy

Event information is dynamic. Every verification record maintains:
- `last_checked_at`: Timestamp of the latest source poll.
- `verified_at`: Timestamp when authoritative evidence was confirmed.
- `expires_at`: Strict expiration threshold.

### Expiration Threshold Rules:
- **Imminent Events ($\le 7$ days to start):** Verification expires after **24 hours** unless refreshed.
- **Near-Term Events (8 to 30 days to start):** Verification expires after **72 hours**.
- **Medium-Term Events (31 to 90 days to start):** Verification expires after **7 days**.
- **Far-Future Events ($> 90$ days to start):** Verification expires after **14 days**.

If `Date.now() > expires_at` and no fresh corroborating fetch succeeds, the event automatically transitions to `EXPIRED` and drops out of public sitemaps until re-verified.
