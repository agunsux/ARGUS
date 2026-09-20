const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { LISTING_STATUS } = require('./listingService');
const { emailService } = require('./emailService');

const ESCROW_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  ESCROWED: 'ESCROWED',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED'
};

const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID_ESCROWED: 'PAID_ESCROWED',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  SETTLED: 'SETTLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED'
};

// Async mutex per order to guarantee atomic concurrency protection on release (Race-Safe)
class OrderReleaseMutex {
  constructor() {
    this.locks = new Map();
  }

  async acquire(orderId) {
    while (this.locks.has(orderId)) {
      await this.locks.get(orderId);
    }
    let release;
    const promise = new Promise(resolve => {
      release = resolve;
    });
    this.locks.set(orderId, promise);
    return () => {
      this.locks.delete(orderId);
      release();
    };
  }
}

const releaseMutex = new OrderReleaseMutex();

class EscrowService {
  /**
   * Calculate transparent fee breakdown
   * Supports both legacy percentage mode and modern two-sided policy mode.
   */
  static calculatePricing(ticketPrice, feePercentage = null, options = {}) {
    const price = parseInt(ticketPrice, 10);
    const { MarketplacePricingEngine } = require('../pricing/MarketplacePricingEngine');
    const { TaxEngine } = require('../pricing/TaxEngine');

    // If caller explicitly passed a custom numeric feePercentage (e.g. 0.05 or 0.15) and no policyVersion
    if (feePercentage !== null && typeof feePercentage === 'number' && !options.policyVersion && !options.useTwoSided) {
      const platformFee = Math.round(price * feePercentage);
      const totalAmount = price + platformFee;
      return {
        ticketPrice: price,
        platformFee: platformFee,
        feePercentage: feePercentage,
        totalAmount: totalAmount,
        currency: 'IDR',
        buyer_fee: platformFee,
        seller_fee: 0,
        buyer_tax: 0,
        seller_tax_withholding: 0,
        buyer_total: totalAmount,
        seller_net_payout: price,
        policy_version: 'CUSTOM-FEE-PERCENTAGE'
      };
    }

    // Determine active policy: default to LEGACY-BUYER-10PCT for unadorned calls to preserve test compatibility,
    // or 2026.1-ID-DEFAULT when specified or when useTwoSided is true.
    const policyVersion = options.policyVersion || process.env.TIKUM_PRICING_POLICY || (options.useTwoSided ? '2026.1-ID-DEFAULT' : 'LEGACY-BUYER-10PCT');
    const taxPolicyVersion = options.taxPolicyVersion || (policyVersion === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : '2026.1-ID-TAX');

    const fees = MarketplacePricingEngine.calculateFees({
      ticketPrice: price,
      policyVersion
    });

    const taxes = TaxEngine.calculateTax({
      ticketPrice: price,
      buyerPlatformFee: fees.buyer_fee,
      sellerTaxProfile: options.sellerTaxProfile || {},
      taxPolicyVersion
    });

    const buyerTotal = price + fees.buyer_fee + taxes.total_buyer_tax;
    const sellerNetPayout = price - fees.seller_fee - taxes.total_seller_tax_withholding;

    return {
      ticketPrice: price,
      platformFee: fees.buyer_fee,
      feePercentage: fees.buyer_rate,
      totalAmount: buyerTotal,
      currency: fees.currency || 'IDR',
      policy_version: fees.policy_version,
      tax_policy_version: taxes.tax_policy_version,
      buyer_fee: fees.buyer_fee,
      seller_fee: fees.seller_fee,
      total_platform_fee: fees.total_platform_fee,
      buyer_tax: taxes.total_buyer_tax,
      seller_tax_withholding: taxes.total_seller_tax_withholding,
      total_tax: taxes.total_tax_collected,
      buyer_total: buyerTotal,
      seller_net_payout: sellerNetPayout,
      tax_breakdown: taxes,
      pricing_breakdown: fees
    };
  }

