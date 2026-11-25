'use strict';

/**
 * TIKUM / ARGUS — Durable Read-After-Write Ledger Verification Service
 *
 * Verifies every captured payment directly against persistent repository rows
 * (PostgreSQL / MoneyRepository / MarketplaceRepository), NEVER against
 * process-memory `state.*` arrays and NEVER falling back to SELLER_MANAGED.
 */

const { getMoneyRepository, getMarketplaceRepository } = require('../storage');
const { recordAuditLog } = require('../database');
const { FEE_POLICY_V2, calculateDualTierFees } = require('../pricing/DualTierFeePolicy');
const { CanonicalFeeEngine, SUPPORTED_POLICIES } = require('../pricing/CanonicalFeeEngine');

const VALID_FULFILLMENT_OPTIONS = new Set(['SELLER_MANAGED', 'TIKUM_VENUE_PIC']);

function buildReconciliationError(message, reason, details = {}) {
  const err = new Error(message);
  err.code = 'LEDGER_RECONCILIATION_REQUIRED';
  err.status = 409;
  err.reason = reason;
  err.details = details;
  return err;
}

function resolveExplicitFulfillment(dbOrder, dbQuote, dbListing) {
  const listingMeta = (dbListing && typeof dbListing.metadata === 'object' && dbListing.metadata)
    ? dbListing.metadata
    : {};

  const orderFulfillment = dbOrder?.fulfillment_option || dbOrder?.fulfillment_type || null;
  const quoteFulfillment = dbQuote?.fulfillment_option || null;
  const listingFulfillment = dbListing?.fulfillment_type || listingMeta.fulfillment_type || listingMeta.fulfillment_option || null;

  const candidates = [orderFulfillment, quoteFulfillment, listingFulfillment].filter(Boolean);
  if (candidates.length === 0) {
    return { valid: false, reason: 'MISSING_FULFILLMENT_OPTION', value: null };
  }

  const normalized = String(candidates[0]).trim();
  if (!VALID_FULFILLMENT_OPTIONS.has(normalized)) {
    return { valid: false, reason: 'INVALID_FULFILLMENT_OPTION', value: normalized };
  }

  for (const c of candidates) {
    if (String(c).trim() !== normalized) {
      return { valid: false, reason: 'FULFILLMENT_OPTION_MISMATCH', value: normalized, candidates };
    }
  }

  return { valid: true, value: normalized };
}

