# TIKUM — STANDAR OPERASIONAL PROSEDUR (SOP) PETUGAS LAPANGAN (PIC) & ESKALASI INSIDEN

**Versi:** 1.0 — Pilot Edition
**Penyusun:** Divisi Operasional & Kepatuhan PT Shinerva Prajna Tejas
**Status:** DOKUMEN RESMI TIKUM
**Ruang Lingkup:** Seluruh Penugasan Lapangan di Titik Kumpul (Venue-Assisted Handover)

---

## 1. TUJUAN & PRINSIP DASAR
SOP ini disusun untuk memastikan setiap serah terima fisik tiket/wristband melalui TIKUM berlangsung aman, transparan, netral, dan memiliki bukti digital yang sah (auditable evidence bundle).

### Tiga Prinsip Pokok PIC TIKUM:
1. **Netralitas Mutlak:** Petugas Lapangan (PIC) bertindak sebagai saksi independen netral. PIC dilarang keras memihak penjual atau pembeli, serta dilarang bertindak sebagai PIC untuk transaksi yang melibatkan dirinya, kerabat, atau pihak terafiliasi (`CONFLICT_OF_INTEREST_PIC`).
2. **Pemisahan Serah Terima Fisik vs. Akses Gerbang Venue:** PIC menyaksikan serah terima fisik gelang/tiket asli di Titik Kumpul. PIC **bukan karyawan promotor** dan **tidak menjamin kelolosan turnstile gate promotor**.
3. **Kepatuhan Perlindungan Data (UU PDP No. 27/2022):** Identitas, nomor NIK, dan nomor telepon para pihak hanya diperiksa untuk verifikasi pencocokan identitas, dilarang disebarluaskan atau difoto tanpa masker data.

---

## 2. PERLENGKAPAN STANDAR PIC (FIELD KIT)
Setiap petugas PIC yang bertugas wajib membawa:
- [ ] Kartu Tanda Pengenal Resmi (ID Card TIKUM) & Lanyard resmi.
- [ ] Rompi / Polo Shirt Lapangan resmi TIKUM.
- [ ] Smartphone Android/iOS dengan aplikasi TIKUM aktif, kamera berfungsi baik, baterai minimum 80%, dan kuota data seluler stabil.
- [ ] Powerbank minimum 10.000 mAh.
- [ ] Papan Penanda / Hand-held Signage bertuliskan: **"TITIK KUMPUL RESMI TIKUM"**.
- [ ] Form Berita Acara Fisik (Offline Backup Form) dan pena cadangan.

---

## 3. ALUR OPERASIONAL PENUGASAN (4 TAHAP)

### TAHAP 1: PRA-ACARA (H-4 S/D H-2 JAM SEBELUM OPEN GATE)
1. **Briefing Online (H-4 Jam):** PIC mengikuti briefing virtual singkat bersama Trust Ops Coordinator mengenai aturan promotor, jadwal penukaran wristband, dan titik rawan venue.
2. **Kedatangan & Check-In Lokasi (H-3 Jam):**
   - PIC tiba di area venue yang telah ditentukan dalam Event Policy Registry (misal: Plaza Tenggara GBK / Pintu 2 JIExpo).
   - PIC membuka aplikasi TIKUM dan melakukan **Gate Check-In** dengan mengunggah foto selfie berlatar belakang landmark venue dan menyertakan koordinat GPS timestamped (`VenueOperationsService.recordGateCheckIn`).
3. **Setup Titik Kumpul:** Menempatkan penanda Titik Kumpul di lokasi yang mudah dilihat, teduh, terang, dan tidak menghalangi jalur evakuasi penonton.
4. **Cek Antrean Transaksi:** Memeriksa daftar order aktif yang dijadwalkan pada shift tersebut.

---

### TAHAP 2: PROSEDUR SERAH TERIMA DI LOKASI (HANDOVER CEREMONY)
Ketika Penjual dan Pembeli hadir di Titik Kumpul:

1. **Pemeriksaan Identitas (ID Matching):**
   - PIC meminta Penjual memperlihatkan KTP/Paspor fisik asli. Cocokkan nama dengan data penjual di sistem TIKUM (`seller_identity_ref`).
   - PIC meminta Pembeli memperlihatkan identitas fisik asli. Cocokkan dengan data pembeli di Deal Room.
