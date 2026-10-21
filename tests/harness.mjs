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
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static dist(a, b) { return a.dist(b); }
}

const DRAWING = ['push', 'pop', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'circle', 'line',
  'triangle', 'translate', 'rotate', 'rect'];

// Même ordre que les balises <script> de index.html (sans l'interface).
export const FILES = ['src/core/vehicle.js', 'src/core/track.js', 'src/cars/raceCar.js', 'src/cars/aiCar.js',
  'src/cars/playerCar.js', 'src/race/smokePuff.js', 'src/ai/neuralNetwork.js', 'src/ai/trackSensors.js',
  'src/ai/neuralBrains.js', 'src/cars/neuralRaceCar.js', 'src/race/race.js', 'src/cars/gearbox.js',
  'src/audio/engineSound.js', 'src/render/trackPainter.js'];

export function load(files = FILES) {
  const draws = [];
  const stubs = Object.fromEntries(DRAWING.map(name => [name, (...args) => draws.push([name, ...args])]));
  const context = vm.createContext({ createVector: (x, y) => new Vector(x, y), p5: { Vector }, width: 1200, height: 800, ...stubs });
  const names = [];
  for (const file of files) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  const exported = ['Vehicle', 'Track', 'RaceCar', 'AICar', 'PlayerCar', 'SmokePuff', 'Race', 'Gearbox', 'EngineSound', 'TrackPainter',
    'NeuralNetwork', 'TrackSensors', 'NeuralBrains', 'NeuralRaceCar']
    .filter(name => vm.runInContext(`typeof ${name} !== 'undefined'`, context));
  names.push(...exported);
  return { draws, context, ...vm.runInContext(`({ ${names.join(', ')} })`, context) };
}

export function seededRng(seed = 42) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
