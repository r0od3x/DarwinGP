// Boucle p5 : simulation (Race), caméra, dessin du monde et de l'interface.
let race = null;
let baked = null;
let grassPattern = null;
let followed = null;
let debug = false;
let paused = true;
const camera = { x: 0, y: 0, zoom: 1, mode: 0 };
// Caméras : proche (suit la voiture), large, tout le circuit.
const CAMERAS = [{ name: 'proche', zoom: 1.45 }, { name: 'large', zoom: 0.75 }, { name: 'circuit', zoom: null }];
const choices = { mode: 'course', laps: 3, ai: 9, neural: [] };
// Au moins MIN_STEERING adversaires gardent le pilotage par steering behaviors.
const MIN_STEERING = 2;
let smokeSprite = null;
let dirtSprite = null;
let lastFeedFrame = -1;
// La course avance à 60 pas par seconde quel que soit l'écran : les images perdues sont
// rattrapées (au plus MAX_STEPS pas par image), et un écran à 120 / 144 Hz n'accélère pas le jeu.
const STEP_MS = 1000 / 60;
const MAX_STEPS = 4;
let stepClock = 0;
// Son du moteur de la voiture suivie (activé au menu ou avec M).
const engine = EngineSound.create();

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  // Une image par pixel CSS : sur un écran haute densité (×1,5, ×2), dessiner 2 à 4 fois plus
  // de pixels fait tomber la fluidité sans que la différence se voie en jeu.
  pixelDensity(1);
  canvas.parent('stage');
  smokeSprite = puffSprite('230, 230, 230');
  dirtSprite = puffSprite('170, 145, 95');
  document.getElementById('start').addEventListener('click', startFromMenu);
  buildNeuralChoices();
  document.getElementById('again').addEventListener('click', () => {
    document.getElementById('results').hidden = true;
    newRace();
  });
  document.getElementById('tower-list').addEventListener('click', event => {
    const row = event.target.closest('li');
    if (row && race) followed = race.cars[Number(row.dataset.car)];
  });
  newRace();
}

function puffSprite(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb}, 0.9)`);
  grad.addColorStop(0.6, `rgba(${rgb}, 0.35)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// Code de 3 ou 4 lettres (classement, étiquettes) et couleur du mode de décision.
function codeOf(car) {
  return car.team.code ?? car.team.driver.slice(0, 3).toUpperCase();
}

function modeColor(car) {
  if (car.isPlayer) return '#ffd600';
  return (car.isNeural ? NeuralRaceCar.MODES[car.mode] : AICar.MODES[car.mode]) ?? '#ffffff';
}

// Menu : une case par génération disponible (neuralBrains.js).
function buildNeuralChoices() {
  const list = document.getElementById('neural-list');
  if (!list || typeof NeuralBrains === 'undefined') return;
  list.replaceChildren(...NeuralBrains.map((spec, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'neural';
    input.value = String(i);
    input.checked = spec.selected !== false;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = spec.color ?? Race.NEURAL_COLORS[i % Race.NEURAL_COLORS.length];
    label.append(input, swatch, ` ${spec.label ?? `Génération ${spec.generation}`}`);
    return label;
  }));
}

// Générations cochées, au plus (adversaires - MIN_STEERING), réparties sur la liste.
function chosenNeural(aiCount) {
  const checked = [...document.querySelectorAll('input[name="neural"]:checked')].map(i => NeuralBrains[Number(i.value)]);
  const room = Math.max(0, aiCount - MIN_STEERING);
  if (checked.length <= room) return checked;
  return Array.from({ length: room }, (_, k) => checked[Math.floor(k * checked.length / room)]);
}

function startFromMenu() {
  for (const name of ['mode', 'laps', 'ai']) {
    const value = document.querySelector(`input[name="${name}"]:checked`).value;
    choices[name] = name === 'mode' ? value : Number(value);
  }
  choices.neural = chosenNeural(choices.ai);
  document.getElementById('menu').hidden = true;
  engine.setEnabled(document.getElementById('sound').checked);
  newRace();
  paused = false;
}

