import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, seededRng } from './harness.mjs';

const game = load();
const { Vehicle, Track, NeuralNetwork, TrackSensors, TrackGenerator, NeuralCar, Evolution, Trainer, SaveFile } = game;
const track = Track.build();
const sensors = TrackSensors.build(track);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// Les objets créés dans le contexte du jeu ont d'autres prototypes : on compare leur contenu.
const plain = value => JSON.parse(JSON.stringify(value));
const settingsWith = changes => ({ ...Trainer.initialSettings(), ...changes });

// ---------- Réseau de neurones ----------
test('réseau : architecture validée, sorties entre -1 et 1, déterministe avec un hasard fixé', () => {
  for (const sizes of [[], [3], [3, 0, 2], [3, 1.5], 'abc']) assert.throws(() => new NeuralNetwork(sizes), { name: 'RangeError' });
  const a = new NeuralNetwork([4, 6, 5, 2], seededRng(1));
  const b = new NeuralNetwork([4, 6, 5, 2], seededRng(1));
  const out = a.predict([0.1, 0.5, 1, 0]);
  assert.equal(out.length, 2);
  assert.ok(out.every(v => v > -1 && v < 1));
  assert.deepEqual(plain(out), plain(b.predict([0.1, 0.5, 1, 0])));
  assert.deepEqual(plain(a.layers([0.1, 0.5, 1, 0]).map(l => l.length)), [4, 6, 5, 2]);
  assert.throws(() => a.predict([1, 2]), { name: 'RangeError' });
  assert.equal(a.weights[0].length, 4 * 6);
  assert.equal(a.biases[2].length, 2);
});

test('réseau : copie indépendante, croisement gène par gène, mutation selon le taux', () => {
  const a = new NeuralNetwork([3, 4, 2], seededRng(1));
  const b = new NeuralNetwork([3, 4, 2], seededRng(2));
  const copy = a.copy();
  copy.weights[0][0] += 1;
  assert.notEqual(copy.weights[0][0], a.weights[0][0]);
  const child = a.crossover(b, seededRng(3));
  let fromA = 0; let fromB = 0;
  child.weights.forEach((w, l) => w.forEach((v, k) => {
    assert.ok(v === a.weights[l][k] || v === b.weights[l][k]);
    if (v === a.weights[l][k]) fromA++; else fromB++;
  }));
  assert.ok(fromA > 0 && fromB > 0, 'les deux parents transmettent des poids');
  assert.throws(() => a.crossover(new NeuralNetwork([3, 5, 2])), { name: 'RangeError' });
  const still = a.copy().mutate(0, 0.5, seededRng(4));
  assert.deepEqual(still.toJSON(), a.toJSON());
  const shaken = a.copy().mutate(1, 0.5, seededRng(4));
  shaken.weights.forEach((w, l) => w.forEach((v, k) => assert.notEqual(v, a.weights[l][k])));
});

test('réseau : JSON aller-retour identique, poids incompatibles refusés', () => {
  const net = new NeuralNetwork([5, 3, 3, 2], seededRng(9));
  const back = NeuralNetwork.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
  assert.deepEqual(back.predict([1, 0, 0.3, 0.2, 0.9]), net.predict([1, 0, 0.3, 0.2, 0.9]));
  const broken = net.toJSON();
  broken.weights[0] = broken.weights[0].slice(1);
  assert.throws(() => NeuralNetwork.fromJSON(broken), { name: 'RangeError' });
});

// ---------- Rayons de détection ----------
test('rayons : angles répartis sur l\'ouverture, un seul rayon droit devant, 360° sans doublon', () => {
  assert.deepEqual(plain(TrackSensors.rayAngles(1, Math.PI)), [0]);
  const three = TrackSensors.rayAngles(3, Math.PI);
  assert.ok(near(three[0], -Math.PI / 2) && near(three[1], 0) && near(three[2], Math.PI / 2));
  const round = TrackSensors.rayAngles(4, Math.PI * 2);
  assert.ok(near(round[0], -Math.PI) && near(round[2], 0) && near(round[3], Math.PI / 2));
  assert.deepEqual(Trainer.rayAngles(settingsWith({ rays: 3, spread: 180 })).map(a => a.toFixed(6)),
    three.map(a => a.toFixed(6)));
});

