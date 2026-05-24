// ============================================================
// Caja Lumina — UpdateService (Ressearch-style)
// ============================================================
// Sistema de actualizaciones silencioso tipo Ressearch:
//  1. Polling a Firebase cada 60s (Realtime DB REST)
//  2. Descarga silenciosa en %TEMP% con progreso cada 5%
//  3. Toast en renderer con barra de progreso real
//  4. Al completar: emite 'update:ready', botón "Reiniciar para actualizar"
//  5. Al reiniciar: genera script VBS invisible que:
//     - Espera 3s (Electron cierra)
//     - Instala con /S (silencioso)
//     - Re-abre la app
//     - Se auto-destruye
//  6. Al rearrancar: detecta nueva versión y muestra modal de Novedades
// ============================================================

const { ipcMain, app } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

// ============================================================
// FIREBASE CONFIG — Realtime Database REST
// ============================================================
const FIREBASE_DB_URL = 'https://lumina-a2f45-default-rtdb.firebaseio.com';
const UPDATE_PATH = '/cajalumina_updates.json';
const POLL_INTERVAL_MS = 60_000; // 60 segundos
// ============================================================

// Persisted state across sessions (stored in userData)
let userDataPath = '';
let stateFilePath = '';

function getStateFilePath() {
  if (!stateFilePath) {
    userDataPath = app.getPath('userData');
    stateFilePath = path.join(userDataPath, 'update-state.json');
  }
  return stateFilePath;
}

function loadState() {
  try {
    const raw = fs.readFileSync(getStateFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

function clearState() {
  try {
    fs.unlinkSync(getStateFilePath());
  } catch {}
}

/**
 * Semver comparison. Returns true if remote > local.
 */
function isNewerVersion(localVersion, remoteVersion) {
  const toNums = (v) => v.replace(/^v/, '').split('.').map(Number);
  const local = toNums(localVersion);
  const remote = toNums(remoteVersion);
  for (let i = 0; i < Math.max(local.length, remote.length); i++) {
    const l = local[i] || 0;
    const r = remote[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/**
 * Fetch update info from Firebase Realtime DB (REST).
 */
function fetchUpdateInfo() {
  return new Promise((resolve) => {
    const url = FIREBASE_DB_URL + UPDATE_PATH;
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(10_000, () => { req.destroy(); resolve(null); });
  });
}

/**
 * Download the installer to %TEMP% with 5% progress notifications.
 * Returns the local file path on success, or throws on error.
 */
function downloadInstaller(downloadUrl, latestVersion, onProgress) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const fileName = `CajaLumina-${latestVersion}-Setup.exe`;
    const filePath = path.join(tmpDir, fileName);

    const doDownload = (url, attempt) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, (response) => {
        // Handle redirects (GitHub Releases)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          req.destroy();
          doDownload(response.headers.location, attempt);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastReportedPercent = -1;

        const file = fs.createWriteStream(filePath);
        response.setTimeout(45_000, () => {
          req.destroy(new Error('Download stream timeout'));
        });

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalSize > 0) {
            const percent = Math.floor((downloaded / totalSize) * 100);
            // Report every 5%
            if (percent >= lastReportedPercent + 5) {
              lastReportedPercent = percent;
              onProgress({ percent, status: 'downloading' });
            }
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            onProgress({ percent: 100, status: 'downloading' });
            resolve(filePath);
          });
        });

        file.on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      });

      req.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
      req.setTimeout(15_000, () => {
        req.destroy(new Error('Request timeout'));
      });
    };

    doDownload(downloadUrl, 0);
  });
}

/**
 * Generate a VBScript that:
 *  1. Waits 3s for Electron to fully close
 *  2. Runs the installer silently (/S)
 *  3. Re-opens the app
 *  4. Deletes itself
 */
function generateVbsScript(installerPath, execPath) {
  // Escape backslashes for VBS strings
  const installer = installerPath.replace(/\\/g, '\\\\');
  const appExe = execPath.replace(/\\/g, '\\\\');
  const vbsPath = path.join(os.tmpdir(), 'cajalumina-updater.vbs');

  const script = `
' Caja Lumina Auto-Updater Script
' Auto-generated — do not edit

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Paso 1: Esperar 3 segundos para que Electron cierre completamente
WScript.Sleep 3000

' Paso 2: Ejecutar el instalador en modo silencioso
' El 1 = WindowStyle (0=hidden), True = esperar a que termine
WshShell.Run """${installer}"" /S", 0, True

' Paso 3: Re-abrir la aplicacion
WshShell.Run """${appExe}""", 1, False

' Paso 4: Auto-destruccion del script
Dim sFile
sFile = WScript.ScriptFullName
WshShell.Run "cmd /c del /f /q """ & sFile & """", 0, False

Set WshShell = Nothing
WScript.Quit
`.trim();

  fs.writeFileSync(vbsPath, script, 'utf-8');
  return vbsPath;
}

/**
 * Main updater initialization.
 */
