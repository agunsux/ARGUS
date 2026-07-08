# PROJECT ARGUS — ZERO TO ONE (Version 3)

*Build the world's first open trust protocol for live event ownership.*

## PART 0 — INDUSTRY HISTORY & FIRST PRINCIPLES

Before proposing any architecture, conduct a historical analysis of the global ticketing industry.
Do not begin with technology. Begin with history.
Study how the industry evolved from paper tickets to digital platforms.
Analyze why ticket resale emerged.
Explain why secondary markets cannot simply be banned.
Identify every structural failure that repeatedly appears across decades.

Include at minimum:
• Pearl Jam vs Ticketmaster (1994)
Explain:
- what happened
- why it happened
- what incentives created the conflict
- which structural problems still exist today

Analyze the evolution of:
• Ticketmaster
• Live Nation
• StubHub
• Viagogo
• SeatGeek
• AXS
• Eventbrite

Study every major merger, acquisition, and consolidation.
Explain how vertical integration changes incentives.
Distinguish clearly between:
- Primary ticketing
- Secondary ticketing
- Venue ownership
- Promotion
- Distribution
- Payments
- Identity
- Customer support

Explain where trust breaks inside each layer.
Never assume that any incumbent is "good" or "bad."
Instead identify the incentives that lead to outcomes.
For every historical failure ask repeatedly: WHY did this happen?
Continue until reaching the root cause. Do not stop at symptoms.
Identify structural incentives.
Then redesign the industry so those incentives no longer produce the same failures.

## PART 0.5 — Lessons from 50 Years of Ticketing

Extract every lesson from fifty years of ticketing history.
For every major controversy produce:
- Timeline
- Actors
- Economic incentives
- Consumer impact
- Regulatory response
- Media response
- Industry response
- Long-term consequences
- Could this have been prevented? If yes, how?
Design an ARGUS principle that permanently prevents the same failure.
Repeat for every historical case until no major lesson remains unexamined.

## 1. The Constraints (Aturan Main)
Perusahaan ini tidak memiliki kemewahan startup Silicon Valley. Kita beroperasi di dunia nyata dengan sumber daya sangat terbatas:
- **Tim:** 1 Founder, 1 Engineer, 1 Operations.
- **Modal:** Kurang dari USD 30,000.
- **Tidak ada:** Tim AI khusus, Departemen Legal, Departemen Marketing, Pendanaan Ventura (VC), Dukungan Pemerintah, Kontrak Enterprise.
- **Syarat Hidup:** Perusahaan harus bertahan hidup HANYA dari pendapatan pelanggan (Customer Revenue).
- **North Star Metric:**
  - **Business Outcome North Star:** **Verified Successful Entry Rate (VSER)** (Persentase pembeli sah yang berhasil masuk venue tanpa sengketa, target ≥ 99.9%).
  - **Technical Architecture North Star:** **Ownership Integrity Rate** = 100% (Zero double-ownerships, zero orphan records, and complete replay determinism).
- **Database Bootstrapping Constraint:** SQLite only exists to bootstrap and validate the domain model in local development and prototyping. It is not the target production database, which will utilize PostgreSQL.

## 2. Paradigma Bisnis: Dari Protocol Menuju Public Infrastructure
Kamus perusahaan kita melarang keras penggunaan istilah "Marketplace Tiket". Kita membangun **Public Trust Infrastructure**. 

> [!NOTE]
> **ARGUS exists because trust should never depend on market concentration.**
> **Competition should occur on service quality, not on exclusive control of trust.**
> Kita membangun open trust infrastructure, bukan sekadar memosisikan diri sebagai anti-monopoli.

ARGUS tidak berada "di atas" ekosistem. ARGUS beroperasi **di bawah seluruh ekosistem** (Promotor, Venue, Primary Ticketing, Insurance, Payment). Sama seperti TCP/IP untuk internet, DNS untuk domain, atau Stripe untuk pembayaran.
Marketplace yang kita bangun di awal hanyalah **Reference Implementation** (klien pertama) dari sistem kita sendiri.

## 3. Constitutional Rules (Konstitusi Perusahaan)
Prinsip-prinsip ini tidak boleh dilanggar, bahkan demi profit atau desakan investor:
- **No hidden fees.**
- **No fake scarcity.**
- **No selling customer data.**
- **No dark patterns.**
- **Every ownership transfer is auditable.**
- **Every dispute leaves evidence.**
- **Every decision is explainable.**
- **Trust before revenue.**
- **Consumers before commissions.**
- **ARGUS will never profit from information asymmetry.** (Artinya: tidak ada hidden fee; tidak ada biaya yang muncul di halaman terakhir; tidak ada manipulasi kelangkaan; tidak ada harga yang disembunyikan; tidak ada desain yang sengaja membuat pengguna mengambil keputusan tanpa informasi yang cukup.)

