const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0f',
    show: false,
  });

  // Show window only when content is ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Dual-launch logic: gracefully wait for Vite/Express to boot on port 5000
  const loadApp = () => {
    mainWindow.loadURL('http://localhost:5000').catch(err => {
      console.log('Server not ready yet, retrying in 1.5s...');
      setTimeout(loadApp, 1500);
    });
  };

  // Start trying after a short delay to give the server time to boot
  setTimeout(loadApp, 2500);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// When Electron is ready, create the window
app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
