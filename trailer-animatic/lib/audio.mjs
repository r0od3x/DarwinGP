// Temp audio for the animatic, fully synthesised (no samples): a music bed that follows the
// config's music sections, plus the sound cues of each shot. Writes a 48 kHz stereo WAV.
// It only has to make the pacing audible: kicks on the beat, whooshes into cuts, hits on impacts.
import { writeFileSync } from 'node:fs';

const SR = 48000;
// Am – F – C – G, one chord per bar.
const CHORDS = [
  { root: 55, pad: [220, 261.63, 329.63] },
  { root: 43.65, pad: [174.61, 220, 261.63] },
  { root: 65.41, pad: [261.63, 329.63, 392] },
  { root: 49, pad: [196, 246.94, 293.66] },
];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMix(seconds) {
  const n = Math.ceil(seconds * SR);
  return { n, L: new Float32Array(n), R: new Float32Array(n), rng: seeded(7) };
}

// Adds a voice: fn(t, k) returns a sample (mono, panned) for t seconds into the voice.
function voice(mix, t0, dur, fn, { gain = 1, pan = 0 } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR));
  const i1 = Math.min(mix.n, Math.round((t0 + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = i0; i < i1; i++) {
    const t = (i - Math.round(t0 * SR)) / SR;
    const v = fn(t, i - i0);
    mix.L[i] += v * gl;
    mix.R[i] += v * gr;
  }
}

const lp = fc => 1 - Math.exp(-2 * Math.PI * fc / SR);
const saw = phase => 2 * (phase % 1) - 1;

// ---------- Instruments ----------
function kick(mix, t0, gain = 0.9) {
  let ph = 0;
  voice(mix, t0, 0.4, t => {
    ph += (45 + 110 * Math.exp(-t * 28)) / SR;
    return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 8);
  }, { gain });
}

function hat(mix, t0, gain = 0.12, open = false) {
  let prev = 0;
  voice(mix, t0, open ? 0.25 : 0.06, t => {
    const x = mix.rng() * 2 - 1;
    const y = x - prev;
    prev = x;
    return y * Math.exp(-t * (open ? 14 : 70));
  }, { gain, pan: 0.25 });
}

function clap(mix, t0, gain = 0.35) {
  let y = 0;
  voice(mix, t0, 0.25, t => {
    const burst = [0, 0.011, 0.022].some(d => t >= d && t < d + 0.006) ? 1 : 0;
    y += lp(2200) * ((mix.rng() * 2 - 1) - y);
    return y * (burst + Math.exp(-(Math.max(0, t - 0.022)) * 22) * 0.8);
  }, { gain, pan: -0.15 });
}

function snare(mix, t0, gain = 0.3) {
  let y = 0;
  voice(mix, t0, 0.18, t => {
    y += lp(5000) * ((mix.rng() * 2 - 1) - y);
    return (y * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 26);
  }, { gain });
}

function bass(mix, t0, dur, freq, gain = 0.28) {
  let ph = 0;
  let y = 0;
  voice(mix, t0, dur, t => {
    ph += freq / SR;
    y += lp(420) * (saw(ph) - y);
    return y * Math.min(1, t / 0.005) * Math.exp(-t * 2.5) * Math.min(1, (dur - t) / 0.02);
  }, { gain });
}

function pad(mix, t0, dur, freqs, gain = 0.06, cutoff = 1100) {
  freqs.forEach((f, k) => {
    let p1 = k * 0.13;
    let p2 = k * 0.37;
    let y = 0;
    voice(mix, t0, dur, t => {
      p1 += f * 1.004 / SR;
      p2 += f * 0.996 / SR;
      y += lp(cutoff) * ((saw(p1) + saw(p2)) / 2 - y);
      return y * Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.4);
    }, { gain, pan: (k - 1) * 0.4 });
  });
}

function drone(mix, t0, dur, freq, gain = 0.12) {
  let ph = 0;
  let y = 0;
  voice(mix, t0, dur, t => {
    ph += freq / SR;
    y += lp(260) * (saw(ph) - y);
    return (y + Math.sin(2 * Math.PI * ph) * 0.6) * Math.min(1, t / 1) * Math.min(1, (dur - t) / 0.15);
  }, { gain });
}

function noiseSweep(mix, t0, dur, from, to, shape, gain, pan = 0) {
  let y = 0;
  voice(mix, t0, dur, t => {
    const u = t / dur;
    y += lp(from * (to / from) ** u) * ((mix.rng() * 2 - 1) - y);
    return y * shape(u);
  }, { gain, pan });
}

