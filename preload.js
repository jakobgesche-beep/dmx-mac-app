const { contextBridge, ipcRenderer } = require("electron");
const on = (channel, cb) => ipcRenderer.on(channel, (event, ...args) => cb(...args));

contextBridge.exposeInMainWorld("dmxAPI", {
  // DMX-Anschluss
  listPorts: () => ipcRenderer.invoke("dmx-ports"),
  connect: (path) => ipcRenderer.invoke("dmx-connect", path),
  disconnect: () => ipcRenderer.invoke("dmx-disconnect"),
  setAutoConnect: (on_) => ipcRenderer.invoke("dmx-auto", on_),
  getStatus: () => ipcRenderer.invoke("dmx-status"),
  sendFrame: (frame, channels) => ipcRenderer.send("dmx-frame", frame, channels),
  blackout: () => ipcRenderer.invoke("dmx-blackout"),
  setFailsafe: (mode, seconds) => ipcRenderer.invoke("dmx-failsafe", mode, seconds),
  onStatus: (cb) => on("dmx-status", cb),
  onLog: (cb) => on("dmx-log", cb),
  // Show speichern
  projectLoad: () => ipcRenderer.invoke("project-load"),
  projectSave: (data) => ipcRenderer.invoke("project-save", data),
  projectExport: (data, name) => ipcRenderer.invoke("project-export", data, name),
  projectImport: () => ipcRenderer.invoke("project-import"),
  saveTextFile: (name, text) => ipcRenderer.invoke("save-text-file", name, text),
  // Kamera / Mikrofon
  mediaStatus: (type) => ipcRenderer.invoke("media-status", type),
  mediaRequest: (type) => ipcRenderer.invoke("media-request", type),
  openMediaSettings: (type) => ipcRenderer.invoke("media-open-settings", type),
  // Fenster und Updates
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getVersion: () => ipcRenderer.invoke("get-version"),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getUpdateState: () => ipcRenderer.invoke("get-update-state"),
  onUpdateState: (cb) => on("update-state", cb),
});
