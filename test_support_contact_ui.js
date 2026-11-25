/** Regression coverage for WhatsApp-only support contact rendering. */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const app = require('./src/server');
const { businessProfile, renderFooterHtml } = require('./src/config/businessProfile');

function assertSupportContact(html, context) {
  assert(!/Telepon|Phone\s*(?:\/|&(?:amp;)?)\s*WhatsApp|Telpon/i.test(html), `${context}: obsolete support label`);
  assert(!html.includes('081299927378'), `${context}: obsolete local/duplicate number`);
  assert(!/href=["']tel:/i.test(html), `${context}: telephone link`);
  assert(html.includes('WhatsApp:'), `${context}: WhatsApp label missing`);
  const links = html.match(/<a\b[^>]*href="https:\/\/wa\.me\/6281299927378"[^>]*>[\s\S]*?<\/a>/g) || [];
  assert(links.length > 0, `${context}: WhatsApp link missing`);
  for (const link of links) {
    assert(link.includes('target="_blank"') && link.includes('rel="noopener noreferrer"'), `${context}: unsafe external link`);
  }
  assert(html.includes('+62 812-9992-7378'), `${context}: formatted number missing`);
}

(async () => {
  assert.strictEqual(businessProfile.whatsappDisplayNumber, '+62 812-9992-7378');
  for (const locale of ['id', 'en', 'ms', 'tl', 'th']) {
    assertSupportContact(renderFooterHtml(locale), `footer ${locale}`);
  }
  for (const name of fs.readdirSync(path.join(__dirname, 'public')).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(__dirname, 'public', name), 'utf8');
    assert(!/Telepon\s*(?:\/|&(?:amp;)?)\s*WhatsApp|Phone\s*(?:\/|&(?:amp;)?)\s*WhatsApp|\(081299927378\)|href=["']tel:/i.test(html), `${name}: obsolete support contact`);
  }
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/buyer-protection', '/contact']) {
      for (const locale of ['id', 'en', 'ms', 'tl', 'th']) {
        const response = await fetch(`${base}${route}?lang=${locale}`);
        assert.strictEqual(response.status, 200, `${route} ${locale}`);
        assertSupportContact(await response.text(), `${route} ${locale}`);
        console.log(`[PASS] ${route}?lang=${locale}: WhatsApp-only, single number format, safe links`);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('[PASS] Support contact UI regression checks');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});