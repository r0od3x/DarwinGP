// Construit neuralBrains.js : des cerveaux de plusieurs générations de l'IA génétique du
// simulateur d'entraînement génétique, pour les pilotes « génétiques » de la course.
//
// 1. La population sauvegardée (fichier .json du simulateur) continue d'évoluer, avec le même
//    algorithme génétique, mais dans la physique de la course (raceTrainer.mjs) : les réseaux ont
//    appris sur une voiture sans limite d'adhérence réaliste et doivent apprendre à freiner.
// 2. On garde le meilleur cerveau de quelques générations (--pick), plus le meilleur de la
//    population sauvegardée tel quel (« avant adaptation »). Pas de génération 1 (réseau au
//    hasard) : elle sortait de piste tout de suite, ce n'était pas un adversaire.
//
// Utilisation (à la racine du projet, Node 18+) :
//   node tools/buildBrains.mjs --save <sauvegarde.json>
//        [--generations 200] [--pick 345,365,400,450,528] [--log journal.json] [--seed 7]
// --log : journal d'une évolution déjà faite (un meilleur cerveau par génération) ; s'il existe,
//         il est relu au lieu de refaire l'évolution, sinon il est écrit.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createContext, runGeneration } from './raceTrainer.mjs';
import { seededRng } from '../tests/harness.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const savePath = option('save', `${os.homedir()}/Desktop/rctrain/entrainement-5 → 8 → 8 → 2.json`);
const generations = Number(option('generations', 200));
const seed = Number(option('seed', 7));
const logPath = option('log', null);
const COLORS = ['#ff1744', '#ff9100', '#ffea00', '#76ff03', '#1de9b6', '#00b0ff', '#d500f9', '#ff4081'];

const ctx = createContext();
const save = JSON.parse(readFileSync(savePath, 'utf8'));
if (!['neuro-racing', 'darwin-gp'].includes(save.format)) throw new Error(`${savePath} n'est pas une sauvegarde d'entraînement.`);
const s = save.settings;
const settings = { rays: s.rays, spread: s.spread, rayLength: s.rayLength, maxSpeed: s.maxSpeed, maxForce: s.maxForce };
const spec = { generation: 0, settings };
const start = save.generation;
const track = ctx.Track.build();
const laps = fitness => fitness / track.length;

// Journal : un meilleur cerveau par génération, en physique de course.
let log;
if (logPath && existsSync(logPath)) {
  log = JSON.parse(readFileSync(logPath, 'utf8'));
  console.log(`journal relu : générations ${log[0].g} à ${log[log.length - 1].g}`);
} else {
  log = [];
  const rng = seededRng(seed);
  let population = save.population.map(json => ctx.NeuralNetwork.fromJSON(json));
  for (let g = start; g < start + generations; g++) {
    const scored = runGeneration(ctx, track, population, spec, 45);
    const best = scored.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    const mean = scored.reduce((sum, x) => sum + x.fitness, 0) / scored.length;
    log.push({ g, best: laps(best.fitness), mean: laps(mean), brain: best.brain.toJSON() });
    console.log(`génération ${g} : meilleur ${laps(best.fitness).toFixed(2)} tour, moyenne ${laps(mean).toFixed(2)}`);
    population = ctx.Evolution.nextGeneration(scored, population.length, s.mutationRate ?? 0.1, rng).brains;
  }
  if (logPath) writeFileSync(logPath, JSON.stringify(log));
}

const last = log[log.length - 1].g;
const pick = option('pick', null)?.split(',').map(Number)
  ?? [start + 15, start + 35, start + 70, Math.round((start + 70 + last) / 2), last];

const entries = [
  { generation: log[0].g, kind: 'sauvegarde', label: `Génération ${log[0].g} · entraînée au simulateur, pas adaptée à la F1`, laps: log[0].best, brain: log[0].brain },
  ...pick.filter(g => g > log[0].g && g <= last).map(g => {
    const row = log.find(r => r.g === g);
    const label = g === last ? `Génération ${g} · adaptée à la F1` : `Génération ${g} · en adaptation`;
    return { generation: g, kind: 'adaptée', label, laps: row.best, brain: row.brain };
  }),
];

const brains = entries.map((e, i) => ({
  id: `g${e.generation}`, generation: e.generation, kind: e.kind, label: e.label, color: COLORS[i % COLORS.length],
  // Distance en tours sur Prairie GP en 45 s, seule et sans aide (score de l'évolution).
  trainingLaps: Math.round(e.laps * 100) / 100,
  lineage: `${save.name} (${s.rays} rayons, ${s.spread}°, ${s.rayLength} px)`, settings, brain: e.brain,
}));

const header = `// Cerveaux de l'IA génétique (simulateur d'entraînement génétique) pour les pilotes génétiques de la course.
// Fichier généré par tools/buildBrains.mjs (voir ce fichier), ne pas modifier à la main.
// Lignée : ${save.name}, génération ${start} sauvegardée le ${save.savedAt?.slice(0, 10) ?? '?'},
// puis évolution continuée dans la physique de la course (graine ${seed}).
// trainingLaps : tours parcourus en 45 s, seule et sans aide, à la fin de sa génération.
`;
const rows = brains.map(b => JSON.stringify(b)).join(',\n  ');
writeFileSync(new URL('../src/ai/neuralBrains.js', import.meta.url), `${header}const NeuralBrains = [\n  ${rows},\n];\n`);
console.log(brains.map(b => `${b.id} : ${b.trainingLaps} tour · ${b.label}`).join('\n'));
