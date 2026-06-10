import { Router } from "express";
import { createHash } from "crypto";
import { v4 as randomUUID } from "uuid";
import { DB } from "../db/database";
import { createPaymentSchema } from "../validators";
import {
  getPayments,
  getPaymentById,
  getPaymentByIdempotencyKey,
  createPayment,
  getPaymentStatusHistory,
  getTotalCapturedForPayment,
  getTotalRefundedForPayment,
} from "../services/payments.service";

export function paymentsRouter(db: DB): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const { clinicId, status } = req.query;
    const payments = getPayments(
      db,
      clinicId as string | undefined,
      status as string | undefined,
    );
    return res.json(payments);
  });

  router.post("/", (req, res) => {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { clinicId, amountCents, currency, idempotencyKey } = parsed.data;

    const requestHash = createHash("sha256")
      .update(JSON.stringify({ clinicId, amountCents, currency }))
      .digest("hex");

    const existing = getPaymentByIdempotencyKey(db, idempotencyKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return res
          .status(409)
          .json({ error: "Idempotency key conflict: payload mismatch" });
      } else return res.status(200).json(existing);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    createPayment(
      db,
      id,
      clinicId,
      idempotencyKey,
      requestHash,
      amountCents,
      currency,
      now,
    );

    return res.status(201).json({
      id,
      clinicId,
      amountCents,
      currency,
      status: "pending",
      createdAt: now,
    });
  });

  router.get("/:id", (req, res) => {
    const payment = getPaymentById(db, req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const statusHistory = getPaymentStatusHistory(db, req.params.id);
    const totalCaptured = getTotalCapturedForPayment(db, req.params.id);
    const totalRefunded = getTotalRefundedForPayment(db, req.params.id);

    return res.json({
      ...payment,
      totalCaptured,
      totalRefunded,
      statusHistory,
    });
  });

  return router;
}