const SFX = {
  // F1 start light beep.
  beep: (mix, t) => voice(mix, t, 0.16, s => Math.sin(2 * Math.PI * 1000 * s) * Math.min(1, s / 0.003) * Math.min(1, (0.16 - s) / 0.01), { gain: 0.22 }),
  // Engine revs under the lights: pitch rising, with small blips.
  rev: (mix, t, dur = 4) => {
    let ph = 0;
    let y = 0;
    voice(mix, t, dur, s => {
      const u = s / dur;
      const f = 70 + 260 * u ** 1.6 + 25 * Math.sin(s * 7) * (1 - u);
      ph += f / SR;
      y += lp(900 + 2500 * u) * (saw(ph) - y);
      return y * (0.35 + 0.65 * u) * Math.min(1, (dur - s) / 0.03);
    }, { gain: 0.2 });
  },
  whoosh: (mix, t) => noiseSweep(mix, t - 0.35, 0.6, 300, 6000, u => Math.sin(Math.PI * u) ** 2, 0.5, 0.3),
  reverse: (mix, t) => noiseSweep(mix, t, 0.9, 200, 5000, u => u ** 3, 0.45),
  hit: (mix, t) => {
    kick(mix, t, 1.2);
    noiseSweep(mix, t, 0.5, 4000, 300, u => Math.exp(-u * 6), 0.5);
    let ph = 0;
    voice(mix, t, 1.2, s => { ph += 48 / SR; return Math.sin(2 * Math.PI * ph) * Math.exp(-s * 3); }, { gain: 0.5 });
  },
  boom: (mix, t) => {
    let ph = 0;
    voice(mix, t, 2, s => { ph += (38 + 30 * Math.exp(-s * 4)) / SR; return Math.sin(2 * Math.PI * ph) * Math.exp(-s * 1.8); }, { gain: 0.9 });
    noiseSweep(mix, t, 1.5, 1500, 150, u => Math.exp(-u * 4), 0.25);
  },
  slam: (mix, t) => {
    SFX.hit(mix, t);
    SFX.boom(mix, t);
    // Long metallic tail: decaying partials.
    [110, 164.8, 220, 277.2, 329.6].forEach((f, k) => voice(mix, t, 3.5, s => Math.sin(2 * Math.PI * f * s) * Math.exp(-s * (1.1 + k * 0.2)), { gain: 0.07, pan: (k - 2) * 0.3 }));
  },
  crash: (mix, t) => {
    kick(mix, t, 0.9);
    noiseSweep(mix, t, 0.7, 6000, 500, u => Math.exp(-u * 5), 0.6, -0.2);
  },
  screech: (mix, t) => {
    let ph = 0;
    voice(mix, t, 0.9, s => {
      ph += (1900 + 300 * Math.sin(s * 30) - 600 * s) / SR;
      return Math.sin(2 * Math.PI * ph) * (mix.rng() * 0.6 + 0.4) * Math.sin(Math.PI * s / 0.9);
    }, { gain: 0.09, pan: 0.2 });
  },
  gravel: (mix, t) => voice(mix, t, 1.2, s => (mix.rng() < 0.08 ? (mix.rng() * 2 - 1) : 0) * Math.sin(Math.PI * s / 1.2), { gain: 0.8, pan: -0.2 }),
  thud: (mix, t) => kick(mix, t, 1),
  tick: (mix, t) => voice(mix, t, 0.02, s => Math.sin(2 * Math.PI * 3200 * s) * Math.exp(-s * 300), { gain: 0.25 }),
  brake: (mix, t) => noiseSweep(mix, t, 0.5, 5000, 2500, u => Math.sin(Math.PI * u), 0.25),
  // Pass-by: engine note with a doppler drop.
  pass: (mix, t) => {
    let ph = 0;
    let y = 0;
    const dur = 0.9;
    voice(mix, t, dur, s => {
      const u = s / dur;
      ph += (340 - 140 / (1 + Math.exp(-(u - 0.5) * 12))) / SR;
      y += lp(2400) * (saw(ph) - y);
      return y * Math.sin(Math.PI * u);
    }, { gain: 0.2, pan: 0.3 });
  },
  wind: (mix, t, dur = 1.8) => noiseSweep(mix, t, dur, 400, 1800, u => Math.sin(Math.PI * u), 0.35),
  crowd: (mix, t, dur = 2) => noiseSweep(mix, t, dur, 900, 1200, u => Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin(u * 40)), 0.3),
  // Slowed-down engines for the photo finish: very low, falling.
  slow: (mix, t, dur = 4) => {
    let ph = 0;
    let y = 0;
    voice(mix, t, dur, s => {
      ph += (95 - 40 * s / dur) / SR;
      y += lp(500) * (saw(ph) - y);
      return y * Math.min(1, s / 0.3) * Math.min(1, (dur - s) / 0.5);
    }, { gain: 0.22 });
  },
};

