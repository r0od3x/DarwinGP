# Darwin GP

Racing cars that teach themselves to drive. Each car has a small neural network for a brain and sees the track through detection rays. A genetic algorithm breeds the best drivers of each generation into the next one. Every generation races on a new, randomly generated track, so the cars learn to *drive* rather than memorise one circuit.

Steering follows Craig Reynolds' model (*Steering Behaviors for Autonomous Characters*): the network chooses a desired velocity, and the steering force is `desired − velocity`, capped at `maxForce`. Built with [p5.js](https://p5js.org/) and no other dependency.

## Run it

Double-click `index.html`. No server and no install needed. Chrome or Edge are recommended for saving trainings to a folder.

## What you can tune

The sliders on the left (UI in French):

- **Rayons de détection** (detection rays): how many (1–15), the opening angle (10°–360°) and their length (50–600 px). A car on the start line previews them live.
- **Voiture**: `maxSpeed` and `maxForce`.
- **Réseau de neurones**: hidden layers (1–4) and neurons per layer (2–32), shown as a live diagram of the leading car's network.
- **Évolution**: population (10–200), mutation rate and maximum time per generation.

The ray count and network size are locked once training starts, because they change the network's shape. *Réinitialiser* unlocks them.

## How a generation works

1. **Generation 1 runs behind the scenes.** Its brains are random and almost every car crashes within seconds, so it is simulated off-screen at full speed. The visible race starts at generation 2.
2. Cars are eliminated when they leave the track, stall or turn back. There are no collisions between cars.
3. **Fitness** is the distance covered along the track.
4. The top 5% are copied unchanged (gold cars). The rest are children of two tournament-selected parents, with uniform crossover and Gaussian mutation.
5. **A new random track** is drawn for each generation. It is rejected if it has hairpins tighter than the original circuit, sections too close together, or a start line in a corner. The *Nouveau circuit à chaque génération* checkbox turns this off.
6. **The champion** is chosen on 4 fixed test tracks that are never used for training. The best car of each generation drives them alone, and the champion is the car with the best average. This rewards cars that generalise, not cars that got an easy track. The green line on the chart shows this test score.

*Champion seul* replays only the champion, on a fresh track each time.

## Save and load

*Arrêter* pauses training. Type a name and click *Sauvegarder*: in Chrome or Edge a *Save as* window lets you pick the folder and edit the name, and other browsers download the file. A save holds:

- the settings and generation number;
- the history and the champion;
- the whole population and the current track.

*Charger…* restores all of it, and *Reprendre* continues from the same generation. Saves from the project's earlier name (*Neuro Racing*) still load.

## Project layout

```
index.html, style.css      page and panel
lib/p5.min.js              p5.js
src/core/                  vehicle.js (Reynolds vehicle), track.js (track geometry)
src/ai/                    neuralNetwork.js (MLP), evolution.js (genetic algorithm)
src/sim/                   trackSensors.js (rays), trackGenerator.js (random tracks),
                           neuralCar.js (the car), trainer.js (generations, champion, saves)
src/render/                trackPainter.js, carPainter.js (drawing only)
src/app/                   sketch.js (p5 loop, UI), saveFile.js (save/load files)
tests/                     Node test suite
```

## Tests

With Node.js 18 or later:

```sh
npm test
```

The tests cover:
- the network (maths, copy, crossover, mutation, JSON);
- the rays, checked against a brute-force test of every track edge;
- random tracks (reproducible seeds, rejection rules) and the car (steering, elimination);
- the genetic algorithm, training and the off-screen generation 1;
- save and resume, including old saves;
- learning itself: within 12 generations the best car drives clearly farther.
