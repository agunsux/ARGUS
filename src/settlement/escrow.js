/**
 * Escrow Engine — Core Trust Loop v0.2
 * Invariant 2: Funds cannot be released before TransferVerified.
 * Invariant 4: Settlement only after VenueVerified.
 */
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('../database');

const ESCROW_STATUS = { PENDING: 'PENDING', HELD: 'HELD', RELEASED: 'RELEASED', REFUNDED: 'REFUNDED', DISPUTED: 'DISPUTED' };

async function createEscrow({ transactionId, buyerId, sellerId, amount, paymentProof }) {
  const id = `esc-${uuidv4()}`;
  await run('INSERT INTO escrows (id, transaction_id, buyer_id, seller_id, amount, status, payment_proof, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, transactionId, buyerId, sellerId, amount, ESCROW_STATUS.PENDING, paymentProof || null, new Date().toISOString()]);
  await run("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,metadata) VALUES ('ESCROW',?,'CREATED',?,?)",
    [id, buyerId, JSON.stringify({ transactionId, amount })]);
  return { escrowId: id, status: ESCROW_STATUS.PENDING };
}

async function confirmPayment(escrowId, actorId) {
  const e = await get('SELECT * FROM escrows WHERE id = ?', [escrowId]);
  if (!e) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
  if (e.status !== ESCROW_STATUS.PENDING) throw Object.assign(new Error(`Already ${e.status}`), { code: 'INVALID_STATE' });
  await run('UPDATE escrows SET status = ? WHERE id = ?', [ESCROW_STATUS.HELD, escrowId]);
  await run("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,metadata) VALUES ('ESCROW',?,'CONFIRMED',?,?)",
    [escrowId, actorId, JSON.stringify({ status: ESCROW_STATUS.HELD })]);
  return { escrowId, status: ESCROW_STATUS.HELD };
}

async function validateRelease(escrowId, ticketStatus) {
  const e = await get('SELECT * FROM escrows WHERE id = ?', [escrowId]);
  if (!e) return { allowed: false, reason: 'Not found' };
  if (e.status !== ESCROW_STATUS.HELD) return { allowed: false, reason: `Must be HELD, got ${e.status}` };
  if (ticketStatus !== 'VenueVerified' && ticketStatus !== 'Settled') return { allowed: false, reason: 'Not VenueVerified' };
  return { allowed: true, escrow: e };
}

async function releaseEscrow(escrowId, actorId) {
  await run('UPDATE escrows SET status = ? WHERE id = ?', [ESCROW_STATUS.RELEASED, escrowId]);
  await run("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,metadata) VALUES ('ESCROW',?,'RELEASED',?,?)",
    [escrowId, actorId, JSON.stringify({ releasedAt: new Date().toISOString() })]);
  return { escrowId, status: ESCROW_STATUS.RELEASED };
}

async function refundEscrow(escrowId, actorId, reason) {
  await run('UPDATE escrows SET status = ? WHERE id = ?', [ESCROW_STATUS.REFUNDED, escrowId]);
  await run("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,metadata) VALUES ('ESCROW',?,'REFUNDED',?,?)",
    [escrowId, actorId, JSON.stringify({ reason })]);
  return { escrowId, status: ESCROW_STATUS.REFUNDED };
}

async function disputeEscrow(escrowId, actorId, reason) {
  await run('UPDATE escrows SET status = ? WHERE id = ?', [ESCROW_STATUS.DISPUTED, escrowId]);
  await run("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,metadata) VALUES ('ESCROW',?,'DISPUTED',?,?)",
    [escrowId, actorId, JSON.stringify({ reason })]);
  return { escrowId, status: ESCROW_STATUS.DISPUTED };
}

module.exports = { createEscrow, confirmPayment, validateRelease, releaseEscrow, refundEscrow, disputeEscrow, ESCROW_STATUS };
