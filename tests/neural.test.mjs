import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng } from './harness.mjs';

const ctx = load();
const { Race, Track, NeuralRaceCar, NeuralBrains, NeuralNetwork, RaceCar, Vehicle, AICar } = ctx;
const last = NeuralBrains[NeuralBrains.length - 1];

// Une voiture génétique posée à l'abscisse s (décalage lateral), lancée à speed, dans une course en cours.
function placed(spec, s, speed, lateral = 0, angleOffset = 0) {
  const race = Race.create({ aiCount: 1, player: false, rng: seededRng() });
  Object.assign(race, { phase: 'race', frame: 1000, startFrame: 100 });
  const p = Track.pointAt(race.track, s, lateral);
  const t = Track.tangentAt(race.track, s);
  const angle = Math.atan2(t.y, t.x) + angleOffset;
  const car = new NeuralRaceCar(p.x, p.y, angle, Race.neuralTeam(spec, 0), spec);
  car.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
  race.cars = [car];
  return { race, car };
}

test('cerveaux : générations distinctes, réseaux compatibles avec leurs rayons, couleurs', () => {
  assert.ok(NeuralBrains.length >= 4);
  const ids = NeuralBrains.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(NeuralBrains.every((b, i) => i === 0 || b.generation > NeuralBrains[i - 1].generation), 'triées par génération');
  for (const spec of NeuralBrains) {
    const brain = NeuralNetwork.fromJSON(spec.brain);
    assert.equal(brain.inputCount, spec.settings.rays + 1, spec.id);
    assert.equal(brain.outputCount, 2, spec.id);
    assert.match(spec.color, /^#[0-9a-f]{6}$/i);
  }
  // L'évolution dans la physique de la course a servi : la dernière génération va plus loin
  // que la population sauvegardée telle quelle.
  const raw = NeuralBrains.find(b => b.kind === 'sauvegarde');
  assert.ok(last.trainingLaps > raw.trainingLaps * 2, `${raw.trainingLaps} -> ${last.trainingLaps} tour`);
});

test('pilote génétique : étend RaceCar (donc Vehicle) ; entrées = rayons + vitesse, entre 0 et 1', () => {
  assert.ok(NeuralRaceCar.prototype instanceof RaceCar && NeuralRaceCar.prototype instanceof Vehicle);
  const { race, car } = placed(last, 300, 5);
  const inputs = car.sense(race.track);
  assert.equal(inputs.length, last.settings.rays + 1);
  assert.ok(inputs.every(v => v >= 0 && v <= 1.0001));
  assert.ok(Math.abs(inputs.at(-1) - 5 / last.settings.maxSpeed) < 1e-9);
  // Sur une ligne droite, au milieu, le rayon central voit loin.
  assert.ok(Math.max(...inputs.slice(0, -1)) > 0.5);
});

test('décision : virage borné à ±90° autour du cap, vitesse entre 0 et la vitesse d\'entraînement', () => {
  for (const spec of NeuralBrains) {
    const { race, car } = placed(spec, 2000, 6, 10);
    car.think(race.track);
    let d = car.desiredHeading - car.headingAngle();
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    assert.ok(Math.abs(d) <= Math.PI / 2 + 1e-9, spec.id);
    assert.ok(car.targetSpeed >= 0 && car.targetSpeed <= spec.settings.maxSpeed + 1e-9, spec.id);
    car.applyBehaviors(race);
    assert.equal(car.mode, 'réseau');
    assert.ok(Math.abs(car.steer) <= 1 && Math.abs(car.throttle) <= 1);
  }
});

test('hors piste ou à contresens : retour vers la piste, puis le réseau reprend', () => {
  const off = placed(last, 1200, 4, Track.WIDTH / 2 + 40);
  off.car.applyBehaviors(off.race);
  assert.equal(off.car.mode, 'retour piste');
  assert.ok(off.car.targetSpeed <= off.car.recoverSpeed);
  // Le cap visé ramène vers l'axe : composante sur la normale négative (on est du côté +n).
  const n = off.race.track.normals[off.car.index];
  assert.ok(Math.cos(off.car.desiredHeading) * n.x + Math.sin(off.car.desiredHeading) * n.y < 0);
  const back = placed(last, 1200, 3, 0, Math.PI);
  back.car.applyBehaviors(back.race);
  assert.equal(back.car.mode, 'retour piste', 'contresens');
  const ok = placed(last, 1200, 3, 0);
  ok.car.applyBehaviors(ok.race);
  assert.equal(ok.car.mode, 'réseau');
});

test('avant le départ : rien ; locomotion : forces par applyForce et update de Vehicle', () => {
  const { race, car } = placed(last, 300, 0);
  race.phase = 'grid';
  car.applyBehaviors(race);
  assert.deepEqual([car.mode, car.throttle, car.steer], ['grille', 0, 0]);
  race.phase = 'race';
  let forces = 0;
  const apply = car.applyForce.bind(car);
  car.applyForce = f => { forces++; apply(f); };
  car.applyBehaviors(race);
  car.update();
  assert.ok(forces >= 2);
  assert.deepEqual([car.acc.x, car.acc.y], [0, 0]);
});

test('grille : générations réparties parmi les IA, les autres gardent le steering', () => {
  assert.deepEqual([...Race.neuralSlots(9, 3)], [1, 4, 7]);
  assert.deepEqual([...Race.neuralSlots(4, 9)], [0, 1, 2, 3]);
  const neural = NeuralBrains.slice(0, 4);
  const race = Race.create({ aiCount: 9, player: true, rng: seededRng(), neural });
  const genetic = race.cars.filter(c => c.isNeural);
  assert.equal(genetic.length, 4);
  assert.equal(race.cars.filter(c => c instanceof AICar).length, 5);
  assert.deepEqual(genetic.map(c => c.generation), neural.map(s => s.generation));
  assert.deepEqual(genetic.map(c => c.team.code), neural.map(s => `G${s.generation}`));
  assert.ok(genetic.every((c, k) => c.team.colors[0] === neural[k].color));
  // Les écuries des pilotes à steering restent dans l'ordre habituel.
  assert.equal(race.cars.find(c => c instanceof AICar).team.name, Race.TEAMS[0].name);
  // Sans génétiques : même grille qu'avant.
  const plain = Race.create({ aiCount: 9, player: true, rng: seededRng() });
  assert.equal(plain.cars.filter(c => c.isNeural).length, 0);
});

test('course mixte (1 tour) : steering et générations roulent ensemble, tout reste fini, la course se termine', () => {
  const neural = NeuralBrains;
  const race = Race.create({ laps: 1, aiCount: 9, player: false, rng: seededRng(5), neural: neural.slice(-3) });
  const start = new Map(race.cars.map(c => [c, c.progress]));
  while (race.phase !== 'finished' && race.frame < 60 * 200) Race.step(race);
  assert.equal(race.phase, 'finished');
  for (const car of race.cars) {
    assert.ok([car.pos.x, car.pos.y, car.vel.x, car.vel.y].every(Number.isFinite), car.team.driver);
    assert.ok(car.progress - start.get(car) > race.track.length * 0.5, `${car.team.driver} a roulé`);
  }
  // La meilleure génération boucle le tour.
  const best = race.cars.find(c => c.isNeural && c.generation === last.generation);
  assert.ok(best.finished, 'dernière génération à l\'arrivée');
});

test('bloqué (le réseau dit « arrêt » au mauvais endroit) : relance, puis le réseau reprend', () => {
  const { race, car } = placed(last, 1500, 0, 30);
  // Réseau qui demande toujours de s'arrêter : la voiture n'avance plus.
  car.brain = { predict: () => [1, -1] };
  car.progress = 1500;
  let rescued = false;
  for (let f = 0; f < NeuralRaceCar.STALL_FRAMES + 5; f++) {
    race.frame++;
    car.applyBehaviors(race);
    car.update();
    if (car.mode === 'relance') rescued = true;
  }
  assert.ok(rescued, 'relance déclenchée');
  assert.ok(car.targetSpeed > 0 && car.targetSpeed <= car.recoverSpeed);
  for (let f = 0; f < NeuralRaceCar.RESCUE_FRAMES; f++) {
    race.frame++;
    car.applyBehaviors(race);
    car.update();
  }
  assert.equal(car.mode, 'réseau', 'le réseau reprend la main');
});
