/**
 * TIKUM / ARGUS — iPaymu Escrow Policy & Temporal Eligibility Evaluator
 *
 * Implements strict business and operational rules for iPaymu Escrow:
 * - Eligible channels: Bank Transfer / Virtual Account & qualifying Unique-Code payments only.
 * - Ineligible channels: QRIS & Credit Cards strictly forbidden for escrow.
 * - Confirmation window: 7 days (168 hours) standard auto-release.
 * - Buyer extension: 1 extension of 3 days (72 hours), maximum absolute duration 10 days (240 hours).
 * - Temporal eligibility evaluation based on payment, delivery, confirmation, and event timestamps.
 * - INVARIANT: Never promise event-day fund release or venue-based provider escrow control.
 */

const ESCROW_CHANNELS = {
  // Virtual Accounts (Eligible)
  BCA_VA: { code: 'BCA_VA', type: 'VA', eligible: true, name: 'BCA Virtual Account' },
  MANDIRI_VA: { code: 'MANDIRI_VA', type: 'VA', eligible: true, name: 'Mandiri Virtual Account' },
  BNI_VA: { code: 'BNI_VA', type: 'VA', eligible: true, name: 'BNI Virtual Account' },
  BRI_VA: { code: 'BRI_VA', type: 'VA', eligible: true, name: 'BRI Virtual Account' },
  PERMATA_VA: { code: 'PERMATA_VA', type: 'VA', eligible: true, name: 'Permata Virtual Account' },
  VA_BCA: { code: 'VA_BCA', type: 'VA', eligible: true, name: 'BCA Virtual Account' },
  VA_MANDIRI: { code: 'VA_MANDIRI', type: 'VA', eligible: true, name: 'Mandiri Virtual Account' },
  VA_BNI: { code: 'VA_BNI', type: 'VA', eligible: true, name: 'BNI Virtual Account' },
  VA_BRI: { code: 'VA_BRI', type: 'VA', eligible: true, name: 'BRI Virtual Account' },
  VA_PERMATA: { code: 'VA_PERMATA', type: 'VA', eligible: true, name: 'Permata Virtual Account' },

  // Bank Transfer with Unique Code (Eligible)
  BANK_TRANSFER_UNIQUE_CODE: { code: 'BANK_TRANSFER_UNIQUE_CODE', type: 'UNIQUE_CODE_TRANSFER', eligible: true, name: 'Transfer Bank Kode Unik' },
  DIRECT_BANK_TRANSFER_UNIQUE_CODE: { code: 'DIRECT_BANK_TRANSFER_UNIQUE_CODE', type: 'UNIQUE_CODE_TRANSFER', eligible: true, name: 'Transfer Bank Manual Kode Unik' },

  // Ineligible Channels (Non-Escrow / Instant Settlement)
  QRIS: { code: 'QRIS', type: 'QRIS', eligible: false, name: 'QRIS Standar Nasional', reason: 'QRIS settles directly to merchant without provider-held escrow hold' },
  QRIS_STANDARD: { code: 'QRIS_STANDARD', type: 'QRIS', eligible: false, name: 'QRIS Standar Nasional', reason: 'QRIS settles directly without escrow' },
  CREDIT_CARD_INSTANT: { code: 'CREDIT_CARD_INSTANT', type: 'CREDIT_CARD', eligible: false, name: 'Kartu Kredit Instan', reason: 'Kartu kredit diselesaikan secara langsung tanpa proteksi escrow' },
  CREDIT_CARD: { code: 'CREDIT_CARD', type: 'CREDIT_CARD', eligible: false, name: 'Kartu Kredit', reason: 'Kartu kredit tidak didukung untuk escrow' },
  DIRECT_BANK_TRANSFER: { code: 'DIRECT_BANK_TRANSFER', type: 'DIRECT_TRANSFER', eligible: false, name: 'Transfer Bank Langsung (Tanpa Kode Unik)', reason: 'Transfer bank tanpa kode unik tidak diverifikasi otomatis oleh iPaymu escrow' },
  IPAYMU_REDIRECT: { code: 'IPAYMU_REDIRECT', type: 'CHECKOUT', eligible: false, name: 'iPaymu Hosted Checkout (Semua Metode)', reason: 'Pilihan metode pembayaran ditentukan di portal iPaymu; kanal non-escrow tidak dapat dibatasi di hosted page' }
};

