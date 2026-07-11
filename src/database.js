const path = require('path');
const fs = require('fs');

// Global in-memory state mimicking SQLite database tables
const state = {
  users: [],
  events: [],
  tickets: [],
  ticket_events: [],
  evidence_bundles: [],
  transfers: [],
  escrows: [],
  audit_logs: []
};

// Seed initial dataset
state.users.push({ id: 'admin-1', name: 'Trust Officer ARGUS', phone: '081234567890', role: 'admin' });
state.users.push({ id: 'seller-1', name: 'Budi Santoso (Seller)', phone: '082223334445', role: 'user' });
state.users.push({ id: 'buyer-1', name: 'Dewi Lestari (Buyer)', phone: '085556667778', role: 'user' });

state.events.push({
  id: 'event-coldplay',
  title: 'Coldplay Music of the Spheres',
  date: '2026-11-15',
  venue: 'Gelora Bung Karno',
  category: 'CAT 1 - West'
});

state.tickets.push({
  id: 'ticket-demo-1',
  event_id: 'event-coldplay',
  current_owner_id: 'seller-1',
  status: 'LISTED',
  seat_info: 'Row H, Seat 12',
  price: 1500000
});

state.ticket_events.push({
  sequence_id: 1,
  id: 'evt-seed-1',
  ticket_id: 'ticket-demo-1',
  event_type: 'TicketCreated',
  actor_id: 'seller-1',
  metadata: JSON.stringify({ seat_info: 'Row H, Seat 12', price: 1500000 })
});

state.ticket_events.push({
  sequence_id: 2,
  id: 'evt-seed-2',
  ticket_id: 'ticket-demo-1',
  event_type: 'OwnershipAssigned',
  actor_id: 'seller-1',
  metadata: JSON.stringify({ assigned_to: 'seller-1' })
});

state.audit_logs.push({
  id: 1,
  entity_type: 'TICKET',
  entity_id: 'ticket-demo-1',
  action: 'CREATED',
  performed_by: 'seller-1',
  metadata: JSON.stringify({ reason: 'Initial seed generation' })
});

let seqId = 3;
let logId = 2;

// Dummy connection object
const db = {
  serialize: (callback) => callback()
};

/**
 * Execute write/modification queries.
 */
async function run(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  // Enforce ADR-003 and Invariant 6: Prevent UPDATE/DELETE on audit_logs
  if (clean.toUpperCase().includes('UPDATE AUDIT_LOGS') || clean.toUpperCase().includes('DELETE FROM AUDIT_LOGS')) {
    throw new Error('Updates on audit_logs are prohibited by ADR-003 / Invariant 6');
  }

  // Enforce ADR-011: Prevent UPDATE/DELETE on ticket_events
  if (clean.toUpperCase().includes('UPDATE TICKET_EVENTS') || clean.toUpperCase().includes('DELETE FROM TICKET_EVENTS')) {
    throw new Error('Updates on ticket_events are prohibited by ADR-011 / Invariant 10');
  }

  // 1. INSERT INTO tickets
  if (clean.includes('INSERT OR IGNORE INTO tickets') || clean.includes('INSERT INTO tickets')) {
    const id = params[0];
    const event_id = params[1];
    const current_owner_id = params[2];
    const seat_info = params[3];
    const price = params[4];
    if (!state.tickets.find(t => t.id === id)) {
      state.tickets.push({
        id,
        event_id,
        current_owner_id,
        status: params[5] || 'LISTED',
        seat_info,
        price
      });
    }
    return { lastID: id, changes: 1 };
  }

  // 2. INSERT INTO ticket_events
  if (clean.includes('INSERT INTO ticket_events')) {
    const id = params[0];
    const ticket_id = params[1];
    const event_type = params[2];
    const actor_id = params[3];
    const metadata = params[4];
    state.ticket_events.push({
      sequence_id: seqId++,
      id,
      ticket_id,
      event_type,
      actor_id,
      metadata
    });
    return { lastID: seqId, changes: 1 };
  }

  // 3. INSERT INTO transfers
  if (clean.includes('INSERT INTO transfers')) {
    const id = params[0];
    const ticket_id = params[1];
    const seller_id = params[2];
    const buyer_id = params[3];
    const price = params[4];
    const unique_code = params[5];
    const status = params[6] || 'PENDING_PAYMENT';
    state.transfers.push({
      id,
      ticket_id,
      seller_id,
      buyer_id,
      price,
      unique_code,
      status
    });
    return { lastID: id, changes: 1 };
  }

  // 4. INSERT INTO evidence_bundles
  if (clean.includes('INSERT INTO evidence_bundles')) {
    const id = params[0];
    const ticket_id = params[1];
    const uploader_id = params[2];
    const bundle_hash = params[3];
    const files_json = params[4];
    state.evidence_bundles.push({
      id,
      ticket_id,
      uploader_id,
      bundle_hash,
      files_json,
      uploaded_at: new Date().toISOString()
    });
    return { lastID: id, changes: 1 };
  }

  // 5. UPDATE tickets status
  if (clean.includes('UPDATE tickets SET status = ? WHERE id = ?')) {
    const status = params[0];
    const id = params[1];
    const ticket = state.tickets.find(t => t.id === id);
    if (ticket) ticket.status = status;
    return { changes: 1 };
  }

  // 6. UPDATE tickets status & owner
  if (clean.includes('UPDATE tickets SET status = ?, current_owner_id = ? WHERE id = ?')) {
    const status = params[0];
    const current_owner_id = params[1];
    const id = params[2];
    const ticket = state.tickets.find(t => t.id === id);
    if (ticket) {
      ticket.status = status;
      ticket.current_owner_id = current_owner_id;
    }
    return { changes: 1 };
  }

  // 7. UPDATE transfers status
  if (clean.includes('UPDATE transfers SET status = ? WHERE id = ?')) {
    const status = params[0];
    const id = params[1];
    const transfer = state.transfers.find(t => t.id === id);
    if (transfer) transfer.status = status;
    return { changes: 1 };
  }

  // 8. INSERT INTO audit_logs
  if (clean.includes('INSERT INTO audit_logs')) {
    const entity_type = params[0];
    const entity_id = params[1];
    const action = params[2];
    const performed_by = params[3];
    const metadata = params[4];
    state.audit_logs.push({
      id: logId++,
      entity_type,
      entity_id,
      action,
      performed_by,
      metadata
    });
    return { lastID: logId, changes: 1 };
  }

  // 9. INSERT OR IGNORE INTO users
  if (clean.includes('INSERT OR IGNORE INTO users')) {
    const id = params[0];
    const name = params[1];
    const phone = params[2];
    const role = params[3] || 'user';
    if (!state.users.find(u => u.id === id)) {
      state.users.push({ id, name, phone, role });
    }
    return { lastID: id, changes: 1 };
  }

  // 10. INSERT OR IGNORE INTO events
  if (clean.includes('INSERT OR IGNORE INTO events')) {
    const id = params[0];
    const title = params[1];
    const date = params[2];
    const venue = params[3];
    const category = params[4];
    if (!state.events.find(e => e.id === id)) {
      state.events.push({ id, title, date, venue, category });
    }
    return { lastID: id, changes: 1 };
  }

  return { changes: 0 };
}

