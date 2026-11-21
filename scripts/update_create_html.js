const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/create.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Ensure draft-store.js is included in head
if (!content.includes('/js/draft-store.js')) {
  content = content.replace(
    '<script src="/js/pricing.js"></script>',
    '<script src="/js/pricing.js"></script>\n  <script src="/js/draft-store.js"></script>'
  );
}

// 2. Replace Stepper Indicator and add Step 1 & Step 2 Cards before #formCard
const stepperTargetStart = '<!-- Stepper Indicator';
const stepperTargetEnd = '<div id="formCard" class="card">';

const newStepperAndCards = `<!-- 3-Step Progress Header (Deliverable C2) -->
    <div id="createStepper" class="stepper-wrap" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; background:var(--surface); border:1px solid var(--line-300); padding:16px 20px; border-radius:var(--radius-card); box-shadow:var(--shadow-soft); overflow-x:auto;">
      <div id="stepItem1" class="stepper-item" style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
        <div id="stepNum1" style="width:26px; height:26px; border-radius:50%; background:var(--terra-600); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">1</div>
        <span id="stepLabel1" style="font-size:12.5px; font-weight:700; color:var(--ink-900);" data-i18n="dealCreate.stepperStep1">1. Akun &amp; Verifikasi Email</span>
      </div>
      <div style="height:1px; flex:1; min-width:16px; background:var(--line-300); margin:0 8px;"></div>
      <div id="stepItem2" class="stepper-item" style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
        <div id="stepNum2" style="width:26px; height:26px; border-radius:50%; background:var(--sand-50); border:1px solid var(--line-300); color:var(--ink-700); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">2</div>
        <span id="stepLabel2" style="font-size:12.5px; color:var(--ink-700);" data-i18n="dealCreate.stepperStep2">2. Profil &amp; Identitas Penjual</span>
      </div>
      <div style="height:1px; flex:1; min-width:16px; background:var(--line-300); margin:0 8px;"></div>
      <div id="stepItem3" class="stepper-item" style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
        <div id="stepNum3" style="width:26px; height:26px; border-radius:50%; background:var(--sand-50); border:1px solid var(--line-300); color:var(--ink-700); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">3</div>
        <span id="stepLabel3" style="font-size:12.5px; color:var(--ink-700);" data-i18n="dealCreate.stepperStep3">3. Detail Tiket &amp; Bukti (Tahap A — Tanpa QR)</span>
      </div>
    </div>

    <!-- Step 1 Gating Card (Unauthenticated or Email Unverified) -->
    <div id="step1Card" class="card" style="display:none; padding:28px 24px; margin-bottom:24px;">
      <!-- Unauthenticated View -->
      <div id="step1UnauthView" style="display:none; text-align:center; padding:16px 8px;">
        <div style="width:52px; height:52px; border-radius:50%; background:var(--sand-100); border:1px solid var(--line-300); display:flex; align-items:center; justify-content:center; font-size:22px; color:var(--terra-600); margin:0 auto 16px;">
          <i class="fa-solid fa-user-lock"></i>
        </div>
        <h2 style="font-size:20px; font-weight:800; margin-bottom:8px; color:var(--ink-900);">Masuk atau Buat Akun Penjual</h2>
        <p style="font-size:14px; color:var(--text-muted); max-width:480px; margin:0 auto 24px; line-height:1.5;">
          Untuk menjaga keamanan transaksi sekunder dan perlindungan anti-penipuan, Anda wajib memiliki akun Tikum terverifikasi sebelum dapat membuat listing tiket.
        </p>
        <a href="/login?role=seller&next=/deal/create" class="btn btn-primary" style="background-color:var(--terra-600); color:#fff; border:none; text-decoration:none; padding:12px 28px; font-size:14px; font-weight:700; display:inline-flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-right-to-bracket"></i> Masuk / Daftar Akun Penjual
        </a>
      </div>

      <!-- Email Unverified View -->
      <div id="step1UnverifiedView" style="display:none;">
        <div class="notice-box notice-warning" style="margin-bottom:16px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:22px;"></i>
          <div style="flex:1;">
            <strong style="font-size:14px; display:block; margin-bottom:4px;">Verifikasi Email Diperlukan</strong>
            <p style="font-size:13px; line-height:1.5; margin:0 0 10px 0;">
              Tautan verifikasi telah dikirimkan ke email Anda (<span id="step1EmailText" class="mono" style="font-weight:700;">-</span>). Sesuai kebijakan keamanan Tikum, verifikasi email wajib diselesaikan sebelum Anda dapat menjual tiket.
            </p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <button type="button" id="btnStep1Resend" class="btn btn-secondary btn-sm" onclick="handleStep1ResendVerification()">
                <i class="fa-solid fa-paper-plane"></i> Kirim Ulang Tautan Verifikasi
              </button>
              <span id="step1ResendCountdown" style="font-size:12px; color:var(--text-muted); display:none;"></span>
            </div>
            <div id="step1ResendFeedback" style="font-size:12px; margin-top:8px; display:none;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2 Gating Card (Seller Identity & Payout Profile Form) -->
    <div id="step2Card" class="card" style="display:none; padding:28px 24px; margin-bottom:24px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <div style="width:44px; height:44px; border-radius:50%; background:var(--sand-100); border:1px solid var(--line-300); display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--terra-600);">
          <i class="fa-solid fa-id-card"></i>
        </div>
        <div>
          <h2 style="font-size:18px; font-weight:800; color:var(--ink-900); margin:0;">Lengkapi Profil &amp; Rekening Penjual Sekali Saja</h2>
          <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">Verifikasi Once, Auto-Fill Forever. Data ini disimpan aman sesuai UU PDP No. 27/2022.</div>
        </div>
      </div>

      <p style="font-size:12.5px; color:var(--ink-700); line-height:1.6; margin-bottom:18px; background:var(--sand-50); padding:12px 14px; border-radius:var(--radius-card); border:1px solid var(--line-300);">
        <i class="fa-solid fa-shield-halved" style="color:var(--terra-600);"></i>
        Data identitas dan rekening bank diperlukan untuk verifikasi keaslian kepemilikan tiket dan pencairan dana hasil penjualan tiket Anda. Cukup isi satu kali, formulir listing berikutnya akan langsung terisi otomatis.
      </p>

      <form id="step2ProfileForm" onsubmit="handleSaveStep2Profile(event)">
        <div class="grid-2" style="margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="step2FullName" style="font-size:12px; font-weight:600; color:var(--ink-900);">Nama Lengkap Sesuai KTP *</label>
            <input type="text" id="step2FullName" class="form-control" placeholder="Nama lengkap sesuai identitas resmi" required>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label for="step2Whatsapp" style="font-size:12px; font-weight:600; color:var(--ink-900);">Nomor WhatsApp Aktif *</label>
            <input type="tel" id="step2Whatsapp" class="form-control" placeholder="0812xxxxxxxx" required>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label for="step2City" style="font-size:12px; font-weight:600; color:var(--ink-900);">Kota Domisili *</label>
            <input type="text" id="step2City" class="form-control" placeholder="Contoh: Jakarta Selatan" required>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label for="step2Address" style="font-size:12px; font-weight:600; color:var(--ink-900);">Alamat Lengkap</label>
            <input type="text" id="step2Address" class="form-control" placeholder="Alamat domisili">
          </div>
        </div>

        <div style="padding-top:14px; border-top:1px solid var(--line-300); margin-top:16px;">
          <h4 style="font-size:14px; font-weight:700; color:var(--ink-900); margin-bottom:10px;">
            <i class="fa-solid fa-building-columns" style="color:var(--terra-600);"></i> Rekening Bank Pencairan Dana (Payout)
          </h4>
          <div class="grid-2" style="margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="step2BankName" style="font-size:12px; font-weight:600; color:var(--ink-900);">Bank Pencairan *</label>
              <select id="step2BankName" class="form-control" required>
                <option value="">-- Pilih Bank Pencairan --</option>
                <option value="BCA">BCA (Bank Central Asia)</option>
                <option value="MANDIRI">Bank Mandiri</option>
                <option value="BNI">BNI (Bank Negara Indonesia)</option>
                <option value="BRI">BRI (Bank Rakyat Indonesia)</option>
                <option value="PERMATA">Bank Permata</option>
                <option value="CIMB">CIMB Niaga</option>
                <option value="BSI">BSI (Bank Syariah Indonesia)</option>
                <option value="JAGO">Bank Jago</option>
                <option value="SEABANK">SeaBank</option>
                <option value="LAINNYA">Bank Lainnya</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="step2AccountHolder" style="font-size:12px; font-weight:600; color:var(--ink-900);">Nama Pemilik Rekening *</label>
              <input type="text" id="step2AccountHolder" class="form-control" placeholder="Nama pemilik rekening bank" required>
            </div>
          </div>

          <div class="grid-2" style="margin-bottom:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label for="step2AccountNumber" style="font-size:12px; font-weight:600; color:var(--ink-900);">Nomor Rekening Bank *</label>
              <input type="text" id="step2AccountNumber" class="form-control mono" placeholder="Contoh: 1234567890" required>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label for="step2NikLast4" style="font-size:12px; font-weight:600; color:var(--ink-900);">4 Digit Terakhir NIK KTP *</label>
              <input type="text" id="step2NikLast4" class="form-control mono" maxlength="4" pattern="[0-9]{4}" placeholder="Contoh: 4821" required>
            </div>
          </div>
        </div>

        <div style="margin-top:10px; display:flex; align-items:flex-start; gap:8px;">
          <input type="checkbox" id="step2PdpConsent" required checked style="accent-color:var(--terra-600); width:16px; height:16px; margin-top:2px;">
          <label for="step2PdpConsent" style="font-size:12px; color:var(--ink-700); cursor:pointer;">
            Saya menyatakan data di atas adalah benar untuk verifikasi kepemilikan tiket dan persetujuan pencairan sesuai UU PDP No. 27/2022.
          </label>
        </div>

        <div id="step2FeedbackMsg" class="notice-box notice-warning" style="display:none; margin-top:14px;"></div>

        <div style="margin-top:16px;">
          <button type="submit" id="btnSubmitStep2" class="btn btn-primary" style="background-color:var(--terra-600); color:#fff; border:none; padding:12px 24px; font-size:14px; font-weight:700;">
            <i class="fa-solid fa-arrow-right"></i> Simpan Profil &amp; Lanjutkan ke Detail Tiket
          </button>
        </div>
      </form>
    </div>

    <!-- Step 3: Main Creation Form Card -->
    <div id="formCard" class="card" style="display:none;">`;

