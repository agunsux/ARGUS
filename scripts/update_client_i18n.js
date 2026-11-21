const fs = require('fs');
let code = fs.readFileSync('public/js/i18n.js', 'utf8');

// ID dealCreate
const idDcTarget = '"mode2Notice": "Pembayaran pokok tiket dilakukan langsung antar pihak; TIKUM memproses biaya layanan platform."';
const idDcReplacement = idDcTarget + ',\n      "stepperStep1": "1. Akun & Verifikasi Email",\n      "stepperStep2": "2. Profil & Identitas Penjual",\n      "stepperStep3": "3. Detail Tiket & Bukti (Tahap A — Tanpa QR)",\n      "autofillNotice": "Profil Penjual Terisi Otomatis"';

// EN dealCreate
const enDcTarget = '"mode2Notice": "Ticket principal is settled directly between parties; TIKUM processes only the platform service fee."';
const enDcReplacement = enDcTarget + ',\n      "stepperStep1": "1. Account & Email Verification",\n      "stepperStep2": "2. Seller Identity & Payout Profile",\n      "stepperStep3": "3. Ticket Details & Evidence (Stage A — Zero QR)",\n      "autofillNotice": "Seller Profile Auto-Filled"';

// ID errors
const idErrTarget = '"orderExpired": "Batas waktu pembayaran pesanan telah habis (TTL kedaluwarsa)."';
const idErrReplacement = idErrTarget + ',\n      "emailVerificationRequired": "Verifikasi email wajib diselesaikan sebelum melakukan transaksi ini.",\n      "sellerProfileIncomplete": "Profil penjual dan rekening pencairan wajib dilengkapi sebelum membuat listing.",\n      "selfPurchaseForbidden": "Penjual dilarang membeli listing tiket miliknya sendiri.",\n      "invalidRelationalReference": "Referensi relasional database tidak valid atau belum tersimpan."';

// EN errors
const enErrTarget = '"orderExpired": "Payment window has expired (TTL elapsed)."';
const enErrReplacement = enErrTarget + ',\n      "emailVerificationRequired": "Email verification is required before proceeding with this transaction.",\n      "sellerProfileIncomplete": "Seller profile and payout bank details must be completed before creating a listing.",\n      "selfPurchaseForbidden": "Sellers are forbidden from purchasing tickets from their own listing.",\n      "invalidRelationalReference": "Relational database reference is invalid or unpersisted."';

const idProfile = ',\n    "profile": {\n      "pageTitle": "Profil & Keamanan Akun",\n      "pageSubtitle": "Kelola identitas, verifikasi email, dan data rekening pencairan dana tiket.",\n      "emailVerification": "Verifikasi Email",\n      "emailVerified": "Email Terverifikasi",\n      "emailUnverified": "Email Belum Terverifikasi",\n      "resendVerification": "Kirim Ulang Email Verifikasi",\n      "verificationSent": "Tautan verifikasi telah dikirim ke email Anda.",\n      "cooldownNotice": "Tunggu sebelum mengirim ulang.",\n      "personalInfo": "Informasi Pribadi & Kontak",\n      "fullName": "Nama Lengkap Sesuai Identitas",\n      "whatsapp": "Nomor WhatsApp Aktif",\n      "cityOrAddress": "Kota / Alamat Lengkap",\n      "sellerPayout": "Data Rekening Pencairan Penjual",\n      "bankName": "Nama Bank Pencairan",\n      "bankAccountNumber": "Nomor Rekening Bank",\n      "bankAccountHolder": "Nama Pemilik Rekening",\n      "identityDocRef": "Referensi Dokumen Identitas (KTP)",\n      "saveBtn": "Simpan Profil",\n      "saving": "Menyimpan...",\n      "savedSuccess": "Profil berhasil diperbarui.",\n      "autofillBadge": "Profil Terverifikasi & Terisi Otomatis",\n      "buyerProportionalNote": "Untuk pembeli, kami hanya memerlukan kontak dasar (Nama, WhatsApp, dan Kota) sesuai prinsip minimisasi data UU PDP No. 27/2022.",\n      "sellerCompleteBadge": "Profil Penjual Lengkap"\n    }';

const enProfile = ',\n    "profile": {\n      "pageTitle": "Profile & Account Security",\n      "pageSubtitle": "Manage your identity, email verification, and ticket payout bank details.",\n      "emailVerification": "Email Verification",\n      "emailVerified": "Email Verified",\n      "emailUnverified": "Email Unverified",\n      "resendVerification": "Resend Verification Email",\n      "verificationSent": "Verification link has been sent to your email.",\n      "cooldownNotice": "Please wait before resending.",\n      "personalInfo": "Personal Info & Contact",\n      "fullName": "Full Name per Legal ID",\n      "whatsapp": "Active WhatsApp Number",\n      "cityOrAddress": "City / Full Address",\n      "sellerPayout": "Seller Payout Bank Details",\n      "bankName": "Payout Bank Name",\n      "bankAccountNumber": "Bank Account Number",\n      "bankAccountHolder": "Account Holder Name",\n      "identityDocRef": "Identity Document Reference (KTP)",\n      "saveBtn": "Save Profile",\n      "saving": "Saving...",\n      "savedSuccess": "Profile successfully updated.",\n      "autofillBadge": "Profile Verified & Auto-Filled",\n      "buyerProportionalNote": "For buyers, only minimal contact details (Name, WhatsApp, and City) are required per PDP Law No. 27/2022 data minimization.",\n      "sellerCompleteBadge": "Seller Profile Complete"\n    }';

code = code.replace(idDcTarget, idDcReplacement);
code = code.replace(enDcTarget, enDcReplacement);
code = code.replace(idErrTarget, idErrReplacement + idProfile);
code = code.replace(enErrTarget, enErrReplacement + enProfile);

fs.writeFileSync('public/js/i18n.js', code, 'utf8');
console.log('Successfully updated public/js/i18n.js');
