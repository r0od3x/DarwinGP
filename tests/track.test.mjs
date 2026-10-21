import test from 'node:test';
import assert from 'node:assert/strict';
import { load, near } from './harness.mjs';

const { Track, TrackPainter } = load();
const track = Track.build();

test('circuit : boucle fermée rééchantillonnée, tangentes et normales unitaires et perpendiculaires', () => {
  assert.ok(track.n > 500);
  assert.ok(near(track.length, track.n * track.step));
  assert.ok(Math.abs(track.step - Track.SPACING) < 0.5, `pas ${track.step}`);
  for (let i = 0; i < track.n; i++) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.n];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - track.step) < 1.5, `écart régulier au point ${i}`);
    const t = track.tangents[i];
    const nm = track.normals[i];
    assert.ok(near(Math.hypot(t.x, t.y), 1, 1e-9) && near(Math.hypot(nm.x, nm.y), 1, 1e-9));
    assert.ok(Math.abs(t.x * nm.x + t.y * nm.y) < 1e-9);
  }
});

test('circuit : départ sur la ligne droite, trajectoire de course dans la piste', () => {
  // Autour de s = 0 (grille et ligne d'arrivée), la piste est droite.
  for (let d = -300; d <= 300; d += track.step) assert.ok(Math.abs(Track.sample(track, track.curvature, d)) < 0.0015, `s = ${d}`);
  const maxOffset = track.width / 2 - 28;
  assert.ok(track.offsets.every(o => Math.abs(o) <= maxOffset + 1e-9));
  // La trajectoire coupe vers l'intérieur des virages : décalage du même signe que la courbure lissée.
  const tight = track.curvature.map((k, i) => [Math.abs(k), i]).sort((a, b) => b[0] - a[0]).slice(0, 20);
  assert.ok(tight.every(([, i]) => Math.sign(track.offsets[i]) === Math.sign(track.curvature[i])));
});

test('locate, pointAt, sample et gap : aller-retour et boucle', () => {
  for (const [s, lateral] of [[0, 0], [1234, 30], [track.length * 0.6, -45], [track.length - 4, 12]]) {
    const p = Track.pointAt(track, s, lateral);
    const loc = Track.locate(track, p);
    assert.ok(Math.abs(Track.gap(track, s, loc.s)) <= track.step, `s ${s} -> ${loc.s}`);
    assert.ok(Math.abs(loc.lateral - lateral) < 2, `latéral ${lateral} -> ${loc.lateral}`);
    // Recherche locale à partir d'un indice connu : même résultat.
    assert.equal(Track.locate(track, p, loc.index).index, loc.index);
  }
  const values = track.points.map((_, i) => i);
  assert.ok(near(Track.sample(track, values, track.step * 2.5), 2.5));
  assert.ok(near(Track.sample(track, values, track.length + track.step * 3), 3), 'abscisse bouclée');
  assert.equal(Track.gap(track, 100, 300), 200);
  assert.equal(Track.gap(track, 300, 100), -200);
  assert.ok(near(Track.gap(track, track.length - 50, 50), 100), 'à travers la ligne d\'arrivée');
  assert.ok(Math.abs(Track.gap(track, 0, track.length / 2 + 10)) <= track.length / 2);
});

test('profil de vitesse : plafond, limite d\'adhérence des virages, freinage possible avant chaque virage', () => {
  const opts = { grip: 0.08, brake: 0.09, top: 9.5 };
  const v = Track.speedProfile(track, opts);
  assert.equal(v.length, track.n);
  for (let i = 0; i < track.n; i++) {
    assert.ok(v[i] > 0 && v[i] <= opts.top + 1e-9);
    assert.ok(v[i] <= Math.sqrt(opts.grip / Math.max(1e-6, Math.abs(track.racingCurvature[i]))) + 1e-9);
    // On ne peut pas aller plus vite que ce qu'on peut freiner avant le point suivant.
    const next = v[(i + 1) % track.n];
    assert.ok(v[i] * v[i] <= next * next + 2 * opts.brake * track.step + 1e-9, `freinage au point ${i}`);
  }
  assert.ok(Math.min(...v) < 4, 'un vrai virage lent');
  assert.ok(Math.max(...v) === opts.top, 'pleine vitesse dans la ligne droite');
  // Moins d'adhérence ou de freinage : profil partout plus lent ou égal.
  const slow = Track.speedProfile(track, { grip: 0.06, brake: 0.06, top: 9.5 });
  assert.ok(slow.every((s, i) => s <= v[i] + 1e-9));
});

test('rails : jamais dans le dégagement d\'une autre portion du circuit', () => {
  const dist = track.width / 2 + track.runoff + 8;
  // Un point sur la piste n'est pas dégagé ; un point loin de tout l'est.
  assert.equal(TrackPainter.clearOfTrack(track, track.points[10], dist), false);
  const b = track.bounds;
  assert.equal(TrackPainter.clearOfTrack(track, { x: b.x + 5, y: b.y + 5 }, dist), true);
  // Sur une ligne droite, le rail extérieur est bien dégagé.
  const outside = Track.pointAt(track, 40, dist);
  assert.equal(TrackPainter.clearOfTrack(track, outside, dist - 4), true);
});
