/**
 * TIKUM — ROLE-SEPARATION & INDEPENDENT QUORUM RED-TEAM TEST SUITE
 * 
 * Verifies that the Buyer No-Show 2-of-3 Quorum and Trust Approvals cannot be bypassed
 * through aliases, duplicate user accounts, shared credentials, or collusion.
 */

const assert = require('assert');
const { state } = require('./src/database');
const { AntiConflictService } = require('./src/trust/AntiConflictService');
const { VenueOperationsService } = require('./src/venue/VenueOperationsService');

console.log('======================================================================');
console.log('TIKUM — ROLE-SEPARATION & INDEPENDENT QUORUM RED-TEAM SUITE');
console.log('======================================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  if (!state.users) state.users = [];

  // Seed test users
  const seller = { id: 'usr-red-seller', name: 'Seller User', email: 'seller@example.com', phone: '0811111111', role: 'user' };
  const buyer = { id: 'usr-red-buyer', name: 'Buyer User', email: 'buyer@example.com', phone: '0822222222', role: 'user' };
  const pic = { id: 'usr-red-pic', name: 'Field PIC', email: 'pic@tikum.app', phone: '0833333333', role: 'pic' };
  const trustOfficer = { id: 'usr-red-trust', name: 'Trust Admin', email: 'trust@tikum.app', phone: '0844444444', role: 'admin' };
  const complianceOfficer = { id: 'usr-red-compliance', name: 'Compliance Officer', email: 'compliance@tikum.app', phone: '0855555555', role: 'admin' };

  state.users.push(seller, buyer, pic, trustOfficer, complianceOfficer);

  const order = {
    id: 'ord-red-101',
    seller_user_id: seller.id,
    buyer_user_id: buyer.id,
    status: 'PAID'
  };

  // Test 1: Single individual attempts to satisfy PIC and Compliance Admin roles
  test('1. Collusion: Single user occupying both PIC and Compliance Admin roles is blocked', () => {
    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: 'usr-red-pic',
        trustAdminUserId: 'usr-red-trust',
        complianceAdminUserId: 'usr-red-pic', // SAME AS PIC!
        order
      });
    }, (err) => err.code === 'COLLUSION_PREVENTION_DUPLICATE_ROLE_SLOT');
  });

  // Test 2: Single individual attempts to satisfy Trust Admin and Compliance Admin roles
  test('2. Collusion: Single user occupying both Trust Admin and Compliance Admin roles is blocked', () => {
    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: 'usr-red-pic',
        trustAdminUserId: 'usr-red-trust',
        complianceAdminUserId: 'usr-red-trust', // SAME AS TRUST ADMIN!
        order
      });
    }, (err) => err.code === 'COLLUSION_PREVENTION_DUPLICATE_ROLE_SLOT');
  });

  // Test 3: Shared Identity / Alias account (different user ID, but identical phone/email)
  test('3. Sybil Attack: Duplicate account sharing phone or email is blocked', () => {
    const aliasPic = { id: 'usr-red-pic-alias', name: 'PIC Second Account', email: 'pic@tikum.app', phone: '0833333333', role: 'admin' };
    state.users.push(aliasPic);

    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: 'usr-red-pic',
        trustAdminUserId: 'usr-red-trust',
        complianceAdminUserId: 'usr-red-pic-alias', // Different ID, but shared email & phone!
        order
      });
    }, (err) => err.code === 'COLLUSION_PREVENTION_SHARED_IDENTITY');
  });

  // Test 4: Mutual affiliation between PIC and Trust Admin
  test('4. Internal Collusion: Declared personal/commercial affiliation between PIC and Trust Admin is blocked', () => {
    const indepPic = { id: 'usr-red-indep-pic', name: 'Indep PIC', email: 'indep.pic@tikum.app', phone: '0899999901', role: 'pic' };
    const indepTrust = { id: 'usr-red-indep-trust', name: 'Indep Trust', email: 'indep.trust@tikum.app', phone: '0899999902', role: 'admin' };
    const indepComp = { id: 'usr-red-indep-comp', name: 'Indep Comp', email: 'indep.comp@tikum.app', phone: '0899999903', role: 'admin' };
    state.users.push(indepPic, indepTrust, indepComp);

    AntiConflictService.recordDeclaredAffiliation(indepPic.id, indepTrust.id, 'Business partners');

    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: indepPic.id,
        trustAdminUserId: indepTrust.id,
        complianceAdminUserId: indepComp.id,
        order
      });
    }, (err) => err.code === 'COLLUSION_PREVENTION_MUTUAL_AFFILIATION');
  });

  // Test 5: Seller masquerades as Trust Admin
  test('5. External Collusion: Seller attempting to act as Trust Admin for own order is blocked', () => {
    const cleanPic = { id: 'usr-clean-pic-5', name: 'Clean PIC', email: 'pic5@tikum.app', phone: '0888888801', role: 'pic' };
    const cleanComp = { id: 'usr-clean-comp-5', name: 'Clean Comp', email: 'comp5@tikum.app', phone: '0888888802', role: 'admin' };
    state.users.push(cleanPic, cleanComp);

    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: cleanPic.id,
        trustAdminUserId: seller.id, // SELLER THEMSELVES!
        complianceAdminUserId: cleanComp.id,
        order
      });
    }, (err) => err.code === 'CONFLICT_OF_INTEREST_VERIFIER');
  });

  // Test 6: PIC has declared affiliation with Seller
  test('6. External Collusion: PIC affiliated with Seller is blocked from witnessing or quorum', () => {
    const cleanTrust = { id: 'usr-clean-trust-6', name: 'Clean Trust', email: 'trust6@tikum.app', phone: '0888888803', role: 'admin' };
    const cleanComp = { id: 'usr-clean-comp-6', name: 'Clean Comp', email: 'comp6@tikum.app', phone: '0888888804', role: 'admin' };
    const affiliatedPic = { id: 'usr-affil-pic-6', name: 'Affiliated PIC', email: 'pic6@tikum.app', phone: '0888888805', role: 'pic' };
    state.users.push(cleanTrust, cleanComp, affiliatedPic);

    AntiConflictService.recordDeclaredAffiliation(affiliatedPic.id, seller.id, 'Close family relation');

    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: affiliatedPic.id,
        trustAdminUserId: cleanTrust.id,
        complianceAdminUserId: cleanComp.id,
        order
      });
    }, (err) => err.code === 'CONFLICT_OF_INTEREST_PIC');
  });

  // Test 7: Compliance Officer has declared affiliation with Seller
  test('7. External Collusion: Compliance Officer affiliated with Seller is blocked from release approval', () => {
    const cleanPic = { id: 'usr-clean-pic-7', name: 'Clean PIC 7', email: 'pic7@tikum.app', phone: '0888888806', role: 'pic' };
    const cleanTrust = { id: 'usr-clean-trust-7', name: 'Clean Trust 7', email: 'trust7@tikum.app', phone: '0888888807', role: 'admin' };
    const affiliatedComp = { id: 'usr-affil-comp-7', name: 'Affiliated Comp', email: 'comp7@tikum.app', phone: '0888888808', role: 'admin' };
    state.users.push(cleanPic, cleanTrust, affiliatedComp);

    AntiConflictService.recordDeclaredAffiliation(affiliatedComp.id, seller.id, 'Commercial investor');

    assert.throws(() => {
      AntiConflictService.assertQuorumIndependence({
        picUserId: cleanPic.id,
        trustAdminUserId: cleanTrust.id,
        complianceAdminUserId: affiliatedComp.id,
        order
      });
    }, (err) => err.code === 'CONFLICT_OF_INTEREST_SETTLEMENT_APPROVER');
  });

  // Test 8: End-to-end resolveBuyerNoShow with 3 independent, distinct officers
  await asyncTest('8. Legitimate Resolution: 3 independent, non-conflicted officers successfully approve Buyer No-Show', async () => {
    const cleanPic = { id: 'usr-clean-pic-8', name: 'Independent PIC', email: 'pic8@tikum.app', phone: '0877777701', role: 'pic' };
    const cleanTrust = { id: 'usr-clean-trust-8', name: 'Independent Trust', email: 'trust8@tikum.app', phone: '0877777702', role: 'admin' };
    const cleanComp = { id: 'usr-clean-comp-8', name: 'Independent Compliance', email: 'comp8@tikum.app', phone: '0877777703', role: 'admin' };
    state.users.push(cleanPic, cleanTrust, cleanComp);

    const testOrder = {
      id: 'ord-red-888',
      seller_user_id: seller.id,
      buyer_user_id: buyer.id,
      status: 'PAID',
      assigned_pic_user_id: cleanPic.id,
      verified_by: cleanTrust.id
    };

    const res = await VenueOperationsService.resolveBuyerNoShow({
      order: testOrder,
      picUserId: cleanPic.id,
      trustAdminUserId: cleanTrust.id,
      complianceAdminUserId: cleanComp.id,
      adminApproverId: cleanComp.id,
      sellerFulfilledObligation: true,
      picConfirmedAttendance: true,
      trustComplianceApproved: true,
      waitingPeriodMinutes: 30
    });

    assert.strictEqual(res.resolution, 'BUYER_NO_SHOW_CONFIRMED');
    assert.strictEqual(res.handover_status, 'NO_SHOW_REVIEW');
    assert.strictEqual(res.settlement_status, 'ELIGIBLE_FOR_PAYOUT');
  });

  console.log('\n======================================================================');
  console.log(`ROLE-SEPARATION RED-TEAM SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
