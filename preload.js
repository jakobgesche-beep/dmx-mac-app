const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dmxAPI", {
  listPorts: () => ipcRenderer.invoke("list-ports"),
  connect: (portPath) => ipcRenderer.invoke("connect", portPath),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  sendUniverse: (values) => ipcRenderer.invoke("send-universe", Array.from(values)),
  listSequences: () => ipcRenderer.invoke("list-sequences"),
  saveSequence: (name, code) => ipcRenderer.invoke("save-sequence", { name, code }),
  deleteSequence: (id) => ipcRenderer.invoke("delete-sequence", id),
  onLog: (callback) => ipcRenderer.on("dmx-log", (event, msg) => callback(msg)),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdateNow: () => ipcRenderer.invoke("install-update-now"),
  onUpdateReady: (callback) => ipcRenderer.on("update-ready", (event, version) => callback(version)),
});
