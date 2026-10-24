// Run in an output directory: node /path/to/scripts/generate-music.mjs [battle frontier ...].
// With no arguments all eight WAV themes are written. Battle is a 3.5-second
// one-shot cue; the field themes loop. Encode battle at -5 dB and frontier
// at -5 dB with ffmpeg libvorbis -q:a 3. See public/assets/*-theme.md.
// Campaign quartet: render dawn drive wasteland mist together; encode each at -5 dB, libvorbis quality 3.
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
const SR = 44100;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

class Song {
  constructor(sec, loop = true) { this.loop = loop; this.N = Math.round(sec * SR); this.L = new Float32Array(this.N); this.R = new Float32Array(this.N); }
  put(i, v, pan) { if (!this.loop && (i < 0 || i >= this.N)) return; const k = ((i % this.N) + this.N) % this.N; const a = (pan + 1) / 2; this.L[k] += v * Math.cos(a * Math.PI / 2); this.R[k] += v * Math.sin(a * Math.PI / 2); }
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
    for (let pass = 0; pass < (s.loop ? 2 : 1); pass++) for (let i = 0; i < N; i++) {
      const x = src[i]; let y = 0;
      for (let c = 0; c < combs.length; c++) {
        const b = cbuf[c], p = cpos[c], v = b[p];
        clp[c] = v * (1 - damp) + clp[c] * damp; b[p] = x * 0.3 + clp[c] * fb; cpos[c] = (p + 1) % b.length; y += v;
      }
      for (let a = 0; a < aps.length; a++) {
        const b = abuf[a], p = apos[a], v = b[p]; const inp = y; y = -inp + v; b[p] = inp + v * 0.5; apos[a] = (p + 1) % b.length;
      }
      if (!s.loop || pass === 1) out[ch][i] = x * (1 - wet) + y * wet * 0.35;
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

// ---------------- Battle: 160 BPM, D minor, 3.5s continuous cinematic phrase ----------------
function battle() {
  // Independent seed: rendering other themes cannot change this cue.
  seed = 20261017;
  const beat = 60 / 160;
  const s = new Song(3.5, false);
  // Sustained strings bridge all four visual phases, with overlapping 280ms
  // releases rather than dropping out between the short brass/percussion hits.
  for (const [t, dur, chord] of [[0, 1.4, [50, 53, 57]], [1.3, 1.3, [49, 52, 57]], [2.5, .7, [50, 53, 57]]]) {
    for (const pan of [-.55, .55]) for (const note of chord) tone(s, {
      t, dur, freq: mtof(note + 12), vol: .055, pan, wave: 'tri',
      voices: 3, detune: 6, attack: .12, release: .28, cutoff: 2100, res: .08,
    });
  }
  // Call, strike, dominant answer, then a resolved octave fanfare.
  // Beats 2 / 3 / 5 / 6 match firing and impact in BATTLE_SCENE_TIMING.
  const melody = [
    [0, .5, 74], [.5, .5, 77], [1, .5, 81], [1.5, .5, 84],
    [2, .5, 86], [2.5, .5, 81], [3, 1, 77],
    [4, .5, 76], [4.5, .5, 73], [5, .5, 76], [5.5, .5, 81],
    [6, .5, 85], [6.5, .5, 88], [7, .9, 86],
  ];
  for (const [start, length, note] of melody) {
    for (const [octave, pan, vol] of [[0, .18, .15], [-12, -.22, .11]]) tone(s, {
      t: start * beat, dur: length * beat * .98, freq: mtof(note + octave), vol, pan,
      voices: 4, detune: 8, attack: .025, release: .16, cutoff: 1000, peak: 2800, decay: .2, res: .12,
    });
  }
  // Overlapping releases retain propulsion without gating the whole mix.
  for (let step = 0; step < 28; step++) {
    const dominant = step >= 16;
    const root = dominant ? 33 : 38;
    const pattern = dominant ? [0, 7, 12, 16] : [0, 7, 12, 15];
    tone(s, { t: step * beat / 4, dur: .08, freq: mtof(root + 24 + pattern[step % 4]), vol: step % 4 ? .035 : .055, pan: step % 2 ? .45 : -.45, voices: 2, detune: 7, attack: .012, release: .08, cutoff: 650, peak: 1600, decay: .08 });
    if (step % 2 === 0) tone(s, { t: step * beat / 4, dur: .17, freq: mtof(root), vol: .14, voices: 2, detune: 4, attack: .012, release: .1, cutoff: 280, peak: 700, decay: .1 });
    if (step % 2 === 0) hat(s, step * beat / 4, .045, step % 4 ? .35 : -.35);
  }
  // Low brass moves from D minor to A major before the final D-minor resolution.
  for (const [start, chord] of [[0, [50, 53, 57]], [4, [45, 49, 52]]]) {
    for (const note of chord) tone(s, { t: start * beat, dur: beat * 1.4, freq: mtof(note), vol: .065, pan: -.15, voices: 3, attack: .03, release: .28, cutoff: 800, peak: 1600, decay: .25 });
  }
  boom(s, { t: 0, f0: 110, f1: 45, dur: .28, vol: .65, click: .15 });
  for (const q of [2, 3, 5, 6]) boom(s, { t: q * beat, f0: 125, f1: 48, dur: .28, vol: .38, click: .05 });
  for (const q of [1, 4]) snare(s, q * beat, .26);
  // Rising roll hands off to the decisive chord just before the result appears.
  for (let step = 0; step < 4; step++) snare(s, (6 + step / 4) * beat, .1 + step * .035);
  for (const note of [38, 50, 57, 62, 65, 74, 81]) tone(s, {
    t: 7 * beat, dur: .42, freq: mtof(note), vol: .085, pan: note % 2 ? .4 : -.4,
    voices: 3, detune: 8, attack: .008, release: .32, cutoff: 950, peak: 2600, decay: .25,
  });
  boom(s, { t: 7 * beat, f0: 105, f1: 43, dur: .55, vol: .55, click: .06 });
  noiseHit(s, { t: 7 * beat, dur: .7, vol: .15, hp: .9, shape: 2.5 });
  reverb(s, .22, .8);
  // No tail wrapping. Fade the final 220ms before the 3.6s scene ends.
  for (let i = 0; i < s.N; i++) {
    const gain = Math.min(1, i / (SR * .006), (s.N - 1 - i) / (SR * .22));
    s.L[i] *= gain; s.R[i] *= gain;
  }
  finish(s, 'battle.wav', 1.4);
}

// ---------------- Frontier: 144 BPM, D minor, 16 bars, brisk heroic march ----------------
function frontier() {
  const bpm = 144, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
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
    for (const [pan, det] of [[-0.6, 9], [0.6, 12]]) for (const m of TRI[ch]) tone(s, { t: T, dur: bar, freq: mtof(m), vol: 0.025 * swell, pan, detune: det, voices: 3, attack: 0.25, release: 0.3, cutoff: 1400, res: 0.1 });
    // sub bass + pulsing 8ths
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.2, voices: 1, wave: 'sin', attack: 0.01, release: 0.1 });
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2, dur: beat / 2 * 0.8, freq: mtof(root + 12), vol: 0.12, voices: 2, detune: 6, attack: 0.005, release: 0.05, cutoff: 240, peak: 800, decay: 0.09, res: 0.3 });
    // Short sixteenth-note strings keep forward motion underneath the brass from the opening.
    const pat = [0, 7, 12, 7, 0, 7, 15, 7], steps = 16, sd = bar / steps;
    for (let k = 0; k < steps; k++) tone(s, { t: T + k * sd, dur: sd * 0.78, freq: mtof(root + 24 + pat[k % 8]), vol: (k % (steps / 4) === 0 ? 0.07 : 0.045), pan: k % 2 ? 0.4 : -0.4, voices: 3, detune: 10, attack: 0.004, release: 0.04, cutoff: 650, peak: 2000, decay: 0.07, res: 0.15 });
    // horn melody with octave doubling; trumpet line above in the second half
    for (const [bt, d, m] of mel[b]) {
      tone(s, { t: T + bt * beat, dur: d * beat * 0.85, freq: mtof(m), vol: 0.17 * swell, pan: 0.1, voices: 4, detune: 10, attack: 0.014, release: 0.08, cutoff: 1150, peak: 3800, decay: 0.18, res: 0.12, vib: 0.004 });
      tone(s, { t: T + bt * beat, dur: d * beat * 0.85, freq: mtof(m - 12), vol: 0.12 * swell, pan: -0.15, voices: 4, detune: 10, attack: 0.022, release: 0.1, cutoff: 800, peak: 2600, decay: 0.2, res: 0.12, vib: 0.004 });
      if (late) tone(s, { t: T + bt * beat, dur: d * beat * 0.85, freq: mtof(m + 7), vol: 0.05, pan: 0.45, voices: 3, detune: 8, attack: 0.025, release: 0.1, cutoff: 1200, peak: 3000, decay: 0.2 });
    }
    // Brass chord answers accent the two strong marching beats.
    for (const q of [0, 2]) for (const m of TRI[ch]) tone(s, { t: T + q * beat, dur: beat * 0.35, freq: mtof(m + 12), vol: 0.04, pan: -0.25, voices: 3, detune: 8, attack: 0.008, release: 0.07, cutoff: 1100, peak: 3000, decay: 0.12 });
    // harp-like arpeggio
    const arp = [0, 1, 2, 1, 2, 1, 0, 1];
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2 + beat / 4, dur: 0.4, freq: mtof(TRI[ch][arp[e]] + 24), vol: 0.035, pan: e % 2 ? 0.55 : -0.55, voices: 1, wave: 'tri', attack: 0.004, release: 0.5, cutoff: 900, peak: 4000, decay: 0.1 });
    // march percussion
    taiko(s, T, 0.8, 58); kick(s, T + beat * 2, 0.65); kick(s, T + beat * 1.5, 0.32); kick(s, T + beat * 3.5, 0.35);
    snare(s, T + beat, 0.38); snare(s, T + beat * 3, 0.42);
    for (const q of [0.75, 0.875, 2.75, 2.875]) snare(s, T + beat * q, 0.1);
    for (let h = 0; h < 8; h++) hat(s, T + h * beat / 2, h % 2 ? 0.075 : 0.04, h % 2 ? 0.4 : -0.4);
    if (b % 4 === 0 && b > 0) crash(s, T, 0.2);
    if (b === 7 || b === 15) { for (let r = 0; r < 8; r++) snare(s, T + beat * 3 + r * beat / 8, 0.12 + r * 0.04); taiko(s, T + beat * 3.5, 0.8, 55); }
  }
  reverb(s, 0.24); finish(s, 'frontier.wav', 1.5);
}
const riser = (s, t, dur, vol) => {
  const n = Math.floor(dur * SR), start = Math.round(t * SR); let prev = 0;
  for (let i = 0; i < n; i++) { const x = rnd(); const h = x - prev * 0.85; prev = x; s.put(start + i, h * vol * Math.pow(i / n, 2.2), (i / n - 0.5) * 0.6); }
};

