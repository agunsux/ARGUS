/**
 * TIKUM — Centralized i18n Dictionary Hub (5 Canonical Locales: id, en, ms, tl, th)
 * Zero-Architecture, Non-Destructive Localization Service
 */

const id = require('./dictionaries/id');
const en = require('./dictionaries/en');
const ms = require('./dictionaries/ms');
const tl = require('./dictionaries/tl');
const th = require('./dictionaries/th');

const CANONICAL_LOCALES = ['id', 'en', 'ms', 'tl', 'th'];

const dictionaries = {
  id,
  en,
  ms,
  tl,
  th
};

const LOCALE_INTL_TAGS = {
  id: 'id-ID',
  en: 'en-US',
  ms: 'ms-MY',
  tl: 'tl-PH',
  th: 'th-TH'
};

/**
 * Normalizes locale code strictly to canonical 5 languages ('id' | 'en' | 'ms' | 'tl' | 'th').
 * Accepts 'fil' alias -> canonical 'tl'; invalid/unsupported values fall back to 'id'.
 * @param {string} code
 * @returns {'id' | 'en' | 'ms' | 'tl' | 'th'}
 */
function normalizeLocale(code) {
  if (!code || typeof code !== 'string') return 'id';
  const clean = code.trim().toLowerCase().replace(/_/g, '-');
  if (clean === 'id' || clean === 'in' || clean.startsWith('id-') || clean.startsWith('in-')) return 'id';
  if (clean === 'en' || clean.startsWith('en-')) return 'en';
  if (clean === 'ms' || clean.startsWith('ms-')) return 'ms';
  if (clean === 'tl' || clean.startsWith('tl-') || clean === 'fil' || clean.startsWith('fil-')) return 'tl';
  if (clean === 'th' || clean.startsWith('th-')) return 'th';
  return 'id';
}

/**
 * Strictly validates a locale code without defaulting invalid values to 'id'.
 * @param {string} code
 * @returns {'id' | 'en' | 'ms' | 'tl' | 'th' | null}
 */
function parseStrictLocale(code) {
  if (!code || typeof code !== 'string') return null;
  const clean = code.trim().toLowerCase().replace(/_/g, '-');
  if (clean === 'id' || clean === 'in' || clean.startsWith('id-') || clean.startsWith('in-')) return 'id';
  if (clean === 'en' || clean.startsWith('en-')) return 'en';
  if (clean === 'ms' || clean.startsWith('ms-')) return 'ms';
  if (clean === 'tl' || clean.startsWith('tl-') || clean === 'fil' || clean.startsWith('fil-')) return 'tl';
  if (clean === 'th' || clean.startsWith('th-')) return 'th';
  return null;
}

/**
 * Resolves Express request locale strictly from query (?lang= / ?locale=) -> cookie (tikum_locale / tikum_lang) -> 'id'.
 */
function resolveRequestLocale(req) {
  if (!req) return 'id';
  const q = req.query || {};
  const fromQuery = parseStrictLocale(q.lang || q.locale);
  if (fromQuery) return fromQuery;

  const cookieHeader = String((req.headers && req.headers.cookie) || '');
  const match = cookieHeader.match(/(?:^|;\s*)(?:tikum_locale|tikum_lang)=([^;]+)/);
  if (match && match[1]) {
    try {
      const fromCookie = parseStrictLocale(decodeURIComponent(match[1]));
      if (fromCookie) return fromCookie;
    } catch (_) { /* ignore malformed cookie */ }
  }
  return 'id';
}

/**
 * Resolves translation by dot-path key with safe fallback hierarchy: requested -> en -> id -> fallback/key.
 * @param {string} key
 * @param {string} [locale='id']
 * @param {string} [fallback]
 */
function t(key, locale = 'id', fallback = '') {
  const lang = normalizeLocale(locale);
  const dict = dictionaries[lang] || dictionaries.id;

  if (!key || typeof key !== 'string') return fallback;

  const lookup = (source) => {
    const parts = key.split('.');
    let current = source;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return typeof current === 'string' ? current : undefined;
  };

  const primary = lookup(dict);
  if (primary !== undefined) return primary;
  if (lang !== 'en') {
    const enVal = lookup(dictionaries.en);
    if (enVal !== undefined) return enVal;
  }
  if (lang !== 'id') {
    const idVal = lookup(dictionaries.id);
    if (idVal !== undefined) return idVal;
  }
  return fallback || key;
}

/**
 * Format IDR currency in compliance with TIKUM rules:
 * - Always exact integer IDR, never convert currencies
 * - Indonesian: Rp 3.000.000
 * - International (en/ms/tl/th): IDR 3,000,000
 * @param {number|string} amount
 * @param {string} [locale='id']
 */
function formatCurrency(amount, locale = 'id') {
  const n = Math.round(Number(amount) || 0);
  const lang = normalizeLocale(locale);
  if (lang !== 'id') {
    return 'IDR ' + n.toLocaleString('en-US');
  }
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format Date/Time with explicit timezone clarity (WIB)
 * @param {Date|string} dateInput
 * @param {string} [locale='id']
 * @param {boolean} [includeTime=false]
 */
function formatDateTime(dateInput, locale = 'id', includeTime = false) {
  if (!dateInput) return '-';
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const lang = normalizeLocale(locale);
  const tag = LOCALE_INTL_TAGS[lang] || 'id-ID';

  const dateStr = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  }).format(d);

  if (!includeTime) return dateStr;

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeSeparator = lang === 'id' ? '.' : ':';
  return `${dateStr}, ${hours}${timeSeparator}${minutes} WIB`;
}

module.exports = {
  id,
  en,
  ms,
  tl,
  th,
  CANONICAL_LOCALES,
  dictionaries,
  t,
  normalizeLocale,
  parseStrictLocale,
  resolveRequestLocale,
  formatCurrency,
  formatDateTime
};
