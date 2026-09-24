// Enttec DMX USB PRO: Paketformat, Antworten lesen und "DmxOutput" (Sendetakt, Wiederholung, Blackout).
// Reines JavaScript ohne Hardwarezugriff: das Schreiben auf den seriellen Anschluss kommt von außen (write),
// damit alles mit einem Testanschluss geprüft werden kann.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DmxCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const START = 0x7e, END = 0xe7;
  const LABEL = { GET_PARAMS: 3, SET_PARAMS: 4, RECEIVED: 5, SEND_DMX: 6, GET_SERIAL: 10 };
  const MAX_CHANNELS = 512, MIN_CHANNELS = 24;

  // 0x7E, Label, Länge (2 Byte, klein zuerst), Daten, 0xE7
  function buildPacket(label, data) {
    data = data || new Uint8Array(0);
    const p = new Uint8Array(5 + data.length);
    p[0] = START; p[1] = label; p[2] = data.length & 0xff; p[3] = (data.length >> 8) & 0xff;
    p.set(data, 4);
    p[4 + data.length] = END;
    return p;
  }
  // DMX-Paket (Label 6): Startcode 0 und die Kanalwerte. Es werden nur die gebrauchten Kanäle gesendet (mind. 24),
  // das hält die Wiederholrate hoch.
  function buildDmxPacket(universe, channels) {
    const n = Math.max(MIN_CHANNELS, Math.min(MAX_CHANNELS, channels || MAX_CHANNELS));
    const data = new Uint8Array(1 + n);
    for (let i = 0; i < n; i++) data[1 + i] = universe[i] || 0;
    return buildPacket(LABEL.SEND_DMX, data);
  }
  // Anfragen an das Gerät
  const requestSerial = () => buildPacket(LABEL.GET_SERIAL, new Uint8Array(0));
  const requestParams = () => buildPacket(LABEL.GET_PARAMS, new Uint8Array([0, 0]));

  // Antworten aus einem Datenstrom lesen (auch bei zerstückelten Paketen und Störbytes davor)
  function parsePackets(bytes) {
    const packets = [];
    let i = 0;
    while (i < bytes.length) {
      if (bytes[i] !== START) { i++; continue; }
      if (i + 4 > bytes.length) break;
      const len = bytes[i + 2] | (bytes[i + 3] << 8);
      if (i + 5 + len > bytes.length) break;
      if (bytes[i + 4 + len] !== END) { i++; continue; }
      packets.push({ label: bytes[i + 1], data: bytes.slice(i + 4, i + 4 + len) });
      i += 5 + len;
    }
    return { packets, rest: bytes.slice(i) };
  }
  // Seriennummer (4 Byte BCD, niedrigstes Byte zuerst), Firmware und Ausgangsparameter
  function describeReply(pkt) {
    if (pkt.label === LABEL.GET_SERIAL && pkt.data.length >= 4) {
      const d = pkt.data;
      return { serial: [d[3], d[2], d[1], d[0]].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase() };
    }
    if (pkt.label === LABEL.GET_PARAMS && pkt.data.length >= 5) {
      const d = pkt.data;
      return { firmware: d[1] + "." + String(d[0]).padStart(2, "0"), breakTime: d[2], mabTime: d[3], rate: d[4] };
    }
    return null;
  }

  // Sendetakt: höchstens ~40 Bilder pro Sekunde, bei Stillstand alle keepaliveMs erneut (falls ein Bild verloren ging)
  class DmxOutput {
    // opts: write(packet) -> (Promise|void), now(), onError(err), channels, minIntervalMs, keepaliveMs
    constructor(opts) {
      this.write = opts.write;
      this.now = opts.now || (() => Date.now());
      this.onError = opts.onError || (() => {});
      this.channels = opts.channels || MAX_CHANNELS;
      this.minInterval = opts.minIntervalMs || 25;
      this.keepalive = opts.keepaliveMs || 1000;
      this.frame = new Uint8Array(MAX_CHANNELS);
      this.dirty = false; this.lastSend = -1e9; this.sent = 0; this.failed = 0; this.closed = false;
    }
    setChannels(n) { this.channels = Math.max(MIN_CHANNELS, Math.min(MAX_CHANNELS, n | 0)); this.dirty = true; }
    // neues Bild (nur wenn es sich ändert, wird es als "neu" gemerkt)
    setFrame(u8) {
      let changed = false;
      for (let i = 0; i < MAX_CHANNELS; i++) { const v = u8[i] || 0; if (this.frame[i] !== v) { this.frame[i] = v; changed = true; } }
      if (changed) this.dirty = true;
    }
    // regelmäßig aufrufen (z. B. alle 10 ms)
    tick() {
      if (this.closed) return false;
      const t = this.now();
      const due = this.dirty ? t - this.lastSend >= this.minInterval : t - this.lastSend >= this.keepalive;
      if (!due) return false;
      return this.sendNow();
    }
    sendNow() {
      const t = this.now();
      this.lastSend = t; this.dirty = false;
      try {
        const r = this.write(buildDmxPacket(this.frame, this.channels));
        if (r && typeof r.then === "function") r.catch((e) => this._fail(e));
        this.sent++;
        return true;
      } catch (e) { this._fail(e); return false; }
    }
    _fail(e) { this.failed++; this.onError(e); }
    // sofort alles aus
    blackout() { this.frame.fill(0); this.dirty = true; return this.sendNow(); }
    close(blackoutFirst) { if (blackoutFirst) this.blackout(); this.closed = true; }
  }

  return { START, END, LABEL, MAX_CHANNELS, MIN_CHANNELS, buildPacket, buildDmxPacket, requestSerial, requestParams, parsePackets, describeReply, DmxOutput };
});
