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

const inFlightCreatePayments = new Map();
const inFlightReleases = new Map();

class PaymentService {
  static _buildCheckoutInvoiceNumber(orderId) {
    const raw = `INV-DOKU-${orderId}`;
    if (/^[A-Za-z0-9-]{1,30}$/.test(raw)) return raw;
    const hash26 = crypto.createHash('sha256').update(String(orderId)).digest('hex').slice(0, 26).toUpperCase();
    return `INV-${hash26}`;
  }

  static _syncPaymentToState(paymentRecord) {
    if (!paymentRecord) return;
    if (!state.canonical_payments) state.canonical_payments = [];
    const idx = state.canonical_payments.findIndex(
      p => p.id === paymentRecord.id || (p.internal_payment_id && p.internal_payment_id === paymentRecord.internal_payment_id)
    );
    if (idx >= 0) {
      state.canonical_payments[idx] = { ...state.canonical_payments[idx], ...paymentRecord };
    } else {
      state.canonical_payments.push(paymentRecord);
    }
    DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
  }

  static async verifyCaptureLedger(orderOrId, txContext = null) {
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId?.id;
    const { LedgerVerificationService } = require('../../settlement/LedgerVerificationService');
    return await LedgerVerificationService.verifyDurableCapture(orderId, { txContext });
  }
  /**
   * Environment & Sandbox Diagnostic (Safe, zero credential leakage)
   */
  static getEnvironmentDiagnostic() {
    const defaultName = paymentManager.defaultProvider || 'doku';
    let provider = null;
    try {
      provider = paymentManager.getProvider(defaultName);
    } catch (e) {}

    const status = provider && typeof provider.getStatus === 'function' ? provider.getStatus() : {};
    const configValidation = provider && typeof provider.validateConfiguration === 'function'
      ? provider.validateConfiguration()
      : {};

    const hasClientId = Boolean(provider?.clientId || process.env.DOKU_SANDBOX_CLIENT_ID || process.env.DOKU_CLIENT_ID);
    const hasSecretKey = Boolean(provider?.secretKey || process.env.DOKU_SANDBOX_SECRET_KEY || process.env.DOKU_SECRET_KEY);
    const hasWebhookSecret = Boolean(provider?.webhookSecret || process.env.DOKU_WEBHOOK_SECRET || hasSecretKey);

    return {
      selected_environment: status.environment || process.env.DOKU_ENV || 'sandbox',
      node_runtime_mode: process.env.NODE_ENV || 'development',
      deployment_environment: process.env.VERCEL_ENV || (process.env.VERCEL ? 'unknown' : 'local'),
      payment_environment: status.payment_environment || status.environment || 'sandbox',
      selected_provider: defaultName,
      api_hostname: status.api_base_url || 'https://api-sandbox.doku.com',
      credential_presence: {
        has_client_id: hasClientId,
        has_secret_key: hasSecretKey,
        has_webhook_secret: hasWebhookSecret
      },
      merchant_entity: 'PT SHINERVA PRAJNA TEJAS',
      production_payment_lock: {
        is_sandbox: Boolean(status.is_sandbox !== false),
        production_gated: Boolean(status.production_gated !== false),
        enable_production: Boolean(process.env.ENABLE_DOKU_PRODUCTION === 'true'),
        marketplace_mode: process.env.MARKETPLACE_MODE || 'PRELAUNCH_LISTING_ONLY'
      },
      webhook_readiness: {
        ready: Boolean(hasWebhookSecret),
        endpoint: '/api/v1/payments/webhook/doku',
        signature_algorithm: 'HMAC-SHA256',
        replay_protection_window_seconds: 300
      }
    };
  }

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
   * Enforces fail-closed itemization, atomic pre-call durable idempotency, and retryable recovery.
   */
  static async createPayment({
    orderId,
    amount,
    currency = 'IDR',
    channel,
    buyer = {},
    providerName = null,
    idempotencyKey = null,
    requiresEscrow = undefined,
    metadata = {}
  }) {
    const { isPrelaunchListingMode } = require('../../config/marketplaceMode');
    if (isPrelaunchListingMode()) {
      const err = new Error('TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.');
      err.code = 'MARKETPLACE_PRELAUNCH_ONLY';
      err.status = 403;
      throw err;
    }

    if (!orderId) {
      const err = new Error('orderId is required for payment creation');
      err.code = 'INVALID_ORDER_ID';
      err.status = 400;
      throw err;
    }

    const targetProviderName = (providerName || paymentManager.defaultProvider || 'doku').toLowerCase();
    const effectiveIdempotencyKey = idempotencyKey || `idemp-${orderId}-${targetProviderName}`;

    let effectiveChannel = channel || 'VA_DOKU';
    let effectiveProviderName = targetProviderName;
    let fallbackInfo = null;

    if (effectiveProviderName === 'doku') {
      const resolved = PaymentRoutingService.resolveResilientChannelOrFallback({
        channel: effectiveChannel,
        requiresEscrow: requiresEscrow !== undefined ? requiresEscrow : true,
        orderId
      });
      if (resolved.fallbackApplied) {
        fallbackInfo = resolved;
        effectiveChannel = resolved.channel;
        effectiveProviderName = resolved.provider;
      }
    }

    const provider = paymentManager.getProvider(effectiveProviderName);
    if (!provider) {
      const err = new Error(`Payment provider '${effectiveProviderName}' not supported`);
      err.code = 'UNKNOWN_PAYMENT_PROVIDER';
      throw err;
    }

    const providerSupportsHold = Boolean(provider.getCapabilities?.().hold);
    const effectiveRequiresEscrow = (requiresEscrow !== undefined && requiresEscrow !== null)
      ? Boolean(requiresEscrow)
      : providerSupportsHold;

    // Assert failover is permissible
    PaymentRoutingService.assertFailoverAllowed(orderId, effectiveRequiresEscrow, effectiveProviderName);

    // Production Safety Gate & Verification Check
    const providerStatus = provider.getStatus();
    const isSimulationAllowed = provider.config?.allowTestSimulation || provider.config?.allowSimulation || provider.allowSimulation;
    if (!providerStatus.isVerified && !isSimulationAllowed) {
      const err = new Error(
        `Payment provider '${effectiveProviderName}' is ${providerStatus.status}. Real-money marketplace activation is gated until verification and merchant KYC are complete.`
      );
      err.code = 'PAYMENT_PROVIDER_PENDING_VERIFICATION';
      err.status = 503;
      throw err;
    }

    const { getMoneyRepository } = require('../../storage');
    const { UnitOfWork } = require('../../storage/UnitOfWork');
    const attemptRepo = getMoneyRepository();

    // Wait for any in-flight same-process creation for this orderId so concurrent callers converge cleanly
    while (inFlightCreatePayments.has(orderId)) {
      try {
        await inFlightCreatePayments.get(orderId);
      } catch (_) {}
    }

    // Resolve Authoritative Order & Quote from durable repository first
    let order = attemptRepo && typeof attemptRepo.getOrderById === 'function'
      ? await attemptRepo.getOrderById(orderId)
      : null;
    if (!order && (!attemptRepo || attemptRepo.degraded)) {
      order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    } else if (order) {
      if (!state.orders) state.orders = [];
      const oIdx = state.orders.findIndex(o => o.id === orderId);
      if (oIdx >= 0) state.orders[oIdx] = { ...state.orders[oIdx], ...order };
      else state.orders.push(order);
    } else {
      order = state.orders ? state.orders.find(o => o.id === orderId) : null;
    }

    if (!order) {
      const err = new Error(`Order '${orderId}' not found in canonical ledger or state`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const quote = order.quote_id && attemptRepo && typeof attemptRepo.getQuoteById === 'function'
      ? await attemptRepo.getQuoteById(order.quote_id)
      : (order.quote_id && state.quotes ? state.quotes.find(q => q.id === order.quote_id || q.quote_id === order.quote_id) : null);

    if (order.quote_id && !quote) {
      const err = new Error(`Bound quote '${order.quote_id}' not found for order '${orderId}'`);
      err.code = 'BOUND_QUOTE_MISSING';
      err.status = 400;
      throw err;
    }
    if (quote && (quote.listing_id !== order.listing_id || quote.buyer_id !== order.buyer_id)) {
      const err = new Error(`Bound quote '${order.quote_id}' context disagrees with order '${orderId}'`);
      err.code = 'BOUND_QUOTE_MISMATCH';
      err.status = 409;
      throw err;
    }

    const parsedAmount = Number(amount);
    const upperCurrency = String(currency || 'IDR').toUpperCase();
    const expectedOrderAmount = Number(order.buyer_total ?? order.total_amount ?? quote?.buyer_total);
    const expectedOrderCurrency = String(order.currency || quote?.currency || 'IDR').toUpperCase();

    // Prevent using one explicit idempotency key across multiple orders
    if (idempotencyKey && attemptRepo && typeof attemptRepo.getPaymentByIdempotencyKey === 'function') {
      const sameKeyPayment = await attemptRepo.getPaymentByIdempotencyKey(effectiveIdempotencyKey);
      if (sameKeyPayment && sameKeyPayment.order_id !== orderId) {
        const err = new Error(`Idempotency key '${effectiveIdempotencyKey}' already bound to order '${sameKeyPayment.order_id}'`);
        err.code = 'IDEMPOTENCY_KEY_CONFLICT';
        err.status = 409;
        throw err;
      }
    }

    const upperChannel = String(effectiveChannel || 'VA_DOKU').toUpperCase().trim();
    const isVaChannel = upperChannel.startsWith('VA') || upperChannel.includes('VIRTUAL_ACCOUNT');
    const isQrisChannel = upperChannel === 'QRIS' || upperChannel === 'QRIS_DOKU';
    const isDokuCheckout = effectiveProviderName === 'doku' && !isVaChannel && !isQrisChannel;

    // Derive authoritative itemization for DOKU Checkout before claiming idempotency (fail closed)
    let authoritativeCheckoutMeta = {};
    if (isDokuCheckout) {
      const qty = Number(order.quantity ?? quote?.quantity);
      const unitPrice = Number(order.unit_listing_price ?? order.ticket_price ?? quote?.ticket_price);
      const explicitUnitFee = order.buyer_fee_per_ticket !== undefined && order.buyer_fee_per_ticket !== null
        ? Number(order.buyer_fee_per_ticket)
        : null;
      const totalBuyerFee = explicitUnitFee !== null
        ? explicitUnitFee * qty
        : Number(order.buyer_fee ?? quote?.buyer_fee ?? order.service_fee);
      const unitFee = explicitUnitFee !== null
        ? explicitUnitFee
        : (Number.isSafeInteger(qty) && qty > 0 && Number.isSafeInteger(totalBuyerFee) && totalBuyerFee % qty === 0
          ? totalBuyerFee / qty
          : NaN);
      const fulfillmentType = order.fulfillment_type || order.fulfillment_option || quote?.fulfillment_option || quote?.fulfillment_type;

      if (
        expectedOrderCurrency !== 'IDR' ||
        !Number.isSafeInteger(expectedOrderAmount) || expectedOrderAmount <= 0 ||
        !Number.isSafeInteger(qty) || qty <= 0 ||
        !Number.isSafeInteger(unitPrice) || unitPrice <= 0 ||
        !Number.isSafeInteger(unitFee) || unitFee < 0 ||
        !['SELLER_MANAGED', 'TIKUM_VENUE_PIC'].includes(fulfillmentType) ||
        !Number.isSafeInteger(qty * (unitPrice + unitFee)) ||
        qty * (unitPrice + unitFee) !== expectedOrderAmount
      ) {
        const err = new Error('Authoritative order/quote missing or inconsistent for DOKU Checkout itemization');
        err.code = 'INVALID_CHECKOUT_ITEMIZATION';
        err.status = 400;
        throw err;
      }
      authoritativeCheckoutMeta = {
        quantity: qty,
        unit_listing_price: unitPrice,
        buyer_fee_per_ticket: unitFee,
        fulfillment_type: fulfillmentType
      };
    } else {
      authoritativeCheckoutMeta = {
        quantity: order.quantity ?? quote?.quantity,
        unit_listing_price: order.unit_listing_price ?? order.ticket_price ?? quote?.ticket_price,
        buyer_fee_per_ticket: order.buyer_fee_per_ticket ?? (order.quantity ? Number(order.buyer_fee || 0) / Number(order.quantity) : undefined),
        fulfillment_type: order.fulfillment_type || order.fulfillment_option || quote?.fulfillment_option
      };
    }

    const invoiceNumber = metadata?.invoiceNumber || (
      isDokuCheckout
        ? this._buildCheckoutInvoiceNumber(orderId)
        : `INV-DOKU-${orderId}`
    );

    const claimKey = `payment-order-${crypto.createHash('sha256').update(String(orderId)).digest('hex')}`;
    // Validate input amount/currency against order if no prior active payment exists
    const priorRecord = attemptRepo ? await attemptRepo.checkIdempotency(claimKey, 'PAYMENT_CREATE') : null;
    const hasActiveClaim = Boolean(priorRecord && priorRecord.status !== 'FAILED_RETRYABLE');
    if (!hasActiveClaim) {
      if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
        const err = new Error('Payment amount must be a positive integer');
        err.code = 'INVALID_PAYMENT_AMOUNT';
        err.status = 400;
        throw err;
      }
      if (Number.isSafeInteger(expectedOrderAmount) && parsedAmount !== expectedOrderAmount) {
        const err = new Error(`Payment amount ${parsedAmount} mismatches authoritative order total ${expectedOrderAmount}`);
        err.code = 'AMOUNT_MISMATCH';
        err.status = 422;
        throw err;
      }
      if (upperCurrency !== expectedOrderCurrency) {
        const err = new Error(`Payment currency '${upperCurrency}' mismatches order currency '${expectedOrderCurrency}'`);
        err.code = 'CURRENCY_MISMATCH';
        err.status = 422;
        throw err;
      }
    }

    const formatIdempotentPayment = (p) => {
      const m = p.metadata || {};
      const resolvedInvoice = m.invoice_number || m.invoiceNumber || p.provider_reference || null;
      const resolvedUrl = m.payment_url || m.paymentUrl || m.paymentDetails?.checkoutUrl || null;
      return {
        idempotent: true,
        paymentId: p.internal_payment_id || p.id,
        orderId: p.order_id,
        invoiceNumber: resolvedInvoice,
        invoice_number: resolvedInvoice,
        provider: p.provider,
        provider_env: m.provider_env || provider.env || 'sandbox',
        providerRef: p.provider_reference || resolvedInvoice,
        doku_original_request_id: m.doku_original_request_id || m.originalRequestId || p.original_request_id || null,
        amount: Number(p.gross_amount),
        currency: p.currency || upperCurrency,
        status: p.status,
        moneyState: p.money_state || p.status,
        businessState: p.business_state || TIKUM_BUSINESS_STATE.TICKET_RESERVED,
        provider_settlement_status: m.provider_settlement_status || 'UNKNOWN',
        internal_settlement_status: m.internal_settlement_status || p.status,
        paymentUrl: resolvedUrl,
        payment_url: resolvedUrl,
        paymentDetails: m.paymentDetails || {},
        simulated: Boolean(m.simulated)
      };
    };

    const freshPaymentId = `pay-${uuidv4()}`;
    const attemptId = `att-${uuidv4()}`;

    let releaseBarrier = null;
    const barrierPromise = new Promise(resolve => { releaseBarrier = resolve; });
    let ownsBarrier = false;

    try {
      // Atomic pre-call claim & PENDING payment + attempt persistence prior to external provider call
      const claim = await UnitOfWork.execute(async tx => {
        const existingClaim = await attemptRepo.checkIdempotency(claimKey, 'PAYMENT_CREATE', tx);
        const targetPaymentId = (existingClaim && existingClaim.status === 'FAILED_RETRYABLE' && existingClaim.response_payload?.payment_id)
          ? existingClaim.response_payload.payment_id
          : freshPaymentId;
        const attemptNumber = (existingClaim?.response_payload?.attempt_count || 0) + 1;

        const claimed = await attemptRepo.claimIdempotency(
          claimKey,
          'PAYMENT_CREATE',
          {
            payment_id: targetPaymentId,
            order_id: orderId,
            idempotency_key: effectiveIdempotencyKey,
            attempt_count: attemptNumber
          },
          tx
        );
        if (!claimed) {
          const record = await attemptRepo.checkIdempotency(claimKey, 'PAYMENT_CREATE', tx);
          const payment = record?.response_payload?.payment_id
            ? await attemptRepo.getPaymentById(record.response_payload.payment_id, tx)
            : await attemptRepo.getPaymentByOrderId(orderId, tx);
          if (!payment) throw new Error('Payment claim exists without its durable payment record');
          if (
            Number(payment.gross_amount) !== parsedAmount ||
            String(payment.currency).toUpperCase() !== upperCurrency ||
            (payment.provider && String(payment.provider).toLowerCase() !== effectiveProviderName)
          ) {
            const err = new Error('Existing payment attempt conflicts with amount, currency, or provider');
            err.code = 'PAYMENT_ATTEMPT_CONFLICT';
            err.status = 409;
            throw err;
          }
          return { payment, claimed: false, record };
        }

        const preCallMetadata = {
          provider: effectiveProviderName,
          provider_env: provider.env || 'sandbox',
          invoice_number: invoiceNumber,
          doku_original_request_id: null,
          payment_url: null,
          provider_settlement_status: 'UNKNOWN',
          internal_settlement_status: 'PAYMENT_PENDING',
          last_payment_attempt_status: 'PENDING'
        };

        const payment = await attemptRepo.createPayment({
          id: targetPaymentId,
          internal_payment_id: targetPaymentId,
          order_id: orderId,
          buyer_id: buyer.id || order.buyer_id || 'unknown-buyer',
          seller_id: order.seller_id || 'unknown-seller',
          provider: effectiveProviderName,
          currency: upperCurrency,
          gross_amount: parsedAmount,
          status: 'PAYMENT_PENDING',
          money_state: 'PAYMENT_PENDING',
          payment_method: effectiveChannel,
          idempotency_key: effectiveIdempotencyKey,
          metadata: preCallMetadata
        }, tx);

        await attemptRepo.recordPaymentAttempt({
          id: attemptId,
          payment_id: targetPaymentId,
          order_id: orderId,
          provider: effectiveProviderName,
          channel: effectiveChannel,
          attempt_number: attemptNumber,
          status: 'PENDING'
        }, tx);

        inFlightCreatePayments.set(orderId, barrierPromise);
        ownsBarrier = true;
        return { payment, claimed: true, paymentId: targetPaymentId, attemptNumber };
      });

      if (!claim.claimed) {
        let latestPayment = claim.payment;
        if (!latestPayment?.metadata?.payment_url && !latestPayment?.provider_reference) {
          const inflight = inFlightCreatePayments.get(orderId);
          if (inflight) {
            try { await inflight; } catch (_) {}
          }
          latestPayment = (await attemptRepo.getPaymentById(claim.payment.id)) || claim.payment;
        }
        return formatIdempotentPayment(latestPayment);
      }

      const internalPaymentId = claim.paymentId;

      // Delegate to provider adapter
      let providerResult;
      try {
        providerResult = await provider.createPayment({
          orderId,
          amount: parsedAmount,
          currency: upperCurrency,
          channel: effectiveChannel,
          buyer,
          requiresEscrow: effectiveRequiresEscrow,
          idempotencyKey: effectiveIdempotencyKey,
          metadata: {
            ...metadata,
            ...authoritativeCheckoutMeta,
            invoiceNumber
          }
        });
        PaymentRoutingService.recordProviderSuccess(effectiveProviderName);
      } catch (createErr) {
        PaymentRoutingService.recordProviderFailure(effectiveProviderName);
        // Failure or timeout prior to session issuance: mark retryable so buyer is NOT permanently locked out
        try {
          await attemptRepo.updatePaymentAttemptStatus(attemptId, 'FAILED_RETRYABLE', {
            error_code: createErr.code || 'PROVIDER_CREATE_FAILED',
            error_message: createErr.message
          });
          await attemptRepo.updatePaymentMetadata(internalPaymentId, {
            last_payment_attempt_status: 'FAILED_RETRYABLE',
            last_attempt_error_code: createErr.code || 'PROVIDER_CREATE_FAILED',
            last_attempt_error_message: createErr.message
          });
          await attemptRepo.markIdempotencyRetryable(claimKey, 'PAYMENT_CREATE', {
            payment_id: internalPaymentId,
            order_id: orderId,
            attempt_count: claim.attemptNumber,
            last_error_code: createErr.code || 'PROVIDER_CREATE_FAILED'
          });
        } catch (cleanupErr) {
          if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
            throw cleanupErr;
          }
        }
        throw createErr;
      }

      const resolvedInvoice = providerResult.invoice_number || providerResult.invoiceNumber || providerResult.paymentDetails?.invoiceNumber || invoiceNumber;
      const providerRef = providerResult.providerReference || providerResult.referenceId || providerResult.providerRef || resolvedInvoice || `ref-${Date.now()}`;
      const providerTxId = providerResult.providerTransactionId || providerRef;
      const resolvedPaymentUrl = providerResult.payment_url || providerResult.paymentUrl || providerResult.paymentDetails?.redirect_url || providerResult.paymentDetails?.checkoutUrl || null;
      const originalReqId = providerResult.doku_original_request_id || providerResult.originalRequestId || providerResult.dokuRequestId || null;
      const resolvedProviderEnv = providerResult.provider_env || provider.env || 'sandbox';
      const resolvedProvSettlementStatus = providerResult.provider_settlement_status || 'UNKNOWN';
      const resolvedIntSettlementStatus = providerResult.internal_settlement_status || MONEY_STATE.PAYMENT_PENDING;

      const dokuMetadata = {
        ...providerResult,
        fallback: fallbackInfo,
        provider: effectiveProviderName,
        provider_env: resolvedProviderEnv,
        invoice_number: resolvedInvoice,
        invoiceNumber: resolvedInvoice,
        doku_original_request_id: originalReqId,
        originalRequestId: originalReqId,
        payment_url: resolvedPaymentUrl,
        paymentUrl: resolvedPaymentUrl,
        provider_settlement_status: resolvedProvSettlementStatus,
        internal_settlement_status: resolvedIntSettlementStatus,
        last_payment_attempt_status: 'PENDING'
      };

      const canonicalRecord = createCanonicalPaymentRecord({
        internalPaymentId,
        orderId,
        buyerId: buyer.id || order?.buyer_id || 'unknown-buyer',
        sellerId: order?.seller_id || 'unknown-seller',
        eventId: order?.event_id || 'unknown-event',
        ticketId: order?.ticket_id || 'unknown-ticket',
        provider: effectiveProviderName,
        providerTransactionId: providerTxId,
        providerReference: providerRef,
        currency: upperCurrency,
        grossAmount: parsedAmount,
        platformFee: order?.platform_fee || order?.buyer_fee || 0,
        sellerAmount: order?.seller_payout || order?.seller_net_payout || 0,
        providerFee: 0,
        taxAmount: (order?.buyer_tax || 0) + (order?.seller_tax_withholding || 0),
        netAmount: parsedAmount,
        moneyState: MONEY_STATE.PAYMENT_PENDING,
        businessState: TIKUM_BUSINESS_STATE.TICKET_RESERVED,
        status: CANONICAL_PAYMENT_STATUS.PAYMENT_PENDING,
        paymentMethod: effectiveChannel || providerResult.channel || 'QRIS',
        idempotencyKey: effectiveIdempotencyKey,
        metadata: dokuMetadata
      });

      canonicalRecord.settlement_status = effectiveRequiresEscrow ? 'SETTLEMENT_HOLD_REQUESTED' : 'STANDARD';
      canonicalRecord.original_request_id = originalReqId;
      canonicalRecord.provider_env = resolvedProviderEnv;
      canonicalRecord.invoice_number = resolvedInvoice;
      canonicalRecord.doku_original_request_id = originalReqId;
      canonicalRecord.payment_url = resolvedPaymentUrl;
      canonicalRecord.provider_settlement_status = resolvedProvSettlementStatus;
      canonicalRecord.internal_settlement_status = resolvedIntSettlementStatus;

      this._syncPaymentToState(canonicalRecord);

      try {
        if (attemptRepo) {
          await attemptRepo.createPayment({
            id: internalPaymentId,
            internal_payment_id: internalPaymentId,
            order_id: orderId,
            buyer_id: canonicalRecord.buyer_id,
            seller_id: canonicalRecord.seller_id,
            provider: effectiveProviderName,
            provider_transaction_id: providerTxId,
            provider_reference: providerRef,
            currency: upperCurrency,
            gross_amount: canonicalRecord.gross_amount,
            provider_fee: canonicalRecord.provider_fee,
            status: canonicalRecord.status,
            money_state: canonicalRecord.money_state,
            payment_method: canonicalRecord.payment_method,
            idempotency_key: effectiveIdempotencyKey,
            metadata: canonicalRecord.metadata
          });
          await attemptRepo.updatePaymentAttemptStatus(attemptId, 'ISSUED', {
            provider_ref: providerRef
          });
          await attemptRepo.saveIdempotency(claimKey, 'PAYMENT_CREATE', {
            payment_id: internalPaymentId,
            order_id: orderId,
            invoice_number: resolvedInvoice,
            provider_reference: providerRef,
            attempt_count: claim.attemptNumber
          });
        }
      } catch (repoErr) {
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL || (attemptRepo && !attemptRepo.degraded)) {
          throw repoErr;
        }
      }

      PaymentRoutingService.recordPaymentAttempt({
        paymentAttemptId: internalPaymentId,
        orderId,
        provider: effectiveProviderName,
        providerTransactionId: providerTxId,
        idempotencyKey: effectiveIdempotencyKey,
        status: PAYMENT_ATTEMPT_STATUS.PENDING
      });

      await recordAuditLog('PAYMENT', internalPaymentId, 'INTENT_CREATED', buyer.id || 'SYSTEM', {
        order_id: orderId,
        provider: effectiveProviderName,
        provider_env: resolvedProviderEnv,
        channel: canonicalRecord.payment_method,
        gross_amount: canonicalRecord.gross_amount,
        invoice_number: resolvedInvoice,
        provider_reference: providerRef
      });

      return {
        idempotent: false,
        paymentId: internalPaymentId,
        orderId,
        invoiceNumber: resolvedInvoice,
        invoice_number: resolvedInvoice,
        provider: targetProviderName,
        provider_env: resolvedProviderEnv,
        providerRef,
        providerTransactionId: providerTxId,
        doku_original_request_id: originalReqId,
        amount: canonicalRecord.gross_amount,
        currency: upperCurrency,
        status: canonicalRecord.status,
        moneyState: canonicalRecord.money_state,
        businessState: canonicalRecord.business_state,
        provider_settlement_status: resolvedProvSettlementStatus,
        internal_settlement_status: resolvedIntSettlementStatus,
        channel: canonicalRecord.payment_method,
        paymentUrl: resolvedPaymentUrl,
        payment_url: resolvedPaymentUrl,
        paymentDetails: providerResult.paymentDetails || {},
        simulated: providerResult.simulated === true
      };
    } finally {
      if (ownsBarrier) {
        if (inFlightCreatePayments.get(orderId) === barrierPromise) {
          inFlightCreatePayments.delete(orderId);
        }
        if (releaseBarrier) releaseBarrier();
      }
    }
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
    const { getMoneyRepository } = require('../../storage');
    const moneyRepo = getMoneyRepository();

