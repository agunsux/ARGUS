/**
 * TIKUM / ARGUS — Deal Link & Deal Room Service (Core Product Architecture)
 * 
 * Implements the 5-step verified transaction infrastructure:
 * 1. Create Deal — Seller generates a Transaction Link (or publishes a reviewed listing)
 * 2. Verify — TIKUM reviews ownership evidence and event/promoter transfer policy
 * 3. Pay — Buyer sees full upfront cost breakdown and pays via approved channels
 * 4. Handover — Digital transfer or Venue-Assisted PIC handover according to risk tier
 * 5. Resolve & Complete — Complete digital Evidence Bundle, structured dispute handling,
 *    and settlement strictly matching the authorized payment mode.
 * 
 * Safety & Governance Invariants:
 * - PRELAUNCH_LISTING_ONLY fails closed on live checkout unless explicitly overridden
 * - Credit Card is disabled during pilot (QRIS & VA only)
 * - Stage A ownership review strictly prohibits raw barcode/QR code
 * - Zero hidden fees: Base Price, Buyer Fee, Seller Fee, PIC Allocation, Buyer Total, Seller Payout
 */

const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');
const { EventPolicyRegistry, RISK_TIERS, FULFILLMENT_ROUTING } = require('../policy/EventPolicyRegistry');
const { simulateTransactionPricing, PRICING_CONFIG } = require('../config/pricingConfig');
const { PaymentModeController, SETTLEMENT_MODES, PILOT_PAYMENT_CHANNELS, PAYMENT_STATUS, TICKET_VERIFICATION_STATUS, HANDOVER_STATUS, ENTRY_VERIFICATION_STATUS, REFUND_STATUS, SETTLEMENT_STATUS } = require('../config/paymentMode');
const { EvidenceBundleService, ARTIFACT_SLOTS } = require('../trust/EvidenceBundleService');
const { isPrelaunchListingMode, PRELAUNCH_ERROR_RESPONSE } = require('../config/marketplaceMode');
const { AntiConflictService } = require('../trust/AntiConflictService');

class DealService {
  static init() {
    if (!state.deals) state.deals = [];
    if (!state.orders) state.orders = [];
  }

