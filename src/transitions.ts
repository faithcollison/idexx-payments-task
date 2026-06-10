import { PaymentStatus, WebhookEventType } from './types';

const VALID_TRANSITIONS: { from: PaymentStatus; to: PaymentStatus; event: WebhookEventType }[] = [
  { from: 'pending',    to: 'authorised', event: 'payment.authorised' },
  { from: 'pending',    to: 'failed',     event: 'payment.failed' },
  { from: 'authorised', to: 'captured',   event: 'payment.captured' },
  { from: 'captured',   to: 'refunded',   event: 'payment.refunded' },
  { from: 'refunded',   to: 'refunded',   event: 'payment.refunded' },
];

export function getNextStatus(currentStatus: PaymentStatus, eventType: WebhookEventType): PaymentStatus | null {
  const transition = VALID_TRANSITIONS.find(
    t => t.from === currentStatus && t.event === eventType
  );
  return transition?.to ?? null;
}
