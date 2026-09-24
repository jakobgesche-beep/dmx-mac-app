// DMX Lichtsteuerung: Hauptprogramm (Fenster, Enttec-DMX-Anschluss, Speichern der Show, Updates, Kamera-/Mikrofon-Freigabe).
// Die Licht-Logik selbst läuft in der Oberfläche (shared/engine.js); hier wird nur das fertige DMX-Bild ausgegeben.
const { app, BrowserWindow, ipcMain, shell, powerSaveBlocker, session, systemPreferences, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const Dmx = require("./shared/dmx");
const UpdateUtil = require("./shared/update-util");

let SerialPort = null, serialError = null;
try { ({ SerialPort } = require("serialport")); } catch (e) { serialError = e.message; }     // ohne den Treiber läuft die App im Simulationsmodus

// Live-Betrieb: macOS ("App Nap") und Chromium drosseln verdeckte Fenster, dann liefe das Licht ruckelig.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

let mainWindow = null;
function toRenderer(channel, ...args) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args); }
function log(msg) { toRenderer("dmx-log", msg); }

// ---------- DMX-Anschluss (Enttec DMX USB PRO) ----------
let port = null, output = null, outputTimer = null, sleepBlocker = null, autoTimer = null, watchdogTimer = null;
let autoEnabled = true, manualDisconnect = false, lastFrameAt = Date.now(), failsafe = { mode: "hold", seconds: 5 }, failsafeTripped = false;
let status = { state: "disconnected", path: "", serial: "", firmware: "", verified: false, error: "", serialSupport: true };

function setStatus(patch) {
  status = Object.assign({}, status, patch, { serialSupport: !!SerialPort });
  if (output) status.sent = output.sent, status.failed = output.failed;
  toRenderer("dmx-status", status);
}
const looksLikeEnttec = (p) => /enttec/i.test(p.manufacturer || "") || /^EN/i.test(p.serialNumber || "") || ((p.vendorId || "").toLowerCase() === "0403" && (p.productId || "").toLowerCase() === "6001");

async function listPorts() {
  if (!SerialPort) return [];
  const list = await SerialPort.list();
  const seen = new Map();
  list.forEach((p) => {
    const key = p.serialNumber || p.path;
    const entry = { path: p.path, manufacturer: p.manufacturer || "", serialNumber: p.serialNumber || "", vendorId: p.vendorId || "", productId: p.productId || "", likely: looksLikeEnttec(p) };
    const old = seen.get(key);
    if (!old || /\/cu\./.test(entry.path)) seen.set(key, entry);           // auf dem Mac gibt es "tty." und "cu." für dasselbe Gerät: "cu." nehmen
  });
  return Array.from(seen.values());
}

function stopOutput() {
  if (outputTimer) { clearInterval(outputTimer); outputTimer = null; }
  if (sleepBlocker !== null) { powerSaveBlocker.stop(sleepBlocker); sleepBlocker = null; }
  output = null;
}

async function closePort(blackout) {
  const p = port;
  if (output && blackout) { try { output.blackout(); } catch (e) {} }
  stopOutput();
  port = null;
  if (p && p.isOpen) await new Promise((resolve) => { try { p.drain(() => p.close(() => resolve())); } catch (e) { resolve(); } setTimeout(resolve, 400); });
}