function computeExpectedBreakdown({ dbOrder, dbQuote, dbListing, policyVersion }) {
  const currency = String(dbOrder.currency || '').trim().toUpperCase();
  if (!currency) {
    throw buildReconciliationError(
      'Order currency missing during durable ledger verification',
      'MISSING_ORDER_CURRENCY',
      { orderId: dbOrder.id }
    );
  }
  if (dbQuote?.currency && String(dbQuote.currency).trim().toUpperCase() !== currency) {
    throw buildReconciliationError(
      `Currency mismatch between order (${currency}) and quote (${dbQuote.currency})`,
      'QUOTE_CURRENCY_MISMATCH',
      { orderId: dbOrder.id }
    );
  }

  const quantity = Number(dbOrder.quantity ?? dbQuote?.quantity ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw buildReconciliationError(
      `Invalid order quantity '${dbOrder.quantity}' during durable verification`,
      'INVALID_ORDER_QUANTITY',
      { orderId: dbOrder.id, quantity: dbOrder.quantity }
    );
  }

  const rawTicketPrice = dbOrder.ticket_price ?? dbQuote?.ticket_price ?? null;
  const ticketPrice = Number(rawTicketPrice);
  if (!Number.isSafeInteger(ticketPrice) || ticketPrice <= 0) {
    throw buildReconciliationError(
      'Authoritative ticket_price missing or invalid on persisted order/quote',
      'MISSING_TICKET_PRICE',
      { orderId: dbOrder.id }
    );
  }

  const expectedGross = ticketPrice * quantity;
  const persistedGross = dbOrder.gross_ticket_value !== undefined && dbOrder.gross_ticket_value !== null
    ? Number(dbOrder.gross_ticket_value)
    : (dbQuote?.gross_ticket_value !== undefined && dbQuote?.gross_ticket_value !== null ? Number(dbQuote.gross_ticket_value) : expectedGross);
  if (!Number.isSafeInteger(persistedGross) || persistedGross !== expectedGross) {
    throw buildReconciliationError(
      `Persisted gross ticket value (${persistedGross}) does not equal ticket_price * quantity (${expectedGross})`,
      'GROSS_VALUE_MISMATCH',
      { orderId: dbOrder.id, persistedGross, expectedGross }
    );
  }

  const buyerTax = Number(dbOrder.buyer_tax ?? dbQuote?.buyer_tax ?? 0);
  const sellerTax = Number(dbOrder.seller_tax ?? dbOrder.seller_tax_withholding ?? dbQuote?.seller_tax ?? 0);
  const providerFee = Number(dbOrder.payment_processing_fee ?? dbQuote?.payment_fee ?? 0);
  if (![buyerTax, sellerTax, providerFee].every(v => Number.isSafeInteger(v) && v >= 0)) {
    throw buildReconciliationError('Invalid negative or non-integer tax/provider fee', 'INVALID_TAX_OR_FEE');
  }

  let fulfillmentOption = null;
  let expectedBuyerFee;
  let expectedSellerFee;

  if (policyVersion === FEE_POLICY_V2.version) {
    const fulfillmentCheck = resolveExplicitFulfillment(dbOrder, dbQuote, dbListing);
    if (!fulfillmentCheck.valid) {
      throw buildReconciliationError(
        `V2 order '${dbOrder.id}' failed fulfillment validation (${fulfillmentCheck.reason}); silent fallback forbidden`,
        fulfillmentCheck.reason,
        { orderId: dbOrder.id, candidate: fulfillmentCheck.value }
      );
    }
    fulfillmentOption = fulfillmentCheck.value;
    const fees = calculateDualTierFees({
      ticketPrice,
      quantity,
      fulfillmentType: fulfillmentOption
    });
    expectedBuyerFee = fees.buyer_fee;
    expectedSellerFee = fees.seller_fee;
  } else if (SUPPORTED_POLICIES[policyVersion]) {
    const fees = CanonicalFeeEngine.calculateTicketFees({
      ticketPrice,
      quantity,
      paymentProcessingFee: providerFee,
      currency,
      policyVersion
    });
    expectedBuyerFee = fees.buyer_fee;
    expectedSellerFee = fees.seller_fee;
    const explicitFulfillment = dbOrder.fulfillment_option || dbQuote?.fulfillment_option || dbListing?.fulfillment_type || dbListing?.metadata?.fulfillment_type || null;
    if (explicitFulfillment !== null) {
      if (!VALID_FULFILLMENT_OPTIONS.has(String(explicitFulfillment).trim())) {
        throw buildReconciliationError(
          `Order '${dbOrder.id}' carries invalid fulfillment '${explicitFulfillment}'`,
          'INVALID_FULFILLMENT_OPTION',
          { orderId: dbOrder.id, fulfillment: explicitFulfillment }
        );
      }
      fulfillmentOption = String(explicitFulfillment).trim();
    }
  } else {
    throw buildReconciliationError(
      `Unsupported fee policy version '${policyVersion}' on order '${dbOrder.id}'`,
      'UNSUPPORTED_FEE_POLICY_VERSION',
      { orderId: dbOrder.id, policyVersion }
    );
  }

  if (dbOrder.buyer_fee !== undefined && dbOrder.buyer_fee !== null && Number(dbOrder.buyer_fee) !== expectedBuyerFee) {
    throw buildReconciliationError(
      `Order buyer_fee (${dbOrder.buyer_fee}) mismatches policy calculation (${expectedBuyerFee})`,
      'ORDER_BUYER_FEE_MISMATCH',
      { orderId: dbOrder.id, persisted: Number(dbOrder.buyer_fee), expected: expectedBuyerFee }
    );
  }

  if (dbOrder.seller_fee !== undefined && dbOrder.seller_fee !== null && Number(dbOrder.seller_fee) !== expectedSellerFee) {
    throw buildReconciliationError(
      `Order seller_fee (${dbOrder.seller_fee}) mismatches policy calculation (${expectedSellerFee})`,
      'ORDER_SELLER_FEE_MISMATCH',
      { orderId: dbOrder.id, persisted: Number(dbOrder.seller_fee), expected: expectedSellerFee }
    );
  }

  const expectedPlatformRevenue = expectedBuyerFee + expectedSellerFee;
  const expectedTotalTax = buyerTax + sellerTax;
  const expectedBuyerTotal = expectedGross + expectedBuyerFee + buyerTax + providerFee;
  const expectedSellerPayout = expectedGross - expectedSellerFee - sellerTax;

  const orderTotal = Number(dbOrder.buyer_total ?? dbOrder.total_amount);
  const orderPayout = Number(dbOrder.seller_payout);
  if (orderTotal !== expectedBuyerTotal) {
    throw buildReconciliationError(
      `Order buyer_total (${orderTotal}) mismatches expected (${expectedBuyerTotal})`,
      'ORDER_TOTAL_MISMATCH',
      { orderId: dbOrder.id, persisted: orderTotal, expected: expectedBuyerTotal }
    );
  }
  if (orderPayout !== expectedSellerPayout) {
    throw buildReconciliationError(
      `Order seller_payout (${orderPayout}) mismatches expected (${expectedSellerPayout})`,
      'ORDER_PAYOUT_MISMATCH',
      { orderId: dbOrder.id, persisted: orderPayout, expected: expectedSellerPayout }
    );
  }

  return {
    currency,
    quantity,
    ticketPrice,
    expectedGross,
    fulfillmentOption,
    policyVersion,
    expectedBuyerFee,
    expectedSellerFee,
    expectedPlatformRevenue,
    expectedTotalTax,
    expectedProviderFee: providerFee,
    expectedBuyerTotal,
    expectedSellerPayout
  };
}

