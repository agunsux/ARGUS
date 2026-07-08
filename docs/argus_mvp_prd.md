# ARGUS Verify MVP (Product Requirements Document)

## 1. Tujuan Produk
Membangun *internal tool* dan antarmuka penerima/pengirim paling dasar yang diperlukan untuk mendukung **Operating Manual Phase 0**. Software ini bertugas mempercepat kerja tim Operations, BUKAN untuk menghilangkan manusia dari proses.

## 2. Pengguna (Actors)
1. **Current Owner (Pengirim):** Ingin memindahtangankan tiket dengan aman tanpa takut tertipu penerima palsu.
2. **New Owner (Penerima):** Ingin menerima perpindahan kepemilikan tiket dengan jaminan dana kembali jika tiket tidak valid.
3. **Trust Officer (Operations ARGUS):** Mengaudit *evidence*, menyetujui transfer, dan mengelola Escrow.

## 3. Fitur Kunci MVP (Berdasarkan "Pembersihan Fitur")

### 3.1. Verified Ticket Transfer Platform (Reference Client)
- **Katalog Tiket Sederhana:** Menampilkan tiket dengan status `VERIFIED`. Halaman ini statis/di-*generate* saat ada perubahan data.
- **Form Pendaftaran Transfer (Pengirim):** Form terstruktur (via Typeform/Custom Web Form) untuk mengunggah:
  - Data tiket (Event, Kategori, Seat, Harga).
  - *Proof of Identity* (Foto KTP).
  - *Proof of Purchase* (PDF Tiket, Invoice, Mutasi Rekening).
- **Transfer Initiation (Penerima):** Tombol "Ambil Alih Kepemilikan" yang mengunci tiket (status `RESERVED`) dan memberikan instruksi transfer bank manual dengan kode unik (misal: Rp 1.500.021).

### 3.2. ARGUS Verify Dashboard (Internal Ops Tool)
Jantung dari MVP ini adalah dashboard untuk *Trust Officer*.
- **Inbox Tiket Baru:** Daftar form *submit* dari pengirim yang masuk.
- **Evidence Viewer:** UI yang memfasilitasi Operations untuk membandingkan nama di KTP, Invoice, dan Mutasi Rekening berdampingan (*side-by-side*) secara cepat.
- **State Switcher:** Tombol sederhana untuk memindahkan status tiket sesuai *The ARGUS Protocol*: `LISTED` -> `VERIFIED` -> `RESERVED` -> `TRANSFERRED`.
- **Escrow Ledger Manual:** Tabel sederhana yang mencatat arus kas masuk dari penerima dan tenggat waktu pencairan (*settlement*) ke pengirim.

### 3.3 WhatsApp Business Integration (Notifikasi & Komunikasi)
Tidak ada fitur *chat in-app*. Semua komunikasi menggunakan WA.
- **Notifikasi Status (Manual/Semi-Automated):** Blast pesan WA ketika status berubah (contoh: *"Tiket Anda telah VERIFIED dan tayang di ARGUS"*).
- **Mediasi Sengketa (Manual):** Membuat grup WA (Pengirim, Penerima, Ops) jika ada laporan *dispute* di gerbang venue.

## 4. Metrik Keberhasilan MVP
- **Verification Latency:** Waktu yang dibutuhkan Ops untuk memverifikasi 1 tiket turun dari 15 menit (manual murni) menjadi di bawah 5 menit dengan *Evidence Viewer*.
- **Error Rate:** 0% tiket palsu lolos dari dashboard.
- **Unit Economics:** Biaya server dan pihak ketiga (WhatsApp API) tetap di bawah margin keuntungan (fee) per transfer.

## 5. Out of Scope (TIDAK BOLEH DIBANGUN DI MVP)
- Sistem pembayaran otomatis (Payout *harus* manual untuk keamanan tahap awal).
- Sistem deteksi fraud AI (Ops melakukan pengecekan visual manusia).
- Sistem rekomendasi, keranjang belanja (cart) multi-tiket, atau fitur *social* (review user).