function newRace() {
  race = Race.create({ laps: choices.laps, aiCount: choices.ai, player: choices.mode === 'course', neural: choices.neural });
  const slots = race.cars.map((_, i) => Race.gridSlot(race.track, i));
  if (!baked) baked = TrackPainter.bake(race.track, slots);
  else baked.skids.getContext('2d').clearRect(0, 0, baked.skids.width, baked.skids.height);
  followed = race.player ?? race.cars[0];
  camera.x = followed.pos.x;
  camera.y = followed.pos.y;
  lastFeedFrame = -1;
  document.getElementById('results').hidden = true;
}

// ---------- Boucle ----------
// Nombre de pas de simulation dus depuis l'image précédente. Un écart de moins d'une ms avec un
// nombre entier de pas (60 Hz irrégulier) compte pour ce nombre, sinon on alternerait 0 et 2 pas.
function stepsDue() {
  let dt = deltaTime;
  const k = Math.round(dt / STEP_MS);
  if (k >= 1 && Math.abs(dt - k * STEP_MS) < 1) dt = k * STEP_MS;
  stepClock = Math.min(stepClock + dt, STEP_MS * MAX_STEPS);
  const steps = Math.floor(stepClock / STEP_MS + 1e-6);
  stepClock = Math.max(0, stepClock - steps * STEP_MS);
  return steps;
}

function draw() {
  for (let i = stepsDue(); i > 0; i--) {
    if (!paused) {
      if (race.player) readKeys(race.player);
      Race.step(race);
      TrackPainter.addSkids(baked, race.skids);
      if (race.phase === 'finished' && document.getElementById('results').hidden) showResults();
    }
    updateCamera();
  }
  render();
  const gearbox = Gearbox.state(followed.localVelocity().along, followed.topSpeed);
  engine.update(paused ? Gearbox.IDLE : gearbox.rpm, paused ? 0 : followed.throttle);
  if (frameCount % 4 === 0) updateHud(gearbox);
}

function readKeys(car) {
  car.keys.up = keyIsDown(UP_ARROW) || keyIsDown(90) || keyIsDown(87);
  car.keys.down = keyIsDown(DOWN_ARROW) || keyIsDown(83);
  car.keys.left = keyIsDown(LEFT_ARROW) || keyIsDown(81) || keyIsDown(65);
  car.keys.right = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
}

function updateCamera() {
  const setting = CAMERAS[camera.mode];
  const b = race.track.bounds;
  let zoom;
  let tx;
  let ty;
  if (setting.zoom === null) {
    zoom = Math.min(width / b.w, height / b.h) * 1.15;
    tx = b.x + b.w / 2;
    ty = b.y + b.h / 2;
  } else {
    zoom = setting.zoom;
    // La caméra regarde un peu devant la voiture, d'autant plus qu'elle va vite.
    tx = followed.pos.x + followed.vel.x * 22;
    ty = followed.pos.y + followed.vel.y * 22;
  }
  camera.x += (tx - camera.x) * 0.08;
  camera.y += (ty - camera.y) * 0.08;
  camera.zoom += (zoom - camera.zoom) * 0.06;
}

