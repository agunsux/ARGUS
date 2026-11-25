/**
 * Tests for safe 5-language i18n synchronization (scripts/sync_client_i18n.js).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CANONICAL_LOCALES, collectLeaves, sync } = require('./scripts/sync_client_i18n');

console.log('[TEST] Running 5-language i18n sync safety & parity suite...');

assert.deepStrictEqual(CANONICAL_LOCALES, ['id', 'en', 'ms', 'tl', 'th'], 'Canonical locales must use tl (not fil)');

// 1. Live client bundle check
const clientI18n = require('./public/js/i18n.js');
const supportedCodes = clientI18n.getSupportedLocales().map(l => l.code);
assert.deepStrictEqual(supportedCodes, ['id', 'en', 'ms', 'tl', 'th'], 'Client supported locales must be id,en,ms,tl,th');
assert.strictEqual(clientI18n.normalizeLang('fil'), 'tl', 'fil alias must normalize to canonical tl');
assert.strictEqual(clientI18n.normalizeLang('fil-PH'), 'tl', 'fil-PH alias must normalize to canonical tl');
assert.strictEqual(clientI18n.normalizeLang('tl-PH'), 'tl', 'tl-PH must normalize to canonical tl');
assert.strictEqual(clientI18n.normalizeLang('zh-CN'), null, 'Stale locales must not normalize in 5-lang client');
assert.strictEqual(clientI18n.resolveInitialLanguage('?lang=th', 'ms'), 'th', 'Query must beat storage');
assert.strictEqual(clientI18n.resolveInitialLanguage('', 'ms'), 'ms', 'Storage must resolve when query absent');
assert.strictEqual(clientI18n.resolveInitialLanguage('?lang=invalid', null), 'id', 'Invalid locale must fall back to id');

for (const code of CANONICAL_LOCALES) {
  assert(clientI18n.translations[code], `Client translations missing '${code}'`);
  assert.strictEqual(Object.keys(collectLeaves(clientI18n.translations[code])).length, 1671, `'${code}' must have 1671 keys`);
}
assert(!clientI18n.translations.fil, 'Non-canonical fil key must not exist in translations');
assert(!clientI18n.translations['zh-CN'], 'Stale zh-CN dictionary must be removed from client translations');

// 2. Atomic rollback / preservation on invalid source dictionary
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tikum-i18n-sync-'));
const dictDir = path.join(tmpRoot, 'dicts');
fs.mkdirSync(dictDir);
for (const l of CANONICAL_LOCALES) {
  fs.writeFileSync(path.join(dictDir, `${l}.js`), `module.exports = { nav: { home: "Home (${l})" } };\n`, 'utf8');
}
const mockClientPath = path.join(tmpRoot, 'i18n.js');
const mockTemplate = '// <I18N_DICTIONARIES_START>\n  const translations = {};\n  // <I18N_DICTIONARIES_END>\n';
fs.writeFileSync(mockClientPath, mockTemplate, 'utf8');

const res = sync({ dictionariesDir: dictDir, clientI18nPath: mockClientPath });
assert.strictEqual(res.keyCount, 1);
const syncedBytes = fs.readFileSync(mockClientPath, 'utf8');
assert(syncedBytes.includes('"tl":'), 'Synced output must include tl');

// Inject empty translation in th and verify sync throws WITHOUT modifying existing bundle
fs.writeFileSync(path.join(dictDir, 'th.js'), 'module.exports = { nav: { home: "   " } };\n', 'utf8');
assert.throws(() => sync({ dictionariesDir: dictDir, clientI18nPath: mockClientPath }), /Empty or non-string/);
assert.strictEqual(fs.readFileSync(mockClientPath, 'utf8'), syncedBytes, 'Previous valid client bundle must remain untouched on validation failure');

// Inject key drift in ms and verify sync throws WITHOUT modifying existing bundle
fs.writeFileSync(path.join(dictDir, 'th.js'), 'module.exports = { nav: { home: "หน้าหลัก" } };\n', 'utf8');
fs.writeFileSync(path.join(dictDir, 'ms.js'), 'module.exports = { nav: {} };\n', 'utf8');
assert.throws(() => sync({ dictionariesDir: dictDir, clientI18nPath: mockClientPath }), /Parity Error/);
assert.strictEqual(fs.readFileSync(mockClientPath, 'utf8'), syncedBytes, 'Previous valid client bundle must remain untouched on parity failure');

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log('✓ 5-language sync tests and atomic rollback checks PASSED!');
