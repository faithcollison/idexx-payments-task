import { DB } from '../db/database';
import { Payment, PaymentEvent } from '../types';

export function getPayments(db: DB, clinicId?: string, status?: string): Payment[] {
  let query = 'SELECT * FROM payments WHERE 1=1';
  const params: unknown[] = [];
  if (clinicId) {
    query += ' AND clinicId = ?';
    params.push(clinicId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  return db.prepare(query).all(...params) as Payment[];
}

export function getPaymentById(db: DB, id: string): Payment | undefined {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment | undefined;
}

export function getPaymentByIdempotencyKey(db: DB, key: string): Payment | undefined {
  return db.prepare('SELECT * FROM payments WHERE idempotencyKey = ?').get(key) as Payment | undefined;
}

export function createPayment(
  db: DB,
  id: string,
  clinicId: string,
  idempotencyKey: string,
  requestHash: string,
  amountCents: number,
  currency: string,
  now: string
): void {
  db.prepare(`
    INSERT INTO payments (id, clinicId, idempotencyKey, requestHash, amountCents, currency, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, clinicId, idempotencyKey, requestHash, amountCents, currency, now);
}

export function getPaymentStatusHistory(db: DB, paymentId: string): PaymentEvent[] {
  return db.prepare('SELECT * FROM payment_events WHERE paymentId = ? ORDER BY createdAt ASC').all(paymentId) as PaymentEvent[];
}

export function getTotalCapturedForPayment(db: DB, paymentId: string): number {
  const { total } = db.prepare(
    `SELECT COALESCE(SUM(amountCents), 0) as total FROM ledger_entries WHERE paymentId = ? AND eventType = 'captured'`
  ).get(paymentId) as { total: number };
  return total;
}

export function getTotalRefundedForPayment(db: DB, paymentId: string): number {
  const { total } = db.prepare(
    `SELECT COALESCE(SUM(amountCents), 0) as total FROM ledger_entries WHERE paymentId = ? AND eventType = 'refunded'`
  ).get(paymentId) as { total: number };
  return total;
}