/**
 * Fetch single row queries.
 */
async function get(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  if (clean.includes('SELECT COUNT(*) as count FROM users')) {
    return { count: state.users.length };
  }
  if (clean.includes('SELECT * FROM users WHERE id = ?')) {
    return state.users.find(u => u.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM events WHERE id = ?')) {
    return state.events.find(e => e.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM tickets WHERE id = ?')) {
    return state.tickets.find(t => t.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM transfers WHERE id = ?')) {
    return state.transfers.find(t => t.id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE ticket_id = ?') && clean.includes('ORDER BY uploaded_at DESC LIMIT 1')) {
    const filtered = state.evidence_bundles.filter(eb => eb.ticket_id === params[0]);
    if (filtered.length === 0) return null;
    return filtered[filtered.length - 1];
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE ticket_id = ?')) {
    return state.evidence_bundles.find(eb => eb.ticket_id === params[0]) || null;
  }
  if (clean.includes('SELECT * FROM evidence_bundles WHERE id = ?')) {
    return state.evidence_bundles.find(eb => eb.id === params[0]) || null;
  }

  return null;
}

/**
 * Fetch multiple row queries.
 */
async function all(sql, params = []) {
  const clean = sql.trim().replace(/\s+/g, ' ');

  if (clean.includes('SELECT * FROM ticket_events WHERE ticket_id = ?')) {
    return state.ticket_events
      .filter(te => te.ticket_id === params[0])
      .sort((a, b) => a.sequence_id - b.sequence_id);
  }
  if (clean.includes('SELECT * FROM transfers')) {
    return state.transfers;
  }
  if (clean.includes('SELECT t.*') && clean.includes('FROM tickets t')) {
    const results = [];
    for (const ticket of state.tickets) {
      if (['LISTED', 'RESERVED', 'ESCROW_PAID'].includes(ticket.status)) {
        const event = state.events.find(e => e.id === ticket.event_id) || {};
        const bundle = state.evidence_bundles.find(eb => eb.ticket_id === ticket.id) || {};
        results.push({
          id: ticket.id,
          event_id: ticket.event_id,
          current_owner_id: ticket.current_owner_id,
          status: ticket.status,
          seat_info: ticket.seat_info,
          price: ticket.price,
          created_at: ticket.created_at || new Date().toISOString(),
          event_title: event.title || '',
          event_date: event.date || '',
          event_venue: event.venue || '',
          bundle_id: bundle.id || null,
          bundle_hash: bundle.bundle_hash || null,
          files_json: bundle.files_json || null
        });
      }
    }
    return results;
  }

  return [];
}

/**
 * Mock database initialization (already pre-seeded in JS state).
 */
async function initializeDatabase() {
  return Promise.resolve();
}

module.exports = {
  db,
  run,
  all,
  get,
  initializeDatabase
};
