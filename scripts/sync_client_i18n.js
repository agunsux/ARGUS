/**
 * TIKUM — Safe Five-Language i18n Synchronization Engine
 *
 * Atomically compiles and validates `src/i18n/dictionaries/{id,en,ms,tl,th}.js`
 * and injects them between unambiguous markers in `public/js/i18n.js`.
 * Rejects missing locales, parity drift, empty leaves, or invalid JS syntax
 * without modifying the previous client bundle.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CANONICAL_LOCALES = ['id', 'en', 'ms', 'tl', 'th'];
const START_MARKER = '// <I18N_DICTIONARIES_START>';
const END_MARKER = '// <I18N_DICTIONARIES_END>';

function collectLeaves(obj, prefix = '') {
  const leaves = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return leaves;
  for (const key of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(leaves, collectLeaves(val, full));
    } else {
      leaves[full] = val;
    }
  }
  return leaves;
}

function extractPlaceholders(str) {
  return (String(str).match(/\{\{?[^}]+\}\}?/g) || []).sort().join(',');
}

function indentBlock(str) {
  return str
    .split('\n')
    .map((line, idx) => (idx === 0 ? line : `  ${line}`))
    .join('\n');
}

function validateDictionaries(dictsByLocale, locales = CANONICAL_LOCALES) {
  const baselineLocale = locales[0];
  const baseDict = dictsByLocale[baselineLocale];
  if (!baseDict || typeof baseDict !== 'object') {
    throw new Error(`[i18n-sync] Missing baseline dictionary: ${baselineLocale}`);
  }
  const baseLeaves = collectLeaves(baseDict);
  const baseKeys = Object.keys(baseLeaves);
  if (baseKeys.length === 0) {
    throw new Error(`[i18n-sync] Baseline dictionary '${baselineLocale}' has zero keys`);
  }

  for (const locale of locales) {
    if (!CANONICAL_LOCALES.includes(locale)) {
      throw new Error(`[i18n-sync] Non-canonical locale '${locale}'. Allowed: ${CANONICAL_LOCALES.join(', ')}`);
    }
    const dict = dictsByLocale[locale];
    if (!dict || typeof dict !== 'object') {
      throw new Error(`[i18n-sync] Missing or invalid dictionary object for '${locale}'`);
    }
    const leaves = collectLeaves(dict);
    const missing = baseKeys.filter(k => !(k in leaves));
    const extra = Object.keys(leaves).filter(k => !(k in baseLeaves));
    if (missing.length > 0) {
      throw new Error(`[i18n-sync] Parity Error: ${missing.length} keys missing in '${locale}': ${missing.slice(0, 10).join(', ')}`);
    }
    if (extra.length > 0) {
      throw new Error(`[i18n-sync] Parity Error: ${extra.length} unexpected keys in '${locale}': ${extra.slice(0, 10).join(', ')}`);
    }
    for (const k of baseKeys) {
      const val = leaves[k];
      if (typeof val !== 'string' || val.trim().length === 0) {
        throw new Error(`[i18n-sync] Empty or non-string translation in '${locale}' at key '${k}'`);
      }
      const expectedPh = extractPlaceholders(baseLeaves[k]);
      const actualPh = extractPlaceholders(val);
      if (expectedPh !== actualPh) {
        throw new Error(`[i18n-sync] Placeholder mismatch in '${locale}' at '${k}': expected "${expectedPh}", got "${actualPh}"`);
      }
    }
  }

  return baseKeys.length;
}

function sync(options = {}) {
  const dictionariesDir = options.dictionariesDir || path.join(__dirname, '../src/i18n/dictionaries');
  const clientI18nPath = options.clientI18nPath || path.join(__dirname, '../public/js/i18n.js');
  const locales = options.locales || CANONICAL_LOCALES;

  if (!Array.isArray(locales) || locales.length !== CANONICAL_LOCALES.length || CANONICAL_LOCALES.some(l => !locales.includes(l))) {
    throw new Error(`[i18n-sync] Canonical locale set mismatch. Required: ${CANONICAL_LOCALES.join(', ')}`);
  }

  const dictsByLocale = {};
  for (const locale of locales) {
    const filePath = path.join(dictionariesDir, `${locale}.js`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[i18n-sync] Missing canonical source dictionary: ${filePath}`);
    }
    const resolved = path.resolve(filePath);
    delete require.cache[resolved];
    dictsByLocale[locale] = require(resolved);
  }

  const keyCount = validateDictionaries(dictsByLocale, locales);

  if (!fs.existsSync(clientI18nPath)) {
    throw new Error(`[i18n-sync] Client bundle not found: ${clientI18nPath}`);
  }
  const clientContent = fs.readFileSync(clientI18nPath, 'utf8');
  const startIdx = clientContent.indexOf(START_MARKER);
  const endIdx = clientContent.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    throw new Error('[i18n-sync] Missing or invalid dictionary markers in public/js/i18n.js. Aborting without modifying target.');
  }

  const entries = locales.map((locale) => {
    const json = JSON.stringify(dictsByLocale[locale], null, 2);
    return `    ${JSON.stringify(locale)}: ${indentBlock(json)}`;
  });

  const before = clientContent.slice(0, startIdx + START_MARKER.length);
  const after = clientContent.slice(endIdx);
  const generatedBlock = `\n  const translations = {\n${entries.join(',\n')}\n  };\n  `;
  const updatedContent = before + generatedBlock + after;

  // Validate syntax in memory before touching disk
  new vm.Script(updatedContent, { filename: 'public/js/i18n.js' });

  // Atomic write via temp file in the same directory
  const tmpPath = `${clientI18nPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, updatedContent, 'utf8');
    fs.renameSync(tmpPath, clientI18nPath);
  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) { /* ignore cleanup */ }
    throw err;
  }

  console.log(`[i18n-sync] Synced ${locales.length} locales (${locales.join(', ')}) with ${keyCount} keys each into ${path.basename(clientI18nPath)} (${(updatedContent.length / 1024).toFixed(1)} KB).`);
  return { locales, keyCount, bytes: Buffer.byteLength(updatedContent, 'utf8') };
}

if (require.main === module) {
  try {
    sync();
    process.exit(0);
  } catch (err) {
    console.error('[i18n-sync ERROR]', err.message);
    process.exit(1);
  }
}

module.exports = {
  CANONICAL_LOCALES,
  collectLeaves,
  validateDictionaries,
  sync
};
