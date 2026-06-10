# Idexx Payments Service

A payment processing API built with Express, TypeScript, and SQLite that handles payment creation, webhook event processing, and clinic ledger reporting.

## Setup

**Requirements:** Node.js 24+, npm

If you use nvm:
```bash
nvm use 24
```

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

- **Express** — simple, widely understood, minimal setup. Fastify was considered for its built-in TypeScript support but Express was preferred to keep setup straightforward for a local task.
- **TypeScript** — type safety across the domain model, particularly useful for enforcing valid payment statuses and webhook event types via union types.
- **better-sqlite3** — synchronous SQLite driver. The sync API simplifies the code significantly for a single-user local service. No ORM was used — 4 simple tables with straightforward queries don't benefit from the abstraction overhead of TypeORM or similar.
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
Storing `idempotencyKey` and `requestHash` directly on `payments` keeps the model simple — one query, no join, clean 1:1 relationship. The trade-off is that if idempotency were needed across multiple resources (refunds, payouts) a dedicated table would be more appropriate. A TTL or expiry on keys would also require a separate table.

**`requestHash` instead of storing full payload**
Hashing the request payload detects mismatches without storing potentially large payloads. The trade-off is that the original request payload is not available for audit or debugging — only the hash is stored.

**Raw SQL over ORM**
TypeORM was considered but rejected. With 4 simple tables and no complex relations, raw SQL is more readable and makes intent clearer. An ORM adds a dependency and abstraction layer that isn't justified here.

**Synchronous `better-sqlite3`**
The sync API blocks the Node.js event loop on every query. For a high-concurrency production service this would be a problem. For a local single-user service it is not — and the sync API makes the code significantly simpler to follow.

**Services layer**
DB queries are separated from route handlers into a `services/` directory. This keeps routes focused on HTTP concerns (validation, status codes, response shape) and makes the query logic independently testable.

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

### Get all payments for a clinic

```bash
curl "http://localhost:3000/payments?clinicId=clinic-1"
```

### Get a payment by ID

```bash
curl http://localhost:3000/payments/<paymentId>
```

Returns the payment with `statusHistory`, `totalCaptured`, and `totalRefunded`.

### Send a webhook event

**Authorise:**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-001",
    "paymentId": "<paymentId>",
    "eventType": "payment.authorised"
  }'
```

**Capture (full amount):**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-002",
    "paymentId": "<paymentId>",
    "eventType": "payment.captured"
  }'
```

**Partial refund:**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-003",
    "paymentId": "<paymentId>",
    "eventType": "payment.refunded",
    "refundAmountCents": 3000
  }'
```

### Get ledger for a clinic

```bash
curl http://localhost:3000/ledgers/clinic-1
```

Returns `totalRevenue`, `totalRefunded`, `netRevenue`, and a list of all ledger entries.

---

## Valid payment status transitions

| Current status | Event                | Next status  |
|----------------|----------------------|--------------|
| pending        | payment.authorised   | authorised   |
| pending        | payment.failed       | failed       |
| authorised     | payment.captured     | captured     |
| captured       | payment.refunded     | refunded     |
| refunded       | payment.refunded     | refunded     |

---

## AI Usage

The Express server was generated by Claude Code from a screenshot of my Excalidraw planning diagram (see file in project), which covered core entities, API design, and the payment flow. I then made deliberate changes to the generated code, outlined in the sections below. Claude LLM was also used for guidance on concepts and trade-offs throughout.

**Accepted:**
- Suggestion to store `requestHash` alongside `idempotencyKey` to detect payload mismatches without storing the full request body
- Test and demo script scaffolding

**Changed:**
- Transition rules were initially generated as a nested `Partial<Record<...>>` lookup object. Changed to a flat array of `{ from, event, to }` objects with a simple `.find()`. The lookup is marginally faster at runtime but with 5 transitions the difference is marginal — the array is significantly easier to read and modify.
- DB queries were initially inside route handlers. Moved to a `services/` layer for separation of concerns and easier unit testing.
- `GET /payments/:id` totals were initially calculated from `webhook_events`. Corrected to use `ledger_entries` — `webhook_events` is an infrastructure deduplication table and should not be used for financial calculations. `amountCents` is also absent for non-refund webhooks making it unsuitable as a financial source.

**Rejected:**
- Capturing `amountCents` on the webhook payload for capture events. Captures are always full so the amount is already known from `payment.amountCents` — no need to pass or validate it on the webhook.

---

## Future Improvements

- **`authorized → failed` transition** — sensible in a real system (authorisations can expire or be voided) but not specified in the brief so not implemented.
- **Partial captures** — not specified in the brief. Would require storing a `capturedAmountCents` separately from `amountCents` on the payment and adjusting the refund limit check accordingly.
- **Separate idempotency table** — if idempotency were needed across multiple resource types (refunds, payouts) or keys needed TTL/expiry, a dedicated table would be more appropriate.
- **Authentication** — no auth is implemented. In production each request would need a clinic API key or JWT.
- **Async database driver** — `better-sqlite3` blocks the event loop. A production service with concurrent load would need an async driver or a full RDBMS.
- **Global error handler** — unhandled DB errors (e.g. disk full) currently return an unformatted Express HTML 500. A global `app.use((err, req, res, next) => ...)` handler in `app.ts` would ensure all errors return consistent JSON.
- **`GET /payments` status filter validation** — passing `?status=nonsense` silently returns an empty array. This should return a 400 with the list of valid statuses.
- **`GET /ledgers/:clinicId` for unknown clinic** — currently returns a 200 with zeroes and an empty array. Could be argued as a 404 depending on whether clinics are treated as first-class entities.