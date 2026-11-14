/** SQLite via Node's built-in driver. One connection per process; migrations run at open. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

export type Row = Record<string, SQLInputValue>;

let db: DatabaseSync | null = null;

export function openDatabase(file: string = config.databasePath): DatabaseSync {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function getDb(): DatabaseSync {
  return db ?? openDatabase();
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

function migrate(conn: DatabaseSync): void {
  conn.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((conn.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    conn.exec('BEGIN');
    try {
      conn.exec(sql);
      conn.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
      conn.exec('COMMIT');
    } catch (err) {
      conn.exec('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
    }
  }
}

/** Run `fn` inside a transaction (nested calls reuse the outer one). */
let depth = 0;
export function transaction<T>(fn: () => T): T {
  const conn = getDb();
  if (depth > 0) return fn();
  conn.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    conn.exec('COMMIT');
    return out;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