// A shared martial rhythm; melodies, harmony and instrumentation remain specific to each theme.
function campaignPulse(s, T, beat, root, tri, barIndex, gallop = false) {
  for (let k = 0; k < 8; k++) {
    const t = T + k * beat / 2;
    tone(s, { t, dur: beat * 0.32, freq: mtof(root + (k % 4 === 3 ? 7 : 12)), vol: k % 2 ? 0.1 : 0.14, voices: 2, detune: 6, attack: 0.005, release: 0.045, cutoff: 350, peak: 1200, decay: 0.08 });
    hat(s, t, k % 2 ? 0.065 : 0.04, k % 2 ? 0.4 : -0.4);
    if (gallop && k % 2 === 0) tone(s, { t: t + beat * 0.375, dur: beat * 0.09, freq: mtof(root + 12), vol: 0.09, attack: 0.004, release: 0.025, cutoff: 700, peak: 1500, decay: 0.06 });
  }
  for (const q of [0, 2]) {
    taiko(s, T + q * beat, 0.62, 58);
    for (const m of tri.slice(0, 3)) tone(s, { t: T + q * beat, dur: beat * 0.32, freq: mtof(m + 12), vol: 0.045, pan: -0.2, voices: 3, detune: 8, attack: 0.01, release: 0.075, cutoff: 1000, peak: 3000, decay: 0.12 });
  }
  for (const q of [1, 3]) snare(s, T + q * beat, 0.38);
  for (const q of [0.875, 2.875, 3.75]) snare(s, T + q * beat, 0.1);
  if (barIndex % 8 === 7) for (let r = 0; r < 8; r++) snare(s, T + beat * 3 + r * beat / 8, 0.1 + r * 0.035);
}

