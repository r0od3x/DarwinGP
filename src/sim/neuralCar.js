// Voiture d'une génération : perception (rayons vers les bords), décision (réseau de neurones),
// pilotage de Reynolds (force = vitesse désirée - vitesse, limitée à maxForce), locomotion fournie
// par Vehicle. Elle est éliminée si elle sort de la piste, s'arrête ou fait demi-tour.
class NeuralCar extends Vehicle {
  static COLORS = { normal: ['#4fc3f7', '#0d2b4d'], elite: ['#ffd600', '#151515'] };
  // Arrêt : moins de STALL_DISTANCE px gagnés en STALL_FRAMES images.
  static STALL_DISTANCE = 30;
  static STALL_FRAMES = 120;
  // Demi-tour : plus de REVERSE_DISTANCE px en arrière de sa meilleure position.
  static REVERSE_DISTANCE = 150;

  constructor(x, y, angle, brain, settings, elite = false) {
    super(x, y);
    this.brain = brain;
    this.maxSpeed = settings.maxSpeed;
    this.maxForce = settings.maxForce;
    // Cap de la caisse : celui de la vitesse dès qu'elle roule.
    this.angle = angle;
    // La sortie « direction » tourne le cap désiré d'au plus steerRange radians.
    this.steerRange = Math.PI / 2;
    // Dimensions pour le dessin (CarPainter) et rayon de contact.
    this.length = 34;
    this.width = 15;
    this.r = 9;
    this.elite = elite;
    this.team = { colors: elite ? NeuralCar.COLORS.elite : NeuralCar.COLORS.normal, number: '' };
    this.throttle = 0;
    this.drafting = false;
    // Position sur la piste : indice de la ligne médiane, abscisse, distance parcourue (déroulée).
    this.index = null;
    this.s = 0;
    this.progress = 0;
    this.bestProgress = 0;
    this.frames = 0;
    this.checkpoint = { progress: 0, frame: 0 };
    this.alive = true;
    this.death = null;
    // Dernières lectures et décisions, gardées pour l'affichage.
    this.rays = [];
    this.inputs = [];
    this.outputs = [0, 0];
    this.steering = createVector(0, 0);
  }

  headingAngle() {
    return this.vel.mag() > 0.05 ? Math.atan2(this.vel.y, this.vel.x) : this.angle;
  }

  // Perception : distance au bord le long de chaque rayon (0 = contre le bord, 1 = rien en vue),
  // plus la vitesse ramenée entre 0 et 1.
  sense(sensors, angles, length) {
    this.rays = TrackSensors.read(sensors, this.pos, this.headingAngle(), angles, length);
    this.inputs = this.rays.map(ray => ray.distance / length);
    this.inputs.push(this.vel.mag() / this.maxSpeed);
    return this.inputs;
  }

  // Sorties du réseau -> vitesse désirée : sortie 0 = virage (-1 gauche, 1 droite, jusqu'à
  // steerRange), sortie 1 = vitesse (-1 arrêt, 1 maxSpeed). Steering de Reynolds.
  steer(outputs) {
    const angle = this.headingAngle() + outputs[0] * this.steerRange;
    const speed = this.maxSpeed * (outputs[1] + 1) / 2;
    const desired = createVector(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.throttle = speed >= this.vel.mag() - 0.05 ? 1 : -1;
    return p5.Vector.sub(desired, this.vel).limit(this.maxForce);
  }

  applyBehaviors(sensors, angles, length) {
    this.outputs = this.brain.predict(this.sense(sensors, angles, length));
    this.steering = this.steer(this.outputs);
    this.applyForce(this.steering);
  }

  update() {
    super.update();
    if (this.vel.mag() > 0.05) this.angle = Math.atan2(this.vel.y, this.vel.x);
    this.frames++;
  }

  placeOnTrack(track) {
    const loc = Track.locate(track, this.pos);
    this.index = loc.index;
    this.s = loc.s;
  }

  // Suivi de la position sur la piste, puis règles d'élimination.
  followTrack(track) {
    const loc = Track.locate(track, this.pos, this.index);
    this.progress += Track.gap(track, this.s, loc.s);
    this.s = loc.s;
    this.index = loc.index;
    this.bestProgress = Math.max(this.bestProgress, this.progress);
    if (loc.distance > track.width / 2) return this.eliminate('sortie de piste');
    if (this.progress < this.bestProgress - NeuralCar.REVERSE_DISTANCE) return this.eliminate('demi-tour');
    if (this.bestProgress >= this.checkpoint.progress + NeuralCar.STALL_DISTANCE) {
      this.checkpoint = { progress: this.bestProgress, frame: this.frames };
    } else if (this.frames - this.checkpoint.frame > NeuralCar.STALL_FRAMES) {
      return this.eliminate('arrêt');
    }
    return true;
  }

  eliminate(reason) {
    this.alive = false;
    this.death = reason;
    this.vel.set(0, 0);
    return false;
  }

  // Score génétique : la plus grande distance parcourue (px) ; plus de tours = meilleur score.
  fitness() {
    return Math.max(0, this.bestProgress);
  }

  show(ctx = typeof drawingContext === 'undefined' ? null : drawingContext) {
    if (ctx) CarPainter.draw(ctx, this);
  }
}
