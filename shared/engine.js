// Lichtkern: hält die Eigenschaften (Attribute) aller Geräte, blendet zwischen Looks über, lässt Effekte im Takt laufen und
// erzeugt daraus das DMX-Bild. Läuft in der Oberfläche (für die Bühnenansicht) und liefert das Bild an die DMX-Ausgabe.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Fixtures || require("./fixtures"), root.Effects || require("./effects"), root.Stage || require("./stage"));
  else root.LightEngine = factory(root.Fixtures, root.Effects, root.Stage);
})(typeof self !== "undefined" ? self : this, function (Fixtures, Effects, Stage) {
  const clamp01 = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const NUMERIC = ["dimmer", "pan", "tilt", "speed", "strobe"];

  // ein Wert zwischen zwei Zuständen (t 0..1): Zahlen gleiten, Farben (RGB) gleiten, alles andere springt in der Mitte
  function mixAttrs(a, b, t) {
    const out = {};
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach((k) => {
      const x = a[k], y = b[k];
      if (y === undefined) { out[k] = x; return; }
      if (x === undefined) { out[k] = y; return; }
      if (NUMERIC.includes(k) && typeof x === "number" && typeof y === "number") out[k] = x + (y - x) * t;
      else if (k === "color" && x && y && typeof x === "object" && typeof y === "object" && "r" in x && "r" in y) out[k] = { r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t };
      else out[k] = t < 0.5 ? x : y;
    });
    return out;
  }

  class LightEngine {
    constructor(opts) {
      opts = opts || {};
      this.fixtures = [];
      this.base = {};            // aktueller Zustand (nach Überblendung)
      this.live = {};            // Zustand nach Effekten, Master und Blackout (das wird gesendet)
      this.actual = {};          // angezeigte Kopfstellung (mit begrenzter Geschwindigkeit)
      this.effects = [];
      this.fade = null;
      this.master = 1; this.blackout = false;
      this.realisticMotion = opts.realisticMotion !== false;
      this.stage = opts.stage || { fixtures: {} };
      this.lastTime = null; this.universe = new Uint8Array(512); this.channels = 0;
      this.testChannels = new Map();      // Kanal-Test (Verkabelung prüfen): Kanal -> Wert, überschreibt alles
    }
    setFixtures(list) {
      this.fixtures = list.map((f) => Object.assign({}, f));
      const keep = {};
      this.fixtures.forEach((f) => { keep[f.id] = this.base[f.id] || Fixtures.defaultAttrs(f); });
      this.base = keep;
      this.channels = Math.max(Fixtures.highestChannel(this.fixtures), this.testChannels.size ? Math.max(...this.testChannels.keys()) : 0);
    }
    setTestChannel(ch, value) { if (value === null || value === undefined) this.testChannels.delete(ch); else this.testChannels.set(ch, Math.max(0, Math.min(255, value | 0))); this.channels = Math.max(Fixtures.highestChannel(this.fixtures), this.testChannels.size ? Math.max(...this.testChannels.keys()) : 0); }
    fixture(id) { return this.fixtures.find((f) => f.id === id); }

    // "all", "group:Name", "kind:moving" oder Liste von IDs -> Liste von IDs
    resolve(sel) {
      if (Array.isArray(sel)) return sel.filter((id) => this.fixture(id));
      if (!sel || sel === "all") return this.fixtures.map((f) => f.id);
      if (typeof sel === "string" && sel.startsWith("group:")) return this.fixtures.filter((f) => f.group === sel.slice(6)).map((f) => f.id);
      if (typeof sel === "string" && sel.startsWith("kind:")) return this.fixtures.filter((f) => { const p = Fixtures.getProfile(f.profile); return p && p.kind === sel.slice(5); }).map((f) => f.id);
      return this.fixture(sel) ? [sel] : [];
    }

    // ---- Werte setzen (sofort) ----
    // Handbedienung während einer Überblendung: der Wert bleibt, die übrigen Werte blenden weiter
    set(id, attr, value) { this.setMany([id], { [attr]: value }); }
    setMany(ids, values) {
      this.resolve(ids).forEach((id) => Object.keys(values).forEach((k) => {
        this.base[id][k] = values[k];
        if (this.fade && this.fade.to[id]) { this.fade.to[id][k] = clone(values[k]); this.fade.from[id][k] = clone(values[k]); }
      }));
    }
    get(id) { return this.base[id]; }
    snapshot(ids) { const out = {}; this.resolve(ids).forEach((id) => { out[id] = clone(this.base[id]); }); return out; }

    // ---- Looks überblenden: values = { id: attrs } ----
    goTo(values, seconds, now) {
      const target = {};
      Object.keys(values).forEach((id) => { if (this.base[id]) target[id] = Object.assign({}, this.base[id], clone(values[id])); });
      if (!seconds || seconds <= 0) { Object.keys(target).forEach((id) => { this.base[id] = target[id]; }); this.fade = null; return; }
      const from = {};
      Object.keys(target).forEach((id) => { from[id] = clone(this.base[id]); });
      this.fade = { from, to: target, start: now === undefined ? this.lastTime || 0 : now, dur: seconds * 1000 };
    }

    // ---- Effekte ----
    addEffect(def, startBeat) { const e = Object.assign({ id: def.id || "e" + Math.random().toString(36).slice(2, 8) }, clone(def)); if (startBeat !== undefined) e.startBeat = startBeat; this.effects.push(e); return e.id; }
    removeEffect(id) { this.effects = this.effects.filter((e) => e.id !== id); }
    clearEffects() { this.effects = []; }
    setEffects(list, startBeat) { this.effects = []; (list || []).forEach((d) => this.addEffect(d, startBeat)); }

    aim(id, target) {
      const f = this.fixture(id);
      if (!f || !f.pos) return null;
      const g = this.geometry(f);
      const r = Stage.solveAim(g, target, this.base[id]);
      return r.ok ? { pan: r.pan, tilt: r.tilt } : null;
    }
    geometry(f) {
      const p = Fixtures.getProfile(f.profile) || {};
      return { x: f.pos ? f.pos.x : 0, y: f.pos ? f.pos.y : 0, z: f.pos ? f.pos.z : 3, mount: f.mount || "hang", yaw: f.yaw || 0, invertPan: !!f.invertPan, invertTilt: !!f.invertTilt, panRange: f.panRange || p.panRange || 540, tiltRange: f.tiltRange || p.tiltRange || 270 };
    }

    // ---- ein Bild berechnen ----
    // now: Zeit in ms, clock: { beat } (Schläge seit Beginn)
    tick(now, clock) {
      const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(0.25, (now - this.lastTime) / 1000));
      this.lastTime = now;
      if (this.fade) {
        const t = Math.min(1, (now - this.fade.start) / this.fade.dur);
        Object.keys(this.fade.to).forEach((id) => { this.base[id] = mixAttrs(this.fade.from[id], this.fade.to[id], t); });
        if (t >= 1) { Object.keys(this.fade.to).forEach((id) => { this.base[id] = clone(this.fade.to[id]); }); this.fade = null; }
      }
      const live = {};
      this.fixtures.forEach((f) => { live[f.id] = clone(this.base[f.id]); });
      const beat = clock && clock.beat !== undefined ? clock.beat : now / 1000 * 2;
      this.effects.forEach((e) => {
        Effects.apply(e, { beat, ids: this.resolve(e.fixtures), attrs: live, fixtures: this.fixtures, aim: (id, tg) => this.aim(id, tg) });
      });
      this.fixtures.forEach((f) => {
        const a = live[f.id];
        a.dimmer = clamp01((a.dimmer || 0) * this.master);
        if (this.blackout) { a.dimmer = 0; a.blackout = true; }
      });
      this.live = live;
      this._moveActual(dt);
      const u = Fixtures.buildUniverse(this.fixtures, live);
      this.testChannels.forEach((v, ch) => { if (ch >= 1 && ch <= 512) u[ch - 1] = v; });
      const changed = u.some((v, i) => v !== this.universe[i]);
      this.universe = u;
      return { universe: u, changed, live, actual: this.actual };
    }

    // Kopfstellung, wie sie die Lampe wegen ihrer begrenzten Geschwindigkeit wirklich erreicht (Näherung)
    _moveActual(dt) {
      this.fixtures.forEach((f) => {
        const a = this.live[f.id], p = Fixtures.getProfile(f.profile) || {};
        const cur = this.actual[f.id] || (this.actual[f.id] = { pan: a.pan, tilt: a.tilt });
        if (!this.realisticMotion || !p.physical || dt === 0) { cur.pan = a.pan; cur.tilt = a.tilt; return; }
        const panRange = f.panRange || p.panRange || 540, tiltRange = f.tiltRange || p.tiltRange || 270;
        const step = (from, to, dps, range) => { const m = (dps * dt) / range; return from + Math.max(-m, Math.min(m, to - from)); };
        cur.pan = step(cur.pan, a.pan, p.physical.panSpeed, panRange);
        cur.tilt = step(cur.tilt, a.tilt, p.physical.tiltSpeed, tiltRange);
      });
    }
  }
  LightEngine.mixAttrs = mixAttrs;
  return LightEngine;
});
