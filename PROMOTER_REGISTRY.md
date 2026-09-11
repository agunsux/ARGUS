# TIKUM — INDONESIA PROMOTER DISCOVERY REGISTRY
**Authoritative & Discovered Promoter Intelligence Register**  
**Version:** 1.0.0  
**Authority:** TIKUM Trust Infrastructure & Event Intelligence Layer  
**Last Updated:** September 2026

---

## 1. Core Principles: "Follow the Promoter"

In the Indonesian live music and concert market, **the promoter is the origin of the event**. Promoters frequently publish and update event information on their official Instagram accounts before—or more consistently than—their websites or ticketing platforms.

TIKUM's Event Intelligence Engine establishes an authoritative distinction between social discovery signals and verified official promoter accounts:

```
+-------------------------------------------------------------------------+
|                  PROMOTER IDENTITY & TRUST HIERARCHY                    |
+-------------------------------------------------------------------------+

[ 1. DISCOVERY SIGNAL ]
  Source: Unverified Instagram / Social mentions / Community posts
  Authority Scope: SOCIAL_IDENTITY
  Status: DISCOVERED
  Rule: Unverified accounts are DISCOVERY SIGNALS only. They NEVER create canonical events directly.

[ 2. IDENTITY RESOLUTION & ACCOUNT VERIFICATION ]
  Evidence: Official website backlink + APMI roster + Contact parity + Established history
  Verification Gate: DISCOVERED → IDENTITY_MATCHED → VERIFIED_OFFICIAL_PROMOTER_ACCOUNT
  Rule: An account must be independently verified as official before receiving event authority.

[ 3. TIER S PRIMARY EVENT SOURCE ]
  Source Type: PROMOTER_OFFICIAL_SOCIAL (Verified Promoter Instagram) & PROMOTER_OFFICIAL_WEBSITE
  Authority Scope: EVENT (PRIMARY_EVENT_SOURCE)
  Authority Level: TIER_S
  Status: PRIMARY_SOURCE_VERIFIED
  Rule: Posts from verified official promoter accounts CAN directly create and update Canonical Events!
```

---

## 2. Promoter Verification Status Machine

- `DISCOVERED`: Candidate account imported from Instagram list or public signal. Unverified.
- `IDENTITY_MATCHED`: Account deterministically linked to official website or business registration.
- `PARTIALLY_VERIFIED`: Corroborated across 2+ independent public sources, pending final sign-off.
- `VERIFIED`: Formally confirmed as `VERIFIED_OFFICIAL_PROMOTER_ACCOUNT` (e.g. APMI accredited member or verified corporate promoter). **Unlocks Tier S Primary Event Source status.**
- `REJECTED`: Scalper account, fan account, parody, inactive entity, or fraudulent listing.
- `INACTIVE`: Promoter has ceased operations or had no live events in > 24 months.

---

## 3. Initial Curated Promoter Registry

| Promoter ID | Canonical Name | Slug | Instagram Handle | Website URL | City | Category | APMI Member | Verification Status | Authority Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `prm-boss-creator` | **Boss Creator** | `boss-creator` | `@boss.creator` | `https://bosscreator.id` | Jakarta | FESTIVAL | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-antarasuara` | **Antarasuara** | `antarasuara` | `@antara.suara` | `https://antarasuara.com` | Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-otello-asia` | **Otello Asia** | `otello-asia` | `@otelloasia` | `https://otelloasia.com` | Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-plainsong` | **Plainsong Live** | `plainsong-live` | `@joylandfest` | `https://joylandfest.com` | Bali | FESTIVAL | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-aloka` | **ALOKA** | `aloka` | `@aloka.id` | `https://aloka.co.id` | Jakarta | KPOP_ASIAN | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-pk-ent` | **PK Entertainment** | `pk-entertainment`| `@pkentertainment.id` | `https://pk-ent.com` | Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-ismaya-live` | **Ismaya Live** | `ismaya-live` | `@ismayalive` | `https://ismayalive.com` | Jakarta | FESTIVAL | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-sound-rh` | **Sound Rhythm** | `sound-rhythm` | `@soundrhythm` | `https://soundrhythm.id` | Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-new-live` | **New Live Entertainment**| `new-live-ent`| `@newliveentertainment`| `https://newliveentertainment.com`| Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-rajawali` | **Rajawali Indonesia** | `rajawali-indonesia`| `@rajawaliindonesia`| `https://rajawaliindonesia.com`| Yogyakarta | FESTIVAL | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-doubledeer` | **Double Deer** | `doubledeer` | `@doubledeer.co` | `https://doubledeer.co` | Jakarta | ELECTRONIC | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-tks` | **PT. Tujuh Karya Sinergi**| `tujuh-karya-sinergi`| `@tujuhkaryasinergi`| `https://tksinergi.id` | Jakarta | CONCERT | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-raw-vision` | **Raw Vision Collective**| `raw-vision` | `@rawvision.collective`| `https://rawvision.id` | Jakarta | INDIE_TOUR | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-goodwill` | **The GoodWill Creators**| `goodwill-creators`| `@thegoodwill.creators`| `https://goodwillcreators.id`| Jakarta | FESTIVAL | Yes (`src-assoc-apmi`) | `VERIFIED` | `OFFICIAL_AUTHORITY` |
| `prm-rhapsodie` | **Rhapsodie Nusantara** | `rhapsodie-nusantara`| `@rhapsodienusantara` | `https://rhapsodienusantara.id`| Bandung | ORCHESTRA | No | `IDENTITY_MATCHED` | `DISCOVERY` |
| `prm-sukses-kreatif`| **Sukses Mandiri Kreatif**| `sukses-mandiri-kreatif`| `@suksesmandirikreatif`| `https://sukseskreatif.com`| Surabaya | COMEDY | No | `IDENTITY_MATCHED` | `DISCOVERY` |
| `prm-balilive` | **Bali Live Events** | `bali-live-events`| `@balilive.events` | `https://baliliveevents.com`| Denpasar | FESTIVAL | No | `DISCOVERED` | `DISCOVERY` |

---

## 4. Operational Invariants

1. **APMI is Authoritative for Membership Only:**
   APMI membership verifies that the promoter is a recognized professional entity. It **does NOT** automatically publish or verify unannounced events.
2. **Event Discovery Signals:**
   When an Instagram post is identified as an event announcement, it enters `EventDiscoverySignal` in `status: NEW`. It **must not** bypass canonical verification into `CanonicalEventRegistry` until primary ticket or official promoter website feeds confirm the date, venue, and ticketing partner.
3. **No Marketplace Contamination:**
   The promoter registry is strictly additive. Secondary listings in `state.listings` continue to bind only to `event_id` in `state.events`.
