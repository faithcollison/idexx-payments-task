import request from 'supertest';
import { createTestApp, createPayment, advanceToCapture, uid } from './helpers';

describe('POST /webhooks — duplicate eventId', () => {
  it('does not apply the same event twice', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);
    const eventId = uid();

    const first = await request(app)
      .post('/webhooks')
      .send({ eventId, paymentId: payment.id, type: 'payment.authorised', amountCents: 10000 });
    const second = await request(app)
      .post('/webhooks')
      .send({ eventId, paymentId: payment.id, type: 'payment.authorised', amountCents: 10000 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const detail = await request(app).get(`/payments/${payment.id}`);
    // Only one payment_event should have been recorded
    expect(detail.body.statusHistory).toHaveLength(1);
    expect(detail.body.statusHistory[0].to_status).toBe('authorised');
  });
});

describe('POST /webhooks — invalid transitions', () => {
  it('rejects a refund before the payment has been captured', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);

    const res = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 5000 });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/invalid transition/i);
  });

  it('rejects capturing a payment that is already captured', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);
    await advanceToCapture(app, payment.id, 10000);

    const res = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.captured', amountCents: 10000 });

    expect(res.status).toBe(422);
  });

  it('rejects authorising a failed payment', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);

    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.failed' });

    const res = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.authorised', amountCents: 10000 });

    expect(res.status).toBe(422);
  });
});

describe('POST /webhooks — partial refunds', () => {
  it('allows multiple partial refunds within the captured amount', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id, 10000);

    const ref1 = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 4000 });
    expect(ref1.status).toBe(200);

    const ref2 = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 3000 });
    expect(ref2.status).toBe(200);

    const detail = await request(app).get(`/payments/${payment.id}`);
    expect(detail.body.totalRefunded).toBe(7000);
  });

  it('rejects a refund that would exceed the captured amount', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id, 10000);

    // Partially refund 6000
    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 6000 });

    // Attempt to refund 5000 more (6000 + 5000 = 11000 > 10000)
    const over = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 5000 });

    expect(over.status).toBe(422);
    expect(over.body.error).toMatch(/exceed/i);
  });

  it('allows a refund that exactly exhausts the captured amount', async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id, 10000);

    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 5000 });

    const exact = await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 5000 });

    expect(exact.status).toBe(200);
  });
});
