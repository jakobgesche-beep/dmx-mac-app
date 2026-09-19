const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const { autoUpdater } = require("electron-updater");
const { NUM_CHANNELS, SERIAL_OPTIONS, buildDmxOutputPacket } = require("./dmx-protocol");

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("checking-for-update", () => log("Suche nach Updates..."));
autoUpdater.on("update-available", (info) => log("Update gefunden: Version " + info.version + " wird heruntergeladen..."));
autoUpdater.on("update-not-available", () => log("Kein Update verfügbar, aktuelle Version ist die neueste."));
autoUpdater.on("error", (err) => log("Update-Fehler: " + err.message));
autoUpdater.on("download-progress", (p) => log("Update-Download: " + Math.round(p.percent) + "%"));
autoUpdater.on("update-downloaded", (info) => {
  log("Update " + info.version + " heruntergeladen — wird beim nächsten Beenden der App installiert.");
  if (mainWindow) mainWindow.webContents.send("update-ready", info.version);
});

let mainWindow = null;
let serialPort = null;
const universe = new Uint8Array(NUM_CHANNELS);

function log(msg) {
  if (mainWindow) mainWindow.webContents.send("dmx-log", msg);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 960,
    backgroundColor: "#0D1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((e) => log("Update-Prüfung fehlgeschlagen: " + e.message));
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  // Blackout beim Beenden, damit keine Kanäle "hängen" bleiben.
  if (serialPort && serialPort.isOpen) {
    universe.fill(0);
    try { serialPort.write(Buffer.from(buildDmxOutputPacket(universe))); } catch (e) {}
  }
});

// ---------- Serielle Verbindung ----------
ipcMain.handle("list-ports", async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer || "" }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle("connect", async (event, portPath) => {
  return new Promise((resolve) => {
    try {
      if (serialPort && serialPort.isOpen) {
        serialPort.close(() => {});
        serialPort = null;
      }
      serialPort = new SerialPort({ path: portPath, ...SERIAL_OPTIONS }, (err) => {
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }
        resolve({ ok: true });
      });
      serialPort.on("error", (err) => log("Serieller Fehler: " + err.message));
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
});

ipcMain.handle("disconnect", async () => {
  return new Promise((resolve) => {
    if (!serialPort) {
      resolve({ ok: true });
      return;
    }
    serialPort.close(() => {
      serialPort = null;
      resolve({ ok: true });
    });
  });
});

ipcMain.handle("send-universe", async (event, values) => {
  universe.set(values);
  const packet = buildDmxOutputPacket(universe);
  if (serialPort && serialPort.isOpen) {
    return new Promise((resolve) => {
      serialPort.write(Buffer.from(packet), (err) => {
        if (err) {
          log("Fehler beim Senden: " + err.message);
          resolve({ ok: false, error: err.message });
        } else {
          resolve({ ok: true, simulated: false, bytes: packet.length });
        }
      });
    });
  }
  return { ok: true, simulated: true, bytes: packet.length };
});

// ---------- Sequenzen lokal speichern (JSON-Datei im Nutzerverzeichnis) ----------
function seqFilePath() {
  return path.join(app.getPath("userData"), "sequences.json");
}
function loadSequences() {
  try {
    return JSON.parse(fs.readFileSync(seqFilePath(), "utf8"));
  } catch (e) {
    return [];
  }
}
function saveSequencesFile(list) {
  fs.writeFileSync(seqFilePath(), JSON.stringify(list, null, 2));
}

ipcMain.handle("list-sequences", async () => loadSequences());

ipcMain.handle("save-sequence", async (event, { name, code }) => {
  const list = loadSequences();
  list.unshift({ id: Date.now(), name, code, created_at: new Date().toISOString() });
  saveSequencesFile(list);
  return list;
});

ipcMain.handle("delete-sequence", async (event, id) => {
  const list = loadSequences().filter((s) => s.id !== id);
  saveSequencesFile(list);
  return list;
});

// ---------- Auto-Update ----------
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) {
    log("Update-Prüfung übersprungen (App läuft ungebaut über 'npm start').");
    return { ok: false, reason: "not-packaged" };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle("install-update-now", async () => {
  autoUpdater.quitAndInstall();
});
