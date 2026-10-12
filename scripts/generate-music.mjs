// Regenerates public/assets/{battle,frontier}-theme.ogg: node scripts/generate-music.mjs, then encode battle.wav / frontier.wav with ffmpeg (libvorbis -q:a 3; volume -5dB / -3dB).
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
const SR = 44100;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

class Song {
  constructor(sec) { this.N = Math.round(sec * SR); this.L = new Float32Array(this.N); this.R = new Float32Array(this.N); }
  put(i, v, pan) { const k = ((i % this.N) + this.N) % this.N; const a = (pan + 1) / 2; this.L[k] += v * Math.cos(a * Math.PI / 2); this.R[k] += v * Math.sin(a * Math.PI / 2); }
}
const blep = (t, dt) => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;

/** Detuned saw stack through a resonant lowpass with a cutoff envelope. */
function tone(s, o) {
  const { t, dur, freq, vol = 0.2, pan = 0, voices = 3, detune = 8, attack = 0.02, release = 0.15, cutoff = 1500, peak = 0, decay = 0.3, res = 0.2, vib = 0, vibRate = 5.5, wave = 'saw' } = o;
  const n = Math.floor((dur + release) * SR), start = Math.round(t * SR);
  const ph = Array.from({ length: voices }, () => Math.abs(rnd()));
  const cents = Array.from({ length: voices }, (_, v) => voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * detune);
  let lo = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const vf = 1 + (vib ? vib * Math.sin(2 * Math.PI * vibRate * tt) * Math.min(1, tt / 0.4) : 0);
    let x = 0;
    for (let v = 0; v < voices; v++) {
      const f = freq * vf * Math.pow(2, cents[v] / 1200), dt = f / SR;
      ph[v] = (ph[v] + dt) % 1;
      x += wave === 'saw' ? 2 * ph[v] - 1 - blep(ph[v], dt) : wave === 'tri' ? 4 * Math.abs(ph[v] - 0.5) - 1 : Math.sin(2 * Math.PI * ph[v]);
    }
    x /= Math.sqrt(voices);
    const fc = Math.min(SR / 6, cutoff + peak * Math.exp(-tt / decay));
    const g = 2 * Math.sin(Math.PI * fc / SR);
    lo += g * bp; const hi = x - lo - (1 - res) * 1.6 * bp; bp += g * hi;
    let env = Math.min(1, tt / attack);
    if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / release);
    s.put(start + i, lo * env * vol, pan);
  }
}
function noiseHit(s, { t, dur, vol, pan = 0, hp = 0, lpHz = 0, shape = 3 }) {
  const n = Math.floor(dur * SR), start = Math.round(t * SR); let prev = 0, lp = 0;
  const a = lpHz ? 1 - Math.exp(-2 * Math.PI * lpHz / SR) : 1;
  for (let i = 0; i < n; i++) {
    const x = rnd(); const h = hp ? x - prev * hp : x; prev = x;
    lp += a * (h - lp);
    s.put(start + i, lp * vol * Math.pow(1 - i / n, shape), pan);
  }
}
function boom(s, { t, f0, f1, dur, vol, pan = 0, click = 0.3 }) {
  const n = Math.floor(dur * SR), start = Math.round(t * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR; const f = f1 + (f0 - f1) * Math.exp(-tt * 18);
    ph += f / SR;
    const e = Math.exp(-tt * (4.5 / dur));
    s.put(start + i, (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph)) * e * vol + rnd() * click * vol * Math.exp(-tt * 90), pan);
  }
}
const kick = (s, t, v = 0.9) => boom(s, { t, f0: 140, f1: 42, dur: 0.5, vol: v });
const taiko = (s, t, v = 0.9, f = 70) => { boom(s, { t, f0: f * 1.8, f1: f, dur: 1.1, vol: v, click: 0.5 }); noiseHit(s, { t, dur: 0.08, vol: v * 0.25, lpHz: 2500 }); };
const snare = (s, t, v = 0.5) => { noiseHit(s, { t, dur: 0.28, vol: v, hp: 0.5, lpHz: 9000, shape: 2.2 }); boom(s, { t, f0: 260, f1: 170, dur: 0.18, vol: v * 0.5, click: 0 }); };
const hat = (s, t, v = 0.12, pan = 0.3) => noiseHit(s, { t, dur: 0.05, vol: v, pan, hp: 0.97, shape: 2 });
const crash = (s, t, v = 0.35) => { noiseHit(s, { t, dur: 2.6, vol: v, pan: -0.2, hp: 0.9, shape: 2.5 }); };