// ---------- Dessin du monde ----------
function render() {
  const ctx = drawingContext;
  ctx.save();
  ctx.fillStyle = '#2f5d22';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  // Au-delà de l'image du circuit : la même herbe, sans bande de tonte.
  const view = { x: camera.x - width / 2 / camera.zoom, y: camera.y - height / 2 / camera.zoom, w: width / camera.zoom, h: height / camera.zoom };
  ctx.fillStyle = '#3d7a2a';
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = grassPattern ??= TrackPainter.surroundPattern(ctx);
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.drawImage(baked.canvas, baked.origin.x, baked.origin.y);
  ctx.drawImage(baked.skids, baked.origin.x, baked.origin.y);
  if (debug) drawProfile(ctx, followed);
  for (const puff of race.smoke) if (puff.dirt) puff.show(ctx, dirtSprite);
  for (const car of race.cars) car.show(ctx);
  for (const puff of race.smoke) if (!puff.dirt) puff.show(ctx, smokeSprite);
  if (debug) for (const car of race.cars) if (car instanceof AICar) drawDebug(ctx, car);
  if (debug) for (const car of race.cars) if (car.isNeural) drawNeuralDebug(ctx, car);
  if (camera.zoom > 0.55) drawNames(ctx);
  ctx.restore();
  drawMinimap(ctx);
  const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
}

function drawNames(ctx) {
  ctx.save();
  ctx.font = '700 9px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const car of race.cars) {
    const code = codeOf(car);
    const x = car.pos.x;
    const y = car.pos.y - 22;
    const half = code.length > 3 ? 18 : 15;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.7)';
    ctx.beginPath();
    ctx.roundRect(x - half, y - 9, half * 2, 12, 3);
    ctx.fill();
    ctx.fillStyle = car.team.colors[0];
    ctx.fillRect(x - half, y - 9, 3, 12);
    ctx.fillStyle = car.isPlayer ? '#ffd600' : '#ffffff';
    ctx.fillText(code, x + 1, y);
  }
  ctx.restore();
}

