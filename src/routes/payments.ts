import { Router } from 'express';
import { createHash } from 'crypto';
import { v4 as randomUUID } from 'uuid';
import { DB } from '../db/database';
import { Payment, PaymentEvent } from '../types';
import { createPaymentSchema } from '../validators';

export function paymentsRouter(db: DB): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { clinicId, status } = req.query;

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

    const payments = db.prepare(query).all(...params) as Payment[];
    return res.json(payments);
  });

  router.post('/', (req, res) => {
    const result = createPaymentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.format() });
    }

    const { clinicId, amountCents, currency, idempotencyKey } = result.data;

    const requestHash = createHash('sha256')
      .update(JSON.stringify({ clinicId, amountCents, currency, idempotencyKey }))
      .digest('hex');

    const existing = db
      .prepare('SELECT * FROM payments WHERE idempotencyKey = ?')
      .get(idempotencyKey) as Payment | undefined;

    if (existing) {
      if (existing.requestHash === requestHash) {
        return res.status(200).json(existing);
      }
      return res.status(409).json({ error: 'Idempotency key conflict: payload mismatch' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO payments (id, clinicId, idempotencyKey, requestHash, amountCents, currency, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, clinicId, idempotencyKey, requestHash, amountCents, currency, now);

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment;
    return res.status(201).json(payment);
  });

  router.get('/:id', (req, res) => {
    const payment = db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(req.params.id) as Payment | undefined;

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const statusHistory = db
      .prepare('SELECT * FROM payment_events WHERE paymentId = ? ORDER BY createdAt ASC')
      .all(req.params.id) as PaymentEvent[];

    const { total: totalCaptured } = db
      .prepare(
        `SELECT COALESCE(SUM(amountCents), 0) as total
         FROM webhook_events WHERE paymentId = ? AND eventType = 'payment.captured'`
      )
      .get(req.params.id) as { total: number };

    const { total: totalRefunded } = db
      .prepare(
        `SELECT COALESCE(SUM(amountCents), 0) as total
         FROM webhook_events WHERE paymentId = ? AND eventType = 'payment.refunded'`
      )
      .get(req.params.id) as { total: number };

    return res.json({ ...payment, totalCaptured, totalRefunded, statusHistory });
  });

  return router;
}
