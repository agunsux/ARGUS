const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'admin.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Sidebar Nav
const sidebarTarget = '<div class="sidebar-heading" data-i18n="admin.sidebarWorkspace">Operational Workspace</div>';
const sidebarAddition = `
      <button class="nav-item" onclick="switchView('control-center', this)" id="navControlCenter">
        <span class="nav-item-left"><i class="fa-solid fa-traffic-light" style="color: #38bdf8;"></i> <span>Transaction Control</span></span>
        <span id="sidebarControlCenterRed" class="nav-badge danger" style="display: none;">0</span>
      </button>`;

if (!content.includes('id="navControlCenter"')) {
  content = content.replace(sidebarTarget, sidebarTarget + sidebarAddition);
  console.log('✅ Injected sidebar nav item');
}

// 2. DEDICATED_VIEWS update
const dedicatedTarget = "const DEDICATED_VIEWS = ['overview', 'search', 'event-supply', 'sources', 'trust', 'payments', 'editorial', 'inbox', 'partners'];";
const dedicatedReplacement = "const DEDICATED_VIEWS = ['overview', 'search', 'event-supply', 'sources', 'trust', 'payments', 'editorial', 'inbox', 'partners', 'control-center'];";
if (content.includes(dedicatedTarget)) {
  content = content.replace(dedicatedTarget, dedicatedReplacement);
  console.log('✅ Updated DEDICATED_VIEWS');
}

// 3. switchView handler update
const switchTarget = "const viewPartnersEl = document.getElementById('viewPartners');";
const switchAddition = `const viewControlCenterEl = document.getElementById('viewControlCenter');
      if (viewControlCenterEl) viewControlCenterEl.style.display = viewName === 'control-center' ? 'block' : 'none';
      if (viewName === 'control-center') { loadControlCenterView(); }
      `;
if (!content.includes('loadControlCenterView()')) {
  content = content.replace(switchTarget, switchAddition + switchTarget);
  console.log('✅ Updated switchView handler');
}

// 4. Insert viewControlCenter HTML pane
const viewPaymentsAnchor = '<!-- ============================================================ -->\r\n      <!-- VIEW: PAYMENTS & LEDGER -->';
const viewPaymentsAnchorLF = '<!-- ============================================================ -->\n      <!-- VIEW: PAYMENTS & LEDGER -->';

