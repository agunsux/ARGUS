/**
 * Explainability Engine for the ARGUS Trust Infrastructure
 * Enforces ADR-009 (The Right to Explain)
 */

const TEMPLATES = {
  IDENTITY_KYC_FAILED: {
    machine: 'IDENTITY_KYC_FAILED',
    human: 'Verifikasi identitas ditolak karena KTP buram atau tidak terbaca. Silakan unggah ulang foto KTP yang jelas.',
    audit: 'Violated ADR-007: KYC failed check due to insufficient human evidence readability.'
  },
  IDENTITY_NAME_MISMATCH: {
    machine: 'IDENTITY_NAME_MISMATCH',
    human: 'Nama pada identitas KTP tidak cocok dengan nama pemegang rekening bank/pembelian tiket.',
    audit: 'Violated Invariant 3: Verification must reconcile identities across KTP and purchase ledger.'
  },
  TICKET_VERIFICATION_REJECTED: {
    machine: 'TICKET_VERIFICATION_REJECTED',
    human: 'Verifikasi tiket ditolak karena PDF tiket terindikasi mengalami manipulasi metadata atau pemotongan informasi penting.',
    audit: 'Violated Invariant 3: Evidence bundle fails file integrity check.'
  },
  ESCROW_RELEASE_DENIED_UNVERIFIED: {
    machine: 'ESCROW_RELEASE_DENIED_UNVERIFIED',
    human: 'Pembayaran ke penjual diblokir karena tiket belum lolos verifikasi kepemilikan oleh Trust Officer.',
    audit: 'Violated Invariant 4: Settlement cannot complete before ownership verification.'
  },
  ESCROW_RELEASE_DENIED_NO_PAYMENT: {
    machine: 'ESCROW_RELEASE_DENIED_NO_PAYMENT',
    human: 'Pembayaran ke penjual diblokir karena dana transfer pembeli belum terkonfirmasi masuk di Escrow.',
    audit: 'Violated Invariant 4: Settlement cannot complete before escrow payment validation.'
  },
  DOUBLE_TRANSFER_BLOCKED: {
    machine: 'DOUBLE_TRANSFER_BLOCKED',
    human: 'Perpindahan kepemilikan tiket ini diblokir karena tiket telah dipindahkan ke pemilik lain di masa lalu.',
    audit: 'Violated Invariant 5: A transfer cannot be finalized twice.'
  },
  ADMIN_OVERRIDE_RECORDED: {
    machine: 'ADMIN_OVERRIDE_RECORDED',
    human: 'Status transfer diubah secara manual oleh Trust Officer untuk resolusi sengketa.',
    audit: 'Adheres to ADR-008: Human override requires full audit log (performer, timestamp, reason, evidence).'
  },
  TICKET_NOT_LISTED: {
    machine: 'TICKET_NOT_LISTED',
    human: 'Reservasi gagal karena status tiket saat ini tidak tersedia untuk dijual (status must be LISTED).',
    audit: 'Violated state lifecycle rule: Ticket status transition from non-LISTED state is invalid.'
  }
};

/**
 * Returns a structured explainability reason block.
 * 
 * @param {string} code - The machine template identifier
 * @param {object} context - Additional dynamic variables to embed
 */
function explainDecision(code, context = {}) {
  const template = TEMPLATES[code];
  if (!template) {
    return {
      machine_reason: code || 'UNKNOWN_ERROR',
      human_reason: context.message || 'Terjadi kesalahan sistem yang tidak diketahui.',
      audit_reason: 'Generic system error. No specific invariant mapped.'
    };
  }

  // Dynamic context substitution if needed (e.g. replacing placeholder variables)
  let humanReason = template.human;
  if (context.details) {
    humanReason += ` Detail: ${context.details}`;
  }

  return {
    machine_reason: template.machine,
    human_reason: humanReason,
    audit_reason: template.audit
  };
}

module.exports = {
  explainDecision
};
