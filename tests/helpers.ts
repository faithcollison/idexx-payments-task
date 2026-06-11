import request from "supertest";
import { createApp } from "../src/app";
import { createDatabase } from "../src/db/database";

type TestApp = Parameters<typeof request>[0];

export function createTestApp() {
  const db = createDatabase(":memory:");
  const app = createApp(db);
  return { app, db };
}

let idCounter = 0;

export function uid(): string {
  return `test-${Date.now()}-${++idCounter}`;
}

export async function createPayment(
  app: TestApp,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post("/payments")
    .send({
      clinicId: "clinic-1",
      amountCents: 10000,
      currency: "USD",
      idempotencyKey: uid(),
      ...overrides,
    });
  return res.body as {
    id: string;
    clinicId: string;
    amountCents: number;
    status: string;
  };
}

export async function advanceToCapture(app: TestApp, paymentId: string) {
  await request(app).post("/webhooks").send({
    eventId: uid(),
    paymentId,
    eventType: "payment.authorized",
  });
  await request(app).post("/webhooks").send({
    eventId: uid(),
    paymentId,
    eventType: "payment.captured",
  });
}