  /**
   * Step 1: Create Deal Link (Seller generates Transaction Link)
   */
  static async createDeal({
    sellerId,
    eventId,
    ticketCategory = 'General Admission',
    section = null,
    row = null,
    seat = null,
    price,
    quantity = 1,
    faceValue = null,
    ownershipEvidence = null,
    ownershipInvoice = null,
    containsRawQr = false,
    rawBarcode = null,
    notes = null
  }) {
    this.init();
    if (!sellerId || !eventId || !price) {
      const err = new Error('sellerId, eventId, and price are required to create a deal link');
      err.code = 'INVALID_DEAL_PAYLOAD';
      err.status = 400;
      throw err;
    }

    // 1. Seller Eligibility Check
    const seller = state.users ? state.users.find(u => u.id === sellerId) : null;
    if (!seller) {
      const err = new Error(`Seller '${sellerId}' not found`);
      err.code = 'SELLER_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    if ((seller.status || '').toUpperCase() === 'SUSPENDED') {
      const err = new Error('Seller account is suspended');
      err.code = 'SELLER_SUSPENDED';
      err.status = 403;
      throw err;
    }

    // 2. Evaluate Event Policy Registry (Rule 2 & 6)
    const canTransactResult = EventPolicyRegistry.canTransact(eventId);
    if (!canTransactResult.allowed) {
      const err = new Error(canTransactResult.reason);
      err.code = canTransactResult.code;
      err.status = 400;
      err.policy = canTransactResult.policy;
      throw err;
    }

    // 3. Resolve 3-Tier Risk Routing
    const routingInfo = EventPolicyRegistry.resolveFulfillmentRouting(eventId);
    const handoverType = routingInfo.routing; // DIGITAL_TRANSFER or VENUE_ASSISTED
    const isPicMandatory = routingInfo.picRequired;

    // 4. Stage A Privacy & Evidence Invariant: Zero Raw QR at creation (Rule 8 & 11)
    if (containsRawQr || rawBarcode || (typeof ownershipEvidence === 'string' && /^(raw_barcode|barcode_qr):/i.test(ownershipEvidence))) {
      const err = new Error('Security Invariant Violation: Raw barcode/QR string is strictly prohibited at Stage A deal creation. Provide original purchase confirmation or booking invoice without barcode.');
      err.code = 'RAW_QR_PROHIBITED_STAGE_A';
      err.status = 400;
      throw err;
    }

    const numericPrice = typeof price === 'number' ? price : parseInt(price, 10);
    const qty = Math.min(10, Math.max(1, parseInt(quantity, 10) || 1));

    // 5. PIC Governance: No arbitrary flat PIC fee charged to customer.
    // Actual PIC operational expenses are tracked separately on the VenueOperations shift ledger.
    const picAllocationFee = 0;

    // 6. Upfront Deterministic Pricing Simulation (Rule 1)
    const pricingSimulation = simulateTransactionPricing({
      price: numericPrice,
      quantity: qty,
      picAssisted: isPicMandatory,
      picAllocationFee: 0
    });

    const dealId = `deal-${uuidv4()}`;
    const dealToken = `dl-${uuidv4()}`;
    const now = new Date().toISOString();

    // 7. Initialize 9-Slot Digital Evidence Bundle
    const bundle = EvidenceBundleService.createBundle({
      dealId,
      sellerId,
      eventId,
      handoverType
    });

    // Attach Stage A Ownership Evidence (Slot 1)
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_1_OWNERSHIP_EVIDENCE,
      content: ownershipEvidence || ownershipInvoice || {
        type: 'STAGE_A_OWNERSHIP_REVIEW',
        source: 'SELLER_SUBMISSION',
        ticket_category: ticketCategory,
        notes: notes || 'Bukti kepemilikan tahap awal ditinjau TIKUM'
      },
      metadata: { stage: 'STAGE_A_PRE_PAYMENT' },
      actorId: sellerId,
      actorRole: 'seller'
    });

    // Attach Original Purchase Invoice (Slot 2) if provided
    if (ownershipInvoice) {
      EvidenceBundleService.attachArtifact({
        bundleId: bundle.bundle_id,
        slotName: ARTIFACT_SLOTS.SLOT_2_PURCHASE_INVOICE,
        content: ownershipInvoice,
        metadata: { invoice_verified: false },
        actorId: sellerId,
        actorRole: 'seller'
      });
    }

    // Attach Seller Identity Ref (Slot 3)
    EvidenceBundleService.attachArtifact({
      bundleId: bundle.bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_3_SELLER_IDENTITY_REF,
      content: {
        seller_id: sellerId,
        phone_verified: Boolean(seller.phone),
        email_verified: Boolean(seller.email),
        kyc_status: seller.kyc_status || 'VERIFIED'
      },
      metadata: { pii_masked: true },
      actorId: 'SYSTEM',
      actorRole: 'system'
    });

    // 8. Initialize Decoupled State Axes
    const decoupledAxes = PaymentModeController.initializeDecoupledAxes({
      paymentStatus: PAYMENT_STATUS.UNPAID,
      ticketVerificationStatus: TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED,
      handoverStatus: handoverType === FULFILLMENT_ROUTING.VENUE_ASSISTED ? HANDOVER_STATUS.SCHEDULED_AT_VENUE : HANDOVER_STATUS.PENDING
    });

    const deal = {
      deal_id: dealId,
      deal_token: dealToken,
      transaction_link: `https://tikum.app/deal/${dealToken}`,
      seller_id: sellerId,
      event_id: eventId,
      ticket_category: ticketCategory,
      section: section || 'General',
      row: row || null,
      seat: seat || null,
      price: numericPrice,
      quantity: qty,
      face_value: faceValue ? parseInt(faceValue, 10) : null,
      handover_type: handoverType,
      is_pic_mandatory: isPicMandatory,
      evidence_bundle_id: bundle.bundle_id,
      pricing: pricingSimulation,
      terminology: PaymentModeController.getModeTerminology(),
      allowed_payment_channels: [PILOT_PAYMENT_CHANNELS.QRIS, PILOT_PAYMENT_CHANNELS.VIRTUAL_ACCOUNT],
      disabled_payment_channels: [PILOT_PAYMENT_CHANNELS.CREDIT_CARD],
      status: 'ACTIVE_DEAL_LINK',
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      ...decoupledAxes,
      created_at: now,
      updated_at: now
    };

    state.deals.push(deal);

    await recordAuditLog('DEAL_LINK', dealId, 'CREATED', sellerId, {
      deal_token: dealToken,
      event_id: eventId,
      handover_type: handoverType,
      price: numericPrice,
      buyer_total: pricingSimulation.total_paid_by_buyer,
      seller_payout: pricingSimulation.net_payout_seller
    });

    return deal;
  }

  /**
   * Step 2: Deal Room View (Buyer or Seller inspects Deal Room)
   */
  static getDealByToken(token, requesterRole = 'public') {
    this.init();
    const deal = state.deals.find(d => d.deal_token === token || d.deal_id === token);
    if (!deal) return null;

    const event = state.events ? state.events.find(e => e.id === deal.event_id || e.canonical_id === deal.event_id) : null;
    const policy = EventPolicyRegistry.getEventPolicy(deal.event_id);
    const bundleSummary = EvidenceBundleService.getBundle(deal.evidence_bundle_id, requesterRole);

    return {
      deal_id: deal.deal_id,
      deal_token: deal.deal_token,
      transaction_link: deal.transaction_link,
      seller_id: deal.seller_id,
      buyer_id: deal.buyer_id,
      evidence_bundle_id: deal.evidence_bundle_id,
      event: {
        id: deal.event_id,
        title: event?.title || 'Konser Musik',
        date: event?.date || '2026-11-20',
        venue: event?.venue || event?.venue_name || 'Jakarta Convention Center',
        promoter_policy: policy
      },
      ticket: {
        category: deal.ticket_category,
        section: deal.section,
        row: deal.row,
        seat: deal.seat,
        quantity: deal.quantity,
        price_per_ticket: deal.price
      },
      handover: {
        type: deal.handover_type,
        is_pic_mandatory: deal.is_pic_mandatory,
        meeting_point: deal.is_pic_mandatory ? 'Titik Kumpul Resmi TIKUM di Venue (Didampingi PIC)' : 'Transfer Digital Resmi Promotor',
        instructions: deal.is_pic_mandatory
          ? 'Temui Event PIC TIKUM di Titik Kumpul sesuai jam briefing untuk serah terima fisik/wristband.'
          : 'Serah terima digital akan dikoordinasikan melalui Deal Room resmi.'
      },
      pricing: deal.pricing,
      terminology: PaymentModeController.getModeTerminology(),
      allowed_payment_channels: deal.allowed_payment_channels,
      payment_status: deal.payment_status,
      ticket_verification_status: deal.ticket_verification_status,
      handover_status: deal.handover_status,
      settlement_status: deal.settlement_status,
      evidence_bundle: bundleSummary,
      status: deal.status,
      created_at: deal.created_at
    };
  }

  /**
   * Step 3: Pay & Bind Deal (Buyer agrees to terms, selects channel, and checks out)
   */
  static async checkoutDeal({
    dealToken,
    buyerId,
    paymentChannel = PILOT_PAYMENT_CHANNELS.QRIS,
    termsAccepted = false,
    ipAddress = '127.0.0.1'
  }) {
    this.init();
    const deal = state.deals.find(d => d.deal_token === dealToken || d.deal_id === dealToken);
    if (!deal) {
      const err = new Error(`Deal with token '${dealToken}' not found`);
      err.code = 'DEAL_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (!buyerId) {
      const err = new Error('buyerId is required for checkout');
      err.code = 'BUYER_REQUIRED';
      err.status = 400;
      throw err;
    }

    // Guard: Expiration check (24h window)
    if (deal.expires_at && new Date(deal.expires_at).getTime() < Date.now()) {
      deal.status = 'EXPIRED';
      const err = new Error('Deal link ini telah kedaluwarsa (expired). Penjual harus membuat tautan transaksi baru.');
      err.code = 'DEAL_EXPIRED';
      err.status = 400;
      throw err;
    }

    // Guard: Status check
    if (deal.status !== 'ACTIVE_DEAL_LINK') {
      const err = new Error(`Deal link ini sudah tidak aktif atau telah diproses sebelumnya (Status: ${deal.status})`);
      err.code = 'DEAL_NOT_ACTIVE';
      err.status = 400;
      throw err;
    }

    // Anti-Conflict Rule 7: Buyer cannot be Seller
    if (buyerId === deal.seller_id) {
      const err = new Error('Security Violation: Buyer cannot purchase their own deal link');
      err.code = 'COLLUSION_SELF_DEALING_DETECTED';
      err.status = 403;
      throw err;
    }

    // Safety Gate: PRELAUNCH_LISTING_ONLY strictly blocks live payments (Rule 0 & 11)
    if (isPrelaunchListingMode()) {
      const err = new Error(PRELAUNCH_ERROR_RESPONSE.error);
      err.code = PRELAUNCH_ERROR_RESPONSE.code;
      err.status = 403;
      throw err;
    }

    // Rule 4: Binding Transaction - Terms acceptance mandatory
    if (!termsAccepted) {
      const err = new Error('Persetujuan Syarat & Ketentuan Layanan (Terms & Conditions) wajib dicentang sebelum melanjutkan pembayaran. Transaksi ini bersifat mengikat dan tidak dapat dibatalkan sepihak.');
      err.code = 'TERMS_ACCEPTANCE_REQUIRED';
      err.status = 400;
      throw err;
    }

    // Rule 5: Channel Validation (Credit Card disabled in pilot)
    const channelCheck = PaymentModeController.validatePaymentChannel(paymentChannel);
    if (!channelCheck.allowed) {
      const err = new Error(channelCheck.reason);
      err.code = channelCheck.code;
      err.status = 400;
      throw err;
    }

    const now = new Date().toISOString();
    const orderId = `ord-deal-${uuidv4().substring(0, 8)}`;

    // Attach Binding Consent Log to Evidence Bundle (Slot 4)
    EvidenceBundleService.attachArtifact({
      bundleId: deal.evidence_bundle_id,
      slotName: ARTIFACT_SLOTS.SLOT_4_BINDING_CONSENT_LOG,
      content: {
        order_id: orderId,
        buyer_id: buyerId,
        seller_id: deal.seller_id,
        terms_accepted: true,
        no_change_of_mind_acknowledged: true,
        payment_channel: channelCheck.channel,
        ip_address: ipAddress,
        total_amount_idr: deal.pricing.total_paid_by_buyer,
        timestamp: now
      },
      metadata: { consent_binding: true },
      actorId: buyerId,
      actorRole: 'buyer'
    });

    // Create Order with decoupled state axes
    const order = {
      id: orderId,
      order_id: orderId,
      deal_id: deal.deal_id,
      deal_token: deal.deal_token,
      seller_id: deal.seller_id,
      buyer_id: buyerId,
      event_id: deal.event_id,
      ticket_category: deal.ticket_category,
      quantity: deal.quantity,
      ticket_price: deal.price,
      pricing: deal.pricing,
      payment_channel: channelCheck.channel,
      payment_status: PAYMENT_STATUS.UNPAID,
      ticket_verification_status: TICKET_VERIFICATION_STATUS.OWNERSHIP_EVIDENCE_REVIEWED,
      handover_status: deal.handover_type === FULFILLMENT_ROUTING.VENUE_ASSISTED ? HANDOVER_STATUS.SCHEDULED_AT_VENUE : HANDOVER_STATUS.PENDING,
      entry_verification_status: ENTRY_VERIFICATION_STATUS.PENDING_ENTRY,
      refund_status: REFUND_STATUS.NONE,
      settlement_status: deal.settlement_status,
      settlement_mode: deal.settlement_mode,
      evidence_bundle_id: deal.evidence_bundle_id,
      status: 'PENDING_PAYMENT',
      created_at: now,
      updated_at: now
    };

    state.orders.push(order);
    deal.status = 'CHECKED_OUT';
    deal.buyer_id = buyerId;

    await recordAuditLog('ORDER', orderId, 'CHECKOUT_BINDING_CREATED', buyerId, {
      deal_id: deal.deal_id,
      total_paid_by_buyer: deal.pricing.total_paid_by_buyer,
      payment_channel: channelCheck.channel
    });

    return {
      success: true,
      order,
      payment_instructions: {
        channel: channelCheck.channel,
        amount: deal.pricing.total_paid_by_buyer,
        currency: 'IDR',
        qr_code_url: channelCheck.channel === 'QRIS' ? `https://tikum.app/api/payments/mock-qris/${orderId}` : null,
        va_number: channelCheck.channel === 'VIRTUAL_ACCOUNT' ? `8800${Date.now().toString().slice(-8)}` : null,
        ttl_minutes: 30
      }
    };
  }

  /**
   * Step 4: Confirm Payment & Record Payment Proof (Authoritative Gateway Reference)
   */
  static async confirmPayment({ orderId, providerReference = null, paymentProofContent = null }) {
    this.init();
    let order = state.orders ? state.orders.find(o => o.id === orderId || o.order_id === orderId || o.deal_id === orderId) : null;
    if (!order && state.deals) {
      order = state.deals.find(d => d.deal_id === orderId || d.deal_token === orderId);
    }
    if (!order) throw new Error(`Order '${orderId}' not found`);

    // Idempotency guard: If already confirmed with same provider reference, return order without duplicate processing
    if (order.payment_status === PAYMENT_STATUS.PAYMENT_CONFIRMED_PROVIDER && providerReference && order.provider_reference === providerReference) {
      return order;
    }

    const now = new Date().toISOString();
    order.payment_status = PAYMENT_STATUS.PAYMENT_CONFIRMED_PROVIDER;
    order.payment_confirmed_at = now;
    order.provider_reference = providerReference || `PAY-PROV-${Date.now()}`;
    order.status = 'PAID';

    // Invariant: Payment confirmation does NOT mutate ticket_verification_status to verified!
    // Ticket verification status remains OWNERSHIP_EVIDENCE_REVIEWED until post-payment Stage B fulfillment!

    // Attach Payment Proof to Evidence Bundle (Slot 5)
    if (order.evidence_bundle_id) {
      EvidenceBundleService.attachArtifact({
        bundleId: order.evidence_bundle_id,
        slotName: ARTIFACT_SLOTS.SLOT_5_PAYMENT_PROOF,
        content: paymentProofContent || {
          provider_reference: order.provider_reference,
          amount_idr: order.pricing?.total_paid_by_buyer,
          confirmed_at: now
        },
        metadata: { payment_confirmed: true },
        actorId: 'PAYMENT_GATEWAY',
        actorRole: 'gateway'
      });
    }

    await recordAuditLog('ORDER', orderId, 'PAYMENT_CONFIRMED', 'SYSTEM', {
      payment_status: order.payment_status,
      ticket_verification_status: order.ticket_verification_status,
      provider_reference: order.provider_reference
    });

    return order;
  }
}

module.exports = {
  DealService
};
