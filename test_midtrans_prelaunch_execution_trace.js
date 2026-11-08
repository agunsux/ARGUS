'use strict';
// Characterization test: observe existing gates without overriding marketplace policy.
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.TEST_DATABASE_URL;
delete process.env.TEST_DATABASE_SCHEMA;
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const auth = require('./src/middleware/auth');
const policy = require('./src/config/marketplaceMode');
const { PaymentService } = require('./src/services/payment/PaymentService');
const { MidtransPaymentProvider } = require('./src/services/payment/MidtransPaymentProvider');
const counts = { auth: 0, policy: 0, service: 0, adapter: 0, outbound: 0 };
const originals = [];
function observe(object, key, counter) {
  const original = object[key];
  originals.push(() => { object[key] = original; });
  object[key] = function (...args) { counts[counter]++; return original.apply(this, args); };
}
observe(auth, 'resolveUserAsync', 'auth');
observe(policy, 'isPrelaunchListingMode', 'policy');
observe(PaymentService, 'createPayment', 'service');
observe(MidtransPaymentProvider.prototype, 'createPayment', 'adapter');
observe(MidtransPaymentProvider.prototype, '_httpRequest', 'outbound');
const originalHttpsRequest = https.request;
https.request = () => { counts.outbound++; throw new Error('Unexpected outbound HTTPS during blocked-flow test'); };
originals.push(() => { https.request = originalHttpsRequest; });
const app = require('./src/server');
let server;
async function run() {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let passed = 0;
  for (const deployment of ['preview', 'production']) {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = deployment;
    for (const mode of ['PRELAUNCH_LISTING_ONLY', '', 'invalid']) {
      process.env.MARKETPLACE_MODE = mode;
      for (const key of Object.keys(counts)) counts[key] = 0;
      const response = await new Promise((resolve, reject) => {
        const req = http.request({hostname:'127.0.0.1', port:server.address().port,
          path:'/api/v1/payments/create?sandbox=true', method:'POST',
          headers:{'content-type':'application/json', 'x-sandbox':'true'}}, res => {
          let data=''; res.on('data', chunk => {data+=chunk;});
          res.on('end', () => resolve({status:res.statusCode, body:JSON.parse(data)}));
        });
        req.on('error', reject); req.end('{}');
      });
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'MARKETPLACE_PRELAUNCH_ONLY');
      assert.equal(counts.auth, 1);
      assert.equal(counts.policy, 1);
      assert.equal(counts.service, 0);
      assert.equal(counts.adapter, 0);
      assert.equal(counts.outbound, 0);
      console.log(JSON.stringify({case:'HTTP gate',deployment,mode:mode||'missing',status:403,code:response.body.code,...counts}));
      passed++;
      await assert.rejects(() => PaymentService.createPayment({providerName:'midtrans'}),
        error => error.status===403 && error.code==='MARKETPLACE_PRELAUNCH_ONLY');
      assert.equal(counts.adapter, 0);
      assert.equal(counts.outbound, 0);
      console.log(JSON.stringify({case:'service gate',deployment,mode:mode||'missing',status:403,adapter:counts.adapter,outbound:counts.outbound}));
      passed++;
    }
  }
  console.log(`PASS ${passed}/12 prelaunch execution trace cases; no outbound provider requests`);
}
run().then(() => { process.exitCode=0; }).catch(error => {
  console.error(error); process.exitCode=1;
}).finally(async () => {
  if(server) await new Promise(resolve => server.close(resolve));
  for(const restore of originals.reverse()) restore();
});
