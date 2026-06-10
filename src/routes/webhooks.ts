import { Router } from "express";
import { DB } from "../db/database";
import { webhookPayloadSchema } from "../validators";
import { getNextStatus } from "../transitions";
import {
  getPaymentById,
  getTotalRefundedForPayment,
} from "../services/payments.service";
import {
  getWebhookEvent,
  processWebhookEvent,
} from "../services/webhooks.service";

export function webhooksRouter(db: DB): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const parsed = webhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { eventId, paymentId, eventType, refundAmountCents } = parsed.data;

    const existingEvent = getWebhookEvent(db, eventId);
    if (existingEvent) {
      return res.status(200).json({ message: "Event already processed" });
    }

    const payment = getPaymentById(db, paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const nextStatus = getNextStatus(payment.status, eventType);
    if (!nextStatus) {
      return res.status(422).json({
        error: `Invalid transition: cannot apply ${eventType} to a payment with status '${payment.status}'`,
      });
    }

    if (eventType === "payment.captured" && refundAmountCents !== undefined) {
      return res.status(400).json({ error: "refundAmountCents should not be provided for capture events" });
    }

    if (eventType === "payment.refunded") {
      if (refundAmountCents === undefined) {
        return res.status(400).json({ error: "amount is required for refund events" });
      }

      const totalRefunded = getTotalRefundedForPayment(db, paymentId);
      if (totalRefunded + refundAmountCents > payment.amountCents) {
        return res.status(422).json({
          error: `Refund of ${refundAmountCents} would exceed available amount`,
        });
      }
    }

    processWebhookEvent(db, {
      eventId,
      paymentId,
      eventType,
      currentStatus: payment.status,
      clinicId: payment.clinicId,
      nextStatus,
      captureAmountCents: payment.amountCents,
      refundAmountCents,
    });

    return res.status(200).json({ message: "Event processed successfully" });
  });

  return router;
}