class LedgerVerificationService {
  /**
   * Performs independent durable read-after-write verification of a payment capture.
   * Rejects any missing row, duplicate capture, currency/amount/fee mismatch, or
   * unbalanced/incomplete journal entries even if process memory `state.*` disagrees.
   */
  static async verifyDurableCapture(orderId, options = {}) {
    if (!orderId || typeof orderId !== 'string') {
      throw buildReconciliationError('orderId is required for durable ledger verification', 'INVALID_ORDER_ID');
    }

    const moneyRepo = options.moneyRepo || getMoneyRepository();
    const marketplaceRepo = options.marketplaceRepo || getMarketplaceRepository();
    const txContext = options.txContext ? { ...options.txContext, strictRepositoryOnly: true } : { strictRepositoryOnly: true };

    if (!moneyRepo || !marketplaceRepo) {
      throw buildReconciliationError('Durable repositories unavailable for verification', 'REPOSITORY_UNAVAILABLE');
    }

    const fail = async (err) => {
      try {
        await recordAuditLog('ORDER', orderId, 'LEDGER_RECONCILIATION_REQUIRED', 'SYSTEM', {
          code: err.code,
          reason: err.reason,
          ...(err.details || {})
        });
      } catch (_) {}
      throw err;
    };

    try {
      const dbOrder = await moneyRepo.getOrderById(orderId, txContext);
      if (!dbOrder) {
        throw buildReconciliationError(`Order '${orderId}' not found in persistent repository`, 'ORDER_NOT_FOUND', { orderId });
      }

      const dbPayment = await moneyRepo.getLatestSettledPaymentByOrderId(orderId, txContext);
      if (!dbPayment) {
        throw buildReconciliationError(`No settled payment found in persistent repository for order '${orderId}'`, 'SETTLED_PAYMENT_MISSING', { orderId });
      }

      const dbQuote = dbOrder.quote_id ? await moneyRepo.getQuoteById(dbOrder.quote_id, txContext) : null;
      if (dbOrder.quote_id && !dbQuote) {
        throw buildReconciliationError(`Bound quote '${dbOrder.quote_id}' missing in persistent repository`, 'BOUND_QUOTE_MISSING', {
          orderId,
          quoteId: dbOrder.quote_id
        });
      }
      if (dbQuote) {
        if (dbQuote.listing_id !== dbOrder.listing_id || dbQuote.buyer_id !== dbOrder.buyer_id) {
          throw buildReconciliationError(`Bound quote '${dbOrder.quote_id}' context disagrees with order '${orderId}'`, 'BOUND_QUOTE_MISMATCH', {
            orderId,
            quoteId: dbOrder.quote_id
          });
        }
      }

      const dbListing = dbOrder.listing_id ? await marketplaceRepo.getListingById(dbOrder.listing_id, txContext) : null;

      const policyVersion = dbOrder.fee_policy_version || dbOrder.pricing_policy_version || dbQuote?.pricing_policy_version || null;
      if (!policyVersion) {
        throw buildReconciliationError(`Order '${orderId}' missing authoritative fee_policy_version`, 'MISSING_FEE_POLICY_VERSION', { orderId });
      }

      const expected = computeExpectedBreakdown({ dbOrder, dbQuote, dbListing, policyVersion });

      const paymentCurrency = String(dbPayment.currency || '').trim().toUpperCase();
      if (paymentCurrency !== expected.currency) {
        throw buildReconciliationError(
          `Payment currency '${paymentCurrency}' does not match order currency '${expected.currency}'`,
          'PAYMENT_CURRENCY_MISMATCH',
          { orderId, paymentCurrency, orderCurrency: expected.currency }
        );
      }

      const paidAmount = Number(dbPayment.gross_amount ?? dbPayment.amount);
      if (paidAmount !== expected.expectedBuyerTotal) {
        throw buildReconciliationError(
          `Settled payment amount (${paidAmount}) does not match expected buyer_total (${expected.expectedBuyerTotal})`,
          'PAYMENT_AMOUNT_MISMATCH',
          { orderId, paidAmount, expectedBuyerTotal: expected.expectedBuyerTotal }
        );
      }

      const captures = typeof moneyRepo.getLedgerTransactionsWithEntriesByOrderId === 'function'
        ? await moneyRepo.getLedgerTransactionsWithEntriesByOrderId(orderId, 'CAPTURE', txContext)
        : [];

      if (!Array.isArray(captures) || captures.length === 0) {
        throw buildReconciliationError(`No durable CAPTURE ledger transaction found for order '${orderId}'`, 'LEDGER_CAPTURE_MISSING', { orderId });
      }
      if (captures.length > 1) {
        throw buildReconciliationError(`Multiple CAPTURE ledger transactions (${captures.length}) detected for order '${orderId}'`, 'DUPLICATE_LEDGER_CAPTURE', {
          orderId,
          captureCount: captures.length
        });
      }

      const tx = captures[0];
      if (!tx.transaction_id) {
        throw buildReconciliationError('Capture ledger transaction missing transaction_id', 'MISSING_TRANSACTION_ID', { orderId });
      }
      if (tx.order_id !== orderId) {
        throw buildReconciliationError(`Ledger transaction order_id (${tx.order_id}) != ${orderId}`, 'LEDGER_ORDER_MISMATCH', { orderId });
      }
      if (String(tx.currency || '').trim().toUpperCase() !== expected.currency) {
        throw buildReconciliationError(`Ledger transaction currency (${tx.currency}) != ${expected.currency}`, 'LEDGER_CURRENCY_MISMATCH', { orderId });
      }
      if (Number(tx.total_amount) !== expected.expectedBuyerTotal) {
        throw buildReconciliationError(
          `Ledger transaction total (${tx.total_amount}) != expected buyer total (${expected.expectedBuyerTotal})`,
          'LEDGER_TOTAL_MISMATCH',
          { orderId, ledgerTotal: Number(tx.total_amount), expectedBuyerTotal: expected.expectedBuyerTotal }
        );
      }
      if (dbOrder.quote_id && tx.quote_id !== dbOrder.quote_id) {
        throw buildReconciliationError(
          `Ledger quote_id (${tx.quote_id}) != order quote_id (${dbOrder.quote_id})`,
          'LEDGER_QUOTE_MISMATCH',
          { orderId, ledgerQuoteId: tx.quote_id, orderQuoteId: dbOrder.quote_id }
        );
      }

      const entries = tx.entries;
      if (!Array.isArray(entries) || entries.length < 2) {
        throw buildReconciliationError(
          `Durable CAPTURE ledger transaction '${tx.transaction_id}' is missing child journal entries`,
          'LEDGER_ENTRIES_MISSING',
          { orderId, transactionId: tx.transaction_id }
        );
      }

      let totalDebits = 0;
      let totalCredits = 0;
      const accountBuckets = new Map();

      for (const entry of entries) {
        const account = entry.ledger_account || entry.account;
        const type = entry.entry_type || entry.type;
        const amt = Number(entry.amount);
        const entryCurrency = String(entry.currency || tx.currency || '').trim().toUpperCase();

        if (!account || !['DEBIT', 'CREDIT'].includes(type)) {
          throw buildReconciliationError('Invalid ledger entry account or type', 'INVALID_LEDGER_ENTRY', { orderId, account, type });
        }
        if (!Number.isSafeInteger(amt) || amt <= 0) {
          throw buildReconciliationError(`Invalid ledger entry amount (${entry.amount})`, 'INVALID_LEDGER_ENTRY_AMOUNT', { orderId, account, amount: entry.amount });
        }
        if (entryCurrency !== expected.currency) {
          throw buildReconciliationError(`Ledger entry currency (${entryCurrency}) != ${expected.currency}`, 'LEDGER_ENTRY_CURRENCY_MISMATCH', { orderId, account });
        }
        if (entry.order_id && entry.order_id !== orderId) {
          throw buildReconciliationError(`Ledger entry order_id (${entry.order_id}) != ${orderId}`, 'LEDGER_ENTRY_ORDER_MISMATCH', { orderId });
        }

        if (type === 'DEBIT') totalDebits += amt;
        else totalCredits += amt;

        const key = `${type}:${account}`;
        accountBuckets.set(key, (accountBuckets.get(key) || 0) + amt);
      }

      if (totalDebits !== totalCredits || totalDebits !== expected.expectedBuyerTotal) {
        throw buildReconciliationError(
          `Ledger entry imbalance: debits=${totalDebits}, credits=${totalCredits}, expected=${expected.expectedBuyerTotal}`,
          'LEDGER_UNBALANCED_OR_MISMATCH',
          { orderId, totalDebits, totalCredits, expectedBuyerTotal: expected.expectedBuyerTotal }
        );
      }

      const expectedBuckets = new Map();
      expectedBuckets.set('DEBIT:PAYMENT_GATEWAY_CLEARING', expected.expectedBuyerTotal);
      if (expected.expectedSellerPayout > 0) {
        expectedBuckets.set('CREDIT:SELLER_PAYABLE_PENDING', expected.expectedSellerPayout);
      }
      if (expected.expectedPlatformRevenue > 0) {
        expectedBuckets.set('CREDIT:PLATFORM_FEE_REVENUE', expected.expectedPlatformRevenue);
      }
      if (expected.expectedTotalTax > 0) {
        expectedBuckets.set('CREDIT:TAX_PAYABLE', expected.expectedTotalTax);
      }
      if (expected.expectedProviderFee > 0) {
        expectedBuckets.set('CREDIT:PROVIDER_FEE_EXPENSE', expected.expectedProviderFee);
      }

      for (const [key, expAmt] of expectedBuckets.entries()) {
        const actualAmt = accountBuckets.get(key) || 0;
        if (actualAmt !== expAmt) {
          throw buildReconciliationError(
            `Ledger bucket '${key}' actual=${actualAmt} != expected=${expAmt}`,
            'LEDGER_ACCOUNT_BREAKDOWN_MISMATCH',
            { orderId, bucket: key, actual: actualAmt, expected: expAmt }
          );
        }
      }

      for (const [key, actualAmt] of accountBuckets.entries()) {
        if (!expectedBuckets.has(key)) {
          throw buildReconciliationError(
            `Unexpected ledger entry bucket '${key}' (amount=${actualAmt}) for CAPTURE on order '${orderId}'`,
            'UNEXPECTED_LEDGER_BUCKET',
            { orderId, bucket: key, amount: actualAmt }
          );
        }
      }

      return {
        verified: true,
        orderId,
        transactionId: tx.transaction_id,
        paymentId: dbPayment.id,
        quoteId: dbOrder.quote_id || null,
        policyVersion: expected.policyVersion,
        fulfillmentOption: expected.fulfillmentOption,
        currency: expected.currency,
        expectedBuyerTotal: expected.expectedBuyerTotal,
        expectedSellerPayout: expected.expectedSellerPayout,
        expectedBuyerFee: expected.expectedBuyerFee,
        expectedSellerFee: expected.expectedSellerFee,
        expectedPlatformRevenue: expected.expectedPlatformRevenue,
        entriesCount: entries.length
      };
    } catch (err) {
      if (err.code === 'LEDGER_RECONCILIATION_REQUIRED') {
        return await fail(err);
      }
      throw err;
    }
  }
}

module.exports = {
  LedgerVerificationService,
  VALID_FULFILLMENT_OPTIONS
};
