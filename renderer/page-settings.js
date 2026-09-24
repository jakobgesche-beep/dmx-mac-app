// Seite "Einstellungen": DMX-Ausgang, Kanal-Monitor, Show speichern/öffnen, Bühnengröße, Updates.
const SettingsPage = (function () {
  const api = window.dmxAPI;
  let root = null, ui = {}, status = { state: "disconnected" }, updateState = { state: "idle" }, ports = [], monitorPage = 0;

  function build(container) {
    root = container;
    root.innerHTML = "";
    const grid = el('<div class="settings-grid"></div>');
    grid.innerHTML =
      '<section class="card" id="set-dmx"><div class="card-title">DMX-Ausgang (Enttec DMX USB PRO)</div>' +
      '<div class="kv" id="dmx-kv"></div><p class="help" id="dmx-msg" style="margin-top:8px"></p>' +
      '<div class="row"><select id="port-select" style="flex:1;min-width:200px"></select><button id="port-refresh" class="btn small secondary">Liste aktualisieren</button></div>' +
      '<div class="row" style="margin-top:8px"><button id="port-connect" class="btn small">Verbinden</button><button id="port-disconnect" class="btn small secondary">Trennen</button></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="auto-conn"> Automatisch verbinden, sobald das Gerät steckt</label>' +
      '<div class="ctl-label" style="margin-top:12px"><span>Wenn die Oberfläche nicht mehr antwortet (Absturz)</span></div><div class="row"><select id="failsafe-mode"><option value="hold">Licht so lassen, wie es ist</option><option value="blackout">Licht dunkel schalten</option></select><label class="field" style="width:120px;flex-direction:row;align-items:center;gap:6px"><input type="number" id="failsafe-sec" min="1" max="60" style="width:70px"><span style="text-transform:none;letter-spacing:0">Sekunden</span></label></div>' +
      '<p class="help" style="margin-top:10px">Ohne angeschlossenes Gerät läuft die App im <b>Simulationsmodus</b>: alles funktioniert, das Licht wird nur in der Bühnenansicht gezeigt. Die Ansteuerung der Enttec-Box ist nach der Hersteller-Beschreibung umgesetzt, aber noch nicht an echter Hardware geprüft.</p></section>' +
      '<section class="card"><div class="card-title"><span class="grow">Kanal-Monitor</span><select id="mon-page" style="width:auto"></select></div><div class="ch-monitor" id="ch-monitor"></div>' +
      '<div class="ctl-label" style="margin-top:12px"><span>Kanal-Test (Verkabelung prüfen)</span></div><div class="row"><label class="field" style="width:100px"><span>Kanal</span><input type="number" id="test-ch" min="1" max="512" value="1"></label><label class="field" style="flex:1"><span>Wert <b id="test-val" style="color:var(--text)">0</b></span><input type="range" id="test-range" min="0" max="255" value="0"></label><button class="btn small secondary" id="test-off">Test beenden</button></div>' +
      '<p class="help" style="margin-top:6px">Der Test überschreibt den Kanal, bis du ihn beendest. Praktisch, um zu sehen, ob eine Lampe auf ihre Adresse hört.</p></section>' +
      '<section class="card"><div class="card-title">Bühne</div><div class="row"><label class="field" style="width:110px"><span>Breite (m)</span><input type="number" id="st-w" min="2" max="40" step="0.5"></label><label class="field" style="width:110px"><span>Tiefe (m)</span><input type="number" id="st-d" min="2" max="30" step="0.5"></label><label class="field" style="width:110px"><span>Höhe (m)</span><input type="number" id="st-h" min="2" max="20" step="0.5"></label></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="realistic"> Köpfe in der Ansicht mit begrenzter Geschwindigkeit fahren lassen (wie echte Lampen)</label></section>' +
      '<section class="card"><div class="card-title">Show</div><label class="field"><span>Name</span><input type="text" id="show-name"></label><p class="help" style="margin-top:8px">Alles wird automatisch gespeichert (Geräte, Looks, Einstellungen).</p><div class="row"><button class="btn small secondary" id="show-export">Show als Datei speichern…</button><button class="btn small secondary" id="show-import">Show öffnen…</button><button class="btn small danger" id="show-new">Neue leere Show</button></div></section>' +
      '<section class="card"><div class="card-title">Updates</div><div class="kv"><b>Version</b><span id="upd-version"></span><b>Stand</b><span id="upd-state"></span></div><p class="help" style="margin-top:8px">Die App sucht regelmäßig nach einer neuen Version, lädt sie im Hintergrund und installiert sie, wenn du auf „Jetzt neu starten“ drückst oder die App beendest.</p><button class="btn small secondary" id="upd-check">Jetzt nach Updates suchen</button></section>';
    root.appendChild(grid);
    const q = (s) => root.querySelector(s);
    ui = { kv: q("#dmx-kv"), msg: q("#dmx-msg"), portSel: q("#port-select"), auto: q("#auto-conn"), fsMode: q("#failsafe-mode"), fsSec: q("#failsafe-sec"), monPage: q("#mon-page"), mon: q("#ch-monitor"), testCh: q("#test-ch"), testRange: q("#test-range"), testVal: q("#test-val"),
      stW: q("#st-w"), stD: q("#st-d"), stH: q("#st-h"), realistic: q("#realistic"), name: q("#show-name"), updVersion: q("#upd-version"), updState: q("#upd-state") };

    q("#port-refresh").addEventListener("click", refreshPorts);
    q("#port-connect").addEventListener("click", async () => { const p = ui.portSel.value; if (!p) { toast("Kein Anschluss ausgewählt.", true); return; } const r = await api.connect(p); if (!r.ok) toast("Verbinden fehlgeschlagen: " + r.error, true); });
    q("#port-disconnect").addEventListener("click", () => api.disconnect());
    ui.auto.addEventListener("change", () => { Project.update((s) => { s.settings.autoConnect = ui.auto.checked; }, "settings"); api.setAutoConnect(ui.auto.checked); });
    const fs = () => { Project.update((s) => { s.settings.failsafe = ui.fsMode.value; s.settings.failsafeSec = parseInt(ui.fsSec.value, 10) || 5; }, "settings"); api.setFailsafe(ui.fsMode.value, parseInt(ui.fsSec.value, 10) || 5); };
    ui.fsMode.addEventListener("change", fs); ui.fsSec.addEventListener("change", fs);
    const stage = () => Project.update((s) => { s.stage.width = clamp(parseFloat(ui.stW.value) || 8, 2, 40); s.stage.depth = clamp(parseFloat(ui.stD.value) || 5, 2, 30); s.stage.height = clamp(parseFloat(ui.stH.value) || 4, 2, 20); }, "fixtures");
    [ui.stW, ui.stD, ui.stH].forEach((i) => i.addEventListener("change", stage));
    ui.realistic.addEventListener("change", () => Project.update((s) => { s.settings.realisticMotion = ui.realistic.checked; }, "settings"));
    ui.name.addEventListener("change", () => Project.update((s) => { s.name = ui.name.value.trim() || "Meine Show"; }, "show"));
    q("#show-export").addEventListener("click", async () => { const r = await api.projectExport(JSON.parse(JSON.stringify(Project.state)), Project.state.name); if (r.ok) toast("Show gespeichert."); else if (!r.canceled) toast("Speichern fehlgeschlagen: " + (r.error || ""), true); });
    q("#show-import").addEventListener("click", async () => {
      const r = await api.projectImport();
      if (r.ok) { if (await confirmDialog("Show öffnen?", "Die aktuelle Show wird durch die Datei ersetzt.", "Öffnen", true)) { Project.replace(r.data); toast("Show geöffnet."); } }
      else if (!r.canceled) toast(r.error || "Öffnen fehlgeschlagen.", true);
    });
    q("#show-new").addEventListener("click", async () => { if (await confirmDialog("Neue leere Show?", "Alle Geräte, Looks und Einstellungen dieser Show gehen verloren (vorher ggf. als Datei speichern).", "Neu beginnen", true)) { Project.replace({}); toast("Neue Show angelegt."); } });
    q("#upd-check").addEventListener("click", async () => { setUpdateState({ state: "checking" }); await api.checkUpdate(); });

    for (let i = 0; i < 8; i++) ui.monPage.appendChild(el('<option value="' + i + '">Kanal ' + (i * 64 + 1) + "–" + (i * 64 + 64) + "</option>"));
    ui.monPage.addEventListener("change", () => { monitorPage = parseInt(ui.monPage.value, 10); buildMonitor(); });
    buildMonitor();
    ui.testCh.addEventListener("input", applyTest); ui.testRange.addEventListener("input", applyTest);
    q("#test-off").addEventListener("click", () => { Runtime.engine.setTestChannel(parseInt(ui.testCh.value, 10) || 1, null); Runtime.engine.testChannels.clear(); ui.testRange.value = 0; ui.testVal.textContent = "0"; });
    let lastMon = 0;
    Runtime.onFrame((res, now) => { if (root.closest("[hidden]") || now - lastMon < 100) return; lastMon = now; paintMonitor(res.universe); });
    Project.on("load", refreshFields); Project.on("settings", refreshFields); Project.on("fixtures", refreshFields);
    refreshFields(); renderStatus(); refreshPorts();
    api.getVersion().then((v) => { ui.updVersion.textContent = "v" + v; });
    api.getUpdateState().then(setUpdateState).catch(() => {});
    api.onUpdateState(setUpdateState);
  }
  function applyTest() {
    const ch = clamp(parseInt(ui.testCh.value, 10) || 1, 1, 512), v = parseInt(ui.testRange.value, 10) || 0;
    Runtime.engine.testChannels.clear(); Runtime.engine.setTestChannel(ch, v); ui.testVal.textContent = v;
  }
  function buildMonitor() {
    ui.mon.innerHTML = "";
    for (let i = 0; i < 64; i++) ui.mon.appendChild(el('<div class="ch-cell"><i style="height:0"></i><span>' + (monitorPage * 64 + i + 1) + "</span></div>"));
  }
  function paintMonitor(u) {
    const cells = ui.mon.children;
    for (let i = 0; i < 64 && i < cells.length; i++) { const v = u[monitorPage * 64 + i] || 0; cells[i].firstChild.style.height = (v / 255 * 100).toFixed(0) + "%"; cells[i].title = "Kanal " + (monitorPage * 64 + i + 1) + ": " + v; }
  }
  function refreshFields() {
    if (!root) return;
    const s = Project.state, set = s.settings;
    if (document.activeElement !== ui.name) ui.name.value = s.name;
    ui.auto.checked = set.autoConnect !== false; ui.fsMode.value = set.failsafe || "hold"; ui.fsSec.value = set.failsafeSec || 5; ui.realistic.checked = set.realisticMotion !== false;
    if (document.activeElement !== ui.stW) ui.stW.value = s.stage.width; if (document.activeElement !== ui.stD) ui.stD.value = s.stage.depth; if (document.activeElement !== ui.stH) ui.stH.value = s.stage.height;
  }
  async function refreshPorts() {
    const r = await api.listPorts();
    ports = r.ports || [];
    ui.portSel.innerHTML = "";
    if (!ports.length) ui.portSel.appendChild(el("<option value=''>" + (r.serialSupport === false ? "Serieller Treiber fehlt" : "Kein USB-Gerät gefunden") + "</option>"));
    ports.forEach((p) => ui.portSel.appendChild(el('<option value="' + esc(p.path) + '">' + esc(p.path + (p.likely ? "  (Enttec)" : "") + (p.manufacturer ? " – " + p.manufacturer : "")) + "</option>")));
    const likely = ports.find((p) => p.likely); if (likely) ui.portSel.value = likely.path;
  }
  function renderStatus() {
    if (!root) return;
    const st = status, states = { disconnected: "nicht verbunden (Simulation)", connecting: "verbinde …", connected: "verbunden", error: "Fehler" };
    ui.kv.innerHTML = "<b>Zustand</b><span>" + esc(states[st.state] || st.state) + "</span><b>Anschluss</b><span>" + esc(st.path || "–") + "</span><b>Seriennummer</b><span>" + esc(st.serial || "–") + "</span><b>Firmware</b><span>" + esc(st.firmware || "–") + "</span><b>Bilder gesendet</b><span>" + (st.sent || 0) + (st.failed ? " (" + st.failed + " Fehler)" : "") + "</span>";
    ui.msg.textContent = st.error || "";
    ui.msg.style.color = st.error ? "var(--warn)" : "";
  }
  function setStatus(s) { status = s || status; renderStatus(); }
  function setUpdateState(u) {
    updateState = u || updateState;
    if (!ui.updState) return;
    const t = { idle: "noch nicht geprüft", checking: "suche …", downloading: "Version " + u.version + " wird geladen (" + u.progress + " %)", ready: "Version " + u.version + " ist bereit (Neustart nötig)", current: "aktuell", error: "Fehler: " + (u.message || "") };
    ui.updState.textContent = t[u.state] || u.state;
  }
  return { build, setStatus, setUpdateState, refreshPorts };
})();
