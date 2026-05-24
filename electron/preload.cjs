// Preload script — expone APIs seguras al renderer via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Backups y Sistema de Archivos ────────────────────
  // Seleccionar directorio de backup (abre diálogo nativo)
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Crear backup inmediato ahora
  backupNow: (backupPath) => ipcRenderer.invoke('backup:now', { backupPath }),

  // Escuchar resultado de backup (éxito o error)
  onBackupResult: (callback) => {
    ipcRenderer.on('backup:result', (_event, data) => callback(data));
  },

  removeBackupListeners: () => {
    ipcRenderer.removeAllListeners('backup:result');
  },

  // ── Actualizaciones ──────────────────────────────────
  // Verificación manual
  checkForUpdates: () => ipcRenderer.invoke('update:check'),

  // Escuchar evento: nueva versión detectada (inicio de descarga silenciosa)
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', (_event, data) => callback(data));
  },

  // Escuchar progreso de descarga (5% increments)
  // data: { percent: number, status: 'downloading' | 'error', error?: string }
  onDownloadProgress: (callback) => {
    ipcRenderer.on('update:download-progress', (_event, data) => callback(data));
  },

  // Escuchar evento: descarga completa, listo para instalar
  // data: { latestVersion, downloadedPath, releaseNotes, currentVersion }
  onUpdateReady: (callback) => {
    ipcRenderer.on('update:ready', (_event, data) => callback(data));
  },

  // Escuchar evento: app recién actualizada, mostrar "What's New"
  // data: { newVersion, previousVersion, releaseNotes }
  onWhatsNew: (callback) => {
    ipcRenderer.on('update:whats-new', (_event, data) => callback(data));
  },

  // Instalar y reiniciar vía VBScript (silencioso)
  installAndRestart: (installerPath) => ipcRenderer.invoke('update:install-and-restart', { installerPath }),

  // Limpiar todos los listeners de actualización
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.removeAllListeners('update:download-progress');
    ipcRenderer.removeAllListeners('update:ready');
    ipcRenderer.removeAllListeners('update:whats-new');
  },
});
