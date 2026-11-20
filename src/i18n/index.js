/**
 * TIKUM — Centralized i18n Dictionary Hub
 * Zero-Architecture, Non-Destructive Localization Service
 */

const id = require('./dictionaries/id');
const en = require('./dictionaries/en');

const dictionaries = {
  id,
  en
};

/**
 * Resolves translation by dot-path key
 * @param {string} key e.g. "dealCreate.pageTitle" or "status.OWNERSHIP_EVIDENCE_REVIEWED"
 * @param {string} [locale='id']
 * @param {string} [fallback]
 */
function t(key, locale = 'id', fallback = '') {
  const lang = (locale === 'en' || locale.startsWith('en')) ? 'en' : 'id';
  const dict = dictionaries[lang] || dictionaries.id;
  
  if (!key || typeof key !== 'string') return fallback;
  
  const parts = key.split('.');
  let current = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return fallback || key;
    }
  }
  return typeof current === 'string' ? current : fallback || key;
}

/**
 * Normalizes locale code
 * @param {string} code
 * @returns {'id' | 'en'}
 */
function normalizeLocale(code) {
  if (!code || typeof code !== 'string') return 'id';
  const clean = code.trim().toLowerCase();
  if (clean === 'en' || clean.startsWith('en-') || clean.startsWith('en_')) return 'en';
  return 'id';
}

/**
 * Format IDR currency in compliance with TIKUM rules:
 * - Always exact integer IDR, never convert currencies
 * - Indonesian: Rp 3.000.000
 * - English: IDR 3,000,000
 * @param {number|string} amount
 * @param {string} [locale='id']
 */
function formatCurrency(amount, locale = 'id') {
  const n = Math.round(Number(amount) || 0);
  const lang = normalizeLocale(locale);
  if (lang === 'en') {
    return 'IDR ' + n.toLocaleString('en-US');
  }
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format Date/Time with explicit timezone clarity (WIB)
 * e.g. 26 Desember 2026, 15.00 WIB vs 26 December 2026, 15:00 WIB
 * @param {Date|string} dateInput
 * @param {string} [locale='id']
 * @param {boolean} [includeTime=false]
 */
function formatDateTime(dateInput, locale = 'id', includeTime = false) {
  if (!dateInput) return '-';
  const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  
  const lang = normalizeLocale(locale);
  const tag = lang === 'en' ? 'en-US' : 'id-ID';
  
  const dateStr = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta'
  }).format(d);
  
  if (!includeTime) return dateStr;
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeSeparator = lang === 'en' ? ':' : '.';
  return `${dateStr}, ${hours}${timeSeparator}${minutes} WIB`;
}

module.exports = {
  id,
  en,
  dictionaries,
  t,
  normalizeLocale,
  formatCurrency,
  formatDateTime
};
