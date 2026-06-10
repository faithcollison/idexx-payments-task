import { Router } from 'express';
import { DB } from '../db/database';
import { LedgerEntry } from '../types';

export function ledgersRouter(db: DB): Router {
  const router = Router();

  router.get('/:clinicId', (req, res) => {
    const { clinicId } = req.params;

    const entries = db
      .prepare('SELECT * FROM ledger_entries WHERE clinicId = ? ORDER BY createdAt ASC')
      .all(clinicId) as LedgerEntry[];

    const totalRevenue = entries
      .filter((e) => e.eventType === 'captured')
      .reduce((sum, e) => sum + e.amountCents, 0);

    const totalRefunded = entries
      .filter((e) => e.eventType === 'refunded')
      .reduce((sum, e) => sum + e.amountCents, 0);

    const netRevenue = totalRevenue - totalRefunded;

    return res.json({ clinicId, totalRevenue, totalRefunded, netRevenue, entries });
  });

  return router;
}
