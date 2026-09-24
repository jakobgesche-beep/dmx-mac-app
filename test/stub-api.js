// Simuliertes Hauptprogramm für die Oberflächen-Tests (ohne Electron, ohne Hardware).
(function () {
  const S = window.__api = { frames: [], saved: null, statusFn: null, updateFn: null, calls: [], status: { state: "disconnected", path: "", serial: "", firmware: "", verified: false, error: "", serialSupport: true },
    ports: [{ path: "/dev/cu.usbserial-EN123456", manufacturer: "ENTTEC", serialNumber: "EN123456", likely: true }, { path: "/dev/cu.Bluetooth", manufacturer: "", serialNumber: "", likely: false }],
    update: { state: "idle", version: "", progress: 0, message: "" }, version: "2.0.0" };
  const rec = (n, ...a) => { S.calls.push([n, ...a]); };
  window.dmxAPI = {
    listPorts: async () => ({ ok: true, ports: S.ports, serialSupport: true }),
    connect: async (p) => { rec("connect", p); S.status = { state: "connected", path: p, serial: "12345678", firmware: "1.04", verified: true, error: "", serialSupport: true, sent: 0, failed: 0 }; if (S.statusFn) S.statusFn(S.status); return { ok: true }; },
    disconnect: async () => { rec("disconnect"); S.status = { state: "disconnected", path: "", serial: "", firmware: "", verified: false, error: "", serialSupport: true }; if (S.statusFn) S.statusFn(S.status); return { ok: true }; },
    setAutoConnect: async (v) => { rec("auto", v); return { ok: true }; },
    getStatus: async () => S.status,
    sendFrame: (f, c) => { S.frames.push({ f: new Uint8Array(f), c }); if (S.frames.length > 400) S.frames.shift(); },
    blackout: async () => { rec("blackout"); return { ok: true }; },
    setFailsafe: async (m, s) => { rec("failsafe", m, s); return { ok: true }; },
    onStatus: (cb) => { S.statusFn = cb; }, onLog: () => {},
    projectLoad: async () => S.saved, projectSave: async (p) => { S.saved = JSON.parse(JSON.stringify(p)); S.saveCount = (S.saveCount || 0) + 1; return { ok: true }; },
    projectExport: async (p, n) => { rec("export", n); S.exported = p; return { ok: true, path: "/x/" + n + ".dmxshow" }; },
    projectImport: async () => ({ ok: true, data: S.importData || { name: "Importiert", fixtures: [] } }),
    saveTextFile: async () => ({ ok: true }),
    mediaStatus: async () => "granted", mediaRequest: async () => "granted", openMediaSettings: async () => true,
    toggleFullscreen: async () => { S.full = (S.full || 0) + 1; return true; },
    getVersion: async () => S.version, checkUpdate: async () => { rec("checkUpdate"); return S.update.state; },
    installUpdate: async () => { rec("installUpdate"); return { ok: true }; },
    getUpdateState: async () => S.update, onUpdateState: (cb) => { S.updateFn = cb; },
  };
  S.last = () => S.frames.length ? S.frames[S.frames.length - 1].f : new Uint8Array(512);
})();
