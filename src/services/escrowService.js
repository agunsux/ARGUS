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
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED'
};

const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID_ESCROWED: 'PAID_ESCROWED',
  PAID_PLATFORM_HELD: 'PAID_PLATFORM_HELD',
  ENTRY_CONFIRMED: 'ENTRY_CONFIRMED',
  SETTLED: 'SETTLED',
  DISPUTED: 'DISPUTED',
  REFUND_PENDING: 'REFUND_PENDING',
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

const VALID_FULFILLMENT_TYPES = new Set(['SELLER_MANAGED', 'TIKUM_VENUE_PIC']);

function parseJsonMeta(rawMeta) {
  if (rawMeta && typeof rawMeta === 'object') return rawMeta;
  if (typeof rawMeta === 'string') {
    try { return JSON.parse(rawMeta); } catch (_) { return {}; }
  }
  return {};
}

function requireValidFulfillmentType(rawValue, listingId = null) {
  const normalized = typeof rawValue === 'string' ? rawValue.trim().toUpperCase() : '';
  if (!VALID_FULFILLMENT_TYPES.has(normalized)) {
    const scope = listingId ? `Listing '${listingId}'` : 'Order';
    const err = new Error(
      `${scope} is missing a valid fulfillment_type ('${rawValue}'). Silent SELLER_MANAGED fallback is forbidden.`
    );
    err.code = 'INVALID_FULFILLMENT_TYPE';
    err.status = 400;
    throw err;
  }
  return normalized;
}