function campaignBrass(s, T, beat, melody, vol = 0.11) {
  for (const [bt, d, m] of melody) for (const [octave, gain, pan] of [[0, 1, 0.15], [-12, 0.65, -0.2]])
    tone(s, { t: T + bt * beat, dur: d * beat * 0.76, freq: mtof(m + octave), vol: vol * gain, pan, voices: 3, detune: 9, attack: 0.014, release: 0.08, cutoff: 1000, peak: 3400, decay: 0.17, vib: 0.003 });
}

// ---------------- Dawn: 136 BPM, D major, 16 bars, triumphant brass and strings ----------------
function dawn() {
  const bpm = 136, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const C = { D: { tri: [50, 54, 57], root: 38 }, A: { tri: [45, 49, 52], root: 33 }, Bm: { tri: [47, 50, 54], root: 35 }, G: { tri: [43, 47, 50], root: 31 }, Em: { tri: [52, 55, 59], root: 40 } };
  const prog = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A', 'D', 'A', 'Bm', 'G', 'Em', 'G', 'A', 'A'];
  const mel = [
    [[0, 2, 78], [2, 1, 81], [3, 1, 78]], [[0, 2, 76], [2, 2, 73]], [[0, 2, 74], [2, 1, 78], [3, 1, 83]], [[0, 3, 81], [3, 1, 79]],
    [[0, 2, 78], [2, 1, 81], [3, 1, 86]], [[0, 2, 85], [2, 2, 81]], [[0, 2, 83], [2, 1, 79], [3, 1, 83]], [[0, 3, 85], [3, 1, 81]],
    [[0, 1, 86], [1, 1, 83], [2, 2, 81]], [[0, 2, 85], [2, 1, 81], [3, 1, 85]], [[0, 2, 86], [2, 1, 83], [3, 1, 78]], [[0, 2, 83], [2, 2, 79]],
    [[0, 2, 83], [2, 1, 79], [3, 1, 76]], [[0, 2, 86], [2, 2, 83]], [[0, 2, 85], [2, 1, 88], [3, 1, 85]], [[0, 4, 81]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, { tri, root } = C[prog[b]], late = b >= 8, swell = late ? 1.2 : 1;
    for (const [pan, det] of [[-0.7, 8], [-0.25, 12], [0.25, 10], [0.7, 14]]) for (const m of tri) tone(s, { t: T, dur: bar, freq: mtof(m + (pan > 0 ? 12 : 0)), vol: 0.04 * swell, pan, detune: det, voices: 3, attack: 0.12, release: 0.18, cutoff: 1700, res: 0.1, vib: 0.002, vibRate: 4.6 });
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.22, voices: 1, wave: 'sin', attack: 0.1, release: 0.4 });
    tone(s, { t: T + beat * 2, dur: beat * 2, freq: mtof(root + 7), vol: 0.1, voices: 1, wave: 'sin', attack: 0.05, release: 0.4 });
    for (const [bt, d, m] of mel[b]) {
      tone(s, { t: T + bt * beat, dur: d * beat * 0.97, freq: mtof(m - 12), vol: 0.14 * swell, pan: -0.15, voices: 4, detune: 9, attack: 0.02, release: 0.09, cutoff: 700, peak: 1800, decay: 0.6, res: 0.12, vib: 0.005, vibRate: 5 });
      tone(s, { t: T + bt * beat, dur: d * beat * 0.97, freq: mtof(m), vol: 0.07 * swell, pan: 0.2, voices: 3, detune: 7, attack: 0.02, release: 0.1, wave: 'tri', cutoff: 3500, vib: 0.006, vibRate: 5.4 });
      if (late) tone(s, { t: T + bt * beat, dur: d * beat * 0.97, freq: mtof(m - 5), vol: 0.07, pan: 0.45, voices: 3, detune: 9, attack: 0.025, release: 0.1, cutoff: 800, peak: 1500, decay: 0.6 });
    }
    campaignPulse(s, T, beat, root, tri, b);
    campaignBrass(s, T, beat, mel[b], late ? 0.12 : 0.1);
    // flowing sixteenth-note harp arpeggio
    const steps = 16, sd = bar / steps, order = [0, 1, 2, 1];
    for (let k = 0; k < steps; k++) tone(s, { t: T + k * sd, dur: 0.4, freq: mtof(tri[order[k % 4] ?? 0] + 24), vol: late ? 0.04 : 0.05, pan: k % 2 ? 0.5 : -0.5, voices: 1, wave: 'tri', attack: 0.004, release: 0.6, cutoff: 1000, peak: 4000, decay: 0.12 });
    taiko(s, T, 0.5, 54); if (late) { taiko(s, T + beat * 2, 0.35, 60); hat(s, T + beat * 3, 0.05, 0.3); }
    if (b % 4 === 0 && b > 0) crash(s, T, 0.14);
    if (b === 15) for (let r = 0; r < 6; r++) taiko(s, T + beat * 3 + r * beat / 6, 0.15 + r * 0.05, 58);
  }
  reverb(s, 0.24, 1.0); finish(s, 'dawn.wav', 1.4);
}

