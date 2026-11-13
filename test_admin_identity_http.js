process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('./src/server');
let server;
(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let count = 0;
  async function check(route, expected, method = 'GET', body = undefined, extra = {}) {
    const r = await fetch(base + route, { method, redirect: 'manual',
      headers: { Origin: base, 'Content-Type': 'application/json', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) });
    await r.arrayBuffer(); assert.equal(r.status, expected, `${method} ${route}`); count++;
  }
  await check('/admin', 302, 'GET', undefined, { Accept: 'text/html' });
  await check('/admin/login', 200);
  await check('/api/admin/login', 410, 'POST', { email: 'admin@tikum.app', password: 'not-used' });
  await check('/api/admin/password-reset/request', 410, 'POST', { email: 'admin@tikum.app' });
  await check('/api/auth/signup', 403, 'POST', { email: ' ADMIN@TIKUM.APP ', password: 'Example123!', name: 'Attacker', role: 'ADMIN' });
  await check('/api/auth/login', 401, 'POST', { email: 'admin@tikum.app', password: 'not-used' });
  await check('/api/admin/verify', 403, 'POST', { token: 'bad' }, { Origin: 'https://evil.example' });
  await check('/api/admin/magic-link', 503, 'POST', { email: 'admin@tikum.app' }); // No isolated PostgreSQL is configured.
  // Discover every literal administrator route from source, including secondary router namespaces.
  const files = [ ['src/api/adminRouter.js', '/api/admin'], ['src/api/adminTrustRouter.js', '/api/admin/trust'],
    ['src/api/contentAdminRouter.js', ''], ['src/api/mvpRouter.js', '/api/mvp'], ['src/api/emailRouter.js', '/api'] ];
  for (const [file, prefix] of files) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      const route = prefix + match[2];
      if (!/^\/api\/(?:admin(?:\/|$)|mvp\/admin(?:\/|$))/.test(route)) continue;
      await check(route.replace(/:[A-Za-z_][\w]*/g, 'isolated-test-id'), 401, match[1].toUpperCase(),
        ['get', 'head'].includes(match[1]) ? undefined : {}, { 'x-user-role': 'ADMIN', 'x-user-id': 'admin', 'x-admin-api-key': 'fake-key' });
    }
  }
  console.log(`ADMIN HTTP SECURITY: ${count}/${count} PASS (anonymous route inventory and bypass probes; no production DB)`);
})().then(() => { server.close(); process.exit(0); }).catch(error => {
  console.error(error.message); if (server) server.close(); process.exit(1);
});