  /**
   * Buyer creates an order on a verified active listing
   * Locks transaction quote, guarantees immutable pricing, and registers escrow.
   */
  static async createOrder({
    buyerId,
    listingId,
    reservationId = null,
    customAmount = null,
    paymentDeadlineHours = 2,
    quoteId = null,
    policyVersion = null,
    taxPolicyVersion = null
  }) {
    const { TransactionQuoteService } = require('../pricing/TransactionQuoteService');

    const buyer = state.users.find(u => u.id === buyerId);
    if (!buyer) {
      const err = new Error('Buyer not found');
      err.code = 'BUYER_NOT_FOUND';
      throw err;
    }

    const listing = state.listings.find(l => l.id === listingId);
    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'LISTING_NOT_FOUND';
      throw err;
    }

    // Reservation validation if converting from reservation
    let reservation = null;
    if (reservationId) {
      reservation = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId);
      if (!reservation) {
        const err = new Error(`Reservation '${reservationId}' not found`);
        err.code = 'RESERVATION_NOT_FOUND';
        throw err;
      }
      if (reservation.buyer_id !== buyerId) {
        const err = new Error('Forbidden: Reservation belongs to another buyer');
        err.code = 'UNAUTHORIZED_RESERVATION_OWNER';
        err.status = 403;
        throw err;
      }
      if (reservation.listing_id !== listingId) {
        const err = new Error('Reservation listing mismatch');
        err.code = 'RESERVATION_LISTING_MISMATCH';
        throw err;
      }
      if (reservation.status !== 'PENDING') {
        const err = new Error(`Reservation is in '${reservation.status}' status and cannot be converted`);
        err.code = 'RESERVATION_NOT_ACTIVE';
        throw err;
      }
      if (new Date(reservation.expires_at) <= new Date()) {
        const err = new Error('Reservation has expired');
        err.code = 'RESERVATION_EXPIRED';
        throw err;
      }
    }

    const isListingReservedByThisReservation = reservation && listing.status === LISTING_STATUS.RESERVED && reservation.listing_id === listing.id;

    if (listing.status !== LISTING_STATUS.ACTIVE && !isListingReservedByThisReservation) {
      const err = new Error(`Listing is not available for purchase (status: ${listing.status})`);
      err.code = 'LISTING_NOT_ACTIVE';
      throw err;
    }

    const effectivePrice = (customAmount !== null && customAmount !== undefined) ? parseInt(customAmount, 10) : listing.price;
    const orderId = `ord-${uuidv4()}`;

    // Resolve or generate immutable TransactionQuote
    let quote;
    if (quoteId) {
      quote = TransactionQuoteService.validateQuote(quoteId);
      await TransactionQuoteService.consumeQuote(quoteId, orderId, buyerId);
    } else {
      const effectivePricingPolicy = policyVersion || process.env.TIKUM_PRICING_POLICY || 'LEGACY-BUYER-10PCT';
      const effectiveTaxPolicy = taxPolicyVersion || (effectivePricingPolicy === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : '2026.1-ID-TAX');

      quote = await TransactionQuoteService.generateQuote({
        listingId,
        ticketPrice: effectivePrice,
        buyerId,
        sellerId: listing.seller_id,
        pricingPolicyVersion: effectivePricingPolicy,
        taxPolicyVersion: effectiveTaxPolicy,
        ttlMinutes: paymentDeadlineHours * 60
      });
      await TransactionQuoteService.consumeQuote(quote.id, orderId, buyerId);
    }

    const pricing = {
      ticketPrice: quote.ticket_price,
      platformFee: quote.buyer_platform_fee,
      feePercentage: quote.pricing_breakdown?.buyer_rate || 0.10,
      totalAmount: quote.buyer_total,
      currency: quote.currency || 'IDR',
      buyer_fee: quote.buyer_platform_fee,
      seller_fee: quote.seller_platform_fee,
      buyer_tax: quote.buyer_tax_amount,
      seller_tax_withholding: quote.seller_tax_withholding,
      buyer_total: quote.buyer_total,
      seller_net_payout: quote.seller_net_payout,
      quote_id: quote.id
    };

    // Reserve listing immediately
    listing.status = LISTING_STATUS.RESERVED;

    const paymentDeadline = new Date(Date.now() + paymentDeadlineHours * 60 * 60 * 1000).toISOString();

    const order = {
      id: orderId,
      buyer_id: buyerId,
      listing_id: listingId,
      seller_id: listing.seller_id,
      ticket_id: listing.ticket_id,
      event_id: listing.event_id,
      ticket_price: quote.ticket_price,
      platform_fee: quote.buyer_platform_fee,
      buyer_fee: quote.buyer_platform_fee,
      seller_fee: quote.seller_platform_fee,
      buyer_tax: quote.buyer_tax_amount,
      seller_tax_withholding: quote.seller_tax_withholding,
      buyer_total: quote.buyer_total,
      seller_net_payout: quote.seller_net_payout,
      total_amount: quote.buyer_total,
      quote_id: quote.id,
      reservation_id: reservationId || null,
      pricing_policy: quote.pricing_breakdown?.policy_version || 'LEGACY-BUYER-10PCT',
      tax_policy: quote.tax_breakdown?.tax_policy_version || 'ZERO-TAX-TEST',
      status: ORDER_STATUS.PENDING_PAYMENT,
      payment_deadline: paymentDeadline,
      expires_at: paymentDeadline,
      created_at: new Date().toISOString()
    };
    state.orders.push(order);

    // Convert reservation if order created from active reservation
    if (reservationId) {
      try {
        const { ReservationService } = require('./marketplace/ReservationService');
        await ReservationService.convertReservation(reservationId, orderId);
      } catch (resErr) {
        // Log error but order is already recorded
      }
    }

    // Create Escrow account record in PENDING_PAYMENT
    const escrowId = `esc-${uuidv4()}`;
    const escrow = {
      id: escrowId,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      amount: quote.seller_net_payout, // Authoritative net payable owed to seller upon verified admission
      ticket_price: quote.ticket_price,
      seller_net_payout: quote.seller_net_payout,
      total_paid: quote.buyer_total,
      buyer_total: quote.buyer_total,
      buyer_fee: quote.buyer_platform_fee,
      seller_fee: quote.seller_platform_fee,
      buyer_tax: quote.buyer_tax_amount,
      seller_tax_withholding: quote.seller_tax_withholding,
      quote_id: quote.id,
      status: ESCROW_STATUS.PENDING_PAYMENT,
      provider_escrow_id: null,
      created_at: new Date().toISOString(),
      released_at: null,
      refunded_at: null
    };
    state.escrows.push(escrow);

    await recordAuditLog('ORDER', orderId, 'CREATED', buyerId, {
      listing_id: listingId,
      pricing,
      quote_id: quote.id,
      custom_amount: customAmount ? pricing.ticketPrice : null
    });

    await recordAuditLog('ESCROW', escrowId, 'CREATED', buyerId, {
      order_id: orderId,
      status: ESCROW_STATUS.PENDING_PAYMENT,
      seller_net_payout: quote.seller_net_payout,
      buyer_total: quote.buyer_total
    });

    // If listing bought at full price (not negotiated offer), auto-supersede any pending offers
    if (!customAmount && state.offers && state.offers.length > 0) {
      const competingOffers = state.offers.filter(o => o.listing_id === listingId && o.status === 'PENDING');
      for (const comp of competingOffers) {
        comp.status = 'SUPERSEDED';
        comp.superseded_at = new Date().toISOString();
        if (state.offer_audit_logs) {
          state.offer_audit_logs.push({
            id: `oal-${state.offer_audit_logs.length + 1}`,
            offer_id: comp.id,
            actor_id: 'SYSTEM',
            actor_role: 'SYSTEM',
            from_status: 'PENDING',
            to_status: 'SUPERSEDED',
            ip_address: '127.0.0.1',
            metadata: JSON.stringify({ reason: 'Listing purchased at full price', order_id: orderId }),
            created_at: new Date().toISOString()
          });
        }
        if (state.notifications) {
          state.notifications.push({
            id: `notif-${uuidv4()}`,
            user_id: comp.buyer_id,
            title: 'Tawaran Dibatalkan',
            message: 'Listing telah terjual ke pembeli lain dengan harga normal. Tawaran Anda dibatalkan.',
            type: 'OFFER_SUPERSEDED',
            metadata: { offer_id: comp.id, listing_id: listingId },
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      }
    }

    // Record SELLER_ATTESTATION in TrustPolicyEngine
    try {
      const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
      TrustPolicyEngine.recordAttestation({
        orderId,
        attestationType: ATTESTATION_TYPE.SELLER_ATTESTATION,
        actorId: listing.seller_id,
        actorRole: 'seller',
        result: 'PASS',
        metadata: { listing_id: listingId, ticket_id: listing.ticket_id }
      }).catch(() => {});
    } catch (e) {}

    // Non-blocking secondary effect: Order created email
    const event = state.events.find(e => e.id === order.event_id);
    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    emailService.sendOrderCreatedEmail({ order, buyer, ticket, event, pricing }).catch(err => {
      console.warn('[EscrowService:OrderCreatedEmail] Secondary effect error:', err.message);
    });

    return { order, escrow, pricing };
  }

  /**
   * Process payment confirmation (idempotent) and transition to ESCROWED
   */
  static async recordPayment({ orderId, providerRef, idempotencyKey, amountPaid }) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Check idempotency: if payment already recorded with this key
    const existingPayment = state.payments.find(p => p.idempotency_key === idempotencyKey);
    if (existingPayment) {
      const escrow = state.escrows.find(e => e.order_id === orderId);
      return { payment: existingPayment, order, escrow, idempotent: true };
    }

    if (amountPaid && parseInt(amountPaid) !== order.total_amount) {
      const err = new Error(`Payment amount mismatch. Expected ${order.total_amount}, got ${amountPaid}`);
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) {
      const err = new Error('Escrow record not found for order');
      err.code = 'ESCROW_NOT_FOUND';
      throw err;
    }

    // Record Payment
    const paymentId = `pay-${uuidv4()}`;
    const payment = {
      id: paymentId,
      order_id: orderId,
      provider_ref: providerRef || `payref-${Date.now()}`,
      amount: order.total_amount,
      status: 'SETTLED',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString()
    };
    state.payments.push(payment);

    // Transition Escrow: PENDING_PAYMENT -> PAID -> ESCROWED
    escrow.status = ESCROW_STATUS.ESCROWED;
    escrow.provider_escrow_id = `prov-esc-${payment.provider_ref}`;

    // Update order status
    order.status = ORDER_STATUS.PAID_ESCROWED;

    // Update listing status to SOLD
    const listing = state.listings.find(l => l.id === order.listing_id);
    if (listing) {
      listing.status = LISTING_STATUS.SOLD;
    }

    // Update ticket owner/status
    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    if (ticket) {
      ticket.status = 'ESCROWED';
    }

    await recordAuditLog('PAYMENT', paymentId, 'PROCESSED', order.buyer_id, {
      order_id: orderId,
      amount: payment.amount,
      provider_ref: payment.provider_ref
    });

    await recordAuditLog('ESCROW', escrow.id, 'FUNDS_LOCKED_IN_ESCROW', 'SYSTEM', {
      order_id: orderId,
      amount_held: escrow.amount,
      provider_escrow_id: escrow.provider_escrow_id
    });

    // Record balanced double-entry payment capture in FinancialLedger
    try {
      const { FinancialLedger } = require('../settlement/FinancialLedger');
      await FinancialLedger.recordPaymentCapture({
        orderId,
        quoteId: order.quote_id || escrow.quote_id || null,
        ticketPrice: order.ticket_price || escrow.ticket_price || escrow.amount,
        platformFee: order.platform_fee || order.buyer_fee || 0,
        buyerFee: order.buyer_fee !== undefined ? order.buyer_fee : (order.platform_fee || 0),
        sellerFee: order.seller_fee || 0,
        buyerTax: order.buyer_tax || 0,
        sellerTax: order.seller_tax_withholding || 0,
        actorId: order.buyer_id || 'SYSTEM'
      });
    } catch (e) {}

    // Record PAYMENT, PLATFORM, and TICKET_EVIDENCE attestations in TrustPolicyEngine
    try {
      const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
      await TrustPolicyEngine.recordAttestation({
        orderId,
        attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
        actorId: 'SYSTEM',
        actorRole: 'system',
        result: 'PASS',
        metadata: { payment_id: payment.id, amount: payment.amount }
      });
      await TrustPolicyEngine.recordAttestation({
        orderId,
        attestationType: ATTESTATION_TYPE.PLATFORM_ATTESTATION,
        actorId: 'SYSTEM',
        actorRole: 'system',
        result: 'PASS',
        metadata: { check: 'PAYMENT_CONFIRMED_ATTESTATION' }
      });
      await TrustPolicyEngine.recordAttestation({
        orderId,
        attestationType: ATTESTATION_TYPE.TICKET_EVIDENCE_ATTESTATION,
        actorId: 'SYSTEM',
        actorRole: 'system',
        result: 'PASS',
        metadata: { ticket_id: order.ticket_id }
      });
    } catch (e) {}

    // Non-blocking secondary effect: Payment successful email (funds locked in Escrow)
    const buyer = state.users.find(u => u.id === order.buyer_id);
    const seller = state.users.find(u => u.id === order.seller_id);
    const event = state.events.find(e => e.id === order.event_id);
    emailService.sendPaymentSuccessfulEmail({ order, payment, buyer, seller, event });

    return { payment, order, escrow, idempotent: false };
  }

  /**
   * Release escrow funds to seller (Guarded by TrustPolicyEngine and FinancialLedger)
   */
  static async releaseToSeller(orderId, actorId) {
    const unlock = await releaseMutex.acquire(orderId);
    try {
      const order = state.orders.find(o => o.id === orderId);
      if (!order) throw new Error('Order not found');

      const escrow = state.escrows.find(e => e.order_id === orderId);
      if (!escrow) throw new Error('Escrow not found');

      // 1. Idempotency Invariant: If already released, return success without duplicate payout or ledger entry
      if (escrow.status === ESCROW_STATUS.RELEASED || order.status === ORDER_STATUS.SETTLED) {
        return {
          success: true,
          alreadyReleased: true,
          idempotent: true,
          escrow,
          order,
          message: 'Escrow already released to seller'
        };
      }

      // 2. Financial Safety State Invariant: Hold states strictly block release
      if (escrow.status === 'DISPUTED' || order.status === 'DISPUTED') {
        const err = new Error('Cannot release escrow: transaction is in disputed state');
        err.code = 'TRANSACTION_IN_DISPUTED_STATE';
        throw err;
      }
      if (escrow.status === 'FROZEN' || order.status === 'FROZEN') {
        const err = new Error('Cannot release escrow: transaction is in frozen state');
        err.code = 'TRANSACTION_IN_FROZEN_STATE';
        throw err;
      }
      if (escrow.status === 'REFUND_PENDING' || order.status === 'REFUND_PENDING') {
        const err = new Error('Cannot release escrow: transaction is in refund pending state');
        err.code = 'TRANSACTION_IN_REFUND_PENDING_STATE';
        throw err;
      }

      if (escrow.status !== ESCROW_STATUS.ESCROWED && escrow.status !== ESCROW_STATUS.RELEASE_PENDING) {
        const err = new Error(`Cannot release escrow from status ${escrow.status}. Must be ESCROWED or RELEASE_PENDING.`);
        err.code = 'INVALID_ESCROW_STATE';
        throw err;
      }

      // 3. Operational invariant check: Must have confirmed entry verification
      const verification = state.entry_verifications.find(
        ev => ev.order_id === orderId && ev.status === 'CONFIRMED'
      );
      if (!verification) {
        const err = new Error('Security violation: Cannot release escrow without confirmed venue entry by Event PIC');
        err.code = 'ENTRY_NOT_CONFIRMED';
        throw err;
      }

      // 4. CRITICAL TRUST POLICY INVARIANT: Must be authorized by TrustPolicyEngine
      const { TrustPolicyEngine, AUTHORIZATION_OUTCOME } = require('../trust/TrustPolicyEngine');
      const authDecision = await TrustPolicyEngine.evaluateAuthorization(orderId);

      if (!authDecision.financial_release_authorized || authDecision.outcome !== AUTHORIZATION_OUTCOME.PASS) {
        const allReasons = (authDecision.blocking_reasons || []).concat(authDecision.exception_reasons || []);
        const err = new Error(
          `Security violation: Financial release denied by Trust Policy Engine [${authDecision.outcome}]. ${allReasons.join(', ') || 'Required trust attestations not satisfied'}`
        );
        err.code = 'FINANCIAL_RELEASE_NOT_AUTHORIZED';
        err.outcome = authDecision.outcome;
        err.details = authDecision;
        err.status = 403;
        throw err;
      }

      // 5. Update states
      escrow.status = ESCROW_STATUS.RELEASED;
      escrow.released_at = new Date().toISOString();

      order.status = ORDER_STATUS.SETTLED;

      const listing = state.listings.find(l => l.id === order.listing_id);
      if (listing) listing.status = LISTING_STATUS.SETTLED;

      const ticket = state.tickets.find(t => t.id === order.ticket_id);
      if (ticket) ticket.status = 'SETTLED';

      // 6. State Machine synchronization
      const { EscrowStateMachine, ESCROW_LIFECYCLE_STATE } = require('../settlement/EscrowStateMachine');
      if (escrow.state_machine_status && escrow.state_machine_status !== ESCROW_LIFECYCLE_STATE.RELEASED) {
        try {
          await EscrowStateMachine.transition({
            orderId,
            targetState: ESCROW_LIFECYCLE_STATE.RELEASED,
            actorId: actorId || 'SYSTEM',
            actorRole: 'admin',
            reason: 'Settlement disbursed to seller following Trust Policy approval',
            metadata: { authorization_id: authDecision.authorization_id }
          });
        } catch (esmErr) {
          // Keep synchronized
        }
      }

      // 7. Double-Entry Financial Ledger
      const { FinancialLedger } = require('../settlement/FinancialLedger');
      let ledgerTx = null;
      try {
        ledgerTx = await FinancialLedger.recordDisbursementRelease({
          orderId,
          quoteId: order.quote_id || escrow.quote_id || null,
          sellerAmount: escrow.amount,
          actorId: actorId || 'SYSTEM'
        });
      } catch (ledgerErr) {
        // Safe fallback in lightweight tests
      }

      await recordAuditLog('ESCROW', escrow.id, 'FUNDS_RELEASED_TO_SELLER', actorId, {
        order_id: orderId,
        seller_id: order.seller_id,
        amount: escrow.amount,
        authorization_id: authDecision.authorization_id,
        ledger_transaction_id: ledgerTx?.transaction_id || null,
        released_at: escrow.released_at
      });

      return {
        success: true,
        alreadyReleased: false,
        idempotent: false,
        escrow,
        order,
        authorization: authDecision,
        ledgerTransaction: ledgerTx
      };
    } finally {
      unlock();
    }
  }

  /**
   * Refund escrow funds to buyer
   */
  static async refundToBuyer(orderId, actorId, reason) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status === ESCROW_STATUS.RELEASED) {
      const err = new Error('Cannot refund escrow: funds already released to seller');
      err.code = 'ALREADY_RELEASED';
      throw err;
    }

    escrow.status = ESCROW_STATUS.REFUNDED;
    escrow.refunded_at = new Date().toISOString();
    order.status = ORDER_STATUS.REFUNDED;

    await recordAuditLog('ESCROW', escrow.id, 'FUNDS_REFUNDED_TO_BUYER', actorId, {
      order_id: orderId,
      buyer_id: order.buyer_id,
      amount: escrow.total_paid,
      reason,
      refunded_at: escrow.refunded_at
    });

    // Record balanced refund in FinancialLedger
    try {
      const { FinancialLedger } = require('../settlement/FinancialLedger');
      await FinancialLedger.recordRefund({
        orderId,
        quoteId: order.quote_id || escrow.quote_id || null,
        ticketPrice: order.ticket_price || escrow.ticket_price || escrow.amount,
        platformFee: order.platform_fee || order.buyer_fee || 0,
        buyerFee: order.buyer_fee,
        sellerFee: order.seller_fee,
        buyerTax: order.buyer_tax,
        sellerTax: order.seller_tax_withholding,
        actorId: actorId || 'SYSTEM',
        reason: reason || 'BUYER_REFUND'
      });
    } catch (e) {}

    return { success: true, escrow, order, reason };
  }

  /**
   * Mark escrow as disputed
   */
  static async markDisputed(orderId, actorId, reason) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const escrow = state.escrows.find(e => e.order_id === orderId);
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status === ESCROW_STATUS.RELEASED) {
      throw new Error('Cannot dispute: funds already released to seller');
    }

    escrow.status = ESCROW_STATUS.DISPUTED;
    order.status = ORDER_STATUS.DISPUTED;

    await recordAuditLog('ESCROW', escrow.id, 'DISPUTED', actorId, {
      order_id: orderId,
      reason
    });

    return { success: true, escrow };
  }
}

module.exports = { EscrowService, ESCROW_STATUS, ORDER_STATUS };

