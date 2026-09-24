// Seite "Bühne": Bühnenansicht, Auswahl, Steuerung der gewählten Lampen, Looks, Effekte.
const LivePage = (function () {
  let view = null, root = null, ui = {}, lookEdit = false;

  // gemeinsame Farbauswahl (Farbrad-Geräte nehmen die Farbe mit gleichem Namen oder die ähnlichste)
  const COLORS = [
    { name: "Weiß", rgb: { r: 1, g: 1, b: 1 }, css: "#ffffff" }, { name: "Rot", rgb: { r: 1, g: 0.05, b: 0.05 }, css: "#ff2d2d" }, { name: "Gelb", rgb: { r: 1, g: 0.9, b: 0 }, css: "#ffe600" },
    { name: "Grün", rgb: { r: 0, g: 0.8, b: 0.3 }, css: "#00c853" }, { name: "Hellblau", rgb: { r: 0.3, g: 0.75, b: 0.97 }, css: "#4fc3f7" }, { name: "Dunkelblau", rgb: { r: 0.1, g: 0.24, b: 1 }, css: "#1a3cff" },
    { name: "Pink", rgb: { r: 1, g: 0.37, b: 0.66 }, css: "#ff5fa8" }, { name: "Pfirsich", rgb: { r: 1, g: 0.7, b: 0.54 }, css: "#ffb38a" }, { name: "Gelbgrün", rgb: { r: 0.71, g: 1, b: 0.23 }, css: "#b6ff3b" },
  ];
  const FX_PARAMS = {
    chase: [{ key: "pattern", label: "Muster", options: [["forward", "vorwärts"], ["backward", "rückwärts"], ["pingpong", "hin und her"], ["random", "zufällig"]] }, { key: "step", label: "Schritt", options: [[0.25, "¼ Schlag"], [0.5, "½"], [1, "1"], [2, "2"], [4, "4"]] }, { key: "width", label: "Breite", options: [[1, "1"], [2, "2"], [3, "3"]] }, { key: "fade", label: "Kante", options: [[0, "hart"], [0.3, "leicht weich"], [0.7, "weich"]] }],
    pulse: [{ key: "shape", label: "Form", options: [["saw-down", "Sägezahn ab"], ["saw-up", "Sägezahn auf"], ["sine", "Sinus"], ["square", "Rechteck"], ["triangle", "Dreieck"]] }, { key: "rate", label: "Dauer", options: [[0.5, "½ Schlag"], [1, "1"], [2, "2"], [4, "4"]] }],
    colorCycle: [{ key: "step", label: "Wechsel alle", options: [[1, "1 Schlag"], [2, "2"], [4, "4"], [8, "8"]] }],
    move: [{ key: "shape", label: "Form", options: [["circle", "Kreis"], ["eight", "Acht"], ["sweep-pan", "Pendeln quer"], ["sweep-tilt", "Pendeln hoch/runter"]] }, { key: "rate", label: "Dauer", options: [[4, "4 Schläge"], [8, "8"], [16, "16"], [32, "32"]] }, { key: "size", label: "Größe", options: [[JSON.stringify({ pan: 0.06, tilt: 0.04 }), "klein"], [JSON.stringify({ pan: 0.12, tilt: 0.08 }), "mittel"], [JSON.stringify({ pan: 0.2, tilt: 0.14 }), "groß"]], json: true }],
    strobeHit: [{ key: "every", label: "Alle", options: [[1, "1 Schlag"], [2, "2"], [4, "4"], [8, "8"]] }, { key: "duration", label: "Dauer", options: [[0.1, "kurz"], [0.25, "mittel"], [0.5, "lang"]] }],
    gobo: [{ key: "step", label: "Wechsel alle", options: [[2, "2 Schläge"], [4, "4"], [8, "8"], [16, "16"]] }],
  };

  function build(container) {
    root = container;
    root.innerHTML = "";
    const live = el('<div class="live"></div>');
    // --- Bühne ---
    const stage = el('<section class="card live-stage"></section>');
    const tools = el('<div class="stage-tools"><button class="btn small on" data-mode="top">Draufsicht</button><button class="btn small secondary" data-mode="side">Seitenansicht</button><span style="width:10px"></span>' +
      '<button id="aim-btn" class="btn small secondary" title="Auf die Bühne tippen: die gewählten Köpfe zielen dorthin">Zielen</button><button id="edit-btn" class="btn small secondary" title="Lampen in der Ansicht verschieben">Verschieben</button>' +
      '<span class="help" style="margin:0 0 0 auto" id="stage-hint"></span></div>');
    const canvas = el('<canvas class="stage-canvas" id="stage-canvas"></canvas>');
    stage.append(tools, canvas);
    view = new StageView(canvas);
    tools.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      view.setMode(b.dataset.mode);
      tools.querySelectorAll("[data-mode]").forEach((x) => { x.classList.toggle("on", x === b); x.classList.toggle("secondary", x !== b); });
      hint();
    }));
    const aim = tools.querySelector("#aim-btn"), edit = tools.querySelector("#edit-btn");
    aim.addEventListener("click", () => { view.setAim(!view.aim); aim.classList.toggle("on", view.aim); aim.classList.toggle("secondary", !view.aim); edit.classList.remove("on"); edit.classList.add("secondary"); if (view.aim && view.mode !== "top") tools.querySelector('[data-mode="top"]').click(); hint(); });
    edit.addEventListener("click", () => { view.setEdit(!view.edit); edit.classList.toggle("on", view.edit); edit.classList.toggle("secondary", !view.edit); aim.classList.remove("on"); aim.classList.add("secondary"); hint(); });
    function hint() {
      tools.querySelector("#stage-hint").textContent = view.aim ? "Auf die Bühne tippen oder ziehen: gewählte Köpfe zielen dorthin" : view.edit ? "Lampen mit dem Finger verschieben" : "Lampe antippen = auswählen";
    }
    hint();

    // --- rechte Spalte ---
    const side = el('<div class="live-side"></div>');
    const selCard = el('<section class="card"><div class="card-title"><span class="grow">Auswahl</span><span class="help" id="sel-count" style="margin:0"></span></div><div class="chips" id="sel-chips"></div></section>');
    const ctlCard = el('<section class="card"><div class="card-title">Steuerung</div><div id="ctl"></div></section>');
    side.append(selCard, ctlCard);
    // --- links unter der Bühne: Looks, Effekte ---
    const main = el('<div class="live-main"></div>');
    const bottom = el('<div class="live-bottom"></div>');
    const looks = el('<section class="card"><div class="card-title"><span class="grow">Looks</span><button id="look-edit" class="btn small secondary">Bearbeiten</button><button id="look-save" class="btn small">+ Speichern</button></div><div class="look-grid" id="look-grid"></div></section>');
    const fx = el('<section class="card"><div class="card-title"><span class="grow">Effekte im Takt</span><button id="fx-stop" class="btn small secondary">Alle stoppen</button></div><div class="chips" id="fx-add"></div><div class="fx-list" id="fx-list"></div></section>');
    bottom.append(looks, fx);
    main.append(stage, bottom);
    live.append(main, side);
    root.appendChild(live);
    ui = { canvas, tools, selChips: root.querySelector("#sel-chips"), selCount: root.querySelector("#sel-count"), ctl: root.querySelector("#ctl"), lookGrid: root.querySelector("#look-grid"), fxAdd: root.querySelector("#fx-add"), fxList: root.querySelector("#fx-list") };

    root.querySelector("#look-save").addEventListener("click", saveLookDialog);
    root.querySelector("#look-edit").addEventListener("click", (e) => { lookEdit = !lookEdit; e.target.classList.toggle("on", lookEdit); e.target.classList.toggle("secondary", !lookEdit); renderLooks(); });
    root.querySelector("#fx-stop").addEventListener("click", () => Runtime.stopAllEffects());
    Effects.TYPES.forEach((t) => {
      const b = el('<button class="chip" title="' + esc(t.help) + '">+ ' + esc(t.label) + "</button>");
      b.addEventListener("click", () => {
        const sel = Runtime.ids();
        const id = Runtime.startEffect(t.type, sel);
        if (!id) return;
        if (t.type === "move" && !Runtime.effects().find((e) => e.id === id).fixtures.length) { toast("Kein beweglicher Kopf vorhanden.", true); Runtime.stopEffect(id); }
      });
      ui.fxAdd.appendChild(b);
    });

    Runtime.onSelection(() => { renderSelection(); renderControls(); });
    Runtime.onState(() => { renderLooks(true); renderEffects(); syncControlValues(); });
    Project.on("looks", renderLooks); Project.on("fixtures", () => { renderSelection(); renderControls(); });
    Project.on("load", () => { renderSelection(); renderControls(); renderLooks(); renderEffects(); });
    renderSelection(); renderControls(); renderLooks(); renderEffects();
    // Zeichenschleife (nur wenn die Seite sichtbar ist)
    let last = 0;
    const tick = (now) => { requestAnimationFrame(tick); if (root.closest("[hidden]") || now - last < 33) return; last = now; view.draw(now); if (ui.pad) drawPad(); };
    requestAnimationFrame(tick);
  }

  // ---------- Auswahl ----------
  function renderSelection() {
    const fx = Project.state.fixtures;
    ui.selChips.innerHTML = "";
    if (!fx.length) { ui.selChips.appendChild(el('<span class="help" style="margin:0">Noch keine Geräte. Unter „Geräte“ Lampen hinzufügen.</span>')); ui.selCount.textContent = ""; return; }
    const chip = (label, on, fn, cls) => { const c = el('<button class="chip ' + (on ? "on " : "") + (cls || "") + '">' + esc(label) + "</button>"); c.addEventListener("click", fn); ui.selChips.appendChild(c); };
    chip("Alle", Runtime.selection.size === fx.length, () => Runtime.selectAll());
    Project.groups().forEach((g) => { const ids = fx.filter((f) => f.group === g).map((f) => f.id); chip(g, ids.length && ids.every((id) => Runtime.selection.has(id)), () => Runtime.selectGroup(g)); });
    ui.selChips.appendChild(el('<span style="flex-basis:100%;height:0"></span>'));
    fx.forEach((f) => chip(f.name.replace(/^Stairville MH-X25 LED Spot/, "MH-X25"), Runtime.selection.has(f.id), () => Runtime.toggle(f.id)));
    ui.selCount.textContent = Runtime.selection.size + " von " + fx.length;
  }

  // ---------- Steuerung ----------
  function capsOfSelection() {
    const fxs = Runtime.selectedFixtures(), caps = fxs.map((f) => Fixtures.capabilities(f));
    return { fxs, any: (k) => caps.some((c) => c[k]), all: (k) => caps.length && caps.every((c) => c[k]), onOffOnly: caps.length && caps.every((c) => c.dimmerOnOff || !c.dimmer) };
  }
  function block(title, body, right) { const b = el('<div class="ctl-block"><div class="ctl-label"><span>' + esc(title) + "</span><span>" + (right || "") + "</span></div></div>"); b.appendChild(body); return b; }
  function renderControls() {
    const c = capsOfSelection(), box = ui.ctl;
    box.innerHTML = ""; ui.pad = null; ui.dim = null; ui.strobe = null;
    if (!c.fxs.length) { box.appendChild(el('<p class="help">Wähle oben Lampen aus oder tippe sie in der Bühnenansicht an.</p>')); return; }
    const first = c.fxs[0], attrs = () => Runtime.engine.get(first.id) || {};
    // Helligkeit
    if (c.any("dimmer") || c.any("colorRgb")) {
      const wrap = el("<div></div>");
      const r = el('<input type="range" min="0" max="100" step="1" aria-label="Helligkeit">');
      ui.dim = r; r.value = Math.round((attrs().dimmer || 0) * 100);
      r.addEventListener("input", () => { Runtime.setAttr("dimmer", r.value / 100); ui.dimVal.textContent = r.value + " %"; });
      const q = el('<div class="row" style="margin-top:6px"><button class="btn small secondary" data-v="0">Aus</button><button class="btn small secondary" data-v="50">50 %</button><button class="btn small secondary" data-v="100">' + (c.onOffOnly ? "An" : "Voll") + "</button></div>");
      q.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { Runtime.setAttr("dimmer", b.dataset.v / 100); r.value = b.dataset.v; ui.dimVal.textContent = b.dataset.v + " %"; }));
      wrap.append(r, q);
      const b = block("Helligkeit", wrap, '<span id="dim-val">' + r.value + " %</span>");
      box.appendChild(b); ui.dimVal = b.querySelector("#dim-val");
      if (c.fxs.some((f) => Fixtures.capabilities(f).dimmerOnOff)) wrap.appendChild(el('<p class="help" style="margin-top:6px">Nur an/aus (ab 50 %): ' + esc(c.fxs.filter((f) => Fixtures.capabilities(f).dimmerOnOff).map((f) => f.name.replace(/^Stairville MH-X25 LED Spot/, "MH-X25")).join(", ")) + "</p>"));
    }
    // Position
    if (c.any("pan")) {
      const pad = el('<div class="xy-pad"><canvas></canvas></div>');
      ui.pad = pad.querySelector("canvas");
      const setFromEvent = (e) => { const r = pad.getBoundingClientRect(); Runtime.setPanTilt(clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)); };
      let dragging = false;
      pad.addEventListener("pointerdown", (e) => { dragging = true; try { pad.setPointerCapture(e.pointerId); } catch (err) {} setFromEvent(e); });
      pad.addEventListener("pointermove", (e) => { if (dragging) setFromEvent(e); });
      pad.addEventListener("pointerup", () => { dragging = false; });
      pad.addEventListener("pointercancel", () => { dragging = false; });
      const wrap = el("<div></div>");
      wrap.appendChild(pad);
      const r = el('<div class="row" style="margin-top:6px"><button class="btn small secondary" id="pt-center">Mitte</button><span class="help" style="margin:0">Oder oben bei der Bühne „Zielen“ wählen.</span></div>');
      r.querySelector("#pt-center").addEventListener("click", () => Runtime.setPanTilt(0.5, 0.5));
      wrap.appendChild(r);
      if (c.any("speed")) {
        const s = el('<div style="margin-top:8px"><div class="ctl-label"><span>Kopf-Geschwindigkeit</span><span id="spd-val"></span></div><input type="range" min="0" max="100" value="' + Math.round((attrs().speed || 0) * 100) + '"></div>');
        s.querySelector("input").addEventListener("input", (e) => { Runtime.setAttr("speed", e.target.value / 100); s.querySelector("#spd-val").textContent = e.target.value + " %"; });
        wrap.appendChild(s);
      }
      box.appendChild(block("Position", wrap));
    }
    // Farbe
    if (c.any("colorWheel") || c.any("colorRgb")) {
      const sw = el('<div class="swatches"></div>');
      COLORS.forEach((col) => {
        const b = el('<button class="swatch" title="' + esc(col.name) + '" style="background:' + col.css + '"></button>');
        b.addEventListener("click", () => Runtime.setColor({ name: col.name, rgb: col.rgb }));
        sw.appendChild(b);
      });
      const wrap = el("<div></div>"); wrap.appendChild(sw);
      if (c.any("colorWheel")) {
        const r = el('<div class="row" style="margin-top:6px"><button class="btn small secondary" data-s="cw">Regenbogen ↻</button><button class="btn small secondary" data-s="ccw">Regenbogen ↺</button></div>');
        r.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => Runtime.setColor({ scroll: b.dataset.s, speed: 0.4 })));
        wrap.appendChild(r);
      }
      if (c.any("colorRgb")) {
        const p = el('<div class="row" style="margin-top:6px"><span class="help" style="margin:0">Eigene Farbe:</span><input type="color" value="#ffffff" aria-label="Eigene Farbe" style="width:54px;height:34px;padding:0;border:1px solid var(--line);border-radius:6px;background:none"></div>');
        p.querySelector("input").addEventListener("input", (e) => { const h = e.target.value; Runtime.setColor({ rgb: { r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 } }); });
        wrap.appendChild(p);
      }
      box.appendChild(block("Farbe", wrap));
    }
    // Gobo
    if (c.any("gobo")) {
      const gf = c.fxs.find((f) => Fixtures.capabilities(f).gobo), slots = Fixtures.slotsOf(gf, "gobo");
      const wrap = el('<div class="row"></div>');
      slots.forEach((s, i) => { const b = el('<button class="tile">' + esc(s.name) + "</button>"); b.addEventListener("click", () => Runtime.setAttr("gobo", i, Runtime.ids().filter((id) => Fixtures.capabilities(Project.fixture(id)).gobo))); wrap.appendChild(b); });
      if (c.any("goboRot")) {
        const r = el('<div style="margin-top:8px" class="row"><select aria-label="Gobo-Drehung"><option value="fixed">Gobo fest</option><option value="cw">Gobo dreht rechts</option><option value="ccw">Gobo dreht links</option></select><input type="range" min="0" max="100" value="50" style="flex:1;min-width:100px" aria-label="Gobo-Winkel oder -Tempo"></div>');
        const apply = () => { const mode = r.querySelector("select").value, v = r.querySelector("input").value / 100; Runtime.setAttr("goboRot", mode === "fixed" ? { mode, angle: v } : { mode, speed: v }, Runtime.ids().filter((id) => Fixtures.capabilities(Project.fixture(id)).goboRot)); };
        r.querySelector("select").addEventListener("change", apply); r.querySelector("input").addEventListener("input", apply);
        wrap.appendChild(el('<div style="flex-basis:100%"></div>')); wrap.appendChild(r);
      }
      box.appendChild(block("Gobo", wrap));
    }
    // Strobo
    if (c.any("strobe")) {
      const r = el('<input type="range" min="0" max="100" step="1" aria-label="Strobo">'); ui.strobe = r; r.value = Math.round((attrs().strobe || 0) * 100);
      const b = block("Strobo (Blitz)", r, '<span id="str-val">' + (r.value > 0 ? r.value + " %" : "aus") + "</span>");
      r.addEventListener("input", () => { Runtime.setAttr("strobe", r.value / 100, Runtime.ids().filter((id) => Fixtures.capabilities(Project.fixture(id)).strobe)); b.querySelector("#str-val").textContent = r.value > 0 ? r.value + " %" : "aus"; });
      box.appendChild(b);
    }
    // Gerät finden
    const ident = el('<div class="row" style="margin-top:4px"><button class="btn small secondary">Lampe finden (blinkt 3 s)</button></div>');
    ident.querySelector("button").addEventListener("click", () => Runtime.ids().forEach((id) => Runtime.identify(id)));
    box.appendChild(ident);
  }
  // Regler nachführen, wenn sich Werte von außen ändern (Look, Effekt)
  function syncControlValues() {
    const fxs = Runtime.selectedFixtures();
    if (!fxs.length) return;
    const a = Runtime.engine.get(fxs[0].id) || {};
    if (ui.dim && document.activeElement !== ui.dim) { ui.dim.value = Math.round((a.dimmer || 0) * 100); if (ui.dimVal) ui.dimVal.textContent = ui.dim.value + " %"; }
  }
  function drawPad() {
    const c = ui.pad; if (!c || !c.isConnected) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const res = Runtime.result();
    Runtime.selectedFixtures().forEach((f) => {
      const a = res && res.live[f.id]; if (!a || !Fixtures.capabilities(f).pan) return;
      const x = a.pan * w, y = (1 - a.tilt) * h;
      g.fillStyle = "#0A84FF"; g.beginPath(); g.arc(x, y, 6, 0, 6.3); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
    });
    g.fillStyle = "#8b8b90"; g.font = "10px sans-serif"; g.fillText("Pan →", w - 40, h - 5); g.fillText("Tilt ↑", 4, 12);
  }

  // ---------- Looks ----------
  function saveLookDialog() {
    const body = el('<div class="row" style="flex-direction:column;align-items:stretch;gap:10px"><label class="field"><span>Name</span><input type="text" id="lk-name" placeholder="z. B. Intro warm"></label>' +
      '<label class="field"><span>Überblenden in (Sekunden)</span><input type="number" id="lk-fade" min="0" max="30" step="0.5" value="1"></label>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lk-sel"' + (Runtime.selection.size ? " checked" : "") + '> nur die ausgewählten Lampen speichern</label></div>');
    dialog({ title: "Look speichern", body, actions: [{ label: "Abbrechen", kind: "secondary" }, { label: "Speichern", onClick: (close, box) => {
      Runtime.saveLook(box.querySelector("#lk-name").value.trim(), parseFloat(box.querySelector("#lk-fade").value) || 0, box.querySelector("#lk-sel").checked);
      toast("Look gespeichert.");
    } }] });
    setTimeout(() => { const i = document.getElementById("lk-name"); if (i) i.focus(); }, 30);
  }
  function renderLooks() {
    const grid = ui.lookGrid; if (!grid) return;
    grid.innerHTML = "";
    const looks = Project.state.looks;
    if (!looks.length) { grid.appendChild(el('<p class="help" style="grid-column:1/-1;margin:0">Noch keine Looks. Stelle die Lampen so ein, wie du es brauchst, und drücke „+ Speichern“.</p>')); return; }
    looks.forEach((l) => {
      const b = el('<button class="look-btn' + (Runtime.activeLook() === l.id ? " on" : "") + '">' + esc(l.name) + "<small>" + (l.fade ? l.fade + " s überblenden" : "sofort") + " · " + Object.keys(l.values).length + " Geräte</small>" + (lookEdit ? '<span class="x" title="Look löschen">✕</span>' : "") + "</button>");
      b.addEventListener("click", async (e) => {
        if (lookEdit && e.target.classList.contains("x")) { if (await confirmDialog("Look löschen?", "„" + l.name + "“ wird gelöscht.", "Löschen", true)) Runtime.deleteLook(l.id); return; }
        Runtime.recallLook(l.id);
      });
      grid.appendChild(b);
    });
  }

  // ---------- Effekte ----------
  function renderEffects() {
    const list = ui.fxList; if (!list) return;
    const sig = JSON.stringify(Runtime.effects().map((e) => e.id));
    if (list._sig === sig) return;                        // Liste nur neu bauen, wenn sich die Effekte geändert haben (Auswahlfelder bleiben bedienbar)
    list._sig = sig;
    list.innerHTML = "";
    Runtime.effects().forEach((e) => {
      const defs = Effects.TYPES.find((t) => t.type === e.type), params = FX_PARAMS[e.type] || [];
      const row = el('<div class="fx-item"><div class="fx-head"><div class="grow"><b>' + esc(e.label || (defs && defs.label) || e.type) + "</b><small>" + e.fixtures.length + ' Geräte</small></div></div><div class="fx-params"></div></div>');
      const box = row.querySelector(".fx-params");
      params.forEach((p) => {
        const wrap = el("<label><span>" + esc(p.label) + "</span></label>");
        const s = el('<select aria-label="' + esc(p.label) + '" title="' + esc(p.label) + '"></select>');
        const cur = p.json ? JSON.stringify(e[p.key]) : e[p.key];
        p.options.forEach(([v, lab]) => { const o = el('<option value="' + esc(v) + '">' + esc(lab) + "</option>"); if (String(v) === String(cur)) o.selected = true; s.appendChild(o); });
        s.addEventListener("change", () => { e[p.key] = p.json ? JSON.parse(s.value) : (isNaN(parseFloat(s.value)) ? s.value : parseFloat(s.value)); });
        wrap.appendChild(s); box.appendChild(wrap);
      });
      if (!params.length) box.remove();
      const stop = el('<button class="btn small secondary" aria-label="Effekt stoppen">Stopp</button>');
      stop.addEventListener("click", () => Runtime.stopEffect(e.id));
      row.querySelector(".fx-head").appendChild(stop);
      list.appendChild(row);
    });
    if (!Runtime.effects().length) list.appendChild(el('<p class="help" style="margin:0">Kein Effekt aktiv. Wähle Lampen und tippe oben auf einen Effekt (ohne Auswahl gilt er für alle).</p>'));
  }

  return { build, get view() { return view; } };
})();
