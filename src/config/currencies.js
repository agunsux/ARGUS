/**
 * TIKUM / ARGUS — Currency Abstraction & Monetary Representation
 *
 * Invariants:
 * 1. Money MUST use integer minor units (e.g. cents, satoshis, whole IDR rupiah).
 * 2. NEVER use floating-point arithmetic for money.
 * 3. Store transaction currency and settlement currency explicitly.
 * 4. Preserve original ticket price currency.
 * 5. Default transaction currency for Indonesia: IDR.
 */

const CURRENCIES = {
  IDR: {
    code: 'IDR',
    name: 'Indonesian Rupiah',
    symbol: 'Rp',
    minorUnit: 1, // IDR has 0 decimal minor units in typical retail/banking, represented as integer
    decimals: 0,
    isZeroDecimal: true,
    countryCode: 'ID'
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    minorUnit: 100, // Cents
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'SG'
  },
  MYR: {
    code: 'MYR',
    name: 'Malaysian Ringgit',
    symbol: 'RM',
    minorUnit: 100, // Sen
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'MY'
  },
  THB: {
    code: 'THB',
    name: 'Thai Baht',
    symbol: '฿',
    minorUnit: 100, // Satang
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'TH'
  },
  VND: {
    code: 'VND',
    name: 'Vietnamese Dong',
    symbol: '₫',
    minorUnit: 1,
    decimals: 0,
    isZeroDecimal: true,
    countryCode: 'VN'
  },
  PHP: {
    code: 'PHP',
    name: 'Philippine Peso',
    symbol: '₱',
    minorUnit: 100, // Sentimo
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'PH'
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    minorUnit: 100, // Cents
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'US'
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    minorUnit: 1,
    decimals: 0,
    isZeroDecimal: true,
    countryCode: 'JP'
  },
  KRW: {
    code: 'KRW',
    name: 'South Korean Won',
    symbol: '₩',
    minorUnit: 1,
    decimals: 0,
    isZeroDecimal: true,
    countryCode: 'KR'
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    minorUnit: 100,
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'AU'
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    minorUnit: 100,
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'EU'
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    minorUnit: 100,
    decimals: 2,
    isZeroDecimal: false,
    countryCode: 'GB'
  }
};

const BASE_CURRENCY = 'IDR';

/**
 * Validates whether currency code is registered in architecture
 * @param {string} code
 * @returns {boolean}
 */
function isSupportedCurrency(code) {
  if (!code) return false;
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code.toUpperCase().trim());
}

/**
 * Returns currency metadata
 * @param {string} code
 * @returns {object|null}
 */
function getCurrency(code) {
  if (!code) return CURRENCIES[BASE_CURRENCY];
  const upper = code.toUpperCase().trim();
  return CURRENCIES[upper] || null;
}

/**
 * Validates monetary amount is a safe integer minor unit
 * @param {number|string} amount
 * @throws {Error} if amount is not an integer or is NaN
 */
function assertIntegerMoney(amount) {
  const num = Number(amount);
  if (!Number.isInteger(num)) {
    throw new Error(`Monetary amount must be an exact integer minor unit. Received: ${amount}`);
  }
  if (num < 0) {
    throw new Error(`Monetary amount cannot be negative. Received: ${amount}`);
  }
  return num;
}

module.exports = {
  CURRENCIES,
  BASE_CURRENCY,
  isSupportedCurrency,
  getCurrency,
  assertIntegerMoney
};

