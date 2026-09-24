// Laufzeit: Lichtkern, Takt und Auswahl. Berechnet 40-mal pro Sekunde das DMX-Bild und schickt es an die Ausgabe.
const Runtime = (function () {
  const api = window.dmxAPI;
  const engine = new LightEngine();
  const clock = new BeatClock();
  const selection = new Set();
  const frameFns = [], selFns = [], stateFns = [];
  let lastSend = 0, activeLook = null, lastResult = null;
  const R = { engine, clock, selection };

  const notifyState = () => stateFns.forEach((f) => f());
  const notifySel = () => selFns.forEach((f) => f());

  function rebuild() {
    engine.setFixtures(Project.state.fixtures);
    engine.realisticMotion = Project.state.settings.realisticMotion !== false;
    Array.from(selection).forEach((id) => { if (!Project.fixture(id)) selection.delete(id); });
    lastSend = 0;
    notifySel(); notifyState();
  }
  Project.on("fixtures", rebuild);
  Project.on("load", () => { clock.setBpm(Project.state.settings.bpm || 120); rebuild(); });
  Project.on("settings", () => { engine.realisticMotion = Project.state.settings.realisticMotion !== false; });

  // ---- Bild berechnen und senden ----
  function loop() {
    const now = performance.now();
    lastResult = engine.tick(now, { beat: clock.beat(now) });
    if (lastResult.changed || now - lastSend > 500) {
      lastSend = now;
      try { api.sendFrame(new Uint8Array(lastResult.universe), Math.max(24, engine.channels)); } catch (e) {}
    }
    frameFns.forEach((f) => f(lastResult, now));
  }
  setInterval(loop, 25);
  R.result = () => lastResult;
  R.onFrame = (fn) => frameFns.push(fn);
  R.onState = (fn) => stateFns.push(fn);
  R.onSelection = (fn) => selFns.push(fn);

  // ---- Auswahl ----
  R.ids = () => Array.from(selection);
  R.select = (ids) => { selection.clear(); (ids || []).forEach((id) => { if (Project.fixture(id)) selection.add(id); }); notifySel(); };
  R.toggle = (id) => { if (selection.has(id)) selection.delete(id); else if (Project.fixture(id)) selection.add(id); notifySel(); };
  R.selectAll = () => R.select(Project.state.fixtures.map((f) => f.id));
  R.selectGroup = (g) => R.select(Project.state.fixtures.filter((f) => f.group === g).map((f) => f.id));
  R.selectedFixtures = () => R.ids().map((id) => Project.fixture(id)).filter(Boolean);

  // ---- Bedienung der Auswahl ----
  R.setAttr = (attr, value, ids) => { engine.setMany(ids || R.ids(), { [attr]: value }); activeLook = null; notifyState(); };
  R.setPanTilt = (pan, tilt) => { const ids = R.ids().filter((id) => Fixtures.capabilities(Project.fixture(id)).pan); engine.setMany(ids, { pan: clamp(pan, 0, 1), tilt: clamp(tilt, 0, 1) }); notifyState(); };
  const hexRgb = (h) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ""); return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1]; };
  function nearestSlot(slots, rgb) {
    let best = 0, bd = 1e9;
    slots.forEach((s, i) => { const c = hexRgb(s.rgb), d = (c[0] - rgb.r) ** 2 + (c[1] - rgb.g) ** 2 + (c[2] - rgb.b) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // Farbe: für Farbrad-Geräte die Nummer (Farbe mit dem gleichen Namen oder der ähnlichsten Farbe), für RGB-Geräte die RGB-Werte
  R.setColor = (choice) => {
    R.selectedFixtures().forEach((f) => {
      const cap = Fixtures.capabilities(f);
      if (cap.colorRgb) engine.set(f.id, "color", choice.rgb ? { r: choice.rgb.r, g: choice.rgb.g, b: choice.rgb.b } : { r: 1, g: 1, b: 1 });
      else if (cap.colorWheel) {
        const slots = Fixtures.slotsOf(f, "color");
        let idx = choice.slot !== undefined ? Math.min(choice.slot, slots.length - 1) : 0;
        if (choice.name) { const byName = slots.findIndex((s) => s.name === choice.name); if (byName >= 0) idx = byName; else if (choice.rgb) idx = nearestSlot(slots, choice.rgb); }
        engine.set(f.id, "color", choice.scroll ? { scroll: choice.scroll, speed: choice.speed === undefined ? 0.5 : choice.speed } : idx);
      }
    });
    activeLook = null; notifyState();
  };
  // Zielpunkt auf der Bühne: alle gewählten Köpfe richten sich darauf aus
  R.aimSelection = (target) => {
    let ok = 0, fail = 0;
    R.selectedFixtures().forEach((f) => {
      if (!Fixtures.capabilities(f).pan) return;
      const a = engine.aim(f.id, target);
      if (a) { engine.setMany([f.id], { pan: a.pan, tilt: a.tilt }); ok++; } else fail++;
    });
    notifyState();
    return { ok, fail };
  };

  // Gerät finden: 3 Sekunden hell blinken (auch wenn es sonst dunkel ist)
  R.identify = (id) => {
    const f = Project.fixture(id);
    if (!f) return;
    const eid = engine.addEffect({ type: "pulse", fixtures: [id], rate: 0.5, shape: "square", min: 0, max: 1, mode: "set", label: "Finden" }, clock.beat());
    setTimeout(() => { engine.removeEffect(eid); notifyState(); }, 3000);
  };

  // ---- Master, Blackout ----
  R.setMaster = (v) => { engine.master = clamp(v, 0, 1); notifyState(); };
  R.setBlackout = (on) => { engine.blackout = !!on; notifyState(); };

  // ---- Looks ----
  R.saveLook = (name, fadeSec, onlySelection) => {
    const values = engine.snapshot(onlySelection && selection.size ? R.ids() : "all");
    Project.update((s) => s.looks.push({ id: uid("l"), name: name || "Look " + (s.looks.length + 1), fade: fadeSec || 0, values }), "looks");
  };
  R.recallLook = (id) => {
    const look = Project.state.looks.find((l) => l.id === id);
    if (!look) return;
    engine.goTo(look.values, look.fade, performance.now());
    activeLook = id; notifyState();
  };
  R.activeLook = () => activeLook;
  R.deleteLook = (id) => Project.update((s) => { s.looks = s.looks.filter((l) => l.id !== id); }, "looks");

  // ---- Effekte ----
  R.startEffect = (type, ids, overrides) => {
    const def = Effects.TYPES.find((t) => t.type === type);
    if (!def) return null;
    const targets = ids && ids.length ? ids : (type === "move" ? Project.state.fixtures.filter((f) => Fixtures.capabilities(f).pan).map((f) => f.id) : Project.state.fixtures.map((f) => f.id));
    const eff = Object.assign({ type, label: def.label }, JSON.parse(JSON.stringify(def.defaults)), overrides || {}, { fixtures: targets.slice() });
    const id = engine.addEffect(eff, clock.beat());
    notifyState();
    return id;
  };
  R.stopEffect = (id) => { engine.removeEffect(id); notifyState(); };
  R.stopAllEffects = () => { engine.clearEffects(); notifyState(); };
  R.effects = () => engine.effects;

  return R;
})();
