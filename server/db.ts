import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@shared/schema';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Store database in %APPDATA%/CajaLumina/.data/ (persistent, independent of source code location)
const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const dataDir = path.join(appDataDir, 'CajaLumina', '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Connect to SQLite
const sqlite = new Database(path.join(dataDir, 'cajaprofesional.db'));
sqlite.pragma('journal_mode = WAL');

// Initialize tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cash_box (
    id TEXT PRIMARY KEY,
    denominations TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    last_updated INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id TEXT PRIMARY KEY,
    voucher_id INTEGER NOT NULL,
    detail TEXT NOT NULL,
    denominations TEXT NOT NULL,
    total_amount REAL NOT NULL,
    date INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS exits (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    initial_amount REAL NOT NULL,
    denominations_given TEXT NOT NULL,
    is_pending INTEGER NOT NULL DEFAULT 1,
    rendered_amount REAL NOT NULL DEFAULT 0,
    change_amount REAL NOT NULL DEFAULT 0,
    date INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    edited_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    exit_id TEXT NOT NULL REFERENCES exits(id),
    voucher_id INTEGER NOT NULL,
    detail TEXT NOT NULL,
    amount REAL NOT NULL,
    date INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS change_records (
    id TEXT PRIMARY KEY,
    exit_id TEXT NOT NULL REFERENCES exits(id),
    denominations TEXT NOT NULL,
    total_amount REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cash_exchanges (
    id TEXT PRIMARY KEY,
    denominations_in TEXT NOT NULL,
    denominations_out TEXT NOT NULL,
    total_amount REAL NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS configuration (
    id TEXT PRIMARY KEY,
    next_voucher_number INTEGER NOT NULL DEFAULT 1,
    last_updated INTEGER NOT NULL
  );
`);

// Migration: Add new columns to exits if they don't exist
try {
  sqlite.exec(`ALTER TABLE exits ADD COLUMN rendered_amount REAL NOT NULL DEFAULT 0;`);
} catch (e) { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE exits ADD COLUMN change_amount REAL NOT NULL DEFAULT 0;`);
} catch (e) { /* column already exists */ }

export const db = drizzle(sqlite, { schema });