// ---------- Music bed ----------
function musicSection(mix, section, beat) {
  for (let b = section.from; b < section.to; b++) {
    const t = b * beat;
    const inBar = b % 4;
    const chord = CHORDS[Math.floor(b / 4) % CHORDS.length];
    const p = section.pattern;
    if (p === 'intro') {
      if (b === section.from) drone(mix, t, (section.to - section.from) * beat - 0.05, 55, 0.14);
    } else if (p === 'pulse') {
      if (inBar % 2 === 0) kick(mix, t, 0.8);
      hat(mix, t + beat / 2, 0.05);
      if (inBar === 0) {
        bass(mix, t, beat * 4 - 0.02, chord.root, 0.22);
        pad(mix, t, beat * 4, chord.pad, 0.04, 700);
      }
    } else if (p === 'drive' || p === 'drive+') {
      const plus = p === 'drive+';
      kick(mix, t, 0.9);
      hat(mix, t + beat / 2, 0.1, true);
      for (const d of plus ? [0.25, 0.75] : []) hat(mix, t + beat * d, 0.07);
      if (plus && (inBar === 1 || inBar === 3)) clap(mix, t, 0.35);
      for (const half of [0, 0.5]) bass(mix, t + beat * half, beat / 2 - 0.01, chord.root * (plus && half ? 2 : 1), 0.26);
      if (inBar === 0) pad(mix, t, beat * 4, chord.pad, plus ? 0.05 : 0.04, plus ? 1600 : 1100);
    } else if (p === 'riser') {
      const u = (b - section.from) / (section.to - section.from);
      const hits = u < 0.5 ? 2 : 4;
      for (let k = 0; k < hits; k++) {
        kick(mix, t + beat * k / hits, 0.7 + 0.3 * u);
        snare(mix, t + beat * k / hits, 0.1 + 0.25 * u);
      }
      if (b === section.from) noiseSweep(mix, t, (section.to - section.from) * beat, 200, 9000, x => x ** 2, 0.4);
      bass(mix, t, beat - 0.01, 55, 0.22);
    } else if (p === 'slowmo') {
      if ((b - section.from) % 2 === 0) {
        kick(mix, t, 0.7);
        kick(mix, t + 0.18, 0.45);
      }
      if (b === section.from) drone(mix, t, (section.to - section.from) * beat, 41.2, 0.16);
    } else if (p === 'slam') {
      if (b === section.from) pad(mix, t, (section.to - section.from) * beat, [110, 164.8, 220, 261.6], 0.06, 900);
    } else if (p === 'outro') {
      if (inBar === 0) kick(mix, t, 0.6);
      if (b === section.from) pad(mix, t, (section.to - section.from) * beat, [220, 261.63, 329.63], 0.05, 800);
    }
  }
}

function writeWav(file, mix, peak = 0.89) {
  let max = 1e-9;
  for (let i = 0; i < mix.n; i++) {
    mix.L[i] = Math.tanh(mix.L[i]);
    mix.R[i] = Math.tanh(mix.R[i]);
    max = Math.max(max, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  }
  const k = peak / max;
  const data = Buffer.alloc(mix.n * 4);
  for (let i = 0; i < mix.n; i++) {
    data.writeInt16LE(Math.round(mix.L[i] * k * 32767), i * 4);
    data.writeInt16LE(Math.round(mix.R[i] * k * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
}

export function renderAudio(cfg, shots, file) {
  const beat = 60 / cfg.bpm;
  const total = shots.at(-1).end;
  const mix = createMix(total);
  for (const section of cfg.music) musicSection(mix, section, beat);
  for (const shot of shots) {
    for (const fx of shot.sfx ?? []) {
      const play = SFX[fx.type];
      if (!play) throw new Error(`shot ${shot.number}: unknown sound "${fx.type}"`);
      play(mix, shot.start + fx.at, fx.dur);
    }
  }
  // Fade out at the very end.
  const last = shots.at(-1);
  if (last.fadeOut) {
    const i0 = Math.round((total - 1.2) * SR);
    for (let i = Math.max(0, i0); i < mix.n; i++) {
      const g = 1 - (i - i0) / (mix.n - i0);
      mix.L[i] *= g;
      mix.R[i] *= g;
    }
  }
  writeWav(file, mix);
  return { seconds: total, sampleRate: SR };
}

export { SFX, SR };
