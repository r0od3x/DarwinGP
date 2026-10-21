// Perception : rayons de détection vers les bords de la piste.
// Les deux bords (ligne médiane ± largeur / 2) sont découpés en segments rangés dans une grille ;
// un rayon parcourt la grille case par case (DDA) et s'arrête au premier bord touché.
const TrackSensors = (() => {
  const CELL = 64;

  // Points d'un bord. Dans un virage plus serré que la demi-largeur, le bord intérieur se replie
  // sur lui-même : ces points sont plus près de la ligne médiane que la demi-largeur, donc sur la
  // piste. On les retire, sinon les rayons heurteraient des murs invisibles.
  function edgePoints(track, side) {
    const half = track.width / 2;
    const { points, normals, n } = track;
    const kept = [];
    for (let i = 0; i < n; i++) {
      const x = points[i].x + normals[i].x * half * side;
      const y = points[i].y + normals[i].y * half * side;
      let inside = false;
      for (let k = -40; k <= 40 && !inside; k++) {
        const p = points[(i + k + n) % n];
        inside = (p.x - x) ** 2 + (p.y - y) ** 2 < (half - 0.5) ** 2;
      }
      if (!inside) kept.push({ x, y });
    }
    return kept;
  }

  function cellKey(cx, cy) {
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  // Segments des deux bords (boucles fermées) et grille d'accès rapide.
  function build(track) {
    const segments = [];
    for (const side of [-1, 1]) {
      const pts = edgePoints(track, side);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
    const grid = new Map();
    segments.forEach((s, index) => {
      const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL);
      const x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
      const y0 = Math.floor(Math.min(s.ay, s.by) / CELL);
      const y1 = Math.floor(Math.max(s.ay, s.by) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const key = cellKey(cx, cy);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(index);
        }
      }
    });
    return { segments, grid, seen: new Uint32Array(segments.length), stamp: 0 };
  }

  // Distance t le long du rayon o + t·d (d unitaire) jusqu'au segment, ou Infinity.
  function hitSegment(ox, oy, dx, dy, s) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const denom = dx * ey - dy * ex;
    if (denom === 0) return Infinity;
    const wx = s.ax - ox;
    const wy = s.ay - oy;
    const t = (wx * ey - wy * ex) / denom;
    const u = (wx * dy - wy * dx) / denom;
    return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
  }

  // Distance jusqu'au premier bord dans la direction angle, plafonnée à length.
  function cast(index, ox, oy, angle, length) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let cx = Math.floor(ox / CELL);
    let cy = Math.floor(oy / CELL);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const deltaY = dy !== 0 ? CELL / Math.abs(dy) : Infinity;
    let nextX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let nextY = dy !== 0 ? ((dy > 0 ? (cy + 1) * CELL - oy : oy - cy * CELL) / Math.abs(dy)) : Infinity;
    index.stamp = (index.stamp + 1) >>> 0 || 1;
    const stamp = index.stamp;
    let best = length;
    let entry = 0;
    // On visite les cases dans l'ordre le long du rayon, tant qu'elles commencent avant le meilleur impact.
    while (entry <= best) {
      const cell = index.grid.get(cellKey(cx, cy));
      if (cell) {
        for (const k of cell) {
          if (index.seen[k] === stamp) continue;
          index.seen[k] = stamp;
          const t = hitSegment(ox, oy, dx, dy, index.segments[k]);
          if (t < best) best = t;
        }
      }
      if (nextX < nextY) {
        entry = nextX;
        nextX += deltaX;
        cx += stepX;
      } else {
        entry = nextY;
        nextY += deltaY;
        cy += stepY;
      }
    }
    return best;
  }

  // Angles des rayons relatifs au cap : count rayons répartis régulièrement sur spread radians,
  // centrés vers l'avant (un seul rayon : droit devant). 360° : pas de doublon devant / derrière.
  function rayAngles(count, spread) {
    if (count === 1) return [0];
    const full = spread >= Math.PI * 2 - 1e-9;
    const gaps = full ? count : count - 1;
    return Array.from({ length: count }, (_, i) => -spread / 2 + (spread * i) / gaps);
  }

  // Lecture des capteurs : pour chaque rayon, distance au bord et point d'impact (pour l'affichage).
  function read(index, pos, heading, angles, length) {
    return angles.map(a => {
      const angle = heading + a;
      const distance = cast(index, pos.x, pos.y, angle, length);
      return { angle, distance, x: pos.x + Math.cos(angle) * distance, y: pos.y + Math.sin(angle) * distance };
    });
  }

  return { CELL, edgePoints, build, hitSegment, cast, rayAngles, read };
})();