// ---------------- Drive: 156 BPM, A minor, 16 bars, charging synth and brass ----------------
function drive() {
  const bpm = 156, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const C = { Am: { tri: [57, 60, 64], root: 33 }, F: { tri: [53, 57, 60], root: 29 }, C: { tri: [48, 52, 55], root: 36 }, G: { tri: [55, 59, 62], root: 31 } };
  const prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am'];
  const lead = [
    [[0, 1.5, 81], [1.5, .5, 84], [2, 1, 88], [3, 1, 84]], [[0, 1, 84], [1, 1, 81], [2, 2, 77]],
    [[0, 1.5, 84], [1.5, .5, 88], [2, 1, 91], [3, 1, 88]], [[0, 1, 86], [1, 1, 83], [2, 2, 79]],
    [[0, 2, 81], [2, 2, 84]], [[0, 2, 84], [2, 2, 81]], [[0, 2, 83], [2, 2, 79]], [[0, 2, 81], [2, 1, 84], [3, 1, 88]],
    [[0, 1.5, 88], [1.5, .5, 84], [2, 1, 81], [3, 1, 84]], [[0, 1.5, 84], [1.5, .5, 81], [2, 2, 77]], [[0, 1, 84], [1, 1, 88], [2, 2, 91]], [[0, 1.5, 86], [1.5, .5, 83], [2, 2, 79]],
    [[0, 1.5, 88], [1.5, .5, 84], [2, 1, 81], [3, 1, 84]], [[0, 1, 89], [1, 1, 88], [2, 2, 84]], [[0, 1, 86], [1, 1, 83], [2, 1, 86], [3, 1, 91]], [[0, 2, 88], [2, 2, 81]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, { tri, root } = C[prog[b]], late = b >= 8, on = true;
    // four-on-the-floor kick, offbeat open hat, clap on 2 and 4, 16th hats
    for (let q = 0; q < 4; q++) boom(s, { t: T + q * beat, f0: 170, f1: 46, dur: 0.32, vol: 0.85, click: 0.4 });
    for (let h = 0; h < 16; h++) hat(s, T + h * beat / 4, h % 4 === 2 ? 0.1 : 0.04, h % 2 ? 0.45 : -0.45);
    if (on) { snare(s, T + beat, 0.32); snare(s, T + beat * 3, 0.36); }
    // rolling 16th bass, ducked on the kick by a short gate
    for (let k = 0; k < 16; k++) tone(s, { t: T + k * beat / 4, dur: beat / 4 * 0.75, freq: mtof(root + (k % 8 === 6 ? 12 : k % 4 === 3 ? 7 : 0)), vol: k % 4 === 0 ? 0.05 : 0.2, voices: 2, detune: 5, attack: 0.003, release: 0.03, cutoff: 200, peak: 1100, decay: 0.1, res: 0.35 });
    // offbeat supersaw chord stabs
    if (on) for (let q = 0; q < 4; q++) for (const m of tri) tone(s, { t: T + q * beat + beat / 2, dur: beat * 0.35, freq: mtof(m + 12), vol: 0.045, pan: q % 2 ? 0.35 : -0.35, voices: 5, detune: 22, attack: 0.004, release: 0.08, cutoff: 700, peak: 3200, decay: 0.12 });
    // 16th arpeggio
    const arp = [0, 1, 2, 1, 2, 1, 0, 1];
    for (let k = 0; k < 16; k++) tone(s, { t: T + k * beat / 4, dur: beat / 4 * 0.7, freq: mtof(tri[arp[k % 8] ?? 0] + 24), vol: late ? 0.045 : 0.035, pan: k % 2 ? 0.55 : -0.55, voices: 2, detune: 8, attack: 0.003, release: 0.05, cutoff: 900, peak: 3600, decay: 0.08, res: 0.25 });
    // Brass octaves make the charging lead audible from the first bar.
    campaignBrass(s, T, beat, lead[b], late ? 0.1 : 0.085);
    for (const q of [0.875, 2.875, 3.75]) snare(s, T + q * beat, 0.12);
    // lead
    for (const [bt, d, m] of lead[b]) tone(s, { t: T + bt * beat, dur: d * beat * 0.92, freq: mtof(m), vol: 0.1, pan: 0.05, voices: 5, detune: 16, attack: 0.01, release: 0.18, cutoff: 1200, peak: 4200, decay: 0.3, res: 0.2, vib: 0.003 });
    if (late) tone(s, { t: T, dur: bar, freq: mtof(root + 24), vol: 0.03, voices: 3, detune: 14, attack: 0.4, release: 0.6, cutoff: 1300 });
    if (b % 4 === 0 && b > 0) crash(s, T, 0.2);
    if (b === 7 || b === 15) { riser(s, T + beat * 2, beat * 2, 0.25); for (let r = 0; r < 8; r++) snare(s, T + beat * 3 + r * beat / 8, 0.15 + r * 0.04); }
  }
  reverb(s, 0.22, 0.9); finish(s, 'drive.wav', 1.5);
}
// ---------------- Wasteland: 144 BPM, E minor, 16 bars, galloping frontier cavalry ----------------
function wasteland() {
  const bpm = 144, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const C = { Em: { tri: [52, 55, 59], root: 40 }, C: { tri: [48, 52, 55], root: 36 }, D: { tri: [50, 54, 57], root: 38 }, G: { tri: [55, 59, 62], root: 31 }, Am: { tri: [45, 48, 52], root: 33 }, B: { tri: [47, 51, 54], root: 35 } };
  const prog = ['Em', 'Em', 'C', 'D', 'Em', 'G', 'Am', 'B', 'Em', 'C', 'G', 'D', 'Em', 'Am', 'B', 'Em'];
  const mel = [
    [[0, 2, 71], [2, 1, 74], [3, 1, 76]], [[0, 3, 79], [3, 1, 76]], [[0, 2, 76], [2, 2, 72]], [[0, 2, 74], [2, 1, 78], [3, 1, 74]],
    [[0, 1.5, 71], [1.5, .5, 74], [2, 2, 76]], [[0, 2, 79], [2, 1, 83], [3, 1, 79]], [[0, 2, 81], [2, 2, 76]], [[0, 3, 75], [3, 1, 78]],
    [[0, 2, 83], [2, 1, 79], [3, 1, 76]], [[0, 2, 79], [2, 2, 76]], [[0, 1, 74], [1, 1, 79], [2, 2, 83]], [[0, 2, 81], [2, 1, 78], [3, 1, 74]],
    [[0, 2, 76], [2, 1, 79], [3, 1, 83]], [[0, 3, 81], [3, 1, 79]], [[0, 2, 78], [2, 1, 75], [3, 1, 78]], [[0, 4, 76]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, { tri, root } = C[prog[b]], late = b >= 8;
    // desert drone and a thin, dark pad
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.22, voices: 1, wave: 'sin', attack: 0.2, release: 0.5 });
    if (b % 2 === 0) tone(s, { t: T, dur: bar * 2, freq: mtof(28), vol: 0.1, voices: 1, wave: 'sin', attack: 1.2, release: 1.2 });
    for (const m of tri) tone(s, { t: T, dur: bar, freq: mtof(m), vol: 0.03, pan: m % 2 ? 0.5 : -0.5, voices: 3, detune: 11, attack: 0.14, release: 0.2, cutoff: 650, res: 0.1 });
    // fingerpicked guitar: plucked saw with a fast filter decay
    const pick = [0, 2, 1, 2, 0, 2, 1, 2];
    for (let e = 0; e < 8; e++) tone(s, { t: T + e * beat / 2, dur: 0.3, freq: mtof(tri[pick[e]] + 12), vol: late ? 0.1 : 0.085, pan: -0.25 + (e % 2) * 0.1, voices: 1, attack: 0.003, release: 0.5, cutoff: 500, peak: 3200, decay: 0.09, res: 0.25 });
    // whistle-like lead, sparse
    for (const [bt, d, m] of mel[b]) {
      tone(s, { t: T + bt * beat, dur: d * beat * 0.95, freq: mtof(m), vol: 0.1, pan: 0.2, voices: 2, detune: 4, wave: 'tri', attack: 0.02, release: 0.12, cutoff: 3200, vib: 0.007, vibRate: 5.2 });
      tone(s, { t: T + bt * beat, dur: d * beat * 0.95, freq: mtof(m + 12), vol: 0.025, pan: 0.3, voices: 1, wave: 'sin', attack: 0.025, release: 0.14, vib: 0.007, vibRate: 5.2 });
    }
    campaignPulse(s, T, beat, root, tri, b, true);
    campaignBrass(s, T, beat, mel[b], late ? 0.12 : 0.1);
    // percussion: deep toms and brush
    taiko(s, T, 0.7, 48); if (b % 2) taiko(s, T + beat * 2, 0.4, 56);
    if (late) { noiseHit(s, { t: T + beat, dur: 0.22, vol: 0.12, hp: 0.4, lpHz: 6000, shape: 1.6 }); noiseHit(s, { t: T + beat * 3, dur: 0.22, vol: 0.12, hp: 0.4, lpHz: 6000, shape: 1.6 }); }
    else for (const q of [1, 3]) hat(s, T + q * beat, 0.07, q === 1 ? -0.3 : 0.3);
    if (b === 7 || b === 15) for (let r = 0; r < 4; r++) taiko(s, T + beat * 3 + r * beat / 4, 0.25 + r * 0.1, 50 + r * 3);
  }
  reverb(s, 0.23, 1.0); finish(s, 'wasteland.wav', 1.4);
}