## 4. Feature Purge (Pembersihan Fitur)
Setiap fitur dievaluasi dengan kejam: *Bisakah kita membuangnya? Menyederhanakannya? Mengganti software dengan operasi manual?*
- **Sistem Rekomendasi/Promo:** HAPUS. (Marketplace bukan tujuan utama).
- **In-App Chat:** HAPUS. (Gunakan WhatsApp untuk mediasi).
- **Automated Fraud Detection:** TUNDA. (Gunakan manual review oleh Operations di tahap awal).
- **Digital Wallet:** HAPUS. (Gunakan sistem Escrow langsung antar rekening bank).
- **Mobile App Native:** TUNDA. (Web-based sudah cukup untuk fase awal).

## 5. What Survives: Data Network Over User Network
Kita tidak mengejar "jumlah user". Kita membangun **Data Network** sebagai moat (benteng) pelindung. Komponen yang bertahan di hari pertama:
1. **ARGUS Verify (Manual/Semi-Automated Dashboard):** Validasi tiket *brute-force* oleh Operations.
2. **Escrow System:** Penahanan dana untuk menjamin rasa aman (Trust).
3. **Reference Marketplace (Web):** Klien pertama agar publik bisa menggunakan protokol kita.
4. **The Graph Database:** Jantung dari sistem kita. Alih-alih mengejar MAU, kita memperkaya *relationship graph, fraud graph, ownership graph, device graph, payment graph*, dan *behavior graph*. Data inilah yang membuat model risiko kita kelak tak bisa ditiru.

## 6. The ARGUS Protocol
Bukan daftar fitur, melainkan spesifikasi formal siklus hidup kepemilikan tiket. Setiap perpindahan *state* bersifat *immutable*, wajib memiliki *timestamp*, *actor*, *evidence*, *signature*, dan kebijakan *rollback*.

**State Lifecycle (Siklus Kepemilikan):**
1. `ISSUED` (Tiket diterbitkan oleh promotor/sistem ticketing asli)
2. `OWNED` (Tiket dimiliki oleh pembeli pertama secara sah)
3. `LISTED` (Tiket didaftarkan untuk transfer di jaringan ARGUS)
4. `RESERVED` (Pembeli baru telah memesan, dana masuk Escrow)
5. `VERIFIED` (Keabsahan tiket telah diverifikasi oleh sistem/Ops ARGUS)
6. `TRANSFERRED` (Kepemilikan resmi berpindah tangan, dana siap cair ke penjual)
7. `REDEEMED` (Tiket sukses digunakan di gerbang masuk venue)
8. `ARCHIVED` (Siklus hidup tiket selesai tanpa sengketa)

## 7. The ARGUS Standards & Certification (ARGUS Institute)
Standar terbuka yang akan diadopsi oleh ekosistem. Kita akan mendirikan "ARGUS Institute" yang merilis sertifikasi, sehingga brand/logo ARGUS memiliki nilai psikologis yang kuat.
- **ARGUS Certified Transfer:** Verifikasi identitas dan chain of custody.
- **ARGUS Verified Venue:** Venue yang teknologinya kompatibel dengan protokol kita.
- **ARGUS Verified Event:** Acara yang menggunakan standar resolusi sengketa ARGUS.
- **ARGUS Certified Marketplace:** Platform sekunder lain yang menggunakan engine kita di balik layar.

## 8. The Ecosystem Roadmap
- **Phase 0: Verification Engine + Operations.** Validasi dan escrow *brute-force* manual. Membuktikan VOT memiliki nilai.
- **Phase 1: The Reference Marketplace.** Meluncurkan etalase transaksi publik.
- **Phase 2: The ARGUS API.** Membuka protokol agar pihak ketiga bisa menggunakan infrastruktur verifikasi kita.
- **Phase 3: Public Infrastructure & Certification.** Merilis program sertifikasi. Menjadi standar ekosistem.

## 9. The Company We Can Actually Build Next Month
Bulan depan, kita membangun **Sistem Verifikasi & Escrow (API-first)** yang digerakkan secara manual. 
Engineer tidak mendesain UI belanja; ia memodelkan **The ARGUS Protocol** dan *Data Graph* di database. Founder mencari 50 klien pertama. Operations menjadi garda terdepan verifikasi tiket.
## 9.5. Bounded Contexts (Domain-Driven Design)
Untuk mencegah percampuran logika domain dan memudahkan transisi ke arsitektur layanan terpisah di masa depan, sistem dibagi menjadi konteks terikat (Bounded Contexts) yang dikelompokkan berdasarkan kepentingan bisnis:

