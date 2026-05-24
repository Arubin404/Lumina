const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { initUpdater } = require('./updater.cjs');

// ─── Backup helpers (self-contained so no TS import needed) ───────────────────
const appDataEnv = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const defaultDataDir = path.join(appDataEnv, 'CajaLumina', '.data');

function getDataDir() {
  // In production, DATABASE_PATH is set before the backend starts
  return process.env.DATABASE_PATH || defaultDataDir;
}

function getDbPath() {
  return path.join(getDataDir(), 'cajaprofesional.db');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function applyRetention(dir, maxBackups) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('cajaprofesional-') && f.endsWith('.db'))
      .sort();
    while (files.length > maxBackups) {
      const oldest = files.shift();
      try { fs.unlinkSync(path.join(dir, oldest)); } catch (_) {}
    }
  } catch (_) {}
}

function performElectronBackup(backupPath, backupRetention, retentionEnabled) {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return { success: false, error: 'DB not found' };

  const dataDir = getDataDir();
  const internalBackupDir = path.join(dataDir, 'backups');
  ensureDir(internalBackupDir);

  const maxBackups = retentionEnabled !== false ? (backupRetention || 30) : 999;
  const ts = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  const filename = `cajaprofesional-${ts}.db`;

  try {
    // Internal backup
    fs.copyFileSync(dbPath, path.join(internalBackupDir, filename));
    applyRetention(internalBackupDir, maxBackups);

    // External backup (if configured)
    let externalPath;
    if (backupPath && backupPath.trim() !== '') {
      const extDir = backupPath.trim();
      if (fs.existsSync(extDir) || fs.existsSync(path.dirname(extDir))) {
        ensureDir(extDir);
        fs.copyFileSync(dbPath, path.join(extDir, filename));
        applyRetention(extDir, maxBackups);
        externalPath = path.join(extDir, filename);
      }
    }
    return { success: true, externalPath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

let mainWindow;
let tray = null;
let serverPort = 5000; // Default fallback

// Suppress EPIPE errors (happens when Electron's stderr pipe is closed)
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

// Configurar el AppUserModelId ANTES de todo para evitar duplicados en la barra de tareas
app.setAppUserModelId('com.cajalumina.app');

// Ensure single instance lock to prevent DB corruption
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Log crashes to files for debugging
process.on('uncaughtException', (err) => {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'crash-uncaught.log'), String(err.stack || err));
  } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'crash-rejection.log'), String(reason && reason.stack || reason));
  } catch (_) {}
});

// Helper: resolve icon path depending on dev vs packaged
function getIconPath() {
  // In packaged app, dist/public has the built assets (Vite copies client/public/ there)
  // In dev, client/public/ has the icon
  const prodIcon = path.join(__dirname, '..', 'dist', 'public', 'icon.png');
  const devIcon = path.join(__dirname, '..', 'client', 'public', 'icon.png');
  return app.isPackaged ? prodIcon : devIcon;
}

// Function to find a free port
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

function createWindow() {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Caja Lumina',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0f',
    show: false,
    icon: iconPath
  });

  // Show window only when content is ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Start polling to wait for the Vite/Express server to boot
  let retryCount = 0;
  const maxRetries = 30;
  const loadApp = () => {
    mainWindow.loadURL(`http://localhost:${serverPort}`).catch(err => {
      retryCount += 1;
      if (retryCount >= maxRetries) {
        const { dialog } = require('electron');
        dialog.showErrorBox('Error de Inicio', 'No se pudo conectar al servidor interno después de varios intentos.');
        app.quit();
        return;
      }
      console.log(`Server not ready yet at port ${serverPort}, retrying in 1s... (${retryCount}/${maxRetries})`);
      setTimeout(loadApp, 1000);
    });
  };

  setTimeout(loadApp, 1500);

  // Al cerrar con la X, se cierra completamente la aplicación
  mainWindow.on('close', function () {
    app.isQuitting = true;
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = getIconPath();

  try {
    tray = new Tray(iconPath);
  } catch (err) {
    console.error('Failed to create tray icon:', err);
    return;
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir Caja Lumina', click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      } 
    },
    { type: 'separator' },
    { label: 'Salir Completamente', click: () => {
        app.isQuitting = true;
        if (tray) { tray.destroy(); tray = null; }
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Caja Lumina');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (app.isPackaged) {
    // In production, find a free port and start the compiled backend
    try {
      serverPort = await getFreePort();
      process.env.PORT = serverPort.toString();
      process.env.NODE_ENV = 'production';
      // Definir la ruta de la base de datos para que el backend sepa dónde guardarla
      const userDataPath = app.getPath('userData');
      process.env.DATABASE_PATH = path.join(userDataPath, '.data');
      
      console.log(`Starting production server on port ${serverPort}`);
      console.log(`Database path: ${process.env.DATABASE_PATH}`);

      const backendPath = path.join(__dirname, '..', 'dist', 'index.cjs');
      require(backendPath);
    } catch (err) {
      const errorMsg = `Error al iniciar el backend: ${err.stack || err}`;
      console.error(errorMsg);
      try {
        fs.writeFileSync(path.join(app.getPath('userData'), 'backend-crash.log'), errorMsg);
      } catch (_) {}
      
      const { dialog } = require('electron');
      dialog.showErrorBox('Error de Inicio', 'No se pudo iniciar el servidor interno. La aplicación podría no funcionar correctamente.\n\n' + err.message);
    }
  }

  createWindow();
  createTray();

  // Inicializar el sistema de actualizaciones
  initUpdater(
    () => mainWindow,
    app.getVersion()
  );
});

app.on('window-all-closed', function () {
  app.quit();
});

app.on('before-quit', async (e) => {
  if (tray) { tray.destroy(); tray = null; }

  // Backup on close if configured — fetch config via HTTP then backup
  try {
    const configRes = await fetch(`http://localhost:${serverPort}/api/configuration`).catch(() => null);
    if (configRes && configRes.ok) {
      const config = await configRes.json();
      if (config.backupOnClose) {
        performElectronBackup(config.backupPath, config.backupRetention, config.retentionEnabled);
      }
    }
  } catch (_) {}
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Directory picker for backup path
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar carpeta de respaldo',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Seleccionar carpeta',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Manual backup trigger from renderer
ipcMain.handle('backup:now', async (event, args) => {
  try {
    const configRes = await fetch(`http://localhost:${serverPort}/api/configuration`).catch(() => null);
    if (!configRes || !configRes.ok) return { success: false, error: 'Server not reachable' };
    const config = await configRes.json();
    const activePath = args && args.backupPath !== undefined ? args.backupPath : config.backupPath;
    const result = performElectronBackup(activePath, config.backupRetention, config.retentionEnabled);
    // Notify the renderer
    if (mainWindow) mainWindow.webContents.send('backup:result', result);
    return result;
  } catch (e) {
    const result = { success: false, error: String(e) };
    if (mainWindow) mainWindow.webContents.send('backup:result', result);
    return result;
  }
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
