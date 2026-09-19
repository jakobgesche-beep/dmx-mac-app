const app = document.getElementById('app');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function toast(msg, isError){
  const t = el('<div class="toast">' + esc(msg) + '</div>');
  if(isError) t.classList.add('error');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ================= DMX-Kern =================
// Die eigentliche Enttec-Paketbildung + serielle Kommunikation läuft im
// Hauptprozess (main.js, via node "serialport") — hier wird nur die
// 512-Byte-Universe-Ansicht gehalten und per IPC (window.dmxAPI) geschickt.
const NUM_CHANNELS = 512;
const universe = new Uint8Array(NUM_CHANNELS);
let connected = false, lastSend = 0;

function summarizeUniverse(){
  const active = [];
  for(let i = 0; i < 16; i++){ if(universe[i] > 0) active.push('CH' + (i + 1) + '=' + universe[i]); }
  return active.length ? active.join(' ') : 'alle 0';
}
async function sendUniverse(force){
  const now = performance.now();
  if(!force && now - lastSend < 20) return;
  lastSend = now;
  pulseIndicator();
  try {
    const res = await window.dmxAPI.sendUniverse(universe);
    if(res.simulated) logActivity('Simulation (keine Hardware verbunden): ' + res.bytes + ' Byte wären gesendet — ' + summarizeUniverse());
    else if(res.ok) logActivity('Gesendet: ' + res.bytes + ' Byte — ' + summarizeUniverse());
    else logActivity('Fehler beim Senden: ' + res.error);
  } catch(e){ logActivity('Fehler beim Senden: ' + e.message); }
}

async function connectSerial(){
  const ports = await window.dmxAPI.listPorts();
  if(!ports.length){ toast('Kein serielles Gerät gefunden. Enttec-Box per USB anschließen und erneut versuchen.', true); return; }
  showPortPicker(ports);
}
function showPortPicker(ports){
  const overlay = el('<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:60;"></div>');
  const box = el('<div class="card" style="max-width:380px;width:90%;"></div>');
  box.appendChild(el('<div class="section-title">Gerät wählen</div>'));
  const sel = el('<select></select>');
  ports.forEach(p => sel.appendChild(el('<option value="' + esc(p.path) + '">' + esc(p.path) + (p.manufacturer ? ' — ' + esc(p.manufacturer) : '') + '</option>')));
  box.appendChild(sel);
  const row = el('<div class="btn-row" style="margin-top:14px;"></div>');
  const okBtn = el('<button class="btn">Verbinden</button>');
  const cancelBtn = el('<button class="btn secondary">Abbrechen</button>');
  row.appendChild(okBtn); row.appendChild(cancelBtn);
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener('click', () => overlay.remove());
  okBtn.addEventListener('click', async () => {
    const path = sel.value;
    overlay.remove();
    const res = await window.dmxAPI.connect(path);
    if(res.ok){
      connected = true;
      updateConnectionUI();
      await sendUniverse(true);
      toast('Verbunden: ' + path);
    } else {
      toast('Verbindung fehlgeschlagen: ' + res.error, true);
    }
  });
}
async function disconnectSerial(){
  stopSequence();
  await window.dmxAPI.disconnect();
  connected = false;
  updateConnectionUI();
}
function updateConnectionUI(){
  statusText.textContent = connected ? 'Verbunden' : 'nicht verbunden';
  statusBadge.classList.toggle('live', connected);
  const btn = document.getElementById('connect-btn');
  if(btn) btn.textContent = connected ? 'Trennen' : 'Verbinden';
}
function blackout(){
  universe.fill(0);
  sendUniverse(true);
  renderChannelValues();
}

// ================= Aktivitäts-Log =================
let activityLog = [];
let logListWrap;
let pulseTimer = null;
function logActivity(msg){
  const time = new Date().toLocaleTimeString('de-DE');
  activityLog.unshift(time + ' — ' + msg);
  if(activityLog.length > 60) activityLog.length = 60;
  renderLog();
}
function renderLog(){
  if(!logListWrap) return;
  logListWrap.innerHTML = '';
  if(!activityLog.length){ logListWrap.appendChild(el('<div class="empty">Noch keine Aktivität.</div>')); return; }
  activityLog.forEach(line => logListWrap.appendChild(el('<div class="log-line">' + esc(line) + '</div>')));
}
function pulseIndicator(){
  const dot = document.getElementById('pulse-dot');
  if(!dot) return;
  dot.classList.add('active');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => dot.classList.remove('active'), 150);
}
window.dmxAPI.onLog((msg) => logActivity(msg));

