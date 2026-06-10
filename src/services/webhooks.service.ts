import { v4 as randomUUID } from "uuid";
import { DB } from "../db/database";
import { PaymentStatus } from "../types";

export function getWebhookEvent(
  db: DB,
  eventId: string,
): { id: string } | undefined {
  return db
    .prepare("SELECT id FROM webhook_events WHERE id = ?")
    .get(eventId) as { id: string } | undefined;
}

export function processWebhookEvent(
  db: DB,
  params: {
    id: string;
    paymentId: string;
    eventType: string;
    currentStatus: string;
    clinicId: string;
    nextStatus: PaymentStatus;
    refundAmountCents?: number;
  },
): void {
  const { id, paymentId, eventType, currentStatus, clinicId, nextStatus, refundAmountCents } = params;

  db.transaction(() => {
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO webhook_events (id, paymentId, eventType, createdAt) VALUES (?, ?, ?, ?)`,
    ).run(id, paymentId, eventType, now);

    db.prepare(
      `INSERT INTO payment_events (id, paymentId, fromStatus, toStatus, createdAt) VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), paymentId, currentStatus, nextStatus, now);

    db.prepare("UPDATE payments SET status = ? WHERE id = ?").run(nextStatus, paymentId);

    if (eventType === "payment.captured") {
      const { amountCents } = db
        .prepare("SELECT amountCents FROM payments WHERE id = ?")
        .get(paymentId) as { amountCents: number };

      db.prepare(
        `INSERT INTO ledger_entries (id, paymentId, clinicId, eventType, amountCents, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), paymentId, clinicId, "captured", amountCents, now);
    }

    if (eventType === "payment.refunded") {
      db.prepare(
        `INSERT INTO ledger_entries (id, paymentId, clinicId, eventType, amountCents, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), paymentId, clinicId, "refunded", refundAmountCents, now);
    }
  })();
}
