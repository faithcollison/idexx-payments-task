# Idexx Payments Task

A payment processing API built with Express, TypeScript, and SQLite that handles payment creation, webhook event processing, and clinic ledger reporting.

## Setup

**Requirements:** Node.js 24+, npm

```bash
npm install
```

## Running the server

```bash
npm run dev
```

Server starts at `http://localhost:3000`. A `payments.db` SQLite file is created automatically on first run.

## Running tests

```bash
npm test
```

## Running the demo

The demo script walks through the full happy path against a live server. Start the server first, then in a separate terminal:

```bash
npm run demo
```

---

## Architecture

### Stack choices

- **Express** — familiar, widely understood, and minimal setup. Fastify and NestJS were considered but rejected: Fastify offers little advantage at this scale, and NestJS adds structural overhead that isn't justified for a small focused task.
- **TypeScript** — type safety across the domain model, particularly useful for enforcing valid payment statuses and webhook event types via union types.
- **better-sqlite3** — fast, synchronous SQLite driver. The sync API keeps the code simple and readable, and makes transactions straightforward. No ORM — 4 simple tables with no complex relations don't justify the abstraction overhead.
- **Zod** — request validation at the boundary before any business logic runs. `safeParse` is used throughout so validation errors are handled inline rather than via a global error handler.

### Data model

- **payments** — core payment record including current status, idempotency key, and request hash
- **payment_events** — append-only log of every status transition, used for status history on `GET /payments/:id`
- **webhook_events** — stores every received `eventId` to prevent duplicate processing; no financial data stored here
- **ledger_entries** — append-only financial record, one row per `captured` or `refunded` event; source of truth for all revenue calculations

### Assumptions

- Partial and full refunds both set payment status to `refunded`. The precise refund amount is tracked via ledger entries.
- Captures are always for the full payment amount. Partial captures are not implemented as they were not specified in the brief.
- `clinicId` is treated as a plain string reference. No clinic entity is created or validated.
- Amounts are stored in the smallest currency unit (e.g. pence for GBP) regardless of currency, following the convention the brief specifies with `amountCents`.
- Duplicate webhook `eventId` returns `200` silently rather than an error — the event was already processed successfully, so there is nothing wrong with the request.
- `authorized → failed` is not implemented as the brief only specifies `pending → failed`. See future improvements.

---

## Trade-offs

**`idempotencyKey` on payments table vs separate table**
Storing `idempotencyKey` and `requestHash` directly on `payments` keeps the model simple — one query, no join, clean 1:1 relationship. The trade-off is that if idempotency were needed across multiple resources a dedicated table would be more appropriate. A TTL or expiry on keys would also require a separate table.

**`requestHash` instead of storing full payload**
Hashing the request payload detects mismatches without storing potentially large payloads. The trade-off is that the original request payload is not available for audit or debugging — only the hash is stored.

**Raw SQL over ORM**
TypeORM was considered but rejected. With 4 simple tables and no complex relations, raw SQL is more readable and makes intent clearer. An ORM adds a dependency and abstraction layer that isn't justified here.

**Synchronous `better-sqlite3`**
The sync API blocks the Node.js event loop on every query. For a high-concurrency production service this would be a problem. For a local single-user service it is not — and the sync API makes the code significantly simpler to follow.

---

## API

### Create a payment

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "clinicId": "clinic-1",
    "amountCents": 10000,
    "currency": "GBP",
    "idempotencyKey": "order-abc-123"
  }'
```

Returns the created payment object with `id`, `clinicId`, `amountCents`, `currency`, `status`, and `createdAt`. The `id` is needed for all subsequent webhook and payment detail requests. Replaying with the same `idempotencyKey` and payload returns the original payment with `200`; a different payload returns `409`.

### Get payments

Returns an array of payment objects. Both query params are optional and can be combined.

```bash
curl "http://localhost:3000/payments"
curl "http://localhost:3000/payments?clinicId=clinic-1"
curl "http://localhost:3000/payments?status=captured"
curl "http://localhost:3000/payments?clinicId=clinic-1&status=captured"
```

Valid `status` values: `pending`, `authorized`, `captured`, `refunded`, `failed`.

### Get a payment by ID

```bash
curl http://localhost:3000/payments/:paymentId
```

Returns the payment with `statusHistory`, `totalCaptured`, and `totalRefunded`.

### Send a webhook event

**Authorise:**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-001",
    "paymentId": ":paymentId",
    "eventType": "payment.authorized"
  }'
```

