# ARGUS Verify MVP (Product Requirements Document)

## 1. Tujuan Produk
Membangun *internal tool* dan antarmuka publik paling dasar yang diperlukan untuk mendukung **Operating Manual Phase 0**. Software ini bertugas mempercepat kerja tim Operations, BUKAN untuk menghilangkan manusia dari proses.

## 2. Pengguna (Actors)
Berdasarkan *STYLE_GUIDE.md*, kita membedakan terminologi publik dan internal.
1. **Seller / Penjual:** (Sistem: *Current Owner*). Ingin menjual tiket dengan aman tanpa takut tertipu pembeli palsu.
2. **Buyer / Pembeli:** (Sistem: *New Owner*). Ingin membeli tiket dengan jaminan uang kembali jika tiket tidak valid.
3. **Trust Officer (Operations ARGUS):** Mengaudit *evidence*, menyetujui transfer, dan mengelola Escrow.

## 3. Fitur Kunci MVP

### 3.1. Public Reference Marketplace (Etalase)
Marketplace ini adalah aplikasi klien (*Reference Client*) pertama di atas protokol ARGUS.
- **Katalog Tiket Sederhana:** Menampilkan tiket dengan status `VERIFIED`. Halaman ini statis/di-*generate* saat ada perubahan data.
- **Form Pendaftaran (Seller):** Form terstruktur (via Typeform/Custom Web Form) untuk mengunggah:
  - Data tiket (Event, Kategori, Seat, Harga).
  - *Proof of Identity* (Foto KTP).
  - *Proof of Purchase* (PDF Tiket, Invoice, Mutasi Rekening).
- **Checkout Sederhana (Buyer):** Tombol **"Beli Tiket"** yang mengunci tiket (status internal: `RESERVED`) dan memberikan instruksi transfer bank manual dengan kode unik (misal: Rp 1.500.021).

### 3.2. ARGUS Verify Dashboard (Internal Ops Tool)
Jantung dari MVP ini adalah dashboard infrastruktur untuk *Trust Officer*.
- **Inbox Tiket Baru:** Daftar form *submit* dari Seller yang masuk.
- **Evidence Viewer:** UI yang memfasilitasi Operations untuk membandingkan nama di KTP, Invoice, dan Mutasi Rekening berdampingan (*side-by-side*) secara cepat.
- **State Switcher:** Tombol sederhana untuk memindahkan status tiket sesuai *The ARGUS Protocol*: `LISTED` -> `VERIFIED` -> `RESERVED` -> `TRANSFERRED`.
- **Escrow Ledger Manual:** Tabel sederhana yang mencatat arus kas masuk dari Buyer dan tenggat waktu pencairan (*settlement*) ke Seller.

### 3.3 WhatsApp Business Integration (Notifikasi & Komunikasi)
Tidak ada fitur *chat in-app*. Semua komunikasi menggunakan WA dengan bahasa *customer-friendly*.
- **Notifikasi Status (Manual/Semi-Automated):** Blast pesan WA ketika status berubah (contoh: *"Tiket Anda telah VERIFIED dan tayang di Marketplace ARGUS"*).
- **Mediasi Sengketa (Manual):** Membuat grup WA (Seller, Buyer, Ops) jika ada laporan *dispute* di gerbang venue.

## 4. Metrik Keberhasilan MVP
- **Verification Latency:** Waktu yang dibutuhkan Ops untuk memverifikasi 1 tiket turun dari 15 menit (manual murni) menjadi di bawah 5 menit dengan *Evidence Viewer*.
- **Error Rate:** 0% tiket palsu lolos dari dashboard.
- **Unit Economics:** Biaya server dan pihak ketiga (WhatsApp API) tetap di bawah margin keuntungan (fee) per transfer (*VOT*).

## 5. Out of Scope (TIDAK BOLEH DIBANGUN DI MVP)
- Sistem pembayaran otomatis (Payout *harus* manual untuk keamanan tahap awal).
- Sistem deteksi fraud AI (Ops melakukan pengecekan visual manusia).
- Sistem rekomendasi, keranjang belanja (cart) multi-tiket, atau fitur *social* (review user).
