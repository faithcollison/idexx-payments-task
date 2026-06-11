const BASE_URL = 'http://localhost:3000';
const CLINIC_ID = `clinic-demo-${Date.now()}`;
const AMOUNT_CENTS = 10000;

async function post(path: string, body: object): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, any> };
}

async function get(path: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json() as Record<string, any> };
}

function log(label: string, data: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  // 1. Create a payment
  const { status: s1, body: payment } = await post('/payments', {
    clinicId: CLINIC_ID,
    amountCents: AMOUNT_CENTS,
    currency: 'GBP',
    idempotencyKey: `demo-${Date.now()}`,
  });
  console.log(`\n[1] Create payment (${s1})`);
  log('Payment', payment);

  const paymentId = payment.id;

  // 2. Authorise
  const { status: s2 } = await post('/webhooks', {
    eventId: `evt-auth-${Date.now()}`,
    paymentId,
    eventType: 'payment.authorized',
  });
  console.log(`\n[2] Authorise webhook (${s2})`);

  // 3. Capture (full amount)
  const { status: s3 } = await post('/webhooks', {
    eventId: `evt-cap-${Date.now()}`,
    paymentId,
    eventType: 'payment.captured',
    captureAmountCents: AMOUNT_CENTS,
  });
  console.log(`\n[3] Capture webhook (${s3})`);

  // 4. Partial refund
  const { status: s4 } = await post('/webhooks', {
    eventId: `evt-ref-${Date.now()}`,
    paymentId,
    eventType: 'payment.refunded',
    refundAmountCents: 3000,
  });
  console.log(`\n[4] Partial refund of 3000 (${s4})`);

  // 5. Payment detail
  const { body: detail } = await get(`/payments/${paymentId}`);
  console.log('\n[5] Payment detail');
  log('Status', detail.status);
  log('Status history', detail.statusHistory);
  log('Totals', { totalCaptured: detail.totalCaptured, totalRefunded: detail.totalRefunded });

  // 6. Ledger
  const { body: ledger } = await get(`/ledgers/${CLINIC_ID}`);
  console.log('\n[6] Ledger');
  log('Ledger', ledger);
}

main().catch(console.error);
