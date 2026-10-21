// Boucle p5 : curseurs de réglage, entraînement (Trainer), dessin du circuit entier, du réseau,
// de la courbe d'apprentissage, et sauvegarde / chargement.
// Circuit d'origine, affiché avant l'entraînement et couru par la première génération.
const home = TrackGenerator.circuit(null);
const settings = Trainer.initialSettings();
let trainer = null;
let running = false;
let randomTracks = true;
// Décor du circuit dessiné une fois par circuit (celui d'origine est gardé).
const bakedCache = new Map();
let previewBrain = null;
let simSpeed = 1;
let allRays = false;
let chartGeneration = -1;
// Temps de calcul maximal par image (ms) : la page reste fluide même à vitesse ×30.
const STEP_BUDGET_MS = 28;
const UNITS = { spread: v => `${v}°`, rayLength: v => `${v} px`, generationTime: v => `${v} s` };
const $ = id => document.getElementById(id);

function setup() {
  const stage = $('stage');
  createCanvas(stage.clientWidth, stage.clientHeight).parent('stage');
  bindSettings();
  bindControls();
  refreshArchitecture();
  refreshControls();
  drawChart();
}

// ---------- Boucle ----------
function draw() {
  if (trainer && running) {
    if (Trainer.backstage(trainer)) {
      Trainer.runBackstage(trainer);
    } else {
      const start = performance.now();
      for (let i = 0; i < simSpeed && performance.now() - start < STEP_BUDGET_MS; i++) Trainer.step(trainer);
    }
  }
  render();
  if (frameCount % 6 === 0) updateStats();
  if (frameCount % 10 === 0) drawNetwork();
  if (trainer && trainer.history.length !== chartGeneration) drawChart();
}

// ---------- Vue : tout le circuit ----------
function circuit() {
  return trainer ? trainer.circuit : home;
}

// Le décor n'est redessiné qu'à l'affichage : en accéléré, les circuits sautés ne coûtent rien.
function bakedFor(c) {
  if (!bakedCache.has(c)) {
    for (const key of bakedCache.keys()) if (key !== home) bakedCache.delete(key);
    bakedCache.set(c, TrackPainter.bake(c.track, []));
  }
  return bakedCache.get(c);
}

function view(track) {
  // Les bornes du circuit ont une grande marge (décor) : on en garde une partie seulement.
  const b = track.bounds;
  const crop = 200;
  const w = b.w - crop * 2;
  const h = b.h - crop * 2;
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.min(width / w, height / h) };
}

function render() {
  const ctx = drawingContext;
  const c = circuit();
  const baked = bakedFor(c);
  const v = view(c.track);
  ctx.save();
  ctx.fillStyle = '#2f5d22';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(v.zoom, v.zoom);
  ctx.translate(-v.x, -v.y);
  ctx.drawImage(baked.canvas, baked.origin.x, baked.origin.y);
  // Génération 1 jouée en coulisses : on montre le circuit vide.
  if (trainer && !Trainer.backstage(trainer)) {
    const lead = Trainer.leader(trainer);
    for (const car of trainer.cars) {
      if (!car.alive) continue;
      if (allRays && car !== lead) drawRays(ctx, car.pos, car.rays, v.zoom, 0.35);
      drawCar(ctx, car, v.zoom);
    }
    if (lead) {
      drawRays(ctx, lead.pos, lead.rays, v.zoom, 1);
      ring(ctx, lead.pos, v.zoom);
    }
  } else if (!trainer) {
    drawPreview(ctx, v.zoom);
  }
  ctx.restore();
  drawBanner(ctx);
}

// Avant l'entraînement : une voiture sur la ligne de départ montre les rayons réglés.
function drawPreview(ctx, zoom) {
  const pose = Trainer.startPose(home.track);
  const rays = TrackSensors.read(home.sensors, pose, pose.angle, Trainer.rayAngles(settings), settings.rayLength);
  drawRays(ctx, pose, rays, zoom, 1);
  drawCar(ctx, {
    pos: pose, angle: pose.angle, length: 34, width: 15, throttle: 0, drafting: false, vel: { mag: () => 0 },
    team: { colors: NeuralCar.COLORS.elite, number: '' },
  }, zoom);
  ring(ctx, pose, zoom);
}

