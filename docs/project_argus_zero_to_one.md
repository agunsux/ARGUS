# PROJECT ARGUS — ZERO TO ONE (Version 3)

*Membangun Public Trust Infrastructure untuk Ekosistem Tiket.*

## 1. The Constraints (Aturan Main)
Perusahaan ini tidak memiliki kemewahan startup Silicon Valley. Kita beroperasi di dunia nyata dengan sumber daya sangat terbatas:
- **Tim:** 1 Founder, 1 Engineer, 1 Operations.
- **Modal:** Kurang dari USD 30,000.
- **Tidak ada:** Tim AI khusus, Departemen Legal, Departemen Marketing, Pendanaan Ventura (VC), Dukungan Pemerintah, Kontrak Enterprise.
- **Syarat Hidup:** Perusahaan harus bertahan hidup HANYA dari pendapatan pelanggan (Customer Revenue).
- **North Star Metric:** BUKAN GMV, bukan Revenue, bukan DAU/MAU. Melainkan **Verified Ownership Transfers (VOT)** (Berapa banyak perpindahan kepemilikan tiket yang berhasil diverifikasi).

## 2. Paradigma Bisnis: Dari Protocol Menuju Public Infrastructure
Kamus perusahaan kita melarang keras penggunaan istilah "Marketplace Tiket". Kita membangun **Public Trust Infrastructure**. 
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
Fokus kita hanya satu: menciptakan **Verified Ownership Transfers (VOT)** pertama yang tanpa celah.

## 10. Exit Criteria (Kondisi Selesai)
Misi perusahaan ini dianggap selesai dan sukses besar pada satu kondisi:
> **ARGUS tidak lagi dibutuhkan sebagai operator transaksi *end-to-end*, karena seluruh industri (promotor, venue, dan platform kompetitor) telah mengadopsi ARGUS Protocol sebagai standar dasar perpindahan kepemilikan tiket.**
Paradoksnya, itulah puncak kesuksesan infrastruktur: bekerja secara diam-diam (invisible) di latar belakang semua transaksi tiket di negara ini.
