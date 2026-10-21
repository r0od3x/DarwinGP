import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRng } from './harness.mjs';

// Mini-course : deux IA sur la piste, phase « race » commencée depuis longtemps.
function setup(rngValue = null) {
  const ctx = load();
  const rng = rngValue === null ? seededRng(3) : () => rngValue;
  const race = ctx.Race.create({ aiCount: 2, player: false, rng });
  Object.assign(race, { phase: 'race', frame: 1000, startFrame: 100 });
  const [me, other] = race.cars;
  return { ...ctx, race, me, other, rng };
}

// Place une voiture à l'abscisse s, sur la trajectoire de course + lane px, lancée à speed.
function place(Track, race, car, s, speed, lane = 0) {
  const track = race.track;
  const lateral = Track.sample(track, track.offsets, s) + lane;
  const p = Track.pointAt(track, s, lateral);
  const t = Track.tangentAt(track, s);
  car.pos.set(p.x, p.y);
  car.vel.set(t.x * speed, t.y * speed);
  car.angle = Math.atan2(t.y, t.x);
  const loc = Track.locate(track, car.pos);
  Object.assign(car, { index: loc.index, s: loc.s, lateral: loc.lateral, spin: 0, recover: 0 });
}

test('perception : voiture devant sur la même voie, voiture derrière, voies différentes ignorées', () => {
  const { Track, race, me, other } = setup();
  place(Track, race, me, 1000, 6);
  place(Track, race, other, 1100, 6);
  me.perceive(race);
  assert.equal(me.ahead.car, other);
  assert.ok(Math.abs(me.ahead.gap - 100) <= race.track.step);
  assert.equal(me.behind, null);
  // Juste derrière (moins de 90 px) : « derrière ».
  place(Track, race, other, 1060, 6);
  other.perceive(race);
  assert.equal(other.behind.car, me);
  // Trop loin devant, ou sur une autre voie : pas de voiture « devant ».
  place(Track, race, other, 1300, 6);
  me.perceive(race);
  assert.equal(me.ahead, null);
  place(Track, race, other, 1100, 6, 40);
  me.perceive(race);
  assert.equal(me.ahead, null);
});

test('perception : une voiture arrêtée devant est un danger, sauf juste après le départ', () => {
  const { Track, race, me, other } = setup();
  place(Track, race, me, 1000, 6);
  place(Track, race, other, 1250, 0.2);
  me.perceive(race);
  assert.equal(me.hazards.length, 1);
  assert.ok(me.hazards[0].gap > 200 && me.hazards[0].r > 0);
  // Au départ, tout le monde est lent : pas de danger.
  race.frame = race.startFrame + 100;
  me.perceive(race);
  assert.equal(me.hazards.length, 0);
  // Une voiture en tête-à-queue est toujours un danger.
  other.spin = 30;
  me.perceive(race);
  assert.equal(me.hazards.length, 1);
});

test('décision : évitement du côté libre, tête-à-queue puis relance', () => {
  const { Track, race, me, other } = setup();
  place(Track, race, me, 1000, 6);
  place(Track, race, other, 1200, 0, 10);
  other.spin = 40;
  me.perceive(race);
  me.decide(race);
  assert.equal(me.mode, 'évite');
  assert.equal(Math.sign(me.laneTarget), -Math.sign(me.hazards[0].lane || 1), 'voie de l\'autre côté');
  assert.equal(me.passingLane(-5), 2);
  assert.equal(me.passingLane(5), -2);
  me.spin = 10;
  me.decide(race);
  assert.equal(me.mode, 'tête-à-queue');
  me.spin = 0;
  me.hazards = [];
  me.decide(race);
  assert.equal(me.mode, 'relance');
  for (let f = 0; f < 130; f++) me.decide(race);
  assert.notEqual(me.mode, 'relance');
});