const ESCROW_CONSTANTS = {
  STANDARD_WINDOW_HOURS: 168, // 7 days x 24h
  STANDARD_WINDOW_MS: 168 * 3600 * 1000,
  EXTENSION_HOURS: 72, // 3 days x 24h
  EXTENSION_MS: 72 * 3600 * 1000,
  MAX_TOTAL_HOURS: 240, // 10 days x 24h
  MAX_TOTAL_MS: 240 * 3600 * 1000,
  MAX_EXTENSIONS_ALLOWED: 1
};

class IPaymuEscrowPolicy {
  static CONSTANTS = ESCROW_CONSTANTS;
  static CHANNELS = ESCROW_CHANNELS;

  /**
   * Evaluates if a given payment channel is eligible for iPaymu escrow holding.
   */
  static isChannelEligible(channel = '') {
    const ch = (channel || '').toUpperCase().trim();
    if (!ch) return false;

    // Check exact known channel register
    if (ESCROW_CHANNELS[ch]) {
      return ESCROW_CHANNELS[ch].eligible;
    }

    // Pattern matches
    if (ch.endsWith('_VA') || ch.startsWith('VA_') || ch.includes('VIRTUAL_ACCOUNT')) {
      return true;
    }
    if (ch.includes('UNIQUE_CODE') || ch.includes('KODE_UNIK')) {
      return true;
    }

    // QRIS, Cards, E-Wallets are strictly ineligible
    if (ch.includes('QRIS') || ch.includes('CARD') || ch.includes('OVO') || ch.includes('DANA') || ch.includes('GOPAY')) {
      return false;
    }

    return false;
  }

  /**
   * Calculates deadline timestamps for standard auto-release and extension.
   */
  static calculateDeadlines(paymentTimestamp, isExtended = false) {
    const payTime = new Date(paymentTimestamp).getTime();
    if (isNaN(payTime)) {
      throw new Error(`Invalid payment timestamp: ${paymentTimestamp}`);
    }

    const standardAutoReleaseAt = new Date(payTime + ESCROW_CONSTANTS.STANDARD_WINDOW_MS);
    const maxExtendedReleaseAt = new Date(payTime + ESCROW_CONSTANTS.MAX_TOTAL_MS);
    const effectiveReleaseAt = isExtended ? maxExtendedReleaseAt : standardAutoReleaseAt;

    return {
      paymentAt: new Date(payTime).toISOString(),
      standardAutoReleaseAt: standardAutoReleaseAt.toISOString(),
      maxExtendedReleaseAt: maxExtendedReleaseAt.toISOString(),
      effectiveReleaseAt: effectiveReleaseAt.toISOString(),
      isExtended: Boolean(isExtended),
      standardWindowHours: ESCROW_CONSTANTS.STANDARD_WINDOW_HOURS,
      maxWindowHours: ESCROW_CONSTANTS.MAX_TOTAL_HOURS
    };
  }