test('rayons : segment touché ou manqué, bords de piste à une demi-largeur au départ', () => {
  const s = { ax: 10, ay: -5, bx: 10, by: 5 };
  assert.equal(TrackSensors.hitSegment(0, 0, 1, 0, s), 10);
  assert.equal(TrackSensors.hitSegment(0, 0, -1, 0, s), Infinity);
  assert.equal(TrackSensors.hitSegment(0, 20, 1, 0, s), Infinity);
  const pose = Trainer.startPose(track);
  const half = track.width / 2;
  for (const side of [-1, 1]) {
    const d = TrackSensors.cast(sensors, pose.x, pose.y, pose.angle + side * Math.PI / 2, 400);
    assert.ok(Math.abs(d - half) < 1, `bord à ${d.toFixed(2)} px`);
  }
  assert.equal(TrackSensors.cast(sensors, pose.x, pose.y, pose.angle, 250), 250, 'ligne droite : rien en vue');
});

test('rayons : la grille donne le même résultat qu\'un test de tous les segments', () => {
  const rng = seededRng(5);
  const brute = (x, y, angle, length) => Math.min(length, ...sensors.segments.map(s =>
    TrackSensors.hitSegment(x, y, Math.cos(angle), Math.sin(angle), s)));
  for (let k = 0; k < 300; k++) {
    const p = Track.pointAt(track, rng() * track.length, (rng() * 2 - 1) * (track.width / 2 - 2));
    const angle = rng() * Math.PI * 2;
    const length = 50 + rng() * 550;
    assert.ok(near(TrackSensors.cast(sensors, p.x, p.y, angle, length), brute(p.x, p.y, angle, length), 1e-6));
  }
});

test('rayons : les points repliés du bord intérieur des virages serrés sont retirés', () => {
  const half = track.width / 2;
  const kept = [-1, 1].map(side => TrackSensors.edgePoints(track, side));
  assert.ok(kept.some(points => points.length < track.n), 'des points sont retirés');
  for (const points of kept) {
    for (const p of points) {
      assert.ok(Track.locate(track, p).distance >= half - 1, 'aucun bord gardé sur la piste');
    }
  }
});

// ---------- Voiture ----------
function carAtStart(brain = new NeuralNetwork([8, 8, 2], seededRng(1)), changes = {}) {
  const pose = Trainer.startPose(track);
  const car = new NeuralCar(pose.x, pose.y, pose.angle, brain, settingsWith(changes));
  car.placeOnTrack(track);
  return { car, pose };
}

test('voiture : étend Vehicle, perçoit rayons + vitesse entre 0 et 1', () => {
  const { car } = carAtStart();
  assert.ok(car instanceof Vehicle);
  const inputs = car.sense(sensors, Trainer.rayAngles(Trainer.initialSettings()), 250);
  assert.equal(inputs.length, 8);
  assert.ok(inputs.every(v => v >= 0 && v <= 1));
  assert.equal(inputs[3], 1, 'rayon central : rien droit devant');
  assert.equal(inputs[7], 0, 'vitesse nulle au départ');
  assert.equal(car.rays.length, 7);
});

test('voiture : sorties -> vitesse désirée, steering de Reynolds borné par maxForce', () => {
  const { car, pose } = carAtStart(undefined, { maxSpeed: 8, maxForce: 100 });
  const straight = car.steer([0, 1]);
  assert.ok(near(straight.x, Math.cos(pose.angle) * 8, 1e-9) && near(straight.y, Math.sin(pose.angle) * 8, 1e-9));
  const right = car.steer([1, 1]);
  const turned = Math.atan2(right.y, right.x) - pose.angle;
  assert.ok(near(turned, car.steerRange, 1e-9), 'sortie 1 : virage à droite de steerRange');
  car.vel.set(Math.cos(pose.angle) * 4, Math.sin(pose.angle) * 4);
  const stop = car.steer([0, -1]);
  assert.ok(near(stop.x, -car.vel.x) && near(stop.y, -car.vel.y), 'sortie -1 : désirée nulle, force = -vitesse');
  assert.equal(car.throttle, -1);
  car.maxForce = 0.2;
  assert.ok(near(car.steer([0.7, 0.4]).mag(), 0.2));
  car.applyBehaviors(sensors, Trainer.rayAngles(Trainer.initialSettings()), 250);
  assert.deepEqual([car.acc.x, car.acc.y], [car.steering.x, car.steering.y]);
});

