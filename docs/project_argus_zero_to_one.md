# PROJECT ARGUS — ZERO TO ONE

*Membangun Infrastruktur Kepercayaan untuk Perpindahan Kepemilikan Tiket.*

## 1. The Constraints (Aturan Main)
Perusahaan ini tidak memiliki kemewahan startup Silicon Valley. Kita beroperasi di dunia nyata dengan sumber daya sangat terbatas:
- **Tim:** 1 Founder, 1 Engineer, 1 Operations.
- **Modal:** Kurang dari USD 30,000.
- **Tidak ada:** Tim AI khusus, Departemen Legal, Departemen Marketing, Pendanaan Ventura (VC), Dukungan Pemerintah, Kontrak Enterprise.
- **Syarat Hidup:** Perusahaan harus bertahan hidup HANYA dari pendapatan pelanggan (Customer Revenue).
- **Tujuan Akhir (Saat ini):** Product-Market Fit (PMF). Bukan status Unicorn.

## 2. Feature Purge (Pembersihan Fitur)
Setiap fitur dievaluasi dengan kejam: *Bisakah kita membuangnya? Menyederhanakannya? Mengganti software dengan operasi manual? Menundanya hingga 10.000 pengguna?*

- **Fitur 1: Sistem Rekomendasi/Discovery Tiket (AI/Machine Learning)**
  - *Bisa dibuang?* Ya. Pembeli tahu tiket apa yang mereka cari (misal: "Coldplay Jakarta").
  - *Keputusan:* **HAPUS.** Pencarian sederhana (teks/filter) sudah cukup.

- **Fitur 2: Sistem Chat Internal Pembeli & Penjual**
  - *Bisa diganti operasi/manual?* Ya.
  - *Keputusan:* **HAPUS.** Gunakan WhatsApp. Jika butuh mediasi, tim Operations akan bertindak sebagai perantara di grup WA sementara.

- **Fitur 3: Automated Fraud Detection System (ARGUS Shield AI)**
  - *Bisa diganti operasi/manual?* Ya. Di awal, volume transaksi kecil. 1 orang Operations bisa mengecek PDF, invoice, dan KTP secara manual.
  - *Keputusan:* **TUNDA.** Lakukan *manual review* (Phase 0) sampai volume membuat tim kewalahan.

- **Fitur 4: Digital Wallet / Saldo User In-App**
  - *Bisa disederhanakan?* Ya. Hindari regulasi *e-money* yang rumit dan butuh tim legal mahal.
  - *Keputusan:* **HAPUS.** Gunakan sistem *Escrow* per transaksi. Uang masuk ke rekening bank perusahaan (Corporate Account), lalu ditransfer langsung ke rekening penjual setelah pembeli masuk *venue* (manual transfer oleh Founder/Ops).

- **Fitur 5: Dynamic Pricing / Bidding System**
  - *Bisa ditunda?* Ya. Sangat rumit untuk dibangun dan membingungkan pengguna awal.
  - *Keputusan:* **HAPUS.** Penjual menetapkan harga pas (Fixed Price).

- **Fitur 6: Mobile App (iOS & Android)**
  - *Bisa disederhanakan?* Ya. Membangun 2 platform native memakan waktu dan biaya.
  - *Keputusan:* **TUNDA.** Bangun Mobile-Optimized Web App.

## 3. What Survives (Apa yang Tersisa & Mengapa)

Hanya komponen inti dari **Ticket Transfer Infrastructure** yang bertahan:

1. **Landing Page & Form Submit Sederhana (Web):**
   - *Mengapa:* Penjual butuh tempat untuk mendaftarkan tiket, pembeli butuh tempat untuk melihat tiket yang diverifikasi. Ini adalah etalase paling dasar.
2. **ARGUS Verify (Manual / Semi-Automated):**
   - *Mengapa:* Ini adalah *core value* kita. Pembeli membayar kita untuk memastikan tiketnya asli. Engineer membangun *internal dashboard* sederhana untuk Operations mengunggah, mengecek *proof of purchase*, dan mengubah status tiket menjadi "Verified".
3. **Escrow System (Manual Payout):**
   - *Mengapa:* Tanpa ini, tidak ada rasa aman. Pembeli mentransfer dana ke rekening perusahaan. Uang ditahan. Setelah transaksi selesai dan tidak ada *dispute*, Operations mentransfer uang ke penjual secara manual.
4. **WhatsApp Business (Komunikasi & Resolusi):**
   - *Mengapa:* Untuk notifikasi status, resolusi sengketa (ARGUS Resolve versi manual), dan *customer service*. Jauh lebih murah dan cepat dibangun daripada sistem notifikasi dan chat *in-app*.

## 4. The Roadmap (Membangun ARGUS OS dari Nol)

Kita tidak membangun seluruh ekosistem (Verify, Shield, Score, Ledger, Transfer, Resolve, Insight) hari ini. Kita membangun fondasinya secara bertahap.

### Phase 0: The Flintstone Era (Bulan 1-3)
- **Produk:** Website sederhana (Katalog statis), Google Forms/Typeform untuk penjual *submit* tiket.
- **Proses:** Founder/Ops memverifikasi tiket secara manual (memeriksa invoice, KTP, mutasi rekening). Pembeli transfer bank manual. Ops menahan PDF tiket dan baru mengirimkannya via WA/Email saat pembayaran terkonfirmasi.
- **Fokus:** Membuktikan bahwa orang mau membayar premium (fee) untuk **Infrastruktur Kepercayaan**, bukan sekadar mencari tiket murah.

### Phase 1: ARGUS Verify & Transfer v1 (Bulan 3-6)
- **Produk:** Web app dengan database tersendiri. Penjual memiliki *dashboard* sederhana untuk *upload* bukti.
- **Proses:** Engineer membuat *internal dashboard* (cikal bakal ARGUS OS) untuk mempercepat kerja Ops memvalidasi tiket. Payment gateway standar (seperti Xendit/Midtrans) diintegrasikan untuk menerima pembayaran otomatis (namun *payout* tetap manual untuk keamanan).

### Phase 2: ARGUS Resolve (Bulan 6-12)
- **Produk:** Sistem tiket komplain / Dispute Engine sederhana di dalam aplikasi.
- **Proses:** Menstandarisasi cara pembeli melaporkan tiket yang bermasalah di gerbang masuk (misal: harus ada video bukti tertolak). *Escrow payout* ditunda otomatis jika ada laporan.

## 5. The Company We Can Actually Build Next Month

Bulan depan, perusahaan kita bukanlah "Marketplace Raksasa".

Bulan depan, perusahaan kita adalah **Layanan Verifikasi & Escrow Transfer Tiket Berbasis Web Sederhana dan Operasional Manual.**

- **Engineer** kita tidak melatih model AI; dia membangun *dashboard* internal agar **Operations** bisa mengecek keabsahan tiket 5x lebih cepat.
- **Operations** kita tidak mengelola ribuan komplain dari bot; dia memverifikasi 10-50 tiket sehari dengan sangat teliti karena reputasi awal adalah urat nadi perusahaan.
- **Founder** tidak sibuk *pitching* ke VC; dia berbicara dengan 50 pelanggan pertama di WhatsApp, menjadi penengah jika ada masalah di gerbang *venue*, dan memastikan setiap transfer tiket sukses secara riil.

Kita tidak menjual tiket. 

Kita menagih biaya (fee) atas **Infrastruktur Kepercayaan** yang kita sediakan—yang di masa awal ini digerakkan oleh keringat, ketelitian operasional, dan integritas. 

Di situlah *Zero to One* kita.