// ---------------- Mist: 132 BPM, F major, 16 bars, a resolute advance through the mist ----------------
function mist() {
  const bpm = 132, beat = 60 / bpm, bar = beat * 4, bars = 16; const s = new Song(bar * bars);
  const C = { F: { tri: [53, 57, 60, 64], root: 29 }, Am: { tri: [57, 60, 64, 67], root: 33 }, Dm: { tri: [50, 53, 57, 60], root: 26 }, G: { tri: [55, 59, 62, 69], root: 31 }, Em: { tri: [52, 55, 59, 62], root: 40 } };
  const prog = ['F', 'Am', 'Dm', 'G', 'F', 'Am', 'Dm', 'Em', 'F', 'Am', 'Dm', 'G', 'Dm', 'Em', 'F', 'F'];
  const mel = [
    [[0.5, 1, 77], [2, 2, 81]], [[0.5, 1, 76], [2, 2, 72]], [[0.5, 1, 74], [2, 2, 77]], [[0.5, 1, 79], [2, 2, 83]],
    [[0.5, 1, 84], [2, 2, 81]], [[0.5, 1, 81], [2, 2, 76]], [[0.5, 1, 77], [2, 1, 74], [3, 1, 69]], [[0.5, 1, 79], [2, 2, 76]],
    [[0, 1, 81], [1, 1, 84], [2, 2, 88]], [[0, 1, 83], [1, 1, 81], [2, 2, 76]], [[0, 1, 77], [1, 1, 81], [2, 2, 86]], [[0, 2, 83], [2, 2, 79]],
    [[0.5, 1, 81], [2, 2, 77]], [[0.5, 1, 79], [2, 2, 83]], [[0, 2, 84], [2, 2, 81]], [[0, 4, 77]],
  ];
  for (let b = 0; b < bars; b++) {
    const T = b * bar, { tri, root } = C[prog[b]], late = b >= 8;
    for (const [pan, det] of [[-0.8, 9], [-0.3, 13], [0.3, 11], [0.8, 15]]) for (const m of tri) tone(s, { t: T, dur: bar, freq: mtof(m + (pan > 0 ? 12 : 0)), vol: 0.03 * (late ? 1.2 : 1), pan, detune: det, voices: 3, attack: 0.15, release: 0.22, cutoff: 1500, res: 0.1, vib: 0.002, vibRate: 3.8 });
    tone(s, { t: T, dur: bar, freq: mtof(root), vol: 0.2, voices: 1, wave: 'sin', attack: 0.025, release: 0.16 });
    // bell-like melody with a two-tap echo on the opposite side
    for (const [bt, d, m] of mel[b]) {
      for (const [k, delay, gain, pan] of [[0, 0, 1, -0.25], [1, beat * 0.5, 0.22, 0.6], [2, beat, 0.1, -0.6]]) {
        tone(s, { t: T + bt * beat + delay, dur: d * beat * 0.5, freq: mtof(m), vol: 0.085 * gain, pan, voices: 2, detune: 3, wave: 'tri', attack: 0.012, release: 0.2, cutoff: 3600, peak: 2400, decay: 0.4 });
        if (k === 0) tone(s, { t: T + bt * beat, dur: 0.3, freq: mtof(m + 12), vol: 0.02, pan: 0.15, voices: 1, wave: 'sin', attack: 0.005, release: 0.18 });
      }
    }
    campaignPulse(s, T, beat, root, tri, b);
    campaignBrass(s, T, beat, mel[b], late ? 0.14 : 0.12);
    const order = [0, 2, 1, 2];
    for (let k = 0; k < 16; k++) tone(s, { t: T + k * beat / 4, dur: beat * 0.16, freq: mtof(tri[order[k % 4]] + 12), vol: k % 4 ? 0.035 : 0.055, pan: k % 2 ? 0.35 : -0.35, voices: 2, detune: 6, attack: 0.005, release: 0.045, cutoff: 900, peak: 1800, decay: 0.07 });
    if (b % 2 === 0) taiko(s, T, 0.22, 46);
    if (late && b % 2 === 1) taiko(s, T + beat * 2, 0.14, 52);
  }
  reverb(s, 0.26, 1.1); finish(s, 'mist.wav', 1.3);
}

