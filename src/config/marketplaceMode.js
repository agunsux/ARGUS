/**
 * TIKUM / ARGUS — Centralized Server-Side Marketplace Mode Controller
 *
 * Controls whether the marketplace is running in:
 * - PRELAUNCH_LISTING_ONLY: Sellers can onboard and submit listings for review;
 *   all buyer purchasing, checkout, payment, escrow locking, and seller payouts are strictly blocked.
 * - LIVE: Live transactional marketplace (reserved for future, explicitly authorized live launch).
 *
 * SECURITY INVARIANTS:
 * 1. Enforced server-side across all transactional endpoints.
 * 2. In production (NODE_ENV=production or VERCEL), missing, invalid, or unrecognized modes
 *    MUST FAIL CLOSED to PRELAUNCH_LISTING_ONLY.
 * 3. Client-controlled request headers or payloads CANNOT bypass or alter the marketplace mode.
 * 4. Webhooks for historical reconciliation are preserved and not blindly blocked.
 */

const MARKETPLACE_MODES = {
  PRELAUNCH_LISTING_ONLY: 'PRELAUNCH_LISTING_ONLY',
  LIVE: 'LIVE'
};

const PRELAUNCH_ERROR_CODE = 'MARKETPLACE_PRELAUNCH_ONLY';
const PRELAUNCH_ERROR_MESSAGE = 'TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.';

const PRELAUNCH_ERROR_RESPONSE = {
  error: PRELAUNCH_ERROR_MESSAGE,
  code: PRELAUNCH_ERROR_CODE
};

const PAYMENT_GATEWAY_FROZEN_CODE = 'PAYMENT_GATEWAY_FROZEN';
const PAYMENT_GATEWAY_FROZEN_MESSAGE = 'Gerbang pembayaran online TIKUM saat ini ditangguhkan sementara. Transaksi tiket dikoordinasikan secara manual melalui rekening resmi TIKUM oleh Admin.';

const PAYMENT_GATEWAY_FROZEN_RESPONSE = {
  error: PAYMENT_GATEWAY_FROZEN_MESSAGE,
  code: PAYMENT_GATEWAY_FROZEN_CODE,
  coordination_mode: 'MANUAL_ESCROW',
  isAvailable: false
};

const PRELAUNCH_NOTICE_TEXT = 'TIKUM sedang dalam tahap persiapan peluncuran. Calon penjual sudah dapat mengajukan listing tiket untuk ditinjau. Pembelian, checkout, dan pembayaran belum tersedia. Pengajuan listing tidak menjamin tiket telah terverifikasi atau transaksi dapat dilakukan.';

let testModeOverride = null;
let testPaymentFrozenOverride = null;

/**
 * Resolves current authoritative server-side marketplace mode.
 * Fails closed in production if unset, unrecognized, or invalid.
 *
 * @returns {string} 'PRELAUNCH_LISTING_ONLY' | 'LIVE'
 */
function getMarketplaceMode() {
  if (testModeOverride) {
    return testModeOverride;
  }

  const rawEnv = (process.env.MARKETPLACE_MODE || '').trim().toUpperCase();
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  if (rawEnv === 'LIVE' || rawEnv === 'LIVE_MARKETPLACE' || rawEnv === 'TRANSACTIONAL') {
    return MARKETPLACE_MODES.LIVE;
  }

  if (rawEnv === MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY) {
    return MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY;
  }

  // Fail closed: In production, missing or unrecognized modes ALWAYS fail closed to PRELAUNCH_LISTING_ONLY.
  if (isProduction) {
    return MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY;
  }

  // In test / development without explicit MARKETPLACE_MODE:
  // If not specified, default to PRELAUNCH_LISTING_ONLY
  return MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY;
}

/**
 * Checks if platform is running in PRELAUNCH_LISTING_ONLY mode.
 * @returns {boolean}
 */
function isPrelaunchListingMode() {
  return getMarketplaceMode() === MARKETPLACE_MODES.PRELAUNCH_LISTING_ONLY;
}

/**
 * Checks if online payment gateway execution is frozen.
 * Under Payment Gateway Freeze Directive, online checkout and new payment intent creation
 * are suspended, while preserving all existing payment infrastructure, adapters, ledgers, and webhooks.
 *
 * @returns {boolean}
 */
function isPaymentGatewayFrozen() {
  if (testPaymentFrozenOverride !== null) {
    return Boolean(testPaymentFrozenOverride);
  }

  // If explicitly disabled via env:
  if (process.env.PAYMENT_GATEWAY_FROZEN === 'false') {
    return false;
  }

  // By default, payment gateway is frozen during prelaunch or when explicitly true or unset
  if (process.env.PAYMENT_GATEWAY_FROZEN === 'true') {
    return true;
  }

  // If in prelaunch mode, payment gateway is also frozen
  if (isPrelaunchListingMode()) {
    return true;
  }

  return false;
}

/**
 * Middleware that strictly blocks new transactions, checkouts, and payment initiations.
 */
function enforceNoTransactions(req, res, next) {
  if (isPrelaunchListingMode()) {
    return res.status(403).json(PRELAUNCH_ERROR_RESPONSE);
  }
  next();
}

/**
 * Middleware that enforces payment gateway freeze on online checkout endpoints.
 */
function enforcePaymentGatewayActive(req, res, next) {
  if (isPaymentGatewayFrozen()) {
    return res.status(503).json(PAYMENT_GATEWAY_FROZEN_RESPONSE);
  }
  next();
}

/**
 * Testing helper to temporarily override mode in test runners without polluting other suites.
 * @param {string|null} mode
 */
function setMarketplaceModeForTesting(mode) {
  testModeOverride = mode ? mode.trim().toUpperCase() : null;
}

/**
 * Testing helper to temporarily override payment freeze in test runners.
 * @param {boolean|null} frozen
 */
function setPaymentGatewayFrozenForTesting(frozen) {
  testPaymentFrozenOverride = typeof frozen === 'boolean' ? frozen : null;
}

module.exports = {
  MARKETPLACE_MODES,
  PRELAUNCH_ERROR_CODE,
  PRELAUNCH_ERROR_MESSAGE,
  PRELAUNCH_ERROR_RESPONSE,
  PAYMENT_GATEWAY_FROZEN_CODE,
  PAYMENT_GATEWAY_FROZEN_MESSAGE,
  PAYMENT_GATEWAY_FROZEN_RESPONSE,
  PRELAUNCH_NOTICE_TEXT,
  getMarketplaceMode,
  isPrelaunchListingMode,
  isPaymentGatewayFrozen,
  enforceNoTransactions,
  enforcePaymentGatewayActive,
  setMarketplaceModeForTesting,
  setPaymentGatewayFrozenForTesting
};