**Capture (full amount):**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-002",
    "paymentId": ":paymentId",
    "eventType": "payment.captured"
  }'
```

**Partial refund:**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-003",
    "paymentId": ":paymentId",
    "eventType": "payment.refunded",
    "refundAmountCents": 3000
  }'
```

All webhook events return `200` with `{ "message": "Event processed successfully" }` on success, or `200` with `{ "message": "Event already processed" }` if the `eventId` has been seen before. 

### Get ledger for a clinic

```bash
curl http://localhost:3000/ledgers/clinic-1
```

Returns `clinicId`, `totalRevenue`, `totalRefunded`, `netRevenue`, and a list of all ledger entries.

---

## Valid payment status transitions

| Current status | Event                | Next status  |
|----------------|----------------------|--------------|
| pending        | payment.authorized   | authorized   |
| pending        | payment.failed       | failed       |
| authorized     | payment.captured     | captured     |
| captured       | payment.refunded     | refunded     |
| refunded       | payment.refunded     | refunded     |

---

## AI Usage

The Express server boilerplate was generated by Claude Code from a screenshot of my Excalidraw planning diagram (see file in project folder planning), which covered core entities, API design, and the payment flow, and instructions on architecture and tech stack choices. I then made some changes to the generated code, outlined in the sections below. Claude LLM was also used for guidance and trade-offs throughout.

**Accepted:**
- Project structure, types, and config
- SQL queries
- Storing `requestHash` alongside `idempotencyKey` to detect payload mismatches without persisting the full request body
- Test and demo script scaffolding
- README scaffolding

**Changed:**
- Transition rules were initially generated as a nested `Partial<Record<...>>` lookup object. Changed to a flat array of `{ from, event, to }` objects with a simple `.find()`. The lookup is marginally faster at runtime but with 5 transitions the difference is marginal — the array is easier to read and modify.
- DB queries were initially inside route handlers. Moved to a `services/` layer for separation of concerns and easier unit testing.
- `GET /payments/:id` totals were initially calculated from `webhook_events`, which originally had an `amountCents` column. Corrected to use `ledger_entries` — `webhook_events` is an infrastructure deduplication table and should not be the source of truth for financial calculations. `amountCents` was subsequently removed from `webhook_events` entirely, with the ledger as the sole financial record.
- Capture and refund amount handling was significantly reworked. Initially the webhook payload had a single optional `amountCents` field used for both captures and refunds, with a `?? payment.amountCents` fallback in the route meaning captures could be partial. This was replaced with an explicit `refundAmountCents` field on the webhook payload (only required for refund events), while captures always take their amount directly from `payment.amountCents` with nothing accepted on the payload. The route passes both amounts into `processWebhookEvent` as separate named params, and the service writes each to the ledger independently. Refunds are validated against ledger totals to prevent over-refunding.

---

## Future Improvements

- **`authorized → failed` transition** — sensible in a real system (authorisations can expire or be voided) but not specified in the brief so not implemented.
- **Partial captures** — not specified in the brief. Would require accepting `captureAmountCents` on the webhook payload (validated to not exceed `payment.amountCents`), and updating the refund limit check to compare against `totalCaptured` from `ledger_entries` rather than `payment.amountCents`. The ledger and service function for this already exist.
- **Separate idempotency table** — if idempotency were needed across multiple resource types (refunds, payouts) or keys needed TTL/expiry, a dedicated table would be more appropriate.
- **Authentication** — no auth is implemented. In production, each clinic would be issued a secret API key stored (hashed) against a clinic entity. Every request would include the key in the `Authorization` header, verified by middleware before reaching any route. 
- **Async database driver** — `better-sqlite3` blocks the event loop. A production service with concurrent load would need an async driver or a full RDBMS.
- **Richer error logging** — the global error handler currently logs to `console.error`. In production this would feed into a structured logging or alerting system.
- **Audit trail logging** — for a payments system, a structured log of every significant event (payment created, webhook received, status transition, refund processed) would be valuable for debugging, dispute resolution, and compliance. This would sit alongside the DB writes rather than replacing them — `payment_events` and `ledger_entries` already provide some of this, but a dedicated log with timestamps, caller identity, and request IDs would give a complete picture of what happened and when.
- **Clinic entity** — without a dedicated clinic table, unknown `clinicId` values on `GET /payments` and `GET /ledgers/:clinicId` return empty results rather than a 404. Adding a clinic entity would allow both endpoints to validate existence and return proper 404 responses.