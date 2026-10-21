# Capture needs — what Darwin GP needs to film the real trailer

The animatic is already made of **real gameplay clips**. `trailer/stage.js` (`index.html?trailer=<plan>&clip=1`) stages each shot: it builds a race, places the cars, and has #7 driven by an AI stand-in in the player's livery. Timed actions (overtake, defend, spin, push wide, hold the brakes, lights out) and a time scale with interpolation then shape the shot. `lib/clips.mjs` films it frame by frame through Chrome's DevTools protocol. This document lists what is done and what a **final-quality** capture still needs.

Shot numbers refer to `TRAILER_SCRIPT.md` / `trailer.config.mjs`.

---

## 1. A capture mode that is frame-exact

| Need | Why | Status |
| --- | --- | --- |
| Dev-only capture flag (`?trailer=…&capture=…`), never loaded in normal play | constraint: don't change gameplay | flag exists (stills only) |
| Deterministic takes: one seed for the race and every AI | the same take must replay identically | **simulation is already seeded** (`Race.create({ rng })`, the AIs use it); only cosmetic jitter in `carPainter.js` uses `Math.random` (slipstream streaks, brake glow flicker), so seed that too for pixel-identical retakes |
| Virtual clock: draw a frame, capture it, then the next frame (no `requestAnimationFrame` timing) | slow machines must not drop or stretch frames | **done** for the animatic (`lib/clips.mjs`: one DevTools screenshot per frame, HUD included, into ffmpeg). Still to add for the final cut: a lossless or ProRes master and QC (port them from the **9-SnakeIO** recorder) |
| Output sizes 1080p and 4K; cars drawn sharp at big zoom | close-ups (shots 11, 21, 24, 27) | car sprites are cached at 3× (`CarPainter.SCALE`): raise it in capture mode for zooms above 3 |
| Stop p5's own loop before taking over | p5's `noLoop()` lets one queued frame run, which moved the camera | **found and handled** in `stage.js` (camera update frozen in trailer mode) |

## 2. Time control: slow motion and speed ramps

**Done** in clip mode: `timeScale` (number or ramp), cars interpolated between steps (position, angle the short way round). Still missing: interpolation of smoke puffs (they move in small jumps at 20 %). The original requirements were — the game advances one fixed step per drawn frame (`Race.step`, 60 steps/s), and shots 04 (spin, 50 %), 12 (contact, 50 %), 26 (speed ramp up) and 27 (photo finish, 20 %) need:

- a **time scale**: run 0.2–2 steps per output frame, with an accumulator;
- **interpolation** between two steps for drawing: positions and angles (the short way round) of cars and smoke puffs, so slow motion is smooth and not stepped;
- **ramps**: ease into slow motion around a key moment, hold, ease out (in output time, not game time);
- the camera keeps moving in **output time** during slow motion.

## 3. Cameras

The game has three follow cameras (close 1.45, wide 0.75, whole circuit), always from above with no rotation. The trailer needs:

| Camera in the script | Shots | What it means top-down | Needed |
| --- | --- | --- | --- |
| Drone (fixed or slow drift) | 01, 07, 10, 12, 14, 15, 19, 25 | fixed point / slow pan at a chosen zoom | **fixed camera** at a track position `{ s, lateral }` or `{ x, y }`; keyframed position and zoom |
| Chase | 03, 08, 09, 13, 18, 23, 24, 26 | locked on a car, offset ahead / sideways | **follow camera with offsets** (`ahead`, `side`), its own zoom, adjustable smoothing |
| Trackside | 04, 05 | same fixed framing on a corner for two takes | fixed camera saved per corner, reused across shots |
| Close-up (wheel / bumper equivalent) | 11, 21, 24, 27 | very tight zoom on one car (×3.5–5.5) | sharp car sprites at high zoom (see §1) |
| Orbit | (variant for 21 or 27) | the view rotates around a car | **camera rotation**: `render()` has no rotation; add a rotate step to the trailer render path only |
| UI shots | 16, 22 | HUD as the subject | HUD layout control (see §5) |

Also: **zoom punches and shake** on impacts (02, 12, 17, 24), and **keyframes** in time relative to a key moment ("1 s before the contact, be here at zoom 2.6").

**Done** in clip mode: fixed and follow cameras with offsets, blend from a start to an end framing, zoom / offset moves, punch, shake on actions, smoothing. Missing: rotation (orbit), keyframes relative to a detected key moment, sharp sprites above zoom 3.

