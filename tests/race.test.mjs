import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng } from './harness.mjs';

test('grille : nombre de voitures, joueur à sa place, voitures en quinconce sur la piste et dans l\'axe', () => {
  const { Race, Track, PlayerCar, AICar } = load();
  const race = Race.create({ aiCount: 9, player: true, rng: seededRng() });
  assert.equal(race.cars.length, 10);
  assert.equal(race.cars[5], race.player);
  assert.ok(race.player instanceof PlayerCar);
  assert.equal(race.cars.filter(c => c instanceof AICar).length, 9);
  race.cars.forEach((car, i) => {
    const loc = Track.locate(race.track, car.pos);
    assert.ok(Math.abs(loc.lateral) < race.track.width / 2 - 10, `voiture ${i} sur la piste`);
    assert.equal(Math.sign(loc.lateral), i % 2 ? -1 : 1, 'quinconce');
    const t = Track.tangentAt(race.track, loc.s);
    assert.ok(Math.cos(car.angle) * t.x + Math.sin(car.angle) * t.y > 0.99, 'dans le sens de la course');
    if (i) assert.ok(Track.gap(race.track, race.cars[i - 1].s, car.s) < 0, 'derrière la précédente');
  });
  assert.equal(Race.create({ aiCount: 5, player: false }).player, null);
  // Voies de follow : 5 chemins fermés, tous dans la piste.
  const limit = race.track.width / 2 - 26;
  assert.equal(race.lanes.length, 5);
  for (const lane of race.lanes) {
    assert.equal(lane.closed, true);
    lane.points.forEach((p, i) => assert.ok(Math.abs(Track.locate(race.track, p, i).lateral) <= limit + 1));
  }
});

test('feux : cinq feux un par un, extinction après un délai, personne ne part avant', () => {
  const { Race } = load();
  const race = Race.create({ aiCount: 3, player: false, rng: () => 0.5 });
  const start = race.cars.map(c => ({ x: c.pos.x, y: c.pos.y }));
  let lit = 0;
  while (race.phase === 'grid' && race.frame < 1000) {
    Race.step(race);
    assert.ok(race.lightsOn >= lit || race.phase === 'race');
    lit = race.lightsOn;
  }
  assert.equal(race.phase, 'race');
  assert.equal(race.startFrame, Race.LIGHTS * Race.LIGHT_FRAMES + 20 + 30);
  race.cars.forEach((c, i) => assert.ok(Math.hypot(c.pos.x - start[i].x, c.pos.y - start[i].y) < 1, 'immobile aux feux'));
});

test('aspiration : dans le sillage d\'une voiture rapide (30 à 220 px, alignée)', () => {
  const { Race } = load();
  const race = Race.create({ aiCount: 2, player: false, rng: seededRng() });
  race.phase = 'race';
  const [a, b] = race.cars;
  a.angle = 0; a.pos.set(0, 0); a.vel.set(8, 0);
  b.angle = 0; b.pos.set(120, 4); b.vel.set(8, 0);
  Race.updateDrafting(race);
  assert.deepEqual([a.drafting, b.drafting], [true, false]);
  b.pos.set(120, 40);
  Race.updateDrafting(race);
  assert.equal(a.drafting, false, 'pas alignée');
  b.pos.set(300, 0);
  Race.updateDrafting(race);
  assert.equal(a.drafting, false, 'trop loin');
});

test('contacts : deux voitures qui se chevauchent sont écartées par des forces', () => {
  const { Race } = load();
  const race = Race.create({ aiCount: 2, player: false, rng: seededRng() });
  const [a, b] = race.cars;
  a.angle = 0; a.pos.set(0, 0); a.vel.set(0, 0);
  b.angle = 0; b.pos.set(0, 10); b.vel.set(0, 0);
  Race.collisions(race);
  assert.ok(a.acc.y < 0 && b.acc.y > 0, 'forces opposées');
  assert.ok(Math.abs(a.acc.y + b.acc.y) < 1e-9, 'action = réaction');
  a.update();
  b.update();
  assert.ok(b.pos.y - a.pos.y > 10);
});

test('course complète (1 tour, 5 IA, aléatoire fixé) : tout le monde finit, classement et chronos cohérents', () => {
  const { Race } = load();
  const race = Race.create({ laps: 1, aiCount: 5, player: false, rng: seededRng(11) });
  let offTrack = 0;
  let carFrames = 0;
  while (race.phase !== 'finished' && race.frame < 60 * 150) {
    Race.step(race);
    if (race.phase === 'race') {
      for (const car of race.cars) {
        carFrames++;
        if (car.surface !== 'asphalt') offTrack++;
      }
    }
  }
  assert.equal(race.phase, 'finished', `course finie en ${race.frame} images`);
  assert.equal(race.finishOrder.length, 5);
  for (const car of race.cars) {
    assert.ok([car.pos.x, car.pos.y, car.vel.x, car.vel.y, car.angle].every(Number.isFinite));
    assert.ok(car.bestLap > 20 && car.bestLap < 120, `tour en ${car.bestLap} s`);
  }
  assert.ok(offTrack / carFrames < 0.08, `${(offTrack / carFrames * 100).toFixed(1)} % hors piste`);
  const order = Race.standings(race);
  assert.deepEqual(order.map(c => c.team.driver), race.finishOrder.map(c => c.team.driver));
  for (let i = 1; i < race.finishOrder.length; i++) assert.ok(race.finishOrder[i].finishFrame >= race.finishOrder[i - 1].finishFrame);
  assert.ok(race.bestLap.time === Math.min(...race.cars.map(c => c.bestLap)));
  assert.match(race.feed.map(e => e.text).join('|'), /Drapeau à damier/);
});

test('classement en course : le plus avancé devant ; tour compté en passant la ligne', () => {
  const { Race } = load();
  const race = Race.create({ laps: 3, aiCount: 3, player: false, rng: seededRng() });
  race.phase = 'race';
  const L = race.track.length;
  const [a, b, c] = race.cars;
  Object.assign(a, { lap: 1, prevS: 500, s: 500 });
  Object.assign(b, { lap: 1, prevS: 900, s: 900 });
  Object.assign(c, { lap: 1, prevS: L - 10, s: 20 });
  Race.updateLaps(race);
  assert.equal(c.lap, 2, 'ligne franchie');
  assert.deepEqual([...Race.standings(race).map(car => car.team.driver)], [c, b, a].map(car => car.team.driver));
  // Recul sur la ligne : le tour est décompté.
  Object.assign(c, { prevS: 20, s: L - 10 });
  Race.updateLaps(race);
  assert.equal(c.lap, 1);
});
