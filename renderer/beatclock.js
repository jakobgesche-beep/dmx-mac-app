// Taktgeber: rechnet die Uhrzeit in "Schläge" um (beat = 0, 1, 2 ...). Tempo per Hand, per Tippen (Tap) oder später von der
// Musik-Erkennung. Alle Effekte laufen über diesen Takt.
class BeatClock {
  constructor(now) {
    this.now = now || (() => performance.now());
    this.bpm = 120; this.beatsPerBar = 4;
    this.tRef = this.now(); this.beatRef = 0;      // beat(t) = beatRef + (t - tRef) / 60000 * bpm
    this.taps = [];
  }
  beat(t) { t = t === undefined ? this.now() : t; return this.beatRef + ((t - this.tRef) / 60000) * this.bpm; }
  // Tempo ändern, ohne dass die Position springt
  setBpm(bpm, t) {
    t = t === undefined ? this.now() : t;
    this.beatRef = this.beat(t); this.tRef = t;
    this.bpm = Math.max(30, Math.min(300, bpm));
  }
  // aktuelle Position als Schlag 1 des Takts setzen
  syncDownbeat(t) {
    t = t === undefined ? this.now() : t;
    this.beatRef = Math.round(this.beat(t) / this.beatsPerBar) * this.beatsPerBar; this.tRef = t;
  }
  // Tippen im Takt: aus dem Abstand der letzten Tipper das Tempo, und der Tipper selbst ist ein Schlag
  tap(t) {
    t = t === undefined ? this.now() : t;
    if (this.taps.length && t - this.taps[this.taps.length - 1] > 2500) this.taps = [];
    this.taps.push(t); this.taps = this.taps.slice(-8);
    if (this.taps.length >= 2) {
      const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      this.bpm = Math.max(30, Math.min(300, 60000 / iv));
    }
    this.beatRef = Math.round(this.beat(t)); this.tRef = t;          // auf den nächsten ganzen Schlag einrasten
    return this.bpm;
  }
  position(t) {
    const b = this.beat(t), inBar = ((b % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar;
    return { beat: b, bar: Math.floor(b / this.beatsPerBar), inBar: Math.floor(inBar) + 1, phase: b - Math.floor(b) };
  }
}
if (typeof module === "object" && module.exports) module.exports = BeatClock;