test('voiture : progression le long de la piste, élimination hors piste, arrêt ou demi-tour', () => {
  const { car, pose } = carAtStart();
  car.vel.set(Math.cos(pose.angle) * 5, Math.sin(pose.angle) * 5);
  for (let i = 0; i < 20; i++) { car.update(); assert.ok(car.followTrack(track)); }
  // Progression mesurée sur les points de la ligne médiane, espacés de track.step px.
  assert.ok(near(car.progress, 100, track.step) && car.alive && near(car.fitness(), car.progress));

  const off = carAtStart().car;
  off.pos.x += track.normals[0].x * (track.width / 2 + 2);
  off.pos.y += track.normals[0].y * (track.width / 2 + 2);
  assert.equal(off.followTrack(track), false);
  assert.deepEqual([off.alive, off.death, off.vel.mag()], [false, 'sortie de piste', 0]);

  const parked = carAtStart().car;
  for (let i = 0; i < NeuralCar.STALL_FRAMES; i++) { parked.update(); parked.followTrack(track); }
  assert.equal(parked.alive, true, 'encore dans le délai');
  parked.update(); parked.followTrack(track);
  assert.deepEqual([parked.alive, parked.death], [false, 'arrêt']);

  const back = carAtStart().car;
  back.vel.set(-Math.cos(pose.angle) * 5, -Math.sin(pose.angle) * 5);
  for (let i = 0; i < 40 && back.alive; i++) { back.update(); back.followTrack(track); }
  assert.deepEqual([back.alive, back.death, back.fitness()], [false, 'demi-tour', 0]);
});

// ---------- Algorithme génétique ----------
test('génétique : architecture, élites recopiées, enfants mutés, taille demandée', () => {
  assert.deepEqual(plain(Evolution.architecture(settingsWith({ rays: 5, hiddenLayers: 3, hiddenSize: 12 }))), [6, 12, 12, 12, 2]);
  assert.deepEqual([10, 50, 200].map(Evolution.eliteCount), [1, 3, 10]);
  const rng = seededRng(3);
  const scored = Array.from({ length: 20 }, (_, i) => ({ brain: new NeuralNetwork([3, 4, 2], rng), fitness: i * 10 }));
  const { brains, elites } = Evolution.nextGeneration(scored, 30, 0.1, rng);
  assert.equal(brains.length, 30);
  assert.equal(elites, 2);
  assert.deepEqual(brains[0].toJSON(), scored[19].brain.toJSON(), 'le meilleur est gardé tel quel');
  assert.notEqual(brains[0], scored[19].brain, 'copie, pas le même objet');
  assert.deepEqual(brains[1].toJSON(), scored[18].brain.toJSON());
  assert.ok(brains.every(b => b.sizes.join() === '3,4,2'));
  assert.throws(() => Evolution.nextGeneration([], 10, 0.1), { name: 'RangeError' });
});

test('génétique : le tournoi garde le meilleur des candidats tirés', () => {
  const scored = [0, 5, 3, 9].map(fitness => ({ brain: { fitness }, fitness }));
  const picks = [0, 0.3, 0.6];
  let k = 0;
  assert.equal(Evolution.tournament(scored, () => picks[k++]).fitness, 5);
  assert.equal(Evolution.tournament(scored, () => 0.99).fitness, 9);
});

// ---------- Circuits aléatoires ----------
test('circuits : même graine = même circuit, graines différentes = circuits différents, null = Prairie GP', () => {
  const a = TrackGenerator.circuit(12345);
  const b = TrackGenerator.circuit(12345);
  assert.equal(a.seed, 12345);
  assert.deepEqual(plain(a.track.points), plain(b.track.points));
  assert.notDeepEqual(plain(TrackGenerator.circuit(54321).track.points), plain(a.track.points));
  const prairie = TrackGenerator.circuit(null);
  assert.equal(prairie, TrackGenerator.circuit(null), 'Prairie GP construit une seule fois');
  assert.deepEqual([prairie.seed, prairie.name, prairie.track.length], [null, 'Prairie GP', track.length]);
});