// Debug : vitesse cible le long de la voie devant la voiture suivie (vert = vite, rouge = freinage).
function drawProfile(ctx, car) {
  if (!(car instanceof AICar) || !car.profile) return;
  ctx.save();
  for (let d = 0; d < 1600; d += 16) {
    const s = car.s + d;
    const v = Track.sample(race.track, car.profile, s);
    const p = Track.pointAt(race.track, s, Track.sample(race.track, race.track.offsets, s) + car.lane * Race.LANE_STEP);
    ctx.fillStyle = `hsl(${Math.min(1, v / car.topSpeed) * 120}, 90%, 50%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Debug : point visé sur la voie, trois points de détection, dangers, steering et décision.
function drawDebug(ctx, car) {
  const color = AICar.MODES[car.mode] ?? '#ffffff';
  ctx.save();
  if (car.followInfo) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(car.pos.x, car.pos.y);
    ctx.lineTo(car.followInfo.target.x, car.followInfo.target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(car.followInfo.target.x, car.followInfo.target.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (car.avoidInfo) {
    car.avoidInfo.points.forEach((p, i) => {
      ctx.fillStyle = car.avoidInfo.point === p ? '#ff5252' : ['#ffe14d', '#ffb347', '#ff8a3d'][i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (const h of car.hazards) {
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(h.pos.x, h.pos.y, h.r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (car.steering && car.steering.mag() > 1e-4) {
    const k = 120;
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(car.pos.x, car.pos.y);
    ctx.lineTo(car.pos.x + car.steering.x * k, car.pos.y + car.steering.y * k);
    ctx.stroke();
  }
  // Étiquette : décision, vitesse actuelle / visée, frein.
  ctx.font = '700 8px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(car.mode, car.pos.x, car.pos.y + 26);
  ctx.fillStyle = car.throttle < 0 ? '#ff5252' : '#c6f36b';
  ctx.fillText(`${car.speedKmh()} → ${Math.round(car.targetSpeed * RaceCar.KMH)} km/h`, car.pos.x, car.pos.y + 35);
  ctx.restore();
}

// Debug d'un pilote génétique : ses rayons (vert = loin du bord, rouge = proche), le cap voulu
// par le réseau, sa génération, sa décision et ses deux sorties (virage, vitesse).
function drawNeuralDebug(ctx, car) {
  ctx.save();
  ctx.lineWidth = 1.2;
  for (const ray of car.rays) {
    const t = Math.min(1, ray.distance / car.rayLength);
    ctx.strokeStyle = `hsla(${t * 120}, 90%, 55%, 0.85)`;
    ctx.beginPath();
    ctx.moveTo(car.pos.x, car.pos.y);
    ctx.lineTo(ray.x, ray.y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(ray.x, ray.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#e040fb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(car.pos.x, car.pos.y);
  ctx.lineTo(car.pos.x + Math.cos(car.desiredHeading) * 60, car.pos.y + Math.sin(car.desiredHeading) * 60);
  ctx.stroke();
  ctx.font = '700 8px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = modeColor(car);
  ctx.fillText(`${codeOf(car)} · ${car.mode}`, car.pos.x, car.pos.y + 26);
  ctx.fillStyle = '#e1bee7';
  ctx.fillText(`virage ${car.outputs[0].toFixed(2)} · vitesse ${car.outputs[1].toFixed(2)} → ${Math.round(car.targetSpeed * RaceCar.KMH)} km/h`, car.pos.x, car.pos.y + 35);
  ctx.restore();
}

let minimapPath = null;
function drawMinimap(ctx) {
  const t = race.track;
  const b = t.bounds;
  const w = 230;
  const h = w * b.h / b.w;
  const x0 = width - w - 18;
  const y0 = height - h - 40;
  const sx = w / b.w;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 16, 0.65)';
  ctx.beginPath();
  ctx.roundRect(x0 - 8, y0 - 8, w + 16, h + 16, 10);
  ctx.fill();
  ctx.translate(x0, y0);
  ctx.scale(sx, sx);
  ctx.translate(-b.x, -b.y);
  if (!minimapPath) {
    minimapPath = new Path2D();
    t.points.forEach((p, i) => (i ? minimapPath.lineTo(p.x, p.y) : minimapPath.moveTo(p.x, p.y)));
    minimapPath.closePath();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 3 / sx;
  ctx.stroke(minimapPath);
  for (const car of race.cars) {
    ctx.fillStyle = car.team.colors[0];
    ctx.strokeStyle = car === followed ? '#ffd600' : '#000000';
    ctx.lineWidth = (car === followed ? 3 : 1.5) / sx;
    ctx.beginPath();
    ctx.arc(car.pos.x, car.pos.y, (car === followed ? 6 : 4.5) / sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Interface ----------
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}

function updateHud(gearbox = Gearbox.state(followed.vel.mag(), followed.topSpeed)) {
  const order = Race.standings(race);
  const leader = order[0];
  const L = race.track.length;
  const elapsed = race.startFrame === null ? 0 : race.frame - race.startFrame;
  const pace = elapsed > 0 ? Math.max(1, (leader.progress + L) / elapsed) : 6;
  document.getElementById('tower-list').replaceChildren(...order.map((car, i) => {
    const li = document.createElement('li');
    li.dataset.car = String(race.cars.indexOf(car));
    if (car === followed) li.classList.add('followed');
    if (car.isPlayer) li.classList.add('player');
    let gap = '';
    if (i === 0) gap = race.phase === 'race' ? `T${Math.max(1, Math.min(race.laps, car.lap))}` : '';
    else if (car.finished && leader.finished) gap = `+${((car.finishFrame - leader.finishFrame) / 60).toFixed(1)}`;
    else {
      const lapsDown = Math.floor((leader.progress - car.progress) / L);
      gap = lapsDown >= 1 ? `+${lapsDown} T` : `+${((leader.progress - car.progress) / pace / 60).toFixed(1)}`;
    }
    const cells = [
      ['pos', String(i + 1)], ['team', ''], ['code', codeOf(car)], ['gap', gap], ['mode', ''],
    ].map(([cls, text]) => {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      if (cls === 'team') span.style.background = car.team.colors[0];
      if (cls === 'mode') span.style.background = modeColor(car);
      return span;
    });
    li.append(...cells);
    return li;
  }));
  const car = followed;
  const lap = Math.max(1, Math.min(race.laps, car.lap || 1));
  document.getElementById('lap').textContent = car.finished ? 'Arrivée' : `${lap} / ${race.laps}`;
  document.getElementById('lap-time').textContent = race.phase === 'grid' ? '0.00' : formatTime((race.frame - (car.lapStart ?? race.frame)) / 60);
  document.getElementById('best-lap').textContent = formatTime(car.bestLap);
  document.getElementById('race-best').textContent = race.bestLap ? `${formatTime(race.bestLap.time)} ${race.bestLap.code ?? race.bestLap.driver.slice(0, 3).toUpperCase()}` : '—';
  document.getElementById('dash-driver').textContent = `P${order.indexOf(car) + 1} · ${car.team.driver} · ${car.team.name}`;
  document.getElementById('speed').textContent = car.speedKmh();
  document.getElementById('gear').textContent = gearbox.gear ? String(gearbox.gear) : 'N';
  const rpm = Gearbox.rpmRatio(gearbox.rpm);
  const rpmBar = document.getElementById('rpm-bar');
  rpmBar.style.width = `${rpm * 100}%`;
  rpmBar.classList.toggle('shift', rpm > 0.92);
  document.getElementById('throttle-bar').style.width = `${Math.max(0, car.throttle) * 100}%`;
  document.getElementById('brake-bar').style.width = `${Math.max(0, -car.throttle) * 100}%`;
  const mode = car.isPlayer ? (car.drafting ? 'aspiration' : '') : car.mode;
  const modeEl = document.getElementById('dash-mode');
  modeEl.textContent = mode;
  modeEl.style.color = car.isPlayer ? (AICar.MODES[mode] ?? '#ffffff') : modeColor(car);
  // Feux de départ.
  const lights = document.getElementById('lights');
  lights.hidden = race.phase !== 'grid';
  [...lights.children].forEach((el, i) => el.classList.toggle('on', i < race.lightsOn));
  // Fil des événements (5 dernières secondes).
  const recent = race.feed.filter(e => race.frame - e.frame < 300);
  const key = recent.length ? recent[recent.length - 1].frame : -1;
  if (key !== lastFeedFrame) {
    lastFeedFrame = key;
    document.getElementById('feed').replaceChildren(...recent.slice(-3).map(e => {
      const li = document.createElement('li');
      li.textContent = e.text;
      return li;
    }));
  } else if (!recent.length) {
    document.getElementById('feed').replaceChildren();
  }
}

function showResults() {
  const order = Race.standings(race);
  const winner = order[0];
  document.getElementById('results-body').replaceChildren(...order.map((car, i) => {
    const tr = document.createElement('tr');
    if (car.isPlayer) tr.className = 'player';
    const time = car.finished
      ? (i === 0 ? formatTime((car.finishFrame - race.startFrame) / 60) : `+${((car.finishFrame - winner.finishFrame) / 60).toFixed(2)} s`)
      : 'non classé';
    for (const text of [String(i + 1), car.team.driver, car.team.name, time, formatTime(car.bestLap)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  }));
  document.getElementById('results').hidden = false;
}

// ---------- Clavier et fenêtre ----------
function keyPressed() {
  if (key === 'c' || key === 'C') camera.mode = (camera.mode + 1) % CAMERAS.length;
  if (key === 'd' || key === 'D') debug = !debug;
  if (key === 'm' || key === 'M') {
    const on = engine.setEnabled(!engine.enabled);
    document.getElementById('sound').checked = on;
  }
  if (key === 'r' || key === 'R') {
    newRace();
    paused = false;
  }
  if (keyCode === TAB) {
    const order = Race.standings(race);
    followed = order[(order.indexOf(followed) + 1) % order.length];
    return false;
  }
  if (keyCode === ESCAPE) {
    paused = true;
    engine.setEnabled(false);
    document.getElementById('menu').hidden = false;
  }
  // Les flèches et Espace ne font pas défiler la page.
  return ![UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW, 32].includes(keyCode);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
