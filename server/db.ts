import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@shared/schema';
import path from 'path';
import fs from 'fs';
import os from 'os';

const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const defaultDataDir = path.join(appDataDir, 'CajaLumina', '.data');
const dataDir = process.env.DATABASE_PATH || defaultDataDir;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cajaprofesional.db');
const backupDir = path.join(dataDir, 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Auto-backup once per day on server start
if (fs.existsSync(dbPath)) {
  const dateStr = new Date().toISOString().split('T')[0];
  const backupPath = path.join(backupDir, `cajaprofesional-${dateStr}.db`);
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(dbPath, backupPath);
      // Keep only last 7 backups
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
      if (backups.length > 7) {
        fs.unlinkSync(path.join(backupDir, backups[0]));
      }
    } catch (e) {
      console.error('Failed to create DB backup:', e);
    }
  }
}

// Connect to SQLite
export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

function runSafeAlter(dbInstance: any, sqlStatement: string) {
  try {
    dbInstance.exec(sqlStatement);
  } catch (error) {
    const message = String((error as Error)?.message || "");
    const isDuplicateColumn = message.includes("duplicate column name");
    if (!isDuplicateColumn) {
      throw error;
    }
  }
}

export function runMigrations(dbInstance: any) {
  // Initialize tables if they don't exist
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_box (
      id TEXT PRIMARY KEY,
      denominations TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY,
      voucher_id INTEGER NOT NULL,
      detail TEXT NOT NULL,
      denominations TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      edited_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS exits (
      id TEXT PRIMARY KEY,
      purpose TEXT NOT NULL,
      initial_amount INTEGER NOT NULL,
      denominations_given TEXT NOT NULL,
      is_pending INTEGER NOT NULL DEFAULT 1,
      rendered_amount INTEGER NOT NULL DEFAULT 0,
      change_amount INTEGER NOT NULL DEFAULT 0,
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
      amount INTEGER NOT NULL,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS change_records (
      id TEXT PRIMARY KEY,
      exit_id TEXT NOT NULL REFERENCES exits(id),
      denominations TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_exchanges (
      id TEXT PRIMARY KEY,
      denominations_in TEXT NOT NULL,
      denominations_out TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS configuration (
      id TEXT PRIMARY KEY,
      next_voucher_number INTEGER NOT NULL DEFAULT 1,
      current_voucher_year INTEGER NOT NULL DEFAULT 2025,
      store_name TEXT NOT NULL DEFAULT '',
      currency_prefix TEXT NOT NULL DEFAULT '$',
      tax_id TEXT NOT NULL DEFAULT '',
      edit_window_days INTEGER NOT NULL DEFAULT 20,
      confirm_before_edit INTEGER NOT NULL DEFAULT 1,
      edit_history INTEGER NOT NULL DEFAULT 1,
      lock_closed_periods INTEGER NOT NULL DEFAULT 0,
      backup_path TEXT NOT NULL DEFAULT '',
      backup_on_close INTEGER NOT NULL DEFAULT 0,
      backup_on_save INTEGER NOT NULL DEFAULT 1,
      backup_retention INTEGER NOT NULL DEFAULT 30,
      retention_enabled INTEGER NOT NULL DEFAULT 1,
      last_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_adjustments (
      id TEXT PRIMARY KEY,
      previous_denominations TEXT NOT NULL,
      new_denominations TEXT NOT NULL,
      previous_total INTEGER NOT NULL,
      new_total INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_data TEXT,
      new_data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS closed_periods (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      closed_at INTEGER NOT NULL
    );
  `);

  // Migration to Centavos (multiply existing amounts by 100)
  const migrationFlagPath = path.join(dataDir, '.centavos_migrated');
  if (!fs.existsSync(migrationFlagPath)) {
    try {
      dbInstance.transaction(() => {
        dbInstance.exec(`UPDATE cash_box SET total_amount = ROUND(total_amount * 100);`);
        dbInstance.exec(`UPDATE incomes SET total_amount = ROUND(total_amount * 100);`);
        dbInstance.exec(`UPDATE exits SET initial_amount = ROUND(initial_amount * 100), rendered_amount = ROUND(rendered_amount * 100), change_amount = ROUND(change_amount * 100);`);
        dbInstance.exec(`UPDATE invoices SET amount = ROUND(amount * 100);`);
        dbInstance.exec(`UPDATE change_records SET total_amount = ROUND(total_amount * 100);`);
        dbInstance.exec(`UPDATE cash_exchanges SET total_amount = ROUND(total_amount * 100);`);
        dbInstance.exec(`UPDATE cash_adjustments SET previous_total = ROUND(previous_total * 100), new_total = ROUND(new_total * 100), difference = ROUND(difference * 100);`);
      })();
      fs.writeFileSync(migrationFlagPath, 'done');
      console.log('Database successfully migrated to cent-based integers.');
    } catch (err) {
      console.error('Migration to centavos failed:', err);
    }
  }

  // Migration: Add new columns to exits/configuration if they don't exist
  runSafeAlter(dbInstance, `ALTER TABLE exits ADD COLUMN rendered_amount INTEGER NOT NULL DEFAULT 0;`);
  runSafeAlter(dbInstance, `ALTER TABLE exits ADD COLUMN change_amount INTEGER NOT NULL DEFAULT 0;`);
  runSafeAlter(dbInstance, `ALTER TABLE exits ADD COLUMN voucher_id INTEGER;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN next_voucher_number INTEGER NOT NULL DEFAULT 1;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN last_updated INTEGER NOT NULL DEFAULT 0;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN current_voucher_year INTEGER NOT NULL DEFAULT 2025;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN store_name TEXT NOT NULL DEFAULT '';`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN currency_prefix TEXT NOT NULL DEFAULT '$';`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN tax_id TEXT NOT NULL DEFAULT '';`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN edit_window_days INTEGER NOT NULL DEFAULT 20;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN confirm_before_edit INTEGER NOT NULL DEFAULT 1;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN edit_history INTEGER NOT NULL DEFAULT 1;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN lock_closed_periods INTEGER NOT NULL DEFAULT 0;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN backup_path TEXT NOT NULL DEFAULT '';`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN backup_on_close INTEGER NOT NULL DEFAULT 0;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN backup_on_save INTEGER NOT NULL DEFAULT 1;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN backup_retention INTEGER NOT NULL DEFAULT 30;`);
  runSafeAlter(dbInstance, `ALTER TABLE configuration ADD COLUMN retention_enabled INTEGER NOT NULL DEFAULT 1;`);

  // Voucher uniqueness safeguards (global sequence)
  dbInstance.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_incomes_voucher_unique ON incomes(voucher_id);`);
  dbInstance.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_voucher_unique ON invoices(voucher_id);`);
  dbInstance.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exits_voucher_unique ON exits(voucher_id) WHERE voucher_id IS NOT NULL;`);
}

// Run migrations on startup on active sqlite connection
runMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