test('circuits : générés valables, dans la zone, départ en ligne droite avec la piste des deux côtés', () => {
  const { CENTER, RADII } = TrackGenerator;
  for (let seed = 1; seed <= 12; seed++) {
    const c = TrackGenerator.circuit(seed * 7919);
    assert.equal(c.seed, seed * 7919, 'pas de repli sur Prairie GP');
    assert.equal(TrackGenerator.problem(c.track), null);
    for (const p of c.track.points) {
      assert.ok(Math.abs(p.x - CENTER.x) <= RADII.x + 150 && Math.abs(p.y - CENTER.y) <= RADII.y + 150);
    }
    const pose = Trainer.startPose(c.track);
    for (const side of [-1, 1]) {
      const d = TrackSensors.cast(c.sensors, pose.x, pose.y, pose.angle + side * Math.PI / 2, 400);
      assert.ok(Math.abs(d - c.track.width / 2) < 1, `circuit ${c.seed} : bord à ${d.toFixed(1)} px`);
    }
  }
});

test('circuits : refus motivés (virage trop serré, portions trop proches, départ dans un virage)', () => {
  const problem = control => TrackGenerator.problem(Track.build(control));
  assert.equal(problem([[1000, 1000], [1060, 1000], [1060, 1060], [1000, 1060]]), 'virage trop serré');
  assert.equal(problem([[800, 600], [2500, 600], [2500, 1400], [1800, 1400], [1800, 900], [1500, 900], [1500, 1400],
    [800, 1400]]), 'portions trop proches');
  assert.equal(problem([[500, 900], [1000, 500], [1500, 940], [2000, 500], [2500, 900], [2000, 1300], [1500, 1060],
    [1000, 1300]]), 'départ dans un virage');
  assert.equal(problem([[800, 600], [2500, 600], [2500, 1400], [800, 1400]]), null);
});

// ---------- Entraînement ----------
test('réglages : valeurs initiales dans les bornes, valeurs invalides refusées, architecture verrouillée', () => {
  const settings = Trainer.initialSettings();
  for (const [name, range] of Object.entries(Trainer.SETTINGS)) {
    assert.ok(settings[name] >= range.min && settings[name] <= range.max, name);
  }
  for (const [name, value] of [['rays', 0], ['rays', 16], ['rays', 2.5], ['maxSpeed', 0.5], ['maxForce', 2],
    ['hiddenLayers', 5], ['population', 5], ['mutationRate', -0.1], ['nope', 1]]) {
    assert.throws(() => Trainer.setSetting(settings, name, value), { name: 'RangeError' }, `${name} = ${value}`);
  }
  const trainer = Trainer.create(settings, seededRng(1));
  assert.throws(() => Trainer.setSetting(settings, 'rays', 9, trainer), /verrouillé/);
  assert.throws(() => Trainer.setSetting(settings, 'hiddenSize', 9, trainer), /verrouillé/);
  Trainer.setSetting(settings, 'maxSpeed', 12, trainer);
  Trainer.setSetting(settings, 'maxForce', 0.5, trainer);
  assert.ok(trainer.cars.every(car => car.maxSpeed === 12 && car.maxForce === 0.5), 'appliqué tout de suite');
  Trainer.setSetting(settings, 'spread', 90, trainer);
  assert.equal(trainer.settings.spread, 90);
});

function finishGeneration(trainer) {
  for (const car of trainer.cars) car.eliminate('test');
  assert.equal(Trainer.step(trainer), true);
}

test('entraînement : population au départ, fin de génération, historique, taille suivante', () => {
  const settings = settingsWith({ population: 20, generationTime: 10 });
  const trainer = Trainer.create(settings, seededRng(2));
  const pose = Trainer.startPose(trainer.track);
  assert.equal(trainer.cars.length, 20);
  assert.ok(trainer.cars.every(c => c.alive && c.pos.x === pose.x && c.pos.y === pose.y));
  assert.equal(trainer.generation, 1);
  Trainer.setSetting(settings, 'population', 30, trainer);
  const length = trainer.track.length;
  let frames = 0;
  while (!Trainer.step(trainer)) frames++;
  assert.ok(frames < 10 * 60, 'fin au plus tard à la durée max');
  assert.equal(trainer.generation, 2);
  assert.equal(trainer.cars.length, 30, 'nouvelle taille à la génération suivante');
  assert.ok(trainer.cars.slice(0, trainer.elites).every(c => c.elite));
  const [h] = trainer.history;
  assert.ok(h.best >= h.mean && h.best > 0);
  assert.ok(near(h.laps, h.best / length) && near(h.meanLaps, h.mean / length), 'tours du circuit couru');
  assert.ok(Number.isFinite(h.test) && h.test >= 0);
  assert.deepEqual([trainer.champion.score, trainer.champion.generation], [h.test, 1]);
});