2. **Pemeriksaan Fisik Tiket/Gelang (Physical Inspection):**
   - Periksa keaslian fisik wristband: hologram promotor, nomor seri tercetak, barcode/RFID tag tidak robek, dan segel pengunci (locking teeth) belum pernah dikencangkan/dilepas paksa.
   - Jika tiket berbentuk e-voucher yang membutuhkan penukaran di booth resmi: PIC mendampingi Penjual dan Pembeli ke booth penukaran promotor untuk memastikan wristband fisik resmi diserahkan langsung.
3. **Penyampaian Disclaimer Resmi (Wajib dibacakan):**
   > *"Selamat datang di Titik Kumpul TIKUM. Saya selaku PIC TIKUM menyaksikan penyerahan fisik gelang/tiket ini secara sah dari Penjual kepada Pembeli. Harap diperhatikan bahwa TIKUM memfasilitasi transaksi dan bukti fisik yang terverifikasi, namun TIKUM bukan pihak promotor dan tidak mengendalikan scanner gerbang venue."*
4. **Pengambilan Bukti & Upload (Digital Evidence Bundle Slot 7):**
   - PIC mengambil foto bersama serah terima: Penjual dan Pembeli memegang wristband di Titik Kumpul dengan penanda lokasi terlihat.
   - Unggah foto ke sistem TIKUM (Slot 7: `VENUE_PIC_HANDOVER_WITNESSED`).
   - Pembeli membuka Deal Room di ponselnya dan menekan tombol **"Konfirmasi Penerimaan Fisik"** (Slot 8: `BUYER_CONFIRMED_RECEIPT`).
5. **Pencatatan Berhasil:** Transaksi bertransisi ke status `HANDOVER_COMPLETED`. PIC mengingatkan Pembeli untuk segera menuju gate masuk.

---

### TAHAP 3: PROTOKOL KETIDAKHADIRAN PEMBELI (BUYER NO-SHOW PROTOCOL)
Jika Penjual sudah hadir tepat waktu namun Pembeli belum tiba pada jam janji temu:

1. **Aktivasi Grace Period 30 Menit (Wajib):**
   - Waktu tunggu wajib dihitung tepat **30 menit** sejak jam kesepakatan pertemuan.
   - Sebelum 30 menit berakhir, sistem secara tegas **MENOLAK** klaim no-show.
2. **Tindakan Komunikasi Terjadwal:**
   - Menit ke-0: PIC mengirim pesan WhatsApp resmi dan menelepon Pembeli (Catat jam panggilan di log).
   - Menit ke-15: PIC mengirimkan peringatan kedua bahwa waktu tunggu tersisa 15 menit.
   - Menit ke-25: Peringatan terakhir bahwa transaksi akan dibatalkan/ditutup demi perlindungan penjual jika tidak hadir.
3. **Pencatatan Bukti No-Show (Menit ke-30):**
   - Jika Pembeli tidak hadir dan tidak ada konfirmasi yang sah: PIC mengambil foto Penjual memegang tiket di Titik Kumpul dengan penunjuk waktu/jam digital terlihat.
   - PIC membuat Berita Acara Ketidakhadiran Pembeli (`BUYER_NO_SHOW_RECORD`) di aplikasi.
4. **Eskalasi Kuorum 2-dari-3 (Quorum Independence):**
   - Laporan no-show diverifikasi oleh 3 pihak independen:
     1. Field PIC (Bukti kehadiran fisik lapangan).
     2. Trust Admin (Verifikasi log komunikasi dan dokumen tiket).
     3. Compliance Admin (Otorisasi independen).
   - Setelah 3 pihak menandatangani, status diselesaikan menjadi `RESOLVED_BUYER_NO_SHOW`, hak pembayaran Penjual dilindungi, dan tiket fisik tetap menjadi hak Penjual.

---