## 4. Scripted behaviour per shot

The AIs drive themselves; most shots need a guaranteed event at a known place and time. The animatic **forces** them with timed actions (`TRAILER.clips` in the config): #7 is an AI stand-in, overtakes and defences are triggered, spins and wide moments are pushed. For the final capture, follow the snake game's approach to keep the action organic: **stage a scenario, dry-run the simulation to find the key moment, and start the take a few seconds before it**.

| Shot | Must happen | How |
| --- | --- | --- |
| 01–02 lights, launch | 5 lights, lights out at an exact frame | fix `lightsOutAt` (now random), start from the grid |
| 03, 18 AI vision | genetic car threading the esses / passing Bottas, rays visible | place the cars; the debug overlay already draws rays, targets and outputs (see §5 for a cleaner style) |
| 04 Generation 329 | runs wide at turn 1 and spins into the gravel | place G329 on the approach at race speed; its brain naturally overshoots (0.19 lap trained). Key = spin start or gravel surface |
| 05 Generation 528 | clean line through the same corner | same start point, G528 brain; same fixed camera as 04 |
| 07 grid launch | real start, pack into turn 1 | plain race from the grid, seeded |
| 08–09 slipstream, overtake | the **player car** drafts Rossi, pulls out, passes into the braking zone | the player car only reads the keyboard: needs an **autopilot / scripted driver** (racing line + lane change at a chosen time), or a scripted AI in the player's livery |
| 10 hairpin defence | Verstap covers the inside, Norris backs off | force the AI's mode (`défense`) or aggression; place the attacker within range |
| 12 contact | Gasly clips Wolf in the chicane and spins | scripted lines that cross; contact spins come from the real collision rule (relative speed > 1.6). Key = the "Accrochage" feed event |
| 13, 23 gravel | car slides through the gravel with dust | a steering offset that pushes the car wide |
| 17 wall | car hits the barrier on the long left | same, harder; key = the "dans le mur" event |
| 19 three abreast | three cars side by side braking for turn 1 | lane assignment for three AIs (the AI already has 5 lanes) |
| 20–21 skid marks, spin | spin with smoke and lasting marks | trigger `startSpin` at a point, or a scripted contact |
| 25 pack train | whole field in a line on the back straight | place in a train at equal speed, or seed a race where they line up |
| 26–27 last lap, photo finish | #7 and Verstap side by side on lap 3/3, **crossing the line together** | two cars at matched speed, control of the winner by a few px; key = line crossing (`finishFrame`), slow motion around it |

**Key-moment events to detect** (by watching the race state each step): spin start, contact (the feed already logs it), wall hit, gravel/grass entry, overtake (standings change), slipstream start, lap / finish line crossing.

## 5. UI control

| Need | Status |
| --- | --- |
| Clean frames: hide the tower, timing, dash, feed, lights, help, driver names, minimap | **done** in `stage.js` (`hud: clean / race / lights / feed`, `names`, `minimap`) |
| Inject feed messages and force standings, lap number and lap time | partly done (feed injection, placed cars get real laps); needs exact control of the tower order for 16 and 26 |
| Show the light gantry alone (01) | done |
| AI debug overlay with a "cinematic" style: rays and targets without the small text | to add (style flag on `drawNeuralDebug` / `drawDebug`, trailer only) |
| Optional: the vignette and the minimap per shot | minimap done; vignette always on |

## 6. Weather and time of day

The game has **no weather and no night**: one track in daylight. The script doesn't use either, and the trailer gets its variety from the track's corners, the cameras and the AI view. A colour grade belongs in the edit, not in the capture.

## 7. Sound for the final cut

- The game synthesises only the **followed car's** engine (`EngineSound`). For capture, log per-frame events (gear changes, braking, contacts, spins, wall hits, line crossings) with their times, and render a sound-effects track offline (as planned for the snake game).
- Music: the animatic uses a generated 120 BPM temp track; the cuts are on its beats, so a real track at 120 BPM drops in directly.

## Suggested build order

1. Capture mode with virtual clock + recorder (port from 9-SnakeIO).
2. Fixed / follow / keyframed cameras with offsets, zoom ramps, shake; sharp sprites at high zoom.
3. Time scale with interpolation and ramps.
4. Scenarios + key-moment detection, then the player autopilot (shots 08, 09, 24, 26, 27).
5. Per-shot UI control and the cinematic debug style.