// ================= Auto-Update =================
window.dmxAPI.onUpdateReady((version) => {
  const bar = el('<div class="update-bar">Update ' + esc(version) + ' heruntergeladen. <button class="btn small" id="install-update-btn">Jetzt neu starten &amp; installieren</button></div>');
  document.body.appendChild(bar);
  bar.querySelector('#install-update-btn').addEventListener('click', () => window.dmxAPI.installUpdateNow());
});

// ================= Sequenz-Player =================
// { "name": "...", "loop": true, "steps": [ { "fade": ms, "hold": ms, "channels": { "1": 0-255, ... } }, ... ] }
let playState = null;

function stopSequence(){
  if(playState) playState.stopped = true;
  playState = null;
  updatePlayUI();
}
function sleep(ms, state){
  return new Promise((resolve) => {
    if(ms <= 0 || state.stopped){ resolve(); return; }
    setTimeout(resolve, ms);
  });
}
function animateFade(fromValues, targets, durationMs, state){
  return new Promise((resolve) => {
    const entries = Object.entries(targets);
    if(durationMs <= 0 || state.stopped){
      entries.forEach(([ch, val]) => { universe[ch - 1] = val; });
      sendUniverse(true);
      renderChannelValues();
      resolve();
      return;
    }
    const start = performance.now();
    function frame(now){
      if(state.stopped){ resolve(); return; }
      const t = Math.min(1, (now - start) / durationMs);
      entries.forEach(([ch, val]) => {
        const from = fromValues[ch - 1];
        universe[ch - 1] = Math.round(from + (val - from) * t);
      });
      sendUniverse();
      renderChannelValues();
      if(t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
async function runStep(seq, i, state){
  if(state.stopped) return;
  const step = seq.steps[i];
  const fromValues = universe.slice();
  await animateFade(fromValues, step.channels || {}, step.fade || 0, state);
  if(state.stopped) return;
  await sleep(step.hold || 0, state);
  if(state.stopped) return;
  const next = (i + 1 < seq.steps.length) ? i + 1 : (seq.loop ? 0 : null);
  if(next !== null) runStep(seq, next, state);
  else stopSequence();
}
function playSequence(seq){
  if(!seq.steps || !seq.steps.length){ toast('Sequenz hat keine Steps.', true); return; }
  if(reactive.active){ reactive.active = false; updateReactiveUI(); toast('Reaktiv-Modus ausgeschaltet (Sequenz übernimmt die Kanäle).'); }
  stopSequence();
  const state = { stopped: false };
  playState = state;
  updatePlayUI();
  if(!connected) toast('Simulationsmodus: keine Hardware verbunden — Ausgabe wird nur im Log gezeigt.');
  runStep(seq, 0, state);
}
function updatePlayUI(){
  const stopBtn = document.getElementById('stop-btn');
  if(stopBtn) stopBtn.disabled = !playState;
}

// ================= Reaktive Kamera-Steuerung (experimentell) =================
const REACTIVE_ZONES = 3;
const REACTIVE_ZONE_CHANNELS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]];
const reactive = {
  stream: null, video: null, canvas: null, ctx: null,
  running: false, active: false, prevFrame: null,
  sensitivity: 1, smoothed: new Array(REACTIVE_ZONES).fill(0),
};

function reactiveTick(){
  if(!reactive.running) return;
  const w = 90, h = 60;
  reactive.canvas.width = w; reactive.canvas.height = h;
  reactive.ctx.drawImage(reactive.video, 0, 0, w, h);
  const frame = reactive.ctx.getImageData(0, 0, w, h).data;

  if(reactive.prevFrame){
    const zoneWidth = w / REACTIVE_ZONES;
    const zoneSums = new Array(REACTIVE_ZONES).fill(0);
    for(let y = 0; y < h; y++){
      for(let x = 0; x < w; x++){
        const idx = (y * w + x) * 4;
        const diff = Math.abs(frame[idx] - reactive.prevFrame[idx])
          + Math.abs(frame[idx + 1] - reactive.prevFrame[idx + 1])
          + Math.abs(frame[idx + 2] - reactive.prevFrame[idx + 2]);
        const zone = Math.min(REACTIVE_ZONES - 1, Math.floor(x / zoneWidth));
        zoneSums[zone] += diff;
      }
    }
    const pixelsPerZone = zoneWidth * h;
    const maxPerPixel = 255 * 3;
    for(let z = 0; z < REACTIVE_ZONES; z++){
      const avg = zoneSums[z] / pixelsPerZone;
      const normalized = Math.min(1, (avg / maxPerPixel) * reactive.sensitivity * 6);
      reactive.smoothed[z] = reactive.smoothed[z] * 0.75 + normalized * 0.25;
    }
    renderMeters();
    if(reactive.active){
      REACTIVE_ZONE_CHANNELS.forEach((channels, z) => {
        const val = Math.round(reactive.smoothed[z] * 255);
        channels.forEach(ch => { universe[ch - 1] = val; });
      });
      sendUniverse();
      renderChannelValues();
    }
  }
  reactive.prevFrame = frame;
  requestAnimationFrame(reactiveTick);
}

async function startReactiveCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('Kamera wird nicht unterstützt.', true);
    return;
  }
  try {
    reactive.stream = await navigator.mediaDevices.getUserMedia({ video: true });
    reactive.video.srcObject = reactive.stream;
    await reactive.video.play();
    reactive.running = true;
    reactive.prevFrame = null;
    updateReactiveUI();
    reactiveTick();
  } catch(e){ toast('Kamera-Fehler: ' + e.message, true); }
}
function stopReactiveCamera(){
  reactive.running = false;
  reactive.active = false;
  if(reactive.stream) reactive.stream.getTracks().forEach(t => t.stop());
  reactive.stream = null;
  updateReactiveUI();
}
function updateReactiveUI(){
  const camBtn = document.getElementById('cam-btn');
  if(camBtn) camBtn.textContent = reactive.running ? 'Kamera stoppen' : 'Kamera starten';
  const activeBtn = document.getElementById('reactive-active-btn');
  if(activeBtn){
    activeBtn.textContent = reactive.active ? 'Reaktiv: AN' : 'Reaktiv: AUS';
    activeBtn.disabled = !reactive.running;
  }
}
let meterEls = [];
function renderMeters(){
  meterEls.forEach((fillEl, i) => { fillEl.style.height = Math.round(reactive.smoothed[i] * 100) + '%'; });
}

// ================= UI =================
const EXAMPLE_SEQUENCE = {
  name: 'Test-Chase (Kanal 1-3)',
  loop: true,
  steps: [
    { fade: 400, hold: 600, channels: { '1': 255, '2': 0, '3': 0 } },
    { fade: 400, hold: 600, channels: { '1': 0, '2': 255, '3': 0 } },
    { fade: 400, hold: 600, channels: { '1': 0, '2': 0, '3': 255 } },
    { fade: 400, hold: 600, channels: { '1': 0, '2': 0, '3': 0 } }
  ]
};

function buildConnectionCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Verbindung</div>'));
  const row = el('<div class="btn-row"></div>');
  const connectBtn = el('<button id="connect-btn" class="btn">Verbinden</button>');
  connectBtn.addEventListener('click', () => { connected ? disconnectSerial() : connectSerial(); });
  const blackoutBtn = el('<button class="btn danger">Blackout</button>');
  blackoutBtn.addEventListener('click', blackout);
  row.appendChild(connectBtn);
  row.appendChild(blackoutBtn);
  card.appendChild(row);
  card.appendChild(el('<p class="hint">Verbinden listet angeschlossene serielle Geräte auf (Enttec-Box erscheint meist als FTDI-Gerät).</p>'));
  return card;
}

function buildEditorCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Sequenz-Code</div>'));
  const textarea = el('<textarea class="code-editor" spellcheck="false"></textarea>');
  textarea.value = JSON.stringify(EXAMPLE_SEQUENCE, null, 2);
  card.appendChild(textarea);

  const row = el('<div class="btn-row" style="margin-top:12px;"></div>');
  const playBtn = el('<button class="btn">Laden &amp; Abspielen</button>');
  const stopBtn = el('<button id="stop-btn" class="btn secondary" disabled>Stop</button>');
  row.appendChild(playBtn);
  row.appendChild(stopBtn);
  card.appendChild(row);

  playBtn.addEventListener('click', () => {
    let seq;
    try { seq = JSON.parse(textarea.value); }
    catch(e){ toast('Ungültiges JSON: ' + e.message, true); return; }
    playSequence(seq);
  });
  stopBtn.addEventListener('click', stopSequence);

  const saveRow = el('<div class="field" style="margin-top:14px;"><label>Als Sequenz speichern</label></div>');
  const saveInputRow = el('<div class="btn-row"></div>');
  const nameInput = el('<input type="text" placeholder="Name der Sequenz" style="flex:1;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:10px 12px;">');
  const saveBtn = el('<button class="btn secondary" style="width:auto;">Speichern</button>');
  saveInputRow.appendChild(nameInput);
  saveInputRow.appendChild(saveBtn);
  saveRow.appendChild(saveInputRow);
  card.appendChild(saveRow);

  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if(!name){ toast('Bitte einen Namen eingeben.', true); return; }
    try { JSON.parse(textarea.value); } catch(e){ toast('Ungültiges JSON: ' + e.message, true); return; }
    await window.dmxAPI.saveSequence(name, textarea.value);
    toast('Gespeichert: ' + name);
    nameInput.value = '';
    refreshSavedList();
  });

  card._textarea = textarea;
  return card;
}

