import { z } from 'zod';

export const createPaymentSchema = z.object({
  clinicId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const webhookPayloadSchema = z.object({
  eventId: z.string().min(1),
  paymentId: z.string().min(1),
  type: z.enum(['payment.authorised', 'payment.captured', 'payment.refunded', 'payment.failed']),
  amountCents: z.number().int().positive().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;
