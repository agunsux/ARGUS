# TIKUM — Editorial Content Engine & Publishing Pipeline

**Brand**: TIKUM (`https://tikum.app`)  
**Core Purpose**: Sustainable, High-Authority Content Production with Strict Factuality & Human Governance

---

## 1. Editorial Mission & Principles

TIKUM's Content Engine produces authoritative, original, and deeply researched educational content.

### Core Non-Negotiables:
1. **AI is an Assistant, Not an Autonomous Publisher**: AI drafts and analyzes, but human editors maintain the final approval gate for all factual and commercial content.
2. **Zero Hallucination Tolerance**: Dates, prices, artists, venues, and promoter identities must match underlying application data in the Canonical Event Registry.
3. **Quality Over Cadence**: A target of **up to 2 articles per week** (Tuesday and Friday). If no topic meets the quality and factual threshold, the scheduler skips that slot. Never publish filler content.
4. **Least Privilege**: The content engine has zero access to payment APIs, private customer details, order databases, or escrow release keys.

---

## 2. The 5 Content Pillars

| Pillar | Focus Area | Example Topics | Primary Intent |
| :--- | :--- | :--- | :--- |
| **Pillar A: Event Discovery** | Curated concert guides, festival lineups, upcoming sporting events | "Daftar Konser Internasional di Jakarta 2026", "Panduan Festival Musik Terbesar di Indonesia" | Commercial / Informational |
| **Pillar B: Ticket Buying** | Category selection, presale strategies, seating maps, budget tips | "Panduan Memilih Kategori Tiket: Festival vs Seating", "Cara Membeli Tiket Presale Bank Mandiri / BCA" | Informational |
| **Pillar C: Safety & Fraud Prevention** | Identifying scams, fake barcodes, social media calo red flags | "Cara Menghindari Penipuan Tiket Konser di Medsos", "Ciri-Ciri E-Ticket Palsu yang Sering Beredar" | Informational / Trust |
| **Pillar D: Resale Education** | Legal resale frameworks, escrow mechanisms, dispute handling | "Apa Itu Ticket Resale dan Bagaimana Escrow Bekerja?", "Kenapa Harga Tiket Resale Berbeda dari Face Value?" | Educational / Trust |
| **Pillar E: Event & Venue Guides** | Gate turnstile procedures, transportation, wristband redemption | "Panduan Nonton Konser di GBK Senayan", "Protokol Penukaran Wristband RFID Konser Musik" | Commercial / Navigational |

---

## 3. Editorial Lifecycle & State Machine

```text
  [Topic Discovery & Brief]
              ↓
          [draft]
              ↓
          [review]
              ↓
  [Content Quality & Fact Check]
              ↓
      [Human Approval Gate]  <--- Editor Review (Mandatory for factual/event content)
              ↓
         [approved]
              ↓
        [scheduled]  <--- Assigned Tuesday or Friday 09:00 WIB
              ↓
   [Publishing Scheduler]
              ↓
        [published]  <--- Idempotent release, dynamic sitemap update, canonical tag active
              ↓
      (If error: [failed] -> Alert & Safe Retry)
```

### State Definitions:
* `draft`: Initial content generation, research notes, and outline.
* `review`: Draft complete, undergoing automated Fact, SEO, and Trust quality checks.
* `approved`: Human editor or admin has reviewed and approved the article for publication.
* `scheduled`: Assigned a specific publication date (Tuesday or Friday).
* `published`: Live on `https://tikum.app/blog/[slug]` and included in `/sitemap.xml`.
* `failed`: Encountered a publication error; retained in database without public exposure.
* `archived`: Deprecated or replaced content safely redirected or marked noindex.

---

## 4. Quality & Fact Validation Rules

Every article must pass the automated `ContentQualityEngine` before entering `approved` status:

1. **Fact Check**:
   * If an event is cited (`target_event_id`), the event must exist in `CanonicalEventRegistry`.
   * Venue and city references must match normalized entities.
2. **SEO Score ($\ge 70/100$)**:
   * Title length: 35 – 75 characters.
   * Meta description: 100 – 165 characters.
   * Headings: Must include structured `<h2>` and `<h3>` tags.
   * Keyword alignment: Target keyword present in title and description without keyword stuffing.
3. **Trust & Safety Score ($\ge 70/100$)**:
   * Accurately explains TIKUM's escrow protection without claiming 100% unconditional entry without gate compliance.
   * No false claims of "official promoter partnership" unless verified.
4. **Substance & Depth ($\ge 500$ words)**:
   * Thin articles under 450 words are rejected from publication. Comprehensive pillar guides target $> 700$ words.

---

## 5. Publishing Automation & Idempotency

* **Cadence**: Tuesday at 09:00 WIB and Friday at 09:00 WIB.
* **Idempotency Guarantee**:
  * Calling the publishing cycle multiple times will never duplicate articles or create conflicting slugs.
  * If an article is already in `published` status, the scheduler exits cleanly.
* **Failure Safety**:
  * If database or templating errors occur during publication, the article status transitions to `failed` with the error message logged. The draft is never silently marked published.

