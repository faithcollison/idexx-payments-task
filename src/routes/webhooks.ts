import { Router } from 'express';
import { v4 as randomUUID } from 'uuid';
import { DB } from '../db/database';
import { Payment, PaymentStatus, WebhookEventType } from '../types';
import { webhookPayloadSchema } from '../validators';
import { getNextStatus } from '../transitions';

export function webhooksRouter(db: DB): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const result = webhookPayloadSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.format() });
    }

    const { eventId, paymentId, type, amountCents } = result.data;

    // Idempotent: duplicate eventId is a no-op
    const existingEvent = db
      .prepare('SELECT eventId FROM webhook_events WHERE eventId = ?')
      .get(eventId);
    if (existingEvent) {
      return res.status(200).json({ message: 'Event already processed' });
    }

    const payment = db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(paymentId) as Payment | undefined;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const nextStatus = getNextStatus(payment.status as PaymentStatus, type as WebhookEventType);
    if (!nextStatus) {
      return res.status(422).json({
        error: `Invalid transition: cannot apply ${type} to a payment with status '${payment.status}'`,
      });
    }

    if (type === 'payment.refunded') {
      if (amountCents === undefined) {
        return res.status(400).json({ error: 'amountCents is required for refund events' });
      }

      const { totalCaptured } = db
        .prepare(
          `SELECT COALESCE(SUM(amountCents), 0) as totalCaptured
           FROM ledger_entries WHERE paymentId = ? AND eventType = 'captured'`
        )
        .get(paymentId) as { totalCaptured: number };

      const { totalRefunded } = db
        .prepare(
          `SELECT COALESCE(SUM(amountCents), 0) as totalRefunded
           FROM ledger_entries WHERE paymentId = ? AND eventType = 'refunded'`
        )
        .get(paymentId) as { totalRefunded: number };

      if (totalRefunded + amountCents > totalCaptured) {
        return res.status(422).json({
          error: `Refund of ${amountCents} would exceed available captured amount (captured: ${totalCaptured}, already refunded: ${totalRefunded})`,
        });
      }
    }

    const captureAmount = amountCents ?? payment.amountCents;

    db.transaction(() => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO webhook_events (eventId, paymentId, eventType, amountCents, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, paymentId, type, amountCents ?? null, now);

      db.prepare(`
        INSERT INTO payment_events (id, paymentId, fromStatus, toStatus, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), paymentId, payment.status, nextStatus, now);

      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(nextStatus, paymentId);

      if (type === 'payment.captured' || type === 'payment.refunded') {
        const ledgerType = type === 'payment.captured' ? 'captured' : 'refunded';
        const ledgerAmount = type === 'payment.captured' ? captureAmount : amountCents!;
        db.prepare(`
          INSERT INTO ledger_entries (id, paymentId, clinicId, eventType, amountCents, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), paymentId, payment.clinicId, ledgerType, ledgerAmount, now);
      }
    })();

    return res.status(200).json({ message: 'Event processed successfully' });
  });

  return router;
}
