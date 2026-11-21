const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/create.html');
let content = fs.readFileSync(filePath, 'utf8');

const jsStart = 'function saveListingDraft() {';
const jsEnd = '// Initialize';

const idxStart = content.indexOf(jsStart);
const idxEnd = content.indexOf(jsEnd);

if (idxStart === -1 || idxEnd === -1) {
  console.error('Could not find JS markers in create.html');
  process.exit(1);
}

const newJs = `function saveFormDraft() {
      if (!window.TikumDraftStore) return;
      const draft = {
        eventId: document.getElementById('eventSelect')?.value || '',
        quantity: document.getElementById('ticketQuantity')?.value || '1',
        seatType: document.getElementById('seatType')?.value || 'GENERAL_ADMISSION',
        seatInfo: document.getElementById('seatInfo')?.value || '',
        faceValue: document.getElementById('faceValue')?.value || '',
        sellingPrice: document.getElementById('sellingPrice')?.value || '',
        fulfillmentType: document.querySelector('input[name="fulfillmentType"]:checked')?.value || 'TIKUM_VENUE_PIC',
        admissionProtocol: document.getElementById('admissionProtocol')?.value || 'QR_SCAN_ONLY'
      };
      window.TikumDraftStore.saveDraft('seller_listing_create', draft);
    }

    function restoreFormDraft() {
      if (!window.TikumDraftStore) return;
      const draft = window.TikumDraftStore.getDraft('seller_listing_create');
      if (!draft) return;

      let restored = false;
      if (draft.eventId && document.getElementById('eventSelect')) {
        document.getElementById('eventSelect').value = draft.eventId;
        handleEventSelected();
        restored = true;
      }
      if (draft.quantity && document.getElementById('ticketQuantity')) {
        document.getElementById('ticketQuantity').value = draft.quantity;
        restored = true;
      }
      if (draft.seatType && document.getElementById('seatType')) {
        document.getElementById('seatType').value = draft.seatType;
        restored = true;
      }
      if (draft.seatInfo && document.getElementById('seatInfo')) {
        document.getElementById('seatInfo').value = draft.seatInfo;
        restored = true;
      }
      if (draft.faceValue && document.getElementById('faceValue')) {
        document.getElementById('faceValue').value = draft.faceValue;
        restored = true;
      }
      if (draft.sellingPrice && document.getElementById('sellingPrice')) {
        document.getElementById('sellingPrice').value = draft.sellingPrice;
        restored = true;
      }
      if (draft.admissionProtocol && document.getElementById('admissionProtocol')) {
        document.getElementById('admissionProtocol').value = draft.admissionProtocol;
      }
      if (draft.fulfillmentType) {
        const radio = document.querySelector(\`input[name="fulfillmentType"][value="\${draft.fulfillmentType}"]\`);
        if (radio) radio.checked = true;
      }

      calculateFeePreview();
      const banner = document.getElementById('draftRestoredBanner');
      if (banner && restored) {
        banner.style.display = 'flex';
      }
    }

    function clearSavedDraft() {
      if (window.TikumDraftStore) {
        window.TikumDraftStore.clearDraft('seller_listing_create');
      }
      const banner = document.getElementById('draftRestoredBanner');
      if (banner) banner.style.display = 'none';
    }

    let currentSellerSession = null;
    let step1ResendCooldown = 0;
    let step1ResendTimer = null;

    function setStep(stepNum, status, profile) {
      const stepNum1 = document.getElementById('stepNum1');
      const stepNum2 = document.getElementById('stepNum2');
      const stepNum3 = document.getElementById('stepNum3');
      const stepLabel1 = document.getElementById('stepLabel1');
      const stepLabel2 = document.getElementById('stepLabel2');
      const stepLabel3 = document.getElementById('stepLabel3');

      const step1Card = document.getElementById('step1Card');
      const step1UnauthView = document.getElementById('step1UnauthView');
      const step1UnverifiedView = document.getElementById('step1UnverifiedView');
      const step2Card = document.getElementById('step2Card');
      const formCard = document.getElementById('formCard');

      // Reset
      [stepNum1, stepNum2, stepNum3].forEach(el => {
        if (el) {
          el.style.background = 'var(--sand-50)';
          el.style.color = 'var(--ink-700)';
          el.style.border = '1px solid var(--line-300)';
        }
      });
      [stepLabel1, stepLabel2, stepLabel3].forEach(el => {
        if (el) el.style.color = 'var(--ink-700)';
      });

      if (stepNum === 1) {
        if (stepNum1) {
          stepNum1.style.background = 'var(--terra-600)';
          stepNum1.style.color = '#fff';
          stepNum1.innerText = '1';
        }
        if (stepLabel1) stepLabel1.style.color = 'var(--ink-900)';

        if (step1Card) step1Card.style.display = 'block';
        if (step2Card) step2Card.style.display = 'none';
        if (formCard) formCard.style.display = 'none';

        if (status === 'UNAUTHENTICATED') {
          if (step1UnauthView) step1UnauthView.style.display = 'block';
          if (step1UnverifiedView) step1UnverifiedView.style.display = 'none';
        } else {
          if (step1UnauthView) step1UnauthView.style.display = 'none';
          if (step1UnverifiedView) step1UnverifiedView.style.display = 'block';
          if (document.getElementById('step1EmailText') && profile) {
            document.getElementById('step1EmailText').innerText = profile.email || '';
          }
        }
      } else if (stepNum === 2) {
        if (stepNum1) {
          stepNum1.style.background = '#10b981';
          stepNum1.style.color = '#fff';
          stepNum1.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
        if (stepNum2) {
          stepNum2.style.background = 'var(--terra-600)';
          stepNum2.style.color = '#fff';
          stepNum2.innerText = '2';
        }
        if (stepLabel2) stepLabel2.style.color = 'var(--ink-900)';

        if (step1Card) step1Card.style.display = 'none';
        if (step2Card) step2Card.style.display = 'block';
        if (formCard) formCard.style.display = 'none';

        if (profile) {
          if (document.getElementById('step2FullName') && !document.getElementById('step2FullName').value) {
            document.getElementById('step2FullName').value = profile.full_name || '';
          }
          if (document.getElementById('step2Whatsapp') && !document.getElementById('step2Whatsapp').value) {
            document.getElementById('step2Whatsapp').value = profile.whatsapp || '';
          }
          if (document.getElementById('step2City') && !document.getElementById('step2City').value) {
            document.getElementById('step2City').value = profile.city || '';
          }
          if (document.getElementById('step2Address') && !document.getElementById('step2Address').value) {
            document.getElementById('step2Address').value = profile.address || '';
          }
          if (document.getElementById('step2AccountHolder') && !document.getElementById('step2AccountHolder').value) {
            document.getElementById('step2AccountHolder').value = profile.payout_account_holder || profile.full_name || '';
          }
        }
      } else if (stepNum === 3) {
        if (stepNum1) {
          stepNum1.style.background = '#10b981';
          stepNum1.style.color = '#fff';
          stepNum1.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
        if (stepNum2) {
          stepNum2.style.background = '#10b981';
          stepNum2.style.color = '#fff';
          stepNum2.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
        if (stepNum3) {
          stepNum3.style.background = 'var(--terra-600)';
          stepNum3.style.color = '#fff';
          stepNum3.innerText = '3';
        }
        if (stepLabel3) stepLabel3.style.color = 'var(--ink-900)';

        if (step1Card) step1Card.style.display = 'none';
        if (step2Card) step2Card.style.display = 'none';
        if (formCard) formCard.style.display = 'block';

        if (profile) {
          const detailsEl = document.getElementById('sellerAutoFillDetails');
          if (detailsEl) {
            const bankStr = profile.payout_bank_name ? \`\${profile.payout_bank_name} \${profile.payout_account_number || ''}\` : 'Rekening Payout';
            detailsEl.innerText = \`\${profile.full_name || profile.email} • \${profile.whatsapp || '-'} • \${bankStr}\`;
          }
        }
        restoreFormDraft();
      }
    }

    async function initSellerSession() {
      try {
        const res = await fetch('/api/auth/me/profile', {
          credentials: 'same-origin'
        });

        if (res.status === 401) {
          currentSellerSession = null;
          setStep(1, 'UNAUTHENTICATED');
          return;
        }

        const data = await res.json().catch(() => ({}));
        const profile = data.profile;
        if (!res.ok || !profile) {
          setStep(1, 'UNAUTHENTICATED');
          return;
        }

        currentSellerSession = profile;

        if (!profile.email_verified) {
          setStep(1, 'EMAIL_UNVERIFIED', profile);
        } else if (!profile.seller_profile_complete) {
          setStep(2, 'SELLER_PROFILE_INCOMPLETE', profile);
        } else {
          setStep(3, 'COMPLETE', profile);
        }
      } catch (err) {
        setStep(1, 'UNAUTHENTICATED');
      }
    }

    async function handleStep1ResendVerification() {
      const btn = document.getElementById('btnStep1Resend');
      const countdown = document.getElementById('step1ResendCountdown');
      const fb = document.getElementById('step1ResendFeedback');

      if (step1ResendCooldown > 0) return;

      btn.disabled = true;
      fb.style.display = 'block';
      fb.style.color = 'var(--text-muted)';
      fb.innerText = 'Mengirim tautan verifikasi...';

      try {
        const res = await fetch('/api/auth/resend-verification', {
          method: 'POST',
          credentials: 'same-origin'
        });
        const data = await res.json();

        if (res.status === 429) {
          startStep1Cooldown(data.cooldown_remaining || 60);
          fb.style.color = '#f59e0b';
          fb.innerText = data.error || 'Harap tunggu sebelum meminta email baru.';
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Gagal mengirim email verifikasi');
        }

        fb.style.color = '#10b981';
        fb.innerText = data.message || 'Tautan verifikasi email berhasil dikirim!';
        startStep1Cooldown(data.cooldown_seconds || 60);

      } catch (err) {
        fb.style.color = '#f87171';
        fb.innerText = err.message;
        btn.disabled = false;
      }
    }

    function startStep1Cooldown(seconds) {
      step1ResendCooldown = seconds;
      const btn = document.getElementById('btnStep1Resend');
      const countdown = document.getElementById('step1ResendCountdown');

      btn.disabled = true;
      countdown.style.display = 'inline';

      if (step1ResendTimer) clearInterval(step1ResendTimer);
      step1ResendTimer = setInterval(() => {
        step1ResendCooldown--;
        countdown.innerText = \`(Kirim ulang dalam \${step1ResendCooldown}d)\`;
        if (step1ResendCooldown <= 0) {
          clearInterval(step1ResendTimer);
          btn.disabled = false;
          countdown.style.display = 'none';
        }
      }, 1000);
    }

    async function handleSaveStep2Profile(e) {
      e.preventDefault();
      const fb = document.getElementById('step2FeedbackMsg');
      const btn = document.getElementById('btnSubmitStep2');

      fb.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Profil...';

      const payload = {
        full_name: document.getElementById('step2FullName').value.trim(),
        whatsapp: document.getElementById('step2Whatsapp').value.trim(),
        city: document.getElementById('step2City').value.trim(),
        address: document.getElementById('step2Address').value.trim(),
        payout_bank_name: document.getElementById('step2BankName').value,
        payout_account_holder: document.getElementById('step2AccountHolder').value.trim(),
        payout_account_number: document.getElementById('step2AccountNumber').value.trim(),
        identity_doc_ref: document.getElementById('step2NikLast4').value.trim(),
        seller_profile_submit: true
      };

      try {
        const res = await fetch('/api/auth/me/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Gagal menyimpan profil penjual');
        }

        // Advance to Step 3
        await initSellerSession();

      } catch (err) {
        fb.style.display = 'block';
        fb.innerText = err.message;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Simpan Profil &amp; Lanjutkan ke Detail Tiket';
      }
    }

    // Attach draft autosave listeners
    document.addEventListener('DOMContentLoaded', () => {
      const form = document.getElementById('listingForm');
      if (form) {
        ['input', 'change'].forEach(evt => {
          form.addEventListener(evt, saveFormDraft);
        });
      }
    });

    async function handleCreateNewEvent(e) {
      e.preventDefault();
      const errEl = document.getElementById('newEventError');
      const btn = document.getElementById('btnSubmitNewEvent');
      errEl.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Event ke Server...';

      const payload = {
        name: document.getElementById('newEvName').value.trim(),
        artists: document.getElementById('newEvArtists').value.trim() || undefined,
        venue_name: document.getElementById('newEvVenue').value.trim(),
        venue_city: document.getElementById('newEvCity').value,
        start_date: document.getElementById('newEvStartDate').value,
        category: document.getElementById('newEvCategory').value,
        official_link: document.getElementById('newEvLink').value.trim() || undefined
      };

      try {
        const res = await fetch('/api/mvp/events', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Gagal membuat event baru');
        }

        eventsList.unshift(data.event);
        const select = document.getElementById('eventSelect');
        const opt = document.createElement('option');
        opt.value = data.event.id;
        opt.innerText = \`\${data.event.name} (\${data.event.venue_city}, \${data.event.start_date}) [⚠ KOMUNITAS]\`;
        select.prepend(opt);
        select.value = data.event.id;
        handleEventSelected();

        toggleNewEventDrawer(false);
        document.getElementById('newEventForm').reset();
        document.getElementById('formCard').scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        errEl.innerText = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Simpan Event Baru &amp; Lanjutkan Buat Listing';
      }
    }

    async function handleCreateListing(e) {
      e.preventDefault();
      const errEl = document.getElementById('formError');
      const btn = document.getElementById('btnSubmitListing');
      errEl.style.display = 'none';

      const eventId = document.getElementById('eventSelect').value;
      if (!eventId) {
        errEl.innerText = 'Pilih event terlebih dahulu.';
        errEl.style.display = 'block';
        return;
      }

      const sellingPrice = parseInt(document.getElementById('sellingPrice').value, 10);
      const faceValue = parseInt(document.getElementById('faceValue').value, 10);
      if (window.TikumPricing) {
        const val = window.TikumPricing.validateListingPrice(sellingPrice, faceValue);
        if (!val.valid) {
          errEl.innerText = val.error;
          errEl.style.display = 'block';
          return;
        }
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghubungi Server Tikum...';

      const quantity = parseInt(document.getElementById('ticketQuantity')?.value || 1, 10) || 1;
      const seatType = document.getElementById('seatType')?.value || 'GENERAL_ADMISSION';
      const fulfillmentType = document.querySelector('input[name="fulfillmentType"]:checked')?.value || 'SELLER_MANAGED';

      const barcodeVal = (document.getElementById('barcode')?.value || '').trim() || 'STAGE_A_ZERO_QR';

      const formData = new FormData();
      formData.append('eventId', eventId);
      formData.append('seatInfo', document.getElementById('seatInfo').value.trim());
      formData.append('quantity', quantity);
      formData.append('seatType', seatType);
      formData.append('fulfillmentType', fulfillmentType);
      formData.append('faceValue', faceValue);
      formData.append('price', sellingPrice);
      formData.append('sellingPrice', sellingPrice);
      formData.append('rawBarcode', barcodeVal);
      formData.append('barcode', barcodeVal);
      formData.append('admissionProtocol', document.getElementById('admissionProtocol')?.value || 'QR_SCAN_ONLY');

      const fileInput = document.getElementById('evidenceFile');
      if (fileInput && fileInput.files.length > 0) {
        formData.append('evidence', fileInput.files[0]);
      }

      try {
        const res = await fetch('/api/mvp/seller/listing', {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
        });

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login?role=seller&next=/deal/create';
            return;
          }
          throw new Error(data.message || data.error || 'Gagal membuat listing di server');
        }

        // Clear safe draft on success
        clearSavedDraft();

        // Show real response
        const listing = data.listing;
        document.getElementById('formCard').style.display = 'none';
        
        document.getElementById('resListingId').innerText = listing.id;
        document.getElementById('resListingStatus').innerText = listing.status;
        
        const selEvent = eventsList.find(ev => ev.id === listing.event_id);
        document.getElementById('resListingEvent').innerText = selEvent ? selEvent.name : listing.event_id;
        document.getElementById('resListingPrice').innerText = 'Rp ' + Number(listing.price || listing.selling_price || 0).toLocaleString('id-ID');

        if (listing.user_created_event) {
          document.getElementById('resUserEventWarning').style.display = 'flex';
        } else {
          document.getElementById('resUserEventWarning').style.display = 'none';
        }

        document.getElementById('btnViewPay').href = \`/pay/\${listing.id}\`;
        document.getElementById('btnViewTrack').href = \`/track?id=\${listing.id}\`;

        const successCard = document.getElementById('successCard');
        successCard.style.display = 'block';
        successCard.scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        errEl.innerText = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Daftarkan Tiket ke Tikum';
      }
    }

    function resetForm() {
      document.getElementById('listingForm').reset();
      clearSavedDraft();
      document.getElementById('formCard').style.display = 'block';
      document.getElementById('successCard').style.display = 'none';
      document.getElementById('eventPreviewBox').style.display = 'none';
      calculateFeePreview();
      initSellerSession();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.innerText = str;
      return div.innerHTML;
    }

    `;

content = content.substring(0, idxStart) + newJs + content.substring(idxEnd);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated JavaScript in public/create.html');