function reverb(s, wet, size = 1) {
  // Process the loop twice and keep the second pass so the tail wraps seamlessly.
  const N = s.N; const out = [new Float32Array(N), new Float32Array(N)];
  [s.L, s.R].forEach((src, ch) => {
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => Math.round((d + ch * 23) * size));
    const aps = [225, 556, 441].map(d => d + ch * 11);
    const fb = 0.86, damp = 0.35;
    const cbuf = combs.map(d => new Float32Array(d)), cpos = combs.map(() => 0), clp = combs.map(() => 0);
    const abuf = aps.map(d => new Float32Array(d)), apos = aps.map(() => 0);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
      const x = src[i]; let y = 0;
      for (let c = 0; c < combs.length; c++) {
        const b = cbuf[c], p = cpos[c], v = b[p];
        clp[c] = v * (1 - damp) + clp[c] * damp; b[p] = x * 0.3 + clp[c] * fb; cpos[c] = (p + 1) % b.length; y += v;
      }
      for (let a = 0; a < aps.length; a++) {
        const b = abuf[a], p = apos[a], v = b[p]; const inp = y; y = -inp + v; b[p] = inp + v * 0.5; apos[a] = (p + 1) % b.length;
      }
      if (pass === 1) out[ch][i] = x * (1 - wet) + y * wet * 0.35;
    }
  });
  s.L = out[0]; s.R = out[1];
}
function finish(s, name, drive = 1.6) {
  let peak = 0;
  for (let i = 0; i < s.N; i++) { s.L[i] = Math.tanh(s.L[i] * drive); s.R[i] = Math.tanh(s.R[i] * drive); peak = Math.max(peak, Math.abs(s.L[i]), Math.abs(s.R[i])); }
  const g = 0.89 / peak; const buf = Buffer.alloc(44 + s.N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + s.N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(s.N * 4, 40);
  for (let i = 0; i < s.N; i++) { buf.writeInt16LE(Math.round(s.L[i] * g * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(s.R[i] * g * 32767), 46 + i * 4); }
  fs.writeFileSync(name, buf);
}
const TRI = { Dm: [50, 53, 57], Gm: [43, 46, 50], Bb: [46, 50, 53], C: [48, 52, 55], F: [53, 57, 60], A: [45, 49, 52] };
const ROOT = { Dm: 38, Gm: 31, Bb: 34, C: 36, F: 41, A: 33 };

// ---------------- Battle: 140 BPM, D minor, 16 bars ----------------
function battle() {
  const bpm = 140, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const prog = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A', 'Gm', 'Gm', 'Bb', 'F', 'Gm', 'Bb', 'C', 'A'];
  const mel = [
    [[0, 1.5, 74], [1.5, .5, 74], [2, 1, 77], [3, 1, 76]], [[0, 2, 74], [2, 1, 72], [3, 1, 69]],
    [[0, 1.5, 70], [1.5, .5, 70], [2, 1, 74], [3, 1, 72]], [[0, 2, 72], [2, 1, 76], [3, 1, 79]],
    [[0, 1.5, 81], [1.5, .5, 79], [2, 1, 77], [3, 1, 74]], [[0, 1, 77], [1, 1, 76], [2, 1, 74], [3, 1, 76]],
    [[0, 1, 74], [1, 1, 72], [2, 1, 70], [3, 1, 72]], [[0, 2, 73], [2, 1, 76], [3, 1, 81]],
    [[0, 1.5, 79], [1.5, .5, 79], [2, 1, 82], [3, 1, 81]], [[0, 2, 79], [2, 1, 77], [3, 1, 74]],
    [[0, 1.5, 82], [1.5, .5, 82], [2, 1, 86], [3, 1, 84]], [[0, 2, 81], [2, 1, 77], [3, 1, 81]],
    [[0, 1, 79], [1, 1, 82], [2, 1, 86], [3, 1, 82]], [[0, 1, 84], [1, 1, 82], [2, 1, 79], [3, 1, 82]],
    [[0, 1, 84], [1, 1, 79], [2, 1, 76], [3, 1, 79]], [[0, 2, 85], [2, 1, 88], [3, 1, 81]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, ch = prog[b], root = ROOT[ch], intense = b >= 8 ? 1.15 : 1;
    for (const [pan, det] of [[-0.55, 9], [0.55, 11]]) for (const m of TRI[ch]) tone(s, { t: T, dur: bar, freq: mtof(m), vol: 0.05, pan, detune: det, voices: 3, attack: 0.25, release: 0.4, cutoff: 1300, res: 0.1 });
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.22, voices: 1, wave: 'sin', attack: 0.01, release: 0.1 });
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2, dur: beat / 2 * 0.85, freq: mtof(root + 12), vol: 0.17, voices: 2, detune: 6, attack: 0.005, release: 0.05, cutoff: 260, peak: 900, decay: 0.09, res: 0.3 });
    const pat = [0, 7, 12, 7];
    for (let k = 0; k < 16; k++) tone(s, { t: T + k * beat / 4, dur: beat / 4 * 0.8, freq: mtof(root + 24 + pat[k % 4]), vol: (k % 4 === 0 ? 0.075 : 0.05) * intense, pan: k % 2 ? 0.35 : -0.35, voices: 3, detune: 10, attack: 0.004, release: 0.04, cutoff: 700, peak: 2200, decay: 0.07, res: 0.15 });
    for (const [bt, d, m] of mel[b]) {
      tone(s, { t: T + bt * beat, dur: d * beat * 0.92, freq: mtof(m), vol: 0.16 * intense, pan: 0.1, voices: 4, detune: 14, attack: 0.025, release: 0.12, cutoff: 900, peak: 3600, decay: 0.25, res: 0.12, vib: 0.004 });
      tone(s, { t: T + bt * beat, dur: d * beat * 0.92, freq: mtof(m - 12), vol: 0.12 * intense, pan: -0.15, voices: 4, detune: 12, attack: 0.03, release: 0.12, cutoff: 700, peak: 2600, decay: 0.25, res: 0.12, vib: 0.004 });
    }
    for (const m of TRI[ch]) tone(s, { t: T, dur: beat * 0.9, freq: mtof(m + 12), vol: 0.06, voices: 3, detune: 12, attack: 0.01, release: 0.1, cutoff: 800, peak: 3000, decay: 0.15 });
    taiko(s, T, 0.85, 62); kick(s, T + beat * 2, 0.7); kick(s, T + beat * 1.5, 0.45); taiko(s, T + beat * 3.5, 0.55, 70);
    snare(s, T + beat, 0.5); snare(s, T + beat * 3, 0.55);
    for (let h = 0; h < 8; h++) hat(s, T + h * beat / 2, h % 2 ? 0.1 : 0.06, h % 2 ? 0.4 : -0.4);
    if (b % 4 === 0) crash(s, T, 0.28);
    if (b % 8 === 7) { for (let r = 0; r < 8; r++) snare(s, T + beat * 3 + r * beat / 8, 0.18 + r * 0.05); taiko(s, T + beat * 3.5, 0.9, 55); }
  }
  reverb(s, 0.3); finish(s, 'battle.wav', 1.5);
}

