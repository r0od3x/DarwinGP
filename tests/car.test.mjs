import test from 'node:test';
import assert from 'node:assert/strict';
import { load, near } from './harness.mjs';

// Voiture lancée vers +x ; applyForce espionné (toutes les forces doivent passer par lui).
function car(speed = 0) {
  const ctx = load();
  const c = new ctx.RaceCar(0, 0, 0);
  c.vel.set(speed, 0);
  c.forces = [];
  const apply = c.applyForce.bind(c);
  c.applyForce = f => { c.forces.push(f.copy()); apply(f); };
  return { c, ...ctx };
}

function run(c, frames, controls = {}) {
  for (let f = 0; f < frames; f++) {
    c.throttle = controls.throttle ?? 0;
    c.steer = controls.steer ?? 0;
    c.update();
  }
  return c;
}

test('monoplace : étend Vehicle, forces par applyForce, locomotion de Vehicle', () => {
  const { c, Vehicle, PlayerCar, AICar, SmokePuff } = car();
  assert.ok(c instanceof Vehicle);
  for (const C of [PlayerCar, AICar, SmokePuff]) assert.ok(C.prototype instanceof Vehicle);
  run(c, 1, { throttle: 1 });
  assert.ok(c.forces.length >= 2, 'moteur + adhérence au moins');
  assert.ok(c.pos.x > 0 && c.vel.x > 0, 'la position vient de l\'update fourni');
  assert.deepEqual([c.acc.x, c.acc.y], [0, 0], 'accélération remise à zéro par Vehicle.update');
});

test('moteur : 0-100 km/h en moins de 3 s, vitesse de pointe proche de topSpeed, jamais au-delà de maxSpeed', () => {
  const { c, RaceCar } = car();
  let frames = 0;
  while (c.vel.mag() * RaceCar.KMH < 100 && frames < 600) {
    run(c, 1, { throttle: 1 });
    frames++;
  }
  assert.ok(frames < 180, `${frames} images pour 100 km/h`);
  run(c, 3000, { throttle: 1 });
  const top = c.vel.mag();
  assert.ok(top > c.topSpeed * 0.92 && top <= c.maxSpeed + 1e-9, `pointe ${top}`);
  // Aspiration : moins de traînée, donc un peu plus vite.
  c.drafting = true;
  run(c, 1500, { throttle: 1 });
  assert.ok(c.vel.mag() > top);
});

test('freins : la voiture s\'arrête sans repartir en arrière ; plus long sur l\'herbe', () => {
  const asphalt = car(8).c;
  let frames = 0;
  while (asphalt.vel.mag() > 0.05 && frames < 1000) { run(asphalt, 1, { throttle: -1 }); frames++; }
  assert.ok(frames < 200, `${frames} images pour s'arrêter`);
  run(asphalt, 30, { throttle: -1 });
  assert.ok(asphalt.vel.mag() < 0.05 && asphalt.localVelocity().along > -1e-3, "pas de marche arrière");
  const grass = car(8).c;
  grass.surface = 'grass';
  let grassFrames = 0;
  while (grass.vel.mag() > 0.05 && grassFrames < 1000) { run(grass, 1, { throttle: -1 }); grassFrames++; }
  assert.ok(grassFrames > frames * 0.9, 'freinage moins efficace sans adhérence');
});

test('direction : braquage limité par la vitesse, rotation bornée par l\'adhérence (sous-virage)', () => {
  const slow = car(2).c;
  run(slow, 1, { steer: 1 });
  const slowYaw = slow.angle;
  const fast = car(9).c;
  run(fast, 1, { steer: 1 });
  assert.ok(fast.angle > 0 && slowYaw > 0, 'braquer à droite fait tourner dans le sens positif');
  assert.ok(fast.angle <= fast.grip * 1.15 / 9 + 0.12 * Math.PI / 2 + 1e-9, `lacet ${fast.angle}`);
  // À pleine vitesse, plein braquage pendant 2 s : la voiture élargit mais reste contrôlée.
  const held = car(9).c;
  run(held, 120, { steer: 1, throttle: 0.3 });
  assert.ok([held.pos.x, held.pos.y, held.vel.x, held.vel.y, held.angle].every(Number.isFinite));
  // Contre-braquage : la glisse est ramenée vers l'axe par l'adhérence latérale, limitée à grip.
  const sliding = car(6).c;
  sliding.vel.set(6, 2);
  run(sliding, 1, {});
  const lateral = sliding.forces.find(f => Math.abs(f.y) > 0 && Math.abs(f.x) < 1e-9);
  assert.ok(lateral && lateral.y < 0 && Math.abs(lateral.y) <= sliding.grip + 1e-9);
});

