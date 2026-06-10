import request from 'supertest';
import { createTestApp, createPayment, advanceToCapture, uid } from './helpers';

describe('GET /ledgers/:clinicId', () => {
  it('net revenue equals captured revenue minus refunds', async () => {
    const { app } = createTestApp();

    const payment = await createPayment(app, { clinicId: 'clinic-ledger', amountCents: 10000 });
    await advanceToCapture(app, payment.id, 10000);

    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: payment.id, type: 'payment.refunded', amountCents: 3000 });

    const res = await request(app).get('/ledgers/clinic-ledger');

    expect(res.status).toBe(200);
    expect(res.body.clinicId).toBe('clinic-ledger');
    expect(res.body.totalRevenue).toBe(10000);
    expect(res.body.totalRefunded).toBe(3000);
    expect(res.body.netRevenue).toBe(7000);
  });

  it('accounts for multiple payments and multiple partial refunds', async () => {
    const { app } = createTestApp();

    const p1 = await createPayment(app, { clinicId: 'clinic-multi', amountCents: 8000 });
    await advanceToCapture(app, p1.id, 8000);

    const p2 = await createPayment(app, { clinicId: 'clinic-multi', amountCents: 5000 });
    await advanceToCapture(app, p2.id, 5000);

    // Refund part of p1
    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: p1.id, type: 'payment.refunded', amountCents: 2000 });

    // Refund all of p2
    await request(app)
      .post('/webhooks')
      .send({ eventId: uid(), paymentId: p2.id, type: 'payment.refunded', amountCents: 5000 });

    const res = await request(app).get('/ledgers/clinic-multi');

    expect(res.body.totalRevenue).toBe(13000);   // 8000 + 5000
    expect(res.body.totalRefunded).toBe(7000);   // 2000 + 5000
    expect(res.body.netRevenue).toBe(6000);      // 13000 - 7000
    expect(res.body.entries).toHaveLength(4);    // 2 captures + 2 refunds
  });

  it('returns zero totals and empty entries for a clinic with no activity', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/ledgers/no-such-clinic');

    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(0);
    expect(res.body.totalRefunded).toBe(0);
    expect(res.body.netRevenue).toBe(0);
    expect(res.body.entries).toHaveLength(0);
  });
});
