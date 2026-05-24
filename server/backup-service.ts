/**
 * backup-service.ts
 * Server-side backup logic. Reads config from the DB and copies the
 * SQLite database to both the internal backup folder and any external
 * path configured by the user. Respects the retention policy.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Resolve paths (same logic as db.ts) ────────────────────────────────────
const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const defaultDataDir = path.join(appDataDir, 'CajaLumina', '.data');
const dataDir = process.env.DATABASE_PATH || defaultDataDir;
const dbPath = path.join(dataDir, 'cajaprofesional.db');
const internalBackupDir = path.join(dataDir, 'backups');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function applyRetention(dir: string, maxBackups: number) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter(f => f.startsWith('cajaprofesional-') && f.endsWith('.db'))
      .sort(); // oldest first (ISO date in name)
    while (files.length > maxBackups) {
      const oldest = files.shift()!;
      try { fs.unlinkSync(path.join(dir, oldest)); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Copy the database to a destination directory with a timestamped name.
 * Returns the full path of the new backup file or null on failure.
 */
function copyDb(destDir: string): string | null {
  if (!fs.existsSync(dbPath)) return null;
  ensureDir(destDir);
  const ts = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]; // e.g. 2025-06-01-14-30-00
  const destFile = path.join(destDir, `cajaprofesional-${ts}.db`);
  try {
    fs.copyFileSync(dbPath, destFile);
    return destFile;
  } catch (e) {
    console.error('[Backup] Failed to copy DB:', e);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BackupConfig {
  backupPath?: string | null;
  backupRetention?: number | null;
  retentionEnabled?: boolean | null;
}

export interface BackupResult {
  success: boolean;
  internalPath?: string;
  externalPath?: string;
  error?: string;
}

/**
 * Perform a full backup cycle:
 * 1. Copy DB to internal backup folder.
 * 2. If externalPath is configured and valid, copy there too.
 * 3. Apply retention to both folders.
 */
export function performBackup(config: BackupConfig = {}): BackupResult {
  const maxBackups = config.retentionEnabled !== false
    ? (config.backupRetention ?? 30)
    : 999;

  // Internal backup
  const internalPath = copyDb(internalBackupDir);
  if (!internalPath) {
    return { success: false, error: 'No se pudo crear la copia de seguridad interna.' };
  }
  applyRetention(internalBackupDir, maxBackups);

  // External backup (user-configured path)
  let externalPath: string | undefined;
  if (config.backupPath && config.backupPath.trim() !== '') {
    const ext = config.backupPath.trim();
    if (fs.existsSync(path.dirname(ext)) || fs.existsSync(ext)) {
      externalPath = copyDb(ext) ?? undefined;
      if (externalPath) applyRetention(ext, maxBackups);
    } else {
      console.warn('[Backup] External path does not exist, skipping:', ext);
    }
  }

  return { success: true, internalPath, externalPath };
}
