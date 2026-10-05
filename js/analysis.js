/* Análisis de audio: forma de onda, BPM + rejilla y tono (Camelot).
   Todo trabaja sobre un AudioBuffer ya decodificado. */
(function () {
  const A = {};
  const tick = () => new Promise((r) => setTimeout(r, 0));

  A.mono = function (buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[i] / ch;
    }
    return out;
  };

  /* Forma de onda a 100 muestras/s: amp (pico) y low (graves, LPF ~180 Hz). */
  A.waveform = function (buf, rate) {
    rate = rate || 100;
    const sr = buf.sampleRate, n = Math.max(1, Math.ceil(buf.duration * rate)), step = sr / rate;
    const m = A.mono(buf), amp = new Float32Array(n), low = new Float32Array(n);
    const a = 1 - Math.exp(-2 * Math.PI * 180 / sr);
    let lp = 0, lp2 = 0, i = 0;
    for (let b = 0; b < n; b++) {
      const end = Math.min(m.length, Math.round((b + 1) * step));
      let pa = 0, pl = 0;
      for (; i < end; i++) {
        const x = m[i];
        lp += a * (x - lp); lp2 += a * (lp - lp2);
        const ax = Math.abs(x), al = Math.abs(lp2);
        if (ax > pa) pa = ax;
        if (al > pl) pl = al;
      }
      amp[b] = pa; low[b] = pl;
    }
    const sorted = Float32Array.from(amp).sort();
    const ref = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.995)] || 1);
    for (let b = 0; b < n; b++) {
      amp[b] = Math.max(0.03, Math.min(1, amp[b] / ref));
      low[b] = Math.min(amp[b], Math.max(0.02, low[b] / ref * 1.6));
    }
    return { amp, low, rate };
  };

  /* Envolvente de onsets a 200 Hz centrada en graves (bombo). */
  function onsetEnvelope(m, sr) {
    const R = 200, hop = Math.round(sr / R), n = Math.floor(m.length / hop);
    const a = 1 - Math.exp(-2 * Math.PI * 250 / sr);
    const env = new Float32Array(n);
    let lp = 0;
    for (let b = 0; b < n; b++) {
      let mx = 0;
      for (let i = b * hop, e = i + hop; i < e; i++) { lp += a * (m[i] - lp); const v = Math.abs(lp); if (v > mx) mx = v; }
      env[b] = mx;
    }
    // suavizado + diferencia positiva respecto a la media local
    const on = new Float32Array(n);
    for (let b = 6; b < n; b++) {
      let s = 0; for (let k = 1; k <= 6; k++) s += env[b - k];
      const d = env[b] - s / 6;
      on[b] = d > 0 ? d : 0;
    }
    return { on, R };
  }

  function combScore(on, P, phase) {
    let s = 0;
    for (let p = phase; p < on.length - 2; p += P) {
      const k = Math.round(p);
      s += on[k] + 0.5 * (on[k - 1] + on[k + 1]);
    }
    return s;
  }

  A.tempo = function (buf) {
    const m = A.mono(buf), { on, R } = onsetEnvelope(m, buf.sampleRate);
    const n = on.length;
    if (n < R * 8) return { bpm: 120, firstBeat: 0 };
    // autocorrelación gruesa
    const minLag = Math.round(R * 60 / 190), maxLag = Math.round(R * 60 / 60);
    const ac = new Float32Array(maxLag * 4 + 1);
    for (let lag = minLag; lag < ac.length; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += on[i] * on[i + lag];
      ac[lag] = s / (n - lag);
    }
    let best = minLag, bs = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const s = ac[lag] + 0.5 * ac[lag * 2] + 0.25 * ac[lag * 4];
      if (s > bs) { bs = s; best = lag; }
    }
    let bpm0 = 60 * R / best;
    while (bpm0 < 88) bpm0 *= 2;
    while (bpm0 > 176) bpm0 /= 2;
    // refinado fino sobre toda la pista
    let bBpm = bpm0, bPhase = 0, bScore = -1;
    for (let b = bpm0 - 1.5; b <= bpm0 + 1.5; b += 0.02) {
      const P = R * 60 / b;
      for (let ph = 0; ph < P; ph += 0.5) {
        const s = combScore(on, P, ph);
        if (s > bScore) { bScore = s; bBpm = b; bPhase = ph; }
      }
    }
    if (Math.abs(bBpm - Math.round(bBpm)) < 0.06) bBpm = Math.round(bBpm);
    const P = R * 60 / bBpm;
    // refinar la fase con el BPM definitivo
    let ph2 = bPhase, s2 = -1;
    for (let ph = 0; ph < P; ph += 0.25) { const s = combScore(on, P, ph); if (s > s2) { s2 = s; ph2 = ph; } }
    return { bpm: Math.round(bBpm * 100) / 100, firstBeat: ph2 / R };
  };

  /* ---- Tono (Krumhansl-Schmuckler) → notación Camelot ---- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const CAM_MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const CAM_MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  function corr(x, y) {
    let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += x[i]; my += y[i]; } mx /= 12; my /= 12;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < 12; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxy / (Math.sqrt(sxx * syy) || 1);
  }
  A.key = function (buf) {
    const m = A.mono(buf), f = Math.max(1, Math.round(buf.sampleRate / 11025)), sr2 = buf.sampleRate / f;
    const n2 = Math.floor(m.length / f), d = new Float32Array(n2);
    for (let i = 0; i < n2; i++) { let s = 0; for (let k = 0; k < f; k++) s += m[i * f + k]; d[i] = s / f; }
    const N = 8192;
    if (n2 < N * 4) return "—";
    const frames = Math.min(48, Math.floor((n2 * 0.8) / N));
    const chroma = new Float64Array(12), re = new Float64Array(N), im = new Float64Array(N);
    const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const kLo = Math.ceil(65 * N / sr2), kHi = Math.min(N / 2 - 1, Math.floor(2000 * N / sr2));
    for (let fr = 0; fr < frames; fr++) {
      const start = Math.floor(n2 * 0.1 + fr * (n2 * 0.8 - N) / Math.max(1, frames - 1));
      for (let i = 0; i < N; i++) { re[i] = d[start + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = kLo; k <= kHi; k++) {
        const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        const midi = 69 + 12 * Math.log2((k * sr2 / N) / 440);
        chroma[((Math.round(midi) % 12) + 12) % 12] += mag;
      }
    }
    let best = -2, bk = 0, bmaj = true;
    for (let r = 0; r < 12; r++) {
      const rot = new Array(12); for (let i = 0; i < 12; i++) rot[i] = chroma[(i + r) % 12];
      const cM = corr(rot, MAJ), cm = corr(rot, MIN);
      if (cM > best) { best = cM; bk = r; bmaj = true; }
      if (cm > best) { best = cm; bk = r; bmaj = false; }
    }
    return bmaj ? CAM_MAJ[bk] + "B" : CAM_MIN[bk] + "A";
  };

  A.analyze = async function (buf) {
    await tick();
    const t = A.tempo(buf);
    await tick();
    const key = A.key(buf);
    return { bpm: t.bpm, firstBeat: t.firstBeat, key };
  };

  window.DJAnalysis = A;
})();
