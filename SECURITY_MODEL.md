# TIKUM / ARGUS — Security & Defense Model

## 1. Threat Invariants & Defenses

| Threat Category | Attack Vector | ARGUS Defense Invariant |
| :--- | :--- | :--- |
| **Ticket Duplication / Reused QR** | Seller lists the same ticket barcode across multiple orders or events | `TicketTrustService` enforces global uniqueness on `barcode_hash`. Re-registration throws `DUPLICATE_TICKET_BARCODE`. |
| **Tampered / Forged Evidence** | Modification of ticket screenshot, PDF metadata, or invoice | Deterministic SHA-256 bundle hashing with AES-256-GCM encryption on disk (`EvidenceStorageService`). |
| **Webhook Spoofing & Replay** | Attacker posts forged payment success to webhook endpoint | Mandatory HMAC-SHA256 signature verification. Duplicate webhooks are caught by idempotent provider reference registry. |
| **Privilege Escalation / IDOR** | Buyer attempts to confirm entry or seller attempts to release escrow | Strict role checks (`requireRole`, `requireAdmin`, `requirePicOperationalWindow`). PIC and Admin step-up password authentication. |
| **SSRF & Dangerous URL Schemes** | Upstream adapter ingestion of internal IP (`127.0.0.1`, `169.254.169.254`) | `SecuritySanitizer.sanitizeUrl` blocks private IPv4/IPv6 ranges and non-HTTP protocols. |
| **Prototype Pollution & XSS** | Injected `__proto__` or script tags in event/order descriptions | `SecuritySanitizer.stripHtml` and recursive nesting depth limiter reject polluted JSON keys. |
| **Prompt Injection** | Hidden instructions in artist bio or venue descriptions | Sanitization strips delimiter patterns and instruction directives before downstream processing. |
| **Double Settlement / Duplicate Refund** | Concurrent requests to release or refund escrow | Strict state transition checks in `EscrowStateMachine` and balanced entries in `FinancialLedger`. |
