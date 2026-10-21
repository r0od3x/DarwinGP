// Circuits aléatoires : un nouveau tracé à chaque génération, pour que les voitures apprennent à
// conduire sur n'importe quelle piste au lieu d'apprendre un seul circuit par cœur.
// Un circuit est défini par une graine (seed) : la même graine redonne le même circuit.
// Graine null : le circuit d'origine « Prairie GP ».
const TrackGenerator = (() => {
  // Zone où tient le circuit (même taille que Prairie GP) : centre et demi-axes de l'ellipse (px).
  const CENTER = { x: 1650, y: 1000 };
  const RADII = { x: 1250, y: 700 };
  // Points de contrôle autour de l'ellipse ; rayon tiré entre MIN_SCALE et 1 fois le demi-axe.
  const POINTS = [10, 14];
  const MIN_SCALE = 0.5;
  // Rayon de virage minimal (px), comme le virage le plus serré de Prairie GP.
  const MIN_RADIUS = 38;
  // Deux portions éloignées le long de la piste (plus de 2 × FAR px) restent à FAR px au moins
  // (place pour les bacs à gravier) ; les deux branches d'une épingle, à NEAR px au moins.
  const FAR = 300;
  const NEAR = 150;
  const HAIRPIN_ARC = 200;
  // La ligne de départ est sur une portion presque droite : courbure maximale autour du départ,
  // de START_BEFORE px avant à START_AFTER px après.
  const START_CURVATURE = 0.003;
  const START_BEFORE = 80;
  const START_AFTER = 200;
  const ATTEMPTS = 60;

  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  function randomSeed(rng = Math.random) {
    return 1 + Math.floor(rng() * 2147483646);
  }

  // Points de contrôle tirés autour de l'ellipse, dans l'ordre des angles : la boucle ne se croise pas.
  // Une fois sur deux, le sens de parcours est inversé.
  function controlPoints(rng) {
    const count = POINTS[0] + Math.floor(rng() * (POINTS[1] - POINTS[0] + 1));
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = ((i + (rng() - 0.5) * 0.6) / count) * Math.PI * 2;
      const scale = MIN_SCALE + (1 - MIN_SCALE) * rng();
      points.push([CENTER.x + Math.cos(angle) * RADII.x * scale, CENTER.y + Math.sin(angle) * RADII.y * scale]);
    }
    return rng() < 0.5 ? points : points.reverse();
  }

  // Raison du refus d'un circuit, ou null s'il est valable.
  function problem(track) {
    const tightest = Math.max(...track.curvature.map(Math.abs));
    if (1 / tightest < MIN_RADIUS) return 'virage trop serré';
    const { points, n, step } = track;
    for (let k = -Math.round(START_BEFORE / step); k <= Math.round(START_AFTER / step); k++) {
      if (Math.abs(track.curvature[(k + n) % n]) > START_CURVATURE) return 'départ dans un virage';
    }
    const hairpin = Math.ceil(HAIRPIN_ARC / step);
    const far = Math.ceil((FAR * 2) / step);
    for (let i = 0; i < n; i += 2) {
      for (let j = i + hairpin; j < n; j += 2) {
        const arc = Math.min(j - i, n - (j - i));
        if (arc < hairpin) continue;
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        if (d < (arc > far ? FAR : NEAR)) return 'portions trop proches';
      }
    }
    return null;
  }

  let prairie = null;

  // Circuit de la graine : { seed, track, sensors }. Si aucun tirage n'est valable, Prairie GP.
  function circuit(seed = null) {
    if (seed === null) {
      if (!prairie) {
        const track = Track.build();
        prairie = { seed: null, name: 'Prairie GP', track, sensors: TrackSensors.build(track) };
      }
      return prairie;
    }
    const rng = seeded(seed);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const track = Track.build(controlPoints(rng));
      if (!problem(track)) return { seed, name: `Circuit #${seed}`, track, sensors: TrackSensors.build(track) };
    }
    return circuit(null);
  }

  return { CENTER, RADII, POINTS, MIN_SCALE, MIN_RADIUS, FAR, NEAR, HAIRPIN_ARC, START_CURVATURE, ATTEMPTS,
    seeded, randomSeed, controlPoints, problem, circuit };
})();
