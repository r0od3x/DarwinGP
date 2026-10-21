import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans DOM ni p5.
export class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) {
    if (typeof x === 'object') return this.set(x.x, x.y);
    this.x = x; this.y = y; return this;
  }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
}

// Même ordre que les balises <script> de index.html (sans le dessin ni l'interface).
export const FILES = ['src/core/vehicle.js', 'src/core/track.js', 'src/ai/neuralNetwork.js', 'src/ai/evolution.js',
  'src/sim/trackSensors.js', 'src/sim/trackGenerator.js', 'src/sim/neuralCar.js', 'src/sim/trainer.js', 'src/app/saveFile.js'];

// Charge les fichiers du jeu dans un contexte isolé, comme les balises <script> de index.html.
export function load(files = FILES) {
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y), p5: { Vector }, width: 1200, height: 800 });
  for (const file of files) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  const names = ['Vehicle', 'Track', 'NeuralNetwork', 'TrackSensors', 'TrackGenerator', 'NeuralCar', 'Evolution', 'Trainer', 'SaveFile']
    .filter(name => vm.runInContext(`typeof ${name} !== 'undefined'`, context));
  return { context, ...vm.runInContext(`({ ${names.join(', ')} })`, context) };
}

export function seededRng(seed = 42) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
