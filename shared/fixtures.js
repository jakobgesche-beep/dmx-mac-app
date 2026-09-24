// Geräteprofile (welcher DMX-Kanal macht was) und die Umrechnung von Eigenschaften ("Attributen") in DMX-Werte.
//
// Attribute (unabhängig vom Gerät):
//   dimmer 0..1, pan 0..1, tilt 0..1 (Anteil des Bewegungsbereichs), speed 0..1,
//   color: Farbrad-Nummer (0, 1, 2 ...) | { scroll: "cw"|"ccw", speed } | { r, g, b } (0..1),
//   gobo: Nummer | { slot, shake: 0..1 } | { scroll: "cw"|"ccw", speed },
//   goboRot: { mode: "fixed"|"cw"|"ccw"|"yoyo", angle | speed 0..1 },
//   strobe 0..1 (0 = aus), blackout (true = dunkel), raw-Werte (z. B. special, program) 0..255.
// Die Belegung des Stairville MH-X25 LED Spot stammt aus der Thomann-Bedienungsanleitung (6- und 12-Kanal-Modus).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Fixtures = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const clamp01 = (v) => (v > 1 ? 1 : v < 0 ? 0 : v);
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const lerpRange = (r, t) => to255(r[0] + clamp01(t) * (r[1] - r[0]));

  // ---------- Profile ----------
  const MHX25_COLORS = [
    { name: "Weiß", dmx: 2, rgb: "#ffffff" }, { name: "Gelb", dmx: 7, rgb: "#ffe600" }, { name: "Pink", dmx: 12, rgb: "#ff5fa8" },
    { name: "Grün", dmx: 17, rgb: "#00c853" }, { name: "Pfirsich", dmx: 22, rgb: "#ffb38a" }, { name: "Hellblau", dmx: 27, rgb: "#4fc3f7" },
    { name: "Gelbgrün", dmx: 32, rgb: "#b6ff3b" }, { name: "Rot", dmx: 37, rgb: "#ff2d2d" }, { name: "Dunkelblau", dmx: 42, rgb: "#1a3cff" },
  ];
  // Gobo-Symbole sind Platzhalter (die Anleitung zeigt Bilder); Nummern und DMX-Werte stimmen
  const MHX25_GOBOS = [
    { name: "Offen", dmx: 3, shape: "open" }, { name: "Gobo 2", dmx: 11, shape: "dots" }, { name: "Gobo 3", dmx: 19, shape: "star" },
    { name: "Gobo 4", dmx: 27, shape: "ring" }, { name: "Gobo 5", dmx: 35, shape: "triangle" }, { name: "Gobo 6", dmx: 43, shape: "lines" },
    { name: "Gobo 7", dmx: 51, shape: "cross" }, { name: "Gobo 8", dmx: 59, shape: "spiral" },
  ];
  // "Gobo n shake": Gobo 8 bei 64..71, Gobo 7 bei 72..79 ... Gobo 2 bei 112..119, Geschwindigkeit steigt
  const MHX25_GOBO_SHAKE = { 7: [64, 71], 6: [72, 79], 5: [80, 87], 4: [88, 95], 3: [96, 103], 2: [104, 111], 1: [112, 119] };
  const MHX25_SHUTTER = { type: "shutter", attr: "shutter", closed: 0, open: 5, strobe: [8, 215], strobeHz: [1, 20] };
  const MHX25_GOBOWHEEL = { type: "slots", attr: "gobo", slots: MHX25_GOBOS, shake: MHX25_GOBO_SHAKE, scroll: { cw: [128, 191], ccw: [192, 255] } };
  const MHX25_COLORWHEEL = { type: "slots", attr: "color", slots: MHX25_COLORS, scroll: { cw: [128, 191], ccw: [192, 255] } };
  const MHX25_GOBOROT = { type: "rotation", attr: "goboRot", fixed: [0, 63], cw: [64, 147], ccw: [148, 231], yoyo: [232, 255] };

  const PROFILES = {
    "stairville-mhx25": {
      id: "stairville-mhx25", name: "Stairville MH-X25 LED Spot", kind: "moving", manufacturer: "Stairville",
      beamAngle: 14, panRange: 540, tiltRange: 270, physical: { panSpeed: 180, tiltSpeed: 120 },
      note: "Belegung aus der Bedienungsanleitung. Im 6-Kanal-Modus gibt es keinen Dimmer (nur an/aus über den Shutter). Pan-/Tilt-Bereich (540°/270°) und Umkehrung stellt man im Menü der Lampe ein.",
      modes: {
        "12ch": { name: "12 Kanäle", channels: [
          { type: "pos", attr: "pan" }, { type: "pos", attr: "tilt" }, { type: "fine", of: "pan" }, { type: "fine", of: "tilt" },
          { type: "linear", attr: "speed" }, MHX25_COLORWHEEL, MHX25_SHUTTER, { type: "linear", attr: "dimmer" }, MHX25_GOBOWHEEL, MHX25_GOBOROT,
          { type: "raw", attr: "special", default: 0 }, { type: "raw", attr: "program", default: 0 } ] },
        "6ch": { name: "6 Kanäle", dimmerViaShutter: true, channels: [
          { type: "pos", attr: "pan" }, { type: "pos", attr: "tilt" }, MHX25_COLORWHEEL, MHX25_SHUTTER, MHX25_GOBOWHEEL, MHX25_GOBOROT ] },
      },
    },
    "generic-dimmer": { id: "generic-dimmer", name: "Bühnenlicht dimmbar (1 Kanal)", kind: "dimmer", manufacturer: "Allgemein", modes: { "1ch": { name: "1 Kanal", channels: [{ type: "linear", attr: "dimmer" }] } } },
    "generic-switch": { id: "generic-switch", name: "Bühnenlicht an/aus (1 Kanal)", kind: "dimmer", manufacturer: "Allgemein", note: "Für Lampen, die nur an oder aus können (Relais/Schalter).",
      modes: { "1ch": { name: "1 Kanal", channels: [{ type: "switch", attr: "dimmer", threshold: 0.5, on: 255, off: 0 }] } } },
    "generic-rgb": { id: "generic-rgb", name: "RGB-Scheinwerfer (3 Kanäle)", kind: "color", manufacturer: "Allgemein",
      modes: { "3ch": { name: "3 Kanäle", channels: [{ type: "linear", attr: "color", comp: "r" }, { type: "linear", attr: "color", comp: "g" }, { type: "linear", attr: "color", comp: "b" }] } } },
    "generic-rgbd": { id: "generic-rgbd", name: "RGB-Scheinwerfer mit Dimmer (4 Kanäle)", kind: "color", manufacturer: "Allgemein", note: "Reihenfolge: Dimmer, Rot, Grün, Blau. Bei anderer Reihenfolge ein eigenes Gerät anlegen.",
      modes: { "4ch": { name: "4 Kanäle", channels: [{ type: "linear", attr: "dimmer" }, { type: "linear", attr: "color", comp: "r" }, { type: "linear", attr: "color", comp: "g" }, { type: "linear", attr: "color", comp: "b" }] } } },
    "generic-strobe": { id: "generic-strobe", name: "Stroboskop (2 Kanäle)", kind: "strobe", manufacturer: "Allgemein", note: "Kanal 1 = Blitzrate, Kanal 2 = Helligkeit. Weicht dein Strobo ab: Kanäle im Handbuch prüfen und ein eigenes Gerät anlegen.",
      modes: { "2ch": { name: "2 Kanäle", channels: [{ type: "linear", attr: "strobe" }, { type: "linear", attr: "dimmer" }] } } },
    "generic-strobe-1ch": { id: "generic-strobe-1ch", name: "Stroboskop (1 Kanal Blitzrate)", kind: "strobe", manufacturer: "Allgemein",
      modes: { "1ch": { name: "1 Kanal", channels: [{ type: "linear", attr: "strobe" }] } } },
  };

  // ---------- eigene Geräte aus einer einfachen Kanalliste ----------
  // list: [{ type: "dimmer"|"red"|"green"|"blue"|"strobe"|"pan"|"pan-fine"|"tilt"|"tilt-fine"|"speed"|"raw", default }]
  const CUSTOM_TYPES = {
    dimmer: { label: "Dimmer / Helligkeit", spec: { type: "linear", attr: "dimmer" } },
    red: { label: "Rot", spec: { type: "linear", attr: "color", comp: "r" } },
    green: { label: "Grün", spec: { type: "linear", attr: "color", comp: "g" } },
    blue: { label: "Blau", spec: { type: "linear", attr: "color", comp: "b" } },
    strobe: { label: "Strobo (Blitzrate)", spec: { type: "linear", attr: "strobe" } },
    pan: { label: "Pan (drehen)", spec: { type: "pos", attr: "pan" } },
    "pan-fine": { label: "Pan fein", spec: { type: "fine", of: "pan" } },
    tilt: { label: "Tilt (neigen)", spec: { type: "pos", attr: "tilt" } },
    "tilt-fine": { label: "Tilt fein", spec: { type: "fine", of: "tilt" } },
    speed: { label: "Bewegungsgeschwindigkeit", spec: { type: "linear", attr: "speed" } },
    raw: { label: "Fester Wert (ohne Funktion)", spec: null },
  };
  function customProfile(id, name, list, kind) {
    const channels = list.map((c, i) => {
      const t = CUSTOM_TYPES[c.type] || CUSTOM_TYPES.raw;
      return t.spec ? Object.assign({}, t.spec) : { type: "raw", attr: "ch" + (i + 1), default: to255(c.default || 0) };
    });
    const hasMove = list.some((c) => c.type === "pan" || c.type === "tilt");
    return { id, name, kind: kind || (hasMove ? "moving" : "dimmer"), manufacturer: "Eigenes Gerät", custom: true, source: list, panRange: 540, tiltRange: 270, beamAngle: 14, modes: { std: { name: list.length + " Kanäle", channels } } };
  }

  // ---------- Zugriff ----------
  const custom = {};
  function registerProfile(p) { custom[p.id] = p; }
  function getProfile(id) { return PROFILES[id] || custom[id] || null; }
  function listProfiles() { return Object.values(PROFILES).concat(Object.values(custom)); }
  function getMode(fixture) {
    const p = getProfile(fixture.profile);
    if (!p) return null;
    return p.modes[fixture.mode] || p.modes[Object.keys(p.modes)[0]];
  }
  function channelCount(fixture) { const m = getMode(fixture); return m ? m.channels.length : 0; }
  const hasAttr = (mode, attr) => mode.channels.some((c) => c.attr === attr || c.of === attr);

  // Welche Bedienelemente braucht das Gerät?
  function capabilities(fixture) {
    const m = getMode(fixture);
    if (!m) return {};
    const has = (a) => hasAttr(m, a);
    const fullDimmer = m.channels.some((c) => (c.attr === "dimmer" || c.of === "dimmer") && c.type !== "switch");   // stufenlos
    const onOffDimmer = m.channels.some((c) => c.type === "switch" && c.attr === "dimmer") || !!m.dimmerViaShutter;  // nur an/aus
    return {
      dimmer: fullDimmer || onOffDimmer,
      dimmerFull: fullDimmer, dimmerOnOff: !fullDimmer && onOffDimmer,
      pan: has("pan"), tilt: has("tilt"), speed: has("speed"), strobe: has("strobe") || has("shutter"),
      colorWheel: m.channels.some((c) => c.attr === "color" && c.type === "slots"), colorRgb: m.channels.some((c) => c.attr === "color" && c.type === "linear"),
      gobo: has("gobo"), goboRot: has("goboRot"),
    };
  }
  function slotsOf(fixture, attr) {
    const m = getMode(fixture);
    const c = m && m.channels.find((x) => x.attr === attr && x.type === "slots");
    return c ? c.slots : [];
  }

  // Grundwerte eines Geräts (alles dunkel, Köpfe in der Mitte)
  function defaultAttrs(fixture) {
    const a = { dimmer: 0, pan: 0.5, tilt: 0.5, speed: 0, color: 0, gobo: 0, goboRot: { mode: "fixed", angle: 0 }, strobe: 0, blackout: false };
    const cap = capabilities(fixture);
    if (cap.colorRgb) a.color = { r: 1, g: 1, b: 1 };
    return a;
  }

  // ---------- Umrechnung Attribute -> DMX ----------
  function encodeSlots(spec, v) {
    const slots = spec.slots;
    if (v && typeof v === "object") {
      if (v.scroll && spec.scroll) return lerpRange(spec.scroll[v.scroll === "ccw" ? "ccw" : "cw"], v.speed === undefined ? 0.5 : v.speed);
      if (v.shake !== undefined && spec.shake && spec.shake[v.slot]) return lerpRange(spec.shake[v.slot], v.shake);
      v = v.slot;
    }
    const i = Math.max(0, Math.min(slots.length - 1, Math.round(+v || 0)));
    return slots[i].dmx;
  }
  function encodeRotation(spec, v) {
    v = v || { mode: "fixed", angle: 0 };
    const range = spec[v.mode] || spec.fixed;
    return lerpRange(range, v.mode === "fixed" || !v.mode ? (v.angle || 0) : (v.speed === undefined ? 0.5 : v.speed));
  }
  function encodeShutter(spec, attrs, mode) {
    const dark = attrs.blackout || (mode.dimmerViaShutter && (attrs.dimmer || 0) < 0.02);
    if (dark) return spec.closed;
    if ((attrs.strobe || 0) > 0.001) return lerpRange(spec.strobe, attrs.strobe);
    return spec.open;
  }
  // gibt die Kanalwerte des Geräts zurück (Länge = Kanalzahl)
  function encode(fixture, attrs) {
    const m = getMode(fixture);
    if (!m) return new Uint8Array(0);
    const a = Object.assign({}, defaultAttrs(fixture), attrs || {});
    const out = new Uint8Array(m.channels.length);
    m.channels.forEach((c, i) => {
      switch (c.type) {
        case "pos": {
          const hasFine = m.channels.some((x) => x.type === "fine" && x.of === c.attr);
          const v = clamp01(a[c.attr]);
          out[i] = hasFine ? Math.round(v * 65535) >> 8 : to255(v * 255);
          break;
        }
        case "fine": out[i] = Math.round(clamp01(a[c.of]) * 65535) & 255; break;
        case "linear": {
          let v = c.comp ? (a[c.attr] && typeof a[c.attr] === "object" ? a[c.attr][c.comp] : 1) : a[c.attr];
          v = clamp01(+v || 0);
          if (c.attr === "color" && c.comp && m.channels.every((x) => x.attr !== "dimmer")) v *= clamp01(a.dimmer === undefined ? 1 : a.dimmer);   // RGB ohne Dimmerkanal: Helligkeit über die Farbe
          out[i] = to255(v * 255);
          break;
        }
        case "switch": out[i] = (a[c.attr] || 0) >= (c.threshold === undefined ? 0.5 : c.threshold) ? c.on : c.off; break;
        case "slots": out[i] = encodeSlots(c, a[c.attr]); break;
        case "rotation": out[i] = encodeRotation(c, a[c.attr]); break;
        case "shutter": out[i] = encodeShutter(c, a, m); break;
        case "raw": out[i] = to255(a[c.attr] === undefined ? c.default : a[c.attr]); break;
        default: out[i] = 0;
      }
    });
    return out;
  }

  // ---------- Was sieht man? (für die Bühnenansicht) ----------
  function slotRgb(spec, v, t) {
    if (v && typeof v === "object" && v.scroll) {
      const h = ((t || 0) * (0.15 + (v.speed || 0.5) * 1.5) * (v.scroll === "ccw" ? -1 : 1)) % 1;
      return "hsl(" + Math.round((h < 0 ? h + 1 : h) * 360) + ",100%,60%)";
    }
    const i = Math.max(0, Math.min(spec.slots.length - 1, Math.round(typeof v === "object" && v ? v.slot || 0 : +v || 0)));
    return spec.slots[i].rgb || "#ffffff";
  }
  // t = Zeit in Sekunden (für Farbläufe)
  function visual(fixture, attrs, t) {
    const m = getMode(fixture), p = getProfile(fixture.profile);
    if (!m) return null;
    const a = Object.assign({}, defaultAttrs(fixture), attrs || {});
    const cap = capabilities(fixture);
    let intensity = 0;
    const sw = m.channels.find((c) => c.type === "switch");
    if (m.dimmerViaShutter) intensity = (a.dimmer || 0) < 0.02 ? 0 : 1;
    else if (sw) intensity = (a.dimmer || 0) >= (sw.threshold === undefined ? 0.5 : sw.threshold) ? 1 : 0;
    else if (cap.dimmerFull) intensity = clamp01(a.dimmer);
    else if (cap.colorRgb) intensity = clamp01(a.dimmer === undefined ? 1 : a.dimmer);
    else if (cap.strobe && !cap.dimmer) intensity = (a.strobe || 0) > 0 ? 1 : 0;
    if (a.blackout) intensity = 0;
    let color = "#ffffff";
    const cw = m.channels.find((c) => c.attr === "color" && c.type === "slots");
    if (cw) color = slotRgb(cw, a.color, t);
    else if (a.color && typeof a.color === "object") color = "rgb(" + [a.color.r, a.color.g, a.color.b].map((x) => Math.round(clamp01(x) * 255)).join(",") + ")";
    const gw = m.channels.find((c) => c.attr === "gobo" && c.type === "slots");
    let shape = "open";
    if (gw && !(a.gobo && typeof a.gobo === "object" && a.gobo.scroll)) {
      const gi = Math.max(0, Math.min(gw.slots.length - 1, Math.round(typeof a.gobo === "object" && a.gobo ? a.gobo.slot || 0 : +a.gobo || 0)));
      shape = gw.slots[gi].shape || "open";
    }
    const rot = a.goboRot || { mode: "fixed", angle: 0 };
    const strobeHz = cap.strobe && (a.strobe || 0) > 0.001 && intensity > 0 ? (m.channels.find((c) => c.type === "shutter") ? lerpRange2(m.channels.find((c) => c.type === "shutter").strobeHz, a.strobe) : 1 + a.strobe * 19) : 0;
    return { intensity, color, shape, goboRotMode: rot.mode, goboRot: rot.mode === "fixed" ? (rot.angle || 0) : (rot.speed === undefined ? 0.5 : rot.speed), strobeHz, pan: clamp01(a.pan), tilt: clamp01(a.tilt), beamAngle: (p && p.beamAngle) || 14, moving: !!(cap.pan || cap.tilt) };
  }
  const lerpRange2 = (r, t) => r[0] + clamp01(t) * (r[1] - r[0]);

  // ---------- Adressen prüfen und alles in ein DMX-Bild schreiben ----------
  function checkPatch(fixtures) {
    const issues = [], used = new Array(513).fill(null);
    fixtures.forEach((f) => {
      const n = channelCount(f);
      if (!n) { issues.push({ fixtureId: f.id, message: "Unbekanntes Gerät oder unbekannter Modus." }); return; }
      if (!(f.address >= 1) || f.address + n - 1 > 512) { issues.push({ fixtureId: f.id, message: "Adresse " + f.address + " mit " + n + " Kanälen passt nicht in 1 bis 512." }); return; }
      for (let c = f.address; c < f.address + n; c++) {
        if (used[c] && used[c] !== f.id) {
          const other = fixtures.find((x) => x.id === used[c]);
          issues.push({ fixtureId: f.id, message: "Überschneidung mit „" + (other ? other.name : "?") + "“ bei Kanal " + c + "." });
          break;
        }
        used[c] = f.id;
      }
    });
    return issues;
  }
  function highestChannel(fixtures) {
    let hi = 0;
    fixtures.forEach((f) => { const n = channelCount(f); if (n && f.address >= 1) hi = Math.max(hi, Math.min(512, f.address + n - 1)); });
    return hi;
  }
  // attrsById: { fixtureId: attrs } -> Uint8Array(512)
  function buildUniverse(fixtures, attrsById) {
    const u = new Uint8Array(512);
    fixtures.forEach((f) => {
      const n = channelCount(f);
      if (!n || f.address < 1 || f.address + n - 1 > 512) return;
      const vals = encode(f, attrsById[f.id]);
      for (let i = 0; i < n; i++) u[f.address - 1 + i] = vals[i];
    });
    return u;
  }

  return { PROFILES, CUSTOM_TYPES, customProfile, registerProfile, getProfile, listProfiles, getMode, channelCount, capabilities, slotsOf, defaultAttrs, encode, visual, checkPatch, highestChannel, buildUniverse };
});