test('décision : dépassement seulement plus rapide et selon la personnalité (aléatoire fixé)', () => {
  for (const [value, expected] of [[0, 'dépassement'], [0.999, 'course']]) {
    const { Track, race, me, other } = setup(value);
    me.aggression = 0.2;
    place(Track, race, me, 200, 8);
    place(Track, race, other, 290, 2);
    me.perceive(race);
    me.decide(race);
    assert.equal(me.mode, expected, `aléatoire ${value}`);
    if (expected === 'dépassement') {
      assert.equal(me.overtaking, other);
      assert.equal(me.laneTarget, me.passingLane(me.ahead.lane));
    } else {
      assert.equal(me.laneTarget, 0, 'reste sur la trajectoire');
    }
  }
  // Pas plus rapide : pas de dépassement même avec l'aléatoire favorable.
  const { Track, race, me, other } = setup(0);
  place(Track, race, me, 200, 3);
  place(Track, race, other, 290, 20);
  me.perceive(race);
  me.decide(race);
  assert.notEqual(me.mode, 'dépassement');
});

test('vitesse visée : profil anticipé, derrière une voiture plus lente, hors piste, arrivée, grille', () => {
  const { Track, race, me, other } = setup(0.5);
  me.consistency = 1;
  place(Track, race, me, 200, 6);
  place(Track, race, other, 3000, 6);
  me.perceive(race);
  me.decide(race);
  const free = me.computeTargetSpeed(race);
  let min = Infinity;
  for (let d = 0; d <= Math.max(60, 60); d += race.track.step) min = Math.min(min, Track.sample(race.track, me.profile, 200 + d));
  assert.ok(free <= Track.sample(race.track, me.profile, 200) + 1e-9 && free > 0);
  assert.ok(Math.abs(free - min) < 1e-9 || free <= min);
  // Derrière une voiture plus lente, proche et sur la même voie : on se cale sur elle.
  place(Track, race, other, 240, 3);
  me.perceive(race);
  me.decide(race);
  if (me.mode !== 'dépassement') assert.ok(me.computeTargetSpeed(race) <= 3 - 0.15 + 1e-9);
  me.surface = 'gravel';
  assert.ok(me.computeTargetSpeed(race) <= 3);
  me.surface = 'asphalt';
  me.finished = true;
  assert.ok(me.computeTargetSpeed(race) <= 3);
  race.phase = 'grid';
  assert.equal(me.computeTargetSpeed(race), 0);
});

test('profil personnel : un pilote moins habile est partout plus lent ou égal', () => {
  const { race, AICar, Race } = setup();
  const slot = Race.gridSlot(race.track, 0);
  const good = new AICar(slot.x, slot.y, slot.angle, Race.TEAMS[0], { skill: 1 });
  const bad = new AICar(slot.x, slot.y, slot.angle, Race.TEAMS[1], { skill: 0.6 });
  good.prepare(race.track);
  bad.prepare(race.track);
  assert.ok(bad.profile.every((v, i) => v <= good.profile[i] + 1e-9));
  assert.ok(bad.profile.some((v, i) => v < good.profile[i] - 0.1));
});

test('steering : somme pondérée de Vehicle (follow, separate, avoid, wander), commandes bornées', () => {
  const { Track, race, me, other } = setup();
  place(Track, race, me, 1000, 6, 20);
  place(Track, race, other, 1030, 6, 0);
  me.applyBehaviors(race);
  assert.deepEqual(Object.keys(me.forces).sort(), ['avoid', 'follow', 'separate', 'wander']);
  assert.ok(me.forces.separate.mag() > 0, 'voiture proche : séparation');
  assert.ok(me.steer >= -1 && me.steer <= 1 && me.throttle >= -1 && me.throttle <= 1);
  // Sorti de la piste : la force de retour vise l'intérieur.
  place(Track, race, me, 1000, 4, race.track.width / 2 + 30);
  const back = me.stayOnTrack(race.track);
  const n = race.track.normals[me.index];
  assert.ok(back.x * n.x + back.y * n.y < 0, 'vers l\'axe de la piste');
  place(Track, race, me, 1000, 4, 0);
  assert.equal(me.stayOnTrack(race.track).mag(), 0);
});
