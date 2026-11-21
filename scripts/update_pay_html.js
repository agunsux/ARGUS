const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/pay.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add buyerProfileCompletionBox inside authBuyerCard
const targetAuthBuyer = '</div>\n            <span class="badge badge-success"><i class="fa-solid fa-user-check"></i> Sesi Aktif</span>\n          </div>\n        </div>';
const replacementAuthBuyer = `</div>
            <span class="badge badge-success"><i class="fa-solid fa-user-check"></i> Sesi Aktif</span>
          </div>

          <!-- Inline Buyer Profile Completion (Proportional UU PDP) -->
          <div id="buyerProfileCompletionBox" class="notice-box notice-info" style="display:none; margin-top:12px;">
            <i class="fa-solid fa-id-card"></i>
            <div style="flex:1;">
              <strong style="font-size:13px; display:block; margin-bottom:4px;">Lengkapi Data Kontak Pembeli (Sekali Saja):</strong>
              <p style="font-size:12px; margin:0 0 10px 0; color:var(--text-muted); line-height:1.5;">
                Sesuai prinsip minimisasi data UU PDP No. 27/2022, pembeli hanya perlu mengisi nama lengkap dan WhatsApp untuk koordinasi tiket.
              </p>
              <div class="grid-2" style="margin-bottom:8px;">
                <input type="text" id="inlineBuyerName" class="form-control" placeholder="Nama Lengkap">
                <input type="tel" id="inlineBuyerWa" class="form-control" placeholder="Nomor WhatsApp">
              </div>
              <button type="button" id="btnSaveInlineBuyer" class="btn btn-secondary btn-sm" onclick="saveInlineBuyerProfile()">
                <i class="fa-solid fa-check"></i> Simpan &amp; Lanjutkan Checkout
              </button>
              <div id="inlineBuyerFeedback" style="font-size:12px; margin-top:6px; display:none;"></div>
            </div>
          </div>
        </div>`;

content = content.replace(targetAuthBuyer, replacementAuthBuyer);

// 2. Add selfPurchaseNotice above orderErrorMsg
const targetOrderErr = '<div id="orderErrorMsg" class="notice-box notice-warning" style="display: none;"></div>';
const replacementOrderErr = `<div id="selfPurchaseNotice" class="notice-box notice-warning" style="display:none; background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; margin-bottom:14px;">
          <i class="fa-solid fa-ban" style="color:#e11d48; font-size:20px;"></i>
          <div>
            <strong>Self-Purchase Dilarang:</strong> Anda teridentifikasi sebagai pemilik dari tiket listing ini. Sesuai aturan integritas Tikum, penjual dilarang membeli tiket dari listing miliknya sendiri.
          </div>
        </div>

        <div id="orderErrorMsg" class="notice-box notice-warning" style="display: none;"></div>`;

content = content.replace(targetOrderErr, replacementOrderErr);

// 3. Update checkBuyerSession and related JS
const jsTargetStart = 'let currentBuyer = null;';
const jsTargetEnd = 'async function ensureSnapScript(config) {';

const idxJsStart = content.indexOf(jsTargetStart);
const idxJsEnd = content.indexOf(jsTargetEnd);

if (idxJsStart === -1 || idxJsEnd === -1) {
  console.error('Could not find JS markers in pay.html');
  process.exit(1);
}

