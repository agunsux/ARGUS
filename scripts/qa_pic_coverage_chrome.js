'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

process.env.NODE_ENV = 'test';
process.env.ARGUS_REAL_SOURCE_SEED = 'false';
for (const key of Object.keys(process.env)) {
  if (/DATABASE_URL$|^TEST_DATABASE_SCHEMA$|^VERCEL/.test(key)) delete process.env[key];
}
const app = require('../src/server');

async function until(fn, message, timeout = 4500) {
  const deadline = Date.now() + timeout;
  do {
    const value = await fn();
    if (value) return value;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(message);
}

async function main() {
  const [width, height] = (process.argv[2] || '1366x768').split('x').map(Number);
  assert(width > 0 && height > 0, 'Supply a viewport as WIDTHxHEIGHT');
  const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tikum-pic-cdp-'));
  const server = http.createServer((req, res) => {
    // All browser actions are GETs; the seller and event fixtures exist only in this harness.
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const fixtures = {
      '/api/auth/me/profile': { profile: { email_verified: true, seller_profile_complete: true, name: 'Local fixture' } },
      '/api/mvp/events': { events: ['Jakarta', 'Bandung', 'Bali', 'Singapore', ''].map((city, i) => ({ id: `e${i}`, name: city || 'City unknown', venue_city: city, venue_name: 'Fixture Venue', start_date: '2027-01-23', is_verified: true })) }
    };
    if (Object.hasOwn(fixtures, pathname)) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(fixtures[pathname])); return; }
    app(req, res);
  });
  let chrome;
  let socket;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
    let launchError;
    chrome.on('error', error => { launchError = error; });
    const port = await until(async () => {
      if (launchError) throw launchError;
      return fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').then(s => s.split('\n')[0], () => null);
    }, 'Chrome did not start');
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let seq = 0;
    const pending = new Map();
    const errors = [];
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 3500);
        pending.set(id, data => { clearTimeout(timer); if (data.error) reject(new Error(data.error.message)); else resolve(data.result); });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    socket.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id) { const callback = pending.get(msg.id); pending.delete(msg.id); callback?.(msg); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
      if (msg.method === 'Fetch.requestPaused') {
        const { requestId, request } = msg.params;
        const call = request.method === 'GET' && request.url.startsWith(origin + '/')
          ? send('Fetch.continueRequest', { requestId })
          : send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' });
        call.catch(error => errors.push(error.message));
      }
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'Evaluation failed');
      return r.result.value;
    };
    await Promise.all(['Page', 'Runtime', 'Log', 'Fetch'].map(domain => send(`${domain}.enable`)));
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    for (const route of ['/terms', '/terms?lang=th', '/buyer-protection', '/create']) {
      errors.length = 0;
      await send('Page.navigate', { url: origin + route });
      await until(() => evaluate(`location.href === ${JSON.stringify(origin + route)} && document.readyState === 'complete'`), `${route} did not finish loading`);
      const visible = `id => Boolean(document.getElementById(id)?.getClientRects().length)`;
      if (route === '/create') {
        await until(() => evaluate(`document.querySelector('#eventSelect option[value="e3"]') && (${visible})('formCard')`), 'Listing not ready');
        const selectCity = id => evaluate(`(() => { const s = document.querySelector('#eventSelect'); s.value = '${id}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        for (const id of ['e0', 'e1']) {
          await selectCity(id);
          assert(await evaluate(`(${visible})('picCoverageRegular')`));
          assert(!(await evaluate(`(${visible})('picCoverageOutside')`)));
        }
        for (const id of ['e2', 'e3']) {
          await selectCity(id);
          assert(await evaluate(`(${visible})('picCoverageOutside') && (${visible})('picCoverageSwitch') && document.querySelector('#picCoverageActions a').href === 'https://wa.me/6281299927378'`));
        }
        assert.equal(await evaluate('getComputedStyle(document.querySelector("#listingPicCoverage")).backgroundColor'), 'rgb(36, 54, 77)');
        assert.equal(await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'), 0, 'out-of-area overflow');
        await evaluate(`document.getElementById('picCoverageSwitch').click()`);
        assert(await evaluate(`document.querySelector('[name="fulfillmentType"]:checked').value === 'SELLER_MANAGED' && !(${visible})('picCoverageOutside')`));
        await evaluate(`document.querySelector('[value="TIKUM_VENUE_PIC"]').click()`);
        await selectCity('e4');
        assert(await evaluate(`!(${visible})('picCoverageOutside') && !(${visible})('picCoverageRegular')`));
        await evaluate(`toggleNewEventDrawer(true); const city = document.querySelector('#newEvCity'); city.value = 'Bali'; city.dispatchEvent(new Event('change'))`);
        assert(await evaluate(`(${visible})('customPicCoverage') && document.querySelector('#customPicContact a').href === 'https://wa.me/6281299927378'`));
      } else {
        assert(await evaluate(`(${visible})('pic-coverage-heading') && /Jabodetabek.*Bandung/.test(document.querySelector('#pic-coverage-heading').textContent)`));
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".pic-coverage")).backgroundColor'), 'rgb(36, 54, 77)');
        if (route.includes('lang=th')) assert(await evaluate(`/[\u0e00-\u0e7f]/.test(document.querySelector('#pic-coverage-heading').textContent)`));
      }
      assert.equal(await evaluate(`document.querySelectorAll('a[href="https://wa.me/6281299927378"]').length`), 1);
      assert.equal(await evaluate(`document.body.innerText.split('+62 812-9992-7378').length - 1`), 1);
      assert.equal(await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'), 0, `${route} overflow`);
      assert.deepEqual(errors, [], `${route} console errors`);
      console.log(`[PASS] Chrome ${width}x${height} ${route}: 0 console errors, 0px overflow, single WhatsApp`);
    }
  } finally {
    socket?.close();
    if (chrome?.pid) {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', timeout: 3000 });
      else chrome.kill();
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });