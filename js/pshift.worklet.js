/* Pitch shifter de línea de retardo con dos lecturas cruzadas (Hann).
   Se usa para Key lock (compensa el cambio de tono del tempo) y para el
   modo Keyboard (transposición en semitonos). Parámetro: ratio (1 = sin cambio). */
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "ratio", defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: "k-rate" }];
  }
  constructor() {
    super();
    this.N = 16384;
    this.mask = this.N - 1;
    this.G = Math.round(sampleRate * 0.03); // tamaño de grano ≈ 30 ms
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0;
    this.p = 0;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const ratio = params.ratio[0], dp = (1 - ratio) / this.G, G = this.G, N = this.N, mask = this.mask;
    const len = out[0].length;
    for (let c = 0; c < out.length; c++) {
      const src = inp[Math.min(c, inp.length - 1)], dst = out[c], b = this.buf[c];
      let w = this.w, p = this.p;
      for (let i = 0; i < len; i++) {
        b[w & mask] = src[i];
        const pb = p + 0.5 - (p >= 0.5 ? 1 : 0);
        const dA = p * G + 1, dB = pb * G + 1;
        const wA = 0.5 - 0.5 * Math.cos(2 * Math.PI * p), wB = 0.5 - 0.5 * Math.cos(2 * Math.PI * pb);
        let rA = w - dA, rB = w - dB;
        const iA = Math.floor(rA), fA = rA - iA, iB = Math.floor(rB), fB = rB - iB;
        const sA = b[iA & mask] * (1 - fA) + b[(iA + 1) & mask] * fA;
        const sB = b[iB & mask] * (1 - fB) + b[(iB + 1) & mask] * fB;
        dst[i] = sA * wA + sB * wB;
        w++;
        p += dp;
        if (p >= 1) p -= 1; else if (p < 0) p += 1;
      }
      if (c === out.length - 1) { this.w = w; this.p = p; }
    }
    return true;
  }
}
registerProcessor("pshift", PitchShift);
