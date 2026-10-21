// Géométrie du circuit (aucun dessin ici, voir trackPainter.js).
// - Ligne médiane : spline de Catmull-Rom fermée passant par des points de contrôle, puis
//   rééchantillonnée tous les SPACING px. Pour chaque point : tangente, normale, courbure.
// - Trajectoire de course : la ligne médiane décalée vers l'intérieur des virages (courbure
//   lissée sur une longue fenêtre : on entre large, on coupe la corde, on ressort large).
// - Profil de vitesse : vitesse maximale permise par l'adhérence dans chaque virage, puis
//   passe arrière qui ajoute les zones de freinage avant les virages.
const Track = (() => {
  // Circuit « Prairie GP » (px) : grande ligne droite en bas, virage à 90°, chicane, épingle en
  // haut à droite, enchaînement rapide, ligne droite arrière, grande courbe, double virage serré.
  const CONTROL = [
    [500, 1700], [1400, 1710], [2300, 1700], [2600, 1690], [2720, 1610], [2740, 1460],
    [2730, 1300], [2690, 1170], [2560, 1100], [2600, 980], [2760, 910], [2810, 700],
    [2860, 470], [2790, 320], [2620, 310], [2550, 450], [2440, 610], [2180, 600],
    [1930, 720], [1680, 640], [1460, 460], [1250, 330], [820, 300], [530, 380],
    [420, 620], [540, 860], [800, 960], [1010, 1110], [910, 1310], [650, 1360],
    [430, 1430], [400, 1600],
  ];
  const WIDTH = 120;
  const SPACING = 8;
  // Largeur des dégagements (herbe / gravier) avant les barrières, de chaque côté (px).
  const RUNOFF = 80;

  function catmullRom(control, samples = 24) {
    const pts = control.map(([x, y]) => ({ x, y }));
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      for (let k = 0; k < samples; k++) {
        const t = k / samples;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    return out;
  }

  // Points espacés de spacing px le long de la boucle.
  function resample(dense, spacing) {
    const n = dense.length;
    let total = 0;
    for (let i = 0; i < n; i++) total += Math.hypot(dense[(i + 1) % n].x - dense[i].x, dense[(i + 1) % n].y - dense[i].y);
    const count = Math.round(total / spacing);
    const step = total / count;
    const out = [];
    let i = 0;
    let travelled = 0;
    for (let k = 0; k < count; k++) {
      const goal = k * step;
      let a = dense[i];
      let b = dense[(i + 1) % n];
      let seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (travelled + seg < goal && i < n - 1) {
        travelled += seg;
        i++;
        a = dense[i];
        b = dense[(i + 1) % n];
        seg = Math.hypot(b.x - a.x, b.y - a.y);
      }
      const t = seg ? (goal - travelled) / seg : 0;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { points: out, step };
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Moyenne glissante circulaire sur ±half points.
  function smooth(values, half) {
    const n = values.length;
    return values.map((_, i) => {
      let sum = 0;
      for (let k = -half; k <= half; k++) sum += values[(i + k + n) % n];
      return sum / (half * 2 + 1);
    });
  }

  function curvatures(points, step) {
    const n = points.length;
    const headings = points.map((p, i) => {
      const a = points[(i - 1 + n) % n];
      const b = points[(i + 1) % n];
      return Math.atan2(b.y - a.y, b.x - a.x);
    });
    // Courbure = variation du cap par px parcouru (positive : on tourne vers la normale n).
    return headings.map((_, i) => angleDiff(headings[(i - 1 + n) % n], headings[(i + 1) % n]) / (2 * step));
  }

  // Indice de départ : après au moins `straight` px de ligne droite (la grille doit y tenir).
  function startIndex(curvature, step, straight = 600) {
    const n = curvature.length;
    const need = Math.round(straight / step);
    for (let i = 0; i < n; i++) {
      let ok = true;
      for (let k = 1; k <= need && ok; k++) ok = Math.abs(curvature[(i - k + n) % n]) < 0.0009;
      if (ok) return i;
    }
    return 0;
  }

  function build(control = CONTROL, width = WIDTH, spacing = SPACING) {
    const resampled = resample(catmullRom(control), spacing);
    const step = resampled.step;
    // La ligne de départ (s = 0) est placée sur la grande ligne droite.
    const first = startIndex(smooth(curvatures(resampled.points, step), 3), step);
    const points = resampled.points.slice(first).concat(resampled.points.slice(0, first));
    const n = points.length;
    const tangents = points.map((p, i) => {
      const a = points[(i - 1 + n) % n];
      const b = points[(i + 1) % n];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    });
    // Normale : tangente tournée de +90° (même sens que la courbure positive).
    const normals = tangents.map(t => ({ x: -t.y, y: t.x }));
    const curvature = smooth(curvatures(points, step), 3);
    // Trajectoire de course : décalage vers l'intérieur, d'après la courbure lissée sur ±200 px
    // (l'intérieur d'un virage de courbure positive est du côté +n).
    const maxOffset = width / 2 - 28;
    const wide = smooth(curvature, Math.round(200 / step));
    const offsets = smooth(wide.map(k => Math.max(-1, Math.min(1, k * 160)) * maxOffset), Math.round(60 / step));
    const racing = points.map((p, i) => ({ x: p.x + normals[i].x * offsets[i], y: p.y + normals[i].y * offsets[i] }));
    const racingCurvature = smooth(curvatures(racing, step), 4);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const margin = width / 2 + RUNOFF + 260;
    return {
      points, tangents, normals, curvature, offsets, racing, racingCurvature, n, step, width,
      length: n * step, runoff: RUNOFF,
      bounds: { x: minX - margin, y: minY - margin, w: maxX - minX + margin * 2, h: maxY - minY + margin * 2 },
    };
  }

  // Point de la ligne médiane le plus proche de pos. hint : indice connu (recherche locale ±window).
  function locate(track, pos, hint = null, window = 40) {
    const { points, normals, n, step } = track;
    let best = -1;
    let bestD = Infinity;
    const check = i => {
      const p = points[i];
      const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint === null) for (let i = 0; i < n; i++) check(i);
    else for (let k = -window; k <= window; k++) check((hint + k + n) % n);
    const p = points[best];
    const lateral = (pos.x - p.x) * normals[best].x + (pos.y - p.y) * normals[best].y;
    return { index: best, s: best * step, lateral, distance: Math.sqrt(bestD) };
  }

  // Valeur interpolée d'un tableau par point au curviligne s (boucle).
  function sample(track, values, s) {
    const f = ((s / track.step) % track.n + track.n) % track.n;
    const i = Math.floor(f);
    const t = f - i;
    return values[i] * (1 - t) + values[(i + 1) % track.n] * t;
  }

  // Point à l'abscisse s, décalé de lateral px le long de la normale.
  function pointAt(track, s, lateral = 0) {
    const f = ((s / track.step) % track.n + track.n) % track.n;
    const i = Math.floor(f);
    const t = f - i;
    const j = (i + 1) % track.n;
    const p = track.points;
    const nm = track.normals;
    const x = p[i].x * (1 - t) + p[j].x * t + (nm[i].x * (1 - t) + nm[j].x * t) * lateral;
    const y = p[i].y * (1 - t) + p[j].y * t + (nm[i].y * (1 - t) + nm[j].y * t) * lateral;
    return { x, y };
  }

  function tangentAt(track, s) {
    const i = Math.floor(((s / track.step) % track.n + track.n) % track.n);
    return track.tangents[i];
  }

  // Vitesse cible le long de la trajectoire de course : limite d'adhérence v = √(grip / courbure),
  // plafonnée à top, puis passe arrière (deux tours) : v[i] ≤ √(v[i+1]² + 2 × freinage × pas).
  function speedProfile(track, { grip, brake, top }) {
    const n = track.n;
    const v = track.racingCurvature.map(k => Math.min(top, Math.sqrt(grip / Math.max(1e-6, Math.abs(k)))));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = v[(i + 1) % n];
        v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * brake * track.step));
      }
    }
    return v;
  }

  // Écart signé entre deux abscisses sur la boucle (de a vers b, dans [-L/2, L/2]).
  function gap(track, a, b) {
    const L = track.length;
    let d = ((b - a) % L + L) % L;
    if (d > L / 2) d -= L;
    return d;
  }

  return { CONTROL, WIDTH, SPACING, RUNOFF, catmullRom, resample, smooth, curvatures, angleDiff, build,
    locate, sample, pointAt, tangentAt, speedProfile, gap };
})();