const controlCenterHtml = `
      <!-- ============================================================ -->
      <!-- VIEW: TRANSACTION CONTROL CENTER (THREE-COLOR TRIAGE) -->
      <!-- ============================================================ -->
      <div id="viewControlCenter" style="display: none;">
        <!-- Header Banner -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #fff;">
              <i class="fa-solid fa-traffic-light" style="color: #38bdf8;"></i> Transaction Control Center — Payout Engine &amp; Three-Color Triage
            </h2>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
              Server-evaluated transaction risk triage: <span style="color:#ef4444;font-weight:600;">RED</span> (Hold / Action Required), <span style="color:#f59e0b;font-weight:600;">YELLOW</span> (In Progress / Pending), <span style="color:#10b981;font-weight:600;">GREEN</span> (Ready for Payout), <span style="color:#94a3b8;font-weight:600;">PAID_OUT</span> (Disbursed). Net seller payout eligibility is evaluated strictly on the backend.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="loadControlCenterView()">
              <i class="fa-solid fa-rotate"></i> Refresh
            </button>
          </div>
        </div>

        <!-- Four Triage KPI Summary Cards -->
        <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); margin-bottom: 20px;">
          <!-- RED Card -->
          <div class="kpi-card" style="border: 1px solid rgba(239, 68, 68, 0.4); background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%);">
            <div class="kpi-label" style="color: #fca5a5;">
              <span>HOLD / ACTION REQUIRED</span> <i class="fa-solid fa-hand" style="color: #ef4444;"></i>
            </div>
            <div id="ccCountRed" class="kpi-value" style="color: #ef4444;">0</div>
            <div id="ccAmountRed" class="kpi-sub" style="color: #f87171;">Dana Ditahan: IDR 0</div>
          </div>

          <!-- YELLOW Card -->
          <div class="kpi-card" style="border: 1px solid rgba(245, 158, 11, 0.4); background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%);">
            <div class="kpi-label" style="color: #fde68a;">
              <span>IN PROGRESS / PENDING</span> <i class="fa-solid fa-hourglass-half" style="color: #f59e0b;"></i>
            </div>
            <div id="ccCountYellow" class="kpi-value" style="color: #f59e0b;">0</div>
            <div id="ccAmountYellow" class="kpi-sub" style="color: #fbbf24;">Dalam Proses: IDR 0</div>
          </div>

          <!-- GREEN Card -->
          <div class="kpi-card" style="border: 1px solid rgba(16, 185, 129, 0.4); background: linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%);">
            <div class="kpi-label" style="color: #a7f3d0;">
              <span>READY FOR PAYOUT</span> <i class="fa-solid fa-check-double" style="color: #10b981;"></i>
            </div>
            <div id="ccCountGreen" class="kpi-value" style="color: #10b981;">0</div>
            <div id="ccAmountGreen" class="kpi-sub" style="color: #34d399;">Siap Cair: IDR 0</div>
          </div>

          <!-- PAID OUT Card -->
          <div class="kpi-card" style="border: 1px solid rgba(148, 163, 184, 0.3); background: linear-gradient(180deg, rgba(148, 163, 184, 0.05) 0%, rgba(15, 23, 42, 0.6) 100%);">
            <div class="kpi-label" style="color: #cbd5e1;">
              <span>PAID OUT / DISBURSED</span> <i class="fa-solid fa-money-bill-check" style="color: #38bdf8;"></i>
            </div>
            <div id="ccCountPaidOut" class="kpi-value" style="color: #cbd5e1;">0</div>
            <div id="ccAmountPaidOut" class="kpi-sub" style="color: #94a3b8;">Sudah Cair: IDR 0</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="ops-panel" style="margin-bottom: 16px; padding: 12px 16px;">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px; position: relative;">
              <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 11px; color: #64748b; font-size: 13px;"></i>
              <input id="txSearchInput" type="text" class="ops-input" placeholder="Cari Order ID, Pembeli, Penjual, Judul Event, Ref Payout..." style="padding-left: 34px; width: 100%; box-sizing: border-box;" onkeydown="if(event.key==='Enter') loadControlCenterView(1);">
            </div>
            <div style="min-width: 190px;">
              <select id="txStatusFilter" class="ops-select" onchange="loadControlCenterView(1)" style="width: 100%;">
                <option value="ALL">Semua Status Triage</option>
                <option value="RED">🔴 RED: Hold / Action Required</option>
                <option value="YELLOW">🟡 YELLOW: In Progress / Pending</option>
                <option value="GREEN">🟢 GREEN: Ready for Payout</option>
                <option value="PAID_OUT">⚪ PAID_OUT: Disbursed</option>
              </select>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="loadControlCenterView(1)">
              <i class="fa-solid fa-filter"></i> Terapkan
            </button>
          </div>
        </div>

        <!-- Transactions Table Panel -->
        <div class="ops-panel" style="padding: 0; overflow: hidden; margin-bottom: 20px;">
          <div style="padding: 14px 16px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 600; font-size: 13px; color: #fff;">
              <i class="fa-solid fa-list-check" style="color: #38bdf8;"></i> Daftar Transaksi &amp; Evaluasi Payout
            </div>
            <div id="txTablePaginationInfo" style="font-size: 11px; color: #94a3b8;">
              Memuat data...
            </div>
          </div>
          <div style="overflow-x: auto;">
            <table class="ops-table" style="width: 100%; font-size: 12px;">
              <thead>
                <tr>
                  <th style="padding: 10px 12px;">Order ID &amp; Event</th>
                  <th style="padding: 10px 12px;">Pihak (Buyer / Seller)</th>
                  <th style="padding: 10px 12px; text-align: right;">Gross &amp; Net Payout</th>
                  <th style="padding: 10px 12px; text-align: center;">Triage Status</th>
                  <th style="padding: 10px 12px;">Faktor Evaluasi</th>
                  <th style="padding: 10px 12px;">Tindakan Diperlukan</th>
                  <th style="padding: 10px 12px; text-align: center;">Aksi</th>
                </tr>
              </thead>
              <tbody id="txTableBody">
                <tr>
                  <td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Memuat transaksi...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TIMELINE & ACTION MODAL -->
      <div id="txTimelineModal" style="display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 20px;">
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 10px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
          <!-- Modal Header -->
          <div style="padding: 16px 20px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; background: #1e293b;">
            <div style="font-weight: 700; font-size: 14px; color: #fff;" id="txModalHeaderTitle">
              Audit Timeline Transaksi
            </div>
            <button onclick="closeTimelineModal()" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <!-- Modal Body -->
          <div style="padding: 20px; overflow-y: auto; flex: 1;" id="txModalBody">
            <div style="text-align: center; padding: 40px; color: #64748b;">
              <i class="fa-solid fa-spinner fa-spin"></i> Memuat detail...
            </div>
          </div>
          <!-- Modal Footer -->
          <div style="padding: 12px 20px; border-top: 1px solid #1e293b; background: #131d33; display: flex; justify-content: space-between; align-items: center;" id="txModalFooter">
            <button class="btn btn-secondary btn-sm" onclick="closeTimelineModal()">Tutup</button>
            <div id="txModalActions" style="display: flex; gap: 8px;"></div>
          </div>
        </div>
      </div>
`;