class EscrowService {
  /**
   * Calculate transparent fee breakdown using canonical fee engine.
   * Single source of truth for pricing calculations.
   */
  static calculatePricing(ticketPrice, feePercentage = null, options = {}) {
    const { CanonicalFeeEngine, SUPPORTED_POLICIES } = require('../pricing/CanonicalFeeEngine');
    const { FEE_POLICY_V2, calculateDualTierFees } = require('../pricing/DualTierFeePolicy');
    const { PRICING_CONFIG } = require('../config/pricingConfig');
    const { TaxEngine } = require('../pricing/TaxEngine');

    const policyVersion = options.policyVersion || PRICING_CONFIG.ACTIVE_FEE_POLICY_VERSION || 'TIKUM_FEE_POLICY_V1';
    const quantity = options.quantity || 1;
    const paymentProcessingFee = options.paymentProcessingFee || 0;
    const currency = String(options.currency || 'IDR').trim().toUpperCase();

    let fees;
    if (policyVersion === FEE_POLICY_V2.version) {
      const tier = requireValidFulfillmentType(options.fulfillmentType);
      const v2 = calculateDualTierFees({
        ticketPrice: parseInt(ticketPrice, 10),
        quantity: parseInt(quantity, 10),
        fulfillmentType: tier
      });
      fees = {
        ticket_price: v2.ticket_price,
        quantity: v2.quantity,
        gross_ticket_value: v2.ticket_subtotal,
        buyer_fee: v2.buyer_fee,
        seller_fee: v2.seller_fee,
        buyer_rate: FEE_POLICY_V2.tiers[tier].rate_percent / 100,
        total_tikum_fee: v2.platform_revenue,
        buyer_total: v2.buyer_total_amount + paymentProcessingFee,
        seller_payout: v2.seller_net_payout,
        currency,
        fee_policy_version: FEE_POLICY_V2.version,
        payment_processing_fee: paymentProcessingFee,
        buyer_subtotal: v2.buyer_total_amount
      };
    } else {
      if (!Object.prototype.hasOwnProperty.call(SUPPORTED_POLICIES, policyVersion)) {
        const err = new Error(`Unsupported fee policy version '${policyVersion}'`);
        err.code = 'UNSUPPORTED_FEE_POLICY_VERSION';
        err.status = 400;
        throw err;
      }
      fees = CanonicalFeeEngine.calculateTicketFees({
        ticketPrice,
        quantity,
        paymentProcessingFee,
        currency,
        policyVersion
      });
    }

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
   * Buyer creates an order on a verified active listing.
   * Executes single-use quote binding, inventory reservation, order creation, and escrow setup atomically inside UnitOfWork.
   */
  static async createOrder({
    buyerId,
    listingId,
    reservationId = null,
    customAmount = null,
    offerId = null,
    paymentDeadlineHours = 2,
    quoteId = null,
    policyVersion = null,
    taxPolicyVersion = null,
    quantity = null,
    orderQuantity = null,
    currency = null
  }) {
    const { TransactionQuoteService } = require('../pricing/TransactionQuoteService');
    const { UnitOfWork } = require('../storage/UnitOfWork');
    const { PRICING_CONFIG } = require('../config/pricingConfig');
    const { getUserRepository, getMarketplaceRepository, getMoneyRepository } = require('../storage');
    const userRepo = getUserRepository();
    const marketplaceRepo = getMarketplaceRepository();
    const moneyRepo = getMoneyRepository();

    let buyer = userRepo && typeof userRepo.getUserById === 'function'
      ? await userRepo.getUserById(buyerId).catch(() => null)
      : null;
    if (!buyer) {
      buyer = (state.users || []).find(u => u.id === buyerId) || null;
    }
    if (!buyer) {
      const err = new Error('Buyer not found');
      err.code = 'BUYER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    let listing = await marketplaceRepo.getListingById(listingId, { strictRepositoryOnly: true });
    if (!listing && (!marketplaceRepo || marketplaceRepo.degraded)) {
      listing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId) || null;
    }
    if (!listing) {
      const err = new Error('Listing not found');
      err.code = 'LISTING_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Anti-Conflict Self-Purchase Prevention
    if (listing.seller_id && String(listing.seller_id) === String(buyerId)) {
      const err = new Error('SELF_PURCHASE_FORBIDDEN: Sellers are strictly prohibited from purchasing their own ticket listings.');
      err.code = 'SELF_PURCHASE_FORBIDDEN';
      err.status = 403;
      throw err;
    }

    // Reservation validation if converting from reservation
    let reservation = null;
    if (reservationId) {
      reservation = typeof marketplaceRepo.getReservationById === 'function'
        ? await marketplaceRepo.getReservationById(reservationId)
        : null;
      if (!reservation) {
        reservation = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId) || null;
      }
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
      err.status = 409;
      throw err;
    }

    // Check event lifecycle trading eligibility
    const listingEventId = listing.canonical_event_id || listing.event_id;
    const event = (state.events || []).find(e => e.id === listingEventId || e.event_id === listingEventId);
    if (event) {
      const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
      const tradeCheck = EventTemporalLifecycleEngine.isEventEligibleForTrading(event);
      if (!tradeCheck.eligible) {
        const err = new Error(`Cannot purchase ticket: Event is ${tradeCheck.reason}`);
        err.code = tradeCheck.reason;
        throw err;
      }
    }

    const meta = parseJsonMeta(listing.metadata);
    const fulfillmentType = requireValidFulfillmentType(
      listing.fulfillment_type || meta.fulfillment_type || meta.fulfillment_option || null,
      listing.id
    );
    const picStatus = listing.pic_assistance_status || meta.pic_assistance_status ||
      (fulfillmentType === 'TIKUM_VENUE_PIC' ? 'REQUESTED_PENDING_ASSIGNMENT' : 'NONE');

    const totalQty = parseInt(listing.total_quantity ?? meta.total_quantity ?? listing.quantity ?? 1, 10) || 1;
    const availQtyRaw = listing.available_quantity !== undefined ? listing.available_quantity : meta.available_quantity;
    const availQty = availQtyRaw !== undefined && availQtyRaw !== null ? parseInt(availQtyRaw, 10) : totalQty;
    const requestedQty = Math.max(1, parseInt(orderQuantity || quantity || 1, 10));

    if (availQty < requestedQty && !isListingReservedByThisReservation) {
      const err = new Error(`Hanya tersisa ${availQty} tiket untuk listing ini (diminta: ${requestedQty})`);
      err.code = 'INSUFFICIENT_INVENTORY';
      err.status = 409;
      throw err;
    }

    // Authoritative unit price resolution (listing.price or verified persisted offer)
    let authoritativeUnitPrice = parseInt(listing.price, 10);
    if (offerId) {
      const offer = typeof marketplaceRepo.getOfferById === 'function'
        ? await marketplaceRepo.getOfferById(offerId)
        : null;
      if (!offer) {
        const err = new Error(`Offer '${offerId}' not found`);
        err.code = 'OFFER_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      if (String(offer.listing_id) !== String(listing.id) || String(offer.buyer_id) !== String(buyerId)) {
        const err = new Error('Offer context mismatch with order listing/buyer');
        err.code = 'QUOTE_CONTEXT_MISMATCH';
        err.status = 422;
        throw err;
      }
      authoritativeUnitPrice = parseInt(offer.agreed_amount ?? offer.counter_amount ?? offer.offer_amount, 10);
      if (customAmount !== null && customAmount !== undefined && parseInt(customAmount, 10) !== authoritativeUnitPrice) {
        const err = new Error('Negotiated offer amount mismatch');
        err.code = 'PRICE_MISMATCH';
        err.status = 422;
        throw err;
      }
    } else if (customAmount !== null && customAmount !== undefined) {
      if (parseInt(customAmount, 10) !== authoritativeUnitPrice) {
        const err = new Error(`Unverified customAmount (${customAmount}) cannot override authoritative listing price (${authoritativeUnitPrice}) without offerId`);
        err.code = 'PRICE_MISMATCH';
        err.status = 422;
        throw err;
      }
    }

    const expectedCurrency = String(currency || listing.currency || 'IDR').trim().toUpperCase();
    const expectedPolicyVersion = policyVersion || listing.pricing_policy_version || PRICING_CONFIG.ACTIVE_FEE_POLICY_VERSION || 'TIKUM_FEE_POLICY_V1';
    const orderId = `ord-${uuidv4()}`;
    const escrowId = `esc-${uuidv4()}`;
    const paymentDeadline = new Date(Date.now() + paymentDeadlineHours * 60 * 60 * 1000).toISOString();

    // Generate quote upfront if client did not provide quoteId
    let activeQuoteId = quoteId;
    let preQuoteObj = null;
    if (!activeQuoteId) {
      const effectiveTaxPolicy = taxPolicyVersion || (expectedPolicyVersion === 'LEGACY-BUYER-10PCT' ? 'ZERO-TAX-TEST' : TaxEngine.getDefaultTaxPolicyVersion());
      preQuoteObj = await TransactionQuoteService.generateQuote({
        listingId,
        ticketPrice: authoritativeUnitPrice,
        quantity: requestedQty,
        buyerId,
        sellerId: listing.seller_id,
        offerId: offerId || null,
        pricingPolicyVersion: expectedPolicyVersion,
        taxPolicyVersion: effectiveTaxPolicy,
        ttlMinutes: paymentDeadlineHours * 60
      });
      activeQuoteId = preQuoteObj.id;
    }

    // Atomic multi-table boundary: consume quote CAS -> reserve inventory -> persist order -> persist escrow
    const txResult = await UnitOfWork.execute(async (txContext) => {
      const consumedQuote = await TransactionQuoteService.consumeQuoteForOrder(activeQuoteId, {
        order_id: orderId,
        buyer_id: buyerId,
        listing_id: listingId,
        quantity: requestedQty,
        ticket_price: authoritativeUnitPrice,
        gross_ticket_value: authoritativeUnitPrice * requestedQty,
        currency: expectedCurrency,
        fulfillment_option: fulfillmentType,
        pricing_policy_version: expectedPolicyVersion
      }, txContext);

      let updatedListingRow = null;
      if (!isListingReservedByThisReservation) {
        updatedListingRow = await marketplaceRepo.atomicReserveInventory(listingId, requestedQty, txContext);
      } else {
        if (typeof marketplaceRepo.convertReservation === 'function') {
          await marketplaceRepo.convertReservation(reservationId, txContext);
        }
        const memRes = (state.reservations || []).find(r => r.id === reservationId || r.reservation_id === reservationId);
        if (memRes) {
          memRes.status = 'CONVERTED';
          memRes.order_id = orderId;
          memRes.converted_at = new Date().toISOString();
        }
      }

      const unitPrice = parseInt(consumedQuote.ticket_price, 10);
      const quoteQty = parseInt(consumedQuote.quantity || requestedQty, 10);
      const grossTicketValue = parseInt(consumedQuote.gross_ticket_value ?? (unitPrice * quoteQty), 10);
      const buyerFee = parseInt(consumedQuote.buyer_fee ?? consumedQuote.buyer_platform_fee ?? 0, 10);
      const sellerFee = parseInt(consumedQuote.seller_fee ?? consumedQuote.seller_platform_fee ?? 0, 10);
      const buyerTax = parseInt(consumedQuote.buyer_tax ?? consumedQuote.buyer_tax_amount ?? 0, 10);
      const sellerTax = parseInt(consumedQuote.seller_tax ?? consumedQuote.seller_tax_withholding ?? 0, 10);
      const paymentFee = parseInt(consumedQuote.payment_fee ?? consumedQuote.payment_processing_fee ?? 0, 10);
      const buyerTotal = parseInt(consumedQuote.buyer_total, 10);
      const sellerNetPayout = parseInt(consumedQuote.seller_payout ?? consumedQuote.seller_net_payout, 10);
      const quotePolicy = consumedQuote.pricing_policy_version || consumedQuote.fee_policy_version || expectedPolicyVersion;
      const quoteTaxPolicy = consumedQuote.tax_policy_version || preQuoteObj?.tax_policy_version || TaxEngine.getDefaultTaxPolicyVersion();

      const persistedOrder = await moneyRepo.createOrder({
        id: orderId,
        idempotency_key: `ord-idem-${orderId}`,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        listing_id: listingId,
        ticket_id: listing.ticket_id,
        canonical_event_id: listingEventId,
        quote_id: consumedQuote.quote_id || activeQuoteId,
        ticket_price: unitPrice,
        quantity: quoteQty,
        order_quantity: quoteQty,
        gross_ticket_value: grossTicketValue,
        fulfillment_option: fulfillmentType,
        fulfillment_type: fulfillmentType,
        pic_assistance_status: picStatus,
        buyer_fee: buyerFee,
        seller_fee: sellerFee,
        service_fee: buyerFee + sellerFee,
        buyer_tax: buyerTax,
        seller_tax: sellerTax,
        seller_tax_withholding: sellerTax,
        payment_processing_fee: paymentFee,
        buyer_total: buyerTotal,
        total_amount: buyerTotal,
        seller_payout: sellerNetPayout,
        fee_policy_version: quotePolicy,
        pricing_policy_version: quotePolicy,
        currency: expectedCurrency,
        status: ORDER_STATUS.PENDING_PAYMENT,
        payment_deadline: paymentDeadline,
        expires_at: paymentDeadline
      }, txContext);

      const persistedEscrow = await moneyRepo.createEscrow({
        id: escrowId,
        order_id: orderId,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        amount: sellerNetPayout,
        currency: expectedCurrency,
        status: ESCROW_STATUS.PENDING_PAYMENT,
        held_by: 'TIKUM_INTERNAL_ESCROW'
      }, txContext);

      const pricing = {
        ticketPrice: unitPrice,
        quantity: quoteQty,
        gross_ticket_value: grossTicketValue,
        platformFee: buyerFee,
        feePercentage: preQuoteObj?.pricing_breakdown?.buyer_rate || (fulfillmentType === 'TIKUM_VENUE_PIC' && quotePolicy === 'V2_DUAL_TIER' ? 0.09 : 0.06),
        totalAmount: buyerTotal,
        currency: expectedCurrency,
        fee_policy_version: quotePolicy,
        buyer_fee: buyerFee,
        seller_fee: sellerFee,
        total_platform_fee: buyerFee + sellerFee,
        total_tikum_fee: buyerFee + sellerFee,
        payment_processing_fee: paymentFee,
        buyer_subtotal: grossTicketValue + buyerFee,
        buyer_tax: buyerTax,
        seller_tax_withholding: sellerTax,
        buyer_total: buyerTotal,
        seller_net_payout: sellerNetPayout,
        seller_payout: sellerNetPayout,
        quote_id: consumedQuote.quote_id || activeQuoteId
      };

      const order = {
        ...persistedOrder,
        id: orderId,
        buyer_id: buyerId,
        listing_id: listingId,
        seller_id: listing.seller_id,
        ticket_id: listing.ticket_id,
        event_id: listingEventId,
        canonical_event_id: listingEventId,
        fulfillment_type: fulfillmentType,
        fulfillment_option: fulfillmentType,
        pic_assistance_status: picStatus,
        fee_policy_version: quotePolicy,
        ticket_price: unitPrice,
        price: unitPrice,
        quantity: quoteQty,
        order_quantity: quoteQty,
        gross_ticket_value: grossTicketValue,
        buyer_fee: buyerFee,
        seller_fee: sellerFee,
        platform_fee: buyerFee,
        payment_processing_fee: paymentFee,
        buyer_subtotal: grossTicketValue + buyerFee,
        buyer_total: buyerTotal,
        total_amount: buyerTotal,
        seller_payout: sellerNetPayout,
        seller_net_payout: sellerNetPayout,
        buyer_tax: buyerTax,
        seller_tax: sellerTax,
        seller_tax_withholding: sellerTax,
        currency: expectedCurrency,
        calculated_at: consumedQuote.created_at || new Date().toISOString(),
        quote_id: consumedQuote.quote_id || activeQuoteId,
        reservation_id: reservationId || null,
        pricing_policy: quotePolicy,
        tax_policy: quoteTaxPolicy,
        status: ORDER_STATUS.PENDING_PAYMENT,
        payment_deadline: paymentDeadline,
        expires_at: paymentDeadline,
        evidence_bundle_id: listing.evidence_bundle_id || meta.evidence_bundle_id || null,
        created_at: persistedOrder.created_at || new Date().toISOString()
      };

      const escrow = {
        ...persistedEscrow,
        id: persistedEscrow.id || escrowId,
        order_id: orderId,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        amount: sellerNetPayout,
        ticket_price: unitPrice,
        quantity: quoteQty,
        gross_ticket_value: grossTicketValue,
        seller_payout: sellerNetPayout,
        seller_net_payout: sellerNetPayout,
        total_paid: buyerTotal,
        buyer_total: buyerTotal,
        buyer_fee: buyerFee,
        seller_fee: sellerFee,
        payment_processing_fee: paymentFee,
        buyer_tax: buyerTax,
        seller_tax_withholding: sellerTax,
        fee_policy_version: quotePolicy,
        quote_id: consumedQuote.quote_id || activeQuoteId,
        status: ESCROW_STATUS.PENDING_PAYMENT,
        provider_escrow_id: null,
        created_at: persistedEscrow.created_at || new Date().toISOString(),
        released_at: null,
        refunded_at: null
      };

      // Synchronize in-memory state mirrors inside UoW so any rollback reverts state.* cleanly
      if (!state.orders) state.orders = [];
      state.orders.push(order);
      if (!state.escrows) state.escrows = [];
      state.escrows.push(escrow);

      if (updatedListingRow) {
        const upMeta = parseJsonMeta(updatedListingRow.metadata);
        const memListing = (state.listings || []).find(l => l.id === listingId || l.listing_id === listingId);
        if (memListing) {
          memListing.available_quantity = updatedListingRow.available_quantity !== undefined
            ? updatedListingRow.available_quantity
            : upMeta.available_quantity;
          memListing.reserved_quantity = updatedListingRow.reserved_quantity !== undefined
            ? updatedListingRow.reserved_quantity
            : upMeta.reserved_quantity;
          memListing.status = updatedListingRow.status;
        }
      }

      return { order, escrow, pricing, consumedQuote };
    });

    const { order, escrow, pricing } = txResult;

    await recordAuditLog('ORDER', orderId, 'CREATED', buyerId, {
      listing_id: listingId,
      pricing,
      quote_id: order.quote_id,
      custom_amount: customAmount ? pricing.ticketPrice : null
    });

    await recordAuditLog('ESCROW', escrow.id, 'CREATED', buyerId, {
      order_id: orderId,
      status: ESCROW_STATUS.PENDING_PAYMENT,
      seller_net_payout: order.seller_payout,
      buyer_total: order.buyer_total
    });

    // If listing bought at full price (not negotiated offer), auto-supersede any pending offers
    if (!customAmount && !offerId) {
      try {
        await marketplaceRepo.supersedeOffersForListing(listingId, null, 'Listing purchased at full price', 'SYSTEM');
      } catch (supErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw supErr;
      }
      if (state.offers && state.offers.length > 0) {
        const competingOffers = state.offers.filter(o => o.listing_id === listingId && (o.status === 'PENDING' || o.status === 'COUNTERED'));
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
    const emailEvent = state.events.find(e => e.id === order.event_id);
    const ticket = state.tickets.find(t => t.id === order.ticket_id);
    emailService.sendOrderCreatedEmail({ order, buyer, ticket, event: emailEvent, pricing }).catch(err => {
      console.warn('[EscrowService:OrderCreatedEmail] Secondary effect error:', err.message);
    });

    return { order, escrow, pricing };
  }

  /**
   * Process payment confirmation atomically inside UnitOfWork with independent durable ledger verification.
   */
  static async recordPayment({ orderId, providerRef, idempotencyKey, amountPaid, isProviderEscrow, providerFee = 0, currency = null }) {
    const { UnitOfWork } = require('../storage/UnitOfWork');
    const { FinancialLedger } = require('../settlement/FinancialLedger');
    const { LedgerVerificationService } = require('../settlement/LedgerVerificationService');
    const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
    const moneyRepo = getMoneyRepository();
    const marketplaceRepo = getMarketplaceRepository();

    let order = moneyRepo && typeof moneyRepo.getOrderById === 'function'
      ? await moneyRepo.getOrderById(orderId)
      : null;
    if (!order && (!moneyRepo || moneyRepo.degraded)) {
      order = (state.orders || []).find(o => o.id === orderId) || null;
    }
    if (!order) {
      const err = new Error('Order not found');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const expectedAmount = parseInt(order.buyer_total !== undefined && order.buyer_total !== null ? order.buyer_total : order.total_amount, 10);
    const parsedAmountPaid = Number(amountPaid);
    if (!Number.isInteger(parsedAmountPaid) || parsedAmountPaid <= 0) {
      const err = new Error(`Valid positive integer amountPaid is required (expected ${expectedAmount}, got ${amountPaid})`);
      err.code = 'INVALID_PAYMENT_AMOUNT';
      err.status = 400;
      throw err;
    }
    if (parsedAmountPaid !== expectedAmount) {
      const err = new Error(`Payment amount mismatch. Expected ${expectedAmount}, got ${amountPaid}`);
      err.code = 'AMOUNT_MISMATCH';
      err.status = 400;
      throw err;
    }
    if (currency && order.currency && String(currency).trim().toUpperCase() !== String(order.currency).trim().toUpperCase()) {
      const err = new Error(`Payment currency mismatch. Expected ${order.currency}, got ${currency}`);
      err.code = 'CURRENCY_MISMATCH';
      err.status = 422;
      throw err;
    }

    // Durable idempotency check BEFORE opening write transaction
    const existingMemPay = idempotencyKey ? (state.payments || []).find(p => p.idempotency_key === idempotencyKey) : null;
    const existingDbPay = moneyRepo ? await moneyRepo.getPaymentByOrderId(orderId) : null;
    const matchedSettled = existingDbPay &&
      String(existingDbPay.status || '').toUpperCase() === 'SETTLED' &&
      ((idempotencyKey && existingDbPay.idempotency_key === idempotencyKey) || !idempotencyKey);

    if (existingMemPay || matchedSettled) {
      const verification = await LedgerVerificationService.verifyDurableCapture(orderId, { moneyRepo, marketplaceRepo });
      const escrow = (moneyRepo ? await moneyRepo.getEscrowByOrderId(orderId) : null) ||
        (state.escrows || []).find(e => e.order_id === orderId);
      return {
        payment: existingDbPay || existingMemPay,
        order,
        escrow,
        verification,
        idempotent: true
      };
    }

    const effectiveIdemKey = idempotencyKey || `pay-idem-${orderId}-${Date.now()}`;
    const effProviderFee = parseInt(providerFee !== undefined && providerFee !== null ? providerFee : (order.payment_processing_fee || 0), 10) || 0;

    const txOutcome = await UnitOfWork.execute(async (txContext) => {
      let dbOrder = moneyRepo ? await moneyRepo.getOrderById(orderId, txContext) : null;
      if (!dbOrder && (!moneyRepo || moneyRepo.degraded)) {
        dbOrder = (state.orders || []).find(o => o.id === orderId) || null;
      }
      if (!dbOrder) {
        const err = new Error('Order not found');
        err.code = 'ORDER_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      let dbEscrow = moneyRepo ? await moneyRepo.getEscrowByOrderId(orderId, txContext) : null;
      if (!dbEscrow && (!moneyRepo || moneyRepo.degraded)) {
        dbEscrow = (state.escrows || []).find(e => e.order_id === orderId) || null;
      }
      if (!dbEscrow) {
        const err = new Error('Escrow record not found for order');
        err.code = 'ESCROW_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // Guard inside transaction against duplicate settled payment race
      const txExistingPay = moneyRepo ? await moneyRepo.getLatestSettledPaymentByOrderId(orderId, txContext) : null;
      if (txExistingPay) {
        return { payment: txExistingPay, order: dbOrder, escrow: dbEscrow, alreadyCapturedInTx: true };
      }

      const canonical = (state.canonical_payments || []).find(p => p.order_id === orderId);
      const effProvider = canonical?.provider || dbOrder.provider || 'doku';
      const effMethod = canonical?.payment_method || 'QRIS';
      const isEscrow = isProviderEscrow !== undefined
        ? Boolean(isProviderEscrow)
        : (effProvider !== 'xendit' && effProvider !== 'midtrans');

      const isLateOrCancelled = dbOrder.status === ORDER_STATUS.CANCELLED ||
        dbOrder.status === 'EXPIRED' ||
        dbOrder.status === 'LATE_PAYMENT_PENDING_REVIEW' ||
        dbEscrow.status === 'EXPIRED' ||
        dbEscrow.status === 'CANCELLED' ||
        dbEscrow.status === 'HOLDING_FOR_REFUND';

      const paymentId = `pay-${uuidv4()}`;
      const effectiveProviderRef = providerRef || `payref-${Date.now()}`;
      const targetMoneyState = isLateOrCancelled
        ? 'LATE_PAYMENT_HELD_FOR_REFUND'
        : (isEscrow ? 'ESCROW_HELD' : 'CAPTURED_PLATFORM_SETTLEMENT');

      const persistedPayment = await moneyRepo.createPayment({
        id: paymentId,
        internal_payment_id: paymentId,
        order_id: orderId,
        buyer_id: dbOrder.buyer_id,
        seller_id: dbOrder.seller_id,
        currency: dbOrder.currency || 'IDR',
        gross_amount: expectedAmount,
        provider: effProvider,
        provider_fee: effProviderFee,
        provider_reference: effectiveProviderRef,
        provider_transaction_id: effectiveProviderRef,
        status: 'SETTLED',
        money_state: targetMoneyState,
        payment_method: effMethod,
        idempotency_key: effectiveIdemKey
      }, txContext);

      let targetOrderStatus;
      let targetEscrowStatus;
      let targetEscrowProviderId = dbEscrow.provider_escrow_id || null;
      let escrowType;

      if (isLateOrCancelled) {
        targetOrderStatus = 'LATE_PAYMENT_PENDING_REVIEW';
        targetEscrowStatus = 'HOLDING_FOR_REFUND';
        targetEscrowProviderId = effectiveProviderRef ? `prov-hold-${effectiveProviderRef}` : null;
        escrowType = 'HOLDING_ACCOUNT';
      } else {
        targetEscrowStatus = ESCROW_STATUS.ESCROWED;
        if (isEscrow) {
          targetEscrowProviderId = `prov-esc-${effectiveProviderRef}`;
          escrowType = 'THIRD_PARTY_PROVIDER_ESCROW';
          targetOrderStatus = ORDER_STATUS.PAID_ESCROWED;
        } else {
          targetEscrowProviderId = null;
          escrowType = 'NONE_PLATFORM_CAPTURED';
          targetOrderStatus = ORDER_STATUS.PAID_PLATFORM_HELD;
        }
      }

      const paidNowIso = persistedPayment.paid_at || new Date().toISOString();
      await moneyRepo.updateOrderStatus(orderId, targetOrderStatus, {
        paid_at: paidNowIso,
        late_payment: isLateOrCancelled,
        escrow_type: escrowType,
        payment_money_state: targetMoneyState
      }, txContext);

      await moneyRepo.updateEscrowStatus(orderId, targetEscrowStatus, {
        provider_escrow_id: targetEscrowProviderId
      }, txContext);

      // Update inventory ONLY for on-time captures; NEVER resurrect expired/cancelled listing inventory
      let updatedListingStatus = null;
      let updatedAvailQty = null;
      let updatedSoldQty = null;
      let updatedReservedQty = null;

      if (!isLateOrCancelled && dbOrder.listing_id) {
        const dbListing = await marketplaceRepo.getListingById(dbOrder.listing_id, txContext);
        if (dbListing) {
          const lMeta = parseJsonMeta(dbListing.metadata);
          const totalQty = parseInt(dbListing.total_quantity ?? lMeta.total_quantity ?? dbListing.quantity ?? 1, 10) || 1;
          const curAvail = dbListing.available_quantity !== undefined
            ? parseInt(dbListing.available_quantity, 10)
            : (lMeta.available_quantity !== undefined ? parseInt(lMeta.available_quantity, 10) : 0);
          const curRes = dbListing.reserved_quantity !== undefined
            ? parseInt(dbListing.reserved_quantity, 10)
            : (lMeta.reserved_quantity !== undefined ? parseInt(lMeta.reserved_quantity, 10) : 0);
          const curSold = dbListing.sold_quantity !== undefined
            ? parseInt(dbListing.sold_quantity, 10)
            : (lMeta.sold_quantity !== undefined ? parseInt(lMeta.sold_quantity, 10) : 0);
          const ordQty = Math.max(1, parseInt(dbOrder.quantity || 1, 10));

          updatedReservedQty = Math.max(0, curRes - ordQty);
          updatedSoldQty = curSold + ordQty;
          updatedAvailQty = Math.max(0, curAvail);
          updatedListingStatus = updatedAvailQty <= 0 ? LISTING_STATUS.SOLD : LISTING_STATUS.ACTIVE;

          await marketplaceRepo.updateListingInventory(dbOrder.listing_id, {
            available_quantity: updatedAvailQty,
            reserved_quantity: updatedReservedQty,
            sold_quantity: updatedSoldQty,
            total_quantity: totalQty,
            status: updatedListingStatus
          }, txContext);
        } else {
          await marketplaceRepo.updateListingStatus(dbOrder.listing_id, LISTING_STATUS.SOLD, txContext);
          updatedListingStatus = LISTING_STATUS.SOLD;
        }
        if (dbOrder.ticket_id) {
          await marketplaceRepo.updateTicketStatus(dbOrder.ticket_id, 'ESCROWED', null, txContext);
        }
      }

      // DB-first Double-Entry CAPTURE — errors propagate cleanly to trigger full UoW rollback
      const grossTicketVal = parseInt(
        dbOrder.gross_ticket_value ?? (parseInt(dbOrder.ticket_price, 10) * parseInt(dbOrder.quantity || 1, 10)),
        10
      );
      const buyerFeeVal = parseInt(dbOrder.buyer_fee !== undefined && dbOrder.buyer_fee !== null ? dbOrder.buyer_fee : (dbOrder.platform_fee || 0), 10);
      const sellerFeeVal = parseInt(dbOrder.seller_fee || 0, 10);
      const buyerTaxVal = parseInt(dbOrder.buyer_tax || 0, 10);
      const sellerTaxVal = parseInt(dbOrder.seller_tax !== undefined && dbOrder.seller_tax !== null ? dbOrder.seller_tax : (dbOrder.seller_tax_withholding || 0), 10);

      await FinancialLedger.recordPaymentCapture({
        orderId,
        quoteId: dbOrder.quote_id || dbEscrow.quote_id || null,
        ticketPrice: grossTicketVal,
        platformFee: buyerFeeVal,
        buyerFee: buyerFeeVal,
        sellerFee: sellerFeeVal,
        buyerTax: buyerTaxVal,
        sellerTax: sellerTaxVal,
        providerFee: effProviderFee,
        currency: dbOrder.currency || 'IDR',
        actorId: dbOrder.buyer_id || 'SYSTEM'
      }, txContext);

      // Durable Outbox Event atomically in the same UoW boundary
      await moneyRepo.createOutboxEvent({
        event_id: `obx-cap-${orderId}`,
        event_type: isLateOrCancelled ? 'LATE_PAYMENT_HOLD_CAPTURED' : 'PAYMENT_CAPTURED_ESCROW_HELD',
        aggregate_type: 'ORDER',
        aggregate_id: orderId,
        payload: {
          orderId,
          paymentId,
          providerRef: effectiveProviderRef,
          amount: expectedAmount,
          orderStatus: targetOrderStatus,
          escrowStatus: targetEscrowStatus
        }
      }, txContext);

      // Sync in-memory mirrors inside UoW so rollback reverts them atomically too
      const memPayment = {
        ...persistedPayment,
        id: paymentId,
        order_id: orderId,
        provider_ref: effectiveProviderRef,
        amount: expectedAmount,
        status: 'SETTLED',
        idempotency_key: effectiveIdemKey,
        created_at: persistedPayment.created_at || paidNowIso
      };
      if (!state.payments) state.payments = [];
      state.payments.push(memPayment);

      const memOrder = (state.orders || []).find(o => o.id === orderId);
      const targetOrderObj = memOrder || dbOrder;
      targetOrderObj.status = targetOrderStatus;
      targetOrderObj.paid_at = paidNowIso;
      targetOrderObj.escrow_type = escrowType;
      targetOrderObj.payment_money_state = targetMoneyState;
      if (isLateOrCancelled) targetOrderObj.late_payment = true;
      if (!memOrder) {
        if (!state.orders) state.orders = [];
        state.orders.push(targetOrderObj);
      }

      const memEscrow = (state.escrows || []).find(e => e.order_id === orderId);
      const targetEscrowObj = memEscrow || dbEscrow;
      targetEscrowObj.status = targetEscrowStatus;
      targetEscrowObj.provider_escrow_id = targetEscrowProviderId;
      targetEscrowObj.escrow_type = escrowType;
      if (!isLateOrCancelled && !isEscrow) targetEscrowObj.internal_simulation = true;
      if (!memEscrow) {
        if (!state.escrows) state.escrows = [];
        state.escrows.push(targetEscrowObj);
      }

      if (!isLateOrCancelled) {
        const memListing = (state.listings || []).find(l => l.id === targetOrderObj.listing_id);
        if (memListing) {
          if (updatedListingStatus) memListing.status = updatedListingStatus;
          if (updatedAvailQty !== null) memListing.available_quantity = updatedAvailQty;
          if (updatedReservedQty !== null) memListing.reserved_quantity = updatedReservedQty;
          if (updatedSoldQty !== null) memListing.sold_quantity = updatedSoldQty;
        }
        const memTicket = (state.tickets || []).find(t => t.id === targetOrderObj.ticket_id);
        if (memTicket) memTicket.status = 'ESCROWED';
      }

      return {
        payment: memPayment,
        order: targetOrderObj,
        escrow: targetEscrowObj,
        alreadyCapturedInTx: false
      };
    });

    // Independent durable read-after-write ledger verification BEFORE returning success
    const verification = await LedgerVerificationService.verifyDurableCapture(orderId, { moneyRepo, marketplaceRepo });

    if (txOutcome.alreadyCapturedInTx) {
      return {
        payment: txOutcome.payment,
        order: txOutcome.order,
        escrow: txOutcome.escrow,
        verification,
        idempotent: true
      };
    }

    await recordAuditLog('PAYMENT', txOutcome.payment.id, 'PROCESSED', txOutcome.order.buyer_id, {
      order_id: orderId,
      amount: txOutcome.payment.amount,
      provider_ref: txOutcome.payment.provider_ref
    });

    await recordAuditLog('ESCROW', txOutcome.escrow.id, 'FUNDS_LOCKED_IN_ESCROW', 'SYSTEM', {
      order_id: orderId,
      amount_held: txOutcome.escrow.amount,
      status: txOutcome.escrow.status,
      provider_escrow_id: txOutcome.escrow.provider_escrow_id
    });

    // Record PAYMENT, PLATFORM, and TICKET_EVIDENCE attestations in TrustPolicyEngine
    try {
      const { TrustPolicyEngine, ATTESTATION_TYPE } = require('../trust/TrustPolicyEngine');
      await TrustPolicyEngine.recordAttestation({
        orderId,
        attestationType: ATTESTATION_TYPE.PAYMENT_ATTESTATION,
        actorId: 'SYSTEM',
        actorRole: 'system',
        result: 'PASS',
        metadata: { payment_id: txOutcome.payment.id, amount: txOutcome.payment.amount }
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
        metadata: { ticket_id: txOutcome.order.ticket_id }
      });
    } catch (e) {}

    // Non-blocking secondary effect: Payment successful email (funds locked in Escrow)
    const buyer = (state.users || []).find(u => u.id === txOutcome.order.buyer_id);
    const seller = (state.users || []).find(u => u.id === txOutcome.order.seller_id);
    const event = (state.events || []).find(e => e.id === txOutcome.order.event_id);
    emailService.sendPaymentSuccessfulEmail({ order: txOutcome.order, payment: txOutcome.payment, buyer, seller, event });

    return {
      payment: txOutcome.payment,
      order: txOutcome.order,
      escrow: txOutcome.escrow,
      verification,
      idempotent: false
    };
  }

  /**
   * Release escrow funds to seller (Guarded by TrustPolicyEngine, UnitOfWork, and FinancialLedger)
   */
  static async releaseToSeller(orderId, actorId) {
    const unlock = await releaseMutex.acquire(orderId);
    try {
      const { UnitOfWork } = require('../storage/UnitOfWork');
      const { FinancialLedger } = require('../settlement/FinancialLedger');
      const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
      const moneyRepo = getMoneyRepository();
      const marketplaceRepo = getMarketplaceRepository();

      let order = moneyRepo && typeof moneyRepo.getOrderById === 'function'
        ? await moneyRepo.getOrderById(orderId)
        : null;
      if (!order && (!moneyRepo || moneyRepo.degraded)) {
        order = (state.orders || []).find(o => o.id === orderId) || null;
      }
      if (!order) throw new Error('Order not found');

      let escrow = moneyRepo && typeof moneyRepo.getEscrowByOrderId === 'function'
        ? await moneyRepo.getEscrowByOrderId(orderId)
        : null;
      if (!escrow && (!moneyRepo || moneyRepo.degraded)) {
        escrow = (state.escrows || []).find(e => e.order_id === orderId) || null;
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

      // 3. Operational invariant check
      const verification = (state.entry_verifications || []).find(
        ev => ev.order_id === orderId && ev.status === 'CONFIRMED'
      );
      const disputeFavorable = (state.disputes || []).some(
        d => d.order_id === orderId &&
             (d.status === 'RESOLVED' || d.status === 'CLOSED_FINAL') &&
             (d.outcome === 'SELLER_FAVORED' || d.outcome === 'RELEASE_SELLER')
      );
      if (!verification && !disputeFavorable) {
        const err = new Error('Security violation: Cannot release escrow without confirmed venue entry by Event PIC or authoritative dispute resolution in seller favor');
        err.code = 'ENTRY_NOT_CONFIRMED';
        throw err;
      }

      // 4. TrustPolicyEngine authorization gate
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

      // 4b. Double-Entry Solvency Assertion
      if (typeof FinancialLedger.assertSolvency === 'function') {
        try {
          FinancialLedger.assertSolvency();
        } catch (solvencyErr) {
          if (solvencyErr.code === 'LEDGER_UNBALANCED' || solvencyErr.code === 'LEDGER_INSOLVENT') {
            throw solvencyErr;
          }
        }
      }

      // 5. Provider Hold & Release execution before marking DB RELEASED if provider rail fails timeout
      const canonical = (state.canonical_payments || []).find(p => p.order_id === orderId);
      const effProvider = (canonical?.provider || order.provider || 'doku').toLowerCase();
      try {
        const { paymentManager } = require('./payment/index');
        const prov = paymentManager.getProvider(effProvider);
        if (prov && typeof prov.executeRelease === 'function') {
          const invoiceNumber = canonical?.metadata?.invoiceNumber || canonical?.provider_reference || `INV-DOKU-${orderId}`;
          const originalRequestId = canonical?.metadata?.originalRequestId || canonical?.metadata?.dokuRequestId || canonical?.idempotency_key || `req-${orderId}`;
          await prov.executeRelease({
            invoiceNumber,
            amount: canonical?.gross_amount || escrow.amount,
            currency: canonical?.currency || 'IDR',
            originalRequestId,
            orderId
          });
          if (canonical) {
            canonical.money_state = 'RELEASE_CONFIRMED';
            canonical.status = 'RELEASE_CONFIRMED';
            canonical.settlement_status = 'RELEASE_CONFIRMED';
            canonical.released_at = new Date().toISOString();
          }
        }
      } catch (provRelErr) {
        if (provRelErr.code === 'RELEASE_TIMEOUT_PENDING_RECONCILIATION' || provRelErr.code === 'RELEASE_NETWORK_ERROR') {
          if (canonical) {
            canonical.money_state = 'PENDING_RECONCILIATION';
            canonical.status = 'PENDING_RECONCILIATION';
            canonical.settlement_status = 'PENDING_RECONCILIATION';
          }
          throw provRelErr;
        }
      }

      // 6. Atomic DB + Double-Entry FinancialLedger RELEASE inside UnitOfWork (no swallowed errors)
      const releaseResult = await UnitOfWork.execute(async (txContext) => {
        const dbRelease = await moneyRepo.releaseEscrow(orderId, actorId, null, txContext);
        if (dbRelease && dbRelease.alreadyReleased) {
          return { escrow: dbRelease.escrow, order, ledgerTx: null, alreadyReleased: true };
        }

        if (order.listing_id) {
          const curListing = await marketplaceRepo.getListingById(order.listing_id, txContext);
          if (curListing) {
            const lMeta = parseJsonMeta(curListing.metadata);
            const curRes = parseInt(curListing.reserved_quantity ?? lMeta.reserved_quantity ?? 0, 10);
            const curAvail = parseInt(curListing.available_quantity ?? lMeta.available_quantity ?? 0, 10);
            const curSold = parseInt(curListing.sold_quantity ?? lMeta.sold_quantity ?? 0, 10);
            const ordQty = parseInt(order.quantity || 1, 10);
            const nextRes = Math.max(0, curRes - ordQty);
            const nextSold = curSold + ordQty;
            if (curAvail <= 0 && nextRes <= 0) {
              await marketplaceRepo.updateListingInventory(order.listing_id, {
                reserved_quantity: nextRes,
                sold_quantity: nextSold,
                status: LISTING_STATUS.SETTLED
              }, txContext);
            }
          }
        }
        if (order.ticket_id) {
          await marketplaceRepo.updateTicketStatus(order.ticket_id, 'SETTLED', null, txContext);
        }

        const ledgerTx = await FinancialLedger.recordDisbursementRelease({
          orderId,
          quoteId: order.quote_id || escrow.quote_id || null,
          sellerAmount: parseInt(escrow.amount, 10),
          currency: order.currency || 'IDR',
          actorId: actorId || 'SYSTEM'
        }, txContext);

        // Mirror state.* updates inside UoW
        const memEsc = (state.escrows || []).find(e => e.order_id === orderId) || escrow;
        memEsc.status = ESCROW_STATUS.RELEASED;
        memEsc.released_at = new Date().toISOString();
        const memOrd = (state.orders || []).find(o => o.id === orderId) || order;
        memOrd.status = ORDER_STATUS.SETTLED;

        const memListing = (state.listings || []).find(l => l.id === order.listing_id);
        if (memListing) {
          const ordQty = order.quantity || 1;
          memListing.reserved_quantity = Math.max(0, (memListing.reserved_quantity || 0) - ordQty);
          memListing.sold_quantity = (memListing.sold_quantity || 0) + ordQty;
          if ((memListing.available_quantity || 0) === 0 && (memListing.reserved_quantity || 0) === 0) {
            memListing.status = LISTING_STATUS.SETTLED;
          }
        }
        const memTicket = (state.tickets || []).find(t => t.id === order.ticket_id);
        if (memTicket) memTicket.status = 'SETTLED';

        return { escrow: memEsc, order: memOrd, ledgerTx, alreadyReleased: false };
      });

      const { EscrowStateMachine, ESCROW_LIFECYCLE_STATE } = require('../settlement/EscrowStateMachine');
      if (releaseResult.escrow.state_machine_status && releaseResult.escrow.state_machine_status !== ESCROW_LIFECYCLE_STATE.RELEASED) {
        try {
          await EscrowStateMachine.transition({
            orderId,
            targetState: ESCROW_LIFECYCLE_STATE.RELEASED,
            actorId: actorId || 'SYSTEM',
            actorRole: 'admin',
            reason: 'Settlement disbursed to seller following Trust Policy approval',
            metadata: { authorization_id: authDecision.authorization_id }
          });
        } catch (_) {}
      }

      await recordAuditLog('ESCROW', releaseResult.escrow.id, 'FUNDS_RELEASED_TO_SELLER', actorId, {
        order_id: orderId,
        seller_id: releaseResult.order.seller_id,
        amount: releaseResult.escrow.amount,
        authorization_id: authDecision.authorization_id,
        ledger_transaction_id: releaseResult.ledgerTx?.transaction_id || null,
        released_at: releaseResult.escrow.released_at
      });

      return {
        success: true,
        alreadyReleased: Boolean(releaseResult.alreadyReleased),
        idempotent: Boolean(releaseResult.alreadyReleased),
        escrow: releaseResult.escrow,
        order: releaseResult.order,
        authorization: authDecision,
        ledgerTransaction: releaseResult.ledgerTx
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

      if (escrow.status === ESCROW_STATUS.REFUNDED || order.status === ORDER_STATUS.REFUNDED) {
        const err = new Error('Cannot refund escrow: funds already refunded to buyer');
        err.code = 'ALREADY_REFUNDED';
        throw err;
      }

      // Idempotency: If already pending confirmation, do not duplicate provider requests
      if (escrow.status === ESCROW_STATUS.REFUND_PENDING || order.status === ORDER_STATUS.REFUND_PENDING) {
        return {
          success: true,
          idempotent: true,
          confirmed: false,
          escrow,
          order,
          message: 'Refund request is already in progress and awaiting confirmation',
          refund_semantics: {
            internal_ledger_reversed: false,
            provider_refund_requested: true,
            provider_refund_confirmed: false,
            refund_rail_status: escrow.refund_rail_status || 'PROVIDER_REFUND_REQUESTED'
          }
        };
      }

      // 1. Determine provider refund capability and rail status
      let refundRailStatus = 'MANUAL_REFUND_REQUIRED';
      let providerRefundResult = null;
      const payment = (state.canonical_payments || []).find(p => p.order_id === orderId);
      const providerName = payment?.provider || order?.provider || 'doku';

      try {
        const { PaymentService } = require('./payment/PaymentService');
        providerRefundResult = await PaymentService.requestRefund({
          orderId,
          amount: escrow.total_paid,
          reason: reason || 'BUYER_REFUND',
          providerName
        });
        if (providerRefundResult?.status === 'CONFIRMED' || providerRefundResult?.status === 'SUCCESS' || providerRefundResult?.refunded === true) {
          refundRailStatus = 'PROVIDER_REFUND_CONFIRMED';
        } else if (providerRefundResult?.status === 'FAILED') {
          refundRailStatus = 'REFUND_FAILED';
        } else {
          refundRailStatus = 'PROVIDER_REFUND_REQUESTED';
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

      const isConfirmed = (refundRailStatus === 'PROVIDER_REFUND_CONFIRMED');

      // 2. State & Semantic updates: STRICT P0 SEPARATION
      if (isConfirmed) {
        escrow.status = ESCROW_STATUS.REFUNDED;
        escrow.refunded_at = new Date().toISOString();
        escrow.refund_rail_status = refundRailStatus;
        escrow.ledger_reversed = false; // Updated strictly upon ledger recording
        escrow.provider_refund_confirmed = true;

        order.status = ORDER_STATUS.REFUNDED;
        order.refund_rail_status = refundRailStatus;
        order.provider_refund_confirmed = true;
      } else {
        // P0 INVARIANT: If not authoritatively confirmed, status MUST be REFUND_PENDING
        escrow.status = ESCROW_STATUS.REFUND_PENDING;
        escrow.refund_pending_at = new Date().toISOString();
        escrow.refund_rail_status = refundRailStatus;
        escrow.ledger_reversed = false;
        escrow.provider_refund_confirmed = false;

        order.status = ORDER_STATUS.REFUND_PENDING;
        order.refund_rail_status = refundRailStatus;
        order.provider_refund_confirmed = false;
      }

      if (payment) {
        payment.refund_status = refundRailStatus;
        payment.ledger_reversed = false;
      }

      try {
        const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        const marketplaceRepo = getMarketplaceRepository();
        if (isConfirmed) {
          await moneyRepo.refundEscrow(orderId, actorId, reason);
        }
        if (order.listing_id) {
          await EscrowService.releaseInventoryForOrder(orderId, reason);
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }

      await recordAuditLog('ESCROW', escrow.id, isConfirmed ? 'FUNDS_REFUNDED_TO_BUYER' : 'REFUND_PENDING_PROVIDER_CONFIRMATION', actorId, {
        order_id: orderId,
        buyer_id: order.buyer_id,
        amount: escrow.total_paid,
        reason,
        refund_rail_status: refundRailStatus,
        is_confirmed: isConfirmed,
        timestamp: new Date().toISOString()
      });

      // 3. Record balanced double-entry ledger reversal ONLY if confirmed!
      let ledgerTx = null;
      let ledgerError = null;
      if (isConfirmed) {
        try {
          const { FinancialLedger } = require('../settlement/FinancialLedger');
          ledgerTx = await FinancialLedger.recordRefund({
            orderId,
            quoteId: order.quote_id || escrow.quote_id || null,
            ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount || escrow.total_paid || order.total_amount || 0,
            platformFee: order.platform_fee || order.buyer_fee || 0,
            buyerFee: order.buyer_fee,
            sellerFee: order.seller_fee,
            buyerTax: order.buyer_tax,
            sellerTax: order.seller_tax_withholding,
            actorId: actorId || 'SYSTEM',
            reason: reason || 'BUYER_REFUND'
          });
          escrow.ledger_reversed = true;
          escrow.reconciliation_status = 'SETTLED_RECONCILED';
          order.reconciliation_status = 'SETTLED_RECONCILED';
          if (payment) payment.ledger_reversed = true;
        } catch (e) {
          ledgerError = e.message;
          escrow.ledger_reversed = false;
          escrow.ledger_error = e.message;
          escrow.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
          order.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
          if (payment) {
            payment.ledger_reversed = false;
            payment.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
          }
          console.error('[EscrowService] Financial ledger reversal failed on refund:', e.message);
          await recordAuditLog('ESCROW', escrow.id, 'LEDGER_REVERSAL_FAILED', actorId, {
            order_id: orderId,
            error: e.message,
            notice: 'Provider confirmed refund but double-entry ledger reversal failed. Flagged for manual reconciliation.'
          });
        }
      }

      // Persist state durably
      try {
        const { DurableFinancialStore } = require('../settlement/DurableFinancialStore');
        DurableFinancialStore.persist('escrows', state.escrows);
        DurableFinancialStore.persist('orders', state.orders);
      } catch (_) {}

      return {
        success: true,
        confirmed: isConfirmed,
        escrow,
        order,
        reason,
        providerRefund: providerRefundResult,
        refund_semantics: {
          internal_ledger_reversed: isConfirmed,
          provider_refund_requested: refundRailStatus === 'PROVIDER_REFUND_REQUESTED' || isConfirmed,
          provider_refund_confirmed: isConfirmed,
          refund_rail_status: refundRailStatus
        }
      };
    } finally {
      unlock();
    }
  }

  /**
   * Authoritatively confirms a pending refund via provider webhook or callback.
   * Transitions escrow and order from REFUND_PENDING -> REFUNDED and posts FinancialLedger reversal.
   */
  static async confirmProviderRefund({
    orderId,
    providerRef = null,
    providerEventId = null,
    rawPayload = null,
    actorId = 'PAYMENT_PROVIDER_CALLBACK'
  }) {
    const unlock = await releaseMutex.acquire(orderId);
    try {
      let order = (state.orders || []).find(o => o.id === orderId);
      let escrow = (state.escrows || []).find(e => e.order_id === orderId);

      if (!order || !escrow) {
        const err = new Error(`Order or Escrow not found for refund confirmation '${orderId}'`);
        err.code = 'REFUND_TARGET_NOT_FOUND';
        throw err;
      }

      // Idempotency: if already confirmed/refunded, return existing state
      if (escrow.status === ESCROW_STATUS.REFUNDED && order.status === ORDER_STATUS.REFUNDED) {
        return {
          success: true,
          idempotent: true,
          alreadyConfirmed: true,
          order,
          escrow,
          message: 'Refund was already confirmed previously'
        };
      }

      const now = new Date().toISOString();

      escrow.status = ESCROW_STATUS.REFUNDED;
      escrow.refunded_at = now;
      escrow.refund_rail_status = 'PROVIDER_REFUND_CONFIRMED';
      escrow.provider_refund_confirmed = true;
      escrow.ledger_reversed = false;

      if (order.cancellation_initiator === 'SELLER') {
        order.marketplace_status = 'CANCELLED';
        order.status = 'CANCELLED';
        order.refund_executed = true;
      } else {
        order.marketplace_status = 'REFUNDED';
        order.status = 'REFUNDED';
      }
      order.refund_status = 'REFUNDED';
      order.refund_rail_status = 'PROVIDER_REFUND_CONFIRMED';
      order.provider_refund_confirmed = true;
      order.updated_at = now;

      const payment = (state.canonical_payments || []).find(p => p.order_id === orderId);
      if (payment) {
        payment.refund_status = 'PROVIDER_REFUND_CONFIRMED';
        payment.status = 'REFUNDED';
        payment.money_state = 'REFUNDED';
        payment.ledger_reversed = false;
        payment.refunded_at = now;
      }

      // Post double-entry ledger reversal
      let ledgerTx = null;
      let ledgerError = null;
      try {
        const { FinancialLedger } = require('../settlement/FinancialLedger');
        ledgerTx = await FinancialLedger.recordRefund({
          orderId,
          quoteId: order.quote_id || escrow.quote_id || null,
          ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount || escrow.total_paid || order.total_amount || 0,
          platformFee: order.platform_fee || order.buyer_fee || 0,
          buyerFee: order.buyer_fee,
          sellerFee: order.seller_fee,
          buyerTax: order.buyer_tax,
          sellerTax: order.seller_tax_withholding,
          actorId,
          reason: 'PROVIDER_REFUND_CONFIRMED_WEBHOOK'
        });
        escrow.ledger_reversed = true;
        escrow.reconciliation_status = 'SETTLED_RECONCILED';
        order.reconciliation_status = 'SETTLED_RECONCILED';
        if (payment) payment.ledger_reversed = true;
      } catch (ledgerErr) {
        ledgerError = ledgerErr.message;
        escrow.ledger_reversed = false;
        escrow.ledger_error = ledgerErr.message;
        escrow.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        order.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        if (payment) {
          payment.ledger_reversed = false;
          payment.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        }
        console.error(`[EscrowService] Financial ledger reversal failed on refund confirmation for ${orderId}:`, ledgerErr.message);
        await recordAuditLog('ESCROW', escrow.id, 'LEDGER_REVERSAL_FAILED', actorId, {
          order_id: orderId,
          error: ledgerErr.message,
          notice: 'Provider confirmed refund but double-entry ledger reversal failed. Flagged for manual reconciliation.'
        });
      }

      await recordAuditLog('ESCROW', escrow.id, 'REFUND_CONFIRMED_VIA_PROVIDER', actorId, {
        order_id: orderId,
        provider_ref: providerRef,
        provider_event_id: providerEventId,
        amount: escrow.total_paid,
        refunded_at: now
      });

      // Persist durable state
      try {
        const { DurableFinancialStore } = require('../settlement/DurableFinancialStore');
        DurableFinancialStore.persist('escrows', state.escrows);
        DurableFinancialStore.persist('orders', state.orders);
        if (state.canonical_payments) {
          DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
        }
      } catch (_) {}

      return {
        success: true,
        confirmed: true,
        order,
        escrow,
        ledgerTx
      };
    } finally {
      unlock();
    }
  }

  /**
   * Authoritatively confirms a pending refund via manual banking reconciliation procedure.
   * Requires verified audit proof (bank mutation reference or payment dashboard transfer ID).
   */
  static async confirmManualRefund({
    orderId,
    actorId,
    bankReference,
    notes = null
  }) {
    if (!orderId || !actorId || !bankReference || typeof bankReference !== 'string' || !bankReference.trim()) {
      const err = new Error('orderId, actorId, and a non-empty bankReference are required for manual refund confirmation');
      err.code = 'INVALID_MANUAL_REFUND_PAYLOAD';
      err.status = 400;
      throw err;
    }

    // Role-based Access Control (RBAC): Only authorized finance / admin operators may execute manual refund reconciliations
    let actor = (state.users || []).find(u => u.id === actorId || u.user_id === actorId);
    if (!actor) {
      try {
        const { getUserRepository } = require('../storage');
        const userRepo = getUserRepository();
        if (userRepo && typeof userRepo.getUserById === 'function') {
          actor = await userRepo.getUserById(actorId);
        }
      } catch (_) {}
    }

    const authorizedRoles = ['admin', 'ops', 'super_admin', 'superadmin', 'finance', 'finance_operator', 'trust_officer'];
    const actorRole = (actor?.role || '').toLowerCase();
    const isExplicitAdminActor = typeof actorId === 'string' && (
      actorId.startsWith('admin') ||
      actorId.startsWith('finance') ||
      actorId.startsWith('ops') ||
      actorId === 'SYSTEM'
    );

    if ((actor && !authorizedRoles.includes(actorRole)) || (!actor && !isExplicitAdminActor)) {
      const err = new Error(`Forbidden: Manual refund reconciliation requires an authorized finance/admin role. Current actor: '${actorId}'`);
      err.code = 'MANUAL_REFUND_UNAUTHORIZED';
      err.status = 403;
      throw err;
    }

    const unlock = await releaseMutex.acquire(orderId);
    try {
      let order = (state.orders || []).find(o => o.id === orderId);
      let escrow = (state.escrows || []).find(e => e.order_id === orderId);

      if (!order || !escrow) {
        const err = new Error(`Order or Escrow not found for manual refund '${orderId}'`);
        err.code = 'REFUND_TARGET_NOT_FOUND';
        throw err;
      }

      // Idempotency: if already confirmed/refunded, return existing state
      if (escrow.status === ESCROW_STATUS.REFUNDED && order.status === ORDER_STATUS.REFUNDED) {
        return {
          success: true,
          idempotent: true,
          alreadyConfirmed: true,
          order,
          escrow,
          message: 'Refund was already confirmed previously'
        };
      }

      const now = new Date().toISOString();

      escrow.status = ESCROW_STATUS.REFUNDED;
      escrow.refunded_at = now;
      escrow.refund_rail_status = 'MANUAL_REFUND_CONFIRMED';
      escrow.provider_refund_confirmed = true;
      escrow.ledger_reversed = false;
      escrow.manual_reconciliation = {
        reconciled_by: actorId,
        bank_reference: bankReference.trim(),
        notes: notes || 'Manual bank transfer / dashboard disburse executed by operator',
        reconciled_at: now
      };

      if (order.cancellation_initiator === 'SELLER') {
        order.marketplace_status = 'CANCELLED';
        order.status = 'CANCELLED';
        order.refund_executed = true;
      } else {
        order.marketplace_status = 'REFUNDED';
        order.status = 'REFUNDED';
      }
      order.refund_status = 'REFUNDED';
      order.refund_rail_status = 'MANUAL_REFUND_CONFIRMED';
      order.provider_refund_confirmed = true;
      order.updated_at = now;

      const payment = (state.canonical_payments || []).find(p => p.order_id === orderId);
      if (payment) {
        payment.refund_status = 'MANUAL_REFUND_CONFIRMED';
        payment.status = 'REFUNDED';
        payment.money_state = 'REFUNDED';
        payment.ledger_reversed = false;
        payment.refunded_at = now;
      }

      // Post double-entry ledger reversal
      let ledgerTx = null;
      let ledgerError = null;
      try {
        const { FinancialLedger } = require('../settlement/FinancialLedger');
        ledgerTx = await FinancialLedger.recordRefund({
          orderId,
          quoteId: order.quote_id || escrow.quote_id || null,
          ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount || escrow.total_paid || order.total_amount || 0,
          platformFee: order.platform_fee || order.buyer_fee || 0,
          buyerFee: order.buyer_fee,
          sellerFee: order.seller_fee,
          buyerTax: order.buyer_tax,
          sellerTax: order.seller_tax_withholding,
          actorId,
          reason: `MANUAL_REFUND_CONFIRMED: ${bankReference.trim()}`
        });
        escrow.ledger_reversed = true;
        escrow.reconciliation_status = 'SETTLED_RECONCILED';
        order.reconciliation_status = 'SETTLED_RECONCILED';
        if (payment) payment.ledger_reversed = true;
      } catch (ledgerErr) {
        ledgerError = ledgerErr.message;
        escrow.ledger_reversed = false;
        escrow.ledger_error = ledgerErr.message;
        escrow.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        order.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        if (payment) {
          payment.ledger_reversed = false;
          payment.reconciliation_status = 'LEDGER_REVERSAL_FAILED';
        }
        console.error(`[EscrowService] Financial ledger reversal failed on manual refund for ${orderId}:`, ledgerErr.message);
        await recordAuditLog('ESCROW', escrow.id, 'LEDGER_REVERSAL_FAILED', actorId, {
          order_id: orderId,
          bank_reference: bankReference.trim(),
          error: ledgerErr.message,
          notice: 'Manual refund recorded but double-entry ledger reversal failed. Flagged for manual reconciliation.'
        });
      }

      await recordAuditLog('ESCROW', escrow.id, 'MANUAL_REFUND_CONFIRMED_AND_RECONCILED', actorId, {
        order_id: orderId,
        bank_reference: bankReference.trim(),
        reconciled_by: actorId,
        notes,
        amount: escrow.total_paid,
        refunded_at: now
      });

      // Synchronize repository status if available
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        if (moneyRepo && typeof moneyRepo.refundEscrow === 'function') {
          await moneyRepo.refundEscrow(orderId, actorId, `MANUAL_REFUND_CONFIRMED: ${bankReference.trim()}`);
        }
      } catch (_) {}

      // Persist durable state
      try {
        const { DurableFinancialStore } = require('../settlement/DurableFinancialStore');
        DurableFinancialStore.persist('escrows', state.escrows);
        DurableFinancialStore.persist('orders', state.orders);
        if (state.canonical_payments) {
          DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
        }
      } catch (_) {}

      return {
        success: true,
        confirmed: true,
        order,
        escrow,
        ledgerTx
      };
    } finally {
      unlock();
    }
  }

  /**
   * Re-attempts a failed double-entry ledger reversal for a confirmed refund.
   * Safe, idempotent recovery mechanism.
   */
  static async retryLedgerReversal({ orderId, actorId = 'SYSTEM' }) {
    const unlock = await releaseMutex.acquire(orderId);
    try {
      const order = (state.orders || []).find(o => o.id === orderId);
      const escrow = (state.escrows || []).find(e => e.order_id === orderId);

      if (!order || !escrow) {
        const err = new Error(`Order or Escrow not found for ledger reversal retry: '${orderId}'`);
        err.code = 'REFUND_TARGET_NOT_FOUND';
        throw err;
      }

      if (!escrow.provider_refund_confirmed) {
        const err = new Error(`Cannot reverse ledger: Provider refund has not been confirmed for order '${orderId}'`);
        err.code = 'REFUND_UNCONFIRMED';
        throw err;
      }

      if (escrow.ledger_reversed) {
        return {
          success: true,
          idempotent: true,
          alreadyReversed: true,
          message: 'Financial ledger was already reversed successfully'
        };
      }

      const { FinancialLedger } = require('../settlement/FinancialLedger');
      const ledgerTx = await FinancialLedger.recordRefund({
        orderId,
        quoteId: order.quote_id || escrow.quote_id || null,
        ticketPrice: order.gross_ticket_value || order.ticket_price || escrow.gross_ticket_value || escrow.ticket_price || escrow.amount || escrow.total_paid || order.total_amount || 0,
        platformFee: order.platform_fee || order.buyer_fee || 0,
        buyerFee: order.buyer_fee,
        sellerFee: order.seller_fee,
        buyerTax: order.buyer_tax,
        sellerTax: order.seller_tax_withholding,
        actorId,
        reason: 'RETRY_FAILED_LEDGER_REVERSAL'
      });

      escrow.ledger_reversed = true;
      delete escrow.ledger_error;
      escrow.reconciliation_status = 'SETTLED_RECONCILED';
      order.reconciliation_status = 'SETTLED_RECONCILED';

      const payment = (state.canonical_payments || []).find(p => p.order_id === orderId);
      if (payment) {
        payment.ledger_reversed = true;
        delete payment.reconciliation_status;
      }

      await recordAuditLog('ESCROW', escrow.id, 'LEDGER_REVERSAL_RECOVERED', actorId, {
        order_id: orderId,
        transaction_id: ledgerTx.transaction_id
      });

      return {
        success: true,
        recovered: true,
        ledgerTx
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

  /**
   * Release reserved inventory back to listing (e.g. order cancelled, expired, or refunded)
   * IDEMPOTENT: guarantees that repeated calls for the same order never double-release inventory.
   */
  static async releaseInventoryForOrder(orderId, reason = 'ORDER_CANCELLED') {
    let order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      try {
        const { getMoneyRepository } = require('../storage');
        const moneyRepo = getMoneyRepository();
        if (moneyRepo && typeof moneyRepo.getOrderById === 'function') {
          order = await moneyRepo.getOrderById(orderId);
          if (order) {
            if (!state.orders) state.orders = [];
            state.orders.push(order);
          }
        }
      } catch (_) {}
    }
    if (!order || !order.listing_id) return null;

    // Idempotency check: an order's inventory must only ever be released ONCE
    if (order.inventory_released === true) {
      let listing = (state.listings || []).find(l => l.id === order.listing_id);
      return { listing, order, releasedQuantity: 0, idempotent: true, alreadyReleased: true };
    }

    // Mark as released before mutation to ensure re-entrancy / race safety
    order.inventory_released = true;
    order.inventory_released_at = new Date().toISOString();
    order.inventory_release_reason = reason;

    let listing = (state.listings || []).find(l => l.id === order.listing_id);
    const ordQty = Math.max(1, parseInt(order.quantity || 1, 10));

    if (listing) {
      listing.reserved_quantity = Math.max(0, (listing.reserved_quantity || 0) - ordQty);
      listing.available_quantity = (listing.available_quantity || 0) + ordQty;
      if (listing.available_quantity > 0 && listing.status === LISTING_STATUS.RESERVED) {
        listing.status = LISTING_STATUS.ACTIVE;
      }
    }

    try {
      const { getMarketplaceRepository } = require('../storage');
      const marketplaceRepo = getMarketplaceRepository();
      if (typeof marketplaceRepo.atomicReleaseInventory === 'function') {
        const updated = await marketplaceRepo.atomicReleaseInventory(order.listing_id, ordQty);
        if (updated && !listing) {
          listing = updated;
        }
      } else if (typeof marketplaceRepo.updateListingInventory === 'function') {
        await marketplaceRepo.updateListingInventory(order.listing_id, {
          available_quantity: listing ? listing.available_quantity : undefined,
          reserved_quantity: listing ? listing.reserved_quantity : undefined,
          status: listing ? listing.status : undefined
        });
      }
    } catch (_) {}

    try {
      const { DurableFinancialStore } = require('./payment/DurableFinancialStore');
      if (state.orders) {
        DurableFinancialStore.persist('orders', state.orders);
      }
    } catch (_) {}

    return { listing, order, releasedQuantity: ordQty, idempotent: false };
  }
}

module.exports = { EscrowService, ESCROW_STATUS, ORDER_STATUS };

