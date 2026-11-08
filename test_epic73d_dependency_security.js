'use strict';
// Local dependency regression probes. No application database or payment rail is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const multer = require('multer');
const proxyaddr = require('proxy-addr');
const qs = require('qs');
const { z } = require('zod');

async function serve(app, action) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const send = (body, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname:'127.0.0.1', port:server.address().port,
      path:'/', method:'POST', headers:{...headers, 'content-length':Buffer.byteLength(body)} }, res => {
      let data=''; res.on('data', chunk => {data+=chunk;});
      res.on('end', () => resolve({status:res.statusCode, body:data}));
    });
    req.on('error', reject); req.end(body);
  });
  try { await action(send); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('proxy-addr rejects unrelated IPv4 peers under short IPv6 trust prefixes', () => {
  for(const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    const trust=proxyaddr.compile(subnet);
    assert.equal(trust('203.0.113.7'), false);
    assert.equal(proxyaddr({socket:{remoteAddress:'203.0.113.7'},headers:{'x-forwarded-for':'127.0.0.1'}},trust),'203.0.113.7');
  }
  const valid=proxyaddr.compile('::ffff:10.0.0.0/104');
  assert.equal(valid('10.2.3.4'),true);
  assert.equal(valid('203.0.113.7'),false);
});

test('compressed JSON trailing bytes do not crash parsing or alter webhook rawBody', async () => {
  const app=express();
  app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf;}}));
  app.post('/',(req,res)=>res.json({parsed:req.body,rawMatches:req.rawBody.equals(Buffer.from('{"ok":true}'))}));
  app.use((err,req,res,next)=>res.status(err.status||400).json({rejected:true}));
  await serve(app,async send=>{
    const headers={'content-type':'application/json','content-encoding':'gzip'};
    const compressed=zlib.gzipSync('{"ok":true}');
    const invalid=await send(Buffer.concat([compressed,Buffer.from('invalid trailing bytes')]),headers);
    assert.ok([200,400].includes(invalid.status));
    await new Promise(resolve=>setTimeout(resolve,30));
    const valid=await send(compressed,headers);
    assert.equal(valid.status,200);
    assert.deepEqual(JSON.parse(valid.body),{parsed:{ok:true},rawMatches:true});
  });
});

test('multer pending async filter after rejection cannot crash the process', async () => {
  const app=express();
  const upload=multer({storage:multer.memoryStorage(),fileFilter:(req,file,cb)=>{
    setTimeout(()=>file.fieldname==='reject'?cb(new Error('Rejected test file')):cb(null,true),file.fieldname==='reject'?5:25);
  }});
  app.post('/',upload.any(),(req,res)=>res.json({files:req.files.length}));
  app.use((err,req,res,next)=>res.status(400).json({rejected:true}));
  const boundary='epic73d-local-test';
  const part=name=>`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="fixture.txt"\r\nContent-Type: text/plain\r\n\r\nfixture\r\n`;
  const headers={'content-type':`multipart/form-data; boundary=${boundary}`};
  await serve(app,async send=>{
    const invalid=await send(part('reject')+part('pending')+`--${boundary}--\r\n`,headers);
    assert.equal(invalid.status,400);
    await new Promise(resolve=>setTimeout(resolve,50));
    const valid=await send(part('accepted')+`--${boundary}--\r\n`,headers);
    assert.equal(valid.status,200);
    assert.equal(JSON.parse(valid.body).files,1);
  });
});

test('qs serializes comma arrays with non-callable own toString without throwing',()=>{
  assert.equal(qs.stringify({a:[{toString:1}]},{arrayFormat:'comma'}),'a=%5Bobject%20Object%5D');
  assert.equal(qs.stringify({a:['one','two']},{arrayFormat:'comma'}),'a=one%2Ctwo');
});

test('zod rejects oversized constrained arrays before validating elements',()=>{
  let visited=0;
  const schema=z.array(z.string().superRefine(()=>{visited++;})).max(2);
  const rejected=schema.safeParse(Array(100).fill('fixture'));
  assert.equal(rejected.success,false);
  assert.equal(visited,0);
  assert.equal(rejected.error.issues.length,1);
  assert.equal(schema.safeParse(['one','two']).success,true);
});
