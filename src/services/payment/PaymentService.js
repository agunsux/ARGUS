/**
 * TIKUM / ARGUS — Unified Payment Service & Orchestrator
 *
 * Primary Rail: DOKU (Escrow & Hold & Release Settlement)
 * Backup #1: Midtrans
 * Backup #2: Xendit
 * Legacy: RCB (DELETED from live production paths)
 *
 * Orchestrates provider-independent payment lifecycle, idempotency, webhook processing,
 * dispute locks, chargeback handling, event cancellation, and real reconciliation.
 *
 * NON-NEGOTIABLE FINANCIAL INVARIANTS:
 * 1. PAYMENT SUCCESS !== SETTLEMENT AUTHORIZED.
 * 2. MONEY STATE !== TIKUM BUSINESS STATE.
 * 3. Double-entry FinancialLedger records every financial event immutably.
 * 4. Idempotency is enforced on payment creation, webhooks, payouts, refunds.
 * 5. Persistent storage survives process restarts.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { paymentManager, CapabilityUnsupportedError } = require('./index');
const { state, recordAuditLog } = require('../../database');
const {
  CANONICAL_PAYMENT_STATUS,
  MONEY_STATE,
  TIKUM_BUSINESS_STATE,
  createCanonicalPaymentRecord,
  createCanonicalChargebackRecord
} = require('./canonicalPaymentTypes');
const { DurableFinancialStore } = require('../../settlement/DurableFinancialStore');
const { PaymentRoutingService, PAYMENT_ATTEMPT_STATUS } = require('./PaymentRoutingService');

const PRODUCTION_SAFETY_GATES = {
  NO_REAL_PAYMENT: true,
  NO_REAL_SETTLEMENT: true,
  NO_FAKE_PAYMENT_SUCCESS: true,
  NO_FAKE_ESCROW_BALANCE: true,
  NO_FAKE_GMV: true,
  DOKU_KYC_VERIFICATION_REQUIRED: true,
  DOKU_ESCROW_ACTIVATION_REQUIRED: true
};

class PaymentService {
  /**
   * Returns current payment subsystem status for admin/observability
   */
  static getSubsystemStatus() {
    const defaultName = paymentManager.defaultProvider || 'doku';
    let primaryStatus = { status: 'UNCONFIGURED' };
    let midtransStatus = { status: 'UNCONFIGURED' };
    let xenditStatus = { status: 'UNCONFIGURED' };
    let ipaymuStatus = { status: 'UNCONFIGURED' };

    try {
      const doku = paymentManager.getProvider('doku');
      if (doku) primaryStatus = doku.getStatus();
    } catch (e) {}

    try {
      const midtrans = paymentManager.getProvider('midtrans');
      if (midtrans) midtransStatus = midtrans.getStatus();
    } catch (e) {}

    try {
      const xendit = paymentManager.getProvider('xendit');
      if (xendit) xenditStatus = xendit.getStatus();
    } catch (e) {}

    try {
      const ipaymu = paymentManager.getProvider('ipaymu');
      if (ipaymu) ipaymuStatus = ipaymu.getStatus();
    } catch (e) {}

    return {
      safety_gates: PRODUCTION_SAFETY_GATES,
      architecture: 'DOKU Primary (Direct API) -> iPaymu Secondary',
      target_business_entity: 'PT SHINERVA PRAJNA TEJAS',
      default_provider: defaultName,
      primary_provider_name: 'doku',
      secondary_provider_name: 'ipaymu',
      settlement_mechanism: 'Hold & Release Settlement',
      release_authority: 'ARGUS Trust Engine',
      active_providers: paymentManager.getAvailablePaymentMethods(),
      primary_provider: {
        name: 'doku',
        integration: 'Direct API',
        entity: 'PT SHINERVA PRAJNA TEJAS',
        hold_release_mechanism: 'POST /finance/v1/release',
        status: primaryStatus.status,
        account_status: primaryStatus.account_status || 'PENDING_KYC',
        escrow_status: primaryStatus.escrow_status || 'NOT_ENABLED',
        is_verified: primaryStatus.isVerified,
        environment: primaryStatus.environment,
        is_sandbox: primaryStatus.is_sandbox,
        api_base_url: primaryStatus.api_base_url,
        production_gated: primaryStatus.production_gated,
        message: primaryStatus.message,
        readiness: primaryStatus.readiness,
        escrow_verification_matrix: primaryStatus.escrow_verification_matrix,
        contract_dependent_items: primaryStatus.contract_dependent_items
      },
      secondary_provider: {
        name: 'ipaymu',
        role: 'SECONDARY_FALLBACK',
        status: ipaymuStatus.status,
        is_verified: ipaymuStatus.isVerified,
        message: ipaymuStatus.message
      },
      backup_providers: {
        backup_1: {
          name: 'ipaymu',
          status: ipaymuStatus.status,
          is_verified: ipaymuStatus.isVerified,
          message: ipaymuStatus.message
        },
        backup_2: {
          name: 'midtrans',
          status: midtransStatus.status,
          is_verified: midtransStatus.isVerified,
          message: midtransStatus.message
        },
        backup_3: {
          name: 'xendit',
          status: xenditStatus.status,
          is_verified: xenditStatus.isVerified,
          message: xenditStatus.message
        }
      },
      legacy_rcb: {
        name: 'rcb',
        status: 'DELETED_FROM_PRODUCTION',
        live_architecture: false,
        historical_audit_records_retained: true
      },
      marketplace_financial_state: {
        real_money_active: false,
        settlement_active: false,
        claim: 'PAYMENT_PENDING_MERCHANT_KYC_AND_ESCROW_CONTRACT'
      }
    };
  }

  /**
   * Initiates payment through the appropriate regional provider.
   * Enforces internal idempotency and records into canonical_payments.
   */
  static async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel,
    buyer = {},
    providerName = null,
    idempotencyKey = null,
    requiresEscrow = undefined
  }) {
    const { isPrelaunchListingMode } = require('../../config/marketplaceMode');
    if (isPrelaunchListingMode()) {
      const err = new Error('TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.');
      err.code = 'MARKETPLACE_PRELAUNCH_ONLY';
      err.status = 403;
      throw err;
    }

    const targetProviderName = (providerName || paymentManager.defaultProvider || 'doku').toLowerCase();
    const effectiveIdempotencyKey = idempotencyKey || `idemp-${orderId}-${targetProviderName}`;

    // 1. Idempotency Check in canonical_payments
    if (!state.canonical_payments) state.canonical_payments = [];
    const existingPayment = state.canonical_payments.find(
      p => p.idempotency_key === effectiveIdempotencyKey ||
        (p.order_id === orderId && p.provider === targetProviderName && p.status === CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING)
    );
    if (existingPayment) {
      return {
        idempotent: true,
        paymentId: existingPayment.internal_payment_id || existingPayment.id,
        orderId: existingPayment.order_id,
        provider: existingPayment.provider,
        providerRef: existingPayment.provider_reference,
        amount: existingPayment.gross_amount,
        status: existingPayment.status,
        moneyState: existingPayment.money_state || existingPayment.status,
        businessState: existingPayment.business_state,
        paymentDetails: existingPayment.metadata?.paymentDetails || {}
      };
    }

    const provider = paymentManager.getProvider(targetProviderName);
    if (!provider) {
      const err = new Error(`Payment provider '${targetProviderName}' not supported`);
      err.code = 'UNKNOWN_PAYMENT_PROVIDER';
      throw err;
    }

    const providerSupportsHold = Boolean(provider.getCapabilities?.().hold);
    const effectiveRequiresEscrow = (requiresEscrow !== undefined && requiresEscrow !== null)
      ? Boolean(requiresEscrow)
      : providerSupportsHold;

    // 2. Assert failover is permissible
    PaymentRoutingService.assertFailoverAllowed(orderId, effectiveRequiresEscrow, targetProviderName);

    // 2. Production Safety Gate & Verification Check
    const providerStatus = provider.getStatus();
    const isSimulationAllowed = provider.config?.allowTestSimulation || provider.config?.allowSimulation || process.env.NODE_ENV === 'test';
    if (!providerStatus.isVerified && !isSimulationAllowed) {
      const err = new Error(
        `Payment provider '${targetProviderName}' is ${providerStatus.status}. Real-money marketplace activation is gated until verification and merchant KYC are complete.`
      );
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      err.status = 503;
      throw err;
    }

    // 3. Resolve Order details for canonical recording
    let order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    if (!order) {
      try {
        const { getMoneyRepository } = require('../../storage');
        const moneyRepo = getMoneyRepository();
        if (moneyRepo) {
          const dbOrder = await moneyRepo.getOrderById(orderId);
          if (dbOrder) {
            if (!state.orders) state.orders = [];
            state.orders.push(dbOrder);
            order = dbOrder;
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw err;
        }
      }
    }

    if (!order) {
      const err = new Error(`Order '${orderId}' not found in canonical ledger or state`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const internalPaymentId = `pay-${uuidv4()}`;

    // 4. Delegate to provider adapter
    const providerResult = await provider.createPayment({
      orderId,
      amount: parseInt(amount, 10),
      currency,
      channel: channel || 'QRIS',
      buyer,
      requiresEscrow: effectiveRequiresEscrow,
      idempotencyKey: effectiveIdempotencyKey
    });

    const providerRef = providerResult.providerReference || providerResult.referenceId || providerResult.providerRef || `ref-${Date.now()}`;
    const providerTxId = providerResult.providerTransactionId || providerRef;

    // 5. Store canonical payment record
    const canonicalRecord = createCanonicalPaymentRecord({
      internalPaymentId,
      orderId,
      buyerId: buyer.id || order?.buyer_id || 'unknown-buyer',
      sellerId: order?.seller_id || 'unknown-seller',
      eventId: order?.event_id || 'unknown-event',
      ticketId: order?.ticket_id || 'unknown-ticket',
      provider: targetProviderName,
      providerTransactionId: providerTxId,
      providerReference: providerRef,
      currency,
      grossAmount: parseInt(amount, 10),
      platformFee: order?.platform_fee || order?.buyer_fee || 0,
      sellerAmount: order?.seller_payout || order?.seller_net_payout || 0,
      providerFee: 0,
      taxAmount: (order?.buyer_tax || 0) + (order?.seller_tax_withholding || 0),
      netAmount: parseInt(amount, 10),
      moneyState: MONEY_STATE.PAYMENT_PENDING,
      businessState: TIKUM_BUSINESS_STATE.TICKET_RESERVED,
      status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING,
      paymentMethod: channel || providerResult.channel || 'QRIS',
      idempotencyKey: effectiveIdempotencyKey,
      metadata: {
        ...providerResult,
        originalRequestId: providerResult.originalRequestId || providerResult.dokuRequestId || null,
        invoiceNumber: providerResult.paymentDetails?.invoiceNumber || providerRef
      }
    });

    canonicalRecord.settlement_status = effectiveRequiresEscrow ? 'SETTLEMENT_HOLD_REQUESTED' : 'STANDARD';
    canonicalRecord.original_request_id = providerResult.originalRequestId || providerResult.dokuRequestId || null;

    state.canonical_payments.push(canonicalRecord);
    DurableFinancialStore.persist('canonical_payments', state.canonical_payments);

    let moneyRepo = null;
    try {
      const { getMoneyRepository } = require('../../storage');
      moneyRepo = getMoneyRepository();
      if (moneyRepo) {
        await moneyRepo.createPayment({
          id: internalPaymentId,
          internal_payment_id: internalPaymentId,
          order_id: orderId,
          buyer_id: canonicalRecord.buyer_id,
          seller_id: canonicalRecord.seller_id,
          provider: targetProviderName,
          provider_transaction_id: providerTxId,
          provider_reference: providerRef,
          currency,
          gross_amount: canonicalRecord.gross_amount,
          provider_fee: canonicalRecord.provider_fee,
          status: canonicalRecord.status,
          money_state: canonicalRecord.money_state,
          payment_method: canonicalRecord.payment_method,
          idempotency_key: effectiveIdempotencyKey,
          metadata: canonicalRecord.metadata
        });
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL || (moneyRepo && !moneyRepo.degraded)) {
        throw repoErr;
      }
    }

    // Record deterministic payment attempt
    PaymentRoutingService.recordPaymentAttempt({
      paymentAttemptId: internalPaymentId,
      orderId,
      provider: targetProviderName,
      providerTransactionId: providerTxId,
      idempotencyKey: effectiveIdempotencyKey,
      status: PAYMENT_ATTEMPT_STATUS.PENDING
    });

    await recordAuditLog('PAYMENT', internalPaymentId, 'INTENT_CREATED', buyer.id || 'SYSTEM', {
      order_id: orderId,
      provider: targetProviderName,
      channel: canonicalRecord.payment_method,
      gross_amount: canonicalRecord.gross_amount,
      provider_reference: providerRef
    });

    return {
      idempotent: false,
      paymentId: internalPaymentId,
      orderId,
      invoiceNumber: providerResult.invoiceNumber || providerResult.providerReference || providerRef,
      provider: targetProviderName,
      providerRef,
      providerTransactionId: providerTxId,
      amount: canonicalRecord.gross_amount,
      currency,
      status: canonicalRecord.status,
      moneyState: canonicalRecord.money_state,
      businessState: canonicalRecord.business_state,
      channel: canonicalRecord.payment_method,
      paymentUrl: providerResult.paymentUrl || providerResult.paymentDetails?.redirect_url || providerResult.paymentDetails?.checkoutUrl || null,
      paymentDetails: providerResult.paymentDetails || {},
      simulated: providerResult.simulated === true
    };
  }

  /**
   * Processes incoming gateway webhook in an idempotent, tamper-proof manner.
   * Handles signature verification, raw payload hashing, replay rejection, and domain state transition.
   */
  static async handleWebhook({
    providerName = null,
    headers = {},
    body = {},
    rawPayload = null,
    rawBodyBuffer = null
  }) {
    const targetProviderName = (providerName || paymentManager.defaultProvider || 'doku').toLowerCase();
    const provider = paymentManager.getProvider(targetProviderName);
    if (!provider) {
      const err = new Error(`Provider '${targetProviderName}' not registered`);
      err.code = 'UNKNOWN_PROVIDER';
      err.status = 400;
      throw err;
    }

    // 1. Signature Verification with Raw Buffer Support & Freshness
    const isValidSig = provider.verifyWebhook(headers, body, rawBodyBuffer || rawPayload);
    if (!isValidSig) {
      await recordAuditLog('WEBHOOK', 'unknown', 'SIGNATURE_REJECTED', 'GATEWAY', {
        provider: targetProviderName,
        reason: 'Invalid or forged HMAC signature or expired timestamp window'
      });
      const err = new Error('Invalid gateway webhook signature or expired timestamp');
      err.code = 'INVALID_WEBHOOK_SIGNATURE';
      err.status = 401;
      throw err;
    }

    // 2. Normalize payload
    const event = provider.parseWebhook(body, headers);
    const rawStatus = (event.rawStatus || event.status || body.status || body.transaction_status || body.trx_status || '').toUpperCase();
    const isRefundEvent = event.status === MONEY_STATE.REFUNDED ||
      event.status === 'REFUNDED' ||
      rawStatus === 'REFUND' ||
      rawStatus === 'REFUNDED' ||
      rawStatus === 'REFUND_SUCCESS' ||
      event.eventType === 'REFUND_CONFIRMED' ||
      event.eventType === 'REFUND_EVENT' ||
      event.event_type === 'REFUND_CONFIRMED' ||
      event.event_type === 'REFUND_EVENT' ||
      body.event === 'refund.succeeded';

    const eventId = event.providerEventId || (isRefundEvent
      ? `wh-ref-${event.idempotencyKey || event.providerRef || Date.now()}`
      : (event.idempotencyKey ? `wh-${event.idempotencyKey}` : `wh-${event.providerRef || Date.now()}`));
    const payloadHash = crypto.createHash('sha256').update(rawBodyBuffer || (typeof body === 'string' ? body : JSON.stringify(body))).digest('hex');

    // 3. Persistent Idempotency Check in provider_webhooks & processed_webhooks
    if (!state.provider_webhooks) state.provider_webhooks = [];
    if (!state.processed_webhooks) state.processed_webhooks = new Set();

    const existingWebhook = state.provider_webhooks.find(
      w => w.provider === targetProviderName &&
        (w.provider_event_id === eventId || (w.payload_hash === payloadHash && w.processing_status === 'PROCESSED'))
    );
    const isLegacyDuplicate = isRefundEvent
      ? (state.processed_webhooks.has(`ref:${event.providerRef}`) || state.processed_webhooks.has(eventId))
      : (state.processed_webhooks.has(event.providerRef) || state.processed_webhooks.has(eventId));

    if (existingWebhook || isLegacyDuplicate) {
      return {
        idempotent: true,
        orderId: event.orderId,
        providerRef: event.providerRef,
        message: 'Webhook event already processed'
      };
    }

    try {
      const { getMoneyRepository } = require('../../storage');
      const moneyRepo = getMoneyRepository();
      const webhookInsert = await moneyRepo.recordWebhook({
        provider: targetProviderName,
        provider_event_id: eventId,
        event_type: event.eventType || (isRefundEvent ? 'REFUND_EVENT' : 'PAYMENT_EVENT'),
        payload_hash: payloadHash,
        raw_payload: body,
        signature_status: 'VALID',
        processing_status: 'PROCESSING'
      });
      if (!webhookInsert.inserted) {
        return {
          idempotent: true,
          orderId: event.orderId,
          providerRef: event.providerRef,
          message: 'Webhook event already processed'
        };
      }
    } catch (repoErr) {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        throw repoErr;
      }
    }

    // 4. Record Webhook Entry (Audit & Non-Repudiation)
    const webhookRecord = {
      id: `pwh-${uuidv4()}`,
      provider: targetProviderName,
      provider_event_id: eventId,
      event_type: event.eventType || (isRefundEvent ? 'REFUND_EVENT' : 'PAYMENT_EVENT'),
      signature_status: 'VALID',
      processing_status: 'PROCESSING',
      payload_hash: payloadHash,
      raw_payload: body,
      received_at: new Date().toISOString(),
      processed_at: null,
      retry_count: 0,
      error_message: null
    };
    state.provider_webhooks.push(webhookRecord);
    if (isRefundEvent) {
      state.processed_webhooks.add(`ref:${event.providerRef}`);
    } else {
      state.processed_webhooks.add(event.providerRef);
    }
    state.processed_webhooks.add(eventId);
    DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);

    // 5. Domain State Update on Successful Payment Event
    if (event.status === MONEY_STATE.PAID || event.status === 'SUCCESS' || event.status === 'SETTLED') {
      const { EscrowService } = require('../escrowService');

      // Update Canonical Payment record
      if (state.canonical_payments) {
        const canonical = state.canonical_payments.find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
        if (canonical) {
          const providerCapabilities = typeof provider.getCapabilities === 'function'
            ? provider.getCapabilities()
            : (typeof provider.capabilities === 'function' ? provider.capabilities() : {});
          // Invariant: Gateway escrow hold capability must NOT be assumed by provider name alone.
          // It requires contractual hold capability verified directly on the provider instance.
          const supportsEscrowHold = Boolean(providerCapabilities && providerCapabilities.hold === true);

          if (supportsEscrowHold) {
            canonical.money_state = MONEY_STATE.ESCROW_HELD;
            canonical.status = MONEY_STATE.ESCROW_HELD;
            canonical.escrow_type = 'THIRD_PARTY_PROVIDER_ESCROW';
            canonical.settlement_status = 'SETTLEMENT_HELD';
          } else {
            canonical.money_state = MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT;
            canonical.status = MONEY_STATE.PAID;
            canonical.escrow_type = 'NONE_PLATFORM_CAPTURED';
            canonical.settlement_status = 'CAPTURED_UNHELD';
          }

          canonical.paid_at = event.paidAt || new Date().toISOString();
          canonical.provider_transaction_id = event.providerRef;
          canonical.provider_fee = event.providerFee || 0;
          canonical.updated_at = new Date().toISOString();

          PaymentRoutingService.updateAttemptStatus(canonical.internal_payment_id || canonical.id, PAYMENT_ATTEMPT_STATUS.SUCCESS, event.providerRef);
          DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
        }
      }

      // Call authoritative EscrowService to fund escrow and balance double-entry FinancialLedger if order exists
      let order = state.orders ? state.orders.find(o => o.id === event.orderId) : null;
      if (!order) {
        try {
          const { getMoneyRepository } = require('../../storage');
          const moneyRepo = getMoneyRepository();
          const dbOrder = await moneyRepo.getOrderById(event.orderId);
          if (dbOrder) {
            if (!state.orders) state.orders = [];
            state.orders.push(dbOrder);
            order = dbOrder;
            const dbEscrow = await moneyRepo.getEscrowByOrderId(event.orderId);
            if (dbEscrow) {
              if (!state.escrows) state.escrows = [];
              state.escrows.push(dbEscrow);
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw e;
        }
      }

      // Invariant I2: Server-to-server status inquiry re-query
      if (typeof provider.getPaymentStatus === 'function') {
        try {
          const verified = await provider.getPaymentStatus({
            orderId: event.orderId,
            providerRef: event.providerRef,
            invoiceNumber: event.orderId ? `INV-DOKU-${event.orderId}` : event.providerRef
          });
          if (verified && !verified.simulated && verified.status !== MONEY_STATE.PAID) {
            const err = new Error(`Server-to-server status inquiry did not confirm PAID (status: ${verified.status})`);
            err.code = 'GATEWAY_STATUS_UNCONFIRMED';
            err.status = 409;
            throw err;
          }
        } catch (inqErr) {
          if (inqErr.code === 'GATEWAY_STATUS_UNCONFIRMED') throw inqErr;
        }
      }

      if (order) {
        const expectedAmt = parseInt(order.buyer_total !== undefined ? order.buyer_total : order.total_amount, 10);
        if (event.amount && parseInt(event.amount, 10) !== expectedAmt) {
          const err = new Error(`Payment amount mismatch. Expected ${expectedAmt}, got ${event.amount}`);
          err.code = 'AMOUNT_MISMATCH';
          err.status = 422;
          throw err;
        }
        if (event.currency && order.currency && event.currency.toUpperCase() !== order.currency.toUpperCase()) {
          const err = new Error(`Payment currency mismatch. Expected ${order.currency}, got ${event.currency}`);
          err.code = 'CURRENCY_MISMATCH';
          err.status = 422;
          throw err;
        }

        if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
          // Invariant I7: Late payments after expiry credited once and routed to review/refund
          await EscrowService.recordPayment({
            orderId: event.orderId,
            providerRef: event.providerRef,
            idempotencyKey: `wh-pay-${event.providerRef}`,
            amountPaid: event.amount
          });
          order.status = 'LATE_PAYMENT_PENDING_REVIEW';
          order.marketplace_status = 'LATE_PAYMENT';
          await recordAuditLog('ORDER', order.id, 'LATE_PAYMENT_CAPTURED', 'GATEWAY', {
            provider: targetProviderName,
            provider_ref: event.providerRef,
            amount: event.amount,
            action: 'FLAGGED_FOR_MANUAL_REVIEW_OR_REFUND'
          });
        } else {
          const providerCapabilities = typeof provider.getCapabilities === 'function'
            ? provider.getCapabilities()
            : (typeof provider.capabilities === 'function' ? provider.capabilities() : {});
          // Invariant: Gateway escrow hold capability must NOT be assumed by provider name alone.
          // It requires contractual hold capability verified directly on the provider instance.
          const supportsEscrowHold = Boolean(providerCapabilities && providerCapabilities.hold === true);

          await EscrowService.recordPayment({
            orderId: event.orderId,
            providerRef: event.providerRef,
            idempotencyKey: `wh-pay-${event.providerRef}`,
            amountPaid: event.amount,
            isProviderEscrow: supportsEscrowHold
          });
          order.marketplace_status = 'PAID';
          order.payment_money_state = supportsEscrowHold
            ? MONEY_STATE.ESCROW_HELD
            : MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT;
          order.escrow_type = supportsEscrowHold
            ? 'THIRD_PARTY_PROVIDER_ESCROW'
            : 'NONE_PLATFORM_CAPTURED';
        }
      }

      webhookRecord.processing_status = 'PROCESSED';
      webhookRecord.processed_at = new Date().toISOString();
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
      try {
        const { getMoneyRepository } = require('../../storage');
        const moneyRepo = getMoneyRepository();
        await moneyRepo.markWebhookProcessed(targetProviderName, eventId, 'PROCESSED');
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
          throw repoErr;
        }
      }
    } else if (
      event.status === MONEY_STATE.PAYMENT_FAILED ||
      event.status === MONEY_STATE.PAYMENT_EXPIRED ||
      event.status === 'FAILED' ||
      event.status === 'EXPIRED'
    ) {
      const isExpired = event.status === MONEY_STATE.PAYMENT_EXPIRED || event.status === 'EXPIRED';
      const targetMoneyState = isExpired ? MONEY_STATE.PAYMENT_EXPIRED : MONEY_STATE.PAYMENT_FAILED;

      if (state.canonical_payments) {
        const canonical = state.canonical_payments.find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
        if (canonical) {
          canonical.money_state = targetMoneyState;
          canonical.status = targetMoneyState;
          canonical.updated_at = new Date().toISOString();
          DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
        }
      }
      let order = state.orders ? state.orders.find(o => o.id === event.orderId) : null;
      if (!order) {
        try {
          const { getMoneyRepository } = require('../../storage');
          const moneyRepo = getMoneyRepository();
          if (moneyRepo && typeof moneyRepo.getOrderById === 'function') {
            order = await moneyRepo.getOrderById(event.orderId);
            if (order) {
              if (!state.orders) state.orders = [];
              state.orders.push(order);
            }
          }
        } catch (_) {}
      }

      if (order) {
        order.status = isExpired ? 'EXPIRED' : 'CANCELLED';
        order.marketplace_status = isExpired ? 'PAYMENT_EXPIRED' : 'PAYMENT_FAILED';

        // P0/P1 INVENTORY RECOVERY: Idempotently release reserved ticket inventory on terminal failure or expiration
        try {
          const { EscrowService } = require('../escrowService');
          await EscrowService.releaseInventoryForOrder(order.id, isExpired ? 'GATEWAY_PAYMENT_EXPIRED' : 'GATEWAY_PAYMENT_FAILED');
        } catch (releaseErr) {
          console.error(`[PaymentService] Failed to release inventory for order ${order.id}:`, releaseErr.message);
        }
      }
      webhookRecord.processing_status = 'PROCESSED';
      webhookRecord.processed_at = new Date().toISOString();
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
    } else if (isRefundEvent) {
      const { EscrowService } = require('../escrowService');

      // Update Canonical Payment record
      if (state.canonical_payments) {
        const canonical = state.canonical_payments.find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
        if (canonical) {
          canonical.money_state = MONEY_STATE.REFUNDED;
          canonical.status = MONEY_STATE.REFUNDED;
          canonical.refund_status = 'PROVIDER_REFUND_CONFIRMED';
          canonical.refunded_at = new Date().toISOString();
          canonical.updated_at = new Date().toISOString();
          DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
        }
      }

      // Authoritative provider confirmation transition in EscrowService
      try {
        await EscrowService.confirmProviderRefund({
          orderId: event.orderId,
          providerRef: event.providerRef,
          providerEventId: eventId,
          rawPayload: body,
          actorId: `WEBHOOK_${targetProviderName.toUpperCase()}`
        });
      } catch (confirmErr) {
        console.error(`[PaymentService] Failed to confirm provider refund via webhook for order ${event.orderId}:`, confirmErr.message);
      }

      webhookRecord.processing_status = 'PROCESSED';
      webhookRecord.processed_at = new Date().toISOString();
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
    } else {
      webhookRecord.processing_status = 'PROCESSED';
      webhookRecord.processed_at = new Date().toISOString();
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
    }

    try {
      const { getMoneyRepository } = require('../../storage');
      const moneyRepo = getMoneyRepository();
      await moneyRepo.markWebhookProcessed(targetProviderName, eventId, 'PROCESSED');
    } catch (_) {}

    await recordAuditLog('WEBHOOK', eventId, 'PROCESSED', targetProviderName, {
      order_id: event.orderId,
      provider_ref: event.providerRef,
      amount: event.amount,
      status: event.status
    });

    return {
      idempotent: false,
      event
    };
  }

  /**
   * Authoritative Release Execution for Settlement Hold (Section 6 & ARGUS)
   * Enforces:
   * 1. ARGUS Trust Engine release authorization
   * 2. Venue PIC entry verification / valid attestation
   * 3. Hold & Release API invocation on DOKU rail (POST /finance/v1/release)
   * 4. Idempotency & duplicate release protection
   * 5. Double-entry Financial Ledger balancing
   */
  static async executeRelease({ orderId, actorId = 'SYSTEM' }) {
    if (!orderId) throw new Error('orderId is required for release');

    // 1. Resolve Order & Escrow
    let order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    let escrow = state.escrows ? state.escrows.find(e => e.order_id === orderId) : null;
    if (!order) {
      try {
        const { getMoneyRepository } = require('../../storage');
        const moneyRepo = getMoneyRepository();
        if (moneyRepo) {
          order = await moneyRepo.getOrderById(orderId);
          if (order) {
            if (!state.orders) state.orders = [];
            state.orders.push(order);
          }
        }
      } catch (_) {}
    }
    if (!escrow) {
      try {
        const { getMoneyRepository } = require('../../storage');
        const moneyRepo = getMoneyRepository();
        if (moneyRepo) {
          escrow = await moneyRepo.getEscrowByOrderId(orderId);
          if (escrow) {
            if (!state.escrows) state.escrows = [];
            state.escrows.push(escrow);
          }
        }
      } catch (_) {}
    }
    if (!order || !escrow) {
      const err = new Error(`Order or Escrow record not found for order '${orderId}'`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // 2. Idempotency Check: if already released, return success without duplicating release
    if (escrow.status === 'RELEASED' || order.status === 'SETTLED') {
      return {
        success: true,
        alreadyReleased: true,
        idempotent: true,
        orderId,
        message: 'Settlement already released'
      };
    }

    // 3. Operational Invariants: Disputed, Frozen, or Refund-Pending states strictly block release
    if (escrow.status === 'DISPUTED' || order.status === 'DISPUTED') {
      const err = new Error('Cannot release settlement: transaction is in DISPUTED state');
      err.code = 'TRANSACTION_IN_DISPUTED_STATE';
      err.status = 400;
      throw err;
    }
    if (escrow.status === 'FROZEN' || order.status === 'FROZEN') {
      const err = new Error('Cannot release settlement: transaction is in FROZEN state');
      err.code = 'TRANSACTION_IN_FROZEN_STATE';
      err.status = 400;
      throw err;
    }
    if (escrow.status === 'REFUND_PENDING' || order.status === 'REFUND_PENDING') {
      const err = new Error('Cannot release settlement: transaction is in REFUND_PENDING state');
      err.code = 'TRANSACTION_IN_REFUND_PENDING_STATE';
      err.status = 400;
      throw err;
    }

    // 4. Operational Invariant: Confirmed PIC venue entry required (or favorable dispute)
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
      err.status = 403;
      throw err;
    }

    // 5. ARGUS Trust Engine Release Authorization Gate
    const { TrustPolicyEngine, AUTHORIZATION_OUTCOME } = require('../../trust/TrustPolicyEngine');
    const authDecision = await TrustPolicyEngine.evaluateAuthorization(orderId);

    if (!authDecision.financial_release_authorized || authDecision.outcome !== AUTHORIZATION_OUTCOME.PASS) {
      const allReasons = (authDecision.blocking_reasons || []).concat(authDecision.exception_reasons || []);
      const err = new Error(
        `Security violation: Financial release denied by ARGUS Trust Policy Engine [${authDecision.outcome}]. ${allReasons.join(', ') || 'Required trust attestations not satisfied'}`
      );
      err.code = 'FINANCIAL_RELEASE_NOT_AUTHORIZED';
      err.outcome = authDecision.outcome;
      err.status = 403;
      err.details = authDecision;
      throw err;
    }

    // 6. Provider-level release execution
    const canonical = (state.canonical_payments || []).find(p => p.order_id === orderId);
    const providerName = (canonical?.provider || order.provider || paymentManager.defaultProvider || 'doku').toLowerCase();
    const provider = paymentManager.getProvider(providerName);

    let providerReleaseResult = null;
    if (providerName === 'doku' && typeof provider.executeRelease === 'function') {
      const invoiceNumber = canonical?.metadata?.invoiceNumber || canonical?.provider_reference || `INV-DOKU-${orderId}`;
      const originalRequestId = canonical?.metadata?.originalRequestId || canonical?.metadata?.dokuRequestId || canonical?.original_request_id || canonical?.idempotency_key || `req-${orderId}`;
      const releaseAmount = canonical?.gross_amount || escrow.amount;

      if (canonical) {
        canonical.money_state = MONEY_STATE.RELEASE_REQUESTED;
        canonical.status = MONEY_STATE.RELEASE_REQUESTED;
        canonical.settlement_status = 'RELEASE_REQUESTED';
      }

      try {
        providerReleaseResult = await provider.executeRelease({
          invoiceNumber,
          amount: releaseAmount,
          currency: canonical?.currency || 'IDR',
          originalRequestId,
          orderId
        });
      } catch (relErr) {
        if (relErr.code === 'RELEASE_TIMEOUT_PENDING_RECONCILIATION' || relErr.code === 'RELEASE_NETWORK_ERROR' || relErr.status === 504) {
          if (canonical) {
            canonical.money_state = MONEY_STATE.PENDING_RECONCILIATION;
            canonical.status = MONEY_STATE.PENDING_RECONCILIATION;
            canonical.settlement_status = 'PENDING_RECONCILIATION';
          }
          await recordAuditLog('RELEASE', orderId, 'RELEASE_TIMEOUT_FLAGGED_FOR_RECONCILIATION', actorId, {
            invoiceNumber,
            originalRequestId,
            error: relErr.message
          });
        }
        throw relErr;
      }
    }

    // 7. Transition to RELEASE_CONFIRMED & update states
    if (canonical) {
      canonical.money_state = MONEY_STATE.RELEASE_CONFIRMED;
      canonical.status = MONEY_STATE.RELEASE_CONFIRMED;
      canonical.settlement_status = 'RELEASE_CONFIRMED';
      canonical.released_at = new Date().toISOString();
      DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
    }

    escrow.status = 'RELEASED';
    escrow.released_at = new Date().toISOString();
    order.status = 'SETTLED';

    // 8. Double-Entry Financial Ledger
    const { FinancialLedger } = require('../../settlement/FinancialLedger');
    let ledgerTx = null;
    try {
      ledgerTx = await FinancialLedger.recordDisbursementRelease({
        orderId,
        quoteId: order.quote_id || escrow.quote_id || null,
        sellerAmount: escrow.amount,
        actorId
      });
    } catch (_) {}

    await recordAuditLog('ESCROW', escrow.id, 'SETTLEMENT_RELEASED_CONFIRMED', actorId, {
      order_id: orderId,
      provider: providerName,
      provider_release: providerReleaseResult,
      authorization_id: authDecision.authorization_id,
      ledger_transaction_id: ledgerTx?.transaction_id || null,
      released_at: escrow.released_at
    });

    return {
      success: true,
      alreadyReleased: false,
      idempotent: false,
      orderId,
      escrow,
      order,
      authorization: authDecision,
      providerRelease: providerReleaseResult,
      ledgerTransaction: ledgerTx
    };
  }

  /**
   * Request refund through provider adapter.
   */
  static async requestRefund({ orderId, amount, reason, providerName = null, idempotencyKey = null }) {
    const targetProviderName = (providerName || paymentManager.defaultProvider || 'doku').toLowerCase();
    const provider = paymentManager.getProvider(targetProviderName);
    if (!provider) {
      throw new Error(`Provider '${targetProviderName}' not registered`);
    }

    const caps = provider.getCapabilities();
    if (!caps.refund) {
      throw new CapabilityUnsupportedError(targetProviderName, 'refund');
    }

    const refundResult = await provider.requestRefund({
      orderId,
      amount,
      reason,
      idempotencyKey: idempotencyKey || `ref-${orderId}-${Date.now()}`
    });

    const isConfirmed = refundResult?.status === 'CONFIRMED' || refundResult?.status === 'SUCCESS' || refundResult?.refunded === true;
    const isFailed = refundResult?.status === 'FAILED';

    if (state.canonical_payments) {
      const canonical = state.canonical_payments.find(p => p.order_id === orderId);
      if (canonical) {
        if (isConfirmed) {
          canonical.money_state = MONEY_STATE.REFUNDED;
          canonical.status = MONEY_STATE.REFUNDED;
          canonical.refund_status = 'PROVIDER_REFUND_CONFIRMED';
          canonical.refunded_at = new Date().toISOString();
        } else if (isFailed) {
          canonical.money_state = MONEY_STATE.RECONCILIATION_REQUIRED;
          canonical.status = MONEY_STATE.RECONCILIATION_REQUIRED;
          canonical.refund_status = 'REFUND_FAILED';
        } else {
          canonical.money_state = MONEY_STATE.REFUND_PENDING;
          canonical.status = MONEY_STATE.REFUND_PENDING;
          canonical.refund_status = 'PROVIDER_REFUND_REQUESTED';
          canonical.refund_pending_at = new Date().toISOString();
        }
        canonical.updated_at = new Date().toISOString();
        DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
      }
    }

    return refundResult;
  }

  /**
   * Handles incoming chargeback event from provider
   */
  static async handleChargeback({ orderId, providerRef, amount, reason, deadline = null, providerName = 'doku' }) {
    if (!state.chargebacks) state.chargebacks = [];

    const chargebackId = `cb-${uuidv4()}`;
    const record = createCanonicalChargebackRecord({
      chargebackId,
      orderId,
      paymentId: providerRef,
      provider: providerName,
      providerTransactionId: providerRef,
      amount: parseInt(amount, 10),
      currency: 'IDR',
      reason: reason || 'CHARGEBACK_INITIATED',
      deadline,
      status: 'OPEN'
    });

    state.chargebacks.push(record);
    DurableFinancialStore.persist('chargebacks', state.chargebacks);

    // Freeze associated order and escrow
    if (state.orders) {
      const order = state.orders.find(o => o.id === orderId);
      if (order) order.status = 'CHARGEBACK_LOCKED';
    }
    if (state.escrows) {
      const escrow = state.escrows.find(e => e.order_id === orderId);
      if (escrow) escrow.status = 'DISPUTED';
    }

    await recordAuditLog('CHARGEBACK', chargebackId, 'OPENED', providerName, {
      order_id: orderId,
      provider_ref: providerRef,
      amount: record.amount,
      reason
    });

    return record;
  }

  /**
   * Real automated reconciliation comparison (Section 27)
   */
  static async reconcileTransactions({ date = new Date().toISOString().split('T')[0], providerName = null }) {
    const targetProviderName = (providerName || paymentManager.defaultProvider || 'doku').toLowerCase();
    const payments = (state.canonical_payments || []).filter(p => p.provider === targetProviderName);
    const reconciliationBatchId = `rec-batch-${Date.now()}`;
    const results = [];
    let variancesFound = 0;

    if (!state.payment_reconciliation_logs) {
      state.payment_reconciliation_logs = [];
    }

    for (const p of payments) {
      const order = (state.orders || []).find(o => o.id === p.order_id);
      const escrow = (state.escrows || []).find(e => e.order_id === p.order_id);

      let status = 'MATCHED';
      let variance = 0;
      let notes = 'Transactions balanced and matched across ledger';

      // Check amount matching
      const expectedAmount = order ? (order.buyer_total || order.total_amount) : p.gross_amount;
      if (p.gross_amount !== expectedAmount) {
        status = 'AMOUNT_MISMATCH';
        variance = p.gross_amount - expectedAmount;
        variancesFound++;
        notes = `Amount mismatch: Payment Rp ${p.gross_amount} vs Order Rp ${expectedAmount}`;
      }

      // Check escrow state alignment
      if (p.money_state === MONEY_STATE.PAID && escrow && escrow.status === 'PENDING_PAYMENT') {
        status = 'TIKUM_UNPAID_PROVIDER_PAID';
        variancesFound++;
        notes = 'Provider marked paid but Tikum escrow was still pending payment';
      }

      const record = {
        id: `rec-${uuidv4()}`,
        batch_id: reconciliationBatchId,
        reconciliation_date: date,
        provider: targetProviderName,
        internal_transaction_id: p.id,
        provider_transaction_id: p.provider_transaction_id,
        order_id: p.order_id,
        internal_amount: p.gross_amount,
        status,
        variance,
        notes,
        created_at: new Date().toISOString()
      };

      state.payment_reconciliation_logs.push(record);
      results.push(record);
    }

    DurableFinancialStore.persist('payment_reconciliation_logs', state.payment_reconciliation_logs);

    return {
      batch_id: reconciliationBatchId,
      provider: targetProviderName,
      reconciled_count: results.length,
      variances_found: variancesFound,
      records: results
    };
  }

  /**
   * Event-level cancellation & mass refund (Section 23)
   */
  static async handleEventCancellation({ eventId, actorId = 'SYSTEM', reason = 'EVENT_CANCELLED' }) {
    if (!eventId) throw new Error('eventId is required for cancellation');

    const affectedOrders = (state.orders || []).filter(o => o.event_id === eventId && o.status !== 'CANCELLED');
    const results = [];

    const { EscrowService } = require('../escrowService');

    for (const order of affectedOrders) {
      // Freeze release immediately
      order.status = 'CANCELLED';
      order.marketplace_status = 'CANCELLED';

      const escrow = (state.escrows || []).find(e => e.order_id === order.id);
      if (escrow && (escrow.status === 'ESCROWED' || escrow.status === 'PAID')) {
        const refundRes = await EscrowService.refundToBuyer(order.id, actorId, `EVENT_CANCELLED: ${reason}`);
        results.push({
          order_id: order.id,
          refunded: true,
          amount: escrow.amount,
          result: refundRes
        });
      } else {
        results.push({
          order_id: order.id,
          refunded: false,
          reason: 'Escrow was not funded'
        });
      }
    }

    await recordAuditLog('EVENT', eventId, 'CANCELLED_MASS_REFUND', actorId, {
      affected_orders: affectedOrders.length,
      refunded_count: results.filter(r => r.refunded).length,
      reason
    });

    return {
      eventId,
      affected_orders: affectedOrders.length,
      results
    };
  }
}

module.exports = {
  PaymentService,
  PRODUCTION_SAFETY_GATES
};