    // Resolve authoritative orderId when Checkout V1 used a shortened invoice_number
    if (moneyRepo && (event.invoiceNumber || event.providerRef)) {
      const directOrder = event.orderId ? await moneyRepo.getOrderById(event.orderId) : null;
      if (!directOrder) {
        const matchedPay = await moneyRepo.getPaymentByInvoiceOrRef(event.invoiceNumber || event.providerRef);
        if (matchedPay && matchedPay.order_id) {
          event.orderId = matchedPay.order_id;
        }
      }
    }

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
        w.processing_status === 'PROCESSED' &&
        (w.provider_event_id === eventId || w.payload_hash === payloadHash)
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

    const isPaidEvent = !isRefundEvent && (
      event.status === MONEY_STATE.PAID ||
      event.status === 'SUCCESS' ||
      event.status === 'SETTLED'
    );

    // Durable capture deduplication across cold-start and rotating Request-Id headers
    if (isPaidEvent && moneyRepo && event.orderId) {
      const durableSettled =
        (event.providerRef && typeof moneyRepo.getSettledPaymentByOrderAndProviderRef === 'function'
          ? await moneyRepo.getSettledPaymentByOrderAndProviderRef(event.orderId, event.providerRef)
          : null) ||
        (event.invoiceNumber && typeof moneyRepo.getSettledPaymentByOrderAndProviderRef === 'function'
          ? await moneyRepo.getSettledPaymentByOrderAndProviderRef(event.orderId, event.invoiceNumber)
          : null);

      if (durableSettled) {
        if (event.amount && Number(durableSettled.gross_amount) !== Number(event.amount)) {
          const err = new Error(`Payment amount mismatch on redelivery. Expected ${durableSettled.gross_amount}, got ${event.amount}`);
          err.code = 'AMOUNT_MISMATCH';
          err.status = 422;
          throw err;
        }
        try {
          const dupInsert = await moneyRepo.recordWebhook({
            provider: targetProviderName,
            provider_event_id: eventId,
            event_type: event.eventType || 'PAYMENT_EVENT',
            payload_hash: payloadHash,
            raw_payload: body,
            signature_status: 'VALID',
            processing_status: 'PROCESSED'
          });
          if (dupInsert?.inserted) {
            await moneyRepo.markWebhookProcessed(targetProviderName, eventId, 'PROCESSED');
          }
        } catch (_) {}
        await recordAuditLog('WEBHOOK', eventId, 'CAPTURE_DEDUPLICATED_BY_ORDER_PROVIDER_REF', targetProviderName, {
          order_id: event.orderId,
          provider_ref: event.providerRef,
          settled_payment_id: durableSettled.id
        });
        return {
          idempotent: true,
          deduplicatedBy: 'ORDER_PROVIDER_REF',
          orderId: event.orderId,
          providerRef: event.providerRef,
          message: 'Webhook capture already recorded for (order_id, provider_reference)'
        };
      }
    }

