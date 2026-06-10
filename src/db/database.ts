import Database from 'better-sqlite3';

export type DB = Database.Database;

export function createDatabase(filename = ':memory:'): DB {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