let savedListWrap;
async function refreshSavedList(){
  if(!savedListWrap) return;
  const list = await window.dmxAPI.listSequences();
  savedListWrap.innerHTML = '';
  if(!list.length){ savedListWrap.appendChild(el('<div class="empty">Noch keine gespeicherten Sequenzen.</div>')); return; }
  list.forEach(seqRow => {
    const row = el('<div class="seq-row"></div>');
    row.appendChild(el('<div class="seq-name">' + esc(seqRow.name) + '</div>'));
    const loadBtn = el('<button class="btn secondary small">Laden</button>');
    loadBtn.addEventListener('click', () => {
      editorCard._textarea.value = seqRow.code;
      toast(seqRow.name + ' geladen.');
    });
    const playBtn2 = el('<button class="btn small">▶</button>');
    playBtn2.addEventListener('click', () => {
      try { playSequence(JSON.parse(seqRow.code)); }
      catch(e){ toast('Ungültiges JSON in gespeicherter Sequenz.', true); }
    });
    const delBtn = el('<button class="btn danger small">×</button>');
    delBtn.addEventListener('click', async () => {
      if(!confirm(seqRow.name + ' löschen?')) return;
      await window.dmxAPI.deleteSequence(seqRow.id);
      refreshSavedList();
    });
    row.appendChild(loadBtn);
    row.appendChild(playBtn2);
    row.appendChild(delBtn);
    savedListWrap.appendChild(row);
  });
}

function buildSavedCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Gespeicherte Sequenzen</div>'));
  savedListWrap = el('<div></div>');
  card.appendChild(savedListWrap);
  return card;
}