test('entraînement : 1re génération sur Prairie GP, puis un nouveau circuit à chaque génération', () => {
  const trainer = Trainer.create(settingsWith({ population: 10 }), seededRng(3));
  assert.equal(trainer.randomTracks, true, 'activé par défaut');
  assert.equal(trainer.circuit.seed, null);
  const seen = [];
  for (let g = 0; g < 3; g++) {
    finishGeneration(trainer);
    assert.notEqual(trainer.circuit.seed, null);
    assert.ok(!seen.includes(trainer.circuit.seed), 'un circuit différent à chaque génération');
    seen.push(trainer.circuit.seed);
    assert.equal(trainer.sensors, trainer.circuit.sensors);
    const pose = Trainer.startPose(trainer.track);
    assert.ok(trainer.cars.every(c => c.pos.x === pose.x && c.pos.y === pose.y && c.index !== null));
  }
  assert.deepEqual(plain(trainer.history.map(h => h.track)), [null, seen[0], seen[1]], 'circuit noté dans l\'historique');
  Trainer.setRandomTracks(trainer, false);
  finishGeneration(trainer);
  assert.equal(trainer.circuit.seed, seen[2], 'désactivé : le même circuit');
});

test('entraînement : génération arrêtée quand toutes les voitures sont éliminées, tête = plus loin', () => {
  const trainer = Trainer.create(settingsWith({ population: 10 }), seededRng(3));
  trainer.cars.forEach((car, i) => { car.bestProgress = i * 10; });
  assert.equal(Trainer.leader(trainer), trainer.cars[9]);
  trainer.cars[9].eliminate('test');
  assert.equal(Trainer.leader(trainer), trainer.cars[8], 'parmi les voitures en course');
  finishGeneration(trainer);
  assert.equal(trainer.generation, 2);
});

test('test : circuits fixes jamais tirés pour l\'entraînement, conduite déterministe, score = moyenne', () => {
  const settings = Trainer.initialSettings();
  const circuits = Trainer.tests();
  assert.deepEqual(plain(circuits.map(c => c.seed)), plain(Trainer.TEST_SEEDS));
  assert.equal(Trainer.tests(), circuits, 'construits une seule fois');
  const brain = new NeuralNetwork(Evolution.architecture(settings), seededRng(8));
  const laps = circuits.map(c => Trainer.drive(brain, settings, c));
  assert.deepEqual(laps, circuits.map(c => Trainer.drive(brain, settings, c)), 'même cerveau, même résultat');
  assert.ok(laps.every(l => l >= 0));
  assert.ok(near(Trainer.testScore(brain, settings), laps.reduce((a, b) => a + b) / laps.length));
});

test('champion : meilleur score de test, pas meilleure distance sur le circuit de la génération', () => {
  const trainer = Trainer.create(settingsWith({ population: 10 }), seededRng(4));
  trainer.cars.forEach((car, i) => { car.bestProgress = 100 + i; });
  const best = trainer.cars[9].brain;
  trainer.champion = { brain: trainer.cars[0].brain, score: 999, generation: 0 };
  finishGeneration(trainer);
  assert.equal(trainer.champion.score, 999, 'garde le champion si la nouvelle voiture fait moins bien en test');
  assert.equal(trainer.history[0].test, Trainer.testScore(best, trainer.settings), 'la meilleure voiture est testée');
  trainer.champion.score = -1;
  trainer.cars.forEach((car, i) => { car.bestProgress = 100 + i; });
  const next = trainer.cars[9].brain;
  finishGeneration(trainer);
  assert.equal(trainer.champion.generation, 2);
  assert.deepEqual(trainer.champion.brain.toJSON(), next.toJSON());
  assert.notEqual(trainer.champion.brain, next, 'copie du cerveau');
});