### TAHAP 4: PASCA-ACARA & PENUTUPAN SHIFT
1. Setelah batas waktu shift selesai (misal: 1 jam setelah pertunjukan dimulai):
   - PIC memeriksa seluruh transaksi shift: pastikan tidak ada tiket tertinggal atau kasus menggantung.
   - Mengunggah catatan penutupan shift dan daftar insiden (jika ada).
   - Menjalankan **Gate Check-Out** pada sistem (`VenueOperationsService.recordGateCheckOut`).
2. Biaya penugasan PIC (Rp 250.000) otomatis tercatat dalam Shift Ledger untuk disbursment mingguan operasional.

---

## 4. MATRIKS ESKALASI INSIDEN LAPANGAN (INCIDENT ESCALATION MATRIX)

| Kode Insiden | Skenario | Tingkat Keparahan | Prosedur Tindakan PIC | Solusi Sistem & Finansial |
| :--- | :--- | :---: | :--- | :--- |
| **INC-01** | **Tiket Palsu / Rusak** (`FAKE_TICKET`) | **CRITICAL (RED)** | 1. Tahan transaksi segera.<br>2. Sita/foto tiket yang diduga palsu.<br>3. Minta identitas Penjual.<br>4. Hubungi Hotline Trust Ops. | Order dihentikan (Status RED). Penjual tidak menerima pembayaran. Penjual diwajibkan mengembalikan dana buyer. Penalti wanprestasi diterapkan. Akun penjual dibekukan permanen. |
| **INC-02** | **Penjual Tidak Hadir** (`SELLER_NO_SHOW`) | **HIGH (RED)** | 1. Hubungi penjual 3x.<br>2. Jika lewat 15 menit tidak ada kabar, amankan pembeli.<br>3. Catat bukti kehadiran pembeli. | Order dibatalkan karena wanprestasi seller. TIKUM merefund platform fee 100%. Seller ditagih pokok tiket via jalur hukum/penagihan resmi jika dana sudah ditransfer via Mode 2. |
| **INC-03** | **Pembeli Tidak Hadir** (`BUYER_NO_SHOW`) | **MEDIUM (YELLOW)** | 1. Terapkan grace period 30 menit.<br>2. Catat log panggilan 3x.<br>3. Foto bukti seller siap di lokasi. | Setelah 30 menit, kuorum 2-of-3 diaktifkan. Penjual menerima hak pembayaran penuh. Tiket dikembalikan ke penjual. |
| **INC-04** | **Promotor Tolak Surat Kuasa** (`IDENTITY_MISMATCH`) | **HIGH (YELLOW)** | 1. Arahkan seller untuk ikut membantu verifikasi di helpdesk promotor jika memungkinkan.<br>2. Foto penolakan loket promotor. | Jika seller menolak membantu padahal disyaratkan: Seller bertanggung jawab. Jika promotor mengubah aturan sepihak di hari H: Mediasi dispute darurat. |
| **INC-05** | **Barcode Gagal di Turnstile Gate** (`ENTRY_FAILURE`) | **CRITICAL (RED)** | 1. Arahkan pembeli minta lembar bukti penolakan scanner dari gate supervisor promotor.<br>2. Foto lembar penolakan. | Penahanan dana seller segera diaktifkan. Tiket diinvestigasi apakah diduplikasi oleh seller. Jika terbukti duplikat: Tindak pidana penipuan dilaporkan ke pihak berwajib. |
| **INC-06** | **Kerusuhan / Bahaya Fisik di Venue** (`SAFETY_HAZARD`) | **EMERGENCY (BLACK)** | 1. UTAMAKAN KESELAMATAN JIWA.<br>2. Tinggalkan Titik Kumpul menuju jalur evakuasi aman.<br>3. Laporkan status aman ke PIC Lead via telepon. | Seluruh transaksi di venue ditangguhkan sementara (Emergency Freeze). Tidak ada evaluasi penalti selama status force majeure. |

---

## 5. KANAL KOMUNIKASI & DARURAT
- **Trust Ops Center (24/7):** WhatsApp Hotline Resmi Ops: `+62 811-TIKUM-OPS`
- **Lead Compliance Officer:** `compliance@shinerva.id`
- **Call Center Kepolisian / Keamanan GBK:** (021) 5734070 (Security GBK) / 110 (Polri)
