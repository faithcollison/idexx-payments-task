import request from "supertest";
import { createTestApp, createPayment, advanceToCapture, uid } from "./helpers";

describe("GET /ledgers/:clinicId", () => {
  it("gets list of ledger entries for clinic id", async () => {
    const { app } = createTestApp();

    const payment = await createPayment(app, {
      clinicId: "clinic-entries",
      amountCents: 10000,
    });
    await advanceToCapture(app, payment.id);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 4000,
    });

    const res = await request(app).get("/ledgers/clinic-entries");

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);

    const capture = res.body.entries.find(
      (e: { eventType: string }) => e.eventType === "captured",
    );
    const refund = res.body.entries.find(
      (e: { eventType: string }) => e.eventType === "refunded",
    );

    expect(capture).toMatchObject({
      paymentId: payment.id,
      clinicId: "clinic-entries",
      eventType: "captured",
      amountCents: 10000,
    });

    expect(refund).toMatchObject({
      paymentId: payment.id,
      clinicId: "clinic-entries",
      eventType: "refunded",
      amountCents: 4000,
    });
  });

  it("net revenue equals captured revenue minus refunds", async () => {
    const { app } = createTestApp();

    const payment = await createPayment(app, {
      clinicId: "clinic-1",
      amountCents: 10000,
    });
    await advanceToCapture(app, payment.id);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: payment.id,
      eventType: "payment.refunded",
      refundAmountCents: 3000,
    });

    const res = await request(app).get("/ledgers/clinic-1");

    expect(res.status).toBe(200);
    expect(res.body.clinicId).toBe("clinic-1");
    expect(res.body.totalRevenue).toBe(10000);
    expect(res.body.totalRefunded).toBe(3000);
    expect(res.body.netRevenue).toBe(7000);
  });

  it("accounts for multiple partial refunds", async () => {
    const { app } = createTestApp();

    const p1 = await createPayment(app, {
      clinicId: "clinic-multi",
      amountCents: 8000,
    });
    await advanceToCapture(app, p1.id);

    const p2 = await createPayment(app, {
      clinicId: "clinic-multi",
      amountCents: 5000,
    });
    await advanceToCapture(app, p2.id);

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: p1.id,
      eventType: "payment.refunded",
      refundAmountCents: 2000,
    });

    await request(app).post("/webhooks").send({
      eventId: uid(),
      paymentId: p2.id,
      eventType: "payment.refunded",
      refundAmountCents: 5000,
    });

    const res = await request(app).get("/ledgers/clinic-multi");

    expect(res.body.totalRevenue).toBe(13000);
    expect(res.body.totalRefunded).toBe(7000);
    expect(res.body.netRevenue).toBe(6000);
    expect(res.body.entries).toHaveLength(4);
  });

  it("returns zero totals and empty entries for a clinic with no activity", async () => {
    const { app } = createTestApp();

    const res = await request(app).get("/ledgers/no-such-clinic");

    expect(res.status).toBe(200);
    expect(res.body.totalRevenue).toBe(0);
    expect(res.body.totalRefunded).toBe(0);
    expect(res.body.netRevenue).toBe(0);
    expect(res.body.entries).toHaveLength(0);
  });
});
