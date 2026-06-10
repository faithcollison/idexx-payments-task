import { DB } from './database';

export function initSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      clinicId TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL UNIQUE,
      requestHash TEXT NOT NULL,
      amountCents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL REFERENCES payments(id),
      fromStatus TEXT NOT NULL,
      toStatus TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      eventId TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL REFERENCES payments(id),
      eventType TEXT NOT NULL,
      amountCents INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL REFERENCES payments(id),
      clinicId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      amountCents INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
