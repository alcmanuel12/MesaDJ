/* Web MIDI para controladoras físicas, con MIDI learn.
   Entrada: una asignación liga (tipo, canal, número) → id de control.
     tipos: "c" CC · "n" nota · "p" pitch-bend (14 bits)
   Controles registrados desde la interfaz:
     { set(v 0..1) }               faders y potenciómetros (absolutos)
     { fire(), release(), lit() }  botones/pads; lit() → bool para el LED
     { delta(n) }                  encoders y platos (relativos)
   Salida: para los botones asignados a una NOTA se envía note-on 127/0 con el mismo
   número cuando cambia su estado (enciende/apaga el LED en la mayoría de controladoras). */
(function () {
  const KEY = "mesadj.midi", MODE_KEY = "mesadj.midi.rel";
  class Midi {
    constructor() {
      this.map = {}; this.controls = {}; this.armed = null; this.inputs = []; this.outputs = [];
      this.supported = !!navigator.requestMIDIAccess; this.denied = false;
      this.onChange = null; this.onLearned = null; this.last = {}; this.lit = {}; this.acc = null;
      try { this.map = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { this.map = {}; }
      this.relMode = localStorage.getItem(MODE_KEY) || "twos"; // twos | offset | signmag
    }
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.map)); } catch (e) {} }
    setRelMode(m) { this.relMode = m; try { localStorage.setItem(MODE_KEY, m); } catch (e) {} this.onChange && this.onChange(); }
    count() { return Object.keys(this.map).length; }
    clear() { this.map = {}; this.save(); this.lit = {}; this.onChange && this.onChange(); }
    unassign(key) { delete this.map[key]; this.save(); this.onChange && this.onChange(); }
    register(id, def) { this.controls[id] = def; }
    arm(id) { this.armed = id; this.onChange && this.onChange(); }
    describe(key) {
      const [k, ch, n] = key.split(":"), c = (+ch + 1);
      return (k === "c" ? "CC " + n : k === "n" ? "Nota " + n : "Pitch-bend") + " · canal " + c;
    }
    exportJSON() { return JSON.stringify({ app: "mesadj", version: 1, relMode: this.relMode, map: this.map }, null, 2); }
    importJSON(txt) {
      const o = JSON.parse(txt);
      if (!o || typeof o.map !== "object") throw new Error("Archivo de mapeo no válido");
      this.map = o.map; if (o.relMode) this.relMode = o.relMode; this.save(); this.lit = {}; this.onChange && this.onChange();
    }

    async init() {
      if (!this.supported) return false;
      try {
        this.acc = await navigator.requestMIDIAccess({ sysex: false });
      } catch (e) { this.supported = false; this.denied = true; this.onChange && this.onChange(); return false; }
      const hook = () => {
        this.inputs = []; this.outputs = [];
        this.acc.inputs.forEach((i) => { this.inputs.push(i.name); i.onmidimessage = (e) => this.msg(e.data); });
        this.acc.outputs.forEach((o) => this.outputs.push(o));
        this.lit = {};
        this.onChange && this.onChange();
      };
      this.acc.onstatechange = hook; hook();
      return true;
    }

    /* Decodifica un valor relativo según el modo del encoder. */
    rel(v) {
      if (this.relMode === "offset") return v - 64;
      if (this.relMode === "signmag") return v & 0x40 ? -(v & 0x3f) : v;
      return v < 64 ? v : v - 128;
    }

    msg(d) {
      const st = d[0], type = st & 0xf0, ch = st & 0x0f, d1 = d[1], d2 = d[2] || 0;
      if (type === 0xf0 || type === 0xc0 || type === 0xd0) return;
      let kind, key, val;
      if (type === 0xb0) { kind = "c"; key = "c:" + ch + ":" + d1; val = d2; }
      else if (type === 0x90 || type === 0x80) { kind = "n"; key = "n:" + ch + ":" + d1; val = type === 0x80 ? 0 : d2; }
      else if (type === 0xe0) { kind = "p"; key = "p:" + ch + ":0"; val = ((d2 << 7) | d1) / 16383 * 127; }
      else return;
      if (this.armed) {
        if (kind === "n" && val === 0) return;
        this.map[key] = this.armed; this.save();
        const id = this.armed; this.armed = null;
        this.onLearned && this.onLearned(id, key); this.onChange && this.onChange();
        return;
      }
      this.last[key] = val;
      const id = this.map[key]; if (!id) return;
      const c = this.controls[id]; if (!c) return;
      if (c.set) c.set(Math.max(0, Math.min(1, val / 127)));
      else if (c.delta) { const n = this.rel(Math.round(val)); if (n) c.delta(n); }
      else if (c.fire) {
        if (kind === "n") { val > 0 ? c.fire() : c.release && c.release(); }
        else if (val > 0) { c.fire(); c.release && setTimeout(c.release, 120); }
      }
    }

    /* Refleja el estado de los botones en los LED de la controladora. */
    feedback() {
      if (!this.outputs.length) return;
      for (const key in this.map) {
        if (key[0] !== "n") continue;
        const c = this.controls[this.map[key]]; if (!c || !c.lit) continue;
        const on = !!c.lit();
        if (this.lit[key] === on) continue;
        this.lit[key] = on;
        const [, ch, n] = key.split(":");
        const data = [0x90 | +ch, +n, on ? 127 : 0];
        this.outputs.forEach((o) => { try { o.send(data); } catch (e) {} });
      }
    }
  }
  window.DJMidi = Midi;
})();
