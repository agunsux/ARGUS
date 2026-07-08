# ARGUS Implementation Roadmap (90 Hari Pertama)

Roadmap ini adalah turunan dari "Kitab Suci" (Version 3) yang fokus murni pada eksekusi Layer 1 (Reality) dalam 90 hari ke depan. Tujuannya adalah memproses transaksi tiket nyata, memvalidasi asumsi operasional, dan membuktikan bahwa orang bersedia membayar untuk *Verified Ownership Transfers (VOT)*.

---

## Bulan 1: Validasi Operasional & The "Flintstone" Setup

**Fokus:** Jangan menulis kode infrastruktur. Gunakan *no-code* dan tenaga manusia untuk melayani 10 transaksi pertama.

### Minggu 1-2: Persiapan Etalase & Alur
- **Tugas Founder:** Menyiapkan akun WhatsApp Business dan rekening korporat ARGUS.
- **Tugas Engineer:** Merancang *database schema* sederhana (PostgreSQL/Supabase) untuk merepresentasikan *The ARGUS Protocol* (state tiket, entitas). Membuat *Landing Page* statis sederhana yang menjelaskan "Cara Kerja ARGUS".
- **Tugas Operations:** Menyiapkan Google Forms/Typeform untuk *transfer submission* yang mewajibkan unggah KTP dan Mutasi Rekening.

### Minggu 3-4: Akuisisi Pelanggan Pertama (Manual)
- **Aksi:** Founder mencari pemilik tiket di platform sosial (Twitter, Telegram) yang kesulitan memindahtangankan tiketnya karena penerima ragu akan keaslian tiket. Tawarkan ARGUS sebagai pihak ketiga (Escrow + Verifikasi) secara gratis (atau diskon *fee*) untuk batch pertama.
- **Milestone:** Mendapatkan 10 transaksi pertama secara manual. Mengukur berapa lama waktu yang dihabiskan Operations untuk verifikasi 1 tiket secara manual.

---

## Bulan 2: The ARGUS Verify MVP

**Fokus:** Menghilangkan *bottleneck* dari Operations berdasarkan pengalaman Bulan 1. Memulai transisi dari Google Forms ke sistem internal.

### Minggu 5-6: Membangun Internal Dashboard
- **Tugas Engineer:** Membangun MVP *ARGUS Verify Dashboard* (sesuai `argus_mvp_prd.md`). Fokus pada *Evidence Viewer* (menampilkan KTP, PDF, dan Mutasi Rekening secara berdampingan).
- **Tugas Ops:** Menguji dashboard menggunakan data historis dari transaksi Bulan 1. Memberikan umpan balik jika alurnya lebih lambat dari cara manual.

### Minggu 7-8: Meluncurkan Verified Ticket Transfer Platform v1
- **Tugas Engineer:** Menghubungkan *Landing Page* statis ke database internal agar tiket yang statusnya `VERIFIED` otomatis tayang di halaman web publik. Membuat tombol "Beli" yang memberikan instruksi transfer rekening unik.
- **Milestone:** Penerima bisa melihat daftar antrean tiket tervalidasi secara *real-time* tanpa harus bertanya via WA apakah kepemilikan masih bisa dialihkan. Target mencapai **50 VOT**.

---

## Bulan 3: Skalabilitas Operasional & Perekaman Data

**Fokus:** Standardisasi *Dispute Resolution* dan peletakan dasar untuk *The Graph Database*.

### Minggu 9-10: ARGUS Resolve (Manual Standard)
- **Tugas Founder/Ops:** Merumuskan aturan mediasi. Membuat SOP penanganan laporan penolakan di gerbang (membutuhkan bukti video tanpa putus).
- **Tugas Engineer:** Mengintegrasikan notifikasi WA (WhatsApp API) agar ketika Operations menekan tombol `VERIFIED` atau `TRANSFERRED` di dashboard, sistem otomatis mengirimkan konfirmasi ke pelanggan.

### Minggu 11-12: Perekaman Historis (The Moat Foundation)
- **Tugas Engineer:** Memastikan bahwa setiap entitas (Nomor Rekening, NIK KTP, Nomor WA, Alamat IP) yang berpartisipasi dalam transaksi sukses atau gagal tercatat dengan rapi di database dengan struktur graf (*relational* yang dioptimasi). Ini adalah tabungan masa depan untuk *ARGUS Shield*.
- **Milestone 90 Hari:** 
  - Menyelesaikan **100 - 300 Verified Ownership Transfers (VOT)**.
  - Memiliki *Operating Manual* yang sudah teruji oleh sengketa nyata.
  - *Positive unit economics* pada transaksi.

---

## Aturan Emas 90 Hari:
> **Tidak ada modul baru (ARGUS Shield, Score, API) yang boleh disentuh kodenya sampai Bulan 3 selesai dengan target 100 VOT tercapai.**
