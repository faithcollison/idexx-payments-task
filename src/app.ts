import express from 'express';
import { DB } from './db/database';
import { initSchema } from './db/schema';
import { paymentsRouter } from './routes/payments';
import { webhooksRouter } from './routes/webhooks';
import { ledgersRouter } from './routes/ledgers';

export function createApp(db: DB) {
  initSchema(db);

  const app = express();
  app.use(express.json());

  app.use('/payments', paymentsRouter(db));
  app.use('/webhooks', webhooksRouter(db));
  app.use('/ledgers', ledgersRouter(db));

  return app;
}