const CHANNEL_TEST_COUNT = 16;
let channelSliderEls = [];
function renderChannelValues(){
  channelSliderEls.forEach(({ ch, slider, valueLabel }) => {
    const v = universe[ch - 1];
    if(document.activeElement !== slider) slider.value = v;
    valueLabel.textContent = v;
  });
}
function buildManualCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Manuelle Kanäle (1–' + CHANNEL_TEST_COUNT + ')</div>'));
  const grid = el('<div class="chan-grid"></div>');
  channelSliderEls = [];
  for(let ch = 1; ch <= CHANNEL_TEST_COUNT; ch++){
    const cell = el('<div class="chan-cell"></div>');
    cell.appendChild(el('<div class="chan-num">CH ' + ch + '</div>'));
    const slider = el('<input type="range" class="chan-slider" min="0" max="255" value="0">');
    const valueLabel = el('<div class="chan-val">0</div>');
    slider.addEventListener('input', () => {
      universe[ch - 1] = parseInt(slider.value, 10);
      valueLabel.textContent = slider.value;
      sendUniverse();
    });
    cell.appendChild(slider);
    cell.appendChild(valueLabel);
    grid.appendChild(cell);
    channelSliderEls.push({ ch, slider, valueLabel });
  }
  card.appendChild(grid);
  card.appendChild(el('<p class="hint">Zum Testen der Verbindung: einen Kanal hochziehen und schauen, ob ein Gerät reagiert.</p>'));
  return card;
}

function buildReactiveCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Reaktive Kamera-Steuerung (experimentell)</div>'));

  reactive.video = el('<video class="cam-preview" muted playsinline></video>');
  card.appendChild(reactive.video);
  reactive.canvas = document.createElement('canvas');
  reactive.ctx = reactive.canvas.getContext('2d', { willReadFrequently: true });

  const row = el('<div class="btn-row"></div>');
  const camBtn = el('<button id="cam-btn" class="btn secondary">Kamera starten</button>');
  camBtn.addEventListener('click', () => { reactive.running ? stopReactiveCamera() : startReactiveCamera(); });
  const activeBtn = el('<button id="reactive-active-btn" class="btn" disabled>Reaktiv: AUS</button>');
  activeBtn.addEventListener('click', () => {
    if(!reactive.active) stopSequence();
    reactive.active = !reactive.active;
    updateReactiveUI();
  });
  row.appendChild(camBtn);
  row.appendChild(activeBtn);
  card.appendChild(row);

  const sensField = el('<div class="field" style="margin-top:12px;"><label>Empfindlichkeit</label></div>');
  const sensSlider = el('<input type="range" min="0.2" max="3" step="0.1" value="1" style="width:100%;accent-color:var(--accent);">');
  sensSlider.addEventListener('input', () => { reactive.sensitivity = parseFloat(sensSlider.value); });
  sensField.appendChild(sensSlider);
  card.appendChild(sensField);

  const meterRow = el('<div class="meter-row"></div>');
  meterEls = [];
  ['Links', 'Mitte', 'Rechts'].forEach((label, i) => {
    const cell = el('<div class="meter-cell"></div>');
    const track = el('<div class="meter-track"></div>');
    const fill = el('<div class="meter-fill" style="height:0%;"></div>');
    track.appendChild(fill);
    cell.appendChild(track);
    cell.appendChild(el('<div class="meter-label">' + label + '<br>CH ' + REACTIVE_ZONE_CHANNELS[i].join('-') + '</div>'));
    meterRow.appendChild(cell);
    meterEls.push(fill);
  });
  card.appendChild(meterRow);

  card.appendChild(el('<p class="hint">Teilt das Kamerabild in 3 Zonen und misst Bewegung (Frame-Differenz) pro Zone. Bei „Reaktiv: AN" steuert jede Zone direkt ihre Kanalgruppe an. Erste Version — Empfindlichkeit/Zonen/Kanalzuordnung sicher noch nachjustieren.</p>'));

  return card;
}

function buildLogCard(){
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="section-title">Aktivitäts-Log</div>'));
  logListWrap = el('<div class="log-panel"></div>');
  card.appendChild(logListWrap);
  card.appendChild(el('<p class="hint">Zeigt jeden gesendeten (oder ohne Hardware: simulierten) DMX-Frame.</p>'));
  renderLog();
  return card;
}

let editorCard;
function render(){
  app.innerHTML = '';
  app.appendChild(buildConnectionCard());
  editorCard = buildEditorCard();
  app.appendChild(editorCard);
  app.appendChild(buildSavedCard());
  app.appendChild(buildManualCard());
  app.appendChild(buildReactiveCard());
  app.appendChild(buildLogCard());
  refreshSavedList();
}

window.addEventListener('beforeunload', () => { blackout(); });

render();
