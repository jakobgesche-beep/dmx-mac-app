// Bühnenansicht: zeigt live, was die Lichter tun (Strahl, Farbe, Gobo, Blitz, Kopfbewegung).
// Draufsicht (x/y) und Seitenansicht (Tiefe/Höhe). Berechnet aus denselben Werten, die an die Lampen gehen.
const RAD = Math.PI / 180;

class StageView {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = "top"; this.aim = false; this.edit = false;
    this.hits = []; this.target = null; this.drag = null;
    this.view = null;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e));
    if (typeof ResizeObserver === "function") new ResizeObserver(() => this.draw(performance.now())).observe(canvas);
  }
  setMode(m) { this.mode = m; this.draw(performance.now()); }
  setAim(on) { this.aim = on; if (on) this.edit = false; }
  setEdit(on) { this.edit = on; if (on) this.aim = false; }

  // ---- Umrechnung Meter <-> Pixel ----
  layout() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight, st = Project.state.stage;
    const pad = 34;
    if (this.mode === "top") {
      const scale = Math.min((W - 2 * pad) / st.width, (H - 2 * pad - 14) / st.depth);
      const x0 = W / 2, y0 = H - pad - 10;
      return { W, H, scale, mode: "top", toPx: (x, y) => ({ x: x0 + x * scale, y: y0 - y * scale }), fromPx: (px, py) => ({ x: (px - x0) / scale, y: (y0 - py) / scale }) };
    }
    const zmax = Math.max(st.height, 3) + 0.5;
    const scale = Math.min((W - 2 * pad) / st.depth, (H - 2 * pad) / zmax);
    const x0 = (W - st.depth * scale) / 2, y0 = H - pad;
    return { W, H, scale, mode: "side", toPx: (yy, z) => ({ x: x0 + yy * scale, y: y0 - z * scale }), fromPx: (px, py) => ({ y: (px - x0) / scale, z: (y0 - py) / scale }) };
  }

  // ---- zeichnen ----
  draw(now) {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = (this.view = this.layout());
    const st = Project.state.stage, t = now / 1000;
    this.hits = []; this.taken = [];
    g.font = '11px ' + getComputedStyle(document.body).getPropertyValue("--font");
    // Bühne
    if (L.mode === "top") {
      const a = L.toPx(-st.width / 2, st.depth), b = L.toPx(st.width / 2, 0);
      g.fillStyle = "#1f1f22"; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 1;
      for (let x = -Math.floor(st.width / 2); x <= st.width / 2; x++) { const p = L.toPx(x, 0), q = L.toPx(x, st.depth); g.beginPath(); g.moveTo(Math.round(p.x) + 0.5, p.y); g.lineTo(Math.round(q.x) + 0.5, q.y); g.stroke(); }
      for (let y = 0; y <= st.depth; y++) { const p = L.toPx(-st.width / 2, y), q = L.toPx(st.width / 2, y); g.beginPath(); g.moveTo(p.x, Math.round(p.y) + 0.5); g.lineTo(q.x, Math.round(q.y) + 0.5); g.stroke(); }
      g.strokeStyle = "#55555a"; g.lineWidth = 1.5; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.fillStyle = "#8b8b90"; g.textAlign = "center"; this.note(g, "Publikum", (a.x + b.x) / 2, b.y + 22); this.note(g, "hinten", (a.x + b.x) / 2, a.y - 8);
      this.note(g, st.width + " m", (a.x + b.x) / 2, b.y + 9);
    } else {
      const a = L.toPx(0, 0), b = L.toPx(st.depth, 0), top = L.toPx(0, st.height);
      g.fillStyle = "#1f1f22"; g.fillRect(a.x, top.y, b.x - a.x, a.y - top.y);
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 1;
      for (let z = 1; z <= st.height; z++) { const p = L.toPx(0, z), q = L.toPx(st.depth, z); g.beginPath(); g.moveTo(p.x, Math.round(p.y) + 0.5); g.lineTo(q.x, Math.round(q.y) + 0.5); g.stroke(); }
      g.strokeStyle = "#55555a"; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x - 10, a.y); g.lineTo(b.x + 10, b.y); g.stroke();
      g.fillStyle = "#8b8b90"; g.textAlign = "left"; this.note(g, "← Publikum", a.x, a.y + 16); g.textAlign = "right"; this.note(g, "hinten →", b.x, b.y + 16);
      g.textAlign = "left"; this.note(g, st.height + " m", a.x + 3, top.y + 12);
    }
    const res = Runtime.result();
    if (!res) return;
    const engine = Runtime.engine;
    // Strahlen und Lichtflecken (addiert, damit sich überlagerndes Licht heller wird)
    g.save(); g.globalCompositeOperation = "lighter";
    const infos = engine.fixtures.map((f) => {
      const live = res.live[f.id], act = res.actual[f.id] || { pan: live.pan, tilt: live.tilt };
      const vis = Fixtures.visual(f, live, t);
      return { f, live, act, vis, geo: engine.geometry(f) };
    });
    infos.forEach((I) => this.drawBeam(g, L, I, t));
    g.restore();
    // Geräte
    infos.forEach((I) => this.drawFixture(g, L, I));
    // Namen: gewählte Geräte zuerst; was ein anderes Gerät oder einen Text überdecken würde, bleibt weg
    infos.filter((I) => Runtime.selection.has(I.f.id)).concat(infos.filter((I) => !Runtime.selection.has(I.f.id))).forEach((I) => this.label(g, L, I));
    if (this.target && L.mode === "top") {
      const p = L.toPx(this.target.x, this.target.y);
      g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 9, 0, 6.3); g.moveTo(p.x - 14, p.y); g.lineTo(p.x + 14, p.y); g.moveTo(p.x, p.y - 14); g.lineTo(p.x, p.y + 14); g.stroke();
    }
  }

  point(L, x, y, z) { return L.mode === "top" ? L.toPx(x, y) : L.toPx(y, z); }

  drawBeam(g, L, I, t) {
    const { f, vis, geo, act } = I;
    if (vis.intensity < 0.01) return;
    if (vis.strobeHz > 0 && Math.floor(t * vis.strobeHz * 2) % 2 === 1) return;     // Blitz: aus-Phase
    const from = this.point(L, geo.x, geo.y, geo.z);
    const col = vis.color;
    if (!vis.moving) {                                                                 // Flutlicht/Wash: Schein um das Gerät
      const r = (0.7 + 0.9 * vis.intensity) * L.scale;
      const grad = g.createRadialGradient(from.x, from.y, 0, from.x, from.y, r);
      grad.addColorStop(0, this.rgba(col, 0.55 * vis.intensity)); grad.addColorStop(1, this.rgba(col, 0));
      g.fillStyle = grad; g.beginPath(); g.arc(from.x, from.y, r, 0, 6.3); g.fill();
      return;
    }
    const dir = Stage.beamDirection(geo, act.pan, act.tilt), end = Stage.beamEnd(geo, dir, 12);
    const to = this.point(L, end.x, end.y, end.z);
    const spotR = end.hit ? Math.max(0.12, Stage.spotRadius(end.dist, vis.beamAngle)) : 0.06;
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (len > 2) {
      const nx = -dy / len, ny = dx / len, wEnd = Math.max(2, spotR * L.scale);
      g.fillStyle = this.rgba(col, 0.10 + 0.28 * vis.intensity);
      g.beginPath(); g.moveTo(from.x + nx * 1.5, from.y + ny * 1.5); g.lineTo(to.x + nx * wEnd, to.y + ny * wEnd); g.lineTo(to.x - nx * wEnd, to.y - ny * wEnd); g.lineTo(from.x - nx * 1.5, from.y - ny * 1.5); g.closePath(); g.fill();
    }
    if (end.hit) {                                                                     // Lichtfleck am Boden
      const rr = spotR * L.scale, ry = L.mode === "side" ? Math.max(2, rr * 0.35) : rr;
      const grad = g.createRadialGradient(to.x, to.y, 0, to.x, to.y, rr);
      grad.addColorStop(0, this.rgba(col, 0.85 * vis.intensity)); grad.addColorStop(0.7, this.rgba(col, 0.45 * vis.intensity)); grad.addColorStop(1, this.rgba(col, 0));
      g.save(); g.translate(to.x, to.y); g.scale(1, ry / rr); g.fillStyle = grad; g.beginPath(); g.arc(0, 0, rr, 0, 6.3); g.fill(); g.restore();
      if (vis.shape !== "open" && L.mode === "top") this.drawGobo(g, vis, to.x, to.y, rr * 0.8, t, col);
    }
  }
  drawGobo(g, vis, cx, cy, r, t, col) {
    let ang = 0;
    if (vis.goboRotMode === "fixed") ang = vis.goboRot * 2 * Math.PI;
    else ang = t * (0.3 + vis.goboRot * 5) * (vis.goboRotMode === "ccw" ? -1 : 1) * (vis.goboRotMode === "yoyo" ? Math.sin(t) : 1);
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.globalCompositeOperation = "source-over"; g.strokeStyle = "rgba(20,20,22,0.75)"; g.fillStyle = "rgba(20,20,22,0.75)"; g.lineWidth = Math.max(1, r * 0.12);
    const s = vis.shape;
    if (s === "dots") { for (let i = 0; i < 5; i++) { const a = (i / 5) * 2 * Math.PI; g.beginPath(); g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.14, 0, 6.3); g.fill(); } }
    else if (s === "star") { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * 2 * Math.PI - Math.PI / 2, rr = i % 2 ? r * 0.3 : r * 0.7; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.stroke(); }
    else if (s === "ring") { g.beginPath(); g.arc(0, 0, r * 0.55, 0, 6.3); g.stroke(); }
    else if (s === "triangle") { g.beginPath(); for (let i = 0; i < 3; i++) { const a = (i / 3) * 2 * Math.PI - Math.PI / 2; g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); } g.closePath(); g.stroke(); }
    else if (s === "lines") { for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-r * 0.7, i * r * 0.35); g.lineTo(r * 0.7, i * r * 0.35); g.stroke(); } }
    else if (s === "cross") { g.beginPath(); g.moveTo(-r * 0.7, 0); g.lineTo(r * 0.7, 0); g.moveTo(0, -r * 0.7); g.lineTo(0, r * 0.7); g.stroke(); }
    else if (s === "spiral") { g.beginPath(); for (let i = 0; i < 40; i++) { const a = i * 0.4, rr = (i / 40) * r * 0.7; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
    g.restore();
  }
  drawFixture(g, L, I) {
    const { f, vis, geo, act } = I, p = this.point(L, geo.x, geo.y, geo.z);
    const selected = Runtime.selection.has(f.id);
    this.hits.push({ id: f.id, x: p.x, y: p.y });
    g.save();
    if (selected) { g.strokeStyle = "#0A84FF"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 13, 0, 6.3); g.stroke(); }
    g.fillStyle = vis.intensity > 0.01 ? vis.color : "#55555a"; g.strokeStyle = "#000"; g.lineWidth = 1.5;
    if (vis.moving) { g.beginPath(); g.arc(p.x, p.y, 7, 0, 6.3); g.fill(); g.stroke(); }
    else { g.fillRect(p.x - 6, p.y - 6, 12, 12); g.strokeRect(p.x - 6, p.y - 6, 12, 12); }
    g.restore();
    this.taken.push({ x0: p.x - 13, y0: p.y - 13, x1: p.x + 13, y1: p.y + 13, marker: true });
  }
  // Text zeichnen und den belegten Platz merken (Achsenbeschriftung)
  note(g, str, x, y) {
    const w = g.measureText(str).width, x0 = g.textAlign === "center" ? x - w / 2 : g.textAlign === "right" ? x - w : x;
    this.taken.push({ x0: x0 - 2, y0: y - 10, x1: x0 + w + 2, y1: y + 3 });
    g.fillText(str, x, y);
  }
  label(g, L, I) {
    const f = I.f, p = this.point(L, I.geo.x, I.geo.y, I.geo.z), name = f.name.replace(/^Stairville MH-X25 LED Spot/, "MH-X25");
    g.save(); g.textAlign = "center";
    const w = g.measureText(name).width, r = { x0: p.x - w / 2 - 3, y0: p.y + 14, x1: p.x + w / 2 + 3, y1: p.y + 28 };
    const own = (t) => t.marker && Math.abs((t.x0 + t.x1) / 2 - p.x) < 0.5 && Math.abs((t.y0 + t.y1) / 2 - p.y) < 0.5;
    const hit = this.taken.some((t) => !own(t) && r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    if (!hit) { g.fillStyle = "#c9c9cd"; g.fillText(name, p.x, p.y + 25); this.taken.push(r); }
    g.restore();
  }
  rgba(css, a) {
    if (!this._cc) { this._cc = document.createElement("canvas").getContext("2d"); this._cache = {}; }
    let rgb = this._cache[css];
    if (!rgb) { this._cc.fillStyle = "#000"; this._cc.fillStyle = css; const s = this._cc.fillStyle; const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s); rgb = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]; if (Object.keys(this._cache).length < 200) this._cache[css] = rgb; }
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
  }

  // ---- Bedienung mit Maus/Finger ----
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  nearest(p, maxDist) {
    let best = null, bd = maxDist || 24;
    this.hits.forEach((h) => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    return best;
  }
  down(e) {
    const p = this.local(e), L = this.view || this.layout();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (this.aim && L.mode === "top") { this.drag = { type: "aim", last: 0 }; this.aimAt(p); return; }
    const hit = this.nearest(p);
    if (this.edit && hit) { this.drag = { type: "move", id: hit.id }; return; }
    if (hit) Runtime.toggle(hit.id);
  }
  move(e) {
    if (!this.drag) return;
    const p = this.local(e), L = this.view;
    if (this.drag.type === "aim") { const now = performance.now(); if (now - this.drag.last > 40) { this.drag.last = now; this.aimAt(p); } }
    else if (this.drag.type === "move") {
      const f = Project.fixture(this.drag.id); if (!f) return;
      const q = L.fromPx(p.x, p.y), st = Project.state.stage;
      if (L.mode === "top") { f.pos.x = Math.round(clamp(q.x, -st.width / 2, st.width / 2) * 20) / 20; f.pos.y = Math.round(clamp(q.y, 0, st.depth) * 20) / 20; }
      else { f.pos.y = Math.round(clamp(q.y, 0, st.depth) * 20) / 20; f.pos.z = Math.round(clamp(q.z, 0, st.height + 2) * 20) / 20; }
      Runtime.engine.setFixtures(Project.state.fixtures);
    }
  }
  up() {
    if (this.drag && this.drag.type === "move") Project.update(() => {}, "fixtures");
    if (this.drag && this.drag.type === "aim") { this.drag = null; return; }
    this.drag = null;
  }
  aimAt(p) {
    const L = this.view, q = L.fromPx(p.x, p.y), st = Project.state.stage;
    this.target = { x: clamp(q.x, -st.width / 2 - 1, st.width / 2 + 1), y: clamp(q.y, -1, st.depth + 1), z: 0 };
    const r = Runtime.aimSelection(this.target);
    if (r.fail && !r.ok && !this._warned) { this._warned = true; toast("Dieser Kopf kann den Punkt nicht erreichen (außerhalb seines Drehbereichs).", true); setTimeout(() => { this._warned = false; }, 4000); }
  }
}
