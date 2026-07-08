# ARGUS Terminology Style Guide

Dokumen ini mendefinisikan aturan penggunaan bahasa di seluruh ekosistem ARGUS. Untuk menjaga agar pengalaman pengguna tetap natural tanpa mengorbankan identitas infrastruktur perusahaan, kita membedakan terminologi berdasarkan audiens (*Audience-Driven Language*).

---

## 1. Public Language (Konteks: Customer, Landing Page, FAQ, WhatsApp)

Gunakan bahasa yang sesuai dengan mental model pasar dan pengguna sehari-hari. 
Jangan memaksa pengguna menggunakan istilah infrastruktur yang kaku.

| Hindari (Terlalu Kaku) | Gunakan (Natural) | Konteks |
| :--- | :--- | :--- |
| Transferor / Current Owner | **Seller (Penjual)** | Saat berbicara kepada pihak yang melepas tiket |
| Transferee / New Owner | **Buyer (Pembeli)** | Saat berbicara kepada pihak yang mengambil alih tiket |
| Initiate Transfer | **Beli Tiket** | Tombol Call-to-Action (CTA) di UI |
| Relinquish Ownership | **Jual Tiket** | Tombol CTA / Instruksi pendaftaran |
| Transfer Platform | **Reference Marketplace** | Saat menjelaskan etalase publik tempat pengguna bertransaksi |

---

## 2. System Language (Konteks: Operations & Engineering)

Gunakan bahasa domain saat mendesain sistem *backend*, merancang *database schema*, atau menulis *Operating Manual*. Ini memastikan bahwa fondasi sistem kita merefleksikan model yang sebenarnya (perpindahan kepemilikan).

| Konteks E-Commerce (Salah) | Gunakan (Domain Model) | Penjelasan |
| :--- | :--- | :--- |
| Seller Account | **Current Owner** | Entitas pemegang tiket saat ini di database |
| Buyer Account | **New Owner** | Entitas yang dituju untuk menerima tiket |
| Order / Transaction | **Ownership Transfer** | Peristiwa perpindahan kepemilikan |
| Checkout Process | **Verification & Escrow** | Proses validasi dan penahanan dana sebelum transfer |
| Receipt | **Evidence** | Bukti yang menjamin keabsahan transfer |

---

## 3. Architecture Language (Konteks: Investor & Company Strategy)

Gunakan bahasa infrastruktur saat mempresentasikan ARGUS ke pihak luar (B2B, Investor, Partner) atau saat mendefinisikan visi jangka panjang.

| Konteks E-Commerce (Salah) | Gunakan (Architecture) | Penjelasan |
| :--- | :--- | :--- |
| Ticket Marketplace | **Verified Ticket Transfer Infrastructure** | Positioning utama ARGUS sebagai perusahaan |
| Ticket Reseller | **Trust Network** | Jaringan nilai yang kita bangun |
| Features / Apps | **ARGUS Protocol** | Standar dan sistem yang mendasari aplikasi |
| Transaction History | **Chain of Ownership / Trust Graph** | Keunggulan kompetitif (moat) berbasis data |

---

## 4. Aturan Penamaan (Naming Conventions)

Semua modul internal dan arsitektur mengikuti struktur "ARGUS [Action/Entity]":

- **ARGUS OS:** Nama kolektif dari seluruh infrastruktur.
- **ARGUS Verify:** Modul verifikasi identitas dan tiket.
- **ARGUS Transfer:** Modul perpindahan kepemilikan.
- **ARGUS Resolve:** Modul penyelesaian sengketa (Dispute Engine).
- **ARGUS Shield:** Modul kecerdasan buatan anti-penipuan.
- **ARGUS Score:** Modul mesin reputasi entitas.
- **ARGUS Ledger:** Modul *chain of custody* / riwayat perpindahan.
- **ARGUS Insight:** Modul analitik jaringan data.

## 5. Request For Change (RFC) Rule
**Strategy Freeze:** Tidak boleh ada perubahan pada Vision, Mission, Positioning, Terminology, ataupun Product Architecture di dokumen mana pun tanpa pengajuan RFC resmi. Keseragaman bahasa adalah fondasi dari infrastruktur yang kokoh.