const idxStepperStart = content.indexOf(stepperTargetStart);
const idxFormCard = content.indexOf(stepperTargetEnd);

if (idxStepperStart !== -1 && idxFormCard !== -1) {
  content = content.substring(0, idxStepperStart) + newStepperAndCards + content.substring(idxFormCard + stepperTargetEnd.length);
}

// 3. Inside formCard, add Verified Seller Banner and Draft Restored Notice at the top of <form id="listingForm" ...>
const formStartTag = '<form id="listingForm" onsubmit="handleCreateListing(event)">';
const bannersHtml = `<form id="listingForm" onsubmit="handleCreateListing(event)">
        
        <!-- Verified Seller Auto-Fill Banner -->
        <div id="sellerAutoFillBanner" class="notice-box notice-info" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:20px; background:rgba(16, 185, 129, 0.08); border-color:#10B981;">
          <div style="display:flex; align-items:center; gap:10px;">
            <i class="fa-solid fa-circle-check" style="color:#10B981; font-size:18px;"></i>
            <div>
              <strong style="color:#10B981; font-size:13px;" data-i18n="dealCreate.autofillNotice">Profil Penjual Terisi Otomatis ✓</strong>
              <div id="sellerAutoFillDetails" style="font-size:12px; color:var(--text-muted); margin-top:2px;">-</div>
            </div>
          </div>
          <a href="/profile" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 10px; text-decoration:none;">
            <i class="fa-solid fa-user-pen"></i> Ubah di Profil
          </a>
        </div>

        <!-- Draft Restored Banner -->
        <div id="draftRestoredBanner" class="notice-box notice-warning" style="display:none; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-clock-rotate-left" style="color:#f59e0b;"></i>
            <span style="font-size:12.5px;">Draf isian tiket sebelumnya berhasil dipulihkan secara otomatis.</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="clearSavedDraft()" style="font-size:11px; padding:4px 8px;">
            <i class="fa-solid fa-trash-can"></i> Hapus Draf
          </button>
        </div>`;

