/**
 * E2E Integration Test: Admin Activity Notifications across Business Modules
 */

const assert = require('assert');
const { emailService } = require('./src/services/emailService');
const { state } = require('./src/database');
const { MagicLinkService } = require('./src/services/magicLinkService');
const { SellerTrustService } = require('./src/trust/SellerTrustService');
const { ListingService } = require('./src/services/listingService');
const { EscrowService } = require('./src/services/escrowService');

async function runE2E() {
  console.log('--- STARTING E2E NOTIFICATION HOOKS INTEGRATION TEST ---');

  const capturedNotifications = [];
  const origSendEmail = emailService.sendEmail.bind(emailService);
  emailService.sendEmail = async (params) => {
    capturedNotifications.push(params);
    return { success: true, messageId: `msg-${Date.now()}` };
  };

  // 1. Auth Hook Test
  console.log('Testing Auth Magic Link Verification Notification...');
  const userEmail = `e2e-user-${Date.now()}@test.com`;
  let token = null;
  MagicLinkService.setTestMailSink(({ rawToken }) => {
    token = rawToken;
  });
  const mlRes = await MagicLinkService.requestMagicLink({ email: userEmail });
  assert(mlRes.success, 'Magic link request should succeed');
  assert(token, 'Token must exist');

  const verifyRes = await MagicLinkService.verifyMagicLink({ token });
  assert(verifyRes.user, 'Verification must return user');

  // Let fire-and-forget notification settle
  await new Promise(r => setTimeout(r, 200));

  const authNotifs = capturedNotifications.filter(n => n.subject.includes('USER_REGISTERED') || n.subject.includes('Pendaftaran Akun'));
  assert(authNotifs.length > 0, 'USER_REGISTERED notification should be emitted');
  assert(authNotifs[0].subject.includes('[TIKUM][HIGH]'), 'Priority should be HIGH');
  assert(authNotifs[0].to.includes('admin@tikum.app'), 'Must target admin@tikum.app');
  assert(authNotifs[0].to.includes('support@tikum.app'), 'Must target support@tikum.app');
  console.log('  ✓ Auth registration notification verified');

  // 2. Seller KYC Onboarding Test
  console.log('Testing Seller KYC Submission Notification...');
  const testSellerId = verifyRes.user.id;
  await SellerTrustService.submitOnboarding({
    userId: testSellerId,
    displayName: 'E2E Test Seller',
    nik: '3171000000000001',
    whatsapp: '081234567890',
    instagram: '@e2eseller',
    idCardScanUrl: 'https://storage.tikum.app/ktp.jpg',
    selfieWithIdUrl: 'https://storage.tikum.app/selfie.jpg',
    ticketAccountProofUrl: 'https://storage.tikum.app/proof.jpg'
  });

  await new Promise(r => setTimeout(r, 200));
  const sellerNotifs = capturedNotifications.filter(n => n && typeof n.subject === 'string' && (n.subject.includes('SELLER_PROFILE_SUBMITTED') || n.subject.includes('Profil Penjual')));
  assert(sellerNotifs.length > 0, 'SELLER_PROFILE_SUBMITTED notification should be emitted');
  assert(sellerNotifs[0].subject.includes('[TIKUM][HIGH]'), 'Priority should be HIGH');
  console.log('  ✓ Seller onboarding notification verified');

  // 3. Escrow Order & Payment Test
  console.log('Testing Escrow Order Creation Notification...');
  // Setup a test ticket & listing
  const listingId = `lst-e2e-${Date.now()}`;
  const orderId = `ord-e2e-${Date.now()}`;
  state.listings.push({
    id: listingId,
    listing_id: listingId,
    seller_id: testSellerId,
    event_id: 'event-1',
    price: 350000,
    status: 'ACTIVE'
  });
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  state.events.push({
    id: 'event-1',
    name: 'Konser E2E Test',
    date: futureDate
  });

  state.users.push({
    id: 'usr-buyer-e2e',
    name: 'E2E Buyer',
    email: 'buyer@test.com',
    role: 'buyer'
  });

  const orderRes = await EscrowService.createOrder({
    orderId,
    ticketId: `tkt-e2e-${Date.now()}`,
    buyerId: 'usr-buyer-e2e',
    sellerId: testSellerId,
    listingId,
    eventId: 'event-1',
    totalAmount: 350000
  });

  assert(orderRes.order, 'Order must be created');
  await new Promise(r => setTimeout(r, 200));

  const orderNotifs = capturedNotifications.filter(n => n && typeof n.subject === 'string' && (n.subject.includes('BUYER_ORDER_CREATED') || n.subject.includes('Pesanan Tiket Baru')));
  assert(orderNotifs.length > 0, 'BUYER_ORDER_CREATED notification should be emitted');
  assert(orderNotifs[0].subject.includes('[TIKUM][HIGH]'), 'Priority should be HIGH');
  console.log('  ✓ Escrow order notification verified');

  // Restore
  emailService.sendEmail = origSendEmail;
  console.log('\n--- ALL E2E NOTIFICATION HOOKS PASSED ---\n');
}

runE2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
