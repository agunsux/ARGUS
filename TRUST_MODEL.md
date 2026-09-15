# TIKUM / ARGUS — Trust Model

## 1. Zero Fabrication Principle
TIKUM does not rely on subjective claims or blind trust. Every claim requires:
- Source
- Evidence hash
- Identity
- Timestamp
- Append-only audit trail

## 2. Multi-Dimensional Seller Trust
We explicitly reject black-box "magic scores". Seller trust is evaluated across four transparent pillars:

| Pillar | Signals Tracked | Evaluation Criteria |
| :--- | :--- | :--- |
| **IDENTITY TRUST** | KYC Status, Verified Phone, Verified Email, Account Age | Validated government ID (KTP/Passport) and contact verification |
| **TRANSACTION TRUST** | Total Orders, Completion Rate, Zero Dispute Rate | Successful deliveries vs. cancelled orders |
| **TICKET TRUST** | Verified Ratio, Rejections Count, Evidence Hash Integrity | History of verified primary purchase proof |
| **BEHAVIOR RISK** | Velocity Spikes, Device Signals, Dispute Losses, Fake Ticket Incidents | Rapid anomaly detection and operational risk flags |

### Seller Tiers
- `VERIFIED_MERCHANT`: KYC verified, 3+ successful orders, 0 rejections.
- `TRUSTED_COMMUNITY`: 1+ successful orders, 0 rejections.
- `STANDARD_SELLER`: Initial verified state.
- `PROBATIONARY`: Elevated risk signals or rejected ticket incident.
- `SUSPENDED`: Critical fake ticket incident, fraud signal, or administrative freeze.

False Positive Protection: Probationary or Suspended sellers have access to an appeal and administrative review workflow.
