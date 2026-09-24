// Die Show (Geräte, Bühne, Looks, Effekte, Einstellungen): im Speicher, wird automatisch gespeichert.
const Project = (function () {
  const api = window.dmxAPI;
  const listeners = [];
  const DEFAULT_SETTINGS = { autoConnect: true, failsafe: "hold", failsafeSec: 5, realisticMotion: true, bpm: 120 };
  const fresh = () => ({ version: 1, name: "Meine Show", stage: { width: 8, depth: 5, height: 4 }, fixtures: [], looks: [], effects: [], customProfiles: [], settings: Object.assign({}, DEFAULT_SETTINGS) });
  let state = fresh();

  function migrate(p) {
    const f = fresh();
    const out = Object.assign(f, p || {});
    out.stage = Object.assign(f.stage, (p && p.stage) || {});
    out.settings = Object.assign({}, DEFAULT_SETTINGS, (p && p.settings) || {});
    ["fixtures", "looks", "effects", "customProfiles"].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    out.customProfiles.forEach((c) => Fixtures.registerProfile(Fixtures.customProfile(c.id, c.name, c.list, c.kind)));      // eigene Geräte wieder bekannt machen
    out.fixtures.forEach((x) => { if (!x.pos) x.pos = { x: 0, y: out.stage.depth / 2, z: out.stage.height }; if (!x.mount) x.mount = "hang"; });
    return out;
  }
  const notify = (topic) => listeners.forEach((l) => { if (l.topic === "*" || l.topic === topic) l.fn(topic); });
  const saveNow = () => { try { api.projectSave(JSON.parse(JSON.stringify(state))); } catch (e) {} };
  const save = debounce(saveNow, 500);

  const P = {
    get state() { return state; },
    on(topic, fn) { listeners.push({ topic, fn }); },
    async load() { let p = null; try { p = await api.projectLoad(); } catch (e) {} state = migrate(p); notify("load"); return !!p; },
    replace(p) { state = migrate(p); save(); notify("load"); },
    // Änderung machen: fn(state); topic sagt, was sich geändert hat ("fixtures", "looks", "effects", "settings", "stage")
    update(fn, topic) { fn(state); save(); notify(topic || "change"); },
    flush: saveNow,

    // ---- Geräte ----
    fixture(id) { return state.fixtures.find((f) => f.id === id); },
    // erste freie Adresse, an der n Kanäle hintereinander Platz haben
    nextFreeAddress(n) {
      const used = new Array(514).fill(false);
      state.fixtures.forEach((f) => { const c = Fixtures.channelCount(f); for (let i = 0; i < c; i++) if (f.address + i <= 512) used[f.address + i] = true; });
      for (let a = 1; a + n - 1 <= 512; a++) { let ok = true; for (let i = 0; i < n; i++) if (used[a + i]) { ok = false; break; } if (ok) return a; }
      return 1;
    },
    // count Geräte anlegen: fortlaufende Adressen und Namen, gleichmäßig auf der Bühne verteilt
    addFixtures(opts) {
      const profile = Fixtures.getProfile(opts.profile);
      if (!profile) return [];
      const mode = opts.mode && profile.modes[opts.mode] ? opts.mode : Object.keys(profile.modes)[0];
      const n = Fixtures.channelCount({ profile: profile.id, mode });
      const count = Math.max(1, Math.min(32, opts.count || 1));
      let addr = opts.address || P.nextFreeAddress(n);
      const st = state.stage, made = [];
      const moving = profile.kind === "moving" || profile.kind === "strobe";
      const existing = state.fixtures.filter((f) => f.profile === profile.id).length;
      for (let i = 0; i < count; i++) {
        const number = existing + i + 1;
        const f = { id: uid("f"), name: count > 1 || existing ? (opts.name || profile.name.replace(/\s*\(.*\)/, "")) + " " + number : opts.name || profile.name.replace(/\s*\(.*\)/, ""),
          profile: profile.id, mode, address: addr, group: opts.group || (profile.kind === "moving" ? "Moving Heads" : profile.kind === "strobe" ? "Strobo" : profile.kind === "color" ? "Farblicht" : "Bühnenlicht"),
          pos: { x: Math.round((-st.width * 0.4 + (i + 0.5) * (st.width * 0.8 / count)) * 10) / 10, y: Math.round(st.depth * (profile.kind === "moving" ? 0.55 : profile.kind === "strobe" ? 0.92 : 0.8) * 10) / 10, z: profile.kind === "dimmer" ? 0 : st.height },
          mount: profile.kind === "dimmer" ? "floor" : "hang", yaw: 0, invertPan: false, invertTilt: false };
        state.fixtures.push(f); made.push(f); addr += n;
      }
      save(); notify("fixtures");
      return made;
    },
    removeFixture(id) { state.fixtures = state.fixtures.filter((f) => f.id !== id); state.looks.forEach((l) => delete l.values[id]); save(); notify("fixtures"); },
    // eigenes Gerät aus einer Kanalliste anlegen und merken
    addCustomProfile(name, list) {
      const id = uid("custom-");
      state.customProfiles.push({ id, name, list, kind: undefined });
      Fixtures.registerProfile(Fixtures.customProfile(id, name, list));
      save(); notify("profiles");
      return id;
    },
    groups() { const g = []; state.fixtures.forEach((f) => { if (f.group && !g.includes(f.group)) g.push(f.group); }); return g; },
  };
  return P;
})();