// Original rock pair: synthesized distorted power chords and backbeat.
function guitar(s, t, dur, midi, vol, pan, palm = false) {
  const frequency = mtof(midi),
    start = Math.round(t * SR);
  const length = Math.floor((dur + 0.045) * SR);
  let smooth = 0;
  for (let i = 0; i < length; i++) {
    const time = i / SR,
      phase = 2 * Math.PI * frequency * time;
    const string = Math.sin(phase) + 0.55 * Math.sin(phase * 2) + 0.31 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 5);
    const pick = rnd() * 0.09 * Math.exp(-time * 95);
    const distorted = Math.tanh((string + pick) * 3.2);
    smooth += 0.24 * (distorted - smooth);
    const decay = palm ? Math.exp(-time * 16) : Math.exp(-time * 2.8);
    const envelope = Math.min(1, time / 0.004) * Math.max(0, Math.min(1, (dur + 0.045 - time) / 0.045));
    s.put(start + i, smooth * decay * envelope * vol, pan);
  }
}
function rock(blue = false) {
  seed = blue ? 202610242 : 202610241;
  const bpm = blue ? 148 : 160,
    beat = 60 / bpm,
    bar = beat * 4;
  const song = new Song(bar * 16);
  const root = blue ? 40 : 38;
  const progression = blue ? [0, 3, -2, -5, 0, -2, 3, -5] : [0, -2, -4, -5, 0, -4, -2, -5];
  const melody = blue ? [76, 79, 83, 81, 79, 76, 74, 71] : [74, 77, 79, 81, 84, 81, 79, 77];
  for (let b = 0; b < 16; b++) {
    const time = b * bar,
      bass = root + progression[b % progression.length];
    // Two takes at the stereo edges, with a tiny offset and different voicing.
    for (let step = 0; step < 8; step++) {
      const length = step === 6 ? beat * 0.85 : beat * 0.31;
      const palm = step !== 0 && step !== 6;
      for (const [pan, delay] of [
        [-0.7, 0],
        [0.7, 0.007],
      ]) {
        for (const note of [bass + 12, bass + 19, bass + 24]) guitar(song, time + (step * beat) / 2 + delay, length, note, 0.16, pan, palm);
      }
      tone(song, { t: time + (step * beat) / 2, dur: beat * 0.4, freq: mtof(bass), vol: 0.21, voices: 1, wave: 'tri', attack: 0.006, release: 0.035, cutoff: 900 });
      hat(song, time + (step * beat) / 2, step % 2 ? 0.085 : 0.055, step % 2 ? 0.25 : -0.25);
    }
    for (const q of blue ? [0, 1.5, 2.5] : [0, 1.75, 2, 3.5]) kick(song, time + q * beat, 0.57);
    for (const q of [1, 3]) snare(song, time + q * beat, 0.46);
    if (b % 4 === 0) crash(song, time, 0.17);
    const motif = b < 8 ? melody : [...melody.slice(4), ...melody.slice(0, 4)];
    for (let n = 0; n < 4; n++) {
      const note = motif[(b * 2 + n) % motif.length] + (b === 15 && n > 1 ? -12 : 0);
      const t = time + n * beat;
      guitar(song, t, beat * (n === 3 ? 0.85 : 0.7), note, 0.13, blue ? -0.1 : 0.1);
      guitar(song, t + beat * 0.75, beat * 0.4, note, 0.035, blue ? 0.4 : -0.4);
    }
    if (b % 4 === 3) for (let n = 0; n < 4; n++) snare(song, time + (3 + n / 4) * beat, 0.08 + n * 0.025);
  }
  reverb(song, 0.12, 0.55);
  // Four milliseconds at each edge remove a sample step without an audible
  // gap; the opening kick retains its full body after the short attack.
  for (let i = 0; i < song.N; i++) {
    const gain = Math.sin(Math.PI / 2 * Math.min(1, i / (SR * .004), (song.N - 1 - i) / (SR * .004)));
    song.L[i] *= gain; song.R[i] *= gain;
  }
  finish(song, blue ? 'rock-blue.wav' : 'rock-red.wav', 1.45);
}

const renderers = { battle, frontier, dawn, drive, wasteland, mist, 'rock-red': () => rock(false), 'rock-blue': () => rock(true) };
const requested = new Set(process.argv.slice(2));
for (const name of requested) if (!Object.hasOwn(renderers, name)) throw new Error(`Unknown theme: ${name}`);
for (const [name, render] of Object.entries(renderers)) if (requested.size === 0 || requested.has(name)) render();
