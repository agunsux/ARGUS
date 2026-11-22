/**
 * TIKUM — Single Source of Truth i18n Synchronization Engine
 * 
 * Idempotently compiles and synchronizes `src/i18n/dictionaries/{id,en}.js`
 * directly into `public/js/i18n.js` so server and client NEVER drift.
 */

const fs = require('fs');
const path = require('path');

const srcIdPath = path.join(__dirname, '../src/i18n/dictionaries/id.js');
const srcEnPath = path.join(__dirname, '../src/i18n/dictionaries/en.js');
const clientI18nPath = path.join(__dirname, '../public/js/i18n.js');

function collectLeaves(obj, prefix = '') {
  let leaves = {};
  for (const key of Object.keys(obj)) {
    const full = prefix ? prefix + '.' + key : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(leaves, collectLeaves(obj[key], full));
    } else {
      leaves[full] = obj[key];
    }
  }
  return leaves;
}

function sync() {
  console.log('[i18n-sync] Loading canonical dictionaries from src/i18n/dictionaries/ ...');
  
  // Clear require cache to get fresh copies
  delete require.cache[require.resolve(srcIdPath)];
  delete require.cache[require.resolve(srcEnPath)];
  
  const idDict = require(srcIdPath);
  const enDict = require(srcEnPath);

  // Parity check
  const idLeaves = collectLeaves(idDict);
  const enLeaves = collectLeaves(enDict);

  const missingInEn = Object.keys(idLeaves).filter(k => !(k in enLeaves));
  const missingInId = Object.keys(enLeaves).filter(k => !(k in idLeaves));

  if (missingInEn.length > 0) {
    throw new Error(`[i18n-sync] Parity Error: ${missingInEn.length} keys missing in EN: ${missingInEn.slice(0, 10).join(', ')}`);
  }
  if (missingInId.length > 0) {
    throw new Error(`[i18n-sync] Parity Error: ${missingInId.length} keys missing in ID: ${missingInId.slice(0, 10).join(', ')}`);
  }

  console.log(`[i18n-sync] Canonical parity verified: ${Object.keys(idLeaves).length} keys in ID and EN.`);

  // Read public/js/i18n.js
  let clientContent = fs.readFileSync(clientI18nPath, 'utf8');

  // Replace translations.id and translations.en
  // In public/js/i18n.js, translations is defined as: const translations = { "id": { ... }, "en": { ... }, ...
  const idJson = JSON.stringify(idDict, null, 2);
  const enJson = JSON.stringify(enDict, null, 2);

  // We can locate "id": { ... } and "en": { ... } inside `const translations = {`
  const idStartMarker = '  "id": ';
  const enStartMarker = '  "en": ';
  const zhStartMarker = '  "zh-CN": ';

  const idIdx = clientContent.indexOf(idStartMarker);
  const enIdx = clientContent.indexOf(enStartMarker);
  const zhIdx = clientContent.indexOf(zhStartMarker);

  if (idIdx === -1 || enIdx === -1 || zhIdx === -1 || idIdx >= enIdx || enIdx >= zhIdx) {
    throw new Error('[i18n-sync] Failed to parse boundaries of translations in public/js/i18n.js');
  }

  // Indent the JSON by 2 spaces
  const indent = (str) => str.split('\n').map((line, idx) => idx === 0 ? line : '  ' + line).join('\n');

  const beforeId = clientContent.slice(0, idIdx);
  const afterEn = clientContent.slice(zhIdx);

  const updatedContent = beforeId +
    '  "id": ' + indent(idJson) + ',\n' +
    '  "en": ' + indent(enJson) + ',\n' +
    afterEn;

  fs.writeFileSync(clientI18nPath, updatedContent, 'utf8');
  console.log(`[i18n-sync] Successfully injected canonical ID & EN dictionaries into public/js/i18n.js (${(updatedContent.length / 1024).toFixed(1)} KB)`);
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

module.exports = { sync };
