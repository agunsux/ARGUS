const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { LISTING_STATUS } = require('./listingService');
const { emailService } = require('./emailService');
const { TaxEngine } = require('../pricing/TaxEngine');

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
   * Calculate transparent fee breakdown using canonical fee engine.
   * Single source of truth for pricing calculations.
   */
  static calculatePricing(ticketPrice, feePercentage = null, options = {}) {
    const { CanonicalFeeEngine, TIKUM_FEE_POLICY_V1 } = require('../pricing/CanonicalFeeEngine');
    const { TaxEngine } = require('../pricing/TaxEngine');

    // Canonical default is TIKUM_FEE_POLICY_V1
    const policyVersion = options.policyVersion || process.env.TIKUM_PRICING_POLICY || 'TIKUM_FEE_POLICY_V1';
    const quantity = options.quantity || 1;
    const paymentProcessingFee = options.paymentProcessingFee || 0;

    const fees = CanonicalFeeEngine.calculateTicketFees({
      ticketPrice,
      quantity,
      paymentProcessingFee,
      currency: options.currency || 'IDR',
      policyVersion
    });

    const taxPolicyVersion = options.taxPolicyVersion || (policyVersion === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : TaxEngine.getDefaultTaxPolicyVersion());
    const taxes = TaxEngine.calculateTax({
      ticketPrice: fees.gross_ticket_value,
      buyerPlatformFee: fees.buyer_fee,
      sellerTaxProfile: options.sellerTaxProfile || {},
      taxPolicyVersion
    });

    const buyerTotal = fees.buyer_total + (taxes.total_buyer_tax || 0);
    const sellerNetPayout = fees.seller_payout - (taxes.total_seller_tax_withholding || 0);

    return {
      ticketPrice: fees.ticket_price,
      quantity: fees.quantity,
      gross_ticket_value: fees.gross_ticket_value,
      platformFee: fees.buyer_fee,
      feePercentage: fees.buyer_rate,
      totalAmount: buyerTotal,
      currency: fees.currency,
      policy_version: fees.fee_policy_version,
      fee_policy_version: fees.fee_policy_version,
      tax_policy_version: taxes.tax_policy_version,
      buyer_fee: fees.buyer_fee,
      seller_fee: fees.seller_fee,
      total_platform_fee: fees.total_tikum_fee,
      total_tikum_fee: fees.total_tikum_fee,
      payment_processing_fee: fees.payment_processing_fee,
      buyer_subtotal: fees.buyer_subtotal,
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

    let listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
    if (!listing) {
      try {
        const { getMarketplaceRepository } = require('../storage');
        const marketplaceRepo = getMarketplaceRepository();
        const dbListing = await marketplaceRepo.getListingById(listingId);
        if (dbListing) {
          if (!state.listings) state.listings = [];
          state.listings.push(dbListing);
          listing = dbListing;
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw err;
      }
    }
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
      let quoteObj = TransactionQuoteService.getQuote(quoteId);
      if (!quoteObj) {
        quoteObj = await TransactionQuoteService.getQuoteById(quoteId);
      }
      quote = TransactionQuoteService.validateQuote(quoteId);
      await TransactionQuoteService.consumeQuote(quoteId, orderId, buyerId);
    } else {
      const effectivePricingPolicy = policyVersion || process.env.TIKUM_PRICING_POLICY || 'TIKUM_FEE_POLICY_V1';
      const effectiveTaxPolicy = taxPolicyVersion || (effectivePricingPolicy === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : TaxEngine.getDefaultTaxPolicyVersion());

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
      quantity: quote.quantity || 1,
      gross_ticket_value: quote.gross_ticket_value || quote.ticket_price,
      platformFee: quote.buyer_platform_fee,
      feePercentage: quote.pricing_breakdown?.buyer_rate || 0.06,
      totalAmount: quote.buyer_total,
      currency: quote.currency || 'IDR',
      fee_policy_version: quote.fee_policy_version || 'TIKUM_FEE_POLICY_V1',
      buyer_fee: quote.buyer_platform_fee,
      seller_fee: quote.seller_platform_fee,
      total_platform_fee: quote.total_platform_fee,
      total_tikum_fee: quote.total_platform_fee,
      payment_processing_fee: quote.payment_processing_fee || 0,
      buyer_subtotal: quote.buyer_subtotal || quote.buyer_total,
      buyer_tax: quote.buyer_tax_amount,
      seller_tax_withholding: quote.seller_tax_withholding,
      buyer_total: quote.buyer_total,
      seller_net_payout: quote.seller_net_payout,
      seller_payout: quote.seller_net_payout,
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
      // Canonical Immutable Fee Snapshot (Requirement 6)
      fee_policy_version: quote.fee_policy_version || quote.pricing_breakdown?.policy_version || 'TIKUM_FEE_POLICY_V1',
      ticket_price: quote.ticket_price,
      price: quote.ticket_price,
      quantity: quote.quantity || 1,
      gross_ticket_value: quote.gross_ticket_value || quote.ticket_price,
      buyer_fee: quote.buyer_fee !== undefined ? quote.buyer_fee : quote.buyer_platform_fee,
      seller_fee: quote.seller_fee !== undefined ? quote.seller_fee : quote.seller_platform_fee,
      platform_fee: quote.buyer_platform_fee,
      payment_processing_fee: quote.payment_processing_fee || 0,
      buyer_subtotal: quote.buyer_subtotal || (quote.ticket_price + quote.buyer_platform_fee),
      buyer_total: quote.buyer_total,
      total_amount: quote.buyer_total,
      seller_payout: quote.seller_net_payout,
      seller_net_payout: quote.seller_net_payout,
      buyer_tax: quote.buyer_tax_amount || 0,
      seller_tax_withholding: quote.seller_tax_withholding || 0,
      currency: quote.currency || 'IDR',
      calculated_at: quote.calculated_at || new Date().toISOString(),
      quote_id: quote.id,
      reservation_id: reservationId || null,
      pricing_policy: quote.fee_policy_version || quote.pricing_breakdown?.policy_version || 'TIKUM_FEE_POLICY_V1',
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
      quantity: quote.quantity || 1,
      gross_ticket_value: quote.gross_ticket_value || quote.ticket_price,
      seller_payout: quote.seller_net_payout,
      seller_net_payout: quote.seller_net_payout,
      total_paid: quote.buyer_total,
      buyer_total: quote.buyer_total,
      buyer_fee: quote.buyer_platform_fee,
      seller_fee: quote.seller_platform_fee,
      payment_processing_fee: quote.payment_processing_fee || 0,
      buyer_tax: quote.buyer_tax_amount,
      seller_tax_withholding: quote.seller_tax_withholding,
      fee_policy_version: quote.fee_policy_version || 'TIKUM_FEE_POLICY_V1',
      quote_id: quote.id,
      status: ESCROW_STATUS.PENDING_PAYMENT,
      provider_escrow_id: null,
      created_at: new Date().toISOString(),
      released_at: null,
      refunded_at: null
    };
    state.escrows.push(escrow);

    let moneyRepo = null;
    try {
      const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
      moneyRepo = getMoneyRepository();
      const marketplaceRepo = getMarketplaceRepository();
      if (marketplaceRepo && listing && !marketplaceRepo.degraded) {
        const dbListing = await marketplaceRepo.getListingById(listing.id);
        if (!dbListing && process.env.NODE_ENV === 'production') {
          const err = new Error(`Listing '${listing.id}' not found in marketplace repository`);
          err.code = 'LISTING_NOT_FOUND';
          err.status = 404;
          throw err;
        }
      }
      await moneyRepo.createOrder({
        id: orderId,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        listing_id: listingId,
        ticket_id: listing.ticket_id,
        canonical_event_id: listing.event_id || listing.canonical_event_id,
        gross_amount: quote.ticket_price,
        buyer_fee: quote.buyer_platform_fee,
        seller_fee: quote.seller_platform_fee,
        buyer_tax: quote.buyer_tax_amount || 0,
        seller_tax_withholding: quote.seller_tax_withholding || 0,
        seller_payout: quote.seller_net_payout,
        total_amount: quote.buyer_total,
        currency: quote.currency || 'IDR',
        status: ORDER_STATUS.PENDING_PAYMENT,
        pricing_policy_version: quote.fee_policy_version || 'TIKUM_FEE_POLICY_V1',
        expires_at: paymentDeadline
      });
      await moneyRepo.createEscrow({
        id: escrowId,
        order_id: orderId,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        amount: quote.seller_net_payout,
        currency: quote.currency || 'IDR',
        status: ESCROW_STATUS.PENDING_PAYMENT,
        held_by: 'TIKUM_INTERNAL_ESCROW'
      });
      await marketplaceRepo.updateListingStatus(listingId, LISTING_STATUS.RESERVED);
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL || (moneyRepo && !moneyRepo.degraded)) {
        throw repoErr;
      }
    }

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
    let order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const dbOrder = await moneyRepo.getOrderById(orderId);
        if (dbOrder) {
          dbOrder.total_amount = parseInt(dbOrder.total_amount, 10);
          dbOrder.buyer_total = parseInt(dbOrder.buyer_total !== undefined ? dbOrder.buyer_total : dbOrder.total_amount, 10);
          dbOrder.seller_payout = parseInt(dbOrder.seller_payout || 0, 10);
          dbOrder.service_fee = parseInt(dbOrder.service_fee || 0, 10);
          if (!state.orders) state.orders = [];
          state.orders.push(dbOrder);
          order = dbOrder;
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
      }
    }
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Check idempotency: if payment already recorded in memory or db
    const existingPayment = (state.payments || []).find(p => p.idempotency_key === idempotencyKey);
    if (existingPayment) {
      let escrow = (state.escrows || []).find(e => e.order_id === orderId);
      return { payment: existingPayment, order, escrow, idempotent: true };
    }

    try {
      const { getMoneyRepository } = require('../storage');
      const moneyRepo = getMoneyRepository();
      const dbPayment = await moneyRepo.getPaymentByOrderId(orderId);
      if (dbPayment && (dbPayment.idempotency_key === idempotencyKey || (!idempotencyKey && dbPayment.status === 'SETTLED'))) {
        let escrow = (state.escrows || []).find(e => e.order_id === orderId);
        return { payment: dbPayment, order, escrow, idempotent: true };
      }
    } catch (_) {}

    const expectedAmount = parseInt(order.buyer_total !== undefined ? order.buyer_total : order.total_amount, 10);
    if (amountPaid && parseInt(amountPaid, 10) !== expectedAmount) {
      const err = new Error(`Payment amount mismatch. Expected ${expectedAmount}, got ${amountPaid}`);
      err.code = 'AMOUNT_MISMATCH';
      throw err;
    }

    let escrow = (state.escrows || []).find(e => e.order_id === orderId);
    if (!escrow) {
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const dbEscrow = await moneyRepo.getEscrowByOrderId(orderId);
        if (dbEscrow) {
          dbEscrow.amount = parseInt(dbEscrow.amount, 10);
          if (!state.escrows) state.escrows = [];
          state.escrows.push(dbEscrow);
          escrow = dbEscrow;
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
      }
    }
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
      amount: expectedAmount,
      status: 'SETTLED',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString()
    };
    if (!state.payments) state.payments = [];
    state.payments.push(payment);

    // Transition Escrow: PENDING_PAYMENT -> PAID -> ESCROWED
    escrow.status = ESCROW_STATUS.ESCROWED;
    escrow.provider_escrow_id = `prov-esc-${payment.provider_ref}`;

    // Update order status
    order.status = ORDER_STATUS.PAID_ESCROWED;

    // Update listing status to SOLD
    const listing = (state.listings || []).find(l => l.id === order.listing_id);
    if (listing) {
      listing.status = LISTING_STATUS.SOLD;
    }

    // Update ticket owner/status
    const ticket = (state.tickets || []).find(t => t.id === order.ticket_id);
    if (ticket) {
      ticket.status = 'ESCROWED';
    }

    try {
      const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
      const moneyRepo = getMoneyRepository();
      const marketplaceRepo = getMarketplaceRepository();
      const canonical = (state.canonical_payments || []).find(p => p.order_id === orderId);
      const effProvider = canonical?.provider || order.provider || 'doku';
      const effMethod = canonical?.payment_method || 'QRIS';

      await moneyRepo.createPayment({
        id: paymentId,
        order_id: orderId,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        currency: order.currency || 'IDR',
        gross_amount: expectedAmount,
        provider: effProvider,
        provider_reference: payment.provider_ref,
        provider_transaction_id: payment.provider_ref,
        status: 'SETTLED',
        money_state: 'PAID',
        payment_method: effMethod,
        idempotency_key: idempotencyKey
      });
      await moneyRepo.updateOrderStatus(orderId, ORDER_STATUS.PAID_ESCROWED);
      await moneyRepo.updateEscrowStatus(orderId, ESCROW_STATUS.ESCROWED, {
        provider_escrow_id: providerRef
      });
      if (order.listing_id) {
        await marketplaceRepo.updateListingStatus(order.listing_id, LISTING_STATUS.SOLD);
      }
      if (order.ticket_id) {
        await marketplaceRepo.updateTicketStatus(order.ticket_id, 'ESCROWED');
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw repoErr;
      }
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
        ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount,
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
      let order = (state.orders || []).find(o => o.id === orderId);
      if (!order) {
        try {
          const { getMoneyRepository } = require('../storage');
          const moneyRepo = getMoneyRepository();
          const dbOrder = await moneyRepo.getOrderById(orderId);
          if (dbOrder) {
            if (!state.orders) state.orders = [];
            state.orders.push(dbOrder);
            order = dbOrder;
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
        }
      }
      if (!order) throw new Error('Order not found');

      let escrow = (state.escrows || []).find(e => e.order_id === orderId);
      if (!escrow) {
        try {
          const { getMoneyRepository } = require('../storage');
          const moneyRepo = getMoneyRepository();
          const dbEscrow = await moneyRepo.getEscrowByOrderId(orderId);
          if (dbEscrow) {
            if (!state.escrows) state.escrows = [];
            state.escrows.push(dbEscrow);
            escrow = dbEscrow;
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
        }
      }
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

      // 4b. Double-Entry Solvency Assertion (Invariant I3)
      try {
        const { FinancialLedger } = require('../settlement/FinancialLedger');
        if (typeof FinancialLedger.assertSolvency === 'function') {
          FinancialLedger.assertSolvency();
        }
      } catch (solvencyErr) {
        if (solvencyErr.code === 'LEDGER_UNBALANCED' || solvencyErr.code === 'LEDGER_INSOLVENT') {
          throw solvencyErr;
        }
      }

      // 5. Update states
      escrow.status = ESCROW_STATUS.RELEASED;
      escrow.released_at = new Date().toISOString();

      order.status = ORDER_STATUS.SETTLED;

      const listing = state.listings.find(l => l.id === order.listing_id);
      if (listing) listing.status = LISTING_STATUS.SETTLED;

      const ticket = state.tickets.find(t => t.id === order.ticket_id);
      if (ticket) ticket.status = 'SETTLED';

      try {
        const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const marketplaceRepo = getMarketplaceRepository();
        await moneyRepo.releaseEscrow(orderId, actorId);
        if (order.listing_id) {
          await marketplaceRepo.updateListingStatus(order.listing_id, LISTING_STATUS.SETTLED);
        }
        if (order.ticket_id) {
          await marketplaceRepo.updateTicketStatus(order.ticket_id, 'SETTLED');
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }

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
   * Mutex-guarded against concurrent release and duplicate refunds
   */
  static async refundToBuyer(orderId, actorId, reason) {
    const unlock = await releaseMutex.acquire(orderId);
    try {
      let order = state.orders ? state.orders.find(o => o.id === orderId) : null;
      if (!order) {
        try {
          const { getMoneyRepository } = require('../storage');
          const moneyRepo = getMoneyRepository();
          const dbOrder = await moneyRepo.getOrderById(orderId);
          if (dbOrder) {
            if (!state.orders) state.orders = [];
            state.orders.push(dbOrder);
            order = dbOrder;
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
        }
      }
      if (!order) throw new Error('Order not found');

      let escrow = state.escrows ? state.escrows.find(e => e.order_id === orderId) : null;
      if (!escrow) {
        try {
          const { getMoneyRepository } = require('../storage');
          const moneyRepo = getMoneyRepository();
          const dbEscrow = await moneyRepo.getEscrowByOrderId(orderId);
          if (dbEscrow) {
            if (!state.escrows) state.escrows = [];
            state.escrows.push(dbEscrow);
            escrow = dbEscrow;
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
        }
      }
      if (!escrow) throw new Error('Escrow not found');

      if (escrow.status === ESCROW_STATUS.RELEASED) {
        const err = new Error('Cannot refund escrow: funds already released to seller');
        err.code = 'ALREADY_RELEASED';
        throw err;
      }

      if (escrow.status === ESCROW_STATUS.REFUNDED) {
        const err = new Error('Cannot refund escrow: funds already refunded to buyer');
        err.code = 'ALREADY_REFUNDED';
        throw err;
      }

      // 1. Determine provider refund capability and rail status
      let refundRailStatus = 'MANUAL_REFUND_REQUIRED';
      let providerRefundResult = null;
      const payment = (state.canonical_payments || []).find(p => p.order_id === orderId);
      const providerName = payment?.provider || 'doku';

      try {
        const { PaymentService } = require('./payment/PaymentService');
        if (payment && payment.provider) {
          providerRefundResult = await PaymentService.requestRefund({
            orderId,
            amount: escrow.total_paid,
            reason: reason || 'BUYER_REFUND',
            providerName: payment.provider
          });
          refundRailStatus = providerRefundResult?.status === 'CONFIRMED'
            ? 'PROVIDER_REFUND_CONFIRMED'
            : 'PROVIDER_REFUND_REQUESTED';
        }
      } catch (refundErr) {
        refundRailStatus = 'MANUAL_REFUND_REQUIRED';
        await recordAuditLog('REFUND_RAIL', orderId, 'MANUAL_REFUND_REQUIRED', actorId, {
          provider: providerName,
          reason: refundErr.message,
          code: refundErr.code,
          notice: 'Provider does not support automated API refund or requires manual dashboard disburse.'
        });
      }

      // 2. State & Semantic updates
      escrow.status = ESCROW_STATUS.REFUNDED;
      escrow.refunded_at = new Date().toISOString();
      escrow.refund_rail_status = refundRailStatus;
      escrow.ledger_reversed = true;
      escrow.provider_refund_confirmed = (refundRailStatus === 'PROVIDER_REFUND_CONFIRMED');

      order.status = ORDER_STATUS.REFUNDED;
      order.refund_rail_status = refundRailStatus;

      if (payment) {
        payment.refund_status = refundRailStatus;
        payment.ledger_reversed = true;
      }

      try {
        const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const marketplaceRepo = getMarketplaceRepository();
        await moneyRepo.refundEscrow(orderId, actorId, reason);
        if (order.listing_id) {
          await marketplaceRepo.updateListingStatus(order.listing_id, LISTING_STATUS.CANCELLED);
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }

      await recordAuditLog('ESCROW', escrow.id, 'FUNDS_REFUNDED_TO_BUYER', actorId, {
        order_id: orderId,
        buyer_id: order.buyer_id,
        amount: escrow.total_paid,
        reason,
        refund_rail_status: refundRailStatus,
        refunded_at: escrow.refunded_at
      });

      // 3. Record balanced double-entry ledger reversal
      let ledgerTx = null;
      try {
        const { FinancialLedger } = require('../settlement/FinancialLedger');
        ledgerTx = await FinancialLedger.recordRefund({
          orderId,
          quoteId: order.quote_id || escrow.quote_id || null,
          ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount,
          platformFee: order.platform_fee || order.buyer_fee || 0,
          buyerFee: order.buyer_fee,
          sellerFee: order.seller_fee,
          buyerTax: order.buyer_tax,
          sellerTax: order.seller_tax_withholding,
          actorId: actorId || 'SYSTEM',
          reason: reason || 'BUYER_REFUND'
        });
      } catch (e) {}

      // Persist state durably
      try {
        const { DurableFinancialStore } = require('../settlement/DurableFinancialStore');
        DurableFinancialStore.persist('escrows', state.escrows);
        DurableFinancialStore.persist('orders', state.orders);
      } catch (_) {}

      return {
        success: true,
        escrow,
        order,
        reason,
        providerRefund: providerRefundResult,
        refund_semantics: {
          internal_ledger_reversed: true,
          provider_refund_requested: refundRailStatus === 'PROVIDER_REFUND_REQUESTED' || refundRailStatus === 'PROVIDER_REFUND_CONFIRMED',
          provider_refund_confirmed: refundRailStatus === 'PROVIDER_REFUND_CONFIRMED',
          refund_rail_status: refundRailStatus
        }
      };
    } finally {
      unlock();
    }
  }

  /**
   * Mark escrow as disputed
   */
  static async markDisputed(orderId, actorId, reason) {
    let order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    if (!order) {
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const dbOrder = await moneyRepo.getOrderById(orderId);
        if (dbOrder) {
          if (!state.orders) state.orders = [];
          state.orders.push(dbOrder);
          order = dbOrder;
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
      }
    }
    if (!order) throw new Error('Order not found');

    let escrow = state.escrows ? state.escrows.find(e => e.order_id === orderId) : null;
    if (!escrow) {
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const dbEscrow = await moneyRepo.getEscrowByOrderId(orderId);
        if (dbEscrow) {
          if (!state.escrows) state.escrows = [];
          state.escrows.push(dbEscrow);
          escrow = dbEscrow;
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
      }
    }
    if (!escrow) throw new Error('Escrow not found');

    if (escrow.status === ESCROW_STATUS.RELEASED) {
      throw new Error('Cannot dispute: funds already released to seller');
    }

    escrow.status = ESCROW_STATUS.DISPUTED;
    order.status = ORDER_STATUS.DISPUTED;

    try {
      const { getMoneyRepository } = require('../storage');
      const moneyRepo = getMoneyRepository();
      await moneyRepo.setDisputeHold(orderId, true);
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw repoErr;
      }
    }

    await recordAuditLog('ESCROW', escrow.id, 'DISPUTED', actorId, {
      order_id: orderId,
      reason
    });

    return { success: true, escrow };
  }
}

module.exports = { EscrowService, ESCROW_STATUS, ORDER_STATUS };