test('entraînement : champion seul, sans évolution, sur un nouveau circuit, puis retour à la population', () => {
  const trainer = Trainer.create(settingsWith({ population: 10, generationTime: 10 }), seededRng(4));
  assert.equal(Trainer.setChampionOnly(trainer, true), false, 'pas de champion avant la 1re génération');
  finishGeneration(trainer);
  const population = trainer.brains;
  assert.equal(Trainer.setChampionOnly(trainer, true), true);
  assert.equal(trainer.cars.length, 1);
  assert.deepEqual(trainer.cars[0].brain.toJSON(), trainer.champion.brain.toJSON());
  const before = trainer.circuit.seed;
  finishGeneration(trainer);
  assert.deepEqual([trainer.generation, trainer.history.length, trainer.cars.length], [2, 1, 1], 'pas d\'évolution');
  assert.notEqual(trainer.circuit.seed, before, 'le champion découvre un autre circuit');
  Trainer.setChampionOnly(trainer, false);
  assert.equal(trainer.brains, population);
  assert.equal(trainer.cars.length, 10);
});

test('sauvegarde : aller-retour JSON, reprise à la même génération, mêmes cerveaux, même circuit', () => {
  const settings = settingsWith({ population: 10, generationTime: 10, rays: 5, hiddenLayers: 2, hiddenSize: 6 });
  const trainer = Trainer.create(settings, seededRng(5));
  while (trainer.generation < 3) Trainer.step(trainer);
  Trainer.setRandomTracks(trainer, false);
  Trainer.setChampionOnly(trainer, true);
  const data = JSON.parse(JSON.stringify(Trainer.serialize(trainer, 'mon essai')));
  assert.deepEqual([data.format, data.version, data.name, data.generation], ['darwin-gp', 2, 'mon essai', 3]);
  assert.equal(Trainer.deserialize({ ...data, format: 'neuro-racing' }).saved.generation, 3, 'ancien nom du projet accepté');
  assert.deepEqual([data.trackSeed, data.randomTracks], [trainer.circuit.seed, false]);
  assert.equal(data.population.length, 10, 'la population est sauvée, même en champion seul');
  const loaded = Trainer.deserialize(data);
  assert.deepEqual(plain(loaded.settings), plain(settings));
  const resumed = Trainer.create(loaded.settings, seededRng(6), loaded.saved);
  assert.deepEqual([resumed.generation, resumed.history.length, resumed.champion.score, resumed.randomTracks],
    [3, 2, trainer.champion.score, false]);
  assert.deepEqual(plain(resumed.history), plain(trainer.history));
  assert.equal(resumed.circuit.seed, trainer.circuit.seed);
  assert.deepEqual(plain(resumed.track.points), plain(trainer.track.points), 'le même circuit est reconstruit');
  const inputs = [1, 0.5, 0.2, 0.9, 0.1, 0.4];
  resumed.brains.forEach((brain, i) => assert.deepEqual(brain.predict(inputs), trainer.populationBrains[i].predict(inputs)));
  while (resumed.generation < 4) Trainer.step(resumed);
  assert.equal(resumed.history.at(-1).generation, 3, 'la numérotation continue');
});

test('sauvegarde : un fichier de la version 1 (Prairie GP seul, sans test) se recharge', () => {
  const trainer = Trainer.create(settingsWith({ population: 10 }), seededRng(9));
  finishGeneration(trainer);
  const v2 = JSON.parse(JSON.stringify(Trainer.serialize(trainer, 'ancien')));
  const best = trainer.history[0].best;
  const v1 = {
    ...v2, version: 1, randomTracks: undefined, trackSeed: undefined,
    champion: { brain: v2.champion.brain, fitness: best, generation: 1 },
    history: [{ generation: 1, best, mean: trainer.history[0].mean }],
  };
  const loaded = Trainer.deserialize(JSON.parse(JSON.stringify(v1)));
  assert.equal(loaded.saved.trackSeed, null);
  assert.ok(near(loaded.saved.history[0].laps, best / track.length), 'tours de Prairie GP');
  const resumed = Trainer.create(loaded.settings, seededRng(1), loaded.saved);
  assert.equal(resumed.circuit.seed, null);
  assert.equal(resumed.champion.score, Trainer.testScore(resumed.champion.brain, loaded.settings), 'champion testé');
});

