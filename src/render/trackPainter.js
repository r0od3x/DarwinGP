// Décor du circuit, dessiné une fois sur un grand canvas (coordonnées du monde) : herbe tondue,
// bacs à gravier, barrières de pneus, rails, asphalte texturé, gomme de la trajectoire, lignes
// blanches, vibreurs, ligne de départ, cases de la grille, panneaux de freinage, tribunes, arbres.
// Plus un calque transparent pour les traces de pneus. Aucun effet sur la simulation.
const TrackPainter = (() => {
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  }

  function offsetPoints(track, lateral, from = 0, to = track.n) {
    const out = [];
    for (let i = from; i < to; i++) {
      const k = (i + track.n) % track.n;
      const d = typeof lateral === 'function' ? lateral(k) : lateral;
      out.push({ x: track.points[k].x + track.normals[k].x * d, y: track.points[k].y + track.normals[k].y * d });
    }
    return out;
  }

  function polyline(g, pts, closed) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    if (closed) g.closePath();
  }

  // Tronçons de virage (|courbure| > seuil), avec le côté extérieur (-signe de la courbure).
  function corners(track, threshold = 0.0024, pad = 10) {
    const hot = track.curvature.map(k => Math.abs(k) > threshold);
    const ranges = [];
    let i = 0;
    while (i < track.n) {
      if (!hot[i]) { i++; continue; }
      let j = i;
      while (j < track.n && hot[j]) j++;
      const mid = Math.floor((i + j) / 2);
      ranges.push({ from: i - pad, to: j + pad, outside: -Math.sign(track.curvature[mid]) });
      i = j;
    }
    return ranges;
  }

  function noiseTile(size, colors, count, seed, alpha = 1) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const rng = seeded(seed);
    for (let i = 0; i < count; i++) {
      g.globalAlpha = alpha * (0.4 + rng() * 0.6);
      g.fillStyle = colors[Math.floor(rng() * colors.length)];
      const s = 0.8 + rng() * 2.2;
      g.fillRect(rng() * size, rng() * size, s, s);
    }
    return c;
  }

  function grass(g, b, rng) {
    g.fillStyle = '#3d7a2a';
    g.fillRect(b.x, b.y, b.w, b.h);
    // Bandes de tonte en diagonale.
    g.save();
    g.translate(b.x + b.w / 2, b.y + b.h / 2);
    g.rotate(-0.5);
    const span = Math.hypot(b.w, b.h);
    for (let k = -span; k < span; k += 120) {
      g.fillStyle = (k / 120) % 2 ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.035)';
      g.fillRect(k, -span, 60, span * 2);
    }
    g.restore();
    g.fillStyle = g.createPattern(noiseTile(256, ['#2f6420', '#4f8f35', '#5b9c3c', '#356f25'], 2600, 5), 'repeat');
    g.fillRect(b.x, b.y, b.w, b.h);
  }

  function gravelTraps(g, track, ranges) {
    const half = track.width / 2;
    const depth = track.runoff;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const texture = g.createPattern(noiseTile(128, ['#b59f72', '#e2d2a8', '#9c8862', '#d6c495'], 1800, 9), 'repeat');
    for (const r of ranges) {
      const pts = offsetPoints(track, r.outside * (half + depth / 2 + 4), r.from, r.to);
      polyline(g, pts, false);
      g.strokeStyle = '#cbb88a';
      g.lineWidth = depth;
      g.stroke();
      g.strokeStyle = texture;
      g.stroke();
      // Barrière de pneus au bout du bac.
      const wall = offsetPoints(track, r.outside * (half + depth + 8), r.from, r.to);
      wall.forEach((p, i) => {
        if (i % 1) return;
        g.fillStyle = i % 4 < 2 ? '#1a1a1a' : (i % 8 < 4 ? '#e53935' : '#f5f5f5');
        g.beginPath();
        g.arc(p.x, p.y, 6, 0, Math.PI * 2);
        g.fill();
      });
    }
    g.restore();
  }

  function guardRails(g, track, ranges) {
    const half = track.width / 2;
    const inCorner = new Array(track.n).fill(false);
    for (const r of ranges) for (let i = r.from; i < r.to; i++) inCorner[(i + track.n) % track.n] = true;
    g.save();
    g.strokeStyle = '#b0bec5';
    g.lineWidth = 3;
    for (const side of [-1, 1]) {
      let run = [];
      for (let i = 0; i <= track.n; i++) {
        const k = i % track.n;
        const dist = track.width / 2 + track.runoff + 8;
        // Bac à gravier de ce côté, ou intérieur d'un virage trop serré (le rail se replierait).
        const folds = Math.sign(track.curvature[k]) === side && Math.abs(track.curvature[k]) * dist > 0.45;
        const corner = (inCorner[k] && -Math.sign(track.curvature[k]) === side) || folds;
        if (!corner) run.push(offsetPoints(track, side * (track.width / 2 + track.runoff + 8), k, k + 1)[0]);
        if ((corner || i === track.n) && run.length > 1) {
          polyline(g, run, false);
          g.stroke();
          run = [];
        }
      }
    }
    g.restore();
  }

  function asphalt(g, track, rng) {
    const half = track.width / 2;
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // Bord sombre sous l'asphalte (léger relief).
    polyline(g, track.points, true);
    g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    g.lineWidth = track.width + 16;
    g.stroke();
    g.strokeStyle = '#44474c';
    g.lineWidth = track.width;
    g.stroke();
    g.strokeStyle = g.createPattern(noiseTile(128, ['#5b5f66', '#33363a', '#4c5056', '#6a6e75'], 2400, 3, 0.7), 'repeat');
    g.stroke();
    // Gomme déposée sur la trajectoire de course.
    polyline(g, track.racing, true);
    for (const [w, a] of [[34, 0.07], [22, 0.08], [12, 0.08]]) {
      g.strokeStyle = `rgba(10, 10, 12, ${a})`;
      g.lineWidth = w;
      g.stroke();
    }
    // Lignes blanches de bord de piste.
    g.strokeStyle = 'rgba(245, 245, 245, 0.9)';
    g.lineWidth = 3;
    for (const side of [-1, 1]) {
      polyline(g, offsetPoints(track, side * (half - 3)), true);
      g.stroke();
    }
    g.restore();
  }

  function kerbs(g, track) {
    const half = track.width / 2;
    g.save();
    g.lineWidth = 10;
    g.lineCap = 'butt';
    for (let i = 0; i < track.n; i++) {
      const k = track.curvature[i];
      if (Math.abs(k) < 0.0022) continue;
      for (const side of [Math.sign(k), -Math.sign(k)]) {
        const [a, b] = offsetPoints(track, side * (half + 2), i, i + 2);
        g.strokeStyle = Math.floor(i / 2) % 2 ? '#e53935' : '#f5f5f5';
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
    g.restore();
  }

  // Ligne de départ en damier, cases de la grille et panneaux 300 / 200 / 100 avant le premier virage.
  function startArea(g, track, slots) {
    const half = track.width / 2;
    const p = track.points[0];
    const t = track.tangents[0];
    g.save();
    g.translate(p.x, p.y);
    g.rotate(Math.atan2(t.y, t.x));
    const sq = 8;
    for (let row = 0; row < 3; row++) {
      for (let k = -half; k < half; k += sq) {
        g.fillStyle = (Math.floor(k / sq) + row) % 2 ? '#111111' : '#fafafa';
        g.fillRect(-row * sq, k, sq, sq);
      }
    }
    g.restore();
    g.save();
    g.strokeStyle = 'rgba(250, 250, 250, 0.85)';
    g.lineWidth = 2;
    for (const slot of slots) {
      g.save();
      g.translate(slot.x, slot.y);
      g.rotate(slot.angle);
      g.beginPath();
      g.moveTo(22, -11);
      g.lineTo(26, -11);
      g.lineTo(26, 11);
      g.lineTo(22, 11);
      g.stroke();
      g.restore();
    }
    g.restore();
    // Panneaux de freinage avant le premier gros virage.
    const firstCorner = track.curvature.findIndex((k, i) => i > 10 && Math.abs(k) > 0.003);
    if (firstCorner > 0) {
      [300, 200, 100].forEach((d, idx) => {
        const i = Math.round(firstCorner - d / track.step);
        const q = offsetPoints(track, -Math.sign(track.curvature[firstCorner]) * (half + 26), i, i + 1)[0];
        g.fillStyle = '#fafafa';
        g.fillRect(q.x - 9, q.y - 6, 18, 12);
        g.fillStyle = '#111111';
        g.font = 'bold 8px sans-serif';
        g.textAlign = 'center';
        g.fillText(String(d), q.x, q.y + 3);
      });
    }
  }

  // Tribunes le long de la ligne droite de départ, côté extérieur, avec la foule et des panneaux.
  function grandstands(g, track, rng) {
    const half = track.width / 2;
    let cx = 0;
    let cy = 0;
    for (const p of track.points) { cx += p.x; cy += p.y; }
    cx /= track.n;
    cy /= track.n;
    const n0 = track.normals[Math.round(400 / track.step)];
    const p0 = track.points[Math.round(400 / track.step)];
    const side = (p0.x + n0.x * 10 - cx) ** 2 + (p0.y + n0.y * 10 - cy) ** 2 > (p0.x - cx) ** 2 + (p0.y - cy) ** 2 ? 1 : -1;
    const crowd = ['#ffd600', '#e53935', '#1e88e5', '#ffffff', '#43a047', '#ff7043', '#8e24aa', '#212121'];
    for (let s = 120; s < 1300; s += 230) {
      const i = Math.round(s / track.step);
      const p = track.points[i];
      const t = track.tangents[i];
      const n = track.normals[i];
      const base = half + track.runoff + 30;
      g.save();
      g.translate(p.x + n.x * side * (base + 35), p.y + n.y * side * (base + 35));
      g.rotate(Math.atan2(t.y, t.x));
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fillRect(-95, -32 + 6, 190, 70);
      g.fillStyle = '#90a4ae';
      g.fillRect(-100, -35, 200, 70);
      for (let row = 0; row < 6; row++) {
        g.fillStyle = row % 2 ? '#78909c' : '#a7b6be';
        g.fillRect(-96, -31 + row * 11, 192, 10);
        for (let k = 0; k < 40; k++) {
          if (rng() < 0.15) continue;
          g.fillStyle = crowd[Math.floor(rng() * crowd.length)];
          g.beginPath();
          g.arc(-92 + k * 4.7, -26 + row * 11, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = '#eceff1';
      g.fillRect(-100, side > 0 ? 30 : -38, 200, 8);
      g.restore();
      // Panneau publicitaire au bord du dégagement.
      g.save();
      g.translate(p.x + n.x * side * (half + track.runoff + 14), p.y + n.y * side * (half + track.runoff + 14));
      g.rotate(Math.atan2(t.y, t.x));
      g.fillStyle = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00'][Math.floor(s / 230) % 4];
      g.fillRect(-60, -4, 120, 8);
      g.fillStyle = '#ffffff';
      g.font = 'bold 7px sans-serif';
      g.textAlign = 'center';
      g.fillText(['PRAIRIE GP', 'REYNOLDS OIL', 'BOIDS TYRES', 'STEERING CO'][Math.floor(s / 230) % 4], 0, 2.5);
      g.restore();
    }
  }

  function trees(g, track, rng) {
    const b = track.bounds;
    const clear = track.width / 2 + track.runoff + 60;
    const greens = [['#2e7d32', '#1b5e20'], ['#388e3c', '#1e4d1f'], ['#43a047', '#2a5d2b'], ['#558b2f', '#33691e']];
    const spots = [];
    for (let k = 0; k < 900 && spots.length < 420; k++) {
      const x = b.x + rng() * b.w;
      const y = b.y + rng() * b.h;
      if (Track.locate(track, { x, y }).distance < clear) continue;
      // Les arbres poussent en bosquets : souvent près d'un arbre déjà placé.
      const near = spots.length && rng() < 0.6 ? spots[Math.floor(rng() * spots.length)] : null;
      const tx = near ? near.x + (rng() - 0.5) * 90 : x;
      const ty = near ? near.y + (rng() - 0.5) * 90 : y;
      if (Track.locate(track, { x: tx, y: ty }).distance < clear) continue;
      spots.push({ x: tx, y: ty, r: 14 + rng() * 18, c: greens[Math.floor(rng() * greens.length)] });
    }
    for (const t of spots) {
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      g.beginPath();
      g.arc(t.x + t.r * 0.35, t.y + t.r * 0.5, t.r, 0, Math.PI * 2);
      g.fill();
    }
    for (const t of spots) {
      const grad = g.createRadialGradient(t.x - t.r * 0.35, t.y - t.r * 0.35, t.r * 0.1, t.x, t.y, t.r);
      grad.addColorStop(0, t.c[0]);
      grad.addColorStop(1, t.c[1]);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  function bake(track, slots = []) {
    const b = track.bounds;
    const canvas = makeCanvas(b.w, b.h);
    const g = canvas.getContext('2d');
    const rng = seeded(17);
    g.translate(-b.x, -b.y);
    const ranges = corners(track);
    grass(g, b, rng);
    gravelTraps(g, track, ranges);
    guardRails(g, track, ranges);
    asphalt(g, track, rng);
    kerbs(g, track);
    startArea(g, track, slots);
    grandstands(g, track, rng);
    trees(g, track, rng);
    const skids = makeCanvas(b.w, b.h);
    return { canvas, skids, origin: { x: b.x, y: b.y } };
  }

  // Traces de pneus de l'image, ajoutées au calque (elles restent jusqu'à la fin de la course).
  function addSkids(baked, segments) {
    if (!segments.length) return;
    const g = baked.skids.getContext('2d');
    g.save();
    g.translate(-baked.origin.x, -baked.origin.y);
    g.lineCap = 'round';
    g.lineWidth = 3;
    for (const [x1, y1, x2, y2, alpha] of segments) {
      g.strokeStyle = `rgba(15, 15, 15, ${alpha})`;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.restore();
  }

  return { seeded, corners, offsetPoints, bake, addSkids };
})();
