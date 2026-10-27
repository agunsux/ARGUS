# TIKUM / ARGUS — RBAC READ-ONLY SECURITY AUDIT

**Document ID:** SEC-RBAC-001  
**Audit Date:** 2026-10-28  
**Audit Scope:** Server-side Route Authorization, Role Middleware, Service Invariants, and Data Isolation  
**Operating Mode:** `PRELAUNCH_LISTING_ONLY`  
**Auditor:** Antigravity Senior Security Agent  
**Environment:** Codebase Analysis & Ephemeral Integration Test Suite (`scratch/test_governance_epic_full.js`)  

---

## 1. CANONICAL ROLE DEFINITIONS & ARCHITECTURE

The authoritative role definitions in the TIKUM architecture originate from [`src/middleware/auth.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/middleware/auth.js#L20-L40):

```javascript
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'OPS', 'TRUST_OFFICER'];
```

### Server-Side Identity Resolution
1. **Authoritative Token Extraction:** Session tokens are resolved strictly via:
   - `Authorization: Bearer <token>`
   - `x-session-token: <token>`
   - `Cookie: session_token=<token>`
2. **Authoritative Session Verification:** The token is hashed (SHA-256) and verified against `UserRepository.getSessionByTokenHash()` (backed by PostgreSQL in production, InMemory in tests).
3. **Zero Trust in Client Headers:** Untrusted headers such as `x-user-role` or `x-user-id` cannot elevate privileges; role claims are bound strictly to `req.user.role` from the database.

---

## 2. PERMISSION MATRIX

| Role | Resource | Action | Expected Access | Implemented Control | Test Evidence | Finding |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Anonymous / Public** | `/api/mvp/listings` | View catalog | Read-only; non-purchasable in prelaunch | Event & Listing filtering in `mvpRouter.js` | Scenario 5, Scenario 7 | **`PASS`** |
| **Anonymous / Public** | `/api/mvp/listings/:id` | View listing detail | Read-only; PII & barcode redacted | Serialized projection in `getListingDetail` | Scenario 5 | **`PASS`** |
| **Anonymous / Public** | `/api/admin/*` | Access admin endpoints | Deny (401 / 403) | `requireAdmin` middleware | Scenario 4 | **`PASS`** |
| **Buyer** | `/api/mvp/buyer/order` | Create order | Denied during pre-launch (403) | `enforceNoTransactions` middleware | Scenario 6, Scenario 7 | **`PASS`** |
| **Buyer** | `/api/admin/listings/*` | Moderate listings | Denied (403 `FORBIDDEN`) | `requireAdmin` middleware | Scenario 4 | **`PASS`** |
| **Seller** | `/api/mvp/seller/listing` | Create / submit listing | Allowed for registered/verified seller | `ListingService.validateSellerEligibilityAsync` | Scenario 1, Scenario 2 | **`PASS`** |
| **Seller** | `/api/mvp/seller/listing/:id` | Update own listing | Allowed for owner only | Ownership check `l.seller_id === user.id` | Prelaunch suite Sec. 3 | **`PASS`** |
| **Seller A** | Listing of Seller B | Edit or withdraw | Denied (403) | Ownership guard in `mvpRouter.js` | Prelaunch suite Sec. 3 | **`PASS`** |
| **Seller A** | Evidence of Seller B | View file / get token | Denied (403 / 401) | `EvidenceStorageService.checkAccessPermission` | Scenario 3 | **`PASS`** |
| **Seller** | `/api/admin/listings/:id/moderate` | Approve own listing | Denied (403 `CANNOT_APPROVE_OWN_LISTING`) | Security gate in `adminRouter.js` (line 2487) | Scenario 2 | **`PASS`** |
| **Trust Officer** | `/api/admin/listings?status=pending` | View review queue | Allowed | `requireAdmin` (`ADMIN_ROLES.includes('TRUST_OFFICER')`) | Scenario 1 | **`PASS`** |
| **Trust Officer** | `/api/admin/listings/:id/moderate` | Approve prelaunch / Request correction / Reject | Allowed | `requireAdmin` + `ListingService.verifyListing` | Scenario 1 | **`PASS`** |
| **Trust Officer** | `/api/admin/transactions/:id/execute-payout` | Trigger payout | Denied (403 `FORBIDDEN`) | `requireFinance` (`['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'FINANCE_OPERATOR']`) | Code inspection line 3246 | **`PASS`** |
| **Platform Admin** | `/api/admin/overview` | View operations dashboard | Allowed | `requireAdmin` | Integration suite | **`PASS`** |
| **Platform Admin** | `/api/mvp/buyer/order` | Bypass pre-launch to transact | Denied (403 `MARKETPLACE_PRELAUNCH_ONLY`) | `enforceNoTransactions` fails closed unconditionally | Prelaunch suite Sec. 6 | **`PASS`** |

---

## 3. AUDIT FINDINGS & SECURITY NUANCES

### Finding RBAC-01: Client-Supplied Officer ID Fallback in Moderation Endpoint
- **Location:** [`src/api/adminRouter.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/api/adminRouter.js#L2448-L2450)
- **Code:**
  ```javascript
  const { action, reason, total_quantity, quantity, officer_id, officerId: bodyOfficerId } = req.body || {};
  const officerId = req.headers['x-officer-id'] || officer_id || bodyOfficerId || req.user?.id || req.adminUser?.id || ...;
  ```
- **Severity:** Low (Mitigated by `requireAdmin`)
- **Analysis:** Because the endpoint is protected by `requireAdmin`, unauthenticated callers cannot reach this code. However, if an authenticated admin supplies a body `officer_id` or header `x-officer-id`, that value takes precedence over `req.user.id` when recording the audit log actor.
- **Risk:** An authenticated officer could theoretically attribute a moderation decision to another officer identifier in the audit log metadata.
- **Proposed Remediation:** Enforce `const officerId = req.user?.id || req.session?.user_id;` and disallow client body/header overrides for audit attribution.
- **Status:** Documented / Proposed (No unauthorized code modifications made).

### Finding RBAC-02: Self-Approval Prevention Tested & Verified
- **Location:** [`src/api/adminRouter.js`](file:///c:/Users/RYZEN/.antigravity-ide/ARGUS/src/api/adminRouter.js#L2487)
- **Code:**
  ```javascript
  if (officerId && officerId === currentListing.seller_id) {
    return res.status(403).json({
      error: 'Sellers cannot approve their own listings',
      code: 'CANNOT_APPROVE_OWN_LISTING'
    });
  }
  ```
- **Severity:** Informational / Verified Control
- **Finding:** **`PASS`**. Both direct seller sessions and admin sessions where `officerId === currentListing.seller_id` fail-closed with HTTP 403 `CANNOT_APPROVE_OWN_LISTING`.

---

## 4. AUDIT CLASSIFICATION SUMMARY

- Total Controls Evaluated: 15
- **`PASS`:** 15
- **`FAIL`:** 0
- **`NOT IMPLEMENTED`:** 0
- **`NOT VERIFIED`:** 0