    // Confirm live DOKU money before reserving an event or mutating financial state.
    // A timeout must remain retryable, not become a processed payment.
    if (targetProviderName === 'doku' && !provider.allowSimulation && event.status === MONEY_STATE.PAID) {
      const rejectConfirmation = () => {
        const error = new Error('DOKU gateway payment confirmation is incomplete or inconsistent');
        error.code = 'GATEWAY_STATUS_UNCONFIRMED';
        error.status = 409;
        return error;
      };
      const order = moneyRepo ? await moneyRepo.getOrderById(event.orderId) : null;
      if (!order) throw rejectConfirmation();
      const persistedPayment = typeof moneyRepo.getPaymentByOrderId === 'function'
        ? await moneyRepo.getPaymentByOrderId(event.orderId)
        : null;
      const expectedInvoiceNumber = persistedPayment?.metadata?.invoice_number ||
        persistedPayment?.metadata?.invoiceNumber ||
        event.invoiceNumber ||
        `INV-DOKU-${event.orderId}`;
      const expectedAmount = Number(order.buyer_total ?? order.total_amount);
      if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 ||
          Number(event.amount) !== expectedAmount ||
          event.currency !== (order.currency || 'IDR')) throw rejectConfirmation();
      let verified;
      try {
        verified = await provider.getPaymentStatus({
          orderId: event.orderId,
          invoiceNumber: expectedInvoiceNumber
        });
      } catch (_) {
        throw rejectConfirmation();
      }
      if (!verified || verified.simulated || verified.status !== MONEY_STATE.PAID ||
          verified.rawResponse?.order?.invoice_number !== expectedInvoiceNumber ||
          Number(verified.amount) !== expectedAmount ||
          verified.currency !== (order.currency || 'IDR')) throw rejectConfirmation();
    }

    try {
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

    // 5. Domain State Update cleanly guarded so failed processing marks webhook FAILED_RETRYABLE (never stuck PROCESSING)
    let captureResult = null;
    try {
      if (event.status === MONEY_STATE.PAID || event.status === 'SUCCESS' || event.status === 'SETTLED') {
        const { EscrowService } = require('../escrowService');

        // Call authoritative EscrowService to fund escrow and balance double-entry FinancialLedger if order exists
        let order = moneyRepo && typeof moneyRepo.getOrderById === 'function'
          ? await moneyRepo.getOrderById(event.orderId)
          : null;
        if (order) {
          if (!state.orders) state.orders = [];
          const ordIdx = state.orders.findIndex(o => o.id === order.id);
          if (ordIdx >= 0) state.orders[ordIdx] = { ...state.orders[ordIdx], ...order };
          else state.orders.push(order);

          const dbEscrow = await moneyRepo.getEscrowByOrderId(event.orderId);
          if (dbEscrow) {
            if (!state.escrows) state.escrows = [];
            const escIdx = state.escrows.findIndex(e => e.order_id === order.id);
            if (escIdx >= 0) state.escrows[escIdx] = { ...state.escrows[escIdx], ...dbEscrow };
            else state.escrows.push(dbEscrow);
          }
        } else if (!moneyRepo || moneyRepo.degraded) {
          order = state.orders ? state.orders.find(o => o.id === event.orderId) : null;
        }

        // Invariant I2: Server-to-server status inquiry re-query
        if (targetProviderName !== 'doku' && typeof provider.getPaymentStatus === 'function') {
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
          if (event.amount !== undefined && event.amount !== null && parseInt(event.amount, 10) !== expectedAmt) {
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

          const providerCapabilities = typeof provider.getCapabilities === 'function'
            ? provider.getCapabilities()
            : (typeof provider.capabilities === 'function' ? provider.capabilities() : {});
          const supportsEscrowHold = Boolean(providerCapabilities && providerCapabilities.hold === true);

          if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
            captureResult = await EscrowService.recordPayment({
              orderId: event.orderId,
              providerRef: event.providerRef,
              idempotencyKey: `wh-pay-${event.providerRef}`,
              amountPaid: event.amount !== undefined ? event.amount : expectedAmt,
              providerFee: event.providerFee || 0,
              currency: event.currency || order.currency || 'IDR'
            });
            await this.verifyCaptureLedger(order);
            order.status = 'LATE_PAYMENT_PENDING_REVIEW';
            order.marketplace_status = 'LATE_PAYMENT';
            order.payment_status = 'PAYMENT_CONFIRMED_PROVIDER';
            await recordAuditLog('ORDER', order.id, 'LATE_PAYMENT_CAPTURED', 'GATEWAY', {
              provider: targetProviderName,
              provider_ref: event.providerRef,
              amount: event.amount,
              action: 'FLAGGED_FOR_MANUAL_REVIEW_OR_REFUND'
            });
          } else {
            captureResult = await EscrowService.recordPayment({
              orderId: event.orderId,
              providerRef: event.providerRef,
              idempotencyKey: `wh-pay-${event.providerRef}`,
              amountPaid: event.amount !== undefined ? event.amount : expectedAmt,
              isProviderEscrow: supportsEscrowHold,
              providerFee: event.providerFee || 0,
              currency: event.currency || order.currency || 'IDR'
            });
            await this.verifyCaptureLedger(order);
            order.marketplace_status = 'PAID';
            order.payment_status = 'PAYMENT_CONFIRMED_PROVIDER';
            order.payment_money_state = supportsEscrowHold
              ? MONEY_STATE.ESCROW_HELD
              : MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT;
            order.escrow_type = supportsEscrowHold
              ? 'THIRD_PARTY_PROVIDER_ESCROW'
              : 'NONE_PLATFORM_CAPTURED';
          }

          if (state.canonical_payments) {
            const canonical = state.canonical_payments.find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
            if (canonical) {
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
              canonical.last_payment_attempt_status = 'SUCCESS';
              canonical.provider_settlement_status = 'PAYMENT_CONFIRMED_UNSETTLED_AT_DOKU';
              canonical.internal_settlement_status = supportsEscrowHold ? MONEY_STATE.ESCROW_HELD : MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT;
              canonical.updated_at = new Date().toISOString();
              PaymentRoutingService.updateAttemptStatus(canonical.internal_payment_id || canonical.id, PAYMENT_ATTEMPT_STATUS.SUCCESS, event.providerRef);
              DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
            }
          }

          if (moneyRepo && typeof moneyRepo.getPaymentByOrderId === 'function') {
            try {
              const settledPay = await moneyRepo.getLatestSettledPaymentByOrderId(event.orderId) || await moneyRepo.getPaymentByOrderId(event.orderId);
              if (settledPay && typeof moneyRepo.updatePaymentMetadata === 'function') {
                await moneyRepo.updatePaymentMetadata(settledPay.id, {
                  provider_settlement_status: 'PAYMENT_CONFIRMED_UNSETTLED_AT_DOKU',
                  internal_settlement_status: supportsEscrowHold ? MONEY_STATE.ESCROW_HELD : MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT,
                  last_payment_attempt_status: 'SUCCESS',
                  doku_transaction_id: event.providerRef
                });
              }
            } catch (_) {}
          }

          // Strict State Decoupling & Evidence Bundle Slot #5 Recording
          const paymentSettlementArtifact = {
            slot: 5,
            slot_name: 'paymentSettlementRecord',
            artifact_type: 'PAYMENT_SETTLEMENT_RECORD',
            provider: targetProviderName,
            provider_reference: event.providerRef,
            order_id: event.orderId,
            amount: event.amount,
            currency: event.currency || 'IDR',
            payment_status: 'PAYMENT_CONFIRMED_PROVIDER',
            paid_at: event.paidAt || new Date().toISOString(),
            recorded_at: new Date().toISOString(),
            payload_hash: payloadHash
          };

          if (!order.evidence_bundle) {
            order.evidence_bundle = {};
          }
          order.evidence_bundle.slot_5_payment_settlement = paymentSettlementArtifact;
          order.evidence_bundle.paymentSettlementRecord = paymentSettlementArtifact;

          const bundle = (state.evidence_bundles || []).find(b => (order.evidence_bundle_id && b.id === order.evidence_bundle_id) || (order.ticket_id && b.ticket_id === order.ticket_id));
          if (bundle) {
            if (!bundle.artifacts) bundle.artifacts = {};
            bundle.artifacts.slot_5 = paymentSettlementArtifact;
            bundle.artifacts.paymentSettlementRecord = paymentSettlementArtifact;
          }
        }
      } else if (
        event.status === MONEY_STATE.PAYMENT_FAILED ||
        event.status === MONEY_STATE.PAYMENT_EXPIRED ||
        event.status === 'FAILED' ||
        event.status === 'EXPIRED'
      ) {
        const isExpired = event.status === MONEY_STATE.PAYMENT_EXPIRED ||
          event.status === 'EXPIRED' ||
          rawStatus === 'EXPIRED' ||
          rawStatus === 'ORDER_EXPIRED';
        const targetMoneyState = isExpired ? MONEY_STATE.PAYMENT_EXPIRED : MONEY_STATE.PAYMENT_FAILED;

        const durableFailPay = moneyRepo && typeof moneyRepo.getPaymentByOrderId === 'function'
          ? (await moneyRepo.getPaymentByOrderId(event.orderId) || (typeof moneyRepo.getPaymentByInvoiceOrRef === 'function' ? await moneyRepo.getPaymentByInvoiceOrRef(event.invoiceNumber || event.providerRef) : null))
          : null;

        if (!isExpired && targetProviderName === 'doku') {
          // A declined attempt does not necessarily expire the Checkout session.
          // Persist last_payment_attempt_status = 'FAILED' durably without cancelling order or releasing inventory.
          if (durableFailPay && typeof moneyRepo.updatePaymentMetadata === 'function') {
            await moneyRepo.updatePaymentMetadata(durableFailPay.id, {
              last_payment_attempt_status: 'FAILED',
              last_failed_provider_ref: event.providerRef,
              last_failed_at: new Date().toISOString()
            });
            if (typeof moneyRepo.recordPaymentAttempt === 'function') {
              await moneyRepo.recordPaymentAttempt({
                id: `att-${uuidv4()}`,
                payment_id: durableFailPay.id,
                order_id: event.orderId,
                provider: targetProviderName,
                channel: durableFailPay.payment_method || 'DOKU_CHECKOUT',
                status: 'FAILED',
                provider_ref: event.providerRef,
                error_code: 'GATEWAY_ATTEMPT_FAILED',
                error_message: 'DOKU reported FAILED transaction while Checkout order stays active'
              });
            }
          }
          const canonical = (state.canonical_payments || []).find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
          if (canonical) {
            canonical.last_payment_attempt_status = 'FAILED';
            canonical.updated_at = new Date().toISOString();
            DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
          }
        } else {
          if (durableFailPay && typeof moneyRepo.updatePaymentStatus === 'function') {
            await moneyRepo.updatePaymentStatus(durableFailPay.id, targetMoneyState, {
              metadata: {
                provider_settlement_status: isExpired ? 'ORDER_EXPIRED' : 'FAILED',
                internal_settlement_status: targetMoneyState,
                last_payment_attempt_status: isExpired ? 'EXPIRED' : 'FAILED'
              }
            });
          }
          if (state.canonical_payments) {
            const canonical = state.canonical_payments.find(p => p.order_id === event.orderId || p.provider_reference === event.providerRef);
            if (canonical) {
              canonical.money_state = targetMoneyState;
              canonical.status = targetMoneyState;
              canonical.updated_at = new Date().toISOString();
              DurableFinancialStore.persist('canonical_payments', state.canonical_payments);
            }
          }
        }
        let order = moneyRepo && typeof moneyRepo.getOrderById === 'function'
          ? await moneyRepo.getOrderById(event.orderId)
          : null;
        if (order) {
          if (!state.orders) state.orders = [];
          const ordIdx = state.orders.findIndex(o => o.id === order.id);
          if (ordIdx >= 0) state.orders[ordIdx] = { ...state.orders[ordIdx], ...order };
          else state.orders.push(order);
        } else {
          order = state.orders ? state.orders.find(o => o.id === event.orderId) : null;
        }

        if (order && (isExpired || targetProviderName !== 'doku')) {
          const nextOrderStatus = isExpired ? 'EXPIRED' : 'CANCELLED';
          order.status = nextOrderStatus;
          order.marketplace_status = isExpired ? 'PAYMENT_EXPIRED' : 'PAYMENT_FAILED';
          if (moneyRepo && typeof moneyRepo.updateOrderStatus === 'function') {
            await moneyRepo.updateOrderStatus(order.id, nextOrderStatus);
            if (typeof moneyRepo.updateEscrowStatus === 'function') {
              await moneyRepo.updateEscrowStatus(order.id, nextOrderStatus);
            }
          }
          const { EscrowService } = require('../escrowService');
          await EscrowService.releaseInventoryForOrder(order.id, isExpired ? 'GATEWAY_PAYMENT_EXPIRED' : 'GATEWAY_PAYMENT_FAILED');
        }
      } else if (isRefundEvent) {
        const { EscrowService } = require('../escrowService');

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

        await EscrowService.confirmProviderRefund({
          orderId: event.orderId,
          providerRef: event.providerRef,
          providerEventId: eventId,
          rawPayload: body,
          actorId: `WEBHOOK_${targetProviderName.toUpperCase()}`
        });
      }

      webhookRecord.processing_status = 'PROCESSED';
      webhookRecord.processed_at = new Date().toISOString();
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
      if (moneyRepo && typeof moneyRepo.markWebhookProcessed === 'function') {
        await moneyRepo.markWebhookProcessed(targetProviderName, eventId, 'PROCESSED');
      }
    } catch (processingErr) {
      webhookRecord.processing_status = 'FAILED_RETRYABLE';
      webhookRecord.error_message = processingErr.message;
      webhookRecord.processed_at = null;
      if (state.processed_webhooks) {
        state.processed_webhooks.delete(eventId);
        state.processed_webhooks.delete(event.providerRef);
        state.processed_webhooks.delete(`ref:${event.providerRef}`);
      }
      DurableFinancialStore.persist('provider_webhooks', state.provider_webhooks);
      try {
        if (moneyRepo && typeof moneyRepo.markWebhookProcessed === 'function') {
          await moneyRepo.markWebhookProcessed(targetProviderName, eventId, 'FAILED_RETRYABLE', {
            error_message: processingErr.message
          });
        }
      } catch (_) {}
      throw processingErr;
    }

    await recordAuditLog('WEBHOOK', eventId, 'PROCESSED', targetProviderName, {
      order_id: event.orderId,
      provider_ref: event.providerRef,
      amount: event.amount,
      status: event.status
    });

    return {
      idempotent: false,
      event,
      captureResult
    };
  }

  /**
   * Authoritative Release Execution for Settlement Hold (Section 6 & ARGUS)
   * Enforces:
   * (a) TIKUM verification passed (VERIFICATION_REQUIRED)
   * (b) 0 open disputes (OPEN_DISPUTE_BLOCK)
   * (c) Maker-Checker authorization verified & consumed (AUTHORIZATION_REQUIRED)
   * (d) Hold & Release API invocation on DOKU rail (POST /finance/v1/release)
   * (e) Double-entry Financial Ledger balancing & strict settlement status separation
   */
  static async executeRelease({
    orderId,
    actorId = 'SYSTEM',
    authorizationId = null,
    overrideSettlement = null,
    override_settlement = null,
    settlementId = null
  }) {
    if (!orderId) throw new Error('orderId is required for release');

    while (inFlightReleases.has(orderId)) {
      try {
        await inFlightReleases.get(orderId);
      } catch (_) {}
    }

    const workPromise = (async () => {
      const { getMoneyRepository } = require('../../storage');
      const moneyRepo = getMoneyRepository();

      // 1. Resolve Order & Escrow from durable repository first
      let order = moneyRepo && typeof moneyRepo.getOrderById === 'function'
        ? await moneyRepo.getOrderById(orderId)
        : null;
      if (!order && state.orders) {
        order = state.orders.find(o => o.id === orderId) || null;
      } else if (order) {
        if (!state.orders) state.orders = [];
        const ordIdx = state.orders.findIndex(o => o.id === orderId);
        if (ordIdx >= 0) state.orders[ordIdx] = { ...state.orders[ordIdx], ...order };
        else state.orders.push(order);
      }

      let escrow = moneyRepo && typeof moneyRepo.getEscrowByOrderId === 'function'
        ? await moneyRepo.getEscrowByOrderId(orderId)
        : null;
      if (!escrow && state.escrows) {
        escrow = state.escrows.find(e => e.order_id === orderId) || null;
      } else if (escrow) {
        if (!state.escrows) state.escrows = [];
        const escIdx = state.escrows.findIndex(e => e.order_id === orderId);
        if (escIdx >= 0) state.escrows[escIdx] = { ...state.escrows[escIdx], ...escrow };
        else state.escrows.push(escrow);
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

      // Inspect dispute records durably before and alongside verification checks
      const closedDisputeStatuses = new Set(['RESOLVED', 'CLOSED', 'CLOSED_FINAL', 'DISMISSED', 'WITHDRAWN']);
      const dbDispute = moneyRepo && typeof moneyRepo.getDisputeByOrderId === 'function'
        ? await moneyRepo.getDisputeByOrderId(orderId)
        : null;
      const stateDisputes = (state.disputes || []).filter(d => d.order_id === orderId);
      const hasOpenDispute = Boolean(
        escrow.status === 'DISPUTED' ||
        order.status === 'DISPUTED' ||
        escrow.dispute_hold === true ||
        (dbDispute && !closedDisputeStatuses.has(String(dbDispute.status || '').toUpperCase())) ||
        stateDisputes.some(d => !closedDisputeStatuses.has(String(d.status || '').toUpperCase()))
      );

      // (a) Guard 1: TIKUM verification passed (VERIFICATION_REQUIRED)
      const verification = (state.entry_verifications || []).find(
        ev => ev.order_id === orderId && ev.status === 'CONFIRMED'
      );
      const durableEntryVerified = Boolean(
        order.entry_confirmed_at ||
        order.pic_verified === true ||
        order.status === 'ENTRY_CONFIRMED' ||
        order.marketplace_status === 'ENTRY_CONFIRMED'
      );
      const disputeFavorable = Boolean(
        (dbDispute && closedDisputeStatuses.has(String(dbDispute.status || '').toUpperCase()) &&
          ['SELLER_FAVORED', 'RELEASE_SELLER'].includes(String(dbDispute.outcome || '').toUpperCase())) ||
        stateDisputes.some(
          d => closedDisputeStatuses.has(String(d.status || '').toUpperCase()) &&
            ['SELLER_FAVORED', 'RELEASE_SELLER'].includes(String(d.outcome || '').toUpperCase())
        )
      );

      if (!verification && !durableEntryVerified && !disputeFavorable) {
        if (hasOpenDispute) {
          const err = new Error('Cannot release settlement: open dispute blocks release');
          err.code = 'OPEN_DISPUTE_BLOCK';
          err.status = 409;
          throw err;
        }
        const err = new Error('TIKUM verification has not passed: confirmed Venue PIC admission or seller-favorable resolution required');
        err.code = 'VERIFICATION_REQUIRED';
        err.status = 403;
        throw err;
      }

      const { TrustPolicyEngine, AUTHORIZATION_OUTCOME } = require('../../trust/TrustPolicyEngine');
      const authDecision = await TrustPolicyEngine.evaluateAuthorization(orderId);
      const disputeBlockReasons = (authDecision.blocking_reasons || []).some(r => String(r).includes('DISPUTE'));

      // (b) Guard 2: Zero open disputes (OPEN_DISPUTE_BLOCK)
      if (hasOpenDispute || disputeBlockReasons) {
        const err = new Error('Cannot release settlement: active/open dispute exists for order');
        err.code = 'OPEN_DISPUTE_BLOCK';
        err.status = 409;
        err.details = authDecision;
        throw err;
      }

      if (!authDecision.financial_release_authorized || authDecision.outcome !== AUTHORIZATION_OUTCOME.PASS) {
        const allReasons = (authDecision.blocking_reasons || []).concat(authDecision.exception_reasons || []);
        const err = new Error(
          `TIKUM verification failed [${authDecision.outcome}]. ${allReasons.join(', ') || 'Required trust attestations not satisfied'}`
        );
        err.code = 'VERIFICATION_REQUIRED';
        err.outcome = authDecision.outcome;
        err.status = 403;
        err.details = authDecision;
        throw err;
      }

      // (c) Guard 3: Maker-Checker dual authorization verified & consumed (AUTHORIZATION_REQUIRED)
      const { FinancialAuthorizationService, AUTHORIZATION_STATUS } = require('../../settlement/FinancialAuthorizationService');
      let authRecord = null;
      if (authorizationId) {
        authRecord = await FinancialAuthorizationService.getAuthorizationById(authorizationId);
      } else {
        const candidates = await FinancialAuthorizationService.listAuthorizations({
          orderId,
          status: AUTHORIZATION_STATUS.APPROVED
        });
        authRecord = (candidates || []).find(
          a => a.order_id === orderId &&
            a.status === AUTHORIZATION_STATUS.APPROVED &&
            a.maker_id &&
            a.checker_id &&
            a.maker_id !== a.checker_id
        ) || null;
      }

      if (
        !authRecord ||
        authRecord.order_id !== orderId ||
        authRecord.status !== AUTHORIZATION_STATUS.APPROVED ||
        !authRecord.maker_id ||
        !authRecord.checker_id ||
        authRecord.maker_id === authRecord.checker_id
      ) {
        const err = new Error('Verified and unconsumed Maker-Checker authorization is required before settlement release');
        err.code = 'AUTHORIZATION_REQUIRED';
        err.status = 403;
        throw err;
      }

      // 6. Provider-level release execution
      const dbPayment = moneyRepo && typeof moneyRepo.getLatestSettledPaymentByOrderId === 'function'
        ? ((await moneyRepo.getLatestSettledPaymentByOrderId(orderId)) || (await moneyRepo.getPaymentByOrderId(orderId)))
        : null;
      const canonical = (state.canonical_payments || []).find(p => p.order_id === orderId) || dbPayment;
      const providerName = (canonical?.provider || order.provider || paymentManager.defaultProvider || 'doku').toLowerCase();
      const provider = paymentManager.getProvider(providerName);

      let providerReleaseResult = null;
      if (providerName === 'doku' && typeof provider.executeRelease === 'function') {
        const invoiceNumber =
          dbPayment?.metadata?.invoice_number ||
          dbPayment?.metadata?.invoiceNumber ||
          canonical?.metadata?.invoice_number ||
          canonical?.metadata?.invoiceNumber ||
          canonical?.provider_reference ||
          `INV-DOKU-${orderId}`;
        const originalRequestId =
          dbPayment?.metadata?.doku_original_request_id ||
          dbPayment?.metadata?.originalRequestId ||
          canonical?.metadata?.doku_original_request_id ||
          canonical?.metadata?.originalRequestId ||
          canonical?.metadata?.dokuRequestId ||
          canonical?.original_request_id ||
          canonical?.idempotency_key ||
          `req-${orderId}`;
        const releaseAmount = canonical?.gross_amount || escrow.amount;
        const effOverride = overrideSettlement !== null && overrideSettlement !== undefined
          ? overrideSettlement
          : override_settlement;

        if (canonical) {
          canonical.money_state = MONEY_STATE.RELEASE_REQUESTED;
          canonical.status = MONEY_STATE.RELEASE_REQUESTED;
          canonical.settlement_status = 'RELEASE_REQUESTED';
        }

        try {
          providerReleaseResult = await provider.executeRelease({
            invoiceNumber,
            amount: releaseAmount,
            currency: canonical?.currency || order.currency || 'IDR',
            originalRequestId,
            orderId,
            overrideSettlement: effOverride
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

      // Consume Maker-Checker authorization strictly on accepted release
      const resolvedAuthId = authRecord.id || authRecord.authorization_id;
      const targetSettlementId = settlementId || providerReleaseResult?.releaseId || `stl-${orderId}`;
      const consumedAuth = await FinancialAuthorizationService.consumeAuthorization({
        authorizationId: resolvedAuthId,
        settlementId: targetSettlementId
      });

      // 7. Persist separated settlement states durably
      const provSettlementStatus = providerReleaseResult?.provider_settlement_status || 'REQUEST_ACCEPTED_UNCONFIRMED';
      const intSettlementStatus = MONEY_STATE.RELEASE_CONFIRMED;
      if (canonical) {
        canonical.money_state = MONEY_STATE.RELEASE_CONFIRMED;
        canonical.status = MONEY_STATE.RELEASE_CONFIRMED;
        canonical.settlement_status = 'RELEASE_CONFIRMED';
        canonical.provider_settlement_status = provSettlementStatus;
        canonical.internal_settlement_status = intSettlementStatus;
        canonical.released_at = new Date().toISOString();
        this._syncPaymentToState(canonical);
      }
      if (dbPayment && moneyRepo && typeof moneyRepo.updatePaymentMetadata === 'function') {
        await moneyRepo.updatePaymentMetadata(dbPayment.id, {
          provider_settlement_status: provSettlementStatus,
          internal_settlement_status: intSettlementStatus,
          consumed_authorization_id: resolvedAuthId
        });
      }

      escrow.status = 'RELEASED';
      escrow.released_at = new Date().toISOString();
      order.status = 'SETTLED';
      if (moneyRepo && typeof moneyRepo.releaseEscrow === 'function') {
        try {
          await moneyRepo.releaseEscrow(orderId, actorId, `MAKER_CHECKER:${resolvedAuthId}`);
        } catch (_) {}
      }

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
        trust_authorization_id: authDecision.authorization_id,
        maker_checker_authorization_id: resolvedAuthId,
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
        consumedAuthorization: consumedAuth.authorization || consumedAuth,
        provider_settlement_status: provSettlementStatus,
        internal_settlement_status: intSettlementStatus,
        providerRelease: providerReleaseResult,
        ledgerTransaction: ledgerTx
      };
    })();

    inFlightReleases.set(orderId, workPromise);
    try {
      return await workPromise;
    } finally {
      if (inFlightReleases.get(orderId) === workPromise) {
        inFlightReleases.delete(orderId);
      }
    }
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
   * Real automated reconciliation comparison backed directly by durable repositories & LedgerVerificationService.
   */
  static async reconcileTransactions({ date = new Date().toISOString().split('T')[0], providerName = null }) {
    const targetProviderName = providerName ? providerName.toLowerCase() : null;
    const { getMoneyRepository, getMarketplaceRepository } = require('../../storage');
    const { LedgerVerificationService } = require('../../settlement/LedgerVerificationService');
    const moneyRepo = getMoneyRepository();
    const marketplaceRepo = getMarketplaceRepository();

    const reconciliationBatchId = `rec-batch-${Date.now()}`;
    const results = [];
    let variancesFound = 0;

    if (!state.payment_reconciliation_logs) {
      state.payment_reconciliation_logs = [];
    }

    let orders = [];
    if (moneyRepo && typeof moneyRepo.listAllOrders === 'function') {
      orders = await moneyRepo.listAllOrders(500);
    }
    if ((!orders || orders.length === 0) && (!moneyRepo || moneyRepo.degraded)) {
      orders = state.orders || [];
    }

    const reconciledOrderIds = new Set();
    for (const order of orders) {
      reconciledOrderIds.add(order.id);
      const payment = moneyRepo && typeof moneyRepo.getLatestSettledPaymentByOrderId === 'function'
        ? (await moneyRepo.getLatestSettledPaymentByOrderId(order.id)) || (await moneyRepo.getPaymentByOrderId(order.id))
        : (state.canonical_payments || []).find(p => p.order_id === order.id);
      const escrow = moneyRepo && typeof moneyRepo.getEscrowByOrderId === 'function'
        ? await moneyRepo.getEscrowByOrderId(order.id)
        : (state.escrows || []).find(e => e.order_id === order.id);

      const effProvider = (payment?.provider || order.provider || 'doku').toLowerCase();
      if (targetProviderName && effProvider !== targetProviderName) continue;
      if (!payment && !['PAID_ESCROWED', 'PAID_PLATFORM_HELD', 'PAID', 'ENTRY_CONFIRMED', 'SETTLED', 'LATE_PAYMENT_PENDING_REVIEW'].includes(order.status)) {
        continue;
      }

      let status = 'MATCHED';
      let variance = 0;
      let notes = 'Transactions balanced and matched across repository and durable ledger';

      const expectedAmount = Number(order.buyer_total ?? order.total_amount);
      const paidAmount = payment ? Number(payment.gross_amount ?? payment.amount) : null;

      if (paidAmount !== null && paidAmount !== expectedAmount) {
        status = 'AMOUNT_MISMATCH';
        variance = paidAmount - expectedAmount;
        variancesFound++;
        notes = `Amount mismatch: Payment ${paidAmount} vs Order ${expectedAmount}`;
      } else if (payment && String(payment.status || '').toUpperCase() === 'SETTLED' && escrow && escrow.status === 'PENDING_PAYMENT') {
        status = 'TIKUM_UNPAID_PROVIDER_PAID';
        variancesFound++;
        notes = 'Provider payment settled but escrow still PENDING_PAYMENT';
      } else {
        try {
          await LedgerVerificationService.verifyDurableCapture(order.id, { moneyRepo, marketplaceRepo });
        } catch (verifyErr) {
          status = verifyErr.reason || verifyErr.code || 'LEDGER_RECONCILIATION_REQUIRED';
          variancesFound++;
          notes = verifyErr.message;
        }
      }

      const record = {
        id: `rec-${uuidv4()}`,
        batch_id: reconciliationBatchId,
        reconciliation_date: date,
        provider: effProvider,
        internal_transaction_id: payment?.id || null,
        provider_transaction_id: payment?.provider_transaction_id || payment?.provider_reference || null,
        order_id: order.id,
        internal_amount: paidAmount !== null ? paidAmount : expectedAmount,
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
      provider: targetProviderName || (paymentManager.defaultProvider || 'doku').toLowerCase(),
      reconciled_count: results.length,
      variances_found: variancesFound,
      records: results
    };
  }

  /**
   * Reconciles a single DOKU order via GET /orders/v1/status/{invoice_number}:
   * - ORDER_GENERATED: stays pending with inventory reserved
   * - ORDER_EXPIRED: expires payment + order/escrow and releases inventory idempotently
   * - ORDER_RECOVERED: records gateway recovery metadata (and routes paid recoveries safely)
   * - SUCCESS: performs durable deduplication, unified verified capture, and LedgerVerificationService check
   */
  static async reconcileDokuOrderStatus({ orderId = null, invoiceNumber = null, actorId = 'SYSTEM' }) {
    const { getMoneyRepository, getMarketplaceRepository } = require('../../storage');
    const { EscrowService } = require('../escrowService');
    const { LedgerVerificationService } = require('../../settlement/LedgerVerificationService');
    const moneyRepo = getMoneyRepository();
    const marketplaceRepo = getMarketplaceRepository();

    let payment = orderId && moneyRepo
      ? await moneyRepo.getPaymentByOrderId(orderId)
      : (invoiceNumber && moneyRepo ? await moneyRepo.getPaymentByInvoiceOrRef(invoiceNumber) : null);

    const effOrderId = orderId || payment?.order_id;
    let order = effOrderId && moneyRepo ? await moneyRepo.getOrderById(effOrderId) : null;
    if (!order && effOrderId && state.orders) {
      order = state.orders.find(o => o.id === effOrderId) || null;
    } else if (order) {
      if (!state.orders) state.orders = [];
      const idx = state.orders.findIndex(o => o.id === order.id);
      if (idx >= 0) state.orders[idx] = { ...state.orders[idx], ...order };
      else state.orders.push(order);
    }

    if (!effOrderId || !order) {
      const err = new Error(`Order '${orderId || invoiceNumber}' not found for DOKU status reconciliation`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (!payment && state.canonical_payments) {
      payment = state.canonical_payments.find(p => p.order_id === effOrderId) || null;
    }

    const effInvoice = invoiceNumber ||
      payment?.metadata?.invoice_number ||
      payment?.metadata?.invoiceNumber ||
      payment?.provider_reference ||
      `INV-DOKU-${effOrderId}`;

    const provider = paymentManager.getProvider('doku');
    const inquiry = await provider.getPaymentStatus({
      orderId: effOrderId,
      invoiceNumber: effInvoice
    });

    const norm = inquiry.normalizedStatus || inquiry.rawStatus || 'ORDER_GENERATED';
    const expectedAmount = Number(order.buyer_total ?? order.total_amount);
    const expectedCurrency = String(order.currency || 'IDR').toUpperCase();

    if (norm === 'ORDER_GENERATED') {
      if (payment && moneyRepo && typeof moneyRepo.updatePaymentMetadata === 'function') {
        await moneyRepo.updatePaymentMetadata(payment.id, {
          doku_order_status: 'ORDER_GENERATED',
          provider_settlement_status: 'ORDER_GENERATED',
          last_inquiry_at: new Date().toISOString()
        });
      }
      return {
        orderId: effOrderId,
        invoiceNumber: effInvoice,
        normalizedStatus: 'ORDER_GENERATED',
        status: MONEY_STATE.PAYMENT_PENDING,
        action: 'KEPT_PENDING',
        inquiry
      };
    }

    if (norm === 'ORDER_EXPIRED') {
      if (payment && moneyRepo && typeof moneyRepo.updatePaymentStatus === 'function') {
        await moneyRepo.updatePaymentStatus(payment.id, MONEY_STATE.PAYMENT_EXPIRED, {
          metadata: {
            doku_order_status: 'ORDER_EXPIRED',
            provider_settlement_status: 'ORDER_EXPIRED',
            internal_settlement_status: MONEY_STATE.PAYMENT_EXPIRED,
            last_inquiry_at: new Date().toISOString()
          }
        });
      }
      if (moneyRepo && typeof moneyRepo.updateOrderStatus === 'function') {
        await moneyRepo.updateOrderStatus(effOrderId, 'EXPIRED');
      }
      if (moneyRepo && typeof moneyRepo.updateEscrowStatus === 'function') {
        await moneyRepo.updateEscrowStatus(effOrderId, 'EXPIRED');
      }
      order.status = 'EXPIRED';
      order.marketplace_status = 'PAYMENT_EXPIRED';
      const rel = await EscrowService.releaseInventoryForOrder(effOrderId, 'DOKU_ORDER_EXPIRED');
      await recordAuditLog('PAYMENT', payment?.id || effOrderId, 'DOKU_INQUIRY_ORDER_EXPIRED', actorId, {
        order_id: effOrderId,
        invoice_number: effInvoice
      });
      return {
        orderId: effOrderId,
        invoiceNumber: effInvoice,
        normalizedStatus: 'ORDER_EXPIRED',
        status: MONEY_STATE.PAYMENT_EXPIRED,
        action: 'EXPIRED_AND_INVENTORY_RELEASED',
        inventoryReleased: rel,
        inquiry
      };
    }

    if (norm === 'ORDER_RECOVERED' && inquiry.status !== MONEY_STATE.PAID) {
      if (payment && moneyRepo && typeof moneyRepo.updatePaymentMetadata === 'function') {
        await moneyRepo.updatePaymentMetadata(payment.id, {
          doku_order_status: 'ORDER_RECOVERED',
          provider_settlement_status: 'ORDER_RECOVERED',
          recovery_detected_at: new Date().toISOString(),
          last_inquiry_at: new Date().toISOString()
        });
      }
      await recordAuditLog('PAYMENT', payment?.id || effOrderId, 'DOKU_INQUIRY_ORDER_RECOVERED', actorId, {
        order_id: effOrderId,
        invoice_number: effInvoice,
        current_order_status: order.status
      });
      return {
        orderId: effOrderId,
        invoiceNumber: effInvoice,
        normalizedStatus: 'ORDER_RECOVERED',
        status: MONEY_STATE.PAYMENT_PENDING,
        action: 'RECOVERY_RECORDED',
        inquiry
      };
    }

    // SUCCESS / PAID (or ORDER_RECOVERED paired with PAID transaction status)
    if (inquiry.status === MONEY_STATE.PAID || norm === 'SUCCESS') {
      if (Number(inquiry.amount) !== expectedAmount) {
        const err = new Error(`Inquiry amount mismatch. Expected ${expectedAmount}, got ${inquiry.amount}`);
        err.code = 'AMOUNT_MISMATCH';
        err.status = 422;
        throw err;
      }
      if (String(inquiry.currency || 'IDR').toUpperCase() !== expectedCurrency) {
        const err = new Error(`Inquiry currency mismatch. Expected ${expectedCurrency}, got ${inquiry.currency}`);
        err.code = 'CURRENCY_MISMATCH';
        err.status = 422;
        throw err;
      }

      const providerRef = inquiry.providerRef || effInvoice;
      const existingSettled = moneyRepo && typeof moneyRepo.getSettledPaymentByOrderAndProviderRef === 'function'
        ? ((await moneyRepo.getSettledPaymentByOrderAndProviderRef(effOrderId, providerRef)) ||
           (await moneyRepo.getSettledPaymentByOrderAndProviderRef(effOrderId, effInvoice)))
        : null;

      if (existingSettled) {
        const verification = await LedgerVerificationService.verifyDurableCapture(effOrderId, { moneyRepo, marketplaceRepo });
        return {
          idempotent: true,
          orderId: effOrderId,
          invoiceNumber: effInvoice,
          normalizedStatus: 'SUCCESS',
          status: MONEY_STATE.PAID,
          action: 'ALREADY_CAPTURED_VERIFIED',
          ledgerVerification: verification,
          inquiry
        };
      }

      const supportsEscrowHold = Boolean(provider.getCapabilities?.().hold === true);
      const captureResult = await EscrowService.recordPayment({
        orderId: effOrderId,
        providerRef,
        idempotencyKey: `inq-pay-${providerRef}`,
        amountPaid: expectedAmount,
        isProviderEscrow: supportsEscrowHold,
        providerFee: 0,
        currency: expectedCurrency
      });

      const ledgerVerification = await LedgerVerificationService.verifyDurableCapture(effOrderId, { moneyRepo, marketplaceRepo });

      const settledPay = moneyRepo && typeof moneyRepo.getLatestSettledPaymentByOrderId === 'function'
        ? await moneyRepo.getLatestSettledPaymentByOrderId(effOrderId)
        : null;
      if (settledPay && moneyRepo && typeof moneyRepo.updatePaymentMetadata === 'function') {
        await moneyRepo.updatePaymentMetadata(settledPay.id, {
          invoice_number: effInvoice,
          doku_order_status: norm,
          provider_settlement_status: 'PAYMENT_CONFIRMED_UNSETTLED_AT_DOKU',
          internal_settlement_status: supportsEscrowHold ? MONEY_STATE.ESCROW_HELD : MONEY_STATE.CAPTURED_PLATFORM_SETTLEMENT,
          last_inquiry_at: new Date().toISOString()
        });
      }

      return {
        idempotent: false,
        orderId: effOrderId,
        invoiceNumber: effInvoice,
        normalizedStatus: 'SUCCESS',
        status: MONEY_STATE.PAID,
        action: 'CAPTURED_AND_LEDGER_VERIFIED',
        captureResult,
        ledgerVerification,
        inquiry
      };
    }

    return {
      orderId: effOrderId,
      invoiceNumber: effInvoice,
      normalizedStatus: norm,
      status: inquiry.status,
      action: 'NO_OP',
      inquiry
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
