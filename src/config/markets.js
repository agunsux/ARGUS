/**
 * TIKUM / ARGUS — Global Market & Country Abstraction
 *
 * Strategic Architecture:
 * - Architecturally Global from Day 1.
 * - Commercially Local-First (Indonesia = ACTIVE).
 * - ASEAN (SG, MY, TH, VN, PH) = FUTURE.
 * - Global = FUTURE.
 *
 * Invariant:
 * Future markets are NOT activated merely because the architecture supports them.
 */

const MARKET_STATUS = {
  ACTIVE: 'ACTIVE',
  FUTURE: 'FUTURE',
  BETA: 'BETA',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  INTERNAL_TEST: 'INTERNAL_TEST',
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  PAYMENT_APPROVED: 'PAYMENT_APPROVED',
  OPERATIONS_READY: 'OPERATIONS_READY',
  LIVE: 'LIVE',
  SUSPENDED: 'SUSPENDED'
};

const MARKETS = {
  ID: {
    country: 'Indonesia',
    countryCode: 'ID',
    currency: 'IDR',
    currencyCode: 'IDR',
    decimals: 0,
    timezone: 'Asia/Jakarta',
    locale: 'id-ID',
    language: 'id',
    isAseanMember: true,
    paymentRegion: 'ID_DOMESTIC',
    taxRegion: 'ID_TAX',
    regulatoryRegion: 'ID_KOMINFO_BI',
    status: MARKET_STATUS.ACTIVE,
    readinessState: MARKET_STATUS.LIVE,
    name: 'Indonesia',
    launchPhase: 'PHASE_1',
    allowedTransferMethods: ['BI_FAST', 'REALTIME_TRANSFER', 'VIRTUAL_ACCOUNT']
  },
  SG: {
    country: 'Singapore',
    countryCode: 'SG',
    currency: 'SGD',
    currencyCode: 'SGD',
    decimals: 2,
    timezone: 'Asia/Singapore',
    locale: 'en-SG',
    language: 'en',
    isAseanMember: true,
    paymentRegion: 'SG_DOMESTIC',
    taxRegion: 'SG_GST',
    regulatoryRegion: 'SG_MAS',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Singapore',
    launchPhase: 'PHASE_2',
    allowedTransferMethods: ['FAST', 'PAYNOW', 'GIRO']
  },
  MY: {
    country: 'Malaysia',
    countryCode: 'MY',
    currency: 'MYR',
    currencyCode: 'MYR',
    decimals: 2,
    timezone: 'Asia/Kuala_Lumpur',
    locale: 'ms-MY',
    language: 'ms',
    isAseanMember: true,
    paymentRegion: 'MY_DOMESTIC',
    taxRegion: 'MY_SST',
    regulatoryRegion: 'MY_BNM',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Malaysia',
    launchPhase: 'PHASE_2',
    allowedTransferMethods: ['DUITNOW', 'IBG', 'RENTAS']
  },
  TH: {
    country: 'Thailand',
    countryCode: 'TH',
    currency: 'THB',
    currencyCode: 'THB',
    decimals: 2,
    timezone: 'Asia/Bangkok',
    locale: 'th-TH',
    language: 'th',
    isAseanMember: true,
    paymentRegion: 'TH_DOMESTIC',
    taxRegion: 'TH_VAT',
    regulatoryRegion: 'TH_BOT',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Thailand',
    launchPhase: 'PHASE_3',
    allowedTransferMethods: ['PROMPTPAY', 'BAHTNET']
  },
  VN: {
    country: 'Vietnam',
    countryCode: 'VN',
    currency: 'VND',
    currencyCode: 'VND',
    decimals: 0,
    timezone: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
    language: 'vi',
    isAseanMember: true,
    paymentRegion: 'VN_DOMESTIC',
    taxRegion: 'VN_VAT',
    regulatoryRegion: 'VN_SBV',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Vietnam',
    launchPhase: 'PHASE_3',
    allowedTransferMethods: ['NAPAS_247', 'CITAD']
  },
  PH: {
    country: 'Philippines',
    countryCode: 'PH',
    currency: 'PHP',
    currencyCode: 'PHP',
    decimals: 2,
    timezone: 'Asia/Manila',
    locale: 'en-PH',
    language: 'en',
    isAseanMember: true,
    paymentRegion: 'PH_DOMESTIC',
    taxRegion: 'PH_TRAIN',
    regulatoryRegion: 'PH_BSP',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Philippines',
    launchPhase: 'PHASE_3',
    allowedTransferMethods: ['INSTAPAY', 'PESONET']
  },
  HK: {
    country: 'Hong Kong',
    countryCode: 'HK',
    currency: 'HKD',
    currencyCode: 'HKD',
    decimals: 2,
    timezone: 'Asia/Hong_Kong',
    locale: 'zh-HK',
    language: 'zh',
    isAseanMember: false,
    paymentRegion: 'HK_DOMESTIC',
    taxRegion: 'HK_TAX',
    regulatoryRegion: 'HK_HKMA',
    status: MARKET_STATUS.FUTURE,
    readinessState: MARKET_STATUS.COMPLIANCE_REVIEW,
    name: 'Hong Kong',
    launchPhase: 'PHASE_4',
    allowedTransferMethods: ['FPS', 'BANK_TRANSFER']
  }
};

