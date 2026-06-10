# Idexx Payments Service

A payment processing API built with Express, TypeScript, and SQLite.

## Setup

**Requirements:** Node.js 18+, npm

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

**Capture (full amount required):**
```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-002",
    "paymentId": "<paymentId>",
    "eventType": "payment.captured",
    "captureAmountCents": 10000
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

Webhook events are idempotent — sending the same `eventId` twice is a no-op.
