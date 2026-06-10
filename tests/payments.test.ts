import request from 'supertest';
import { createTestApp, uid } from './helpers';

const BASE_PAYLOAD = {
  clinicId: 'clinic-1',
  amountCents: 5000,
  currency: 'GBP',
};

describe('POST /payments — idempotency', () => {
  it('returns the original payment when replayed with the same payload', async () => {
    const { app } = createTestApp();
    const idempotencyKey = uid();
    const payload = { ...BASE_PAYLOAD, idempotencyKey };

    const first = await request(app).post('/payments').send(payload);
    const second = await request(app).post('/payments').send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.amountCents).toBe(5000);
  });

  it('returns 409 when the same idempotency key is used with a different payload', async () => {
    const { app } = createTestApp();
    const idempotencyKey = uid();

    await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey });

    const conflict = await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey, amountCents: 9999 });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatch(/conflict/i);
  });
});

describe('GET /payments', () => {
  it('returns all payments for a clinic', async () => {
    const { app } = createTestApp();

    await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey: uid() });
    await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey: uid() });

    const res = await request(app).get('/payments?clinicId=clinic-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by status', async () => {
    const { app } = createTestApp();

    await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey: uid() });

    const pending = await request(app).get('/payments?status=pending');
    expect(pending.body.length).toBeGreaterThan(0);
    pending.body.forEach((p: { status: string }) => expect(p.status).toBe('pending'));
  });
});

describe('GET /payments/:id', () => {
  it('returns 404 for unknown id', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/payments/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('includes statusHistory, totalCaptured and totalRefunded', async () => {
    const { app } = createTestApp();

    const paymentRes = await request(app)
      .post('/payments')
      .send({ ...BASE_PAYLOAD, idempotencyKey: uid() });
    const { id } = paymentRes.body;

    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: id, type: 'payment.authorised', amountCents: 5000 });
    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: id, type: 'payment.captured', amountCents: 5000 });

    const detail = await request(app).get(`/payments/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.statusHistory).toHaveLength(2);
    expect(detail.body.totalCaptured).toBe(5000);
    expect(detail.body.totalRefunded).toBe(0);
  });
});
