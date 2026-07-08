const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'argus_ledger.db');
const db = new sqlite3.Database(dbPath);

// Helper to run SQL queries as Promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper to fetch multiple rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper to fetch a single row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initializeDatabase() {
  // Create tables if they do not exist
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT CHECK(role IN ('user', 'admin')) DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      venue TEXT NOT NULL,
      category TEXT NOT NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      event_id TEXT REFERENCES events(id),
      current_owner_id TEXT REFERENCES users(id),
      status TEXT CHECK(status IN ('LISTED', 'VERIFIED', 'RESERVED', 'ESCROW_PAID', 'TRANSFERRED', 'REDEEMED', 'REJECTED', 'DISPUTED')) DEFAULT 'LISTED',
      seat_info TEXT NOT NULL,
      price INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      ticket_id TEXT REFERENCES tickets(id),
      event_type TEXT CHECK(event_type IN ('TicketCreated', 'OwnershipAssigned', 'TransferRequested', 'VerificationPassed', 'VerificationFailed', 'SettlementCompleted', 'OwnershipTransferred', 'Redeemed', 'Disputed')),
      actor_id TEXT REFERENCES users(id),
      metadata TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS evidence_bundles (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id),
      uploader_id TEXT REFERENCES users(id),
      bundle_hash TEXT NOT NULL,
      files_json TEXT NOT NULL, -- JSON string of file paths & sizes
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      ticket_id TEXT REFERENCES tickets(id),
      seller_id TEXT REFERENCES users(id),
      buyer_id TEXT REFERENCES users(id),
      price INTEGER NOT NULL,
      unique_code INTEGER NOT NULL,
      status TEXT CHECK(status IN ('PENDING_PAYMENT', 'ESCROW_HELD', 'TRANSFERRED', 'SETTLED', 'DISPUTED')) DEFAULT 'PENDING_PAYMENT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT REFERENCES users(id),
      metadata TEXT NOT NULL, -- JSON string
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Enforce ADR-003 and Invariant 6: Prevent UPDATE and DELETE on audit_logs
  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(FAIL, 'Updates on audit_logs are prohibited by ADR-003 / Invariant 6');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(FAIL, 'Deletions on audit_logs are prohibited by ADR-003 / Invariant 6');
    END;
  `);

  // Enforce ADR-011: Prevent UPDATE and DELETE on ticket_events
  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_ticket_events_update BEFORE UPDATE ON ticket_events
    BEGIN
      SELECT RAISE(FAIL, 'Updates on ticket_events are prohibited by ADR-011 / Invariant 10');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS prevent_ticket_events_delete BEFORE DELETE ON ticket_events
    BEGIN
      SELECT RAISE(FAIL, 'Deletions on ticket_events are prohibited by ADR-011 / Invariant 10');
    END;
  `);

  // Seed Data if empty
  const userCount = await get(`SELECT COUNT(*) as count FROM users`);
  if (userCount.count === 0) {
    console.log('Seeding initial data...');
    // Admins
    await run(`INSERT INTO users (id, name, phone, role) VALUES ('admin-1', 'Trust Officer ARGUS', '081234567890', 'admin')`);
    
    // Regular users
    await run(`INSERT INTO users (id, name, phone, role) VALUES ('seller-1', 'Budi Santoso (Seller)', '082223334445', 'user')`);
    await run(`INSERT INTO users (id, name, phone, role) VALUES ('buyer-1', 'Dewi Lestari (Buyer)', '085556667778', 'user')`);

    // Concert event
    await run(`
      INSERT INTO events (id, title, date, venue, category) 
      VALUES ('event-coldplay', 'Coldplay Music of the Spheres', '2026-11-15', 'Gelora Bung Karno', 'CAT 1 - West')
    `);

    // Seed an initial ticket
    const ticketId = 'ticket-demo-1';
    await run(`
      INSERT INTO tickets (id, event_id, current_owner_id, status, seat_info, price)
      VALUES (?, 'event-coldplay', 'seller-1', 'LISTED', 'Row H, Seat 12', 1500000)
    `, [ticketId]);

    // Insert history events for seeding
    await run(`
      INSERT INTO ticket_events (id, ticket_id, event_type, actor_id, metadata)
      VALUES ('evt-seed-1', ?, 'TicketCreated', 'seller-1', ?)
    `, [ticketId, JSON.stringify({ seat_info: 'Row H, Seat 12', price: 1500000 })]);

    await run(`
      INSERT INTO ticket_events (id, ticket_id, event_type, actor_id, metadata)
      VALUES ('evt-seed-2', ?, 'OwnershipAssigned', 'seller-1', ?)
    `, [ticketId, JSON.stringify({ assigned_to: 'seller-1' })]);

    // Insert audit log
    await run(`
      INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, metadata)
      VALUES ('TICKET', ?, 'CREATED', 'seller-1', ?)
    `, [ticketId, JSON.stringify({ reason: 'Initial seed generation' })]);
  }
}

module.exports = {
  db,
  run,
  all,
  get,
  initializeDatabase,
  dbPath
};
