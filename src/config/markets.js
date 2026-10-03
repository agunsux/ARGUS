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
  DISABLED: 'DISABLED'
};

const MARKETS = {
  ID: {
    country: 'Indonesia',
    countryCode: 'ID',
    currency: 'IDR',
    currencyCode: 'IDR',
    timezone: 'Asia/Jakarta',
    locale: 'id-ID',
    language: 'id',
    paymentRegion: 'ID_DOMESTIC',
    taxRegion: 'ID_TAX',
    regulatoryRegion: 'ID_KOMINFO_BI',
    status: MARKET_STATUS.ACTIVE,
    name: 'Indonesia',
    launchPhase: 'PHASE_1'
  },
  SG: {
    country: 'Singapore',
    countryCode: 'SG',
    currency: 'SGD',
    currencyCode: 'SGD',
    timezone: 'Asia/Singapore',
    locale: 'en-SG',
    language: 'en',
    paymentRegion: 'SG_DOMESTIC',
    taxRegion: 'SG_GST',
    regulatoryRegion: 'SG_MAS',
    status: MARKET_STATUS.FUTURE,
    name: 'Singapore',
    launchPhase: 'PHASE_2'
  },
  MY: {
    country: 'Malaysia',
    countryCode: 'MY',
    currency: 'MYR',
    currencyCode: 'MYR',
    timezone: 'Asia/Kuala_Lumpur',
    locale: 'ms-MY',
    language: 'ms',
    paymentRegion: 'MY_DOMESTIC',
    taxRegion: 'MY_SST',
    regulatoryRegion: 'MY_BNM',
    status: MARKET_STATUS.FUTURE,
    name: 'Malaysia',
    launchPhase: 'PHASE_2'
  },
  TH: {
    country: 'Thailand',
    countryCode: 'TH',
    currency: 'THB',
    currencyCode: 'THB',
    timezone: 'Asia/Bangkok',
    locale: 'th-TH',
    language: 'th',
    paymentRegion: 'TH_DOMESTIC',
    taxRegion: 'TH_VAT',
    regulatoryRegion: 'TH_BOT',
    status: MARKET_STATUS.FUTURE,
    name: 'Thailand',
    launchPhase: 'PHASE_3'
  },
  VN: {
    country: 'Vietnam',
    countryCode: 'VN',
    currency: 'VND',
    currencyCode: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
    language: 'vi',
    paymentRegion: 'VN_DOMESTIC',
    taxRegion: 'VN_VAT',
    regulatoryRegion: 'VN_SBV',
    status: MARKET_STATUS.FUTURE,
    name: 'Vietnam',
    launchPhase: 'PHASE_3'
  },
  PH: {
    country: 'Philippines',
    countryCode: 'PH',
    currency: 'PHP',
    currencyCode: 'PHP',
    timezone: 'Asia/Manila',
    locale: 'en-PH',
    language: 'en',
    paymentRegion: 'PH_DOMESTIC',
    taxRegion: 'PH_TRAIN',
    regulatoryRegion: 'PH_BSP',
    status: MARKET_STATUS.FUTURE,
    name: 'Philippines',
    launchPhase: 'PHASE_3'
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
  return market ? market.status === MARKET_STATUS.ACTIVE : false;
}

/**
 * Returns all active markets
 * @returns {Array<object>}
 */
function getActiveMarkets() {
  return Object.values(MARKETS).filter(m => m.status === MARKET_STATUS.ACTIVE);
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
  getActiveMarkets,
  getAllMarkets,
  resolveMarketFromCountry
};