function initUpdater(getMainWindow, currentVersion) {
  function isTrustedSender(event) {
    const url = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    return typeof url === 'string' && (url.startsWith('file://') || url.startsWith('http://localhost:'));
  }

  function validateInstallerPath(installerPath) {
    if (!installerPath || typeof installerPath !== 'string') return false;
    const resolved = path.resolve(installerPath);
    const allowedRoots = [path.resolve(os.tmpdir()), path.resolve(app.getPath('userData'))];
    const inAllowedRoot = allowedRoots.some((root) => resolved.startsWith(root));
    return inAllowedRoot && resolved.toLowerCase().endsWith('.exe') && fs.existsSync(resolved);
  }

  let pollTimer = null;
  let isDownloading = false;

  // ── IPC Handlers ───────────────────────────────────────

  // Manual check (from settings page)
  ipcMain.handle('update:check', async () => {
    try {
      const info = await fetchUpdateInfo();
      if (!info || !info.latest_version) return { available: false };
      return {
        available: isNewerVersion(currentVersion, info.latest_version),
        currentVersion,
        latestVersion: info.latest_version,
        downloadUrl: info.download_url || '',
        releaseNotes: info.release_notes || '',
        mandatory: info.mandatory || false,
      };
    } catch {
      return { available: false };
    }
  });

  // Trigger install-and-restart via VBS
  ipcMain.handle('update:install-and-restart', async (event, { installerPath }) => {
    try {
      if (!isTrustedSender(event)) {
        return { success: false, error: 'Untrusted sender' };
      }
      if (!validateInstallerPath(installerPath)) {
        return { success: false, error: 'Invalid installer path' };
      }
      const execPath = app.getPath('exe');
      const vbsPath = generateVbsScript(installerPath, execPath);

      // Launch VBS invisibly via wscript
      spawn('wscript.exe', [vbsPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();

      // Give wscript a moment to start before quitting
      setTimeout(() => {
        app.isQuitting = true;
        app.quit();
      }, 500);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Auto-check on startup ───────────────────────────────

  // Check for "what's new" (version just changed after update)
  const lastVersion = loadState()?.installedVersion;
  if (lastVersion && lastVersion !== currentVersion) {
    // Version changed → load release notes and fire whats-new event
    setTimeout(async () => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const info = await fetchUpdateInfo();
      if (info) {
        win.webContents.send('update:whats-new', {
          newVersion: currentVersion,
          previousVersion: lastVersion,
          releaseNotes: info.release_notes || '',
        });
      }
      // Save current version so we don't show again
      saveState({ installedVersion: currentVersion });
    }, 3000);
  } else {
    // Record current version on first run
    saveState({ installedVersion: currentVersion });
  }

  // Recover pending download state
  const savedState = loadState();
  const hasUsableDownloadedInstaller =
    savedState?.downloadedPath &&
    fs.existsSync(savedState.downloadedPath) &&
    savedState?.latestVersion &&
    isNewerVersion(currentVersion, savedState.latestVersion);
  if (hasUsableDownloadedInstaller) {
    // File still there → ready to install
    setTimeout(() => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.webContents.send('update:ready', {
        latestVersion: savedState.latestVersion || '',
        downloadedPath: savedState.downloadedPath,
        releaseNotes: savedState.releaseNotes || '',
        currentVersion,
      });
    }, 2000);
  } else if (savedState?.downloadedPath) {
    clearState();
  }

  // ── Polling loop ────────────────────────────────────────

  async function checkForUpdates() {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || isDownloading) return;

    try {
      const info = await fetchUpdateInfo();
      if (!info || !info.latest_version) return;
      if (!isNewerVersion(currentVersion, info.latest_version)) return;

      const updatePayload = {
        currentVersion,
        latestVersion: info.latest_version,
        downloadUrl: info.download_url || '',
        releaseNotes: info.release_notes || '',
        mandatory: info.mandatory || false,
      };

      // Notify renderer: update available, starting silent download
      win.webContents.send('update:available', updatePayload);

      isDownloading = true;

      try {
        const filePath = await downloadInstaller(
          info.download_url,
          info.latest_version,
          ({ percent, status }) => {
            const w = getMainWindow();
            if (w && !w.isDestroyed()) {
              w.webContents.send('update:download-progress', { percent, status });
            }
          }
        );

        isDownloading = false;

        // Persist state so we can recover after reload
        saveState({
          installedVersion: currentVersion,
          downloadedPath: filePath,
          latestVersion: info.latest_version,
          releaseNotes: info.release_notes || '',
        });

        const w = getMainWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send('update:ready', {
            latestVersion: info.latest_version,
            downloadedPath: filePath,
            releaseNotes: info.release_notes || '',
            currentVersion,
          });
        }
      } catch (downloadErr) {
        isDownloading = false;
        console.error('[Updater] Download failed:', downloadErr);
        const w = getMainWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send('update:download-progress', { percent: 0, status: 'error', error: downloadErr.message });
        }
      }
    } catch (err) {
      console.error('[Updater] Check failed:', err);
    }
  }

  // First check after 8 seconds (app finishes loading)
  setTimeout(checkForUpdates, 8000);

  // Then poll every 60 seconds
  pollTimer = setInterval(checkForUpdates, POLL_INTERVAL_MS);

  // Cleanup on quit
  app.on('before-quit', () => {
    if (pollTimer) clearInterval(pollTimer);
  });
}

module.exports = { initUpdater };