// Vue de loin : les voitures sont dessinées un peu plus grandes pour rester visibles
// (dessin seulement, la simulation garde leur vraie taille).
function drawCar(ctx, car, zoom) {
  const k = Math.min(1.8, Math.max(1, 0.6 / zoom));
  ctx.save();
  ctx.translate(car.pos.x, car.pos.y);
  ctx.scale(k, k);
  ctx.translate(-car.pos.x, -car.pos.y);
  CarPainter.draw(ctx, car);
  ctx.restore();
}

// Rayon : vert s'il ne touche rien, de l'orange au rouge quand le bord est proche.
function drawRays(ctx, origin, rays, zoom, alpha) {
  if (!rays.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.6 / zoom;
  for (const ray of rays) {
    const closeness = 1 - ray.distance / settings.rayLength;
    const hit = closeness > 1e-6;
    ctx.strokeStyle = hit ? `hsl(${Math.round(45 * (1 - closeness))}, 100%, 55%)` : 'rgba(140, 255, 160, 0.85)';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(ray.x, ray.y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(ray.x, ray.y, (hit ? 3.5 : 2.5) / zoom, 0, Math.PI * 2);
    if (hit) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}

function ring(ctx, pos, zoom) {
  ctx.save();
  ctx.strokeStyle = '#ffd600';
  ctx.lineWidth = 2.5 / zoom;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 14 / zoom + 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBanner(ctx) {
  const text = !trainer ? 'Réglez les curseurs, puis démarrez l\'entraînement'
    : Trainer.backstage(trainer)
      ? `Génération 1 en coulisses (cerveaux au hasard)… ${Math.round(100 * trainer.frame / (settings.generationTime * Trainer.FRAMES_PER_SECOND))} %`
    : `${trainer.championOnly ? 'Champion seul' : `Génération ${trainer.generation}`} · ${trainer.circuit.name}${running ? '' : ' · arrêté'}`;
  ctx.save();
  ctx.font = '700 18px "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = 'rgba(10, 12, 16, 0.72)';
  ctx.beginPath();
  ctx.roundRect(16, 16, w, 38, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 30, 41);
  ctx.restore();
}

// ---------- Panneau : réseau et courbe ----------
// Schéma du réseau : une colonne par couche. Pendant l'entraînement, les poids et les activations
// sont ceux de la voiture en tête (jaune = positif, bleu = négatif, épaisseur = force).
function drawNetwork() {
  const canvas = $('network');
  const g = canvas.getContext('2d');
  const lead = trainer && Trainer.leader(trainer);
  const brain = lead ? lead.brain : previewBrain;
  const sizes = brain.sizes;
  const values = lead && lead.inputs.length ? brain.layers(lead.inputs) : null;
  const W = canvas.width;
  const H = canvas.height;
  const padX = 110;
  const padY = 22;
  const col = l => padX + (W - padX * 2) * l / (sizes.length - 1);
  const rowY = (l, i) => sizes[l] === 1 ? H / 2 : padY + (H - padY * 2) * i / (sizes[l] - 1);
  g.clearRect(0, 0, W, H);
  for (let l = 0; l < sizes.length - 1; l++) {
    const w = brain.weights[l];
    for (let j = 0; j < sizes[l + 1]; j++) {
      for (let i = 0; i < sizes[l]; i++) {
        const weight = w[j * sizes[l] + i];
        g.strokeStyle = weight > 0 ? 'rgba(255, 214, 0, ' : 'rgba(79, 195, 247, ';
        g.strokeStyle += `${Math.min(0.8, Math.abs(weight) * 0.35 + 0.05)})`;
        g.lineWidth = Math.min(3, Math.abs(weight) * 1.2 + 0.3);
        g.beginPath();
        g.moveTo(col(l), rowY(l, i));
        g.lineTo(col(l + 1), rowY(l + 1, j));
        g.stroke();
      }
    }
  }
  const radius = Math.max(4, Math.min(11, (H - padY * 2) / Math.max(...sizes) / 2.6));
  g.font = '600 22px "Segoe UI", system-ui, sans-serif';
  g.textBaseline = 'middle';
  sizes.forEach((count, l) => {
    for (let i = 0; i < count; i++) {
      const a = values ? values[l][i] : 0;
      g.fillStyle = a >= 0 ? `rgba(255, 214, 0, ${0.25 + 0.75 * Math.min(1, a)})` : `rgba(79, 195, 247, ${0.25 + 0.75 * Math.min(1, -a)})`;
      g.strokeStyle = '#0f1318';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(col(l), rowY(l, i), radius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  });
  g.fillStyle = 'rgba(244, 246, 248, 0.75)';
  g.textAlign = 'right';
  const inputs = sizes[0];
  if (inputs <= 9) {
    for (let i = 0; i < inputs; i++) g.fillText(i === inputs - 1 ? 'vitesse' : `rayon ${i + 1}`, col(0) - radius - 6, rowY(0, i));
  } else {
    g.fillText(`${inputs - 1} rayons`, col(0) - radius - 6, H / 2 - 12);
    g.fillText('+ vitesse', col(0) - radius - 6, H / 2 + 12);
  }
  g.textAlign = 'left';
  const last = sizes.length - 1;
  ['virage', 'vitesse'].forEach((label, i) => g.fillText(label, col(last) + radius + 6, rowY(last, i)));
}

// Courbe d'apprentissage : meilleure voiture et moyenne de chaque génération, en tours.
function drawChart() {
  const canvas = $('chart');
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const history = trainer ? trainer.history : [];
  chartGeneration = history.length;
  g.clearRect(0, 0, W, H);
  g.font = '600 18px "Segoe UI", system-ui, sans-serif';
  g.fillStyle = 'rgba(244, 246, 248, 0.6)';
  if (!history.length) {
    g.textAlign = 'center';
    g.fillText('La courbe apparaît après la première génération', W / 2, H / 2);
    return;
  }
  // Chaque génération en tours de son propre circuit.
  const laps = history.map(h => ({ best: h.laps, mean: h.meanLaps, test: h.test }));
  const top = Math.max(1, ...laps.map(p => p.best)) * 1.1;
  const left = 46;
  const bottom = H - 30;
  const x = i => left + (W - left - 12) * (laps.length === 1 ? 0.5 : i / (laps.length - 1));
  const y = v => bottom - (bottom - 12) * v / top;
  g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  g.lineWidth = 1;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let t = 0; t <= top; t += top > 4 ? 1 : 0.5) {
    g.beginPath();
    g.moveTo(left, y(t));
    g.lineTo(W - 12, y(t));
    g.stroke();
    g.fillText(String(t), left - 8, y(t));
  }
  g.textAlign = 'left';
  g.fillText(`gén. ${history[0].generation}`, left, H - 12);
  g.textAlign = 'right';
  g.fillText(`gén. ${history[history.length - 1].generation}`, W - 12, H - 12);
  for (const [key, color] of [['mean', '#4fc3f7'], ['test', '#69f0ae'], ['best', '#ffd600']]) {
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    let started = false;
    laps.forEach((p, i) => {
      // Anciennes sauvegardes : pas de score de test, la courbe commence plus tard.
      if (!Number.isFinite(p[key])) return;
      if (started) g.lineTo(x(i), y(p[key]));
      else g.moveTo(x(i), y(p[key]));
      started = true;
    });
    g.stroke();
    if (laps.length === 1 && Number.isFinite(laps[0][key])) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x(0), y(laps[0][key]), 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function updateStats() {
  if (!trainer) {
    for (const id of ['generation', 'alive', 'time', 'lead', 'champion']) $(id).textContent = '—';
    $('circuit').textContent = home.name;
    return;
  }
  const L = trainer.track.length;
  $('circuit').textContent = trainer.circuit.name;
  const lead = Trainer.leader(trainer);
  $('generation').textContent = trainer.championOnly ? 'champion' : String(trainer.generation);
  $('alive').textContent = `${Trainer.alive(trainer).length} / ${trainer.cars.length}`;
  $('time').textContent = `${(trainer.frame / Trainer.FRAMES_PER_SECOND).toFixed(1)} / ${settings.generationTime} s`;
  $('lead').textContent = lead ? `${(lead.fitness() / L).toFixed(2)} tour` : '—';
  $('champion').textContent = trainer.champion
    ? `${trainer.champion.score.toFixed(2)} tours en test (génération ${trainer.champion.generation})` : '—';
}

// ---------- Réglages ----------
function formatSetting(name, value) {
  const text = value.toFixed(Trainer.SETTINGS[name].decimals);
  return UNITS[name] ? UNITS[name](text) : text;
}

function bindSettings() {
  for (const name of Object.keys(Trainer.SETTINGS)) {
    const input = $(`set-${name}`);
    const output = $(`${name}-value`);
    input.value = settings[name];
    output.value = formatSetting(name, settings[name]);
    input.addEventListener('input', () => {
      Trainer.setSetting(settings, name, Number(input.value), trainer);
      output.value = formatSetting(name, settings[name]);
      if (Trainer.SETTINGS[name].topology) refreshArchitecture();
    });
  }
}

function syncSliders() {
  for (const name of Object.keys(Trainer.SETTINGS)) {
    $(`set-${name}`).value = settings[name];
    $(`${name}-value`).value = formatSetting(name, settings[name]);
  }
}

function refreshArchitecture() {
  const sizes = Evolution.architecture(settings);
  $('architecture').textContent = sizes.join(' → ');
  if (!previewBrain || previewBrain.sizes.join() !== sizes.join()) previewBrain = new NeuralNetwork(sizes);
  drawNetwork();
}

// ---------- Commandes ----------
function bindControls() {
  $('run').addEventListener('click', () => {
    if (!trainer) {
      trainer = Trainer.create(settings);
      Trainer.setRandomTracks(trainer, randomTracks);
      running = true;
      setStatus('');
    } else {
      running = !running;
    }
    refreshControls();
  });
  $('reset').addEventListener('click', () => {
    if (trainer && !confirm('Effacer cet entraînement ? Pensez à le sauvegarder avant.')) return;
    trainer = null;
    running = false;
    $('champion-only').checked = false;
    refreshArchitecture();
    refreshControls();
    drawChart();
  });
  $('sim-speed').addEventListener('input', event => {
    simSpeed = Number(event.target.value);
    $('sim-speed-value').value = `×${simSpeed}`;
  });
  $('all-rays').addEventListener('change', event => { allRays = event.target.checked; });
  $('random-tracks').addEventListener('change', event => {
    randomTracks = event.target.checked;
    if (trainer) Trainer.setRandomTracks(trainer, randomTracks);
  });
  $('champion-only').addEventListener('change', event => {
    if (!Trainer.setChampionOnly(trainer, event.target.checked)) {
      event.target.checked = false;
      setStatus('Pas encore de champion : attendez la fin de la première génération.', true);
    }
  });
  $('save').addEventListener('click', saveTraining);
  $('load').addEventListener('click', loadTraining);
}

// Boutons et verrouillage de l'architecture selon l'état : réglage, entraînement, arrêt.
function refreshControls() {
  $('run').textContent = !trainer ? '▶ Démarrer l\'entraînement' : running ? '⏸ Arrêter' : '▶ Reprendre';
  $('reset').disabled = !trainer;
  $('save').disabled = !trainer;
  $('champion-only').disabled = !trainer;
  for (const input of document.querySelectorAll('[data-topology]')) input.disabled = Boolean(trainer);
  $('lock-note').hidden = !trainer;
}

function setStatus(text, error = false) {
  const status = $('save-status');
  status.textContent = text;
  status.classList.toggle('error', error);
}

async function saveTraining() {
  try {
    const name = $('save-name').value;
    const result = await SaveFile.save(Trainer.serialize(trainer, name.trim() || 'entrainement'), name);
    if (result) setStatus(`Enregistré : ${result.name} (${result.where}), génération ${trainer.generation}.`);
  } catch (error) {
    setStatus(`Échec de l'enregistrement : ${error.message}`, true);
  }
}

async function loadTraining() {
  if (trainer && !confirm('Remplacer l\'entraînement en cours par une sauvegarde ?')) return;
  try {
    const file = await SaveFile.open();
    if (!file) return;
    const loaded = Trainer.deserialize(file.data);
    Object.assign(settings, loaded.settings);
    trainer = Trainer.create(settings, Math.random, loaded.saved);
    running = false;
    randomTracks = trainer.randomTracks;
    $('random-tracks').checked = randomTracks;
    $('champion-only').checked = false;
    $('save-name').value = loaded.name || file.name.replace(/\.json$/i, '');
    syncSliders();
    refreshArchitecture();
    refreshControls();
    drawChart();
    setStatus(`Chargé : ${file.name}, génération ${trainer.generation}. Cliquez sur Reprendre.`);
  } catch (error) {
    setStatus(`Impossible de charger : ${error.message}`, true);
  }
}

function windowResized() {
  const stage = $('stage');
  resizeCanvas(stage.clientWidth, stage.clientHeight);
}
