// Effekte im Takt: jeder Effekt verändert Eigenschaften (dimmer, pan, tilt, color ...) einer Gruppe von Geräten abhängig von
// der Zeit in Schlägen (beat). So laufen sie automatisch im Tempo der Musik. Reine Funktionen, ohne Bildschirm.
//
// Ein Effekt: { type, fixtures: "all" | "group:Name" | "kind:moving" | ["id1", ...], ...Parameter }
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Effects = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const clamp01 = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);
  const frac = (x) => x - Math.floor(x);

  // Kurvenformen über eine Periode p (0..1): Ergebnis 0..1
  const SHAPES = {
    "saw-down": (p) => 1 - p, "saw-up": (p) => p, sine: (p) => 0.5 - 0.5 * Math.cos(p * 2 * Math.PI),
    square: (p) => (p < 0.5 ? 1 : 0), triangle: (p) => (p < 0.5 ? p * 2 : 2 - p * 2), pulse: (p) => (p < 0.1 ? 1 : 0),
  };

  // Aus einer Liste von n Geräten: welches ist zum Zeitpunkt pos (in Schritten) aktiv? Ergebnis pro Gerät 0..1
  function chaseLevels(n, pos, o) {
    const width = Math.max(1, Math.round(o.width || 1)), pattern = o.pattern || "forward", fade = clamp01(o.fade === undefined ? 0 : o.fade);
    const step = Math.floor(pos), within = pos - step;
    const levels = new Array(n).fill(0);
    const idxAt = (s) => {
      if (n === 1) return 0;
      if (pattern === "backward") return ((n - 1 - (s % n)) + n) % n;
      if (pattern === "pingpong") { const m = s % (2 * n - 2); return m < n ? m : 2 * n - 2 - m; }
      if (pattern === "random") { let x = (s * 2654435761 + 12345) >>> 0; x ^= x >>> 15; return (x >>> 0) % n; }
      return ((s % n) + n) % n;
    };
    // aktuelle Gruppe (width Geräte hintereinander) und, bei fade, die vorherige ausblenden
    for (let w = 0; w < width; w++) {
      const cur = pattern === "random" ? (idxAt(step) + w) % n : (pattern === "backward" ? ((idxAt(step) - w) % n + n) % n : (idxAt(step) + w) % n);
      levels[cur] = Math.max(levels[cur], fade > 0 ? clamp01(within / fade) : 1);
    }
    if (fade > 0) for (let w = 0; w < width; w++) {
      const prevStart = idxAt(step - 1);
      const prev = pattern === "random" ? (prevStart + w) % n : (pattern === "backward" ? ((prevStart - w) % n + n) % n : (prevStart + w) % n);
      const v = 1 - clamp01(within / fade);
      if (levels[prev] < 1) levels[prev] = Math.max(levels[prev], v);
    }
    return levels;
  }

  // ctx: { beat, ids (aufgelöste Geräte-IDs), attrs (ändern), fixtures (id -> Gerät), aim(fixtureId, target) -> {pan, tilt} }
  function apply(effect, ctx) {
    const t = effect.type, ids = ctx.ids, n = ids.length, beat = ctx.beat - (effect.startBeat || 0) + (effect.offsetBeats || 0);
    if (!n) return;
    const set = (id, attr, v) => { ctx.attrs[id][attr] = v; };
    switch (t) {
      case "chase": {
        const on = effect.on === undefined ? 1 : effect.on, off = effect.off || 0;
        const lv = chaseLevels(n, beat / (effect.step || 1), effect);
        ids.forEach((id, i) => set(id, effect.attr || "dimmer", off + (on - off) * lv[i]));
        if (effect.color !== undefined) ids.forEach((id, i) => { if (lv[i] > 0) set(id, "color", effect.color); });
        break;
      }
      case "pulse": {
        const shape = SHAPES[effect.shape || "saw-down"] || SHAPES["saw-down"], rate = effect.rate || 1, min = effect.min || 0, max = effect.max === undefined ? 1 : effect.max, attr = effect.attr || "dimmer";
        ids.forEach((id, i) => {
          const p = frac(beat / rate + (effect.phaseSpread || 0) * (i / n));
          const v = min + (max - min) * shape(p);
          set(id, attr, effect.mode === "mul" ? (ctx.attrs[id][attr] || 0) * v : v);
        });
        break;
      }
      case "colorCycle": {
        const colors = effect.colors && effect.colors.length ? effect.colors : [0], step = effect.step || 4;
        ids.forEach((id, i) => { const s = Math.floor(beat / step + (effect.spread || 0) * i); set(id, "color", colors[((s % colors.length) + colors.length) % colors.length]); });
        break;
      }
      case "gobo": {
        const gobos = effect.gobos && effect.gobos.length ? effect.gobos : [0], step = effect.step || 4;
        ids.forEach((id, i) => { const s = Math.floor(beat / step + (effect.spread || 0) * i); set(id, "gobo", gobos[((s % gobos.length) + gobos.length) % gobos.length]); });
        break;
      }
      case "move": {
        const rate = effect.rate || 8, size = effect.size || { pan: 0.15, tilt: 0.1 }, shape = effect.shape || "circle";
        ids.forEach((id, i) => {
          let cx = 0.5, cy = 0.5;
          if (effect.center && effect.center.target && ctx.aim) { const a = ctx.aim(id, effect.center.target); if (a) { cx = a.pan; cy = a.tilt; } }
          else if (effect.center) { cx = effect.center.pan === undefined ? 0.5 : effect.center.pan; cy = effect.center.tilt === undefined ? 0.5 : effect.center.tilt; }
          const p = frac(beat / rate + (effect.spread || 0) * (i / n)) * 2 * Math.PI;
          let dx = 0, dy = 0;
          if (shape === "circle" || shape === "ellipse") { dx = Math.cos(p) * size.pan; dy = Math.sin(p) * size.tilt; }
          else if (shape === "eight") { dx = Math.sin(p) * size.pan; dy = Math.sin(2 * p) * size.tilt; }
          else if (shape === "sweep-pan") dx = Math.sin(p) * size.pan;
          else if (shape === "sweep-tilt") dy = Math.sin(p) * size.tilt;
          set(id, "pan", clamp01(cx + dx)); set(id, "tilt", clamp01(cy + dy));
        });
        break;
      }
      case "strobeHit": {
        const every = effect.every || 1, dur = effect.duration === undefined ? 0.1 : effect.duration, rate = effect.strobe === undefined ? 0.8 : effect.strobe;
        const inHit = frac(beat / every) * every < dur;
        ids.forEach((id) => { set(id, "strobe", inHit ? rate : 0); if (inHit && effect.forceOn) set(id, "dimmer", 1); });
        break;
      }
      case "set": {                                    // feste Werte für die Dauer des Effekts (z. B. Farbe/Gobo/Position)
        const vals = effect.values || {};
        ids.forEach((id) => Object.keys(vals).forEach((k) => set(id, k, vals[k])));
        break;
      }
      default: break;
    }
  }

  // Beschreibung für die Oberfläche
  const TYPES = [
    { type: "chase", label: "Lauflicht", help: "Ein Gerät nach dem anderen leuchtet, im Takt.", defaults: { step: 1, pattern: "forward", width: 1, fade: 0.3, on: 1, off: 0 } },
    { type: "pulse", label: "Pulsieren", help: "Helligkeit pulsiert im Takt (Saugzahn, Sinus, Rechteck ...).", defaults: { rate: 1, shape: "saw-down", min: 0.1, max: 1 } },
    { type: "colorCycle", label: "Farbwechsel", help: "Wechselt die Farben der Reihe nach.", defaults: { step: 4, colors: [7, 8, 5, 3], spread: 0 } },
    { type: "move", label: "Bewegung", help: "Köpfe fahren einen Kreis, eine Acht oder pendeln.", defaults: { shape: "circle", rate: 8, size: { pan: 0.12, tilt: 0.08 }, spread: 0.5, center: { pan: 0.5, tilt: 0.55 } } },
    { type: "strobeHit", label: "Blitz-Schläge", help: "Kurze Blitze auf den Schlag.", defaults: { every: 4, duration: 0.25, strobe: 0.8, forceOn: true } },
    { type: "gobo", label: "Gobo-Wechsel", help: "Wechselt die Gobos der Reihe nach.", defaults: { step: 8, gobos: [0, 1, 2, 3] } },
  ];

  return { SHAPES, chaseLevels, apply, TYPES };
});
