/**
 * TIKUM / ARGUS — Dispute, Refund & Liability Matrix (Epic L / Policy Matrix)
 *
 * Formally specifies financial resolution rules, platform liability,
 * and seller penalty policies across all standard marketplace dispute scenarios.
 */

const RESOLUTION_CODE = {
  FULL_REFUND_BUYER: 'FULL_REFUND_BUYER',
  FULL_PAYOUT_SELLER: 'FULL_PAYOUT_SELLER',
  PARTIAL_SPLIT: 'PARTIAL_SPLIT',
  FROZEN_PENDING_ARBITRATION: 'FROZEN_PENDING_ARBITRATION'
};

const SELLER_ACTION = {
  PAYOUT: 'PAYOUT',
  NO_PAYOUT: 'NO_PAYOUT',
  PENALTY_AND_SUSPEND: 'PENALTY_AND_SUSPEND',
  INVESTIGATION: 'INVESTIGATION',
  WARNING: 'WARNING'
};

const DISPUTE_MATRIX = {
  PROMOTER_CANCELLED: {
    scenario: 'Event cancelled by official promoter / organizer',
    buyerOutcome: RESOLUTION_CODE.FULL_REFUND_BUYER,
    buyerRefundPercentage: 100,
    sellerAction: SELLER_ACTION.NO_PAYOUT,
    sellerPayoutPercentage: 0,
    platformFeeRefunded: true,
    policyNotes: 'All buyer funds returned in full. Seller receives no payout since event did not take place.'
  },
  FAKE_TICKET: {
    scenario: 'Ticket confirmed counterfeit, fake, or invalid barcode by venue PIC or official gate scanner',
    buyerOutcome: RESOLUTION_CODE.FULL_REFUND_BUYER,
    buyerRefundPercentage: 100,
    sellerAction: SELLER_ACTION.PENALTY_AND_SUSPEND,
    sellerPayoutPercentage: 0,
    platformFeeRefunded: true,
    policyNotes: '100% buyer refund guaranteed. Seller account suspended immediately with security deposit forfeiture or penalty.'
  },
  DUPLICATE_TICKET: {
    scenario: 'Ticket already used or scanned prior to buyer arrival at gate',
    buyerOutcome: RESOLUTION_CODE.FULL_REFUND_BUYER,
    buyerRefundPercentage: 100,
    sellerAction: SELLER_ACTION.PENALTY_AND_SUSPEND,
    sellerPayoutPercentage: 0,
    platformFeeRefunded: true,
    policyNotes: '100% buyer refund. Seller investigated for multi-platform listing or double-selling.'
  },
  SELLER_TRANSFER_FAILURE: {
    scenario: 'Seller failed to deliver e-ticket, credentials, or complete transfer before deadline',
    buyerOutcome: RESOLUTION_CODE.FULL_REFUND_BUYER,
    buyerRefundPercentage: 100,
    sellerAction: SELLER_ACTION.WARNING,
    sellerPayoutPercentage: 0,
    platformFeeRefunded: true,
    policyNotes: 'Order cancelled, full buyer refund, seller active listing privileges restricted.'
  },
  BUYER_NO_SHOW: {
    scenario: 'Valid ticket delivered on time; buyer failed to attend venue or did not check in with PIC',
    buyerOutcome: RESOLUTION_CODE.FULL_PAYOUT_SELLER,
    buyerRefundPercentage: 0,
    sellerAction: SELLER_ACTION.PAYOUT,
    sellerPayoutPercentage: 100,
    platformFeeRefunded: false,
    policyNotes: 'Seller fulfilled obligation; buyer change of mind or personal no-show is non-refundable.'
  },
  EVENT_POSTPONED: {
    scenario: 'Event postponed or rescheduled to a new date by promoter',
    buyerOutcome: 'VALID_FOR_RESCHEDULED_DATE',
    buyerRefundPercentage: 0,
    sellerAction: 'HOLD_UNTIL_NEW_DATE',
    sellerPayoutPercentage: 0,
    platformFeeRefunded: false,
    policyNotes: 'Tickets remain valid for new date. If official promoter allows ticket return, Tikum facilitates cancellation.'
  },
  INSUFFICIENT_EVIDENCE: {
    scenario: 'Contested claims where neither buyer nor seller provides definitive proof within 48h',
    buyerOutcome: RESOLUTION_CODE.FROZEN_PENDING_ARBITRATION,
    buyerRefundPercentage: 0,
    sellerAction: SELLER_ACTION.INVESTIGATION,
    sellerPayoutPercentage: 0,
    platformFeeRefunded: false,
    policyNotes: 'Funds held in platform internal ledger until senior trust officer or mutual agreement settles claim.'
  }
};

class DisputeRefundMatrix {
  static RESOLUTION_CODE = RESOLUTION_CODE;
  static SELLER_ACTION = SELLER_ACTION;
  static MATRIX = DISPUTE_MATRIX;

  /**
   * Resolves policy rule for a specific dispute or claim type.
   */
  static getPolicy(reasonOrIncidentType) {
    const key = (reasonOrIncidentType || '').toUpperCase();
    if (key.includes('CANCEL') || key.includes('PROMOTER')) return DISPUTE_MATRIX.PROMOTER_CANCELLED;
    if (key.includes('FAKE') || key.includes('INVALID') || key.includes('COUNTERFEIT')) return DISPUTE_MATRIX.FAKE_TICKET;
    if (key.includes('DUPLICATE') || key.includes('ALREADY_SCANNED')) return DISPUTE_MATRIX.DUPLICATE_TICKET;
    if (key.includes('TRANSFER') || key.includes('SELLER_NO_SHOW')) return DISPUTE_MATRIX.SELLER_TRANSFER_FAILURE;
    if (key.includes('BUYER_NO_SHOW')) return DISPUTE_MATRIX.BUYER_NO_SHOW;
    if (key.includes('POSTPONE') || key.includes('RESCHEDULE')) return DISPUTE_MATRIX.EVENT_POSTPONED;

    return DISPUTE_MATRIX.INSUFFICIENT_EVIDENCE;
  }
}

module.exports = {
  DisputeRefundMatrix,
  RESOLUTION_CODE,
  SELLER_ACTION,
  DISPUTE_MATRIX
};
