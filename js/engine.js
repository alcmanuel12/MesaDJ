/* Motor de audio de Mesa DJ (Web Audio).
   Grafo por canal:
     fuente → [pitch-shift | directo] → trim → EQ(3) → color(LPF/HPF) → filtro pad → gate →
     (suma con FX de pad) → ┬ cue pre-fader → auriculares
                            └ fader → crossfader → post → master bus
   Master: bus → (envío Beat FX) → master gain → limitador → salida (+ grabadora). */
(function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dbToGain = (db) => Math.pow(10, db / 20);

  /* ───────────── Unidad de efecto (Beat FX y FX de pad) ───────────── */
  class FxUnit {
    constructor(ctx) {
      this.ctx = ctx; this.input = ctx.createGain(); this.out = ctx.createGain(); this.out.gain.value = 0;
      this.type = null; this.nodes = []; this.level = 0.6; this.on = false; this.beats = 0.5; this.spb = 0.5;
    }
    static ir(ctx, sec, decay) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return b;
    }
    teardown() {
      try { this.input.disconnect(); } catch (e) {}
      this.nodes.forEach((n) => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
      this.nodes = [];
    }
    setup(type, beats, spb) {
      this.type = type; if (beats != null) this.beats = beats; if (spb != null) this.spb = spb;
      this.teardown();
      const c = this.ctx, inp = this.input, out = this.out;
      const T = clamp(this.beats * this.spb, 0.02, 4);
      const N = (n) => { this.nodes.push(n); return n; };
      const lfo = (kind, f) => { const o = N(c.createOscillator()); o.type = kind; o.frequency.value = f; o.start(); return o; };
      const rate = clamp(1 / (T * 2), 0.1, 8);
      switch (type) {
        case "Delay": case "Echo": {
          const d = N(c.createDelay(5)), fb = N(c.createGain()), lp = N(c.createBiquadFilter());
          d.delayTime.value = T; fb.gain.value = type === "Echo" ? 0.62 : 0.35;
          lp.type = "lowpass"; lp.frequency.value = type === "Echo" ? 3200 : 9000;
          inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
          break;
        }
        case "Reverb": {
          const cv = N(c.createConvolver()); cv.buffer = FxUnit.ir(c, 2.6, 2.5);
          inp.connect(cv); cv.connect(out);
          break;
        }
        case "Spiral": {
          const cv = N(c.createConvolver()), d = N(c.createDelay(5)), fb = N(c.createGain());
          cv.buffer = FxUnit.ir(c, 1.8, 2); d.delayTime.value = T; fb.gain.value = 0.5;
          inp.connect(cv); cv.connect(out); cv.connect(d); d.connect(fb); fb.connect(cv);
          break;
        }
        case "Flanger": {
          const d = N(c.createDelay(0.05)), fb = N(c.createGain()), depth = N(c.createGain()), o = lfo("sine", rate / 2);
          d.delayTime.value = 0.004; fb.gain.value = 0.55; depth.gain.value = 0.002;
          o.connect(depth); depth.connect(d.delayTime);
          inp.connect(d); d.connect(fb); fb.connect(d); d.connect(out); inp.connect(out);
          break;
        }
        case "Phaser": {
          const o = lfo("sine", rate / 2), depth = N(c.createGain());
          depth.gain.value = 700; o.connect(depth);
          let prev = inp;
          for (let k = 0; k < 4; k++) {
            const ap = N(c.createBiquadFilter()); ap.type = "allpass"; ap.frequency.value = 900; ap.Q.value = 0.8;
            depth.connect(ap.frequency); prev.connect(ap); prev = ap;
          }
          prev.connect(out); inp.connect(out);
          break;
        }
        case "Filtro": {
          const bp = N(c.createBiquadFilter()), o = lfo("sine", rate / 2), depth = N(c.createGain());
          bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 5; depth.gain.value = 1000;
          o.connect(depth); depth.connect(bp.frequency); inp.connect(bp); bp.connect(out);
          break;
        }
        case "Roll": {
          const d = N(c.createDelay(2)), fb = N(c.createGain());
          d.delayTime.value = clamp(T / 2, 0.02, 2); fb.gain.value = 0.93;
          inp.connect(d); d.connect(fb); fb.connect(d); d.connect(out);
          break;
        }
        case "Trans": {
          const g = N(c.createGain()), o = lfo("square", clamp(1 / T, 0.5, 16)), depth = N(c.createGain());
          g.gain.value = 0.5; depth.gain.value = 0.5; o.connect(depth); depth.connect(g.gain);
          inp.connect(g); g.connect(out);
          break;
        }
        case "Pitch": {
          const d = N(c.createDelay(0.2)), o = lfo("sawtooth", 5), depth = N(c.createGain());
          d.delayTime.value = 0.05; depth.gain.value = -0.02; o.connect(depth); depth.connect(d.delayTime);
          inp.connect(d); d.connect(out);
          break;
        }
        default: inp.connect(out);
      }
    }
    setLevel(v) { this.level = v; this.apply(); }
    setOn(on) { this.on = on; this.apply(); }
    apply() { this.out.gain.setTargetAtTime(this.on ? this.level * 1.2 : 0, this.ctx.currentTime, 0.02); }
  }

  /* ───────────── Samples sintetizados ───────────── */
  function synthSamples(sr) {
    const mk = (sec, fn) => {
      const n = Math.floor(sr * sec), d = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = fn(i / sr, i / n);
      return d;
    };
    const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823 - 1; };
    const env = (p, a, r) => Math.min(1, p / a) * Math.min(1, (1 - p) / r);
    const out = [];
    out.push(mk(1.4, (t, p) => (saw(t * 392) + saw(t * 494 * 1.002) + saw(t * 587)) / 3.2 * env(p, 0.01, 0.15)));                       // Bocina
    out.push(mk(1.2, (t, p) => { const f = 3000 * Math.pow(0.04, p); return (Math.sin(2 * Math.PI * f * t) * 0.5 + rnd() * 0.3) * env(p, 0.02, 0.2); })); // Rewind
    out.push(mk(2.0, (t, p) => Math.sin(2 * Math.PI * (700 + 400 * Math.sin(t * 2 * Math.PI * 1.3)) * t) * 0.6 * env(p, 0.05, 0.2)));   // Sirena
    out.push(mk(0.45, (t, p) => { const g = saw(t * 190) * 0.5; return (g * (Math.sin(2 * Math.PI * 900 * t) + 0.6 * Math.sin(2 * Math.PI * 2200 * t))) * 0.8 * env(p, 0.03, 0.4); })); // Voz Hey
    out.push(mk(0.5, (t, p) => rnd() * Math.exp(-t * 28) * 0.9 + rnd() * Math.exp(-(t - 0.12) * 30) * (t > 0.12 ? 0.8 : 0)));          // Palmas
    out.push(mk(3.0, (t, p) => rnd() * 0.5 * Math.pow(p, 2) * env(p, 0.4, 0.02) + Math.sin(2 * Math.PI * (200 + 1500 * p * p) * t) * 0.3 * p));  // Riser
    out.push(mk(1.0, (t, p) => (Math.sin(2 * Math.PI * (80 * Math.exp(-t * 6) + 30) * t * 6) * 0.9 + rnd() * 0.4 * Math.exp(-t * 14)) * Math.exp(-t * 4))); // Impacto
    out.push(mk(0.5, (t, p) => saw(t * (240 + 600 * Math.sin(p * Math.PI * 4))) * 0.6 * env(p, 0.02, 0.3)));                              // Scratch
    return out;
  }

  /* ───────────── Grabadora WAV 24 bits ───────────── */
  class Recorder {
    constructor(engine) { this.e = engine; this.chunks = []; this.frames = 0; this.node = null; }
    start() {
      const e = this.e, c = e.ctx;
      this.chunks = []; this.frames = 0; this.sr = c.sampleRate;
      this.node = c.createScriptProcessor(4096, 2, 2);
      this.mute = c.createGain(); this.mute.gain.value = 0;
      this.node.onaudioprocess = (ev) => {
        const l = ev.inputBuffer.getChannelData(0), r = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : l;
        const out = new Uint8Array(l.length * 6);
        for (let i = 0, o = 0; i < l.length; i++) {
          for (const s of [l[i], r[i]]) {
            const v = Math.round(clamp(s, -1, 1) * 8388607);
            out[o++] = v & 255; out[o++] = (v >> 8) & 255; out[o++] = (v >> 16) & 255;
          }
        }
        this.chunks.push(out); this.frames += l.length;
      };
      e.limiter.connect(this.node); this.node.connect(this.mute); this.mute.connect(c.destination);
    }
    stop() {
      try { this.e.limiter.disconnect(this.node); } catch (err) {}
      this.node.disconnect(); this.mute.disconnect(); this.node.onaudioprocess = null;
      const bytes = this.frames * 6, h = new DataView(new ArrayBuffer(44)), sr = this.sr;
      const w = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); h.setUint32(4, 36 + bytes, true); w(8, "WAVE"); w(12, "fmt "); h.setUint32(16, 16, true);
      h.setUint16(20, 1, true); h.setUint16(22, 2, true); h.setUint32(24, sr, true); h.setUint32(28, sr * 6, true);
      h.setUint16(32, 6, true); h.setUint16(34, 24, true); w(36, "data"); h.setUint32(40, bytes, true);
      const blob = new Blob([h.buffer].concat(this.chunks), { type: "audio/wav" });
      this.chunks = []; this.node = null;
      return blob;
    }
  }

  /* ───────────── Motor ───────────── */
  class DJEngine {
    constructor() {
      this.cfg = { latency: 256, rate: 48000, masterSink: "", phonesSink: "" };
      this.dk = [0, 1, 2, 3].map(() => ({
        buf: null, playing: false, anchorPos: 0, anchorTime: 0, rate: 1, userRate: 1, loop: { on: false, in: 0, out: 0 },
        tl: null, slip: null, src: null, hold: false, brake: 1, brakeOn: false, grain: null, lastScrub: null, ratio: 1,
      }));
      this.mix = null; this.samples = []; this.rec = null; this.ready = false;
      this.onSuspended = null;
    }

    async init(cfg) {
      this.ready = false;
      Object.assign(this.cfg, cfg || {});
      const c = this.ctx = new AC({ latencyHint: this.cfg.latency / this.cfg.rate, sampleRate: this.cfg.rate });
      this.worklet = false;
      try { await c.audioWorklet.addModule("js/pshift.worklet.js"); this.worklet = true; } catch (e) { console.warn("pshift no disponible", e); }
      this.build();
      if (c.setSinkId && this.cfg.masterSink) { try { await c.setSinkId(this.cfg.masterSink); } catch (e) {} }
      this.ready = true;
    }

    build() {
      const c = this.ctx, G = () => c.createGain();
      this.bus = G(); this.mGain = G(); this.mFxSend = G(); this.mFxSend.gain.value = 0;
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
      this.mAn = c.createAnalyser(); this.mAn.fftSize = 1024;
      this.bus.connect(this.mGain); this.bus.connect(this.mFxSend);
      this.mGain.connect(this.limiter); this.limiter.connect(c.destination); this.limiter.connect(this.mAn);
      this.fx = new FxUnit(c); this.fx.out.connect(this.mGain); this.mFxSend.connect(this.fx.input);
      this.fx.setup("Echo", 0.5, 0.5);
      // sampler
      this.smpGain = G(); this.smpGain.connect(this.bus);
      if (!this.samples.length) { const sr = c.sampleRate; this.samples = synthSamples(sr).map((d) => { const b = c.createBuffer(1, d.length, sr); b.getChannelData(0).set(d); return b; }); }
      // auriculares
      this.phBus = G(); this.phCue = G(); this.phMst = G(); this.phVol = G(); this.phDest = c.createMediaStreamDestination();
      this.phCue.connect(this.phVol); this.phMst.connect(this.phVol); this.phVol.connect(this.phDest);
      this.limiter.connect(this.phMst);
      if (!this.phAudio) { this.phAudio = new Audio(); this.phAudio.autoplay = true; }
      this.phAudio.srcObject = this.phDest.stream;
      this.applyPhonesSink();
      // canales
      this.ch = this.dk.map((d, i) => this.buildChannel(i));
      this.mix && this.applyMix(this.mix);
    }

    buildChannel(i) {
      const c = this.ctx, G = () => c.createGain(), B = (t, f, q) => { const b = c.createBiquadFilter(); b.type = t; b.frequency.value = f; if (q) b.Q.value = q; return b; };
      const n = { in: G(), dry: G(), wet: G(), trim: G(), low: B("lowshelf", 200), mid: B("peaking", 1000, 0.7), hi: B("highshelf", 3500),
        lpf: B("lowpass", 20000), hpf: B("highpass", 10), padLP: B("lowpass", 22000, 0.9), gate: G(), pre: G(), fader: G(), xf: G(), post: G(),
        cue: G(), fxSend: G(), padSend: G(), an: c.createAnalyser(), pad: new FxUnit(c), };
      n.an.fftSize = 1024; n.cue.gain.value = 0; n.fxSend.gain.value = 0; n.padSend.gain.value = 0; n.gate.gain.value = 1;
      n.in.connect(n.dry); n.dry.connect(n.trim);
      if (this.worklet) {
        n.ps = new AudioWorkletNode(c, "pshift", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        n.in.connect(n.ps); n.ps.connect(n.wet); n.wet.connect(n.trim); n.wet.gain.value = 0;
      }
      n.trim.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.hi); n.hi.connect(n.lpf); n.lpf.connect(n.hpf);
      n.hpf.connect(n.padLP); n.padLP.connect(n.gate); n.gate.connect(n.pre);
      n.gate.connect(n.padSend); n.padSend.connect(n.pad.input); n.pad.out.connect(n.pre);
      n.pad.setup("Echo", 0.5, 0.5); n.pad.out.gain.value = 0.9;
      n.pre.connect(n.cue); n.cue.connect(this.phCue);
      n.pre.connect(n.fader); n.fader.connect(n.xf); n.xf.connect(n.post); n.post.connect(this.bus);
      n.post.connect(n.an); n.post.connect(n.fxSend); n.fxSend.connect(this.fx.input);
      return n;
    }

    async resume() { if (this.ctx.state !== "running") { try { await this.ctx.resume(); } catch (e) {} } if (this.phAudio && this.phAudio.paused && this.cfg.phonesSink) this.phAudio.play().catch(() => {}); }

    /* Reconstruye el contexto (cambio de búfer / frecuencia) conservando el estado. */
    async rebuild(cfg) {
      const saved = this.dk.map((d, i) => ({ buf: d.buf, playing: d.playing, pos: this.pos(i), loop: d.loop }));
      this.dk.forEach((d, i) => this.killSrc(i, true));
      try { this.ctx.close(); } catch (e) {}
      this.dk.forEach((d) => { d.ratio = 1; d.first = undefined; });
      await this.init(cfg);
      saved.forEach((s, i) => { const d = this.dk[i]; d.buf = s.buf; d.loop = s.loop; d.anchorPos = s.pos; if (s.playing) this.play(i); });
      await this.resume();
    }

    latencyMs() {
      const c = this.ctx; return ((c.baseLatency || this.cfg.latency / c.sampleRate) + (c.outputLatency || 0)) * 1000;
    }

    /* ─── Transporte ─── */
    effLoop(i) { const d = this.dk[i]; return d.tl || d.loop; }
    pos(i) {
      const d = this.dk[i];
      if (!d.buf) return 0;
      if (!d.playing) return d.anchorPos;
      const now = this.ctx.currentTime;
      let raw = d.anchorPos + (now - d.anchorTime) * d.rate;
      const L = this.effLoop(i);
      if (L.on && L.out > L.in && raw >= L.out && d.anchorPos < L.out) {
        raw = L.in + ((raw - L.in) % (L.out - L.in));
        d.anchorPos = raw; d.anchorTime = now;
      }
      return Math.min(raw, d.buf.duration);
    }
    reanchor(i) { const d = this.dk[i], p = this.pos(i); d.anchorPos = p; d.anchorTime = this.ctx.currentTime; }
    killSrc(i, hard) {
      const d = this.dk[i], s = d.src; if (!s) return;
      d.src = null;
      const t = this.ctx.currentTime;
      try { s.g.gain.cancelScheduledValues(t); s.g.gain.setValueAtTime(s.g.gain.value, t); s.g.gain.linearRampToValueAtTime(0, t + (hard ? 0.001 : 0.006)); s.s.stop(t + (hard ? 0.003 : 0.008)); } catch (e) {}
      s.s.onended = () => { try { s.g.disconnect(); } catch (e) {} };
    }
    startSrc(i, pos) {
      const d = this.dk[i], c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = d.buf; s.playbackRate.value = d.rate;
      const L = this.effLoop(i); s.loop = !!(L.on && L.out > L.in); if (s.loop) { s.loopStart = L.in; s.loopEnd = L.out; }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.005);
      s.connect(g); g.connect(this.ch[i].in);
      s.start(0, clamp(pos, 0, d.buf.duration - 0.001));
      d.src = { s, g }; d.anchorPos = pos; d.anchorTime = t;
    }
    load(i, buf) {
      const d = this.dk[i];
      this.killSrc(i); d.playing = false; d.buf = buf; d.anchorPos = 0; d.loop = { on: false, in: 0, out: 0 }; d.tl = null; d.slip = null;
    }
    eject(i) { this.load(i, null); }
    play(i) {
      const d = this.dk[i]; if (!d.buf || d.hold) { d.playing = !!d.buf; return; }
      if (d.playing && d.src) return;
      d.playing = true; this.startSrc(i, d.anchorPos);
    }
    pause(i) {
      const d = this.dk[i]; if (!d.playing) return;
      const p = this.pos(i); d.playing = false; d.anchorPos = p; this.killSrc(i);
    }
    setPlaying(i, on) { on ? this.play(i) : this.pause(i); }
    seek(i, t) {
      const d = this.dk[i]; if (!d.buf) return;
      t = clamp(t, 0, d.buf.duration - 0.05);
      if (d.playing && !d.hold) { this.killSrc(i); this.startSrc(i, t); } else { d.anchorPos = t; d.anchorTime = this.ctx.currentTime; }
    }
    setRate(i, r) {
      const d = this.dk[i]; d.userRate = r;
      const eff = r * d.brake;
      if (Math.abs(eff - d.rate) < 1e-5) return;
      this.reanchor(i); d.rate = eff;
      if (d.src) d.src.s.playbackRate.setTargetAtTime(Math.max(eff, 0.0001), this.ctx.currentTime, 0.004);
    }
    setLoop(i, on, inn, out) {
      const d = this.dk[i], p = this.pos(i); d.loop = { on: !!on, in: inn || 0, out: out || 0 };
      this.applyLoopToSrc(i);
      // si el loop se activa con el cabezal ya pasado el final, vuelve al inicio del loop
      if (on && d.playing && out > inn && p >= out) this.seek(i, inn + ((p - inn) % (out - inn)));
    }
    applyLoopToSrc(i) {
      const d = this.dk[i], L = this.effLoop(i);
      if (!d.src) return;
      const on = L.on && L.out > L.in;
      try { d.src.s.loopStart = on ? L.in : 0; d.src.s.loopEnd = on ? L.out : 0; d.src.s.loop = on; } catch (e) {}
    }
    /* Loop temporal con "slip": al soltar se continúa donde estaría la pista sin loop. */
    tempLoop(i, on, seconds) {
      const d = this.dk[i]; if (!d.buf) return;
      if (on) {
        const p = this.pos(i);
        d.slip = { p, t: this.ctx.currentTime, rate: d.rate };
        this.reanchor(i); d.tl = { on: true, in: p, out: Math.min(d.buf.duration - 0.05, p + seconds) };
        this.applyLoopToSrc(i);
      } else if (d.tl) {
        const sl = d.slip; d.tl = null;
        this.reanchor(i); this.applyLoopToSrc(i);
        if (sl) this.seek(i, sl.p + (this.ctx.currentTime - sl.t) * d.rate);
        d.slip = null;
      }
    }
    setBrake(i, on) { this.dk[i].brakeOn = on; }
    tick(dt) {
      this.dk.forEach((d, i) => {
        const target = d.brakeOn ? 0 : 1;
        if (d.brake !== target) {
          const step = d.brakeOn ? dt / 0.9 : dt / 0.15;
          d.brake = d.brakeOn ? Math.max(0, d.brake - step) : Math.min(1, d.brake + step);
          this.setRate(i, d.userRate);
        }
      });
    }
    /* Scratch: mientras se sostiene el plato se reproducen granos cortos a la velocidad del gesto. */
    setHold(i, on) {
      const d = this.dk[i];
      if (on === d.hold) return;
      if (on) { d.holdWasPlaying = d.playing; const p = this.pos(i); this.killSrc(i); d.anchorPos = p; d.anchorTime = this.ctx.currentTime; d.hold = true; d.lastScrub = { t: p, at: performance.now() }; }
      else {
        d.hold = false; d.lastScrub = null; this.killGrain(i);
        d.playing = d.holdWasPlaying; if (d.playing) this.startSrc(i, d.anchorPos);
      }
    }
    killGrain(i) { const d = this.dk[i]; if (d.grain) { try { d.grain.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.01); d.grain.s.stop(this.ctx.currentTime + 0.02); } catch (e) {} d.grain = null; } }
    scrub(i, t) {
      const d = this.dk[i]; if (!d.buf) return;
      const now = performance.now(), ls = d.lastScrub || { t, at: now - 16 };
      const dtS = Math.max(0.004, (now - ls.at) / 1000), v = (t - ls.t) / dtS;
      d.lastScrub = { t, at: now }; d.anchorPos = t;
      this.killGrain(i);
      const sp = Math.abs(v); if (sp < 0.08) return;
      const c = this.ctx, sr = d.buf.sampleRate, rate = clamp(sp, 0.1, 4), dur = 0.09, srcLen = Math.floor(dur * rate * sr);
      const s = c.createBufferSource(), g = c.createGain();
      let gb;
      if (v >= 0) { s.buffer = d.buf; s.playbackRate.value = rate; gb = null; }
      else {
        const end = Math.floor(clamp(t, 0, d.buf.duration) * sr), start = Math.max(0, end - srcLen), len = Math.max(1, end - start);
        const b = c.createBuffer(d.buf.numberOfChannels, len, sr);
        for (let ch = 0; ch < b.numberOfChannels; ch++) { const src = d.buf.getChannelData(ch), dst = b.getChannelData(ch); for (let k = 0; k < len; k++) dst[k] = src[end - 1 - k]; }
        s.buffer = b; s.playbackRate.value = rate; gb = b;
      }
      const now2 = c.currentTime;
      g.gain.setValueAtTime(0, now2); g.gain.linearRampToValueAtTime(1, now2 + 0.004); g.gain.setTargetAtTime(0, now2 + dur * 0.7, 0.01);
      s.connect(g); g.connect(this.ch[i].in);
      if (gb) s.start(0, 0); else s.start(0, clamp(t, 0, d.buf.duration - 0.01));
      s.stop(now2 + dur + 0.02);
      d.grain = { s, g };
    }

    /* ─── Tono / key lock ─── */
    setPitchRatio(i, r) {
      const n = this.ch[i]; if (!n.ps) return;
      r = clamp(r, 0.5, 2); const d = this.dk[i];
      if (Math.abs(r - d.ratio) < 1e-5) return;
      const wasDry = Math.abs(d.ratio - 1) < 1e-4; d.ratio = r;
      n.ps.parameters.get("ratio").setValueAtTime(r, this.ctx.currentTime);
      const dry = Math.abs(r - 1) < 1e-4, t = this.ctx.currentTime;
      if (dry !== wasDry || d.first === undefined) {
        d.first = true;
        n.dry.gain.setTargetAtTime(dry ? 1 : 0, t, 0.015); n.wet.gain.setTargetAtTime(dry ? 0 : 1, t, 0.015);
      }
    }

    /* ─── Mezclador ─── */
    applyMix(m) {
      this.mix = m; const c = this.ctx, t = c.currentTime, S = (p, v, tc) => p.setTargetAtTime(v, t, tc || 0.01);
      const eq = (v) => (v <= 0.5 ? -36 * Math.pow(1 - 2 * v, 1.4) : 12 * (v - 0.5));
      m.ch.forEach((x, i) => {
        const n = this.ch[i];
        S(n.trim.gain, dbToGain((x.trim - 0.5) * 24));
        S(n.low.gain, eq(x.low)); S(n.mid.gain, eq(x.mid)); S(n.hi.gain, eq(x.hi));
        if (x.color < 0.5) { const k = (0.5 - x.color) * 2; S(n.lpf.frequency, 20000 * Math.pow(0.012, k)); S(n.lpf.Q, 1 + k * 3); S(n.hpf.frequency, 10); }
        else { const k = (x.color - 0.5) * 2; S(n.hpf.frequency, 10 * Math.pow(900, k)); S(n.hpf.Q, 1 + k * 3); S(n.lpf.frequency, 20000); }
        const xg = i % 2 === 0 ? 1 - m.xf : m.xf;
        S(n.fader.gain, x.fader * x.fader * 1.2); S(n.xf.gain, Math.min(1, xg * 2));
        S(n.cue.gain, x.cue ? 1 : 0);
        S(n.fxSend.gain, m.fx.on && m.fx.ch === String(i + 1) ? 1 : 0);
      });
      S(this.mGain.gain, m.mvol * m.mvol * 1.78);
      S(this.mFxSend.gain, m.fx.on && m.fx.ch === "Master" ? 1 : 0);
      S(this.smpGain.gain, m.smpVol * m.smpVol * 1.5);
      S(this.phMst.gain, m.phMix); S(this.phCue.gain, 1 - m.phMix + 0.0001);
      S(this.phVol.gain, m.phVol * m.phVol * 1.5);
      if (this.fx.type !== m.fx.type || this.fx.beats !== m.fx.beats || Math.abs(this.fx.spb - m.spb) > 1e-4) this.fx.setup(m.fx.type, m.fx.beats, m.spb);
      this.fx.level = m.fx.level; this.fx.setOn(m.fx.on);
    }

    level(i) {
      const a = this.ch[i].an, buf = this._abuf || (this._abuf = new Float32Array(1024));
      a.getFloatTimeDomainData(buf); let p = 0; for (let k = 0; k < buf.length; k++) { const v = Math.abs(buf[k]); if (v > p) p = v; } return p;
    }
    masterLevel() {
      const buf = this._mbuf || (this._mbuf = new Float32Array(1024));
      this.mAn.getFloatTimeDomainData(buf); let p = 0; for (let k = 0; k < buf.length; k++) { const v = Math.abs(buf[k]); if (v > p) p = v; } return p;
    }

    /* ─── FX de pad ─── */
    padFx(i, name, on, spb) {
      const n = this.ch[i], c = this.ctx, t = c.currentTime;
      const wetFx = { Echo: ["Echo", 0.5], Reverb: ["Reverb", 1], Flanger: ["Flanger", 2], Trans: ["Trans", 0.25] }[name];
      if (wetFx) {
        if (on) { n.pad.setup(wetFx[0], wetFx[1], spb); n.pad.out.gain.value = 0.9; }
        n.padSend.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
        if (!on) n.pad.out.gain.setTargetAtTime(0.9, t, 0.01);
      } else if (name === "Roll ¼") this.tempLoop(i, on, spb * 0.25);
      else if (name === "Roll ½") this.tempLoop(i, on, spb * 0.5);
      else if (name === "Filtro") n.padLP.frequency.setTargetAtTime(on ? 500 : 22000, t, on ? 0.08 : 0.04);
      else if (name === "Brake") this.setBrake(i, on);
    }

    /* ─── Sampler ─── */
    playSample(k) {
      const b = this.samples[k]; if (!b) return;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.smpGain); s.start();
    }
    setSample(k, buf) { this.samples[k] = buf; }

    /* ─── Salidas ─── */
    async setMasterSink(id) { this.cfg.masterSink = id; if (this.ctx.setSinkId) { try { await this.ctx.setSinkId(id || ""); } catch (e) { console.warn(e); } } }
    async setPhonesSink(id) { this.cfg.phonesSink = id; await this.applyPhonesSink(); }
    async applyPhonesSink() {
      const a = this.phAudio; if (!a) return;
      if (!this.cfg.phonesSink) { a.pause(); return; }
      try { if (a.setSinkId) await a.setSinkId(this.cfg.phonesSink); await a.play(); } catch (e) { console.warn("auriculares:", e); }
    }

    /* ─── Grabación ─── */
    startRec() { this.rec = new Recorder(this); this.rec.start(); }
    stopRec() { const b = this.rec.stop(); this.rec = null; return b; }

    async decode(arrayBuffer) { return await this.ctx.decodeAudioData(arrayBuffer); }
  }

  window.DJEngine = DJEngine;
})();