test('tête-à-queue : trop de glisse trop longtemps déclenche un spin, qui freine la voiture', () => {
  const { c } = car(9);
  c.vel.set(6, 6);
  for (let f = 0; f < 20 && c.spin === 0; f++) {
    c.vel.set(6, 6);
    run(c, 1, {});
  }
  assert.ok(c.spin > 0, 'spin déclenché');
  const speed = c.vel.mag();
  run(c, 30, { throttle: 1 });
  assert.ok(c.vel.mag() < speed, 'le spin freine même accélérateur enfoncé');
});

test('surfaces : herbe et gravier moins adhérents, plus de traînée, moins de moteur', () => {
  const { c } = car();
  const asphalt = c.surfaceFactors();
  c.surface = 'grass';
  const grass = c.surfaceFactors();
  c.surface = 'gravel';
  const gravel = c.surfaceFactors();
  assert.deepEqual({ ...asphalt }, { grip: 1, drag: 0, engine: 1 });
  assert.ok(gravel.grip < grass.grip && grass.grip < 1);
  assert.ok(gravel.drag > grass.drag && grass.drag > 0);
  // Pleine charge 3 s dans le gravier : bien moins vite que sur l'asphalte.
  const a = run(car().c, 180, { throttle: 1 }).vel.mag();
  const g = car().c;
  g.surface = 'gravel';
  assert.ok(run(g, 180, { throttle: 1 }).vel.mag() < a * 0.75);
});

test('boîte de vitesses : rapports croissants, régime borné, chute du régime au passage', () => {
  const { Gearbox } = load();
  assert.deepEqual({ ...Gearbox.state(0) }, { gear: 0, rpm: Gearbox.IDLE });
  let last = 0;
  for (let v = 0.1; v <= 10.5; v += 0.05) {
    const { gear, rpm } = Gearbox.state(v, 9.5);
    assert.ok(gear >= last && gear >= 1 && gear <= 8);
    assert.ok(rpm >= Gearbox.IDLE && rpm <= Gearbox.MAX_RPM);
    last = gear;
  }
  assert.equal(Gearbox.state(9.5, 9.5).gear, 8);
  const top3 = Gearbox.TOPS[2] * 9.5;
  const before = Gearbox.state(top3 - 1e-6, 9.5);
  const after = Gearbox.state(top3 + 1e-3, 9.5);
  assert.deepEqual([before.gear, after.gear], [3, 4]);
  assert.ok(after.rpm < before.rpm - 1500, 'le régime retombe au rapport supérieur');
  assert.equal(Gearbox.rpmRatio(Gearbox.IDLE), 0);
  assert.equal(Gearbox.rpmRatio(Gearbox.MAX_RPM), 1);
});

test('son du moteur : rien sans activation ; fréquence = régime du V6, plus fort sous les gaz', () => {
  const { EngineSound, Gearbox } = load();
  assert.ok(near(EngineSound.frequency(12000), 600));
  const idle = EngineSound.voice(Gearbox.IDLE, 0);
  const full = EngineSound.voice(Gearbox.MAX_RPM, 1);
  assert.ok(full.gain > idle.gain && full.cutoff > idle.cutoff && full.frequency > idle.frequency);
  assert.ok(full.gain <= EngineSound.VOLUME + 1e-12);
  // Faux AudioContext : compte les contextes et les réglages reçus.
  const log = { contexts: 0, targets: [] };
  const param = () => ({ value: 0, setTargetAtTime(v) { log.targets.push(v); } });
  class FakeContext {
    constructor() { log.contexts++; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: param(), connect() {} }; }
    createBiquadFilter() { return { type: '', Q: param(), frequency: param(), connect() {} }; }
    createOscillator() { return { type: '', frequency: param(), connect() {}, start() {} }; }
  }
  const sound = EngineSound.create(FakeContext);
  assert.equal(sound.update(9000, 1), null, 'coupé : rien');
  assert.equal(log.contexts, 0, 'pas de contexte audio avant le geste de l\'utilisateur');
  assert.equal(sound.setEnabled(true), true);
  const v = sound.update(9000, 1);
  assert.equal(log.contexts, 1);
  assert.ok(log.targets.includes(v.frequency) && log.targets.includes(v.frequency / 2));
  sound.setEnabled(false);
  assert.equal(log.targets.at(-1), 0, 'coupé : volume ramené à zéro');
  assert.equal(EngineSound.create(undefined).setEnabled(true), false, 'sans Web Audio : désactivé');
});
