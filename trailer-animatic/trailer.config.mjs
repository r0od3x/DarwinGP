// Darwin GP — trailer animatic. THE single source of truth: timing, script, staging of every
// storyboard frame, music and sound cues. Edit this file, then run:
//
//   node trailer-animatic/build.mjs            re-render what changed (frames are cached)
//   node trailer-animatic/build.mjs --frames   re-render every storyboard frame
//
// Timing is in BEATS (bpm below). At 120 BPM, 1 beat = 0.5 s = 15 frames at 30 fps, so every cut
// lands exactly on a frame and on the music. Change a shot's `beats` and everything after it moves.
//
// Shot fields
//   slug        file name part: frames/<nn>_<slug>.png
//   section     hook | montee | jeu | montage | climax | titre | appel
//   beats       duration
//   title       short name (labels, storyboard)
//   action      what happens on screen
//   camera      camera type (drone, chase, trackside, close, orbit, ui, card) + framing
//   move        push | pull | push-fast | drift-left | drift-right | pan-left | pan-right | static |
//               punch | shake | punch-shake  (simple motion to sell the camera move)
//   speed       normal | slow-mo (with %) | speed ramp — written on the label
//   transition  how the shot STARTS: cut | flash | fade-in | dip (dip to black from previous)
//   fadeOut     true: fade to black at the end
//   text        on-screen French text (max 5–6 words), textAt (s into the shot), textPos lower|upper|center
//   music, sound   what the audio does (described in the script); sfx: [{ at: s, type }] actual cues
//   track, car, weather, time   shot list columns
//   frames      one or two storyboard frames: { stage } staged in the real game (see
//               trailer/stage.js) or { card } (title cards). Two frames: start and end of the move,
//               `split` = share of the shot spent on the first one.
export const TRAILER = {
  title: 'Darwin GP',
  concept: 'Ils n\'ont pas été programmés pour courir. Ils ont évolué.',
  bpm: 120,
  fps: 30,
  width: 1920,
  height: 1080,
  game: '../index.html',
  // Defaults merged into every staged frame.
  stageDefaults: { seed: 7, neural: ['g329', 'g528'], hud: 'clean' },
  // Music bed, by beat range (see lib/audio.mjs for the patterns).
  music: [
    { from: 0, to: 10, pattern: 'intro', note: 'Low drone, engine revving under the five light beeps; silence at lights out.' },
    { from: 10, to: 32, pattern: 'pulse', note: 'Tense pulse: kick on 1 and 3, sub bass, cold pad.' },
    { from: 32, to: 72, pattern: 'drive', note: 'Full groove: four-on-the-floor, off-beat hats, driving bass.' },
    { from: 72, to: 92, pattern: 'drive+', note: 'Same groove, doubled: claps on 2 and 4, 16th hats, octave bass.' },
    { from: 92, to: 98, pattern: 'riser', note: 'Build: accelerating kicks, noise riser, snare roll.' },
    { from: 98, to: 106, pattern: 'slowmo', note: 'Drop to slow motion: heartbeat, sub drone, everything filtered.' },
    { from: 106, to: 114, pattern: 'slam', note: 'Title slam: huge hit, held chord, long tail.' },
    { from: 114, to: 120, pattern: 'outro', note: 'Soft pad and a last kick per bar, fade out.' },
  ],
  shots: [
    // ---------------------------------------------------------------- HOOK (0–5 s)
    {
      slug: 'hook_feux', section: 'hook', beats: 8, title: 'Les feux',
      action: 'Thirteen cars on the grid, engines revving. The five red lights come on one by one.',
      camera: 'Drone, high above the front rows, the light gantry in frame', move: 'push', speed: 'normal', transition: 'fade-in',
      text: 'Personne ne leur a appris.', textAt: 1.2, textPos: 'lower',
      music: 'Drone only.', sound: 'One beep per light (beats 1–5), engines revving higher and higher.',
      sfx: [0.5, 1.0, 1.5, 2.0, 2.5].map(at => ({ at, type: 'beep' })).concat([{ at: 0, type: 'rev', dur: 4 }]),
      track: 'Prairie GP · grille de départ', car: 'Toute la grille', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { grid: { lights: 5 }, camera: { s: 8440, zoom: 2 }, hud: 'lights' } }],
    },
    {
      slug: 'hook_extinction', section: 'hook', beats: 2, title: 'Extinction des feux',
      action: 'Lights out. The front rows launch, rear tyres biting.',
      camera: 'Low drone on the front row', move: 'punch-shake', speed: 'normal', transition: 'flash',
      music: 'Cut to silence on the hit.', sound: 'Big hit + whoosh on the cut, engines screaming away.',
      sfx: [{ at: 0, type: 'hit' }, { at: 0, type: 'whoosh' }],
      track: 'Prairie GP · grille', car: 'Pole et 2e place', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { start: { after: 25 }, camera: { car: 'leader', ahead: 20, zoom: 2.6 } } }],
    },
    // ---------------------------------------------------------------- BUILD-UP (5–16 s)
    {
      slug: 'montee_vision_ia', section: 'montee', beats: 6, title: 'Vision de l\'IA',
      action: 'A neural driver seen through its own sensors: detection rays sweep the edges of the track as it threads the esses.',
      camera: 'Close chase on the genetic car, AI debug view on', move: 'push', speed: 'normal', transition: 'cut',
      text: 'Quatre capteurs. Aucun pilote.', textAt: 0.6, textPos: 'lower',
      music: 'Pulse starts: kick on 1 and 3.', sound: 'Digital ticks on each ray hit.',
      sfx: [{ at: 0, type: 'tick' }, { at: 1, type: 'tick' }, { at: 2, type: 'tick' }],
      track: 'Prairie GP · enchaînement rapide', car: 'Génération 528 (néon bleu)', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'G528', s: 3620, lateral: 8, speed: 6.5 }], steps: 10, debug: true, camera: { car: 'G528', ahead: 70, zoom: 3.4 } } }],
    },
    {
      slug: 'montee_gen329', section: 'montee', beats: 6, title: 'Génération 329',
      action: 'An early generation takes the first corner far too fast, runs wide over the kerb and spins into the gravel trap in a cloud of dust.',
      camera: 'Trackside, wide on turn 1', move: 'punch', speed: 'slow-mo 50 % on the spin', transition: 'cut',
      text: 'Génération 329.', textAt: 0.3, textPos: 'upper',
      music: 'Pulse continues.', sound: 'Tyre screech, gravel crunch, low thud.',
      sfx: [{ at: 0.4, type: 'screech' }, { at: 1.2, type: 'gravel' }, { at: 1.2, type: 'thud' }],
      track: 'Prairie GP · virage 1', car: 'Génération 329 (néon orange)', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'G329', s: 1580, lateral: 78, speed: 7.5, yaw: 0.8, drift: 0.6, spin: 0.2 }], steps: 22, debug: true, camera: { car: 'G329', zoom: 2.4 } } }],
    },
    {
      slug: 'montee_gen528', section: 'montee', beats: 6, title: 'Génération 528',
      action: 'Same corner, two hundred generations later: the car brakes late, discs glowing, clips the apex and powers out clean.',
      camera: 'Trackside on turn 1 (same angle as the previous shot), pan with the car', move: 'pan-right', speed: 'normal', transition: 'cut',
      text: 'Génération 528.', textAt: 0.3, textPos: 'upper',
      music: 'Pulse, pad opens up.', sound: 'Clean downshifts, engine note rising on exit.',
      sfx: [{ at: 0.2, type: 'brake' }, { at: 1.6, type: 'pass' }],
      track: 'Prairie GP · virage 1', car: 'Génération 528 (néon bleu)', weather: 'Beau temps', time: 'Jour',
      frames: [
        { stage: { place: [{ car: 'G528', s: 1380, lateral: 35, speed: 8, hold: { throttle: -1 } }], steps: 4, debug: true, camera: { s: 1480, lateral: 30, zoom: 2.1 } } },
        { stage: { place: [{ car: 'G528', s: 1690, lateral: 30, speed: 7.5 }], steps: 4, debug: true, camera: { s: 1660, lateral: 20, zoom: 2.1 } } },
      ],
      split: 0.5,
    },
    {
      slug: 'montee_carton_evolution', section: 'montee', beats: 4, title: 'Carton : ils ont évolué',
      action: 'Black card.', camera: 'Card', move: 'push', speed: 'normal', transition: 'dip',
      text: 'Ils ont évolué.', textAt: 0.15, textPos: 'center',
      music: 'Pulse holds, reverse swell into the next cut.', sound: 'Deep boom on the text, whoosh out.',
      sfx: [{ at: 0.15, type: 'boom' }, { at: 2, type: 'reverse' }],
      track: '—', car: '—', weather: '—', time: '—',
      frames: [{ card: { kind: 'black' } }],
    },
    // ---------------------------------------------------------------- GAMEPLAY (16–36 s)
    {
      slug: 'jeu_depart', section: 'jeu', beats: 6, title: 'Départ',
      action: 'Drone over the start: thirteen cars leave the grid, then the pack funnels down the main straight towards turn 1.',
      camera: 'Drone, high and wide, tracking the pack', move: 'drift-right', speed: 'normal', transition: 'cut',
      text: 'Treize voitures. Un vainqueur.', textAt: 0.5, textPos: 'lower',
      music: 'Groove kicks in: four-on-the-floor.', sound: 'Wall of engines, whoosh on the cut.',
      sfx: [{ at: 0, type: 'whoosh' }, { at: 0, type: 'hit' }],
      track: 'Prairie GP · ligne droite des stands', car: 'Tout le peloton', weather: 'Beau temps', time: 'Jour',
      frames: [
        { stage: { start: { after: 8 }, camera: { s: 8400, zoom: 1.15 } } },
        { stage: { start: { after: 150 }, camera: { car: 'leader', ahead: -110, zoom: 1.1 } } },
      ],
      split: 0.45,
    },
    {
      slug: 'jeu_aspiration', section: 'jeu', beats: 4, title: 'Aspiration',
      action: 'The player (#7, yellow) tucks in behind Rossi: air streaks off the car, the dash reads ASPIRATION.',
      camera: 'Chase cam behind the player, race HUD visible', move: 'push', speed: 'normal', transition: 'cut',
      text: 'Prends l\'aspiration.', textAt: 0.3, textPos: 'upper',
      music: 'Groove.', sound: 'Wind roar building in the slipstream.',
      sfx: [{ at: 0.2, type: 'wind', dur: 1.8 }],
      track: 'Prairie GP · ligne droite des stands', car: 'Toi Racing #7 · Scuderia Rosso #16', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'player', s: 600, speed: 9 }, { car: 'Rossi', s: 700, speed: 8.8 }], steps: 6, camera: { car: 'player', ahead: 50, zoom: 2.8 }, hud: 'race' } }],
    },
    {
      slug: 'jeu_depassement', section: 'jeu', beats: 6, title: 'Dépassement',
      action: 'Out of the slipstream: #7 pulls alongside Rossi, then dives down the inside into the braking zone of turn 1.',
      camera: 'Chase cam, slightly wider, follows the move', move: 'pan-left', speed: 'normal', transition: 'cut',
      text: 'Plonge à l\'intérieur.', textAt: 1.4, textPos: 'upper',
      music: 'Groove, extra hit on the pass.', sound: 'Engine pass-by, brakes, hit as #7 takes the lead.',
      sfx: [{ at: 0.6, type: 'pass' }, { at: 1.5, type: 'hit' }, { at: 1.6, type: 'brake' }],
      track: 'Prairie GP · freinage du virage 1', car: 'Toi Racing #7 · Scuderia Rosso #16', weather: 'Beau temps', time: 'Jour',
      frames: [
        { stage: { place: [{ car: 'player', s: 1150, lateral: 24, speed: 9.3 }, { car: 'Rossi', s: 1180, lateral: -6, speed: 8.9 }], steps: 3, camera: { car: 'player', ahead: 40, zoom: 2.4 }, hud: 'race' } },
        { stage: { place: [{ car: 'player', s: 1340, lateral: -10, speed: 8.6, hold: { throttle: -1 } }, { car: 'Rossi', s: 1295, lateral: 16, speed: 8.4, hold: { throttle: -1 } }], steps: 3, camera: { car: 'player', ahead: 10, zoom: 2.4 }, hud: 'race' } },
      ],
      split: 0.5,
    },
    {
      slug: 'jeu_defense', section: 'jeu', beats: 4, title: 'Défense à l\'épingle',
      action: 'Hairpin: Verstap closes the door on the inside, Norris has to back off. The AI defends its line.',
      camera: 'Drone above the hairpin, driver names on', move: 'drift-left', speed: 'normal', transition: 'cut',
      text: 'Ils défendent chaque virage.', textAt: 0.3, textPos: 'upper',
      music: 'Groove.', sound: 'Two engines bouncing off the limiter.',
      sfx: [{ at: 0.3, type: 'pass' }],
      track: 'Prairie GP · épingle', car: 'Taureau Bleu #1 · Papaye Racing #4', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Verstap', s: 3150, lateral: -30, speed: 5.5 }, { car: 'Norris', s: 3115, lateral: 14, speed: 5.8 }], steps: 6, names: true, camera: { s: 3150, zoom: 2.4 } } }],
    },
    {
      slug: 'jeu_freins', section: 'jeu', beats: 2, title: 'Disques rougis',
      action: 'Extreme close-up: a car stamps on the brakes, the four discs glow orange.',
      camera: 'Close-up on the car (wheel close-up equivalent)', move: 'push-fast', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Brake hiss and downshift.',
      sfx: [{ at: 0, type: 'brake' }],
      track: 'Prairie GP · freinage du virage 1', car: 'Williams Bleu #23', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Albon', s: 1400, lateral: 10, speed: 7, hold: { throttle: -1 } }], steps: 2, camera: { car: 'Albon', zoom: 5.5 } } }],
    },
    {
      slug: 'jeu_accrochage', section: 'jeu', beats: 6, title: 'Accrochage',
      action: 'In the chicane Gasly clips Wolf and spins: tyre smoke, black marks on the asphalt, the race feed announces the contact.',
      camera: 'Drone above the chicane, feed visible', move: 'punch-shake', speed: 'slow-mo 50 % after the hit', transition: 'cut',
      text: 'Ils font des erreurs.', textAt: 1.2, textPos: 'lower',
      music: 'Groove ducks for a beat on the impact.', sound: 'Crunch, tyre screech, crowd gasp.',
      sfx: [{ at: 0.2, type: 'crash' }, { at: 0.3, type: 'screech' }],
      track: 'Prairie GP · chicane', car: 'Argent Flèche #44 · Alpine Rose #10', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Wolf', s: 2160, lateral: -5, speed: 6 }, { car: 'Gasly', s: 2140, lateral: 12, speed: 7, spin: 0.18 }], steps: 16, hud: 'feed', feed: ['Accrochage : Wolf et Gasly'], camera: { s: 2170, zoom: 2.6 } } }],
    },
    {
      slug: 'jeu_gravier', section: 'jeu', beats: 4, title: 'Bac à gravier',
      action: 'Hulk runs wide at the hairpin and ploughs through the gravel, a trail of dust behind him.',
      camera: 'Chase, close on the car', move: 'drift-right', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Gravel crunch.',
      sfx: [{ at: 0.1, type: 'gravel' }],
      track: 'Prairie GP · épingle', car: 'Haas & Cie #27', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Hulk', s: 3300, lateral: 95, speed: 5, yaw: 0.4 }], steps: 20, camera: { car: 'Hulk', zoom: 2.8 } } }],
    },
    {
      slug: 'jeu_tribunes', section: 'jeu', beats: 4, title: 'Tribunes',
      action: 'A train of five cars flashes past the packed grandstands and the sponsor boards.',
      camera: 'Drone over the grandstands, cars crossing frame', move: 'pan-right', speed: 'normal', transition: 'cut',
      text: 'Chaque course s\'écrit en direct.', textAt: 0.3, textPos: 'upper',
      music: 'Groove.', sound: 'Crowd roar, five quick pass-bys.',
      sfx: [{ at: 0, type: 'crowd', dur: 2 }, { at: 0.3, type: 'pass' }, { at: 0.9, type: 'pass' }],
      track: 'Prairie GP · tribunes de la ligne droite', car: 'Rosso, Argent Flèche, Taureau Bleu, Papaye, Génération 528', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [
        { car: 'Rossi', s: 560, lateral: -10, speed: 9 }, { car: 'Wolf', s: 500, lateral: 12, speed: 9 },
        { car: 'Verstap', s: 440, lateral: -8, speed: 9 }, { car: 'Norris', s: 380, lateral: 10, speed: 9 },
        { car: 'G528', s: 320, lateral: 0, speed: 9 },
      ], steps: 4, camera: { s: 450, lateral: 130, zoom: 1.5 } } }],
    },
    {
      slug: 'jeu_drone_circuit', section: 'jeu', beats: 4, title: 'Le circuit',
      action: 'The whole Prairie GP from above, the field spread around the lap.',
      camera: 'Drone, whole circuit', move: 'pull', speed: 'normal', transition: 'cut',
      text: 'Un circuit. Mille trajectoires.', textAt: 0.3, textPos: 'lower',
      music: 'Groove, filter opens.', sound: 'Distant engines.',
      sfx: [{ at: 0, type: 'whoosh' }],
      track: 'Prairie GP · vue d\'ensemble', car: 'Tout le peloton', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { start: { after: 1500 }, camera: { circuit: true } } }],
    },
    // ---------------------------------------------------------------- MONTAGE (36–46 s)
    {
      slug: 'montage_classement', section: 'montage', beats: 2, title: 'Classement',
      action: 'Mid-race, the timing tower reshuffles.',
      camera: 'Chase on the player, full HUD (timing tower, lap, dash)', move: 'push-fast', speed: 'normal', transition: 'cut',
      music: 'Groove doubles: claps on 2 and 4.', sound: 'UI tick.',
      sfx: [{ at: 0, type: 'tick' }],
      track: 'Prairie GP', car: 'Toi Racing #7', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { start: { after: 1800 }, camera: { car: 'player', ahead: 40, zoom: 1.8 }, hud: 'race' } }],
    },
    {
      slug: 'montage_mur', section: 'montage', beats: 2, title: 'Dans le mur',
      action: 'Wolf runs out of road on the long left-hander and bounces off the barrier.',
      camera: 'Close drone', move: 'punch-shake', speed: 'normal', transition: 'flash',
      music: 'Groove.', sound: 'Impact.',
      sfx: [{ at: 0, type: 'crash' }],
      track: 'Prairie GP · grande courbe à gauche', car: 'Argent Flèche #44', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Wolf', s: 6050, lateral: 150, speed: 6, yaw: 0.5 }], steps: 10, hud: 'feed', feed: ['Wolf dans le mur !'], camera: { car: 'Wolf', zoom: 2.4 } } }],
    },
    {
      slug: 'montage_attaque_genetique', section: 'montage', beats: 2, title: 'Attaque génétique',
      action: 'The neural driver, rays on, goes around the outside of Bottas.',
      camera: 'Chase, AI debug view on', move: 'push-fast', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Pass-by.',
      sfx: [{ at: 0.2, type: 'pass' }],
      track: 'Prairie GP · enchaînement rapide', car: 'Génération 528 · Sauber Vert #77', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'G528', s: 4185, lateral: -18, speed: 8.2 }, { car: 'Bottas', s: 4205, lateral: 14, speed: 7.4 }], steps: 4, debug: true, camera: { car: 'G528', ahead: 30, zoom: 2.8 } } }],
    },
    {
      slug: 'montage_trois_de_front', section: 'montage', beats: 2, title: 'Trois de front',
      action: 'Three cars abreast into turn 1, all braking at once.',
      camera: 'Drone ahead of the cars, looking back', move: 'push-fast', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Three engines, brakes.',
      sfx: [{ at: 0, type: 'brake' }],
      track: 'Prairie GP · freinage du virage 1', car: 'Rosso #16 · Taureau Bleu #1 · Papaye #4', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [
        { car: 'Rossi', s: 1300, lateral: -32, speed: 8.7, hold: { throttle: -1 } }, { car: 'Verstap', s: 1305, lateral: 0, speed: 8.7, hold: { throttle: -1 } },
        { car: 'Norris', s: 1295, lateral: 32, speed: 8.7, hold: { throttle: -1 } },
      ], steps: 2, camera: { s: 1320, zoom: 2.5 } } }],
    },
    {
      slug: 'montage_traces', section: 'montage', beats: 1, title: 'Traces de pneus',
      action: 'Black rubber arcs on the asphalt after a spin, smoke drifting.',
      camera: 'Close drone on the marks', move: 'punch', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Screech tail.',
      sfx: [{ at: 0, type: 'screech' }],
      track: 'Prairie GP · chicane', car: 'Visa Cash #22', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Tsunoda', s: 2230, speed: 7, spin: 0.2 }], steps: 45, camera: { s: 2265, lateral: 10, zoom: 2.8 } } }],
    },
    {
      slug: 'montage_toupie', section: 'montage', beats: 1, title: 'Tête-à-queue',
      action: 'A car spinning on itself, smoke all around.',
      camera: 'Close, locked on the car', move: 'punch', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Screech.',
      sfx: [{ at: 0, type: 'screech' }],
      track: 'Prairie GP · double droite', car: 'Papaye Racing #4', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Norris', s: 6860, lateral: 10, speed: 7, spin: -0.22 }], steps: 12, camera: { car: 'Norris', zoom: 3.8 } } }],
    },
    {
      slug: 'montage_fil', section: 'montage', beats: 1, title: 'Fil de course',
      action: 'The race feed stacks up: contact, wall, fastest lap for Génération 528.',
      camera: 'UI, full HUD', move: 'punch', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'UI tick.',
      sfx: [{ at: 0, type: 'tick' }],
      track: 'Prairie GP', car: 'Toi Racing #7', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { start: { after: 1200 }, hud: 'race', feed: ['Accrochage : Rossi et Wolf', 'Hulk dans le mur !', 'Meilleur tour : Génération 528 (78.41 s)'], camera: { car: 'player', ahead: 40, zoom: 1.8 } } }],
    },
    {
      slug: 'montage_poussiere', section: 'montage', beats: 1, title: 'Poussière',
      action: 'Alonsa slides through the gravel on the exit of the chicane.',
      camera: 'Chase, close', move: 'punch', speed: 'normal', transition: 'cut',
      music: 'Groove.', sound: 'Gravel.',
      sfx: [{ at: 0, type: 'gravel' }],
      track: 'Prairie GP · sortie de chicane', car: 'Vert Émeraude #14', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Alonsa', s: 2440, lateral: -90, speed: 6, yaw: -0.3 }], steps: 18, camera: { car: 'Alonsa', zoom: 3 } } }],
    },
    {
      slug: 'montage_plus_pres', section: 'montage', beats: 4, title: 'Nez à nez',
      action: 'Nose to tail at full speed on the back straight, #7 glued to Rossi\'s gearbox.',
      camera: 'Tight chase on the player', move: 'punch-shake', speed: 'normal', transition: 'flash',
      text: 'Plus vite. Plus près.', textAt: 0.1, textPos: 'lower',
      music: 'Groove, peak.', sound: 'Wind roar, hit on the text.',
      sfx: [{ at: 0, type: 'hit' }, { at: 0, type: 'wind', dur: 1.8 }],
      track: 'Prairie GP · ligne droite opposée', car: 'Toi Racing #7 · Scuderia Rosso #16', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [{ car: 'Rossi', s: 5000, speed: 9.2 }, { car: 'player', s: 4962, lateral: 6, speed: 9.4 }], steps: 4, camera: { car: 'player', ahead: 45, zoom: 3.6 } } }],
    },
    {
      slug: 'montage_meute', section: 'montage', beats: 4, title: 'La meute',
      action: 'The whole field in a long train down the back straight.',
      camera: 'High drone, the train crossing frame', move: 'pull', speed: 'normal', transition: 'cut',
      music: 'Riser starts underneath.', sound: 'Engines in a wave.',
      sfx: [{ at: 0, type: 'whoosh' }],
      track: 'Prairie GP · ligne droite opposée', car: 'Tout le peloton', weather: 'Beau temps', time: 'Jour',
      frames: [{ stage: { place: [
        { car: 'Rossi', s: 5320, speed: 9 }, { car: 'player', s: 5250, lateral: 14, speed: 9 }, { car: 'Wolf', s: 5180, lateral: -12, speed: 9 },
        { car: 'Verstap', s: 5110, speed: 9 }, { car: 'G528', s: 5040, lateral: 12, speed: 9 }, { car: 'Norris', s: 4970, lateral: -10, speed: 9 },
        { car: 'Alonsa', s: 4900, speed: 9 }, { car: 'Gasly', s: 4830, lateral: 10, speed: 9 }, { car: 'Hulk', s: 4760, lateral: -10, speed: 9 },
        { car: 'Albon', s: 4690, speed: 9 }, { car: 'G329', s: 4620, lateral: 12, speed: 9 }, { car: 'Bottas', s: 4550, lateral: -8, speed: 9 },
        { car: 'Tsunoda', s: 4480, speed: 9 },
      ], steps: 3, camera: { s: 4930, zoom: 1 } } }],
    },
    // ---------------------------------------------------------------- CLIMAX (46–53 s)
    {
      slug: 'climax_dernier_tour', section: 'climax', beats: 6, title: 'Dernier tour',
      action: 'Last lap. #7 and Verstap side by side out of the final corner and onto the main straight.',
      camera: 'Chase, then wide alongside on the straight; HUD shows 3 / 3', move: 'drift-right', speed: 'speed ramp up', transition: 'cut',
      text: 'Dernier tour.', textAt: 0.2, textPos: 'upper',
      music: 'Riser, snare roll accelerating.', sound: 'Both engines at the limiter.',
      sfx: [{ at: 0, type: 'pass' }, { at: 1.6, type: 'pass' }],
      track: 'Prairie GP · dernier virage → ligne droite', car: 'Toi Racing #7 · Taureau Bleu #1', weather: 'Beau temps', time: 'Jour',
      frames: [
        { stage: { place: [{ car: 'player', s: 7610, lateral: -18, speed: 6, lap: 3 }, { car: 'Verstap', s: 7600, lateral: 20, speed: 6, lap: 3 }], steps: 3, camera: { s: 7630, zoom: 2.2 }, hud: 'race' } },
        { stage: { place: [{ car: 'player', s: 8330, lateral: -24, speed: 9.4, lap: 3 }, { car: 'Verstap', s: 8326, lateral: 24, speed: 9.4, lap: 3 }], steps: 2, camera: { car: 'player', ahead: 40, side: 24, zoom: 2.2 }, hud: 'race' } },
      ],
      split: 0.5,
    },
    {
      slug: 'climax_photo_finish', section: 'climax', beats: 8, title: 'Photo-finish',
      action: 'Slow motion on the chequered line: the two noses cross it together. Who won?',
      camera: 'Low and tight over the finish line', move: 'push', speed: 'slow-mo 20 %', transition: 'cut',
      text: 'Au millième.', textAt: 2.6, textPos: 'lower',
      music: 'Everything drops: heartbeat and sub only.', sound: 'Slowed engines, heartbeat, a single hit as they cross.',
      sfx: [{ at: 0, type: 'slow' }, { at: 2.4, type: 'hit' }],
      track: 'Prairie GP · ligne d\'arrivée', car: 'Toi Racing #7 · Taureau Bleu #1', weather: 'Beau temps', time: 'Jour',
      frames: [
        { stage: { place: [{ car: 'player', s: 8505, lateral: -25, speed: 9.4, lap: 3 }, { car: 'Verstap', s: 8503, lateral: 25, speed: 9.4, lap: 3 }], steps: 0, camera: { s: 8540, zoom: 3.6 } } },
        { stage: { place: [{ car: 'player', s: 8570, lateral: -25, speed: 9.4, lap: 3 }, { car: 'Verstap', s: 8569.5, lateral: 25, speed: 9.4, lap: 3 }], steps: 0, camera: { s: 8584, zoom: 4.4 } } },
      ],
      split: 0.55,
    },
    // ---------------------------------------------------------------- TITLE + CALL TO ACTION (53–60 s)
    {
      slug: 'titre', section: 'titre', beats: 8, title: 'Titre',
      action: 'DARWIN GP slams in over the circuit outline, tagline underneath.',
      camera: 'Card', move: 'punch', speed: 'normal', transition: 'flash',
      music: 'Title slam: huge hit, held chord.', sound: 'Hit + long tail.',
      sfx: [{ at: 0, type: 'slam' }],
      track: '—', car: '—', weather: '—', time: '—',
      frames: [{ card: { kind: 'title', tagline: 'L\'évolution prend le volant.' } }],
    },
    {
      slug: 'appel', section: 'appel', beats: 6, title: 'Appel à l\'action',
      action: 'Free, in your browser. Repository link.',
      camera: 'Card', move: 'push', speed: 'normal', transition: 'dip', fadeOut: true,
      music: 'Outro: soft pad, fade out.', sound: '—',
      sfx: [],
      track: '—', car: '—', weather: '—', time: '—',
      frames: [{ card: { kind: 'cta', line: 'Gratuit, dans ton navigateur.', link: 'github.com/r0od3x/DarwinGP' } }],
    },
  ],
};