if (!content.includes('id="viewControlCenter"')) {
  if (content.includes(viewPaymentsAnchor)) {
    content = content.replace(viewPaymentsAnchor, controlCenterHtml + '\r\n      ' + viewPaymentsAnchor);
    console.log('✅ Injected viewControlCenter pane (CRLF)');
  } else if (content.includes(viewPaymentsAnchorLF)) {
    content = content.replace(viewPaymentsAnchorLF, controlCenterHtml + '\n      ' + viewPaymentsAnchorLF);
    console.log('✅ Injected viewControlCenter pane (LF)');
  } else {
    // Fallback: insert before viewEditorial
    const editAnchor = '<div id="viewEditorial" style="display: none;">';
    content = content.replace(editAnchor, controlCenterHtml + '\r\n      ' + editAnchor);
    console.log('✅ Injected viewControlCenter pane before viewEditorial');
  }
}

// 5. JavaScript functions injection
const jsAddition = `
    // =========================================================================
    // TRANSACTION CONTROL CENTER FRONTEND LOGIC
    // =========================================================================
    let cachedControlCenterData = null;
    let currentTxPage = 1;

    async function loadControlCenterView(page = 1) {
      currentTxPage = page;
      const status = document.getElementById('txStatusFilter')?.value || 'ALL';
      const search = document.getElementById('txSearchInput')?.value || '';

      const tbody = document.getElementById('txTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat data transaksi...</td></tr>';
      }

      try {
        const query = new URLSearchParams({
          page: String(page),
          limit: '25',
          status,
          search
        });
        const res = await adminFetch('/api/admin/transactions/control-center?' + query.toString());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        cachedControlCenterData = data;

        // Render KPI Cards
        const sum = data.summary || {};
        document.getElementById('ccCountRed').innerText = sum.count_red || 0;
        document.getElementById('ccAmountRed').innerText = 'Dana Ditahan: ' + formatRupiah(sum.total_held_amount || 0);

        document.getElementById('ccCountYellow').innerText = sum.count_yellow || 0;
        document.getElementById('ccAmountYellow').innerText = 'Dalam Proses: ' + formatRupiah(sum.total_held_amount || 0);

        document.getElementById('ccCountGreen').innerText = sum.count_green || 0;
        document.getElementById('ccAmountGreen').innerText = 'Siap Cair: ' + formatRupiah(sum.total_ready_payout_amount || 0);

        document.getElementById('ccCountPaidOut').innerText = sum.count_paid_out || 0;
        document.getElementById('ccAmountPaidOut').innerText = 'Sudah Cair: ' + formatRupiah(sum.total_disbursed_amount || 0);

        // Sidebar Red Badge
        const redBadge = document.getElementById('sidebarControlCenterRed');
        if (redBadge) {
          if (sum.count_red > 0) {
            redBadge.style.display = 'inline-block';
            redBadge.innerText = sum.count_red;
          } else {
            redBadge.style.display = 'none';
          }
        }

        // Render Transactions Table
        const txs = data.transactions || [];
        const pinfo = data.pagination || {};
        const pinfoEl = document.getElementById('txTablePaginationInfo');
        if (pinfoEl) {
          pinfoEl.innerText = 'Menampilkan ' + txs.length + ' dari ' + (pinfo.totalCount || 0) + ' transaksi (Halaman ' + (pinfo.page || 1) + '/' + (pinfo.totalPages || 1) + ')';
        }

        if (txs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #94a3b8;"><i class="fa-solid fa-inbox" style="font-size: 24px; margin-bottom: 8px; display: block; color: #475569;"></i> Tidak ada transaksi yang sesuai kriteria filter.</td></tr>';
          return;
        }

        tbody.innerHTML = txs.map(tx => {
          let badgeHtml = '';
          if (tx.colorStatus === 'RED') {
            badgeHtml = '<span class="tag" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-weight: 700;"><i class="fa-solid fa-hand"></i> RED (HOLD)</span>';
          } else if (tx.colorStatus === 'YELLOW') {
            badgeHtml = '<span class="tag" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; font-weight: 700;"><i class="fa-solid fa-hourglass-half"></i> YELLOW (PENDING)</span>';
          } else if (tx.colorStatus === 'GREEN') {
            badgeHtml = '<span class="tag" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; font-weight: 700;"><i class="fa-solid fa-check-circle"></i> GREEN (READY)</span>';
          } else if (tx.colorStatus === 'PAID_OUT') {
            badgeHtml = '<span class="tag" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid #475569; font-weight: 600;"><i class="fa-solid fa-money-bill-check"></i> PAID OUT</span>';
          }

          const reasonsSummary = (tx.evaluationReasons && tx.evaluationReasons.length > 0)
            ? tx.evaluationReasons.slice(0, 2).join('; ')
            : 'Operational normal';

          const actionHtml = tx.actionRequired
            ? ('<div style="font-size: 11px; color: #fca5a5;">' + tx.actionRequired + '</div>')
            : '<div style="font-size: 11px; color: #94a3b8;">Siap diproses / tidak ada blocker</div>';

          const payoutBtn = tx.colorStatus === 'GREEN'
            ? ('<button class="btn btn-sm" style="background: #10b981; color: #fff; padding: 3px 8px; font-size: 11px;" onclick="executeSellerPayout(\\'' + tx.orderId + '\\', ' + tx.netSellerPayout + ')"><i class="fa-solid fa-paper-plane"></i> Cairkan</button>')
            : '';

          const holdBtn = tx.hasAdminHold
            ? ('<button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px; color: #38bdf8;" onclick="promptReleaseHold(\\'' + tx.orderId + '\\')"><i class="fa-solid fa-lock-open"></i> Buka Hold</button>')
            : ('<button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px; color: #ef4444;" onclick="promptAdminHold(\\'' + tx.orderId + '\\')"><i class="fa-solid fa-lock"></i> Hold</button>');

          return '<tr>' +
            '<td style="padding: 10px 12px;"><div class="mono" style="font-weight: 600; color: #fff;">' + tx.orderId + '</div><div style="font-size: 11px; color: #94a3b8;">' + tx.eventTitle + '</div><div style="font-size: 10px; color: #64748b;">' + formatTs(tx.createdAt) + '</div></td>' +
            '<td style="padding: 10px 12px;"><div><span style="color: #64748b;">B:</span> ' + tx.buyerName + '</div><div style="margin-top: 2px;"><span style="color: #64748b;">S:</span> ' + tx.sellerName + '</div></td>' +
            '<td style="padding: 10px 12px; text-align: right;"><div class="mono" style="font-weight: 600; color: #fff;">' + formatRupiah(tx.grossAmount) + '</div><div style="font-size: 11px; color: #34d399;">Net: ' + formatRupiah(tx.netSellerPayout) + '</div><div style="font-size: 10px; color: #64748b;">Fee: ' + formatRupiah(tx.platformFee) + '</div></td>' +
            '<td style="padding: 10px 12px; text-align: center;">' + badgeHtml + '</td>' +
            '<td style="padding: 10px 12px; max-width: 200px;"><div style="font-size: 11px; color: #cbd5e1;">' + reasonsSummary + '</div>' + (tx.holdReason ? '<div style="font-size: 10px; color: #ef4444; margin-top: 2px;">Hold: ' + tx.holdReason + '</div>' : '') + '</td>' +
            '<td style="padding: 10px 12px; max-width: 180px;">' + actionHtml + '</td>' +
            '<td style="padding: 10px 12px; text-align: center;"><div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;"><button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px;" onclick="openTransactionTimeline(\\'' + tx.orderId + '\\')"><i class="fa-solid fa-clock-rotate-left"></i> Timeline</button>' + holdBtn + payoutBtn + '</div></td>' +
          '</tr>';
        }).join('');

      } catch (err) {
        console.error('Failed to load control center data:', err);
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat data: ' + err.message + '</td></tr>';
        }
      }
    }

    async function openTransactionTimeline(orderId) {
      const modal = document.getElementById('txTimelineModal');
      const body = document.getElementById('txModalBody');
      const headerTitle = document.getElementById('txModalHeaderTitle');
      const actionsEl = document.getElementById('txModalActions');

      modal.style.display = 'flex';
      body.innerHTML = '<div style="text-align: center; padding: 40px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat detail & timeline transaksi ' + orderId + '...</div>';
      headerTitle.innerText = 'Audit Timeline Transaksi — ' + orderId;
      actionsEl.innerHTML = '';

      try {
        const res = await adminFetch('/api/admin/transactions/' + orderId + '/timeline');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        const ord = data.order || {};
        const ev = data.currentEvaluation || {};
        const f = ev.factors || {};
        const tl = data.timeline || [];

        // Build factor checklist HTML
        let factorsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-bottom: 20px; padding: 12px; background: #131d33; border-radius: 6px; font-size: 11px;">' +
          '<div>' + (f.paymentConfirmed ? '🟢' : '⚪') + ' Pembayaran Tervalidasi</div>' +
          '<div>' + (f.sellerKycVerified ? '🟢' : '⚪') + ' Seller KYC Terverifikasi</div>' +
          '<div>' + (f.ticketDelivered ? '🟢' : '⚪') + ' Tiket Berhasil Ditransfer</div>' +
          '<div>' + (f.eventConcludedOrEntryConfirmed ? '🟢' : '⚪') + ' Entry Venue / Event Selesai</div>' +
          '<div>' + (!f.hasDisputes ? '🟢' : '🔴') + ' Zero Active Dispute</div>' +
          '<div>' + (!f.hasIncidents ? '🟢' : '🔴') + ' Zero Active Incident</div>' +
          '<div>' + (!f.hasAdminHold ? '🟢' : '🔴') + ' Bebas Administrative Hold</div>' +
          '<div>' + (ev.isPaidOut ? '🟣' : '⚪') + ' Status Pencairan (Disbursed)</div>' +
        '</div>';

        // Build Timeline vertical list
        let timelineListHtml = '<div style="position: relative; padding-left: 20px; border-left: 2px solid #334155; margin-left: 10px;">';
        if (tl.length === 0) {
          timelineListHtml += '<div style="color: #64748b; font-size: 12px;">Belum ada log aktivitas tercatat.</div>';
        } else {
          timelineListHtml += tl.map(item => {
            let dotColor = '#38bdf8';
            if (item.category === 'HOLD' || item.category === 'DISPUTE' || item.category === 'INCIDENT') dotColor = '#ef4444';
            if (item.category === 'PAYOUT') dotColor = '#10b981';
            if (item.category === 'VENUE_ENTRY') dotColor = '#f59e0b';

            return '<div style="margin-bottom: 16px; position: relative;">' +
              '<div style="position: absolute; left: -26px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: ' + dotColor + ';"></div>' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<span style="font-weight: 600; color: #fff; font-size: 12px;">' + item.title + '</span>' +
                '<span class="mono" style="font-size: 10px; color: #64748b;">' + formatTs(item.timestamp) + '</span>' +
              '</div>' +
              '<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">' + item.description + '</div>' +
              '<div style="font-size: 10px; color: #64748b; margin-top: 2px;">Aktor: ' + (item.actor || 'SYSTEM') + ' (' + (item.actorRole || 'system') + ')</div>' +
            '</div>';
          }).join('');
        }
        timelineListHtml += '</div>';

        body.innerHTML = '<div>' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
            '<div>' +
              '<div style="font-size: 15px; font-weight: 700; color: #fff;">' + (ord.eventTitle || 'Event') + '</div>' +
              '<div style="font-size: 11px; color: #94a3b8;">Buyer: ' + (ord.buyer ? ord.buyer.name : ord.buyerId) + ' | Seller: ' + (ord.seller ? ord.seller.name : ord.sellerId) + '</div>' +
            '</div>' +
            '<div style="text-align: right;">' +
              '<div style="font-size: 15px; font-weight: 700; color: #34d399;">' + formatRupiah(ev.netSellerPayout) + '</div>' +
              '<div style="font-size: 11px; color: #64748b;">Gross: ' + formatRupiah(ev.grossAmount) + ' | Fee: ' + formatRupiah(ev.platformFee) + '</div>' +
            '</div>' +
          '</div>' +
          factorsHtml +
          '<div style="font-weight: 600; font-size: 12px; color: #fff; margin-bottom: 12px;"><i class="fa-solid fa-list-timeline"></i> Riwayat Audit Kronologis</div>' +
          timelineListHtml +
        '</div>';

        // Action Buttons in Footer
        let actionBtns = '';
        if (ev.hasAdminHold) {
          actionBtns += '<button class="btn btn-secondary btn-sm" onclick="promptReleaseHold(\\'' + orderId + '\\')"><i class="fa-solid fa-lock-open"></i> Buka Administrative Hold</button>';
        } else {
          actionBtns += '<button class="btn btn-secondary btn-sm" style="color: #ef4444;" onclick="promptAdminHold(\\'' + orderId + '\\')"><i class="fa-solid fa-lock"></i> Terapkan Administrative Hold</button>';
        }

        if (ev.colorStatus === 'GREEN') {
          actionBtns += '<button class="btn btn-sm" style="background: #10b981; color: #fff;" onclick="executeSellerPayout(\\'' + orderId + '\\', ' + ev.netSellerPayout + ')"><i class="fa-solid fa-paper-plane"></i> Eksekusi Payout Seller</button>';
        }

        actionsEl.innerHTML = actionBtns;

      } catch (err) {
        body.innerHTML = '<div style="text-align: center; padding: 40px; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat timeline: ' + err.message + '</div>';
      }
    }

    function closeTimelineModal() {
      const modal = document.getElementById('txTimelineModal');
      if (modal) modal.style.display = 'none';
    }

    async function promptAdminHold(orderId) {
      const reason = prompt('Masukkan alasan Administrative Hold untuk order ' + orderId + ':');
      if (!reason || reason.trim().length < 4) {
        if (reason !== null) alert('Alasan hold minimal 4 karakter!');
        return;
      }

      try {
        const res = await adminFetch('/api/admin/transactions/' + orderId + '/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menerapkan hold');
        showToast('Administrative hold berhasil diterapkan.', 'warning');
        closeTimelineModal();
        loadControlCenterView(currentTxPage);
      } catch (err) {
        alert('Gagal menerapkan hold: ' + err.message);
      }
    }

    async function promptReleaseHold(orderId) {
      const reason = prompt('Masukkan alasan pelepasan hold untuk order ' + orderId + ':');
      if (!reason || reason.trim().length < 4) {
        if (reason !== null) alert('Alasan pelepasan hold minimal 4 karakter!');
        return;
      }

      try {
        const res = await adminFetch('/api/admin/transactions/' + orderId + '/release-hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal melepas hold');
        showToast('Administrative hold berhasil dilepas.', 'success');
        closeTimelineModal();
        loadControlCenterView(currentTxPage);
      } catch (err) {
        alert('Gagal melepas hold: ' + err.message);
      }
    }

    async function executeSellerPayout(orderId, netAmount) {
      const confirmed = confirm('Konfirmasi pencairan payout seller untuk order ' + orderId + ' sebesar ' + formatRupiah(netAmount) + '?');
      if (!confirmed) return;

      const bankAccount = prompt('Konfirmasi rekening bank tujuan seller (atau tekan OK untuk rekening default):', 'BCA 1234567890 (a.n Budi Santoso)');
      if (bankAccount === null) return;

      try {
        const res = await adminFetch('/api/admin/transactions/' + orderId + '/execute-payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bankAccount: bankAccount.trim(),
            idempotencyKey: 'payout-' + orderId + '-' + Date.now()
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || (data.evaluationReasons ? data.evaluationReasons.join('; ') : 'Gagal eksekusi payout'));
        }
        showToast('Payout seller berhasil dicairkan! Ref: ' + (data.settlement?.payout_ref || 'N/A'), 'success');
        closeTimelineModal();
        loadControlCenterView(currentTxPage);
      } catch (err) {
        alert('Eksekusi payout ditolak: ' + err.message);
      }
    }
`;

if (!content.includes('loadControlCenterView(page = 1)')) {
  const scriptEnd = '</script>\r\n</body>';
  const scriptEndLF = '</script>\n</body>';
  if (content.includes(scriptEnd)) {
    content = content.replace(scriptEnd, jsAddition + '\r\n  ' + scriptEnd);
    console.log('✅ Injected JS functions (CRLF)');
  } else if (content.includes(scriptEndLF)) {
    content = content.replace(scriptEndLF, jsAddition + '\n  ' + scriptEndLF);
    console.log('✅ Injected JS functions (LF)');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('🎉 public/admin.html successfully updated with Transaction Control Center!');
