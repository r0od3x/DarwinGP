// Gestion de la course (aucun steering ici) : grille de départ, feux, aspiration, surfaces,
// contacts entre voitures, tours et chronos, classement, traces de pneus et fumée.
// Chaque voiture calcule ses commandes (applyBehaviors) puis sa locomotion (update).
const Race = (() => {
  const TEAMS = [
    { name: 'Scuderia Rosso', driver: 'Rossi', number: 16, colors: ['#d50000', '#ffd600'] },
    { name: 'Argent Flèche', driver: 'Wolf', number: 44, colors: ['#b0bec5', '#00bfa5'] },
    { name: 'Taureau Bleu', driver: 'Verstap', number: 1, colors: ['#1a237e', '#ff1744'] },
    { name: 'Papaye Racing', driver: 'Norris', number: 4, colors: ['#ff6d00', '#2979ff'] },
    { name: 'Vert Émeraude', driver: 'Alonsa', number: 14, colors: ['#00695c', '#c6ff00'] },
    { name: 'Alpine Rose', driver: 'Gasly', number: 10, colors: ['#ec407a', '#1565c0'] },
    { name: 'Haas & Cie', driver: 'Hulk', number: 27, colors: ['#eceff1', '#c62828'] },
    { name: 'Williams Bleu', driver: 'Albon', number: 23, colors: ['#0d47a1', '#4fc3f7'] },
    { name: 'Sauber Vert', driver: 'Bottas', number: 77, colors: ['#1b5e20', '#000000'] },
    { name: 'Visa Cash', driver: 'Tsunoda', number: 22, colors: ['#283593', '#ffffff'] },
  ];
  const PLAYER_TEAM = { name: 'Toi Racing', driver: 'Toi', number: 7, colors: ['#ffd600', '#212121'] };
  const LANE_STEP = 18;
  const GRID_GAP = 52;
  const MAX_SMOKE = 300;
  const KERB = 8;
  // Feux : un feu rouge de plus toutes les LIGHT_FRAMES images, puis extinction après un délai aléatoire.
  const LIGHTS = 5;
  const LIGHT_FRAMES = 50;

  // Voies parallèles à la trajectoire de course (-2..2), bornées à la piste : des chemins pour follow().
  function lanesFor(track) {
    const limit = track.width / 2 - 26;
    return [-2, -1, 0, 1, 2].map(k => ({
      lane: k, radius: 4, closed: true,
      points: track.points.map((p, i) => {
        const lateral = Math.max(-limit, Math.min(limit, track.offsets[i] + k * LANE_STEP));
        return { x: p.x + track.normals[i].x * lateral, y: p.y + track.normals[i].y * lateral };
      }),
    }));
  }

  function gridSlot(track, i) {
    const s = track.length - 70 - i * GRID_GAP;
    const lateral = (i % 2 ? -1 : 1) * 26;
    const p = Track.pointAt(track, s, lateral);
    const t = Track.tangentAt(track, s);
    return { x: p.x, y: p.y, angle: Math.atan2(t.y, t.x), s };
  }

  // Livrées des pilotes génétiques : néon (de la plus ancienne génération à la plus récente), accent noir.
  const NEURAL_COLORS = ['#ff1744', '#ff9100', '#ffea00', '#76ff03', '#1de9b6', '#00b0ff', '#d500f9', '#ff4081'];

  function neuralTeam(spec, rank) {
    return {
      name: 'Écurie génétique', driver: `Génération ${spec.generation}`, code: `G${spec.generation}`,
      number: spec.generation, colors: [spec.color ?? NEURAL_COLORS[rank % NEURAL_COLORS.length], '#111111'], neural: true,
    };
  }

  // Places des pilotes génétiques parmi les IA : réparties sur la grille (indices d'IA).
  function neuralSlots(aiCount, count) {
    const n = Math.min(aiCount, count);
    return Array.from({ length: n }, (_, k) => Math.floor((k + 0.5) * aiCount / n));
  }

  // neural : cerveaux (voir neuralBrains.js) donnés à certaines IA ; les autres gardent le steering.
  function create({ laps = 3, aiCount = 9, player = true, playerSlot = 5, rng = Math.random, track = Track.build(), neural = [] } = {}) {
    const total = aiCount + (player ? 1 : 0);
    const cars = [];
    const slots = neuralSlots(aiCount, neural.length);
    let ai = 0;
    let steering = 0;
    for (let i = 0; i < total; i++) {
      const slot = gridSlot(track, i);
      let car;
      if (player && i === Math.min(playerSlot, total - 1)) {
        car = new PlayerCar(slot.x, slot.y, slot.angle, PLAYER_TEAM);
      } else if (slots.includes(ai)) {
        const k = slots.indexOf(ai);
        car = new NeuralRaceCar(slot.x, slot.y, slot.angle, neuralTeam(neural[k], k), neural[k]);
        ai++;
      } else {
        const team = TEAMS[steering % TEAMS.length];
        // Personnalité : les premières places de la grille sont un peu plus rapides.
        const skill = 0.98 - ai * 0.012 - rng() * 0.02;
        car = new AICar(slot.x, slot.y, slot.angle, team, {
          skill, aggression: 0.3 + rng() * 0.6, consistency: 0.9 + rng() * 0.09,
        }, rng);
        car.prepare(track);
        ai++;
        steering++;
      }
      Object.assign(car, { lap: 0, progress: slot.s - track.length, lapStart: null, bestLap: null, lastLap: null,
        laps: [], finished: false, finishFrame: null, grid: i + 1, prevS: slot.s, s: slot.s });
      cars.push(car);
    }
    return {
      track, lanes: lanesFor(track), cars, laps, phase: 'grid', frame: 0, lightsOn: 0, lightsOutAt: null,
      startFrame: null, finishOrder: [], smoke: [], skids: [], feed: [], rng,
      player: cars.find(c => c instanceof PlayerCar) ?? null,
    };
  }

  // ---------- Départ ----------
  function updateLights(race) {
    if (race.phase !== 'grid') return;
    race.lightsOn = Math.min(LIGHTS, Math.floor(race.frame / LIGHT_FRAMES));
    if (race.lightsOn === LIGHTS && race.lightsOutAt === null) {
      race.lightsOutAt = race.frame + 20 + Math.floor(race.rng() * 60);
    }
    if (race.lightsOutAt !== null && race.frame >= race.lightsOutAt) {
      race.phase = 'race';
      race.lightsOn = 0;
      race.startFrame = race.frame;
      for (const car of race.cars) car.lapStart = race.frame;
    }
  }

  // ---------- Physique de course ----------
  // Aspiration : une voiture dans le sillage d'une autre (30 à 220 px derrière, alignée) a moins de traînée.
  function updateDrafting(race) {
    for (const car of race.cars) {
      car.drafting = false;
      if (race.phase !== 'race' || car.vel.mag() < 4) continue;
      const f = car.forward();
      for (const other of race.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dy = other.pos.y - car.pos.y;
        const along = dx * f.x + dy * f.y;
        const side = Math.abs(-dx * f.y + dy * f.x);
        if (along > 30 && along < 220 && side < 16) {
          car.drafting = true;
          break;
        }
      }
    }
  }

  function updateSurfaces(race) {
    const track = race.track;
    for (const car of race.cars) {
      const loc = Track.locate(track, car.pos, car.index ?? null);
      car.index = loc.index;
      const half = track.width / 2;
      const off = Math.abs(loc.lateral);
      // Les vibreurs (KERB px au-delà de la ligne blanche) comptent comme de la piste.
      if (off <= half + KERB) car.surface = 'asphalt';
      else if (off <= half + track.runoff) {
        const corner = Math.abs(Track.sample(track, track.curvature, loc.s)) > 0.0025;
        car.surface = corner ? 'gravel' : 'grass';
      } else {
        // Barrière : on rebondit vers la piste en perdant beaucoup de vitesse.
        car.surface = 'grass';
        const n = track.normals[loc.index];
        const back = -Math.sign(loc.lateral);
        car.applyForce(createVector(n.x * back * 0.6, n.y * back * 0.6));
        car.applyForce(car.vel.copy().mult(-0.25));
        if (car.vel.mag() > 4 && car.spin === 0) car.startSpin((race.rng() < 0.5 ? -1 : 1) * 0.2);
        if (race.frame % 30 === 0) pushFeed(race, `${car.team.driver} dans le mur !`);
      }
    }
  }

  // Contacts : deux cercles par voiture ; on les sépare par des forces et on échange un peu de vitesse.
  function collisions(race) {
    const cars = race.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) > a.length + 4) continue;
        for (const ca of a.circles()) {
          for (const cb of b.circles()) {
            const dx = cb.x - ca.x;
            const dy = cb.y - ca.y;
            const d = Math.hypot(dx, dy);
            const min = a.r + b.r;
            if (d === 0 || d >= min) continue;
            const nx = dx / d;
            const ny = dy / d;
            const overlap = min - d;
            const relative = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
            const impulse = Math.max(0, -relative) * 0.55 + overlap * 0.12;
            a.applyForce(createVector(-nx * impulse, -ny * impulse));
            b.applyForce(createVector(nx * impulse, ny * impulse));
            if (-relative > 1.6 && race.phase === 'race') {
              const hit = race.rng() < 0.5 ? a : b;
              if (hit.spin === 0) {
                hit.startSpin((race.rng() < 0.5 ? -1 : 1) * 0.18);
                pushFeed(race, `Accrochage : ${a.team.driver} et ${b.team.driver}`);
              }
            }
          }
        }
      }
    }
  }

  function pushFeed(race, text) {
    race.feed.push({ text, frame: race.frame });
    if (race.feed.length > 6) race.feed.shift();
  }

  // ---------- Tours et chronos ----------
  function updateLaps(race) {
    const L = race.track.length;
    for (const car of race.cars) {
      const s = car.s;
      if (race.phase === 'race') {
        if (car.prevS > L * 0.75 && s < L * 0.25) {
          car.lap++;
          if (car.lap > 1) {
            const time = (race.frame - car.lapStart) / 60;
            car.lastLap = time;
            car.laps.push(time);
            if (car.bestLap === null || time < car.bestLap) car.bestLap = time;
            if (race.bestLap === undefined || time < race.bestLap.time) {
              race.bestLap = { time, driver: car.team.driver, code: car.team.code };
              if (car.lap > 2) pushFeed(race, `Meilleur tour : ${car.team.driver} (${time.toFixed(2)} s)`);
            }
          }
          car.lapStart = race.frame;
          if (car.lap > race.laps && !car.finished) {
            car.finished = true;
            car.finishFrame = race.frame;
            race.finishOrder.push(car);
            if (race.finishOrder.length === 1) pushFeed(race, `Drapeau à damier : ${car.team.driver} gagne !`);
          }
        } else if (car.prevS < L * 0.25 && s > L * 0.75) {
          car.lap--;
        }
      }
      car.prevS = s;
      car.progress = car.lap >= 1 ? (car.lap - 1) * L + s : s - L;
    }
    if (race.phase === 'race' && race.finishOrder.length) {
      const allDone = race.cars.every(c => c.finished);
      const late = race.frame - race.finishOrder[0].finishFrame > 60 * 30;
      if (allDone || late) race.phase = 'finished';
    }
  }

  function standings(race) {
    return [...race.cars].sort((a, b) => {
      if (a.finished && b.finished) return race.finishOrder.indexOf(a) - race.finishOrder.indexOf(b);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
  }

  // ---------- Effets : traces de pneus et fumée ----------
  function updateEffects(race) {
    race.skids = [];
    for (const car of race.cars) {
      const wheels = car.wheels();
      const rear = [wheels[2], wheels[3]];
      const braking = car.throttle < -0.6 && car.vel.mag() > 3;
      const marking = car.sliding || car.spin > 0 || (braking && car.surface === 'asphalt' && car.vel.mag() > 6);
      if (marking && car.lastRear && car.surface === 'asphalt') {
        for (let k = 0; k < 2; k++) race.skids.push([car.lastRear[k].x, car.lastRear[k].y, rear[k].x, rear[k].y, car.spin > 0 ? 0.22 : 0.12]);
      }
      car.lastRear = rear;
      const smoky = car.spin > 0 || car.slip > 1.2 || (car.surface !== 'asphalt' && car.vel.mag() > 2);
      if (smoky && race.smoke.length < MAX_SMOKE && race.rng() < 0.6) {
        const w = rear[Math.floor(race.rng() * 2)];
        const dirt = car.surface !== 'asphalt';
        const puff = new SmokePuff(w.x, w.y, -car.vel.x * 0.15 + (race.rng() - 0.5), -car.vel.y * 0.15 + (race.rng() - 0.5), dirt ? 9 : 7);
        puff.dirt = dirt;
        race.smoke.push(puff);
      }
    }
    let kept = 0;
    for (const puff of race.smoke) {
      puff.applyBehaviors();
      puff.update();
      if (!puff.expired()) race.smoke[kept++] = puff;
    }
    race.smoke.length = kept;
  }

  function step(race) {
    race.frame++;
    updateLights(race);
    for (const car of race.cars) car.applyBehaviors(race);
    updateDrafting(race);
    for (const car of race.cars) car.update();
    updateSurfaces(race);
    collisions(race);
    for (const car of race.cars) {
      const loc = Track.locate(race.track, car.pos, car.index);
      car.index = loc.index;
      car.s = loc.s;
      car.lateral = loc.lateral;
    }
    updateLaps(race);
    updateEffects(race);
  }

  return { TEAMS, PLAYER_TEAM, LANE_STEP, GRID_GAP, KERB, LIGHTS, LIGHT_FRAMES, NEURAL_COLORS, lanesFor, gridSlot, neuralTeam, neuralSlots, create, step, standings,
    updateLights, updateDrafting, collisions, updateLaps };
})();