### A. Core Domains (Wajib & Kritis)
Konteks yang mendefinisikan kelangsungan hidup protokol ARGUS. Jika dihapus, sistem tidak dapat beroperasi.
1. **Ownership Context**
   - *Entities:* Ticket, Ownership Record (Append-Only Ledger), Transfer
2. **Verification Context**
   - *Entities:* Verification Session, Evidence Bundle, Venue Check
3. **Settlement Context**
   - *Entities:* Escrow, Payment, Refund
4. **Audit Context (Cross-Cutting)**
   - *Entities:* Write-Only Audit Log

### B. Supporting & Generic Domains (Pendukung)
Konteks tambahan untuk pengayaan data atau penyederhanaan operasi. Sistem tetap dapat berjalan tanpa konteks ini.
1. **Identity Context (Generic)**
   - *Entities:* User, KYC validation, Device, Session
2. **Risk Context (Supporting)**
   - *Entities:* Trust Score (Advisory), Fraud Detection Rules
3. **Public Context (Generic)**
   - *Entities:* ARGUS Verify UI, Public Integration APIs

## 10. The "One Sentence" (Mantra Perusahaan)
Semua orang di perusahaan harus hafal kalimat ini di luar kepala:
> **ARGUS is the trust infrastructure for verified ticket ownership transfer.**

## 11. What ARGUS Is NOT
Batasan ini sangat penting agar tim tidak kehilangan arah dan fokus.

**ARGUS is NOT:**
- A ticket promoter
- An event organizer
- A ticket issuer
- A speculative ticket trader
- A dynamic pricing platform
- An advertising business

**ARGUS IS:**
- A verified ticket transfer infrastructure
- A trust network
- An ownership verification platform
- A dispute resolution platform

## 12. Design Principles
Prinsip pengambilan keputusan desain dan operasional:
- *If Operations is enough, don't build software.*
- *If software is enough, don't use AI.*
- *If AI is enough, don't use humans.*
- *If humans are required, collect evidence.*
- *Everything must improve trust.*

## 13. Decision Filter
Setiap ide baru atau pengajuan fitur harus lolos lima pertanyaan ini:
1. Does this increase trust?
2. Does this reduce fraud?
3. Does this simplify transfer?
4. Can Operations do it first?
5. Can we postpone it until 10,000 users?

Jika jawabannya **NO** -> *Don't build it.*

## 14. Exit Criteria (Kondisi Selesai)
Misi perusahaan ini dianggap selesai dan sukses besar pada satu kondisi:
> **ARGUS tidak lagi dibutuhkan sebagai operator transaksi *end-to-end*, karena seluruh industri (promotor, venue, dan platform kompetitor) telah mengadopsi ARGUS Protocol sebagai standar dasar perpindahan kepemilikan tiket.**
Paradoksnya, itulah puncak kesuksesan infrastruktur: bekerja secara diam-diam (invisible) di latar belakang semua transaksi tiket di negara ini.

## 15. Technical Constitution (Architecture Gates)
Sebelum menulis kode program, implementasi teknis wajib mematuhi dokumen konstitusi berikut:
1. **[Architecture Decision Records (ADR)](file:///c:/Users/RYZEN/.antigravity-ide/CALO/docs/architecture_decision_records.md):** 13 keputusan desain arsitektur mendasar dan permanen yang menjamin integritas infrastruktur (seperti Immutable Ownership, Advisory Trust Score, Right to Explain, Append-Only Ledger, Hashed Evidence Bundles, dan Data Outlives Code).
2. **[System Invariants](file:///c:/Users/RYZEN/.antigravity-ide/CALO/docs/system_invariants.md):** Aturan-aturan domain logis/matematis yang tidak boleh dilanggar oleh status atau alur data apa pun di database dan kode aplikasi.
3. **[Architecture Stress-Test & Red Team Review](file:///c:/Users/RYZEN/.antigravity-ide/CALO/docs/argus_architecture_review.md):** Laporan audit arsitektur independen yang memetakan skenario kegagalan, batasan skalabilitas (SQLite vs Postgres), audit Forensik Digital, serta penyesuaian desain ala Stripe, Amazon, dan Cloudflare.
4. **Operational Merge Rule (Aturan Penggabungan PR):** Setiap pull request yang mengubah domain `Ownership`, `Verification`, `Evidence`, `Settlement`, atau `Audit` wajib menyebutkan ADR yang dipengaruhi serta invariant yang dipertahankan. Jika sebuah perubahan tidak bisa membuktikan secara logis atau melalui tes bahwa invariant tetap benar, pull request tersebut tidak boleh di-merge.



