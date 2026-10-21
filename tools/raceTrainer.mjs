// Évolution des cerveaux du simulateur d'entraînement dans la physique de la course (RaceCar : adhérence
// limitée, sous-virage, tête-à-queue) sur Prairie GP. Même algorithme génétique que
// l'entraînement d'origine (src/ai/evolution.js : élitisme, tournoi, croisement,
// mutation). Score : distance parcourue en `seconds` secondes ; une voiture est éliminée si elle
// sort de la piste (vibreurs compris), part en tête-à-queue, s'arrête ou fait demi-tour.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { load } from '../tests/harness.mjs';

const STALL_FRAMES = 120;
const STALL_DISTANCE = 30;
const REVERSE = 150;

// Jeu de la course + algorithme génétique d'origine (src/ai/evolution.js), dans le même contexte.
export function createContext(evolution = new URL('../src/ai/evolution.js', import.meta.url)) {
  const ctx = load();
  vm.runInContext(readFileSync(evolution, 'utf8'), ctx.context, { filename: 'evolution.js' });
  ctx.Evolution = vm.runInContext('Evolution', ctx.context);
  return ctx;
}

// Une génération : toutes les voitures partent de la ligne, chacune seule (pas de contact).
export function runGeneration(ctx, track, brains, spec, seconds) {
  const { Track, NeuralRaceCar, Race } = ctx;
  const p = Track.pointAt(track, 0, 0);
  const t = Track.tangentAt(track, 0);
  const angle = Math.atan2(t.y, t.x);
  const race = { track, phase: 'race', frame: 0 };
  const cars = brains.map(brain => {
    const car = new NeuralRaceCar(p.x, p.y, angle, Race.TEAMS[0], { ...spec, brain: brain.toJSON() });
    car.brain = brain;
    // Pendant l'entraînement, pas d'aide pour revenir en piste : sortir élimine.
    car.needsRecovery = () => false;
    Object.assign(car, { alive: true, progress: 0, best: 0, checkpoint: 0, lastGain: 0, s: 0, index: Track.locate(track, car.pos).index });
    return car;
  });
  const half = track.width / 2 + Race.KERB;
  for (let frame = 0; frame < seconds * 60; frame++) {
    let alive = 0;
    for (const car of cars) {
      if (!car.alive) continue;
      const before = car.s;
      car.applyBehaviors(race);
      car.update();
      const loc = Track.locate(track, car.pos, car.index);
      car.progress += Track.gap(track, before, loc.s);
      car.s = loc.s;
      car.index = loc.index;
      car.best = Math.max(car.best, car.progress);
      if (car.best >= car.checkpoint + STALL_DISTANCE) {
        car.checkpoint = car.best;
        car.lastGain = frame;
      }
      const dead = Math.abs(loc.lateral) > half || car.spin > 0 || car.progress < car.best - REVERSE
        || frame - car.lastGain > STALL_FRAMES;
      if (dead) car.alive = false;
      else alive++;
    }
    if (!alive) break;
  }
  return cars.map(car => ({ brain: car.brain, fitness: Math.max(0, car.best) }));
}

// Évolution depuis une population (génération `generation`) ; garde le meilleur cerveau aux
// générations de snapshotAt. onGeneration(g, meilleurs tours, tours moyens) pour suivre.
export function evolve(ctx, { brains, generation, spec, generations, seconds = 45, mutationRate = 0.1, rng, snapshotAt = [], onGeneration }) {
  const track = ctx.Track.build();
  const snapshots = [];
  const wanted = new Set(snapshotAt);
  let population = brains;
  for (let g = generation; g < generation + generations; g++) {
    const scored = runGeneration(ctx, track, population, spec, seconds);
    const best = scored.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    const mean = scored.reduce((sum, x) => sum + x.fitness, 0) / scored.length;
    onGeneration?.(g, best.fitness / track.length, mean / track.length);
    if (wanted.has(g)) snapshots.push({ generation: g, brain: best.brain.copy(), laps: best.fitness / track.length });
    population = ctx.Evolution.nextGeneration(scored, brains.length, mutationRate, rng).brains;
  }
  return snapshots;
}
