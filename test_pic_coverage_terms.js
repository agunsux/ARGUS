'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { isRegularCity } = require('./public/js/pic-coverage');

process.env.NODE_ENV = 'test';
process.env.ARGUS_REAL_SOURCE_SEED = 'false';
for (const key of Object.keys(process.env)) {
  if (/DATABASE_URL$|^TEST_DATABASE_SCHEMA$|^VERCEL/.test(key)) delete process.env[key];
}

const app = require('./src/server');
const { t } = require('./src/i18n');

async function main() {
  for (const city of ['Jakarta Selatan', 'Bogor', 'Depok', 'Tangerang Selatan', 'Bekasi', 'JABODETABEK', 'Kabupaten Bandung']) assert(isRegularCity(city), city);
  for (const city of ['', undefined, 'Bandungan', 'Bali', 'Lombok', 'Malang', 'Singapore', 'Kuala Lumpur', 'Bangkok', 'Manila', 'Ho Chi Minh City']) assert(!isRegularCity(city), city);
  assert(!fs.readFileSync(path.join(__dirname, 'public/js/i18n.js')).includes(13), 'Client i18n must use LF');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const locale of ['id', 'en', 'ms', 'tl', 'th']) {
      for (const route of ['/terms', '/buyer-protection', '/create', '/deal/create']) {
        const name = `${route}?lang=${locale}`;
        const res = await fetch(base + name);
        assert.equal(res.status, 200, name);
        const html = await res.text();
        assert(html.includes(`<html lang="${locale}"`), name);
        const keys = route.endsWith('/create') ? ['baseline', 'covered', 'warning', 'switch'] : ['heading', 'regular', 'other', 'operation'];
        for (const key of keys) {
          assert(html.includes(t(`picCoverage.${key}`, locale).replace(/&/g, '&amp;')), `${name}: ${key}`);
        }
        assert.equal((html.match(/href="https:\/\/wa\.me\/6281299927378" target="_blank" rel="noopener noreferrer"/g) || []).length, 1, name);
        assert.equal((html.match(/WhatsApp: \+62 812-9992-7378/g) || []).length, 1, name);
        assert.doesNotMatch(html, /\b(?:Telepon|Telpon)\b|href=["']tel:|081299927378/i, name);
      }
    }
    console.log('[PASS] PIC terms, buyer protection and listing guidance: all 5 locales, single official WhatsApp, city matcher and LF');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });