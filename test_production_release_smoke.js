/**
 * test_production_release_smoke.js
 * Comprehensive live smoke test verifying deployment at https://tikum.app
 */

const https = require('https');

const TARGET_URL = process.env.TARGET_URL || 'https://tikum.app';

function testEndpoint(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET_URL);
    const reqOpts = {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'TikumSmokeTest/1.0',
        ...(options.headers || {})
      }
    };

    const req = https.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runProductionSmoke() {
  console.log(`\n=============================================================`);
  console.log(`  TIKUM LIVE PRODUCTION SMOKE TESTS`);
  console.log(`  Target: ${TARGET_URL}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`=============================================================\n`);

  const checks = [
    {
      name: '1. Health Check (GET /health)',
      run: async () => {
        const res = await testEndpoint('/health');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        console.log(`  ✓ Health status 200 OK`);
      }
    },
    {
      name: '2. Homepage Live (GET /)',
      run: async () => {
        const res = await testEndpoint('/');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.includes('TIKUM')) throw new Error('Homepage missing TIKUM branding');
        console.log(`  ✓ Homepage live (200 OK, TIKUM verified branding present)`);
      }
    },
    {
      name: '3. Create Listing Page (GET /create)',
      run: async () => {
        const res = await testEndpoint('/create');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.includes('ticketQuantity')) throw new Error('Missing ticketQuantity in /create');
        if (!res.body.includes('TIKUM_VENUE_PIC')) throw new Error('Missing TIKUM_VENUE_PIC in /create');
        if (!res.body.includes('SELLER_MANAGED')) throw new Error('Missing SELLER_MANAGED in /create');
        console.log(`  ✓ Create Listing UI live with Quantity (1-4) & Fulfillment options`);
      }
    },
    {
      name: '4. Buyer Dashboard HTML (GET /app/buyer)',
      run: async () => {
        const res = await testEndpoint('/app/buyer');
        // Unauthenticated browser request redirects to /login?redirect=...
        if (res.status !== 302 && res.status !== 200 && res.status !== 401) {
          throw new Error(`Unexpected status ${res.status}`);
        }
        console.log(`  ✓ Buyer dashboard route active (status: ${res.status})`);
      }
    },
    {
      name: '5. Seller Dashboard HTML (GET /app/seller)',
      run: async () => {
        const res = await testEndpoint('/app/seller');
        if (res.status !== 302 && res.status !== 200 && res.status !== 401) {
          throw new Error(`Unexpected status ${res.status}`);
        }
        console.log(`  ✓ Seller dashboard route active (status: ${res.status})`);
      }
    },
    {
      name: '6. Admin Dashboard HTML (GET /admin)',
      run: async () => {
        const res = await testEndpoint('/admin');
        if (res.status !== 302 && res.status !== 200 && res.status !== 401) {
          throw new Error(`Unexpected status ${res.status}`);
        }
        console.log(`  ✓ Admin dashboard route active (status: ${res.status})`);
      }
    },
    {
      name: '7. API Buyer Dashboard Auth Protection (GET /api/dashboard/buyer)',
      run: async () => {
        const res = await testEndpoint('/api/dashboard/buyer', { headers: { Accept: 'application/json' } });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ GET /api/dashboard/buyer requires authentication (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '8. API Seller Dashboard Auth Protection (GET /api/dashboard/seller)',
      run: async () => {
        const res = await testEndpoint('/api/dashboard/seller', { headers: { Accept: 'application/json' } });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ GET /api/dashboard/seller requires authentication (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '9. API Admin Overview Auth Protection (GET /api/admin/overview)',
      run: async () => {
        const res = await testEndpoint('/api/admin/overview', { headers: { Accept: 'application/json' } });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ GET /api/admin/overview requires authentication (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '10. Header Role Spoofing Rejected (x-user-role: ADMIN)',
      run: async () => {
        const res = await testEndpoint('/api/admin/overview', {
          headers: {
            Accept: 'application/json',
            'x-user-role': 'ADMIN',
            'x-role': 'ADMIN'
          }
        });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ Role spoofing via headers strictly rejected (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '11. API PIC My-Events Auth Protection (GET /api/mvp/pic/my-events)',
      run: async () => {
        const res = await testEndpoint('/api/mvp/pic/my-events', { headers: { Accept: 'application/json' } });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ GET /api/mvp/pic/my-events requires authentication (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '12. API Seller Listing Creation Auth Protection (POST /api/mvp/seller/listing)',
      run: async () => {
        const res = await testEndpoint('/api/mvp/seller/listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: { quantity: 2, fulfillmentType: 'TIKUM_VENUE_PIC' }
        });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        console.log(`  ✓ POST /api/mvp/seller/listing requires authentication (401 AUTH_REQUIRED)`);
      }
    },
    {
      name: '13. API Buyer Order Placement Auth Protection (POST /api/mvp/buyer/order)',
      run: async () => {
        const res = await testEndpoint('/api/mvp/buyer/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: { buyerId: 'unknown-buyer-smoke', listingId: 'any-listing-id', quantity: 2 }
        });
        if (res.status !== 401 && res.status !== 403) throw new Error(`Expected 401 or 403, got ${res.status}`);
        console.log(`  ✓ POST /api/mvp/buyer/order requires authentication (${res.status} ${res.status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN'})`);
      }
    },
    {
      name: '14. Frontend Pricing Script Loaded (GET /js/pricing.js)',
      run: async () => {
        const res = await testEndpoint('/js/pricing.js');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.includes('calculatePricing')) throw new Error('Missing calculatePricing in pricing.js');
        console.log(`  ✓ Pricing calculation bundle live (200 OK)`);
      }
    },
    {
      name: '15. Sitemap Live (GET /sitemap.xml)',
      run: async () => {
        const res = await testEndpoint('/sitemap.xml');
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.includes('https://tikum.app')) throw new Error('Invalid sitemap content');
        console.log(`  ✓ Sitemap XML live (200 OK)`);
      }
    }
  ];

  let passed = 0;
  for (const check of checks) {
    try {
      await check.run();
      passed++;
    } catch (err) {
      console.error(`  ❌ ${check.name} FAILED:`, err.message);
      process.exit(1);
    }
  }

  console.log(`\n=============================================================`);
  console.log(`  ALL ${passed}/${checks.length} PRODUCTION SMOKE CHECKS PASSED (100% SUCCESS)`);
  console.log(`  Production live URL: https://tikum.app verified!`);
  console.log(`=============================================================\n`);
}

runProductionSmoke().catch(err => {
  console.error('Smoke tests failed:', err);
  process.exit(1);
});