const newPayJs = `let currentBuyer = null;

    async function checkBuyerSession() {
      try {
        const res = await fetch('/api/auth/me/profile');
        if (res.ok) {
          const data = await res.json();
          const p = data.profile || data.user;
          if (p) {
            currentBuyer = p;
            const authCard = document.getElementById('authBuyerCard');
            const authName = document.getElementById('authBuyerName');
            const authMeta = document.getElementById('authBuyerMeta');
            const pilotContainer = document.getElementById('pilotSelectContainer');
            const unauthNotice = document.getElementById('unauthBuyerNotice');
            const profileBox = document.getElementById('buyerProfileCompletionBox');

            if (authName) authName.innerText = p.full_name || p.name || p.email || p.id;
            if (authMeta) {
              const waText = p.whatsapp || p.phone ? '• ' + (p.whatsapp || p.phone) : '';
              authMeta.innerHTML = \`\${escapeHtml(p.email || '')} \${escapeHtml(waText)} <span class="badge badge-success" style="font-size:10px; margin-left:6px;"><i class="fa-solid fa-check"></i> Profil Terisi Otomatis ✓</span>\`;
            }
            if (authCard) authCard.style.display = 'block';
            if (unauthNotice) unauthNotice.style.display = 'none';
            if (pilotContainer) pilotContainer.style.display = 'none';

            // Check proportional buyer profile completeness
            if (!p.buyer_profile_complete && profileBox) {
              profileBox.style.display = 'flex';
              if (document.getElementById('inlineBuyerName')) document.getElementById('inlineBuyerName').value = p.full_name || '';
              if (document.getElementById('inlineBuyerWa')) document.getElementById('inlineBuyerWa').value = p.whatsapp || '';
            } else if (profileBox) {
              profileBox.style.display = 'none';
            }

            // Self-Purchase Check
            checkSelfPurchaseGuard();
            return;
          }
        }
      } catch (_) {}

      // Fallback to unauthenticated state
      currentBuyer = null;
      const unauthNotice = document.getElementById('unauthBuyerNotice');
      const pilotContainer = document.getElementById('pilotSelectContainer');
      const loginLink = document.getElementById('loginRedirectLink');
      if (unauthNotice) unauthNotice.style.display = 'flex';
      if (pilotContainer) pilotContainer.style.display = 'block';
      if (loginLink) loginLink.href = \`/login?role=buyer&next=\${encodeURIComponent(window.location.pathname + window.location.search)}\`;
    }

    function checkSelfPurchaseGuard() {
      if (!currentBuyer || !currentListing) return;
      if (currentListing.seller_id && currentBuyer.id === currentListing.seller_id) {
        const btn = document.getElementById('btnOrderSubmit');
        const selfNotice = document.getElementById('selfPurchaseNotice');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-ban"></i> Pembelian Sendiri Dilarang';
          btn.style.opacity = '0.6';
          btn.style.cursor = 'not-allowed';
        }
        if (selfNotice) selfNotice.style.display = 'flex';
      }
    }

    async function saveInlineBuyerProfile() {
      const name = (document.getElementById('inlineBuyerName')?.value || '').trim();
      const wa = (document.getElementById('inlineBuyerWa')?.value || '').trim();
      const fb = document.getElementById('inlineBuyerFeedback');
      const btn = document.getElementById('btnSaveInlineBuyer');

      if (!name || !wa) {
        if (fb) {
          fb.style.display = 'block';
          fb.style.color = '#f87171';
          fb.innerText = 'Nama lengkap dan nomor WhatsApp wajib diisi.';
        }
        return;
      }

      if (btn) btn.disabled = true;
      if (fb) {
        fb.style.display = 'block';
        fb.style.color = 'var(--text-muted)';
        fb.innerText = 'Menyimpan profil...';
      }

      try {
        const res = await fetch('/api/auth/me/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ full_name: name, whatsapp: wa })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Gagal menyimpan profil pembeli');
        }
        if (fb) {
          fb.style.color = '#10b981';
          fb.innerText = 'Profil pembeli berhasil disimpan!';
        }
        await checkBuyerSession();
      } catch (err) {
        if (fb) {
          fb.style.color = '#f87171';
          fb.innerText = err.message;
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    `;

content = content.substring(0, idxJsStart) + newPayJs + content.substring(idxJsEnd);

// Also add checkSelfPurchaseGuard inside renderListing right after currentListing is set
const renderListingStart = 'function renderListing(listing) {';
content = content.replace(
  renderListingStart,
  'function renderListing(listing) {\n      setTimeout(checkSelfPurchaseGuard, 50);'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated public/pay.html');
