# Darwin GP — IA réactive

Une course de monoplaces vue de dessus en p5.js, sans dépendance à installer, sur le circuit « Prairie GP ». Les pilotes IA sont construits avec les *steering behaviors* de Craig W. Reynolds (« Steering Behaviors for Autonomous Characters », GDC 1999).

## Lancer

Ouvre `index.html` dans un navigateur, ou sers le dossier (`python -m http.server 8000`, puis http://localhost:8000).

Au menu, choisis :
- **Piloter contre l'IA** ou **Regarder la course** ;
- le nombre de tours et d'adversaires ;
- le son du moteur.

Puis clique sur **Départ**.

| Touche | Effet |
| --- | --- |
| Flèches / ZQSD | piloter (accélérer, freiner, tourner) |
| C | caméra : proche, large, circuit entier |
| D | debug IA : point visé, voie, dangers, force de steering, vitesse visée et profil de vitesse |
| Tab | changer de voiture suivie (ou clic dans le classement) |
| M | son du moteur |
| R | recommencer |
| Échap | menu |

## L'IA : les trois couches de Reynolds

1. **Sélection de l'action** (`aiCar.js`, `perceive` / `decide`) : chaque pilote perçoit la voiture devant et derrière lui sur sa voie, ainsi que les voitures arrêtées ou en tête-à-queue. Il choisit ensuite un mode :
   - course ;
   - aspiration ;
   - dépassement : changement de voie, seulement s'il est nettement plus rapide, selon son agressivité ;
   - défense : il se place à l'intérieur du prochain virage ;
   - évite : il passe de l'autre côté d'un accident ;
   - relance après un tête-à-queue.
2. **Steering** : la somme pondérée de `Vehicle`, faite de :
   - *path following* sur la voie choisie, l'une des cinq voies parallèles à la trajectoire de course ;
   - *separation* avec les voitures proches ;
   - *obstacle avoidance* à trois points de détection ;
   - un peu de *wander*, pour l'imprécision humaine ;
   - un retour sur la piste.

   La vitesse visée vient d'un **profil de vitesse** (`track.js`) : `v = √(adhérence / courbure)` dans les virages, puis une passe arrière qui crée les zones de freinage. Chaque pilote a son propre profil, qui dépend de son habileté. Il commet parfois des erreurs, comme un freinage trop tardif.
3. **Locomotion** (`raceCar.js`) : volant, accélérateur et frein deviennent des forces (`applyForce`) que `Vehicle.update` intègre. Le modèle couvre :
   - un moteur limité en puissance et la traînée aérodynamique ;
   - une adhérence latérale bornée ;
   - un braquage limité par la vitesse, d'où le sous-virage ;
   - le tête-à-queue ;
   - l'herbe et le gravier ;
   - l'aspiration.

Le joueur (`playerCar.js`) utilise exactement la même locomotion ; seules les commandes viennent du clavier.

## IA génétiques (réseaux de neurones)

Au menu, « IA génétiques » donne à certains adversaires le cerveau d'une **génération** d'un simulateur d'entraînement génétique (réseaux de neurones sélectionnés génération après génération). Les autres gardent le steering de Reynolds : au moins deux, toujours.

- **Perception** : des rayons vers les bords de la piste, comme à l'entraînement, plus la vitesse.
- **Décision** : le réseau donne un virage (jusqu'à ±90°) et une vitesse désirée.
- **Locomotion** : la même que tout le monde (`RaceCar`).
- **Hors piste ou à contresens** : le réseau ne voit plus rien d'utile, alors la voiture rejoint la piste (mode « retour piste »), puis le réseau reprend la main.

Avec D (debug), on voit les rayons de chaque pilote génétique (vert = loin du bord, rouge = proche), le cap qu'il veut prendre et ses deux sorties.

**D'où viennent les générations** (`src/ai/neuralBrains.js`, généré par `tools/buildBrains.mjs`) :

- Les réseaux de la sauvegarde `entrainement-5 → 8 → 8 → 2` (génération 329) ont appris sur la voiture simple du simulateur d'entraînement. Elle peut tourner avec une force six fois plus grande que l'adhérence d'une monoplace. Telles quelles, ces générations prennent tous les virages trop vite et sortent de la piste.
- La population a donc **continué d'évoluer**, avec le même algorithme génétique, dans la physique de la course. Le circuit est Prairie GP, et sortir de la piste élimine. Les générations suivantes apprennent à freiner.
- Le menu propose la génération 329 non adaptée, puis plusieurs générations de l'adaptation, jusqu'à la dernière. Il n'y a plus de génération 1 (réseau au hasard) : elle sortait de la piste dès le départ et n'était pas un adversaire.

Pour refaire les cerveaux (Node 18+, quelques minutes) :

```sh
node tools/buildBrains.mjs --save "<chemin>/entrainement-5 → 8 → 8 → 2.json"
```

Le projet est autonome, outils compris : l'algorithme génétique est dans `src/ai/evolution.js`. Seule la sauvegarde d'entraînement (le fichier `.json`) vient de l'extérieur.

## Fichiers

| Dossier | Fichiers | Rôle |
| --- | --- | --- |
| `src/core/` | `vehicle.js`, `track.js` | véhicule de base de Reynolds (seek, flee, pursue, wander, follow, separate, avoid, somme pondérée) ; géométrie du circuit, trajectoire de course, profil de vitesse |
| `src/cars/` | `raceCar.js`, `aiCar.js`, `playerCar.js`, `neuralRaceCar.js`, `gearbox.js` | monoplace et ses pilotes (une classe par fichier, toutes des `Vehicle`), boîte de vitesses |
| `src/ai/` | `neuralNetwork.js`, `trackSensors.js`, `neuralBrains.js`, `evolution.js` | réseau de neurones, rayons de détection, cerveaux par génération, algorithme génétique (outils) |
| `src/race/` | `race.js`, `smokePuff.js` | grille, feux, aspiration, surfaces, contacts, tours, classement, fumée |
| `src/render/` | `trackPainter.js`, `carPainter.js` | dessin du circuit et des voitures |
| `src/audio/` | `engineSound.js` | son du moteur (Web Audio) |
| `src/app/` | `sketch.js` | boucle p5, caméra, interface |
| `tools/` | `buildBrains.mjs`, `raceTrainer.mjs` | évolution des cerveaux dans la physique de la course |
| `lib/` | `p5.min.js` | p5.js |

## Tests

```sh
npm test            # ou : node --test tests/
```

Les tests couvrent :
- la géométrie du circuit et le profil de vitesse ;
- la physique de la voiture (accélération, freinage, sous-virage, tête-à-queue, surfaces) ;
- la perception et les décisions de l'IA ;
- la grille et les feux, l'aspiration et les contacts ;
- une course complète simulée avec un aléatoire fixé ;
- la boîte de vitesses et le son.
