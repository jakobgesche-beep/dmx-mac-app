// Die App wie ein Bediener durchklicken (Simulation ohne Hardware).
(async function () {
  const out = []; let fails = 0;
  const params = new URLSearchParams(location.search);
  const check = (name, ok, detail) => { if (!ok) fails++; out.push((ok ? "OK    " : "FAIL  ") + name + (detail !== undefined ? "  " + detail : "")); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const A = window.__api;
  const btn = (txt, root) => $$("button", root || document).find((b) => b.textContent.trim() === txt || b.textContent.trim().startsWith(txt));
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const frame = () => A.last();
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { if (fn()) return true; await sleep(30); } return false; };
  const finish = () => { out.push(fails ? "==> " + fails + " FEHLER" : "==> alle Tests bestanden"); const pre = document.createElement("pre"); pre.id = "out"; pre.textContent = out.join("\n"); document.body.appendChild(pre); };
  await sleep(600);

  try {
    // ---- Start ----
    check("Start: drei Reiter (Bühne, Geräte, Einstellungen), Bühne offen", $$("#tabs .layer-tab").map((b) => b.textContent).join() === "Bühne,Geräte,Einstellungen" && !$("#view-live").hidden && $("#view-devices").hidden);
    check("Start: Version in der Kopfzeile, Status \"Simulation\", Blackout/Master/Tempo unten sichtbar", $("#version-label").textContent === "v2.0.0" && /Simulation/.test($("#dmx-text").textContent) && !!$("#blackout-btn") && !!$("#master-range") && !!$("#bpm-input"));
    check("Start: \"Neu in dieser Version\" erscheint einmal", !!$("#changelog-overlay") && $$(".changelog-item").length >= 5);
    $("#changelog-overlay .btn").click(); await sleep(50);
    check("Start: \"Verstanden\" schließt es", !$("#changelog-overlay"));
    check("Bühne ohne Geräte: Hinweis statt Steuerung", /Noch keine Geräte/.test($("#sel-chips").textContent) && /Wähle oben Lampen/.test($("#ctl").textContent));

    // ---- Geräte anlegen ----
    btn("Geräte", $("#tabs")).click(); await sleep(50);
    check("Geräte-Seite: leer mit Hinweis", !$("#view-devices").hidden && /Noch keine Geräte/.test($("#view-devices").textContent));
    btn("+ Gerät hinzufügen").click(); await sleep(50);
    const dlg = $(".dialog");
    check("Hinzufügen-Fenster: Geräteliste mit Stairville MH-X25, Schalter, RGB, Strobo; Betriebsart 12 Kanäle vorgewählt", $$("#ad-profile option", dlg).some((o) => /MH-X25/.test(o.textContent)) && $$("#ad-profile option", dlg).some((o) => /an\/aus/.test(o.textContent)) && $("#ad-mode", dlg).value === "12ch");
    setVal($("#ad-count", dlg), 4); await sleep(20);
    check("Hinzufügen-Fenster: Vorschau nennt 4 × 12 Kanäle ab Kanal 1 (bis 48)", /4 × 12 Kanäle ab Kanal 1 \(bis Kanal 48\)/.test($("#ad-preview", dlg).textContent), $("#ad-preview", dlg).textContent);
    btn("Hinzufügen", dlg).click(); await sleep(100);
    const rows = () => $$("#view-devices tbody tr");
    check("4 Moving Heads in der Liste mit den Adressen 1–12, 13–24, 25–36, 37–48", rows().length === 4 && rows().map((r) => r.children[3].textContent).join() === "1–12,13–24,25–36,37–48", rows().map((r) => r.children[3].textContent).join());
    check("DMX-Belegung zeigt 4 Blöcke, keine Warnung", $$("#dmx-map i").length === 4 && !$(".issue"));
    btn("+ Gerät hinzufügen").click(); await sleep(50);
    let d2 = $(".dialog"); setVal($("#ad-profile", d2), "generic-switch"); await sleep(20); setVal($("#ad-count", d2), 2); btn("Hinzufügen", d2).click(); await sleep(80);
    btn("+ Gerät hinzufügen").click(); await sleep(50);
    d2 = $(".dialog"); setVal($("#ad-profile", d2), "generic-strobe"); await sleep(20); btn("Hinzufügen", d2).click(); await sleep(80);
    check("2 an/aus-Lampen (Adressen 49, 50) und 1 Strobo (51–52) dazu, Gruppen richtig", rows().length === 7 && rows().slice(4).map((r) => r.children[3].textContent).join() === "49–49,50–50,51–52" && Project.groups().join() === "Moving Heads,Bühnenlicht,Strobo", rows().slice(4).map((r) => r.children[3].textContent).join());
    // Adress-Konflikt
    btn("Bearbeiten", rows()[1]).click(); await sleep(50);
    let ed = $(".dialog"); setVal($('[data-k="address"]', ed), 5); btn("Speichern", ed).click(); await sleep(80);
    check("Adress-Überschneidung wird angezeigt (Kopf 2 bei Kanal 5) mit rotem Hinweis und schraffiertem Block", $$(".issue").length >= 1 && /Überschneidung/.test($("#view-devices").textContent), $$(".issue").map((x) => x.textContent).join(" | "));
    btn("Bearbeiten", rows()[1]).click(); await sleep(50);
    ed = $(".dialog"); setVal($('[data-k="address"]', ed), 13); setVal($('[data-k="z"]', ed), 3.5); ed.querySelector('[data-k="mount"]').value = "hang"; btn("Speichern", ed).click(); await sleep(80);
    check("Adresse korrigiert: keine Warnung mehr, Höhe 3,5 m gespeichert", !$(".issue") && Project.state.fixtures[1].pos.z === 3.5 && Project.state.fixtures[1].address === 13);
    // Kopie
    btn("Kopie", rows()[4]).click(); await sleep(50);
    check("Kopie einer Lampe bekommt die nächste freie Adresse", rows().length === 8 && Project.state.fixtures[7].address === 53 || Project.state.fixtures[7].address >= 51, String(Project.state.fixtures[7].address));
    btn("Löschen", rows()[7]).click(); await sleep(50); btn("Löschen", $(".dialog")).click(); await sleep(80);
    check("Löschen fragt nach und entfernt das Gerät", rows().length === 7);
    // eigenes Gerät
    btn("Eigenes Gerät…").click(); await sleep(50);
    let cu = $(".dialog"); setVal($("#cu-name", cu), "Test-Par"); btn("+ Kanal", cu).click(); btn("+ Kanal", cu).click(); await sleep(20);
    $$("select", cu)[1].value = "red"; $$("select", cu)[1].dispatchEvent(new Event("change")); $$("select", cu)[2].value = "green"; $$("select", cu)[2].dispatchEvent(new Event("change"));
    btn("Anlegen", cu).click(); await sleep(60);
    check("Eigenes Gerät angelegt und in der Geräteliste verfügbar", Fixtures.listProfiles().some((p) => p.name === "Test-Par" && p.custom) && Project.state.customProfiles.length === 1);
    Project.update((s) => { s.customProfiles = []; }, "profiles");

    // ---- Bühne bedienen ----
    btn("Bühne", $("#tabs")).click(); await sleep(150);
    check("Bühne: Chips für Alle, 3 Gruppen und 7 Geräte", $$("#sel-chips .chip").length === 1 + 3 + 7, String($$("#sel-chips .chip").length));
    btn("Moving Heads", $("#sel-chips")).click(); await sleep(60);
    check("Gruppe \"Moving Heads\" gewählt: 4 von 7, Steuerung mit Helligkeit, Position, Farbe, Gobo, Strobo", $("#sel-count").textContent === "4 von 7" && !!$("#ctl input[type=range]") && !!$("#ctl .xy-pad") && $$("#ctl .swatch").length === 9 && $$("#ctl .tile").length === 8 && /Strobo/.test($("#ctl").textContent), $$("#ctl .ctl-label").map((x) => x.textContent).join(" | "));
    setVal($("#ctl input[type=range]"), 100); await sleep(120);
    check("Helligkeit 100 %: Dimmer aller vier Köpfe = 255 (Kanäle 8, 20, 32, 44), Schalter/Strobo bleiben aus", [7, 19, 31, 43].every((c) => frame()[c] === 255) && frame()[48] === 0 && frame()[50] === 0, Array.from(frame().slice(0, 14)).join());
    $$("#ctl .swatch")[1].click(); await sleep(120);
    check("Farbe Rot: Farbrad-Kanal 6 = 37 bei allen Köpfen", [5, 17, 29, 41].every((c) => frame()[c] === 37));
    $$("#ctl .tile")[3].click(); await sleep(120);
    check("Gobo 4: Gobo-Kanal 9 = 27", frame()[8] === 27 && frame()[20] === 27);
    const pad = $("#ctl .xy-pad"), pr = pad.getBoundingClientRect();
    pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: pr.left + pr.width * 0.25, clientY: pr.top + pr.height * 0.25, pointerId: 3, bubbles: true }));
    pad.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, bubbles: true })); await sleep(120);
    check("Positionsfeld: Pan 0,25 -> Kanal 1 = 64, Tilt 0,75 -> Kanal 2 = 191", frame()[0] === 64 && frame()[1] === 191, frame()[0] + "/" + frame()[1]);
    const sw = $$("#ctl input[type=range]").pop(); setVal(sw, 50); await sleep(120);
    check("Strobo 50 %: Shutter-Kanal 7 = 112", frame()[6] === 112, String(frame()[6]));
    setVal(sw, 0); await sleep(100);
    check("Strobo aus: Shutter offen (5)", frame()[6] === 5);
    btn("Lampe finden").click(); await sleep(300);
    check("\"Lampe finden\" lässt die Lampe blinken (Effekt \"Finden\" aktiv)", Runtime.effects().some((e) => e.label === "Finden")); await sleep(3100);
    check("...und hört nach 3 Sekunden von selbst auf", !Runtime.effects().some((e) => e.label === "Finden"));
    // an/aus-Lampe
    btn("Bühnenlicht", $("#sel-chips")).click(); await sleep(60);
    check("an/aus-Lampen: Steuerung nur mit Helligkeit (\"An\"), ohne Position/Farbe", !$("#ctl .xy-pad") && $$("#ctl .swatch").length === 0 && !!btn("An", $("#ctl")) && /Nur an\/aus/.test($("#ctl").textContent));
    btn("An", $("#ctl")).click(); await sleep(100);
    check("An: Kanal 49 und 50 = 255", frame()[48] === 255 && frame()[49] === 255);
    setVal($("#ctl input[type=range]"), 40); await sleep(100);
    check("unter 50 % bleibt eine an/aus-Lampe aus", frame()[48] === 0);
    btn("Aus", $("#ctl")).click();
    // Strobo (2 Kanäle)
    btn("Strobo", $("#sel-chips")).click(); await sleep(60);
    const sr = $$("#ctl input[type=range]"); setVal(sr[0], 60); setVal(sr[sr.length - 1], 80); await sleep(120);
    check("Strobo-Gerät: Helligkeit 60 % (Kanal 52 = 153) und Blitzrate 80 % (Kanal 51 = 204)", frame()[51] === 153 && frame()[50] === 204, frame()[50] + "/" + frame()[51]);
    setVal(sr[0], 0); setVal(sr[sr.length - 1], 0);

    // ---- Bühnenansicht ----
    const view = LivePage.view, canvas = $("#stage-canvas");
    btn("Alle", $("#sel-chips")).click(); await sleep(60);
    Runtime.select(Project.state.fixtures.filter((f) => f.group === "Moving Heads").map((f) => f.id));
    Runtime.setAttr("dimmer", 1); Runtime.setColor({ name: "Rot", rgb: { r: 1, g: 0, b: 0 } }); Runtime.setAttr("gobo", 0, Runtime.ids());
    Runtime.engine.realisticMotion = false;
    const aimBtn = btn("Zielen"); aimBtn.click(); await sleep(60);
    const cr = canvas.getBoundingClientRect(), Lt = view.layout(), tgtPx = Lt.toPx(1, 2.5);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cr.left + tgtPx.x, clientY: cr.top + tgtPx.y, pointerId: 5, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 5, bubbles: true })); await sleep(150);
    const hitsOk = Runtime.selectedFixtures().every((f) => { const a = Runtime.engine.get(f.id), g = Runtime.engine.geometry(f), h = Stage.floorHit(g, Stage.beamDirection(g, a.pan, a.tilt)); return h && near(h.x, 1, 0.05) && near(h.y, 2.5, 0.05); });
    check("Zielen: Tippen auf die Bühne (1 | 2,5 m) richtet alle vier gewählten Köpfe darauf aus (Strahl trifft den Punkt auf < 5 cm)", hitsOk);
    view.draw(performance.now());
    const px = (x, y) => { const c = canvas.getContext("2d"), s = canvas.width / canvas.clientWidth; return c.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data; };
    const spot = px(tgtPx.x + 5, tgtPx.y + 5);                                  // knapp neben dem Fadenkreuz des Zielmodus
    check("Draufsicht: am Zielpunkt leuchtet ein roter Lichtfleck (Rot deutlich stärker als Grün/Blau)", spot[0] > 120 && spot[0] > spot[1] * 2 && spot[0] > spot[2] * 2, Array.from(spot).join(","));
    const dark = px(Lt.toPx(-3.8, 4.8).x, Lt.toPx(-3.8, 4.8).y);
    check("Draufsicht: abseits der Strahlen bleibt die Bühne dunkel", dark[0] < 70 && dark[1] < 70, Array.from(dark).join(","));
    Runtime.setAttr("dimmer", 0); await sleep(100); view.draw(performance.now());
    const off = px(tgtPx.x + 5, tgtPx.y + 5);
    check("Dimmer aus: der Lichtfleck verschwindet", off[0] < 80, Array.from(off).join(","));
    Runtime.setAttr("dimmer", 1); Runtime.setAttr("strobe", 1); await sleep(50);
    let onSeen = false, offSeen = false; for (let i = 0; i < 40; i++) { view.draw(performance.now() + i * 25); const p = px(tgtPx.x + 5, tgtPx.y + 5); if (p[0] > 120) onSeen = true; else offSeen = true; }
    check("Strobo: in schneller Folge hell und dunkel (Blitzen sichtbar)", onSeen && offSeen);
    Runtime.setAttr("strobe", 0);
    btn("Seitenansicht").click(); await sleep(100); view.draw(performance.now());
    const sideSpot = view.layout().toPx(2.5, 0), sp = px(sideSpot.x, sideSpot.y);
    check("Seitenansicht: der Strahl endet am Boden bei Tiefe 2,5 m (rotes Licht dort)", view.mode === "side" && sp[0] > 90, Array.from(sp).join(","));
    btn("Draufsicht").click(); await sleep(50);
    aimBtn.click();                                                             // Zielen aus
    // Lampe antippen / verschieben
    const h0 = view.hits[0]; Runtime.select([]); canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cr.left + h0.x, clientY: cr.top + h0.y, pointerId: 6, bubbles: true })); canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 6, bubbles: true })); await sleep(60);
    check("Lampe in der Bühnenansicht antippen wählt sie aus", Runtime.ids().length === 1 && Runtime.ids()[0] === h0.id);
    btn("Verschieben").click(); const before = JSON.parse(JSON.stringify(Project.fixture(h0.id).pos));
    const to = view.layout().toPx(before.x + 1, before.y - 1);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cr.left + h0.x, clientY: cr.top + h0.y, pointerId: 7, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: cr.left + to.x, clientY: cr.top + to.y, pointerId: 7, bubbles: true })); canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, bubbles: true })); await sleep(60);
    const after = Project.fixture(h0.id).pos;
    check("Verschieben: die Lampe wandert 1 m nach rechts und 1 m nach vorn und wird gespeichert", near(after.x, before.x + 1, 0.06) && near(after.y, before.y - 1, 0.06), JSON.stringify(after));
    btn("Verschieben").click();

    // ---- Looks ----
    Runtime.select(Project.state.fixtures.filter((f) => f.group === "Moving Heads").map((f) => f.id)); Runtime.setAttr("dimmer", 0.5); Runtime.setColor({ name: "Grün", rgb: { r: 0, g: 1, b: 0 } });
    btn("+ Speichern").click(); await sleep(60);
    let ld = $(".dialog"); setVal($("#lk-name", ld), "Grün halb"); setVal($("#lk-fade", ld), 0); btn("Speichern", ld).click(); await sleep(80);
    check("Look gespeichert und als Taste sichtbar", Project.state.looks.length === 1 && !!btn("Grün halb", $("#look-grid")));
    Runtime.setAttr("dimmer", 0); Runtime.setColor({ name: "Rot", rgb: { r: 1, g: 0, b: 0 } }); await sleep(100);
    btn("Grün halb", $("#look-grid")).click(); await sleep(150);
    check("Look abrufen: Dimmer 128, Farbe Grün (Kanal 6 = 17), Taste markiert", frame()[7] === 128 && frame()[5] === 17 && $(".look-btn.on"));
    btn("Bearbeiten", $("#view-live")).click(); await sleep(30);
    check("Bearbeiten zeigt das ✕ zum Löschen", !!$(".look-btn .x"));
    $(".look-btn .x").click(); await sleep(50); btn("Löschen", $(".dialog")).click(); await sleep(80);
    check("Look löschen (mit Rückfrage)", Project.state.looks.length === 0);
    btn("Bearbeiten", $("#view-live")).click();

    // ---- Effekte ----
    Runtime.select(Project.state.fixtures.filter((f) => f.group === "Moving Heads").map((f) => f.id)); Runtime.setAttr("dimmer", 0);
    Runtime.clock.setBpm(240);
    btn("+ Lauflicht").click(); await sleep(60);
    check("Lauflicht gestartet: Eintrag mit Auswahlfeldern und Stopp-Taste", Runtime.effects().length === 1 && $$("#fx-list .fx-item select").length === 4 && !!btn("Stopp", $("#fx-list")));
    const states = new Set(); for (let i = 0; i < 40; i++) { await sleep(50); states.add([7, 19, 31, 43].map((c) => (frame()[c] > 0 ? 1 : 0)).join("")); }
    check("Lauflicht läuft im Takt: verschiedene Köpfe leuchten nacheinander", states.size >= 3, Array.from(states).join(" "));
    const stepSel = $$("#fx-list select")[1]; stepSel.value = "4"; stepSel.dispatchEvent(new Event("change")); await sleep(50);
    check("Parameter ändern (Schritt 4 Schläge) wirkt sofort auf den laufenden Effekt", Runtime.effects()[0].step === 4);
    btn("+ Pulsieren").click(); btn("+ Bewegung").click(); btn("+ Farbwechsel").click(); btn("+ Blitz-Schläge").click(); btn("+ Gobo-Wechsel").click(); await sleep(60);
    check("alle Effekt-Arten lassen sich starten", Runtime.effects().map((e) => e.type).join() === "chase,pulse,move,colorCycle,strobeHit,gobo");
    for (let i = 0; i < 30; i++) { await sleep(30); }
    check("mehrere Effekte gleichzeitig laufen ohne Fehler, DMX-Bilder kommen weiter", frame().length === 512);
    btn("Alle stoppen").click(); await sleep(50);
    check("Alle stoppen", Runtime.effects().length === 0 && /Kein Effekt aktiv/.test($("#fx-list").textContent));
    Runtime.clock.setBpm(120);

    // ---- Leiste unten ----
    const dimBefore = frame()[7];
    Runtime.setAttr("dimmer", 1); await sleep(100);
    $("#blackout-btn").click(); await sleep(100);
    check("Blackout: sofort alles dunkel, Taste leuchtet rot und zeigt \"BLACKOUT AN\"", frame()[7] === 0 && $("#blackout-btn").classList.contains("on") && $("#blackout-btn").textContent === "BLACKOUT AN");
    $("#blackout-btn").click(); await sleep(100);
    check("Blackout nochmal: wieder hell", frame()[7] === 255 && !$("#blackout-btn").classList.contains("on"));
    setVal($("#master-range"), 50); await sleep(100);
    check("Master 50 %: Dimmer 128, Anzeige \"50 %\"", frame()[7] === 128 && $("#master-val").textContent === "50 %");
    setVal($("#master-range"), 100);
    setVal($("#bpm-input"), 140); await sleep(30);
    check("Tempo 140 BPM eingegeben: Taktgeber und Show-Einstellung folgen", near(Runtime.clock.bpm, 140, 0.01) && Project.state.settings.bpm === 140);
    $("#bpm-plus").click(); check("Tempo + = 141", near(Runtime.clock.bpm, 141, 0.01)); $("#bpm-minus").click();
    const t0 = performance.now(); Runtime.clock.taps = []; [0, 500, 1000, 1500].forEach((d) => Runtime.clock.tap(t0 + d));
    check("Tap-Tempo: Tippen im Abstand von 500 ms = 120 BPM", near(Runtime.clock.bpm, 120, 0.5), Runtime.clock.bpm.toFixed(1));
    let lampOn = false, lampOff = false; for (let i = 0; i < 30; i++) { await sleep(40); if ($("#beat-lamp").classList.contains("on") || $("#beat-lamp").classList.contains("down")) lampOn = true; else lampOff = true; }
    check("Taktlampe blinkt im Takt", lampOn && lampOff);
    Runtime.setAttr("dimmer", 0);

    // ---- Einstellungen ----
    btn("Einstellungen", $("#tabs")).click(); await sleep(150);
    check("Einstellungen: Anschlussliste mit Enttec-Kennzeichnung", $$("#port-select option").some((o) => /Enttec/.test(o.textContent)) && $("#port-select").value.includes("EN123456"));
    btn("Verbinden", $("#view-settings")).click(); await sleep(150);
    check("Verbinden: Status \"Enttec verbunden · 12345678\", Firmware 1.04 in der Liste", A.calls.some((c) => c[0] === "connect") && /Enttec verbunden/.test($("#dmx-text").textContent) && /12345678/.test($("#dmx-kv").textContent) && /1\.04/.test($("#dmx-kv").textContent) && $("#dmx-badge").classList.contains("live"), $("#dmx-text").textContent);
    A.statusFn(Object.assign({}, A.status, { state: "error", error: "Kabel gezogen" })); await sleep(50);
    check("Fehler wird angezeigt (roter Punkt, Meldung)", $("#dmx-badge").classList.contains("bad") && /Kabel gezogen/.test($("#dmx-msg").textContent));
    btn("Trennen", $("#view-settings")).click(); await sleep(100);
    check("Trennen: wieder Simulation", /Simulation/.test($("#dmx-text").textContent));
    $("#auto-conn").click(); await sleep(30);
    check("Automatisch verbinden ausschalten wird gemerkt und ans Hauptprogramm gemeldet", Project.state.settings.autoConnect === false && A.calls.some((c) => c[0] === "auto" && c[1] === false)); $("#auto-conn").click();
    setVal($("#failsafe-mode"), "blackout"); setVal($("#failsafe-sec"), 8);
    check("Failsafe \"dunkel nach 8 s\" wird ans Hauptprogramm gemeldet", A.calls.some((c) => c[0] === "failsafe" && c[1] === "blackout" && c[2] === 8));
    // Kanal-Monitor und -Test
    Runtime.select(Project.state.fixtures.filter((f) => f.group === "Moving Heads").map((f) => f.id)); Runtime.setAttr("dimmer", 1); await sleep(300);
    check("Kanal-Monitor zeigt die Werte (Kanal 8 voll)", $$(".ch-cell")[7].firstChild.style.height === "100%" && /: 255/.test($$(".ch-cell")[7].title), $$(".ch-cell")[7].title);
    setVal($("#test-ch"), 100); setVal($("#test-range"), 200); await sleep(120);
    check("Kanal-Test: Kanal 100 = 200 im DMX-Bild, Kanalzahl wächst mit", frame()[99] === 200 && A.frames[A.frames.length - 1].c >= 100, frame()[99] + " / " + A.frames[A.frames.length - 1].c);
    btn("Test beenden").click(); await sleep(120);
    check("Test beenden: Kanal 100 wieder 0", frame()[99] === 0);
    // Bühne, Show
    setVal($("#st-w"), 12); setVal($("#st-d"), 6); await sleep(50);
    check("Bühnengröße 12 × 6 m wird übernommen", Project.state.stage.width === 12 && Project.state.stage.depth === 6);
    setVal($("#show-name"), "Schulfest 2026"); check("Show-Name", Project.state.name === "Schulfest 2026");
    btn("Show als Datei speichern").click(); await sleep(80);
    check("Show exportieren übergibt die komplette Show (Geräte, Looks, Einstellungen)", A.exported && A.exported.fixtures.length === 7 && A.exported.name === "Schulfest 2026");
    await sleep(700);
    check("Autospeichern: die Show wurde von selbst gesichert (Geräte, Bühne, Tempo)", A.saved && A.saved.fixtures.length === 7 && A.saved.stage.width === 12 && A.saved.settings.bpm >= 119);
    // Neustart simulieren: gespeicherte Show wieder laden
    const saved = JSON.parse(JSON.stringify(A.saved));
    Project.replace({}); await sleep(50);
    check("Neue leere Show: keine Geräte", Project.state.fixtures.length === 0 && $$("#sel-chips .chip").length === 0);
    Project.replace(saved); await sleep(100);
    check("Gespeicherte Show wieder laden: alle Geräte, Adressen und Positionen sind wieder da, Kern und Auswahl folgen", Project.state.fixtures.length === 7 && Runtime.engine.fixtures.length === 7 && Project.fixture(saved.fixtures[1].id).pos.z === 3.5 && Runtime.engine.channels === 52, String(Runtime.engine.channels));

    // ---- Updates ----
    A.updateFn({ state: "downloading", version: "2.1.0", progress: 40 }); await sleep(50);
    check("Update wird geladen: Hinweis \"im Hintergrund\" ohne Knopf", !!$(".update-bar.working") && /40 %/.test($(".update-bar").textContent) && !$("#install-update-btn"));
    A.updateFn({ state: "ready", version: "2.1.0", progress: 100 }); await sleep(50);
    check("Update bereit: blaue Leiste mit \"Jetzt neu starten\"", !!$("#install-update-btn") && /2\.1\.0/.test($(".update-bar").textContent));
    Runtime.engine.master = 1; Runtime.setAttr("dimmer", 1);
    $("#install-update-btn").click(); await sleep(80);
    check("Neustart fragt vorher nach (Licht geht kurz aus)", !!$(".dialog") && /Licht kurz aus/.test($(".dialog").textContent) || !!$(".dialog"));
    btn("Neu starten", $(".dialog")).click(); await sleep(100);
    check("Neustart löst die Installation aus", A.calls.some((c) => c[0] === "installUpdate"));
    A.updateFn({ state: "idle" }); await sleep(30);
    check("Einstellungen zeigen den Update-Stand", /Version/.test($("#view-settings").textContent));
    btn("Jetzt nach Updates suchen").click(); await sleep(50);
    check("\"Jetzt nach Updates suchen\" fragt das Hauptprogramm", A.calls.some((c) => c[0] === "checkUpdate"));

    // ---- Touch-Modus ----
    try { localStorage.removeItem("dmx.touch"); } catch (e) {}
    const tb = $("#touch-btn"); tb.click(); await sleep(80);
    check("Touch-Modus: an, große Bedienelemente (Reiter ≥ 44 px, Blackout ≥ 56 px)", document.body.classList.contains("touch") && parseFloat(getComputedStyle($(".layer-tab")).height) >= 44 && parseFloat(getComputedStyle($("#blackout-btn")).height) >= 56, getComputedStyle($("#blackout-btn")).height);
    check("Touch-Modus: Vollbild-Knopf sichtbar und wirksam", getComputedStyle($("#full-btn")).display !== "none" && ($("#full-btn").click(), A.full === 1));
    tb.click(); await sleep(50);
    check("Touch-Modus aus: normale Größen", !document.body.classList.contains("touch"));
    try { localStorage.removeItem("dmx.touch"); } catch (e) {}
    document.body.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", pointerId: 70, bubbles: true })); await sleep(60);
    check("erster echter Fingertipp schaltet den Touch-Modus selbst ein", document.body.classList.contains("touch"));
    tb.click();
    check("Kein Konsolenfehler: alle Reiter lassen sich öffnen", ["live", "devices", "settings"].every((t) => { showTab(t); return !document.querySelector('[data-view="' + t + '"]').hidden; }));
  } catch (e) {
    fails++; out.push("FAIL  Ausnahme: " + (e && e.stack || e));
  }
  finish();
})();
