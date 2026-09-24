// Start der App: Reiter, Seiten, DMX-Status, Updates, Touch-Modus.
const api = window.dmxAPI;
const TABS = [["live", "Bühne"], ["devices", "Geräte"], ["settings", "Einstellungen"]];
let currentTab = "live";

function showTab(id) {
  currentTab = id;
  document.querySelectorAll("#tabs .layer-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  document.querySelectorAll("#views .view").forEach((v) => { v.hidden = v.dataset.view !== id; });
  try { localStorage.setItem("dmx.tab", id); } catch (e) {}
}
function buildTabs() {
  const nav = document.getElementById("tabs");
  TABS.forEach(([id, label]) => {
    const b = el('<button class="layer-tab" data-tab="' + id + '">' + esc(label) + "</button>");
    b.addEventListener("click", () => showTab(id));
    nav.appendChild(b);
  });
}

// ---------- DMX-Status ----------
function updateDmxBadge(s) {
  const badge = document.getElementById("dmx-badge"), text = document.getElementById("dmx-text");
  badge.classList.remove("live", "warn", "bad");
  if (s.state === "connected") { badge.classList.add("live"); text.textContent = "Enttec verbunden" + (s.serial ? " · " + s.serial : ""); }
  else if (s.state === "connecting") { badge.classList.add("warn"); text.textContent = "Verbinde …"; }
  else if (s.state === "error") { badge.classList.add("bad"); text.textContent = "DMX-Fehler"; }
  else text.textContent = s.error ? "Simulation · " + s.error : "Simulation (keine Hardware)";
  LiveBar.setStatusText(s.state === "connected" ? "DMX-Ausgabe aktiv" : "Simulation: kein DMX am Kabel");
  SettingsPage.setStatus(s);
}

// ---------- Updates ----------
let updateBar = null;
function showUpdate(u) {
  SettingsPage.setUpdateState(u);
  if (updateBar) { updateBar.remove(); updateBar = null; }
  if (u.state === "downloading") {
    updateBar = el('<div class="update-bar working"><span>Update ' + esc(u.version) + " wird im Hintergrund geladen … " + (u.progress || 0) + " %</span></div>");
  } else if (u.state === "ready") {
    updateBar = el('<div class="update-bar"><span>Update ' + esc(u.version) + ' ist bereit.</span><button class="btn small" id="install-update-btn">Jetzt neu starten</button><span style="opacity:0.85">oder später: wird beim Beenden installiert</span></div>');
    updateBar.querySelector("#install-update-btn").addEventListener("click", async (e) => {
      if (Runtime.engine.master > 0 && !Runtime.engine.blackout && await confirmDialog("Jetzt neu starten?", "Beim Neustart geht das Licht kurz aus (ca. 5 Sekunden). Nicht während einer Show!", "Neu starten", true) === false) return;
      e.target.disabled = true;
      const r = await api.installUpdate();
      if (!r.ok) { e.target.disabled = false; toast(r.error || "Update fehlgeschlagen", true); }
    });
  }
  if (updateBar) document.body.appendChild(updateBar);
}

// ---------- Touch-Modus ----------
const touchBtn = document.getElementById("touch-btn");
function applyTouch(on, persist) {
  document.body.classList.toggle("touch", on);
  touchBtn.textContent = on ? "Touch: an" : "Touch: aus";
  touchBtn.classList.toggle("on", on);
  if (persist) { try { localStorage.setItem("dmx.touch", on ? "on" : "off"); } catch (e) {} }
}
touchBtn.addEventListener("click", () => applyTouch(!document.body.classList.contains("touch"), true));
document.getElementById("full-btn").addEventListener("click", () => { if (api.toggleFullscreen) api.toggleFullscreen(); });
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || document.body.classList.contains("touch")) return;
  let saved = null; try { saved = localStorage.getItem("dmx.touch"); } catch (err) {}
  if (saved === "off") return;
  applyTouch(true, false);
  toast("Touch-Modus eingeschaltet (oben mit „Touch“ abschaltbar).");
}, true);
document.addEventListener("contextmenu", (e) => { if (document.body.classList.contains("touch")) e.preventDefault(); });
{ let saved = null; try { saved = localStorage.getItem("dmx.touch"); } catch (e) {}
  const auto = (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0;
  applyTouch(saved === "on" || (saved === null && auto), false); }

// ---------- Start ----------
(async function start() {
  buildTabs();
  LiveBar.init(document.getElementById("livebar"));
  LivePage.build(document.getElementById("view-live"));
  DevicesPage.build(document.getElementById("view-devices"));
  SettingsPage.build(document.getElementById("view-settings"));
  api.onStatus(updateDmxBadge);
  api.onUpdateState(showUpdate);
  await Project.load();
  const set = Project.state.settings;
  api.setAutoConnect(set.autoConnect !== false); api.setFailsafe(set.failsafe || "hold", set.failsafeSec || 5);
  api.getStatus().then(updateDmxBadge).catch(() => {});
  api.getUpdateState().then(showUpdate).catch(() => {});
  let tab = "live"; try { tab = localStorage.getItem("dmx.tab") || "live"; } catch (e) {}
  showTab(TABS.some((t) => t[0] === tab) ? tab : "live");
  api.getVersion().then((v) => { document.getElementById("version-label").textContent = "v" + v; if (!window.__noChangelog) maybeShowChangelog(v); });
})();
