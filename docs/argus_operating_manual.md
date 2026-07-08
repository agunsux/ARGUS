# ARGUS Operating Manual (Phase 0)

Dokumen ini adalah panduan praktis (SOP) untuk menjalankan operasional harian ARGUS pada tahap awal (Manual/Brute-force). Dokumen ini lebih sering dibuka oleh tim Operations daripada *whitepaper* perusahaan.

## The Goal
Menyelesaikan **100-300 Verified Ticket Transfers** pertama dengan *dispute rate* mendekati 0% dan pengalaman pengguna yang luar biasa aman.

---

## Standard Operating Procedure: Transaksi H-7

Setiap transaksi tiket harus melewati tahapan *state* yang ketat sebelum dianggap sah.

### 1. `LISTED`: Current Owner Submit Transfer
- **Aksi:** Pengirim mengisi form (Typeform/Google Form) dengan detail tiket, nilai transfer, dan rekening bank tujuan.
- **Evidence Wajib:** PDF tiket asli/e-ticket, foto KTP, tangkapan layar email konfirmasi dari promotor, tangkapan layar mutasi rekening pembelian awal.
- **PIC:** System (via Form)

### 2. `VERIFIED (INTERNAL)`: Operations Cek
- **Aksi:** Ops mengecek keaslian *evidence*. Validasi nama di tiket = KTP = Nama Rekening. Validasi nomor pesanan (order ID) jika memungkinkan (menelepon promotor jika ragu).
- **SLA:** Maksimal 3 jam setelah *submit*.
- **Kondisi Gagal:** Jika bukti buram, nama berbeda tanpa surat kuasa yang sah, atau PDF terlihat diedit (cek metadata).
- **Eskalasi:** Hubungi pengirim via WA untuk meminta bukti tambahan. Jika gagal, tolak pendaftaran.

### 3. `RESERVED`: New Owner Ditemukan
- **Aksi:** Tiket tayang di antrean *Verified Ticket Transfer Platform*. Penerima setuju untuk mengambil alih kepemilikan.
- **PIC:** System / Ops (Update antrean)

### 4. `ESCROW`: Dana Diterima
- **Aksi:** Penerima mentransfer dana ke rekening korporat ARGUS.
- **SLA:** 1 Jam batas waktu transfer.
- **Evidence Wajib:** Bukti transfer penerima, dicek silang dengan mutasi rekening perusahaan.
- **PIC:** Operations.

### 5. `IDENTITY CHECK`: Verifikasi Penerima
- **Aksi:** Ops memverifikasi identitas penerima (KTP) untuk dicatat dalam *Chain of Custody* (ARGUS Ledger manual).
- **PIC:** Operations via WA.

### 6. `TRANSFERRED`: Transfer Ownership
- **Aksi:** Ops mengirimkan PDF tiket yang sah kepada penerima via WA/Email, disertai "Surat Jalan / Sertifikat Transfer ARGUS" yang menyatakan bahwa tiket ini sah berpindah tangan.
- **SLA:** 30 menit setelah dana terkonfirmasi.
- **PIC:** Operations.

### 7. `REDEEMED`: New Owner Confirmed (Masuk Venue)
- **Aksi:** Penerima memindai tiket di gerbang. Jika tidak ada laporan sengketa dalam waktu 2 jam setelah *gate open*, tiket dianggap sukses digunakan.
- **Kondisi Gagal (Dispute):** Penerima lapor tiket ditolak.
- **Evidence Wajib (Dispute):** Video tanpa jeda dari antrean gerbang menunjukkan barcode dipindai dan layar alat pemindai promotor menunjukkan "Tiket Invalid/Sudah Digunakan".
- **Eskalasi:** Tahan dana. Hubungi promotor/pengirim.

### 8. `SETTLEMENT & ARCHIVED`: Kasus Selesai
- **Aksi:** Ops mentransfer dana dari Escrow ke rekening Pengirim (dipotong *fee* ARGUS).
- **SLA:** H+1 setelah *event* selesai.
- **Evidence Wajib:** Bukti transfer ke pengirim.
- **PIC:** Founder / Operations.

---

## Prinsip Operasional Harian
1. **Jangan berasumsi.** Jika ada yang mencurigakan, minta bukti *screen-record* dari aplikasi pengirim.
2. **Tidak ada pengecualian.** Teman, kerabat, atau pengirim besar tetap wajib menyerahkan KTP dan bukti mutasi awal.
3. **Log semuanya.** Setiap *chat* WA, screenshot, dan bukti transfer disimpan dalam folder Google Drive terstruktur (Cikal bakal The Graph Database).
