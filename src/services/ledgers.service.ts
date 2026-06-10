import { DB } from '../db/database';
import { LedgerEntry } from '../types';

export function getLedgerEntriesByClinic(db: DB, clinicId: string): LedgerEntry[] {
  return db.prepare('SELECT * FROM ledger_entries WHERE clinicId = ? ORDER BY createdAt ASC').all(clinicId) as LedgerEntry[];
}
