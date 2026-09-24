// Immer sichtbare Leiste unten: Blackout, Master, Tempo (mit Taktlampe).
const LiveBar = (function () {
  function init(root) {
    root.innerHTML = "";
    const blackout = el('<button id="blackout-btn" class="blackout-btn" title="Alles sofort dunkel (nochmal drücken: wieder an)">BLACKOUT</button>');
    const master = el('<div class="lb-group"><span class="lb-label">Master</span><input id="master-range" class="master-range" type="range" min="0" max="100" value="100" aria-label="Master"><span id="master-val" class="lb-val">100 %</span></div>');
    const tempo = el('<div class="lb-group"><span class="lb-label">Tempo</span><button id="bpm-minus" class="btn secondary small" aria-label="langsamer">−</button><input id="bpm-input" class="bpm-input" type="number" min="30" max="300" step="1" value="120" aria-label="Tempo in BPM"><button id="bpm-plus" class="btn secondary small" aria-label="schneller">+</button><span class="lb-label">BPM</span>' +
      '<button id="tap-btn" class="btn secondary small" title="Im Takt tippen">Tap</button><button id="sync-btn" class="btn secondary small" title="Jetzt ist Schlag 1 des Takts">1</button><span id="beat-lamp" class="beat-lamp" title="Taktlampe"></span><span id="beat-num" class="lb-val" style="min-width:26px;text-align:center">1</span></div>');
    const status = el('<span id="lb-status" class="lb-label"></span>');
    root.append(blackout, master, tempo, el('<span class="lb-spacer"></span>'), status);

    blackout.addEventListener("click", () => Runtime.setBlackout(!Runtime.engine.blackout));
    const mr = root.querySelector("#master-range");
    mr.addEventListener("input", () => Runtime.setMaster(mr.value / 100));
    const bpm = root.querySelector("#bpm-input");
    const setBpm = (v) => { Runtime.clock.setBpm(v); Project.update((s) => { s.settings.bpm = Runtime.clock.bpm; }, "tempo"); refresh(); };
    bpm.addEventListener("change", () => setBpm(parseFloat(bpm.value) || 120));
    root.querySelector("#bpm-minus").addEventListener("click", () => setBpm(Math.round(Runtime.clock.bpm) - 1));
    root.querySelector("#bpm-plus").addEventListener("click", () => setBpm(Math.round(Runtime.clock.bpm) + 1));
    root.querySelector("#tap-btn").addEventListener("click", () => { Runtime.clock.tap(); refresh(); });
    root.querySelector("#sync-btn").addEventListener("click", () => Runtime.clock.syncDownbeat());
    function refresh() {
      const b = document.getElementById("blackout-btn");
      b.classList.toggle("on", Runtime.engine.blackout);
      b.textContent = Runtime.engine.blackout ? "BLACKOUT AN" : "BLACKOUT";
      document.getElementById("master-val").textContent = Math.round(Runtime.engine.master * 100) + " %";
      if (document.activeElement !== bpm) bpm.value = Math.round(Runtime.clock.bpm * 10) / 10;
    }
    Runtime.onState(refresh);
    let lastBeat = -1;
    Runtime.onFrame((res, now) => {
      const p = Runtime.clock.position(now);
      const lamp = document.getElementById("beat-lamp");
      const on = p.phase < 0.25;
      lamp.classList.toggle("on", on && p.inBar !== 1);
      lamp.classList.toggle("down", on && p.inBar === 1);
      if (Math.floor(p.beat) !== lastBeat) { lastBeat = Math.floor(p.beat); document.getElementById("beat-num").textContent = p.inBar; }
    });
    refresh();
  }
  function setStatusText(t) { const s = document.getElementById("lb-status"); if (s) s.textContent = t; }
  return { init, setStatusText };
})();