// ---------------- Frontier: 100 BPM, D minor, 16 bars, marching and heroic ----------------
function frontier() {
  const bpm = 100, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const prog = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Gm', 'Bb', 'A', 'Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'C', 'A'];
  const mel = [
    [[0, 1.5, 74], [1.5, .5, 77], [2, 1, 81], [3, 1, 79]], [[0, 1.5, 77], [1.5, .5, 76], [2, 2, 74]],
    [[0, 1.5, 74], [1.5, .5, 77], [2, 1, 82], [3, 1, 81]], [[0, 1.5, 79], [1.5, .5, 76], [2, 2, 72]],
    [[0, 1.5, 74], [1.5, .5, 77], [2, 1, 81], [3, 1, 86]], [[0, 1.5, 82], [1.5, .5, 79], [2, 1, 77], [3, 1, 74]],
    [[0, 1.5, 77], [1.5, .5, 79], [2, 1, 82], [3, 1, 79]], [[0, 2, 73], [2, .5, 76], [2.5, .5, 79], [3, 1, 81]],
    [[0, 1, 86], [1, .5, 84], [1.5, .5, 86], [2, 2, 89]], [[0, 1.5, 86], [1.5, .5, 82], [2, 2, 86]],
    [[0, 1, 84], [1, 1, 81], [2, 1, 77], [3, 1, 81]], [[0, 1.5, 84], [1.5, .5, 79], [2, 2, 76]],
    [[0, 1, 82], [1, .5, 84], [1.5, .5, 82], [2, 2, 86]], [[0, 1.5, 89], [1.5, .5, 86], [2, 1, 82], [3, 1, 86]],
    [[0, 1.5, 88], [1.5, .5, 84], [2, 1, 79], [3, 1, 84]], [[0, 2, 85], [2, .5, 88], [2.5, .5, 85], [3, 1, 81]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, ch = prog[b], root = ROOT[ch], late = b >= 8, swell = late ? 1.2 : 1;
    // string pad
    for (const [pan, det] of [[-0.6, 9], [0.6, 12]]) for (const m of TRI[ch]) tone(s, { t: T, dur: bar, freq: mtof(m), vol: 0.035 * swell, pan, detune: det, voices: 3, attack: 0.4, release: 0.5, cutoff: 1400, res: 0.1 });
    // sub bass + pulsing 8ths
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.2, voices: 1, wave: 'sin', attack: 0.01, release: 0.1 });
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2, dur: beat / 2 * 0.8, freq: mtof(root + 12), vol: 0.12, voices: 2, detune: 6, attack: 0.005, release: 0.05, cutoff: 240, peak: 800, decay: 0.09, res: 0.3 });
    // driving string ostinato: 8ths, then 16ths in the second half
    const pat = [0, 7, 12, 7, 0, 7, 15, 7], steps = late ? 16 : 8, sd = bar / steps;
    for (let k = 0; k < steps; k++) tone(s, { t: T + k * sd, dur: sd * 0.78, freq: mtof(root + 24 + pat[k % 8]), vol: (k % (steps / 4) === 0 ? 0.07 : 0.045), pan: k % 2 ? 0.4 : -0.4, voices: 3, detune: 10, attack: 0.004, release: 0.04, cutoff: 650, peak: 2000, decay: 0.07, res: 0.15 });
    // horn melody with octave doubling; trumpet line above in the second half
    for (const [bt, d, m] of mel[b]) {
      tone(s, { t: T + bt * beat, dur: d * beat * 0.93, freq: mtof(m), vol: 0.15 * swell, pan: 0.1, voices: 4, detune: 12, attack: 0.04, release: 0.2, cutoff: 850, peak: 3200, decay: 0.3, res: 0.12, vib: 0.004 });
      tone(s, { t: T + bt * beat, dur: d * beat * 0.93, freq: mtof(m - 12), vol: 0.12 * swell, pan: -0.15, voices: 4, detune: 12, attack: 0.05, release: 0.2, cutoff: 650, peak: 2300, decay: 0.3, res: 0.12, vib: 0.004 });
      if (late) tone(s, { t: T + bt * beat, dur: d * beat * 0.93, freq: mtof(m + 7), vol: 0.05, pan: 0.45, voices: 3, detune: 10, attack: 0.05, release: 0.2, cutoff: 900, peak: 2800, decay: 0.3 });
    }
    // harp-like arpeggio
    const arp = [0, 1, 2, 1, 2, 1, 0, 1];
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2 + beat / 4, dur: 0.4, freq: mtof(TRI[ch][arp[e]] + 24), vol: 0.035, pan: e % 2 ? 0.55 : -0.55, voices: 1, wave: 'tri', attack: 0.004, release: 0.5, cutoff: 900, peak: 4000, decay: 0.1 });
    // march percussion
    taiko(s, T, 0.8, 58); kick(s, T + beat * 2, 0.55); if (late) kick(s, T + beat * 1.5, 0.35);
    snare(s, T + beat, 0.28); snare(s, T + beat * 3, 0.32);
    for (let h = 0; h < 8; h++) hat(s, T + h * beat / 2, h % 2 ? 0.06 : 0.035, h % 2 ? 0.4 : -0.4);
    if (b % 4 === 0 && b > 0) crash(s, T, 0.2);
    if (b === 7 || b === 15) { for (let r = 0; r < 8; r++) snare(s, T + beat * 3 + r * beat / 8, 0.12 + r * 0.04); taiko(s, T + beat * 3.5, 0.8, 55); }
  }
  reverb(s, 0.34, 1.15); finish(s, 'frontier.wav', 1.5);
}
battle(); frontier();
