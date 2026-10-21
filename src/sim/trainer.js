// Entraînement : une génération de voitures roule jusqu'à ce que toutes soient éliminées ou que
// le temps soit écoulé ; leurs scores produisent la génération suivante (evolution.js), qui roule
// sur un nouveau circuit (trackGenerator.js) si randomTracks est vrai.
// Réglages, champion, historique, sauvegarde. Aucun dessin ici.
const Trainer = (() => {
  // Bornes des curseurs. topology : change l'architecture du réseau, donc verrouillé pendant l'entraînement.
  const SETTINGS = {
    rays: { min: 1, max: 15, step: 1, initial: 7, decimals: 0, topology: true },
    spread: { min: 10, max: 360, step: 5, initial: 180, decimals: 0 },
    rayLength: { min: 50, max: 600, step: 10, initial: 250, decimals: 0 },
    maxSpeed: { min: 1, max: 15, step: 0.5, initial: 10, decimals: 1 },
    maxForce: { min: 0.05, max: 1, step: 0.05, initial: 0.2, decimals: 2 },
    hiddenLayers: { min: 1, max: 4, step: 1, initial: 1, decimals: 0, topology: true },
    hiddenSize: { min: 2, max: 32, step: 1, initial: 8, decimals: 0, topology: true },
    population: { min: 10, max: 200, step: 10, initial: 50, decimals: 0 },
    mutationRate: { min: 0, max: 0.5, step: 0.01, initial: 0.1, decimals: 2 },
    generationTime: { min: 10, max: 120, step: 5, initial: 45, decimals: 0 },
  };
  const FRAMES_PER_SECOND = 60;
  // Circuits de test, jamais utilisés pour l'entraînement : la meilleure voiture de chaque
  // génération y roule seule TEST_SECONDS secondes sur chacun. Son score de test est la moyenne
  // des tours parcourus ; le champion est la voiture au meilleur score de test. Ainsi le champion
  // est celle qui conduit le mieux sur des circuits inconnus, pas celle qui a eu un circuit facile.
  const TEST_SEEDS = [1001, 2002, 3003, 4004];
  const TEST_SECONDS = 20;
  const FORMAT = 'darwin-gp';
  // Nom du projet avant Darwin GP : ses sauvegardes se rechargent aussi.
  const LEGACY_FORMATS = ['neuro-racing'];
  // Génération 1 (cerveaux au hasard) jouée en coulisses : temps de calcul par image (ms).
  const BACKSTAGE_BUDGET_MS = 120;
  const VERSION = 2;

  function initialSettings() {
    return Object.fromEntries(Object.entries(SETTINGS).map(([name, range]) => [name, range.initial]));
  }

  function checkSetting(name, value) {
    const range = SETTINGS[name];
    if (!range || !Number.isFinite(value) || value < range.min || value > range.max
      || (range.decimals === 0 && !Number.isInteger(value))) {
      throw new RangeError(`${name} doit être un nombre entre ${range?.min} et ${range?.max}.`);
    }
  }

  // Change un réglage. Pendant un entraînement, l'architecture est verrouillée ; vitesse et force
  // s'appliquent tout de suite aux voitures, la population et le temps à la prochaine génération.
  function setSetting(settings, name, value, trainer = null) {
    checkSetting(name, value);
    if (trainer && SETTINGS[name].topology && value !== trainer.settings[name]) {
      throw new Error(`${name} est verrouillé pendant l'entraînement : réinitialiser pour le changer.`);
    }
    settings[name] = value;
    if (trainer && (name === 'maxSpeed' || name === 'maxForce')) for (const car of trainer.cars) car[name] = value;
  }

  // Angles des rayons (radians, relatifs au cap) d'après le nombre et l'ouverture (degrés).
  function rayAngles(settings) {
    return TrackSensors.rayAngles(settings.rays, settings.spread * Math.PI / 180);
  }

  // Position et cap de départ : sur la ligne de départ, dans le sens de la piste.
  function startPose(track) {
    const p = Track.pointAt(track, 0, 0);
    const t = Track.tangentAt(track, 0);
    return { x: p.x, y: p.y, angle: Math.atan2(t.y, t.x) };
  }

  function spawn(trainer, brains, elites = 0) {
    const pose = startPose(trainer.track);
    trainer.cars = brains.map((brain, i) => {
      const car = new NeuralCar(pose.x, pose.y, pose.angle, brain, trainer.settings, i < elites);
      car.placeOnTrack(trainer.track);
      return car;
    });
    trainer.brains = brains;
    trainer.elites = elites;
    trainer.frame = 0;
  }

  // Circuit courant : { seed, name, track, sensors } (trackGenerator.js).
  function useCircuit(trainer, circuit) {
    trainer.circuit = circuit;
    trainer.track = circuit.track;
    trainer.sensors = circuit.sensors;
  }

  // Nouvel entraînement (cerveaux au hasard, sur Prairie GP), ou reprise d'une sauvegarde
  // (saved, voir deserialize : même génération, mêmes cerveaux, même circuit).
  function create(settings, rng = Math.random, saved = null) {
    for (const name of Object.keys(SETTINGS)) checkSetting(name, settings[name]);
    const sizes = Evolution.architecture(settings);
    const trainer = {
      settings, rng, sizes,
      generation: saved?.generation ?? 1,
      history: saved?.history ?? [],
      champion: saved?.champion ?? null,
      championOnly: false,
      // Nouveau circuit à chaque génération (sinon toujours le même).
      randomTracks: saved?.randomTracks ?? true,
      cars: [], brains: [], elites: 0, frame: 0,
    };
    useCircuit(trainer, TrackGenerator.circuit(saved?.trackSeed ?? null));
    // Champion d'une ancienne sauvegarde sans score de test : on le teste.
    if (trainer.champion && !Number.isFinite(trainer.champion.score)) {
      trainer.champion.score = testScore(trainer.champion.brain, settings);
    }
    const brains = saved?.brains ?? Evolution.randomBrains(settings.population, sizes, rng);
    for (const brain of brains) {
      if (brain.sizes.join() !== sizes.join()) throw new RangeError('Cerveau incompatible avec les réglages.');
    }
    spawn(trainer, brains, saved?.elites ?? 0);
    return trainer;
  }

  let testCircuits = null;

  function tests() {
    if (!testCircuits) testCircuits = TEST_SEEDS.map(seed => TrackGenerator.circuit(seed));
    return testCircuits;
  }

  // Une voiture seule sur un circuit pendant seconds secondes (ou jusqu'à son élimination).
  // Renvoie la distance parcourue en tours de ce circuit.
  function drive(brain, settings, circuit, seconds = TEST_SECONDS) {
    const pose = startPose(circuit.track);
    const car = new NeuralCar(pose.x, pose.y, pose.angle, brain, settings);
    car.placeOnTrack(circuit.track);
    const angles = rayAngles(settings);
    for (let frame = 0; frame < seconds * FRAMES_PER_SECOND && car.alive; frame++) {
      car.applyBehaviors(circuit.sensors, angles, settings.rayLength);
      car.update();
      car.followTrack(circuit.track);
    }
    return car.fitness() / circuit.track.length;
  }

  // Score de test : moyenne des tours sur les circuits de test.
  function testScore(brain, settings) {
    const circuits = tests();
    return circuits.reduce((sum, c) => sum + drive(brain, settings, c), 0) / circuits.length;
  }

  // Prend effet à la génération suivante.
  function setRandomTracks(trainer, on) {
    trainer.randomTracks = Boolean(on);
  }

  function alive(trainer) {
    return trainer.cars.filter(car => car.alive);
  }

  // Voiture en tête : la plus grande distance, parmi les voitures encore en course si possible.
  function leader(trainer) {
    const pool = alive(trainer).length ? alive(trainer) : trainer.cars;
    return pool.reduce((best, car) => (!best || car.bestProgress > best.bestProgress ? car : best), null);
  }

  function nextCircuit(trainer) {
    if (trainer.randomTracks) useCircuit(trainer, TrackGenerator.circuit(TrackGenerator.randomSeed(trainer.rng)));
  }

  // Fin de génération : score, test de la meilleure voiture, historique, champion, génération
  // suivante, puis nouveau circuit. En mode champion seul, le champion repart, sans évolution.
  // Sélection en px (distance parcourue, même circuit pour tous) ; l'historique donne les tours.
  function endGeneration(trainer) {
    if (trainer.championOnly) {
      nextCircuit(trainer);
      spawn(trainer, [trainer.champion.brain], 1);
      return;
    }
    const length = trainer.track.length;
    const scored = trainer.cars.map(car => ({ brain: car.brain, fitness: car.fitness() }));
    const best = scored.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    const mean = scored.reduce((sum, s) => sum + s.fitness, 0) / scored.length;
    const test = testScore(best.brain, trainer.settings);
    trainer.history.push({
      generation: trainer.generation, track: trainer.circuit.seed,
      best: best.fitness, mean, laps: best.fitness / length, meanLaps: mean / length, test,
    });
    if (!trainer.champion || test > trainer.champion.score) {
      trainer.champion = { brain: best.brain.copy(), score: test, generation: trainer.generation };
    }
    const next = Evolution.nextGeneration(scored, trainer.settings.population, trainer.settings.mutationRate, trainer.rng);
    trainer.generation++;
    nextCircuit(trainer);
    spawn(trainer, next.brains, next.elites);
  }

  // Une image de simulation. Renvoie true si une génération vient de se terminer.
  function step(trainer) {
    const angles = rayAngles(trainer.settings);
    for (const car of trainer.cars) {
      if (!car.alive) continue;
      car.applyBehaviors(trainer.sensors, angles, trainer.settings.rayLength);
      car.update();
      car.followTrack(trainer.track);
    }
    trainer.frame++;
    if (!alive(trainer).length || trainer.frame >= trainer.settings.generationTime * FRAMES_PER_SECOND) {
      endGeneration(trainer);
      return true;
    }
    return false;
  }

  // Génération 1 : des cerveaux tirés au hasard, qui s'écrasent presque tous en quelques secondes.
  // Elle n'est pas montrée : elle se joue en coulisses, à pleine vitesse, et la course affichée
  // commence à la génération 2.
  function backstage(trainer) {
    return trainer.generation === 1 && !trainer.championOnly;
  }

  // Joue la génération en coulisses pendant au plus budgetMs ms. Renvoie true quand elle est finie.
  function runBackstage(trainer, budgetMs = BACKSTAGE_BUDGET_MS, now = () => performance.now()) {
    const start = now();
    while (backstage(trainer) && now() - start < budgetMs) step(trainer);
    return !backstage(trainer);
  }

  // Champion seul : la génération en cours repart avec le seul champion, sans évolution ; la
  // population est mise de côté puis repart telle quelle quand on revient à l'entraînement.
  // Renvoie false s'il n'y a pas encore de champion.
  function setChampionOnly(trainer, on) {
    if (on === trainer.championOnly) return true;
    if (on) {
      if (!trainer.champion) return false;
      trainer.populationBrains = trainer.brains;
      trainer.populationElites = trainer.elites;
      trainer.championOnly = true;
      spawn(trainer, [trainer.champion.brain], 1);
    } else {
      trainer.championOnly = false;
      spawn(trainer, trainer.populationBrains, trainer.populationElites);
    }
    return true;
  }

  // Contenu du fichier de sauvegarde (JSON).
  function serialize(trainer, name) {
    const brains = trainer.championOnly ? trainer.populationBrains : trainer.brains;
    const elites = trainer.championOnly ? trainer.populationElites : trainer.elites;
    const champion = trainer.champion;
    return {
      format: FORMAT, version: VERSION, name, savedAt: new Date().toISOString(),
      settings: { ...trainer.settings },
      randomTracks: trainer.randomTracks,
      trackSeed: trainer.circuit.seed,
      generation: trainer.generation,
      history: trainer.history,
      champion: champion
        ? { brain: champion.brain.toJSON(), score: champion.score, generation: champion.generation }
        : null,
      elites,
      population: brains.map(brain => brain.toJSON()),
    };
  }

  // Lecture d'une sauvegarde : vérifie le format et l'architecture. Renvoie de quoi appeler create().
  // Version 1 (avant les circuits aléatoires) : tout s'est passé sur Prairie GP.
  function deserialize(data) {
    if (!data || (data.format !== FORMAT && !LEGACY_FORMATS.includes(data.format))) {
      throw new Error('Ce fichier n\'est pas une sauvegarde d\'entraînement.');
    }
    if (data.version !== 1 && data.version !== VERSION) throw new Error(`Version de sauvegarde inconnue : ${data.version}.`);
    const settings = initialSettings();
    for (const name of Object.keys(SETTINGS)) {
      if (data.settings?.[name] !== undefined) {
        checkSetting(name, data.settings[name]);
        settings[name] = data.settings[name];
      }
    }
    const sizes = Evolution.architecture(settings).join();
    const brains = (data.population ?? []).map(json => NeuralNetwork.fromJSON(json));
    if (!brains.length) throw new Error('La sauvegarde ne contient aucune voiture.');
    const prairie = TrackGenerator.circuit(null).track.length;
    // Version 1 : pas de score de test, il sera calculé par create().
    const champion = data.champion
      ? { brain: NeuralNetwork.fromJSON(data.champion.brain), score: data.champion.score ?? null,
        generation: data.champion.generation }
      : null;
    for (const brain of champion ? [...brains, champion.brain] : brains) {
      if (brain.sizes.join() !== sizes) throw new Error('Les cerveaux ne correspondent pas aux réglages de la sauvegarde.');
    }
    const history = (data.history ?? []).map(h => ({
      track: null, laps: h.best / prairie, meanLaps: h.mean / prairie, test: null, ...h,
    }));
    const trackSeed = Number.isInteger(data.trackSeed) ? data.trackSeed : null;
    return {
      name: data.name ?? '', settings,
      saved: { generation: data.generation ?? 1, history, champion, brains, elites: data.elites ?? 0,
        randomTracks: data.randomTracks ?? true, trackSeed },
    };
  }

  return { SETTINGS, FRAMES_PER_SECOND, TEST_SEEDS, TEST_SECONDS, FORMAT, LEGACY_FORMATS, VERSION, BACKSTAGE_BUDGET_MS,
    backstage, runBackstage, initialSettings, checkSetting, setSetting, rayAngles,
    startPose, tests, drive, testScore, create, setRandomTracks, alive, leader, endGeneration, step, setChampionOnly, serialize, deserialize };
})();