async function connectPort(portPath) {
  if (!SerialPort) return { ok: false, error: "Serieller Treiber nicht verfügbar (" + (serialError || "unbekannt") + ")" };
  await closePort(false);
  setStatus({ state: "connecting", path: portPath, error: "", verified: false, serial: "", firmware: "" });
  return new Promise((resolve) => {
    const p = new SerialPort({ path: portPath, baudRate: 57600, dataBits: 8, stopBits: 1, parity: "none", autoOpen: false });
    p.open((err) => {
      if (err) { setStatus({ state: "error", error: err.message }); resolve({ ok: false, error: err.message }); return; }
      port = p;
      let rx = new Uint8Array(0);
      p.on("data", (buf) => {
        const merged = new Uint8Array(rx.length + buf.length); merged.set(rx); merged.set(buf, rx.length);
        const r = Dmx.parsePackets(merged); rx = r.rest;
        r.packets.forEach((pkt) => { const d = Dmx.describeReply(pkt); if (d) setStatus(Object.assign({ verified: true }, d)); });
      });
      p.on("error", (e) => { log("Serieller Fehler: " + e.message); setStatus({ state: "error", error: e.message }); });
      p.on("close", () => {                                            // Kabel gezogen oder Gerät weg
        if (port === p) { stopOutput(); port = null; setStatus({ state: "disconnected", error: manualDisconnect ? "" : "Verbindung verloren – suche das Gerät wieder…" }); }
      });
      output = new Dmx.DmxOutput({
        write: (packet) => new Promise((res, rej) => { p.write(Buffer.from(packet), (e) => (e ? rej(e) : res())); }),
        onError: (e) => { log("Fehler beim Senden: " + e.message); setStatus({ state: "error", error: e.message }); },
      });
      outputTimer = setInterval(() => { try { output && output.tick(); } catch (e) {} }, 10);
      sleepBlocker = powerSaveBlocker.start("prevent-app-suspension");
      manualDisconnect = false; failsafeTripped = false;
      setStatus({ state: "connected", path: portPath, error: "" });
      p.write(Buffer.from(Dmx.requestSerial()), () => {});             // Seriennummer und Firmware abfragen (zur Kontrolle)
      p.write(Buffer.from(Dmx.requestParams()), () => {});
      setTimeout(() => { if (port === p && !status.verified) setStatus({ error: "Das Gerät antwortet nicht auf die Abfrage. Ist es wirklich ein Enttec DMX USB PRO?" }); }, 1500);
      resolve({ ok: true });
    });
  });
}

// automatisch verbinden, sobald ein Enttec-Gerät gefunden wird (auch nach Wiedereinstecken)
async function autoConnectOnce() {
  if (!autoEnabled || port || status.state === "connecting" || !SerialPort) return;
  try {
    const ports = await listPorts();
    const enttec = ports.filter((p) => p.likely);
    if (enttec.length >= 1) await connectPort(enttec[0].path);
  } catch (e) { /* nächster Versuch in 3 s */ }
}

ipcMain.handle("dmx-ports", async () => { try { return { ok: true, ports: await listPorts(), serialSupport: !!SerialPort }; } catch (e) { return { ok: false, error: e.message, ports: [] }; } });
ipcMain.handle("dmx-connect", async (event, portPath) => { autoEnabled = true; return connectPort(portPath); });
ipcMain.handle("dmx-disconnect", async () => { manualDisconnect = true; autoEnabled = false; await closePort(true); setStatus({ state: "disconnected", error: "" }); return { ok: true }; });
ipcMain.handle("dmx-auto", async (event, on) => { autoEnabled = !!on; if (autoEnabled) autoConnectOnce(); return { ok: true }; });
ipcMain.handle("dmx-status", async () => status);
// Bild vom Lichtkern (oft aufgerufen, ohne Antwort, damit es schnell bleibt)
ipcMain.on("dmx-frame", (event, frame, channels) => {
  lastFrameAt = Date.now();
  if (failsafeTripped) failsafeTripped = false;
  if (!output || !frame) return;
  if (channels) output.setChannels(channels);
  output.setFrame(frame instanceof Uint8Array ? frame : new Uint8Array(frame));
});
ipcMain.handle("dmx-blackout", async () => { if (output) output.blackout(); return { ok: true }; });
// Wenn die Oberfläche länger keine Bilder mehr liefert (Absturz): Licht halten (Standard) oder dunkel schalten
ipcMain.handle("dmx-failsafe", async (event, mode, seconds) => { failsafe = { mode: mode === "blackout" ? "blackout" : "hold", seconds: Math.max(1, Math.min(60, +seconds || 5)) }; return { ok: true }; });
watchdogTimer = setInterval(() => {
  if (failsafe.mode === "blackout" && output && !failsafeTripped && Date.now() - lastFrameAt > failsafe.seconds * 1000) { failsafeTripped = true; output.blackout(); log("Oberfläche antwortet nicht mehr: Licht wurde dunkel geschaltet (Failsafe)."); }
}, 1000);

