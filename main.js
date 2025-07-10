const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Chemin vers le script Python
const pythonScript = path.join(__dirname, 'backend', 'nbfc_control_api.py');

// Vérifier si le script Python existe
if (!fs.existsSync(pythonScript)) {
  console.error(`Script Python non trouvé: ${pythonScript}`);
  app.quit();
}

let mainWindow;
let pythonProcess = null;

// Créer la fenêtre principale
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
    show: false // Ne pas afficher jusqu'à ce que tout soit prêt
  });

  // Charger l'interface HTML
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Afficher la fenêtre une fois chargée
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    startPythonBackend();
  });

  // Nettoyer à la fermeture
  mainWindow.on('closed', () => {
    stopPythonBackend();
    mainWindow = null;
  });
}

// Démarrer le script Python backend
function startPythonBackend() {
  try {
    console.log('Démarrage du backend Python...');
    pythonProcess = spawn('python3', [pythonScript]);
    
    // Gérer la sortie du script Python
    pythonProcess.stdout.on('data', (data) => {
      try {
        const message = data.toString().trim();
        // Si c'est du JSON, on l'envoie au frontend
        if (message.startsWith('{')) {
          const jsonData = JSON.parse(message);
          if (mainWindow) {
            mainWindow.webContents.send('fan-data', jsonData);
          }
        } else {
          console.log(`Python: ${message}`);
        }
      } catch (err) {
        console.error('Erreur de traitement des données Python:', err.message);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Erreur Python: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Le processus Python s'est terminé avec le code: ${code}`);
      pythonProcess = null;
    });

  } catch (err) {
    console.error('Erreur lors du démarrage du backend Python:', err);
  }
}

// Arrêter le script Python
function stopPythonBackend() {
  if (pythonProcess) {
    console.log('Arrêt du backend Python...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

// Initialiser l'application
app.whenReady().then(createWindow);

// Quitter l'application si toutes les fenêtres sont fermées (sauf sur macOS)
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

// Gestionnaires d'événements IPC pour communiquer avec le frontend
ipcMain.on('set-fan-speed', (event, data) => {
  // Vérifier si le processus Python est en cours d'exécution
  if (!pythonProcess) {
    console.error('Le backend Python n\'est pas en cours d\'exécution');
    return;
  }
  
  // Envoyer une commande au script Python
  if (data.fanId !== undefined) {
    // Définir la vitesse d'un ventilateur spécifique
    pythonProcess.stdin.write(`set_fan_speed ${data.fanId} ${data.speed}\n`);
  } else {
    // Définir la vitesse de tous les ventilateurs
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

// Contrôles de fenêtre
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