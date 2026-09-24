// Bühnengeometrie: wohin zeigt ein Kopf bei bestimmten Pan-/Tilt-Werten, und welche Werte braucht er für ein Ziel?
// Koordinaten in Metern: x nach rechts (aus Sicht des Publikums), y von der Bühnenkante zum Publikum hin = 0 nach hinten,
// z nach oben. Der Boden ist z = 0. Ein Gerät hat position {x,y,z}, mount "floor" (steht) oder "hang" (hängt kopfüber),
// yaw (Grad, 0 = zeigt nach hinten +y, 90 = nach rechts +x) und Umkehr-Schalter für Pan/Tilt.
// Tilt-Mitte zeigt entlang der "Oben"-Richtung des Geräts (bei hängenden Geräten also nach unten).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Stage = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const wrap180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };

  // g: { x, y, z, mount, yaw, invertPan, invertTilt, panRange, tiltRange }
  function up(g) { return g.mount === "hang" ? [0, 0, -1] : [0, 0, 1]; }
  const panSign = (g) => (g.mount === "hang" ? -1 : 1) * (g.invertPan ? -1 : 1);
  const tiltSign = (g) => (g.invertTilt ? -1 : 1);
  const horizontal = (deg) => [Math.sin(deg * RAD), Math.cos(deg * RAD), 0];

  // Blickrichtung (Einheitsvektor) für pan/tilt als Anteil 0..1 des Bereichs
  function beamDirection(g, pan, tilt) {
    const p = (pan - 0.5) * (g.panRange || 540), t = (tilt - 0.5) * (g.tiltRange || 270) * tiltSign(g);
    const F = horizontal((g.yaw || 0) + panSign(g) * p), U = up(g);
    const c = Math.cos(t * RAD), s = Math.sin(t * RAD);
    return norm([U[0] * c + F[0] * s, U[1] * c + F[1] * s, U[2] * c + F[2] * s]);
  }
  // Wo trifft der Strahl den Boden (z = 0)? null, wenn er nicht nach unten zeigt
  function floorHit(g, dir) {
    if (dir[2] >= -1e-6) return null;
    const s = -g.z / dir[2];
    if (s < 0) return null;
    return { x: g.x + dir[0] * s, y: g.y + dir[1] * s, z: 0, dist: s };
  }
  // Strahl als Linie: Endpunkt am Boden oder nach length Metern
  function beamEnd(g, dir, length) {
    const h = floorHit(g, dir);
    if (h) return { x: h.x, y: h.y, z: 0, hit: true, dist: h.dist };
    const L = length || 12;
    return { x: g.x + dir[0] * L, y: g.y + dir[1] * L, z: g.z + dir[2] * L, hit: false, dist: L };
  }
  // Radius des Lichtflecks am Boden aus dem Öffnungswinkel
  const spotRadius = (dist, angleDeg) => dist * Math.tan((angleDeg * RAD) / 2);

  // Pan/Tilt (0..1) für ein Ziel. current = { pan, tilt } wählt bei zwei Lösungen die näher liegende.
  function solveAim(g, target, current) {
    const P = [g.x, g.y, g.z], v = norm([target.x - P[0], target.y - P[1], (target.z || 0) - P[2]]);
    const U = up(g), panRange = g.panRange || 540, tiltRange = g.tiltRange || 270;
    const cosT = clamp(dot(v, U), -1, 1), tAbs = Math.acos(cosT) * DEG;
    const vh = [v[0] - cosT * U[0], v[1] - cosT * U[1], v[2] - cosT * U[2]];
    const hasHoriz = Math.hypot(vh[0], vh[1], vh[2]) > 1e-6;
    const sp = panSign(g), ts = tiltSign(g);
    let alpha = hasHoriz ? Math.atan2(vh[0], vh[1]) * DEG : (g.yaw || 0);
    const solutions = [];
    [[0, tAbs], [180, -tAbs]].forEach(([flip, t]) => {
      const a = alpha + flip;
      let p0 = wrap180((a - (g.yaw || 0)) * sp);
      for (let k = -2; k <= 2; k++) {
        const p = p0 + 360 * k;
        if (Math.abs(p) <= panRange / 2 + 1e-9 && Math.abs(t) <= tiltRange / 2 + 1e-9) solutions.push({ p, t: t * ts });
      }
    });
    if (!solutions.length) return { ok: false, reason: tAbs > tiltRange / 2 ? "Ziel liegt außerhalb des Neigungsbereichs" : "Ziel liegt außerhalb des Drehbereichs" };
    const curP = current ? (current.pan - 0.5) * panRange : 0, curT = current ? (current.tilt - 0.5) * tiltRange : 0;
    solutions.sort((A, B) => (Math.abs(A.p - curP) + Math.abs(A.t - curT) * 0.5) - (Math.abs(B.p - curP) + Math.abs(B.t - curT) * 0.5) || Math.abs(A.p) - Math.abs(B.p) || Math.abs(B.t) - Math.abs(A.t));
    const s = solutions[0];
    return { ok: true, pan: s.p / panRange + 0.5, tilt: s.t / tiltRange + 0.5, panDeg: s.p, tiltDeg: s.t };
  }

  // ---------- Bild <-> Bühne (Perspektive aus 4 Punkten) ----------
  // src/dst: je 4 Punkte [{x,y}] -> 3x3-Matrix (9 Zahlen, zeilenweise), src -> dst
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = src[i], { x: u, y: v } = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;             // Punkte liegen auf einer Linie
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
      h[r] = s / A[r][r];
    }
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  function applyH(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
  }
  function invertH(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) return null;
    return [A / det, D / det, G / det, B / det, E / det, Hh / det, C / det, F / det, I / det];
  }

  return { beamDirection, floorHit, beamEnd, spotRadius, solveAim, homography, applyH, invertH, wrap180 };
});
