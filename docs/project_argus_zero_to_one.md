# PROJECT ARGUS — ZERO TO ONE (Version 2)

*Membangun Protokol Kepercayaan untuk Perpindahan Kepemilikan Tiket.*

## 1. The Constraints (Aturan Main)
Perusahaan ini tidak memiliki kemewahan startup Silicon Valley. Kita beroperasi di dunia nyata dengan sumber daya sangat terbatas:
- **Tim:** 1 Founder, 1 Engineer, 1 Operations.
- **Modal:** Kurang dari USD 30,000.
- **Tidak ada:** Tim AI khusus, Departemen Legal, Departemen Marketing, Pendanaan Ventura (VC), Dukungan Pemerintah, Kontrak Enterprise.
- **Syarat Hidup:** Perusahaan harus bertahan hidup HANYA dari pendapatan pelanggan (Customer Revenue).
- **North Star Metric:** BUKAN GMV, bukan Revenue, bukan DAU/MAU. Melainkan **Verified Ownership Transfers (VOT)** (Berapa banyak perpindahan kepemilikan tiket yang berhasil diverifikasi).

## 2. Paradigma Bisnis: Dari Marketplace Menuju Protocol
Kamus perusahaan kita melarang keras penggunaan istilah "Marketplace Tiket". Kita membangun **Trust Protocol** dan **Ownership Infrastructure**. 
- Jika engineer berpikir membuat marketplace, mereka akan sibuk membuat *wishlist*, *promo*, dan *feed*.
- Karena engineer kita membangun infrastruktur, mereka sibuk menyempurnakan *audit trail, cryptographic proof, evidence chain, ownership state, verification latency*, dan *fraud detection*.
Marketplace yang kita bangun di awal hanyalah **Reference Implementation** (klien pertama) dari sistem kita sendiri.

## 3. Feature Purge (Pembersihan Fitur)
Setiap fitur dievaluasi dengan kejam: *Bisakah kita membuangnya? Menyederhanakannya? Mengganti software dengan operasi manual?*

- **Sistem Rekomendasi/Promo:** HAPUS. (Marketplace bukan tujuan utama).
- **In-App Chat:** HAPUS. (Gunakan WhatsApp untuk mediasi).
- **Automated Fraud Detection:** TUNDA. (Gunakan manual review oleh Operations di tahap awal).
- **Digital Wallet:** HAPUS. (Gunakan sistem Escrow langsung antar rekening bank).
- **Mobile App Native:** TUNDA. (Web-based sudah cukup untuk fase awal).

## 4. What Survives (Apa yang Tersisa & Mengapa)
Hanya komponen yang mendukung terciptanya **Trust Graph** historis yang bertahan:
1. **ARGUS Verify (Manual/Semi-Automated Dashboard):** Untuk validasi tiket *brute-force* oleh Operations di awal.
2. **Escrow System:** Sistem penahanan dana untuk menjamin rasa aman (Trust) sebelum transfer tervalidasi penuh.
3. **Reference Marketplace (Web):** Klien pertama (etalase sederhana) agar publik bisa menggunakan protokol kita.
4. **Historical Trust Graph Database:** Menyimpan data reputasi akun, perangkat, pembayaran, dan pola penipuan. **Inilah moat terbesar kita yang tidak bisa disalin oleh pesaing (Network Effect).**

## 5. The ARGUS Protocol
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

## 6. The ARGUS Standards
Standar terbuka yang di masa depan dapat diadopsi oleh promotor, venue, dan platform lain (sehingga mereka tidak perlu membangun sistem anti-penipuan sekunder dari nol):
- **Proof of Identity:** Standar verifikasi identitas pengirim dan penerima yang aman.
- **Proof of Purchase:** Standar validasi keabsahan mutasi/invoice pembelian awal (Chain of Custody).
- **Dispute Resolution Standard (ARGUS Resolve):** SLA dan aturan bukti (misal: kewajiban video unboxing/penolakan di gerbang) jika terjadi perselisihan.

## 7. The ARGUS Ecosystem & Roadmap
Roadmap kita bukan "Bikin Marketplace -> Cari User -> Bikin API". Kita membalik polanya:
- **Phase 0: Verification Engine + Operations.** Membuktikan protokol bekerja. Validasi tiket dan escrow dilakukan secara *brute-force* manual oleh Founder & Ops. 
- **Phase 1: The Reference Marketplace.** Meluncurkan etalase sederhana untuk memfasilitasi transaksi publik secara langsung di atas engine kita.
- **Phase 2: The ARGUS API.** Membuka protokol (*White-label infrastructure*) agar EO, promotor kecil, dan ticketing platform lain bisa memverifikasi transfer mereka melalui engine kita.
- **Phase 3: Industry Standard.** ARGUS menjadi standar de-facto keamanan. Entitas lain dengan bangga memasang badge "Verified by ARGUS".

## 8. The Company We Can Actually Build Next Month
Bulan depan, kita membangun **Sistem Verifikasi & Escrow (API-first)** yang sementara digerakkan secara manual. 

Engineer tidak sibuk mendesain UI keranjang belanja; ia memodelkan **The ARGUS Protocol** di database. Founder mencari 50 klien pertama via WhatsApp. Operations menjadi garda terdepan verifikasi tiket (ARGUS Verify manual) untuk memastikan 0% tiket palsu lolos.

Fokus kita hanya satu: menciptakan **Verified Ownership Transfers (VOT)** pertama kita yang tanpa celah, meletakkan bata pertama untuk infrastruktur kepercayaan puluhan tahun ke depan.
