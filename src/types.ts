export const VALID_PAYMENT_STATUSES = ['pending', 'authorised', 'captured', 'refunded', 'failed'] as const;
export type PaymentStatus = typeof VALID_PAYMENT_STATUSES[number];
export type WebhookEventType = 'payment.authorised' | 'payment.captured' | 'payment.refunded' | 'payment.failed';
export type LedgerEventType = 'captured' | 'refunded';

export interface Payment {
  id: string;
  clinicId: string;
  idempotencyKey: string;
  requestHash: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  paymentId: string;
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  paymentId: string;
  eventType: WebhookEventType;
  amountCents: number | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  paymentId: string;
  clinicId: string;
  eventType: LedgerEventType;
  amountCents: number;
  createdAt: string;
}