/**
 * Returns market configuration by ISO country code
 * @param {string} countryCode e.g. 'ID', 'SG'
 * @returns {object|null}
 */
function getMarket(countryCode) {
  if (!countryCode) return MARKETS.ID; // Default local-first
  const code = countryCode.toUpperCase().trim();
  return MARKETS[code] || null;
}

/**
 * Checks whether a market is active for commercial operations & checkout
 * @param {string} countryCode
 * @returns {boolean}
 */
function isMarketActive(countryCode) {
  const market = getMarket(countryCode);
  return market ? (market.status === MARKET_STATUS.ACTIVE || market.status === MARKET_STATUS.LIVE) : false;
}

/**
 * Checks whether a market is fully ready and approved to accept live orders and checkout
 * @param {string} countryCode
 * @returns {boolean}
 */
function canAcceptLiveOrders(countryCode) {
  if (!countryCode) return false;
  const market = getMarket(countryCode);
  if (!market) return false;
  const isLiveStatus = market.status === MARKET_STATUS.ACTIVE || market.status === MARKET_STATUS.LIVE;
  const isLiveReadiness = market.readinessState === MARKET_STATUS.LIVE || market.readinessState === MARKET_STATUS.OPERATIONS_READY;
  return Boolean(isLiveStatus && isLiveReadiness);
}

/**
 * Verifies whether country is a recognized ASEAN member state
 * @param {string} countryCode
 * @returns {boolean}
 */
function isAseanMember(countryCode) {
  const market = getMarket(countryCode);
  return market ? Boolean(market.isAseanMember) : false;
}

/**
 * Formats a timestamp into the country's local timezone and locale
 * @param {Date|string|number} date
 * @param {string} countryCode
 * @param {object} options
 * @returns {string|null}
 */
function formatLocalDateTime(date, countryCode = 'ID', options = {}) {
  const market = getMarket(countryCode) || MARKETS.ID;
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return null;
  }
  const defaultOptions = {
    timeZone: market.timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  };
  return new Intl.DateTimeFormat(market.locale, defaultOptions).format(d);
}

/**
 * Returns minor unit decimal count for a currency or country
 * (e.g. IDR/VND -> 0, SGD/MYR/THB/PHP/HKD -> 2)
 * @param {string} code
 * @returns {number}
 */
function getMinorUnitDecimals(code = 'ID') {
  const market = getMarket(code) || resolveMarketFromCountry(code);
  if (market && market.decimals !== undefined) return market.decimals;
  const cur = (code || '').toUpperCase().trim();
  if (['IDR', 'VND', 'JPY', 'KRW'].includes(cur)) return 0;
  return 2;
}

/**
 * Returns all active markets
 * @returns {Array<object>}
 */
function getActiveMarkets() {
  return Object.values(MARKETS).filter(m => m.status === MARKET_STATUS.ACTIVE || m.status === MARKET_STATUS.LIVE);
}

/**
 * Returns all registered markets
 * @returns {object}
 */
function getAllMarkets() {
  return { ...MARKETS };
}

/**
 * Resolves market configuration from country name or code
 * @param {string} input e.g. 'Indonesia', 'ID', 'Singapore', 'SG'
 * @returns {object|null}
 */
function resolveMarketFromCountry(input) {
  if (!input) return MARKETS.ID;
  const clean = input.trim();
  const byCode = getMarket(clean);
  if (byCode) return byCode;

  const lower = clean.toLowerCase();
  for (const market of Object.values(MARKETS)) {
    if (market.country.toLowerCase() === lower || market.name.toLowerCase() === lower) {
      return market;
    }
  }
  return null;
}

module.exports = {
  MARKET_STATUS,
  MARKETS,
  getMarket,
  isMarketActive,
  canAcceptLiveOrders,
  isAseanMember,
  formatLocalDateTime,
  getMinorUnitDecimals,
  getActiveMarkets,
  getAllMarkets,
  resolveMarketFromCountry
};

