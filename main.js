const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Path to the Python script, adjusted for production
const appIsPackaged = app.isPackaged;
const pythonExecutable = 'python3';

let pythonScriptPath;
if (appIsPackaged) {
    // In a packaged app, the unpacked files are in a directory
    // alongside the asar archive.
    pythonScriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'nbfc_control_api.py');
} else {
    // In development, we can use a relative path.
    pythonScriptPath = path.join(__dirname, 'backend', 'nbfc_control_api.py');
}

console.log(`[Main] Python script path: ${pythonScriptPath}`);

// Check if the Python script exists before continuing
if (!fs.existsSync(pythonScriptPath)) {
  console.error(`[Main] Python script not found: ${pythonScriptPath}`);
  app.quit();
  return; // Stop execution if the script is not found
}

let mainWindow;
let pythonProcess = null;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    frame: false,
    show: false // Don't show until everything is ready
  });

  // Load the HTML interface
  let indexPath;
  if (app.isPackaged) {
    // In production, use the absolute path to the file in the unpacked renderer directory
    indexPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'renderer', 'index.html');
  } else {
    // In development, use a path relative to __dirname
    indexPath = path.join(__dirname, 'renderer', 'index.html');
  }
  console.log(`[Main] Loading HTML from: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  // Show the window once it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    startPythonBackend();
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    stopPythonBackend();
    mainWindow = null;
  });
}

// Start the Python backend script
function startPythonBackend() {
  try {
    console.log('[Main] Starting Python backend...');
    pythonProcess = spawn(pythonExecutable, [pythonScriptPath]);
    
    // Handle output from the Python script
    pythonProcess.stdout.on('data', (data) => {
      try {
        const message = data.toString().trim();
        // If it's JSON, send it to the frontend
        if (message.startsWith('{')) {
          const jsonData = JSON.parse(message);
          if (mainWindow) {
            mainWindow.webContents.send('fan-data', jsonData);
          }
        } else {
          console.log(`[Python] ${message}`);
        }
      } catch (err) {
        console.error('[Main] Error processing Python data:', err.message);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python] Error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Main] Python process exited with code: ${code}`);
      pythonProcess = null;
    });

  } catch (err) {
    console.error('[Main] Error starting Python backend:', err);
  }
}

// Stop the Python script
function stopPythonBackend() {
  if (pythonProcess) {
    console.log('[Main] Stopping Python backend...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

// Initialize the application
app.whenReady().then(createWindow);

// Quit the app if all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPythonBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC event handlers to communicate with the frontend
ipcMain.on('set-fan-speed', (event, data) => {
  // Check if the Python process is running
  if (!pythonProcess) {
    console.error('[Main] Python backend is not running.');
    return;
  }
  
  // Send a command to the Python script
  if (data.fanId !== undefined) {
    // Set speed for a specific fan
    pythonProcess.stdin.write(`set_fan_speed ${data.fanId} ${data.speed}\n`);
  } else {
    // Set speed for all fans
    pythonProcess.stdin.write(`set_all_fans_speed ${data.speed}\n`);
  }
});

ipcMain.on('set-mode', (event, isDynamic) => {
  if (!pythonProcess) return;
  pythonProcess.stdin.write(`set_mode ${isDynamic ? 'dynamic' : 'fixed'}\n`);
});

ipcMain.on('apply-profile', (event, profile) => {
  if (!pythonProcess) return;
  pythonProcess.stdin.write(`apply_profile ${profile}\n`);
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});