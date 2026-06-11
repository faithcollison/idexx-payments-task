import request from "supertest";
import { createTestApp, createPayment, advanceToCapture, uid } from "./helpers";

describe("POST /webhooks — duplicate eventId", () => {
  it("does not apply the same event twice", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);
    const eventId = uid();

    const first = await request(app).post("/webhooks").send({
      eventId,
      paymentId: payment.id,
      eventType: "payment.authorized",
    });
    const second = await request(app).post("/webhooks").send({
      eventId,
      paymentId: payment.id,
      eventType: "payment.authorized",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const detail = await request(app).get(`/payments/${payment.id}`);

    expect(detail.body.statusHistory).toHaveLength(1);
    expect(detail.body.statusHistory[0].toStatus).toBe("authorized");
  });
});

describe("POST /webhooks — invalid transitions", () => {
  it("rejects a refund before the payment has been captured", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);

    const res = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 5000,
    });

    expect(res.status).toBe(422);
  });

  it("rejects capturing a payment that is already captured", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);
    await advanceToCapture(app, payment.id);

    const res = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.captured",
    });

    expect(res.status).toBe(422);
  });

  it("rejects authorising a failed payment", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.failed",
    });

    const res = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.authorized",
    });

    expect(res.status).toBe(422);
  });
});

describe("POST /webhooks — partial refunds", () => {
  it("allows multiple partial refunds within the captured amount", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id);

    const ref1 = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 4000,
    });
    expect(ref1.status).toBe(200);

    const ref2 = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 3000,
    });
    expect(ref2.status).toBe(200);

    const detail = await request(app).get(`/payments/${payment.id}`);
    expect(detail.body.totalRefunded).toBe(7000);
  });

  it("rejects a refund that would exceed the captured amount", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 6000,
    });

    const over = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 5000,
    });

    expect(over.status).toBe(422);
    expect(over.body.error).toMatch(/exceed/i);
  });

  it("allows a refund that exactly matches the captured amount", async () => {
    const { app } = createTestApp();
    const payment = await createPayment(app, { amountCents: 10000 });
    await advanceToCapture(app, payment.id);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 5000,
    });

    const exact = await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 5000,
    });

    expect(exact.status).toBe(200);
  });
});