content = content.replace(formStartTag, bannersHtml);

// 4. Update Section 3 (Stage A Zero-QR) and remove duplicate Section 4
const section3Start = '<!-- Section 3: Anti-Duplicate Security -->';
const submitBtnMarker = '<!-- Submit Button & Real Server Feedback -->';

const idxSec3 = content.indexOf(section3Start);
const idxSubmit = content.indexOf(submitBtnMarker);

const newSection3Html = `<!-- Section 3: Anti-Duplicate Security (Tahap A — Zero-QR) -->
        <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">
          <div style="font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px;">
            <span data-i18n="create.wizardStep3">3. Bukti Kepemilikan Tiket (Tahap A — Tanpa QR)</span>
          </div>

          <div class="notice-box notice-info" style="margin-bottom: 16px; background: rgba(56, 189, 248, 0.08); border-color: rgba(56, 189, 248, 0.3);">
            <i class="fa-solid fa-qrcode" style="color: var(--cyan); font-size: 20px;"></i>
            <div>
              <strong style="color: #38bdf8;">Tahap A — Tanpa QR Code Asli:</strong>
              <p style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted);">
                Untuk mencegah duplikasi atau penyalahgunaan tiket, Anda <strong>TIDAK</strong> diminta mengunggah QR Code atau Barcode asli saat membuat penawaran. Anda hanya perlu mengunggah bukti pembelian resmi promotor (PDF/tangkapan layar e-voucher) untuk ditinjau oleh tim kurasi Tikum. QR code asli baru diserahkan pada Tahap B setelah pesanan dibayar.
              </p>
            </div>
          </div>

          <div class="form-group">
            <label for="evidenceFile" data-i18n="create.evidenceLabel">Bukti Pembelian Resmi Promotor / E-Voucher PDF *</label>
            <input type="file" id="evidenceFile" class="form-control" accept=".pdf,.png,.jpg,.jpeg">
            <span style="font-size: 11px; color: var(--text-dim);" data-i18n="create.evidenceSub">Dokumen dienkripsi AES-256 (UU PDP No. 27/2022)</span>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label for="admissionProtocol" data-i18n="create.protocolLabel">Metode Masuk Venue (Protokol Masuk)</label>
              <select id="admissionProtocol" class="form-control">
                <option value="QR_SCAN_ONLY" data-i18n="create.protocolQr">Pemindaian QR / E-Voucher Digital</option>
                <option value="WRISTBAND_PICKUP" data-i18n="create.protocolWristband">Penukaran Wristband / Gelang Fisik</option>
                <option value="IDENTITY_CHECK" data-i18n="create.protocolIdentity">Pemeriksaan Identitas NIK + E-Tiket</option>
                <option value="GATE_ESCORT" data-i18n="create.protocolEscort">Pendampingan Langsung oleh PIC di Gerbang</option>
              </select>
            </div>

            <div class="form-group">
              <label for="barcode" data-i18n="create.barcodeLabel">Nomor Serial / Barcode Unik (Opsional di Tahap A)</label>
              <input 
                type="text" 
                id="barcode" 
                class="form-control mono" 
                placeholder="Nomor serial bukti (opsional)" data-i18n-placeholder="create.barcodePlaceholder"
              >
              <span style="font-size: 11px; color: var(--text-dim);">
                <i class="fa-solid fa-lock"></i> <span data-i18n="create.barcodeSub">Akan di-hash dengan kriptografi SHA-256 pada server untuk perlindungan anti-duplikasi.</span>
              </span>
            </div>
          </div>

          <div style="margin-top:12px; display:flex; align-items:flex-start; gap:8px;">
            <input type="checkbox" id="pdpConsent" required checked style="accent-color:var(--terra-600); width:16px; height:16px; margin-top:2px;">
            <label for="pdpConsent" style="font-size:12px; color:var(--ink-700); cursor:pointer;" data-i18n="create.pdpConsent">
              Saya menyetujui pemrosesan data identitas untuk verifikasi keabsahan tiket sesuai UU Perlindungan Data Pribadi (UU PDP No. 27/2022).
            </label>
          </div>
        </div>\n\n        `;

if (idxSec3 !== -1 && idxSubmit !== -1) {
  content = content.substring(0, idxSec3) + newSection3Html + content.substring(idxSubmit);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated HTML structure in public/create.html');
