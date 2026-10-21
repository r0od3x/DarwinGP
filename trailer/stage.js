// Mise en scène des plans de bande-annonce (outil de développement, index.html?trailer=<plan>).
// Chargé seulement avec ?trailer : sans ce paramètre, le jeu est strictement le même.
// Le plan (JSON encodé en base64url dans l'URL) décrit une course : voitures placées sur le
// circuit, quelques images simulées par la vraie course (Race.step : fumée, traces, décisions
// des IA), caméra et interface. Le dessin est celui du jeu (render, updateHud).
//
// Deux usages :
// - image fixe (storyboard) : la scène est dessinée une fois, le titre passe à « trailer:ready » ;
// - clip (&clip=1) : la course continue image par image. L'enregistreur appelle
//   TrailerStage.frame(k) pour chaque image de sortie (30 i/s), puis capture la page.
//
// Plan :
//   seed, neural (ids de neuralBrains.js), laps
//   grid    { lights, hold } : sur la grille, lights feux allumés ; hold : les feux ne s'éteignent pas
//   start   { after } : départ réel simulé, after pas de jeu après l'extinction
//   place   [{ car, s, lateral, speed, yaw, drift, lap, spin, hold, tune }] : voitures placées
//           car : 'player' (le n° 7), 'leader', un pilote (« Rossi »), un code (« G528 »), un numéro
//           tune : { topSpeed, skill, aggression } (pilote plus rapide pour un dépassement, etc.)
//   others  'keep' | 'away' (les autres roulent loin derrière la caméra)
//   steps   pas de jeu simulés avant l'image (ou avant le début du clip)
//   camera  { car, ahead, side } | { s, lateral } | { x, y } | { circuit } ; zoom
//   hud     'clean' | 'race' | 'lights' | 'feed' ; debug, names, minimap, feed : [textes]
// Clip seulement :
//   duration (s), fps
//   cameraTo  caméra de fin : la caméra passe en douceur de camera à cameraTo
//   move      { z: [début, fin], x: [..], y: [..], punch, shake } : zoom et décalage ajoutés
//   timeScale nombre ou [{ t, scale }] (s du clip) : 0.2 = ralenti à 20 %, avec interpolation
//   actions   [{ at, car, ... }] à l'instant at (s du clip) :
//             spin: vitesse de rotation | overtake: 'Rossi' | lane: -2..2 (avec mode) |
//             nudge: { side, force, dur } (pousse sur le côté) | hold: { throttle, steer, dur } |
//             lightsOut: true | shake: intensité | feed: 'texte'
const TrailerStage = (() => {
  const HUD_PARTS = ['tower', 'timing', 'dash', 'feed', 'help', 'lights'];
  const HUD_SETS = { clean: [], race: ['tower', 'timing', 'dash', 'feed'], lights: ['lights'], feed: ['feed'] };
  const STEPS_PER_SECOND = 60;

  function params(search = location.search) {
    return new URLSearchParams(search);
  }

  function requested(search = location.search) {
    return params(search).has('trailer');
  }

  function decode(text) {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function seeded(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function findCar(r, name) {
    if (name === 'player') return r.player;
    if (name === 'leader') return Race.standings(r)[0];
    const key = String(name).toLowerCase();
    return r.cars.find(c => [c.team.driver, c.team.code, c.team.name, String(c.team.number)]
      .some(v => v !== undefined && String(v).toLowerCase() === key)) ?? null;
  }

  // Voiture posée à l'abscisse s, décalée de lateral px (positif : à droite du sens de course).
  function placeCar(r, car, p) {
    const track = r.track;
    const s = ((p.s % track.length) + track.length) % track.length;
    const at = Track.pointAt(track, s, p.lateral ?? 0);
    const t = Track.tangentAt(track, s);
    const heading = Math.atan2(t.y, t.x) + (p.yaw ?? 0);
    car.pos.set(at.x, at.y);
    car.angle = heading;
    const speed = p.speed ?? 0;
    const move = heading - (p.drift ?? 0);
    car.vel.set(Math.cos(move) * speed, Math.sin(move) * speed);
    car.acc.set(0, 0);
    const loc = Track.locate(track, car.pos);
    Object.assign(car, { index: loc.index, s: loc.s, prevS: loc.s, lateral: loc.lateral });
    // Tour en cours et chrono du tour (environ 7 px par image depuis la ligne), pour l'interface.
    car.lap = p.lap ?? Math.max(1, car.lap);
    car.progress = (car.lap - 1) * track.length + loc.s;
    car.lapStart = r.frame - Math.round(loc.s / 7);
    if (p.tune) {
      Object.assign(car, p.tune);
      if (p.tune.topSpeed) car.maxSpeed = p.tune.topSpeed * 1.08;
      car.prepare?.(track);
    }
    if (p.throttle !== undefined) car.throttle = p.throttle;
    if (p.spin) car.startSpin(p.spin);
  }

  // Voitures non placées : loin derrière la caméra (un demi-tour), en file ; au classement,
  // elles suivent les voitures placées.
  function parkOthers(r, placed, around) {
    const L = r.track.length;
    let k = 0;
    for (const car of r.cars) {
      if (placed.has(car)) continue;
      const progress = (around.lap - 1) * L + around.s - L * 0.45 - k * 70;
      const lap = Math.floor(progress / L) + 1;
      placeCar(r, car, { s: progress - (lap - 1) * L, lap, lateral: (k % 2 ? -1 : 1) * 22, speed: 7 });
      k++;
    }
  }

  // Le n° 7 (Toi Racing) est conduit par l'IA pendant le tournage : c'est une IA de la grille
  // qui porte la livrée du joueur. Il dépasse, défend et prend l'aspiration comme les autres.
  function standIn(r) {
    const steering = r.cars.filter(c => c instanceof AICar);
    const car = steering[steering.length - 1];
    car.team = Race.PLAYER_TEAM;
    car.isPlayer = true;
    car.skill = 1;
    car.aggression = 0.9;
    car.prepare(r.track);
    r.player = car;
    return car;
  }

  function cameraFor(c = {}, r) {
    if (c.circuit) {
      const b = r.track.bounds;
      return { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.min(width / b.w, height / b.h) * (c.zoom ?? 1.15) };
    }
    let p;
    if (c.car) {
      const car = findCar(r, c.car);
      const f = car.forward();
      const rt = car.right();
      p = { x: car.pos.x + f.x * (c.ahead ?? 0) + rt.x * (c.side ?? 0), y: car.pos.y + f.y * (c.ahead ?? 0) + rt.y * (c.side ?? 0) };
    } else if (c.s !== undefined) p = Track.pointAt(r.track, c.s, c.lateral ?? 0);
    else p = { x: c.x ?? 0, y: c.y ?? 0 };
    return { x: p.x, y: p.y, zoom: c.zoom ?? 1.2 };
  }

  function showHud(set) {
    const visible = HUD_SETS[set] ?? [];
    for (const id of HUD_PARTS) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = visible.includes(id) ? 'visible' : 'hidden';
    }
  }

  // ---------- Mise en scène ----------
  // Actions en cours sur les voitures (pousser, imposer pédale ou volant, voie) : appliquées par
  // des crochets posés sur les décisions de chaque voiture, sans toucher au code du jeu.
  let overrides = [];
  let clock = 0;

  function hookCar(car) {
    const decide = car.decide?.bind(car);
    if (decide) {
      car.decide = race => {
        decide(race);
        for (const o of overrides) {
          if (o.car !== car || o.lane === undefined || clock < o.from || clock > o.to) continue;
          car.laneTarget = o.lane;
          if (o.mode) car.mode = o.mode;
        }
      };
    }
    const behave = car.applyBehaviors.bind(car);
    car.applyBehaviors = race => {
      behave(race);
      for (const o of overrides) {
        if (o.car !== car || clock < o.from || clock > o.to) continue;
        if (o.throttle !== undefined) car.throttle = o.throttle;
        if (o.steer !== undefined) car.steer = o.steer;
        if (o.force) {
          const rt = car.right();
          car.applyForce(createVector(rt.x * o.force * o.side, rt.y * o.force * o.side));
        }
      }
    };
  }

  function stage(spec) {
    const neural = (spec.neural ?? []).map(id => NeuralBrains.find(b => b.id === id)).filter(Boolean);
    const rng = seeded(spec.seed ?? 1);
    const r = Race.create({ laps: spec.laps ?? 3, aiCount: 11 + neural.length, player: false, neural, rng });
    standIn(r);
    r.cars.forEach(hookCar);
    overrides = [];
    clock = 0;
    baked.skids.getContext('2d').clearRect(0, 0, baked.skids.width, baked.skids.height);
    race = r;
    if (spec.grid) {
      r.frame = (spec.grid.lights ?? 0) * Race.LIGHT_FRAMES;
      r.lightsOn = spec.grid.lights ?? 0;
    }
    if (spec.start) {
      while (r.phase === 'grid' && r.frame < 2000) step(r, spec);
      for (let i = 0; i < (spec.start.after ?? 0); i++) step(r, spec);
    }
    const placed = new Set();
    if (spec.place?.length) {
      if (!spec.start) {
        r.phase = 'race';
        r.startFrame = r.frame;
      }
      for (const p of spec.place) {
        const car = findCar(r, p.car);
        if (!car) throw new Error(`voiture inconnue : ${p.car}`);
        placeCar(r, car, p);
        placed.add(car);
      }
      if ((spec.others ?? 'away') === 'away') parkOthers(r, placed, { s: spec.place[0].s, lap: spec.place[0].lap ?? 1 });
      for (let i = 0; i < (spec.steps ?? 8); i++) step(r, spec);
      // Image fixe : commandes imposées après la simulation (freinage visible, etc.).
      if (!clipMode()) for (const p of spec.place) if (p.hold) Object.assign(findCar(r, p.car), p.hold);
    }
    for (const text of spec.feed ?? []) r.feed.push({ text, frame: r.frame, scripted: true });
    // Voiture suivie (interface) : celle de la caméra, sinon la première placée, sinon le n° 7.
    const focus = spec.follow ?? spec.camera?.car ?? spec.place?.[0]?.car;
    followed = (focus && findCar(r, focus)) ?? r.player ?? r.cars[0];
    Object.assign(camera, cameraFor(spec.camera, r));
    debug = Boolean(spec.debug);
    return r;
  }

  function step(r, spec) {
    Race.step(r);
    TrackPainter.addSkids(baked, r.skids);
    if (spec.grid?.hold && r.lightsOutAt !== null) r.lightsOutAt = Infinity;
  }

  // ---------- Clip ----------
  let clip = null;

  function clipMode() {
    return params().get('clip') === '1';
  }

  function scaleAt(spec, t) {
    const s = spec.timeScale ?? 1;
    if (typeof s === 'number') return s;
    if (t <= s[0].t) return s[0].scale;
    for (let i = 1; i < s.length; i++) {
      if (t < s[i].t) return s[i - 1].scale + (s[i].scale - s[i - 1].scale) * (t - s[i - 1].t) / (s[i].t - s[i - 1].t);
    }
    return s[s.length - 1].scale;
  }

  const ease = u => u * u * (3 - 2 * u);

  function runAction(r, a) {
    const car = a.car ? findCar(r, a.car) : null;
    const dur = a.dur ?? 0.6;
    if (a.spin && car && car.spin === 0) car.startSpin(a.spin);
    if (a.overtake && car) {
      const other = findCar(r, a.overtake);
      car.overtaking = other;
      car.laneTarget = car.passingLane?.(other.lane ?? 0) ?? -1;
      car.setMode?.('dépassement', 240);
    }
    if (a.lane !== undefined && car) overrides.push({ car, lane: a.lane, mode: a.mode, from: a.at, to: a.at + (a.dur ?? 3) });
    if (a.nudge && car) overrides.push({ car, force: a.nudge.force ?? 0.2, side: a.nudge.side ?? 1, from: a.at, to: a.at + (a.nudge.dur ?? dur) });
    if (a.hold && car) overrides.push({ car, ...a.hold, from: a.at, to: a.at + (a.hold.dur ?? dur) });
    if (a.lightsOut) r.lightsOutAt = r.frame + 1;
    if (a.shake) clip.shakes.push({ at: a.at, amount: a.shake });
    if (a.feed) r.feed.push({ text: a.feed, frame: r.frame, scripted: true });
  }

  function snapshot(r) {
    return new Map(r.cars.map(c => [c, { x: c.pos.x, y: c.pos.y, angle: c.angle }]));
  }

  // Positions affichées entre le pas précédent et le dernier (ralentis fluides) ; renvoie la remise.
  function interpolate(r, prev, alpha) {
    if (!prev || alpha <= 0 || alpha >= 1) return () => {};
    const saved = [];
    for (const car of r.cars) {
      const p = prev.get(car);
      if (!p) continue;
      saved.push([car, car.pos.x, car.pos.y, car.angle]);
      const k = 1 - alpha;
      car.pos.x += (p.x - car.pos.x) * k;
      car.pos.y += (p.y - car.pos.y) * k;
      let d = p.angle - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.angle += d * k;
    }
    return () => {
      for (const [car, x, y, angle] of saved) {
        car.pos.x = x;
        car.pos.y = y;
        car.angle = angle;
      }
    };
  }

  // Caméra du clip : de camera vers cameraTo (en douceur), plus le mouvement et les secousses.
  function clipCamera(r, spec, t) {
    const T = spec.duration;
    const u = ease(Math.min(1, t / T));
    const a = cameraFor(spec.camera, r);
    const b = spec.cameraTo ? cameraFor(spec.cameraTo, r) : a;
    const m = spec.move ?? {};
    const zMove = m.z ? m.z[0] + (m.z[1] - m.z[0]) * u : 1;
    const punch = m.punch ? 1 + m.punch * Math.exp(-t * 10) : 1;
    let zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * u) * zMove * punch;
    let x = a.x + (b.x - a.x) * u;
    let y = a.y + (b.y - a.y) * u;
    // Décalage du cadre en part de l'écran.
    if (m.x) x += (m.x[0] + (m.x[1] - m.x[0]) * u) * width / zoom;
    if (m.y) y += (m.y[0] + (m.y[1] - m.y[0]) * u) * height / zoom;
    let shake = m.shake ? m.shake * Math.exp(-t * 4) : 0;
    for (const s of clip.shakes) if (t >= s.at) shake += s.amount * Math.exp(-(t - s.at) * 5);
    if (shake) {
      x += Math.sin(t * 57) * shake * 9 / zoom;
      y += Math.cos(t * 43) * shake * 9 / zoom;
    }
    // Suivi souple : la caméra rattrape sa cible sans à-coups.
    if (clip.cam && !spec.lock) {
      const k = spec.smoothing ?? 0.35;
      x = clip.cam.x + (x - clip.cam.x) * k;
      y = clip.cam.y + (y - clip.cam.y) * k;
      zoom = Math.exp(Math.log(clip.cam.zoom) + (Math.log(zoom) - Math.log(clip.cam.zoom)) * k);
    }
    clip.cam = { x, y, zoom };
    return clip.cam;
  }

  // Une image de sortie k : actions, pas de jeu selon l'échelle de temps, caméra, dessin.
  function frame(k) {
    const { r, spec } = clip;
    const fps = spec.fps ?? 30;
    const t = k / fps;
    clock = t;
    for (const a of spec.actions ?? []) {
      if (!clip.done.has(a) && t >= a.at) {
        clip.done.add(a);
        runAction(r, a);
      }
    }
    clip.acc += scaleAt(spec, t) * STEPS_PER_SECOND / fps;
    while (clip.acc >= 1) {
      clip.prev = snapshot(r);
      step(r, spec);
      clip.acc -= 1;
    }
    // Fil de course : seulement ce qui concerne les voitures du plan (les autres roulent hors
    // champ et ont leurs propres accrochages), plus les messages écrits pour le plan.
    if (clip.drivers.length) r.feed = r.feed.filter(e => e.scripted || clip.drivers.some(d => e.text.includes(d)));
    const restore = interpolate(r, clip.prev, clip.acc);
    Object.assign(camera, clipCamera(r, spec, t));
    render();
    restore();
    updateHud();
    return { t, step: r.frame };
  }

  function prepare(spec) {
    if (!spec.camera) spec.camera = {};
    const r = stage(spec);
    const drivers = (spec.place ?? []).map(p => findCar(r, p.car)?.team.driver).filter(Boolean);
    clip = { r, spec, acc: 0, prev: null, done: new Set(), shakes: [], cam: null, drivers };
    return { frames: Math.round(spec.duration * (spec.fps ?? 30)) };
  }

  function run() {
    const raw = params().get('trailer');
    try {
      const spec = decode(raw);
      noLoop();
      paused = true;
      // noLoop() n'annule pas l'image déjà demandée : draw() peut encore passer une fois. La caméra
      // du jeu ne doit pas bouger, sinon elle glisse vers la voiture suivie et décadre le plan.
      window.updateCamera = () => {};
      document.getElementById('menu').hidden = true;
      document.getElementById('results').hidden = true;
      // Interface du plan : noms et mini-carte seulement si demandés.
      if (!spec.names) window.drawNames = () => {};
      if (!spec.minimap) window.drawMinimap = () => {};
      showHud(spec.hud ?? 'clean');
      if (clipMode()) {
        TrailerStage.clip = prepare(spec);
      } else {
        stage(spec);
        render();
        lastFeedFrame = -2;
        updateHud();
      }
      document.title = 'trailer:ready';
    } catch (error) {
      document.title = `trailer:error ${error.message}`;
      console.error(error);
    }
  }

  function start() {
    if (!requested()) return;
    // Après setup() de p5 (premier dessin fait) : on prend la main.
    window.addEventListener('load', () => setTimeout(run, 150));
  }

  return { requested, decode, seeded, findCar, placeCar, cameraFor, stage, prepare, frame, scaleAt, start, clip: null };
})();
TrailerStage.start();