// ---------- Fenster, Berechtigungen ----------
function trusted(wc) { return !!mainWindow && !mainWindow.isDestroyed() && (wc === null || wc === mainWindow.webContents); }
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(permission === "media" && trusted(wc)));
  ses.setPermissionCheckHandler((wc, permission) => permission === "media" && trusted(wc));
}
const mediaStatus = (type) => (process.platform === "darwin" ? systemPreferences.getMediaAccessStatus(type) : "granted");
ipcMain.handle("media-status", async (event, type) => (type === "camera" || type === "microphone" ? mediaStatus(type) : "denied"));
ipcMain.handle("media-request", async (event, type) => {
  if (type !== "camera" && type !== "microphone") return "denied";
  if (process.platform === "darwin" && mediaStatus(type) === "not-determined") { try { await systemPreferences.askForMediaAccess(type); } catch (e) { log("Anfrage fehlgeschlagen: " + e.message); } }
  return mediaStatus(type);
});
ipcMain.handle("media-open-settings", async (event, type) => {
  const pane = type === "camera" ? "Privacy_Camera" : "Privacy_Microphone";
  if (process.platform === "darwin") await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?" + pane);
  return true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, backgroundColor: "#1c1c1e", title: "DMX Lichtsteuerung",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);          // kein Zoomen mit zwei Fingern
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("focus", () => checkForUpdate(false));
}
ipcMain.handle("toggle-fullscreen", async () => { if (!mainWindow || mainWindow.isDestroyed()) return false; mainWindow.setFullScreen(!mainWindow.isFullScreen()); return mainWindow.isFullScreen(); });

// ---------- Show speichern und laden ----------
const projectFile = () => path.join(app.getPath("userData"), "project.json");
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; } }
ipcMain.handle("project-load", async () => readJson(projectFile()) || readJson(projectFile() + ".bak"));
ipcMain.handle("project-save", async (event, data) => {
  try {
    const file = projectFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + ".bak"); } catch (e) {} }         // letzte Fassung als Sicherung
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("project-export", async (event, data, suggestedName) => {
  const safe = path.basename(String(suggestedName || "Show")).replace(/[^\w.\- äöüÄÖÜß]/g, "_").slice(0, 60) || "Show";
  const res = await dialog.showSaveDialog(mainWindow, { title: "Show speichern", defaultPath: path.join(app.getPath("documents"), safe + ".dmxshow"), filters: [{ name: "DMX-Show", extensions: ["dmxshow", "json"] }] });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2)); return { ok: true, path: res.filePath }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("project-import", async () => {
  const res = await dialog.showOpenDialog(mainWindow, { title: "Show öffnen", properties: ["openFile"], filters: [{ name: "DMX-Show", extensions: ["dmxshow", "json"] }] });
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
  const data = readJson(res.filePaths[0]);
  return data ? { ok: true, data } : { ok: false, error: "Die Datei ist keine gültige Show." };
});
ipcMain.handle("save-text-file", async (event, name, text) => {
  if (typeof name !== "string" || typeof text !== "string" || text.length > 5000000) return { ok: false, error: "Ungültige Daten." };
  const safe = path.basename(name).replace(/[^\w.\- äöüÄÖÜß]/g, "_").slice(0, 80) || "Datei.txt";
  const res = await dialog.showSaveDialog(mainWindow, { title: "Speichern", defaultPath: path.join(app.getPath("documents"), safe) });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(res.filePath, text, "utf8"); return { ok: true, path: res.filePath }; } catch (e) { return { ok: false, error: e.message }; }
});

// ---------- Eigener Updater ----------
// electron-updater/Squirrel.Mac verlangt eine echte Apple-Signatur und bricht bei ad-hoc-signierten Apps stillschweigend ab.
// Deshalb: die App prüft regelmäßig (auch während sie läuft), lädt eine neue .zip von GitHub selbst im Hintergrund, entpackt
// und prüft sie, und tauscht die App-Datei beim Neustart aus (Klick auf "Jetzt neu starten") oder beim normalen Beenden.
const UPDATE_REPO = "jakobgesche-beep/dmx-mac-app";
const UPDATE_ASSET = "DMX-Lichtsteuerung.zip";
const UPDATE_EVERY_MS = 10 * 60 * 1000;
let update = { state: "idle", version: "", progress: 0, message: "", newAppPath: "", bundlePath: "", workDir: "" };
let lastCheck = 0, checking = false;

function pushUpdate(patch) {
  update = Object.assign({}, update, patch);
  toRenderer("update-state", { state: update.state, version: update.version, progress: update.progress, message: update.message });
}
function run(cmd, args) {
  return new Promise((resolve, reject) => { execFile(cmd, args, (err, stdout, stderr) => (err ? reject(new Error(cmd + ": " + (stderr || err.message))) : resolve(stdout))); });
}
async function findLatestRelease() {
  const res = await fetch("https://api.github.com/repos/" + UPDATE_REPO + "/releases?per_page=10", { headers: { Accept: "application/vnd.github+json", "User-Agent": "dmx-lichtsteuerung" } });
  if (!res.ok) throw new Error("GitHub antwortet mit Status " + res.status);
  return UpdateUtil.pickRelease(await res.json(), UPDATE_ASSET);
}

