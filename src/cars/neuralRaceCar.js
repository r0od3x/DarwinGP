// Pilote « génétique » : le cerveau d'une génération du simulateur d'entraînement génétique (réseau de neurones évolué
// par algorithme génétique) au volant d'une vraie monoplace de la course.
// 1. Perception, comme à l'entraînement : rayons vers les bords de la piste (TrackSensors), avec
//    le nombre, l'ouverture et la longueur de rayons de sa génération, plus la vitesse.
// 2. Décision : le réseau donne un virage (jusqu'à ±90° autour du cap) et une vitesse désirée ;
//    c'est la vitesse désirée de Reynolds, telle que le réseau l'a apprise.
// 3. Locomotion : celle de RaceCar (volant, accélérateur, frein -> forces, adhérence limitée).
//    Le réseau a appris sur une voiture plus simple (force max sans limite d'adhérence) : les
//    vieilles générations, et parfois les meilleures, sortent donc de piste ou partent en
//    tête-à-queue. Hors piste ou à contresens, le réseau ne voit plus rien d'utile : la voiture
//    rejoint la piste (seek d'un point de la piste un peu devant), puis le réseau reprend la main.
//    De même s'il est bloqué (moins de STALL_DISTANCE px gagnés en STALL_FRAMES images : à
//    l'entraînement, il aurait été éliminé) : relance pendant RESCUE_FRAMES images.
// Les autres pilotes le voient comme n'importe quelle voiture (dépassement, évitement).
class NeuralRaceCar extends RaceCar {
  static MODES = { réseau: '#e040fb', 'retour piste': '#ffab40', relance: '#69f0ae', 'tête-à-queue': '#ff9100', grille: '#9e9e9e', arrivée: '#c6f36b' };
  static STALL_DISTANCE = 30;
  static STALL_FRAMES = 120;
  static RESCUE_FRAMES = 90;
  // Index des bords de piste pour les rayons, construit une fois par circuit.
  static sensorCache = new WeakMap();

  static sensorsFor(track) {
    if (!NeuralRaceCar.sensorCache.has(track)) NeuralRaceCar.sensorCache.set(track, TrackSensors.build(track));
    return NeuralRaceCar.sensorCache.get(track);
  }

  constructor(x, y, angle, team, spec) {
    super(x, y, angle, team);
    this.isNeural = true;
    this.spec = spec;
    this.generation = spec.generation;
    this.brain = NeuralNetwork.fromJSON(spec.brain);
    this.angles = TrackSensors.rayAngles(spec.settings.rays, spec.settings.spread * Math.PI / 180);
    this.rayLength = spec.settings.rayLength;
    // Vitesse maximale de l'entraînement : les entrées et la sortie « vitesse » s'y rapportent.
    this.brainSpeed = spec.settings.maxSpeed;
    this.mode = 'grille';
    this.index = null;
    this.s = 0;
    this.lateral = 0;
    this.rays = [];
    this.outputs = [0, 0];
    this.targetSpeed = 0;
    this.desiredHeading = angle;
    // Locomotion : mêmes gains que les pilotes à steering (aiCar.js).
    this.steerGain = 2.4;
    this.speedGain = 1.4;
    // Retour en piste : vitesse et distance du point visé devant.
    this.recoverSpeed = 3;
    this.recoverLead = 90;
    // Détection de blocage : dernière avancée notable (abscisse déroulée) et son image.
    this.gainMark = null;
    this.gainFrame = 0;
    this.rescue = 0;
  }

  // Bloqué : pas d'avancée notable depuis STALL_FRAMES images (progress est tenu par la course).
  checkStall(race) {
    const progress = this.progress ?? this.s;
    if (this.gainMark === null || progress > this.gainMark + NeuralRaceCar.STALL_DISTANCE) {
      this.gainMark = progress;
      this.gainFrame = race.frame;
    } else if (race.frame - this.gainFrame > NeuralRaceCar.STALL_FRAMES && !this.finished) {
      this.rescue = NeuralRaceCar.RESCUE_FRAMES;
      this.gainFrame = race.frame;
    }
  }

  headingAngle() {
    return this.vel.mag() > 0.05 ? Math.atan2(this.vel.y, this.vel.x) : this.angle;
  }

  // Entrées du réseau : distance au bord / longueur pour chaque rayon, puis vitesse / vitesse max.
  sense(track) {
    this.rays = TrackSensors.read(NeuralRaceCar.sensorsFor(track), this.pos, this.headingAngle(), this.angles, this.rayLength);
    const inputs = this.rays.map(ray => ray.distance / this.rayLength);
    inputs.push(this.vel.mag() / this.brainSpeed);
    return inputs;
  }

  // Sorties -> cap et vitesse désirés (comme NeuralCar.steer de l'entraînement).
  think(track) {
    this.outputs = this.brain.predict(this.sense(track));
    this.desiredHeading = this.headingAngle() + this.outputs[0] * Math.PI / 2;
    this.targetSpeed = this.brainSpeed * (this.outputs[1] + 1) / 2;
  }

  // Hors piste ou à contresens : cap vers un point de la piste un peu devant.
  recover(track) {
    const limit = track.width / 2 - 20;
    const lateral = Math.max(-limit, Math.min(limit, this.lateral));
    const p = Track.pointAt(track, this.s + this.recoverLead, lateral * 0.5);
    this.rays = [];
    this.desiredHeading = Math.atan2(p.y - this.pos.y, p.x - this.pos.x);
    this.targetSpeed = this.recoverSpeed;
  }

  needsRecovery(track) {
    const t = Track.tangentAt(track, this.s);
    const f = this.forward();
    const offTrack = Math.abs(this.lateral) > track.width / 2 + Race.KERB;
    const wrongWay = t.x * f.x + t.y * f.y < 0;
    return offTrack || wrongWay;
  }

  applyBehaviors(race) {
    const track = race.track;
    const loc = Track.locate(track, this.pos, this.index);
    this.index = loc.index;
    this.s = loc.s;
    this.lateral = loc.lateral;
    if (race.phase !== 'race') {
      this.mode = race.phase === 'finished' ? 'arrivée' : 'grille';
      this.throttle = 0;
      this.steer = 0;
      return;
    }
    if (this.spin > 0) {
      this.mode = 'tête-à-queue';
      return;
    }
    this.checkStall(race);
    if (this.rescue > 0) {
      this.rescue--;
      this.mode = 'relance';
      this.recover(track);
    } else if (this.needsRecovery(track)) {
      this.mode = 'retour piste';
      this.recover(track);
    } else {
      this.mode = this.finished ? 'arrivée' : 'réseau';
      this.think(track);
      // Tour d'honneur : tranquille.
      if (this.finished) this.targetSpeed = Math.min(this.targetSpeed, 3);
    }
    let diff = this.desiredHeading - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.steer = Math.max(-1, Math.min(1, diff * this.steerGain));
    this.throttle = Math.max(-1, Math.min(1, (this.targetSpeed - this.localVelocity().along) * this.speedGain));
  }
}