  /**
   * Evaluates temporal eligibility of an event ticket transaction under iPaymu standard escrow.
   *
   * @param {Object} params
   * @param {Date|string|number} params.paymentTimestamp - Waktu pembayaran terkonfirmasi ($t_{pay}$)
   * @param {Date|string|number} [params.deliveryTimestamp] - Waktu tiket diserahkan ($t_{deliver}$)
   * @param {Date|string|number} params.eventTimestamp - Waktu acara / gate buka ($t_{event}$)
   * @param {boolean} [params.isExtended=false] - Apakah perpanjangan 3 hari aktif
   * @returns {Object} Evaluation report
   */
  static evaluateEventEligibility({
    paymentTimestamp,
    deliveryTimestamp = null,
    eventTimestamp,
    isExtended = false
  }) {
    const payTime = new Date(paymentTimestamp).getTime();
    const eventTime = new Date(eventTimestamp).getTime();

    if (isNaN(payTime)) {
      throw new Error(`Invalid payment timestamp: ${paymentTimestamp}`);
    }
    if (isNaN(eventTime)) {
      throw new Error(`Invalid event timestamp: ${eventTimestamp}`);
    }

    const deliveryTime = deliveryTimestamp ? new Date(deliveryTimestamp).getTime() : null;
    const deadlines = this.calculateDeadlines(payTime, isExtended);
    const autoReleaseTime = new Date(deadlines.effectiveReleaseAt).getTime();
    const maxReleaseTime = new Date(deadlines.maxExtendedReleaseAt).getTime();

    const diffToEventMs = eventTime - payTime;
    const diffToEventHours = diffToEventMs / (3600 * 1000);
    const diffToEventDays = diffToEventHours / 24;

    // RULE 1: Event is more than 10 days away (> 240 hours)
    if (diffToEventMs > ESCROW_CONSTANTS.MAX_TOTAL_MS) {
      return {
        eligible: false,
        code: 'EVENT_HORIZON_EXCEEDS_ESCROW_MAX',
        status: 'INELIGIBLE',
        reason: `Acara berlangsung ${diffToEventDays.toFixed(1)} hari setelah pembayaran (melebihi batas maksimal escrow iPaymu 10 hari). ` +
          `Dana akan otomatis cair ke penjual sebelum konser dimulai, sehingga pembeli tidak terlindungi oleh escrow provider.`,
        deadlines,
        metrics: {
          daysUntilEvent: diffToEventDays,
          maxEscrowDays: 10,
          gapDays: diffToEventDays - 10
        },
        warnings: [
          'Dilarang menjanjikan kepada pembeli bahwa dana tertahan di iPaymu hingga hari-H konser.',
          'Transaksi ini hanya dapat diproses di bawah tata kelola pembukuan internal platform TIKUM (bukan escrow perbankan pihak ketiga).'
        ]
      };
    }

    // RULE 2: Delivery after event
    if (deliveryTime && deliveryTime > eventTime) {
      return {
        eligible: false,
        code: 'DELIVERY_AFTER_EVENT',
        status: 'INELIGIBLE',
        reason: 'Waktu penyerahan tiket dijadwalkan setelah acara dimulai.',
        deadlines,
        metrics: { daysUntilEvent: diffToEventDays }
      };
    }

    // RULE 3: Event between 7 and 10 days (requires buyer extension)
    if (diffToEventMs > ESCROW_CONSTANTS.STANDARD_WINDOW_MS && diffToEventMs <= ESCROW_CONSTANTS.MAX_TOTAL_MS) {
      if (!isExtended) {
        return {
          eligible: true,
          code: 'ELIGIBLE_REQUIRES_BUYER_EXTENSION',
          status: 'CONDITIONAL_APPROVAL',
          requiresExtension: true,
          reason: `Acara berlangsung pada hari ke-${diffToEventDays.toFixed(1)} (antara hari ke-7 dan hari ke-10). ` +
            `Pembeli wajib menggunakan hak perpanjangan 3 hari sebelum jam ke-168 agar dana tidak cair otomatis sebelum gerbang acara dibuka.`,
          deadlines,
          metrics: {
            daysUntilEvent: diffToEventDays,
            hoursUntilEvent: diffToEventHours
          },
          warnings: [
            'Otomatis cair pada hari ke-7 jika pembeli tidak mengklik tombol perpanjangan di portal iPaymu.',
            'Event PIC lapangan tidak memiliki wewenang atau kontrol API untuk memperpanjang escrow provider.'
          ]
        };
      }
    }

    // RULE 4: Event within 7 days (<= 168 hours)
    return {
      eligible: true,
      code: 'ELIGIBLE_WITHIN_STANDARD_WINDOW',
      status: 'ELIGIBLE',
      requiresExtension: false,
      reason: `Acara berlangsung dalam ${diffToEventDays.toFixed(1)} hari, di dalam jendela konfirmasi standar 7 hari iPaymu.`,
      deadlines,
      metrics: {
        daysUntilEvent: diffToEventDays,
        hoursUntilEvent: diffToEventHours,
        bufferHoursBeforeAutoRelease: (autoReleaseTime - eventTime) / (3600 * 1000)
      },
      warnings: [
        'PERINGATAN KRITIS: Pembeli dilarang menekan "Konfirmasi Terima" sebelum barcode tiket berhasil dipindai di pintu masuk venue.',
        'Penyerahan e-tiket sebelum hari-H tidak boleh langsung dianggap transaksi selesai, karena keabsahan tiket hanya terbukti saat scan gerbang.'
      ]
    };
  }
}

module.exports = {
  IPaymuEscrowPolicy,
  ESCROW_CONSTANTS,
  ESCROW_CHANNELS
};
