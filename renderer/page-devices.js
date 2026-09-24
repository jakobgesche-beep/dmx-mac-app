// Seite "Geräte": Lampen anlegen, DMX-Adressen, Position und Aufhängung, eigene Geräte.
const DevicesPage = (function () {
  let root = null;
  const GROUP_COLORS = ["#4C8DFF", "#30d158", "#ffd60a", "#ff9f0a", "#bf5af2", "#ff453a", "#64d2ff", "#ff6482"];
  const shortName = (n) => n.replace(/^Stairville MH-X25 LED Spot/, "MH-X25");

  function build(container) {
    root = container;
    Project.on("fixtures", render); Project.on("load", render); Project.on("profiles", render);
    render();
  }

  function render() {
    if (!root) return;
    root.innerHTML = "";
    const fx = Project.state.fixtures, issues = Fixtures.checkPatch(fx);
    const head = el('<section class="card"><div class="card-title"><span class="grow">Geräte (' + fx.length + ')</span><button id="dev-custom" class="btn small secondary">Eigenes Gerät…</button><button id="dev-add" class="btn small">+ Gerät hinzufügen</button></div></section>');
    head.querySelector("#dev-add").addEventListener("click", () => addDialog());
    head.querySelector("#dev-custom").addEventListener("click", () => customDialog());
    if (!fx.length) head.appendChild(el('<p class="help">Noch keine Geräte. Füge deine Lampen hinzu (z. B. 4 × Stairville MH-X25 im 12-Kanal-Modus) und stelle an der Lampe dieselbe DMX-Adresse ein.</p>'));
    else {
      const t = el('<table class="table"><thead><tr><th>Name</th><th>Gerät</th><th>Modus</th><th>DMX</th><th>Gruppe</th><th>Aufhängung</th><th></th></tr></thead><tbody></tbody></table>');
      const body = t.querySelector("tbody");
      fx.forEach((f) => {
        const p = Fixtures.getProfile(f.profile), n = Fixtures.channelCount(f), issue = issues.find((i) => i.fixtureId === f.id);
        const tr = el("<tr><td><b>" + esc(f.name) + "</b>" + (issue ? '<div class="issue">⚠ ' + esc(issue.message) + "</div>" : "") + "</td><td>" + esc(p ? p.name : "unbekannt") + "</td><td>" + esc(p && p.modes[f.mode] ? p.modes[f.mode].name : f.mode) + '</td><td class="num">' + f.address + "–" + (f.address + n - 1) + "</td><td>" + esc(f.group || "") + "</td><td>" + (f.mount === "floor" ? "Boden" : "hängend") + ", " + (f.pos ? f.pos.z + " m" : "") + '</td><td style="white-space:nowrap"></td></tr>');
        const cell = tr.lastChild;
        const mk = (label, fn, cls) => { const b = el('<button class="btn small ' + (cls || "secondary") + '" style="margin-left:4px">' + label + "</button>"); b.addEventListener("click", fn); cell.appendChild(b); };
        mk("Finden", () => Runtime.identify(f.id)); mk("Bearbeiten", () => editDialog(f.id));
        mk("Kopie", () => { const c = JSON.parse(JSON.stringify(f)); c.id = uid("f"); c.name = f.name + " Kopie"; c.address = Project.nextFreeAddress(n); Project.update((s) => s.fixtures.push(c), "fixtures"); });
        mk("Löschen", async () => { if (await confirmDialog("Gerät löschen?", "„" + f.name + "“ wird entfernt.", "Löschen", true)) Project.removeFixture(f.id); }, "danger");
        body.appendChild(tr);
      });
      head.appendChild(t);
    }
    root.appendChild(head);

    // DMX-Karte
    const map = el('<section class="card" style="margin-top:12px"><div class="card-title">DMX-Belegung (Kanal 1 bis 512)</div><div class="dmx-map" id="dmx-map"></div><div class="dmx-scale"><span>1</span><span>128</span><span>256</span><span>384</span><span>512</span></div></section>');
    const bar = map.querySelector("#dmx-map"), groups = Project.groups();
    fx.forEach((f) => {
      const n = Fixtures.channelCount(f); if (!n || f.address < 1) return;
      const color = GROUP_COLORS[Math.max(0, groups.indexOf(f.group)) % GROUP_COLORS.length];
      const bad = issues.some((i) => i.fixtureId === f.id);
      const b = el('<i title="' + esc(f.name + ": Kanal " + f.address + "–" + (f.address + n - 1)) + '" style="left:' + ((f.address - 1) / 512 * 100) + "%;width:" + (n / 512 * 100) + "%;background:" + (bad ? "repeating-linear-gradient(45deg,#ff453a,#ff453a 4px,#7a2a26 4px,#7a2a26 8px)" : color) + '"></i>');
      bar.appendChild(b);
    });
    if (issues.length) map.appendChild(el('<p class="issue">⚠ ' + issues.length + " Adress-Problem(e): siehe rote Hinweise in der Liste. Zwei Lampen dürfen nicht dieselben DMX-Kanäle belegen.</p>"));
    root.appendChild(map);
  }

  // ---------- Gerät hinzufügen ----------
  function addDialog() {
    const profiles = Fixtures.listProfiles();
    const body = el('<div class="row" style="flex-direction:column;align-items:stretch;gap:10px"></div>');
    body.innerHTML =
      '<label class="field"><span>Gerät</span><select id="ad-profile">' + profiles.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.manufacturer && p.manufacturer !== "Allgemein" ? " (" + esc(p.manufacturer) + ")" : "") + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>Betriebsart (an der Lampe einstellen)</span><select id="ad-mode"></select></label>' +
      '<p class="help" id="ad-note" style="margin:0"></p>' +
      '<div class="row"><label class="field" style="width:110px"><span>Anzahl</span><input type="number" id="ad-count" min="1" max="32" value="1"></label>' +
      '<label class="field" style="width:150px"><span>Erste DMX-Adresse</span><input type="number" id="ad-addr" min="1" max="512"></label>' +
      '<label class="field" style="flex:1"><span>Gruppe</span><input type="text" id="ad-group"></label></div>' +
      '<p class="help" id="ad-preview" style="margin:0"></p>';
    const dlg = dialog({ title: "Gerät hinzufügen", body, actions: [{ label: "Abbrechen", kind: "secondary" }, { label: "Hinzufügen", onClick: () => {
      const made = Project.addFixtures({ profile: sel.value, mode: mode.value, count: parseInt(count.value, 10) || 1, address: parseInt(addr.value, 10) || undefined, group: group.value.trim() || undefined });
      toast(made.length + (made.length === 1 ? " Gerät" : " Geräte") + " hinzugefügt.");
    } }] });
    const sel = dlg.box.querySelector("#ad-profile"), mode = dlg.box.querySelector("#ad-mode"), count = dlg.box.querySelector("#ad-count"), addr = dlg.box.querySelector("#ad-addr"), group = dlg.box.querySelector("#ad-group");
    const defaultMode = { "stairville-mhx25": "12ch" };
    function refreshMode() {
      const p = Fixtures.getProfile(sel.value);
      mode.innerHTML = Object.keys(p.modes).map((k) => '<option value="' + k + '">' + esc(p.modes[k].name) + "</option>").join("");
      if (defaultMode[p.id]) mode.value = defaultMode[p.id];
      dlg.box.querySelector("#ad-note").textContent = p.note || "";
      group.placeholder = p.kind === "moving" ? "Moving Heads" : p.kind === "strobe" ? "Strobo" : p.kind === "color" ? "Farblicht" : "Bühnenlicht";
      refreshPreview();
    }
    function refreshPreview() {
      const p = Fixtures.getProfile(sel.value), n = p.modes[mode.value].channels.length, c = parseInt(count.value, 10) || 1;
      const start = parseInt(addr.value, 10) || Project.nextFreeAddress(n * c);
      addr.placeholder = "automatisch: " + Project.nextFreeAddress(n * c);
      dlg.box.querySelector("#ad-preview").textContent = c + " × " + n + " Kanäle ab Kanal " + start + " (bis Kanal " + (start + n * c - 1) + ")" + (start + n * c - 1 > 512 ? " — passt nicht!" : ".");
    }
    sel.addEventListener("change", refreshMode); mode.addEventListener("change", refreshPreview); count.addEventListener("input", refreshPreview); addr.addEventListener("input", refreshPreview);
    refreshMode();
  }

  // ---------- Gerät bearbeiten ----------
  function editDialog(id) {
    const f = Project.fixture(id); if (!f) return;
    const p = Fixtures.getProfile(f.profile), moving = p && p.kind === "moving";
    const num = (k, v, step, label, w) => '<label class="field" style="width:' + (w || 110) + 'px"><span>' + label + '</span><input type="number" data-k="' + k + '" step="' + step + '" value="' + v + '"></label>';
    const body = el('<div class="row" style="flex-direction:column;align-items:stretch;gap:10px"></div>');
    body.innerHTML =
      '<div class="row"><label class="field" style="flex:1"><span>Name</span><input type="text" data-k="name" value="' + esc(f.name) + '"></label><label class="field" style="flex:1"><span>Gruppe</span><input type="text" data-k="group" value="' + esc(f.group || "") + '"></label></div>' +
      '<div class="row"><label class="field" style="width:190px"><span>Betriebsart</span><select data-k="mode">' + Object.keys(p.modes).map((k) => '<option value="' + k + '"' + (k === f.mode ? " selected" : "") + ">" + esc(p.modes[k].name) + "</option>").join("") + "</select></label>" + num("address", f.address, 1, "DMX-Adresse") + "</div>" +
      '<div class="ctl-label"><span>Aufhängung und Position (Meter)</span></div>' +
      '<div class="row"><label class="field" style="width:150px"><span>Montage</span><select data-k="mount"><option value="hang"' + (f.mount === "hang" ? " selected" : "") + '>hängend (Traverse/Decke)</option><option value="floor"' + (f.mount === "floor" ? " selected" : "") + ">steht am Boden</option></select></label>" + num("x", f.pos.x, 0.1, "x (links −/rechts +)", 140) + num("y", f.pos.y, 0.1, "y (vorn 0 → hinten)", 140) + num("z", f.pos.z, 0.1, "Höhe z", 100) + "</div>" +
      (moving ? '<div class="row">' + num("yaw", f.yaw || 0, 5, "Blickrichtung ° (0 = nach hinten)", 190) + num("panRange", f.panRange || p.panRange, 90, "Pan-Bereich °", 120) + num("tiltRange", f.tiltRange || p.tiltRange, 90, "Tilt-Bereich °", 120) + "</div>" +
        '<div class="row"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-k="invertPan"' + (f.invertPan ? " checked" : "") + '> Pan umkehren</label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-k="invertTilt"' + (f.invertTilt ? " checked" : "") + "> Tilt umkehren</label></div>" +
        '<p class="help" style="margin:0">Pan-/Tilt-Bereich und Umkehrung müssen zu den Einstellungen im Menü der Lampe passen (MH-X25: Pan 540°/360°/180°, Tilt 270°/180°/90°). Zeigt der Kopf beim „Zielen“ auf die falsche Seite, Pan oder Tilt umkehren oder die Blickrichtung anpassen.</p>' : "");
    const dlg = dialog({ title: "Gerät bearbeiten", body, actions: [{ label: "Abbrechen", kind: "secondary" }, { label: "Speichern", onClick: (close, box) => {
      const val = (k) => { const e = box.querySelector('[data-k="' + k + '"]'); return e ? (e.type === "checkbox" ? e.checked : e.value) : undefined; };
      Project.update(() => {
        f.name = String(val("name") || f.name).trim() || f.name; f.group = String(val("group") || "").trim(); f.mode = val("mode");
        f.address = clamp(parseInt(val("address"), 10) || f.address, 1, 512); f.mount = val("mount");
        f.pos = { x: parseFloat(val("x")) || 0, y: parseFloat(val("y")) || 0, z: parseFloat(val("z")) || 0 };
        if (moving) { f.yaw = parseFloat(val("yaw")) || 0; f.panRange = clamp(parseFloat(val("panRange")) || p.panRange, 90, 720); f.tiltRange = clamp(parseFloat(val("tiltRange")) || p.tiltRange, 45, 360); f.invertPan = !!val("invertPan"); f.invertTilt = !!val("invertTilt"); }
      }, "fixtures");
    } }] });
    return dlg;
  }

  // ---------- Eigenes Gerät ----------
  function customDialog() {
    const types = Fixtures.CUSTOM_TYPES;
    const body = el('<div class="row" style="flex-direction:column;align-items:stretch;gap:10px"><label class="field"><span>Name des Geräts</span><input type="text" id="cu-name" placeholder="z. B. Strobo XY"></label><div id="cu-rows" style="display:flex;flex-direction:column;gap:6px"></div><div class="row"><button class="btn small secondary" id="cu-add">+ Kanal</button><span class="help" id="cu-count" style="margin:0"></span></div><p class="help" style="margin:0">Trage die Kanäle in der Reihenfolge aus dem Handbuch ein. „Fester Wert“ ist für Kanäle ohne Funktion, die einen bestimmten Wert brauchen.</p></div>');
    const rows = body.querySelector("#cu-rows"), list = [{ type: "dimmer" }];
    function draw() {
      rows.innerHTML = "";
      list.forEach((c, i) => {
        const r = el('<div class="row"><span class="lb-label" style="width:64px">Kanal ' + (i + 1) + '</span><select style="flex:1">' + Object.keys(types).map((k) => '<option value="' + k + '"' + (k === c.type ? " selected" : "") + ">" + esc(types[k].label) + "</option>").join("") + '</select><input type="number" min="0" max="255" value="' + (c.default || 0) + '" style="width:80px" title="Fester Wert (0–255)"><button class="btn small danger">✕</button></div>');
        r.querySelector("select").addEventListener("change", (e) => { c.type = e.target.value; });
        r.querySelector("input").addEventListener("input", (e) => { c.default = parseInt(e.target.value, 10) || 0; });
        r.querySelector("button").addEventListener("click", () => { list.splice(i, 1); draw(); });
        rows.appendChild(r);
      });
      body.querySelector("#cu-count").textContent = list.length + " Kanäle";
    }
    body.querySelector("#cu-add").addEventListener("click", () => { if (list.length < 32) { list.push({ type: "raw" }); draw(); } });
    draw();
    dialog({ title: "Eigenes Gerät anlegen", body, actions: [{ label: "Abbrechen", kind: "secondary" }, { label: "Anlegen", onClick: (close, box) => {
      const name = box.querySelector("#cu-name").value.trim();
      if (!name || !list.length) { toast("Bitte einen Namen eingeben und mindestens einen Kanal anlegen.", true); return false; }
      Project.addCustomProfile(name, list.map((c) => ({ type: c.type, default: c.default || 0 })));
      toast("Gerät „" + name + "“ angelegt. Du findest es beim Hinzufügen in der Liste.");
    } }] });
  }

  return { build, render, addDialog, editDialog, customDialog };
})();