// Clip direction: how each shot is filmed as real gameplay (lib/clips.mjs, trailer/stage.js).
// By default a clip starts from the shot's first storyboard frame and the camera moves to the
// second frame's camera. Here, per shot slug:
//   stage      staging changes for the clip (cars start earlier so the action happens on camera)
//   camera / cameraTo   start and end camera
//   actions    [{ at (s), car, spin | overtake | lane+mode | nudge | hold | lightsOut | shake | feed }]
//   timeScale  1 = real time; 0.5 = slow motion; [{ t, scale }] ramps
//   move       camera move preset for the clip (defaults to the shot's move)
//   lock       true: no camera smoothing (fixed framings)
TRAILER.clips = {
  hook_feux: { stage: { grid: { lights: 0, hold: true } }, timeScale: 5 / 3, lock: true },
  hook_extinction: {
    stage: { start: undefined, grid: { lights: 5 } }, actions: [{ at: 0, lightsOut: true }],
    camera: { car: 'leader', ahead: 30, zoom: 2.4 }, move: 'static', moveExtra: { punch: 0.12 },
  },
  montee_vision_ia: { stage: { place: [{ car: 'G528', s: 3500, lateral: 8, speed: 6.5 }], steps: 4 } },
  montee_gen329: {
    stage: { place: [{ car: 'G329', s: 1250, lateral: 20, speed: 9 }], steps: 2 },
    camera: { s: 1560, lateral: 40, zoom: 1.9 }, lock: true, move: 'static',
    timeScale: [{ t: 0, scale: 1 }, { t: 1.3, scale: 1 }, { t: 1.6, scale: 0.5 }],
    actions: [{ at: 1.1, car: 'G329', nudge: { side: 1, force: 0.25, dur: 0.6 } }, { at: 1.5, car: 'G329', spin: 0.2 }, { at: 1.5, shake: 0.8 }],
  },
  montee_gen528: {
    stage: { place: [{ car: 'G528', s: 1250, lateral: 20, speed: 9 }], steps: 2 },
    camera: { s: 1560, lateral: 40, zoom: 1.9 }, cameraTo: { car: 'G528', ahead: 60, zoom: 2 }, move: 'static',
  },
  jeu_depart: { stage: { start: { after: 6 } } },
  jeu_depassement: {
    stage: { place: [{ car: 'player', s: 950, speed: 9.2, tune: { topSpeed: 10.2 } }, { car: 'Rossi', s: 1010, speed: 9 }], steps: 2 },
    actions: [{ at: 0.3, car: 'player', overtake: 'Rossi' }], camera: { car: 'player', ahead: 40, zoom: 2.2 },
  },
  jeu_defense: {
    stage: { place: [{ car: 'Verstap', s: 3000, lateral: -10, speed: 6.5 }, { car: 'Norris', s: 2960, lateral: 12, speed: 6.9, tune: { topSpeed: 10 } }], steps: 2 },
    actions: [{ at: 0, car: 'Verstap', lane: -1, mode: 'défense', dur: 2 }, { at: 0.2, car: 'Norris', overtake: 'Verstap' }],
    camera: { car: 'Verstap', ahead: 40, zoom: 2.3 },
  },
  jeu_freins: { stage: { place: [{ car: 'Albon', s: 1330, lateral: 10, speed: 8.8 }], steps: 1 }, actions: [{ at: 0, car: 'Albon', hold: { throttle: -1, dur: 1 } }] },
  jeu_accrochage: {
    stage: { place: [{ car: 'Wolf', s: 2080, lateral: -4, speed: 6.4 }, { car: 'Gasly', s: 2040, lateral: 12, speed: 7.4 }], steps: 2, feed: [] },
    camera: { car: 'Gasly', ahead: 20, zoom: 2.3 }, smoothing: 0.25, move: 'static',
    timeScale: [{ t: 0, scale: 1 }, { t: 0.9, scale: 1 }, { t: 1.1, scale: 0.5 }],
    actions: [{ at: 0.9, car: 'Gasly', spin: 0.18 }, { at: 0.9, shake: 1.2 }, { at: 0.9, feed: 'Accrochage : Wolf et Gasly' }],
  },
  jeu_gravier: { stage: { place: [{ car: 'Hulk', s: 3180, lateral: 25, speed: 6.6 }], steps: 2 }, actions: [{ at: 0.3, car: 'Hulk', nudge: { side: 1, force: 0.3, dur: 0.7 } }] },
  jeu_tribunes: {
    stage: { place: [
      { car: 'Rossi', s: 260, lateral: -10, speed: 9 }, { car: 'Wolf', s: 200, lateral: 12, speed: 9 },
      { car: 'Verstap', s: 140, lateral: -8, speed: 9 }, { car: 'Norris', s: 80, lateral: 10, speed: 9 },
      { car: 'G528', s: 20, speed: 9 },
    ], steps: 2 },
    camera: { s: 600, lateral: 130, zoom: 1.5 }, lock: true,
  },
  montage_mur: {
    stage: { place: [{ car: 'Wolf', s: 5960, lateral: 50, speed: 8 }], steps: 1, feed: [] },
    actions: [{ at: 0, car: 'Wolf', nudge: { side: 1, force: 0.7, dur: 0.5 } }, { at: 0.5, shake: 1 }], move: 'static',
  },
  montage_attaque_genetique: { stage: { place: [{ car: 'G528', s: 4080, lateral: -18, speed: 8.6 }, { car: 'Bottas', s: 4120, lateral: 14, speed: 7.2 }], steps: 2 } },
  montage_trois_de_front: {
    stage: { place: [{ car: 'Rossi', s: 1180, lateral: -32, speed: 8.8 }, { car: 'Verstap', s: 1185, speed: 8.8 }, { car: 'Norris', s: 1175, lateral: 32, speed: 8.8 }], steps: 1 },
    actions: [{ at: 0, car: 'Rossi', lane: -2, mode: 'dépassement', dur: 2 }, { at: 0, car: 'Norris', lane: 2, mode: 'dépassement', dur: 2 }],
    camera: { s: 1320, zoom: 2.4 }, lock: true,
  },
  montage_traces: { stage: { place: [{ car: 'Tsunoda', s: 2200, speed: 7, spin: 0.2 }], steps: 20 } },
  montage_poussiere: { stage: { place: [{ car: 'Alonsa', s: 2400, lateral: -60, speed: 6.5, yaw: -0.3 }], steps: 6 } },
  montage_plus_pres: { stage: { place: [{ car: 'Rossi', s: 4800, speed: 9.3 }, { car: 'player', s: 4755, lateral: 6, speed: 9.4 }], steps: 2 } },
  montage_meute: {
    stage: { place: [
      { car: 'Rossi', s: 4820, speed: 9 }, { car: 'player', s: 4750, lateral: 14, speed: 9 }, { car: 'Wolf', s: 4680, lateral: -12, speed: 9 },
      { car: 'Verstap', s: 4610, speed: 9 }, { car: 'G528', s: 4540, lateral: 12, speed: 9 }, { car: 'Norris', s: 4470, lateral: -10, speed: 9 },
      { car: 'Alonsa', s: 4400, speed: 9 }, { car: 'Gasly', s: 4330, lateral: 10, speed: 9 }, { car: 'Hulk', s: 4260, lateral: -10, speed: 9 },
      { car: 'Albon', s: 4190, speed: 9 }, { car: 'G329', s: 4120, lateral: 12, speed: 9 }, { car: 'Bottas', s: 4050, lateral: -8, speed: 9 },
      { car: 'Tsunoda', s: 3980, speed: 9 },
    ], steps: 2 },
    camera: { s: 4930, zoom: 1 }, lock: true,
  },
  climax_dernier_tour: {
    stage: { place: [{ car: 'player', s: 7520, lateral: -16, speed: 6, lap: 3 }, { car: 'Verstap', s: 7510, lateral: 18, speed: 6, lap: 3 }], steps: 2 },
    camera: { s: 7600, zoom: 2.2 }, cameraTo: { car: 'player', ahead: 40, side: 24, zoom: 2.2 },
  },
  climax_photo_finish: {
    stage: { place: [{ car: 'player', s: 8300, lateral: -25, speed: 9.4, lap: 3 }, { car: 'Verstap', s: 8298, lateral: 25, speed: 9.4, lap: 3 }], steps: 0 },
    timeScale: 0.2, camera: { s: 8550, zoom: 3.4 }, cameraTo: { s: 8584, zoom: 4.2 }, lock: true, move: 'static',
  },
};