test('sauvegarde : fichiers invalides refusés avec un message clair', () => {
  const trainer = Trainer.create(settingsWith({ population: 10 }), seededRng(7));
  const good = JSON.parse(JSON.stringify(Trainer.serialize(trainer, 'x')));
  assert.throws(() => Trainer.deserialize({ hello: 1 }), /pas une sauvegarde/);
  assert.throws(() => Trainer.deserialize({ ...good, version: 99 }), /Version/);
  assert.throws(() => Trainer.deserialize({ ...good, population: [] }), /aucune voiture/);
  assert.throws(() => Trainer.deserialize({ ...good, settings: { ...good.settings, rays: 3 } }), /ne correspondent pas/);
  assert.throws(() => Trainer.deserialize({ ...good, settings: { ...good.settings, maxSpeed: 99 } }), { name: 'RangeError' });
});

test('sauvegarde : nom de fichier valide, modifiable, toujours en .json', () => {
  assert.equal(SaveFile.fileName('mon entraînement'), 'mon entraînement.json');
  assert.equal(SaveFile.fileName('essai.json'), 'essai.json');
  assert.equal(SaveFile.fileName('a/b:c*?'), 'a-b-c-.json');
  assert.equal(SaveFile.fileName('  '), 'entrainement.json');
  assert.equal(SaveFile.fileName(null), 'entrainement.json');
  assert.equal(SaveFile.fileName('...'), 'entrainement.json');
});

test('page : curseurs HTML synchronisés avec les réglages, architecture marquée verrouillable', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [name, range] of Object.entries(Trainer.SETTINGS)) {
    const input = html.match(new RegExp(`<input id="set-${name}"[^>]*>`))?.[0];
    assert.ok(input, `curseur set-${name}`);
    const attr = key => Number(input.match(new RegExp(`${key}="([^"]+)"`))[1]);
    assert.deepEqual([attr('min'), attr('max'), attr('step'), attr('value')], [range.min, range.max, range.step, range.initial], name);
    assert.equal(input.includes('data-topology'), Boolean(range.topology), `${name} verrouillable`);
  }
});


test('apprentissage sur Prairie GP seul : en quelques générations, la meilleure voiture va nettement plus loin', () => {
  const trainer = Trainer.create(settingsWith({ population: 30, generationTime: 20 }), seededRng(11));
  Trainer.setRandomTracks(trainer, false);
  while (trainer.generation <= 12) Trainer.step(trainer);
  const first = trainer.history[0].best;
  const best = Math.max(...trainer.history.map(h => h.best));
  assert.ok(best > first * 1.5, `génération 1 : ${first | 0} px, meilleure : ${best | 0} px`);
  assert.ok(best > track.length * 0.8, 'presque un tour en 20 s');
});

test('apprentissage sur circuits aléatoires : le champion progresse sur les circuits de test', () => {
  const trainer = Trainer.create(settingsWith({ population: 30, generationTime: 20 }), seededRng(11));
  while (trainer.generation <= 12) Trainer.step(trainer);
  const first = trainer.history[0].test;
  assert.ok(new Set(trainer.history.map(h => h.track)).size === 12, 'un circuit par génération');
  assert.ok(trainer.champion.score > first * 1.5 && trainer.champion.score > 0.5,
    `test génération 1 : ${first.toFixed(2)} tour, champion : ${trainer.champion.score.toFixed(2)} tour`);
});

test('génération 1 en coulisses : jouée à pleine vitesse, par tranches de temps, puis la course commence à la 2', () => {
  const trainer = Trainer.create(settingsWith({ population: 10, generationTime: 10 }), seededRng(21));
  assert.equal(Trainer.backstage(trainer), true);
  let clock = 0;
  const tick = () => (clock += 1);
  assert.equal(Trainer.runBackstage(trainer, 5, tick), false, 'budget épuisé : on rendra la main à la page');
  assert.ok(trainer.frame > 0 && trainer.generation === 1);
  while (!Trainer.runBackstage(trainer, 50, tick));
  assert.equal(trainer.generation, 2);
  assert.equal(Trainer.backstage(trainer), false);
  assert.equal(trainer.history.length, 1, "la génération 1 compte dans l'historique et le champion");
  assert.ok(trainer.champion);
  const frame = trainer.frame;
  assert.equal(Trainer.runBackstage(trainer, 50, tick), true);
  assert.equal(trainer.frame, frame, 'rien à faire ensuite');
  const solo = Trainer.create(settingsWith({ population: 10 }), seededRng(2));
  solo.championOnly = true;
  assert.equal(Trainer.backstage(solo), false, 'champion seul : rien en coulisses');
});