async function downloadAndPrepare(latest) {
  const bundlePath = path.resolve(app.getPath("exe"), "..", "..", "..");
  if (!bundlePath.endsWith(".app")) throw new Error("App-Pfad nicht erkannt.");
  try { fs.accessSync(path.dirname(bundlePath), fs.constants.W_OK); }
  catch (e) { throw new Error("Kein Schreibzugriff auf den Programme-Ordner – bitte die neue Version von Hand installieren."); }
  const workDir = path.join(app.getPath("temp"), "dmx-update");
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const zipPath = path.join(workDir, "update.zip"), extractDir = path.join(workDir, "extracted");
  pushUpdate({ state: "downloading", version: latest.version, progress: 0, message: "" });
  const res = await fetch(latest.zipUrl, { redirect: "follow" });
  if (!res.ok) throw new Error("Download fehlgeschlagen (Status " + res.status + ")");
  const total = Number(res.headers.get("content-length")) || latest.size || 0;
  let received = 0, lastPercent = -1;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    received += chunk.length;
    const percent = total ? Math.floor((received / total) * 100) : 0;
    if (percent !== lastPercent) { lastPercent = percent; pushUpdate({ progress: percent }); }
  });
  await pipeline(body, fs.createWriteStream(zipPath));
  await run("ditto", ["-x", "-k", zipPath, extractDir]);
  const newApp = fs.readdirSync(extractDir).find((n) => n.endsWith(".app"));
  if (!newApp) throw new Error("Im Update wurde keine App gefunden.");
  const newAppPath = path.join(extractDir, newApp);
  await run("codesign", ["--verify", "--deep", newAppPath]);
  const scriptPath = path.join(workDir, "apply-update.sh");
  fs.writeFileSync(scriptPath, UpdateUtil.swapScript(), { mode: 0o755 });
  pushUpdate({ state: "ready", version: latest.version, progress: 100, newAppPath, bundlePath, workDir, message: "" });
}

async function checkForUpdate(force) {
  if (!app.isPackaged || process.platform !== "darwin" || checking || update.state === "downloading" || update.state === "ready") return;
  if (!force && Date.now() - lastCheck < 2 * 60 * 1000) return;
  checking = true; lastCheck = Date.now();
  try {
    const latest = await findLatestRelease();
    if (latest && UpdateUtil.isNewer(latest.version, app.getVersion())) await downloadAndPrepare(latest);
    else if (force) pushUpdate({ state: "current", message: "Du hast schon die neueste Version." });
  } catch (e) { pushUpdate({ state: "error", message: e.message }); log("Update: " + e.message); }
  finally { checking = false; }
}
let updateApplied = false;
function applyUpdate(reopen) {
  if (updateApplied) return;                                         // nur einmal einspielen (Klick auf "Jetzt neu starten" und danach normales Beenden)
  updateApplied = true;
  const logPath = path.join(app.getPath("userData"), "update.log");
  spawn("/bin/bash", [path.join(update.workDir, "apply-update.sh"), String(process.pid), update.newAppPath, update.bundlePath, logPath, reopen ? "1" : "0"], { detached: true, stdio: "ignore" }).unref();
}
ipcMain.handle("check-update", async () => { await checkForUpdate(true); return update.state; });
ipcMain.handle("install-update", async () => {
  if (update.state !== "ready") return { ok: false, error: "Kein Update bereit." };
  if (status.state === "connected") await closePort(true);
  applyUpdate(true);
  app.quit();
  return { ok: true };
});
ipcMain.handle("get-version", async () => app.getVersion());
ipcMain.handle("get-update-state", async () => ({ state: update.state, version: update.version, progress: update.progress, message: update.message }));

// ---------- Start und Ende ----------
let quitting = false;
app.whenReady().then(() => {
  setupPermissions();
  createWindow();
  setInterval(() => checkForUpdate(false), UPDATE_EVERY_MS);
  setTimeout(() => checkForUpdate(false), 5000);
  autoTimer = setInterval(autoConnectOnce, 3000);
  autoConnectOnce();
});
app.on("window-all-closed", () => app.quit());
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  if (update.state === "ready") applyUpdate(false);                   // fertig geladenes Update beim normalen Beenden einspielen
  if (port) {                                                         // Licht dunkel schalten und warten, bis das Paket wirklich beim Enttec ankommt
    event.preventDefault();
    closePort(true).catch(() => {}).then(() => app.quit());
  }
});
