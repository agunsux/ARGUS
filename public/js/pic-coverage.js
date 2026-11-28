(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TikumPicCoverage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // Regular Event PIC coverage: Jabodetabek & Bandung (Indonesia only).
  // Word boundaries prevent false matches like "Bandungan".
  const REGULAR_PIC_CITY_REGEX = /\b(?:jakarta|bogor|depok|tangerang|bekasi|jabodetabek|bandung)\b/i;
  const REGULAR_PIC_VENUE_REGEX = /\b(?:ice\s*bsd|bsd\s*city|sicc|sentul\s+international|gelora\s+bung\s+karno|gbk|stadion\s+madya|istora\s+senayan|senayan|jakarta\s+international\s+stadium|jis|jiexpo|kemayoran|ancol|beach\s+city\s+international|tennis\s+indoor|kasablanka|pik\s*2|nice\s*pik|trans\s+studio\s+bandung|sabuga|eldorado\s+dome|si\s+jalak\s+harupat)\b/i;

  const COUNTRY_LABELS = {
    ID: 'Indonesia',
    SG: 'Singapore',
    MY: 'Malaysia',
    TH: 'Thailand',
    PH: 'Philippines',
    VN: 'Vietnam'
  };

  const COUNTRY_SYNONYMS = {
    ID: 'ID',
    IDN: 'ID',
    INDONESIA: 'ID',
    SG: 'SG',
    SGP: 'SG',
    SINGAPORE: 'SG',
    SINGAPURA: 'SG',
    MY: 'MY',
    MYS: 'MY',
    MALAYSIA: 'MY',
    TH: 'TH',
    THA: 'TH',
    THAILAND: 'TH',
    PH: 'PH',
    PHL: 'PH',
    PHILIPPINES: 'PH',
    FILIPINA: 'PH',
    VN: 'VN',
    VNM: 'VN',
    VIETNAM: 'VN',
    'VIET NAM': 'VN'
  };

  const NON_ID_CITY_HINTS = [
    { code: 'SG', regex: /\b(?:singapore|singapura|kallang|marina\s+bay|sentosa|changi|star\s+theatre|national\s+stadium\s+singapore|singapore\s+indoor\s+stadium|singapore\s+expo|esplanade)\b/i },
    { code: 'MY', regex: /\b(?:kuala\s+lumpur|bukit\s+jalil|axiata\s+arena|petaling\s+jaya|shah\s+alam|genting|penang|johor\s+bahru|zepp\s+kuala\s+lumpur|malaysia)\b/i },
    { code: 'TH', regex: /\b(?:bangkok|nonthaburi|impact\s+arena|rajamangala|thunder\s+dome|bitec|phuket|chiang\s+mai|pattaya|thailand)\b/i },
    { code: 'PH', regex: /\b(?:manila|pasay|bulacan|quezon\s+city|makati|cebu|moa\s+arena|mall\s+of\s+asia\s+arena|philippine\s+arena|araneta\s+coliseum|smx\s+convention|philippines)\b/i },
    { code: 'VN', regex: /\b(?:ho\s+chi\s+minh|saigon|hanoi|ha\s+noi|da\s+nang|phu\s+quoc|my\s+dinh|vietnam)\b/i }
  ];

  function normalizeCountryToken(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.trim().toUpperCase();
    if (!cleaned) return null;
    if (COUNTRY_SYNONYMS[cleaned]) return COUNTRY_SYNONYMS[cleaned];
    for (const [key, code] of Object.entries(COUNTRY_SYNONYMS)) {
      if (key.length > 3 && cleaned.includes(key)) return code;
    }
    return null;
  }

  function resolveCountryCode(eventOrCountry, cityHint) {
    if (typeof eventOrCountry === 'string') {
      const explicit = normalizeCountryToken(eventOrCountry);
      if (explicit) return explicit;
      const combined = `${eventOrCountry} ${cityHint || ''}`;
      for (const hint of NON_ID_CITY_HINTS) {
        if (hint.regex.test(combined)) return hint.code;
      }
      return 'ID';
    }

    const ev = eventOrCountry || {};
    const meta = (ev.metadata && typeof ev.metadata === 'object') ? ev.metadata : {};
    const candidates = [
      ev.country_code,
      ev.country,
      meta.country_code,
      meta.country,
      ev.venue_details && ev.venue_details.country_code,
      ev.venue_details && ev.venue_details.country
    ];
    for (const c of candidates) {
      const resolved = normalizeCountryToken(c);
      if (resolved) return resolved;
    }

    const locText = [
      ev.city,
      ev.venue_city,
      ev.metro_area,
      ev.venue_name,
      ev.venue,
      cityHint
    ].filter(Boolean).join(' ');

    for (const hint of NON_ID_CITY_HINTS) {
      if (hint.regex.test(locText)) return hint.code;
    }

    return 'ID';
  }

  function isRegularCity(cityText, venueText, countryHint) {
    const cityStr = String(cityText || '').trim();
    const venueStr = String(venueText || '').trim();
    const combined = `${cityStr} ${venueStr}`.trim();

    if (countryHint) {
      const countryCode = resolveCountryCode(countryHint, combined);
      if (countryCode !== 'ID') return false;
    } else if (combined) {
      for (const hint of NON_ID_CITY_HINTS) {
        if (hint.regex.test(combined)) return false;
      }
    }

    if (!combined) return false;
    return REGULAR_PIC_CITY_REGEX.test(cityStr) || REGULAR_PIC_CITY_REGEX.test(venueStr) || REGULAR_PIC_VENUE_REGEX.test(combined);
  }

  function isRegularPicArea(event) {
    if (!event || typeof event !== 'object') return false;
    const countryCode = resolveCountryCode(event);
    if (countryCode !== 'ID') return false;
    const cityText = [event.city, event.venue_city, event.metro_area].filter(Boolean).join(' ');
    const venueText = [event.venue_name, event.venue].filter(Boolean).join(' ');
    return isRegularCity(cityText, venueText, countryCode);
  }

  function classifyEventCoverage(event) {
    const ev = event || {};
    const countryCode = resolveCountryCode(ev);
    const countryLabel = COUNTRY_LABELS[countryCode] || 'Indonesia';
    const regularPic = isRegularPicArea(ev);
    const cityDisplay = String(ev.city || ev.venue_city || '').trim() || countryLabel;
    const locationTag = countryCode === 'ID'
      ? `${cityDisplay} · ID`
      : `${cityDisplay} · ${countryCode}`;

    return {
      countryCode,
      countryLabel,
      isRegularPicArea: regularPic,
      cityDisplay,
      locationTag,
      fulfillmentMode: regularPic ? 'PIC_VENUE_READY' : 'TRANSFER_MANDIRI'
    };
  }

  function matchesRegionFilter(event, filterCode) {
    const code = String(filterCode || 'ALL').trim().toUpperCase();
    if (!code || code === 'ALL') return true;
    const coverage = classifyEventCoverage(event);
    if (code === 'PIC_READY' || code === 'JABODETABEK_BANDUNG') {
      return coverage.isRegularPicArea === true;
    }
    if (code === 'PH_VN') {
      return coverage.countryCode === 'PH' || coverage.countryCode === 'VN';
    }
    const normalized = normalizeCountryToken(code) || code;
    return coverage.countryCode === normalized;
  }

  return {
    REGULAR_PIC_CITY_REGEX,
    REGULAR_PIC_VENUE_REGEX,
    COUNTRY_LABELS,
    resolveCountryCode,
    isRegularCity,
    isRegularPicArea,
    classifyEventCoverage,
    matchesRegionFilter
  };
});
