// Pilote IA : les trois couches de Reynolds.
// 1. Sélection de l'action (perceive / decide) : quelle voie viser et à quelle vitesse, selon les
//    voitures autour (aspiration, dépassement, défense), les accidents (évitement) et l'état de
//    la voiture (relance après un tête-à-queue).
// 2. Steering : weightedSteering de Vehicle = follow (la voie choisie, comme un chemin de Reynolds)
//    + separate (les voitures proches) + avoid (trois points de détection : voitures accidentées)
//    + un peu de wander (imprécision humaine), plus un retour sur la piste si on en sort.
// 3. Locomotion : la force de steering devient volant, accélérateur et frein (RaceCar), qui
//    deviennent des forces (applyForce) intégrées par l'update de Vehicle.
class AICar extends RaceCar {
  static MODES = {
    grille: '#9e9e9e', course: '#ffffff', aspiration: '#82b1ff', dépassement: '#ff4081', défense: '#ffd740',
    évite: '#ff5252', relance: '#69f0ae', 'tête-à-queue': '#ff9100', arrivée: '#c6f36b',
  };

  constructor(x, y, angle, team, personality = {}, rng = Math.random) {
    super(x, y, angle, team);
    this.rng = rng;
    // Personnalité : habileté (adhérence exploitée), agressivité (dépasse, défend), régularité.
    this.skill = personality.skill ?? 0.95;
    this.aggression = personality.aggression ?? 0.5;
    this.consistency = personality.consistency ?? 0.95;
    // Voie visée (-2 à 2, 0 = trajectoire de course) et voie suivie actuellement.
    this.lane = 0;
    this.laneTarget = 0;
    this.mode = 'grille';
    this.modeTimer = 0;
    this.defended = false;
    this.index = null;
    this.s = 0;
    this.lateral = 0;
    this.targetSpeed = 0;
    this.lateBrake = 0;
    this.recover = 0;
    this.ahead = null;
    this.behind = null;
    this.hazards = [];
    this.profile = null;
    // Steering : poids de la somme pondérée de Vehicle.
    this.weights = { follow: 1, separate: 0.7, wander: 0.04, avoid: 3 };
    this.separationRadius = 42;
    this.followPrediction = 20;
    this.followLookAhead = 30;
    this.avoidMargin = 10;
    // Locomotion : gain volant (rad -> commande) et gain vitesse (px/image -> pédale).
    this.steerGain = 2.4;
    this.speedGain = 1.4;
  }

  // Profil de vitesse personnel : un pilote moins habile exploite moins l'adhérence et freine plus tôt.
  prepare(track) {
    this.profile = Track.speedProfile(track, {
      grip: this.grip * (0.72 + 0.16 * this.skill), brake: this.brakePower * (0.6 + 0.25 * this.skill), top: this.topSpeed,
    });
  }

  // ---------- 1. Perception ----------
  perceive(race) {
    const track = race.track;
    const loc = Track.locate(track, this.pos, this.index);
    this.index = loc.index;
    this.s = loc.s;
    this.lateral = loc.lateral;
    this.ahead = null;
    this.behind = null;
    this.hazards = [];
    const myLane = this.lateral - Track.sample(track, track.offsets, this.s);
    for (const other of race.cars) {
      if (other === this) continue;
      const gap = Track.gap(track, this.s, other.s);
      const otherLane = other.lateral - Track.sample(track, track.offsets, other.s);
      const aligned = Math.abs(otherLane - myLane) < 26;
      if (gap > 0 && gap < 220 && aligned && (!this.ahead || gap < this.ahead.gap)) this.ahead = { car: other, gap, lane: otherLane };
      if (gap < 0 && gap > -90 && (!this.behind || gap > this.behind.gap)) this.behind = { car: other, gap, lane: otherLane };
      // Voiture accidentée ou arrêtée devant : un obstacle à éviter.
      const running = race.phase === 'race' && race.frame - race.startFrame > 240;
      const stopped = other.spin > 0 || (running && other.vel.mag() < 1 && !other.finished);
      if (stopped && gap > -20 && gap < 450) this.hazards.push({ pos: other.pos, r: 16, lane: otherLane, gap });
    }
  }

  // ---------- 2. Sélection de l'action ----------
  setMode(mode, frames = 0) {
    this.mode = mode;
    this.modeTimer = frames;
  }

  // Voie (-2..2) libre la plus proche de la voie actuelle, de l'autre côté de l'obstacle.
  passingLane(obstacleLane) {
    return obstacleLane >= 0 ? -2 : 2;
  }

  decide(race) {
    if (this.modeTimer > 0) this.modeTimer--;
    if (race.phase !== 'race' || this.finished) {
      this.setMode(this.finished ? 'arrivée' : 'grille');
      this.laneTarget = 0;
      return;
    }
    if (this.spin > 0) {
      this.setMode('tête-à-queue');
      this.recover = 120;
      return;
    }
    if (this.recover > 0) {
      // Relance : on repart doucement depuis là où l'on est, puis on rejoint la trajectoire.
      this.recover--;
      this.setMode('relance');
      this.laneTarget = Math.max(-2, Math.min(2, Math.round((this.lateral - Track.sample(race.track, race.track.offsets, this.s)) / 24)));
      if (this.recover < 60) this.laneTarget = 0;
      return;
    }
    const hazard = this.hazards.sort((a, b) => a.gap - b.gap)[0];
    if (hazard) {
      this.setMode('évite', 30);
      this.laneTarget = this.passingLane(hazard.lane);
      return;
    }
    if (this.mode === 'dépassement' && this.overtaking) {
      // On reste dans la voie de dépassement jusqu'à ce que l'adversaire soit derrière.
      const gap = Track.gap(race.track, this.s, this.overtaking.s);
      if (gap > -30 && gap < 260) return;
      this.overtaking = null;
    }
    const ahead = this.ahead;
    const mySpeed = Track.sample(race.track, this.profile, this.s + 120);
    if (ahead && ahead.gap < 110) {
      // On ne tente un dépassement que nettement plus rapide (ou dans l'aspiration), et pas à chaque image.
      const faster = mySpeed > ahead.car.vel.mag() + 0.45 || (this.drafting && ahead.gap < 70);
      if (faster && this.rng() < 0.008 + this.aggression * 0.03) {
        this.overtaking = ahead.car;
        this.laneTarget = this.passingLane(ahead.lane);
        this.setMode('dépassement', 240);
        return;
      }
    }
    // Défense : une seule fois, on se place à l'intérieur du prochain virage.
    if (this.behind && this.behind.gap > -55 && !this.defended && this.aggression > 0.55) {
      const inside = Track.sample(race.track, race.track.offsets, this.s + 260);
      if (Math.abs(inside) > 12) {
        this.laneTarget = inside > 0 ? 1 : -1;
        this.defended = true;
        this.setMode('défense', 150);
        return;
      }
    }
    if (this.mode === 'défense' && this.modeTimer > 0) return;
    if (!this.behind) this.defended = false;
    this.laneTarget = 0;
    this.setMode(this.drafting ? 'aspiration' : 'course');
  }

  // ---------- 3. Steering et locomotion ----------
  // Vitesse visée : le profil de vitesse lu un peu devant (anticipation du freinage), ajusté au mode.
  computeTargetSpeed(race) {
    const track = race.track;
    if (race.phase !== 'race') return 0;
    // Vitesse la plus basse permise sur le bout de piste qui arrive (environ 10 images devant).
    const reach = Math.max(60, this.vel.mag() * 10);
    let v = Infinity;
    for (let d = 0; d <= reach; d += track.step) v = Math.min(v, Track.sample(track, this.profile, this.s + d));
    // Tour d'honneur après l'arrivée : tranquille, sans dépasser la vitesse des virages.
    if (this.finished) return Math.min(v, 3);
    // Erreur humaine : un freinage trop tardif de temps en temps (moins régulier = plus souvent).
    const dropAhead = Track.sample(track, this.profile, this.s) - Track.sample(track, this.profile, this.s + 300);
    if (this.lateBrake === 0 && dropAhead > 3 && this.rng() < (1 - this.consistency) * 0.04) this.lateBrake = 45;
    if (this.lateBrake > 0) {
      this.lateBrake--;
      v += 1.1;
    }
    if (this.mode === 'relance') v *= 0.65;
    if (this.mode === 'évite') v *= 0.8;
    if (this.mode === 'dépassement') v += 0.15;
    // Pas de choc par l'arrière : derrière une voiture, sur la même voie, on règle sa vitesse sur elle.
    if (this.ahead && this.ahead.gap < 55 && this.mode !== 'dépassement') v = Math.min(v, this.ahead.car.vel.mag() - 0.15);
    // Hors piste : on ralentit.
    if (this.surface !== 'asphalt') v = Math.min(v, 3);
    return Math.max(0, v);
  }

  // Retour sur la piste : au-delà du bord, vitesse désirée vers l'axe de la piste.
  stayOnTrack(track) {
    const limit = track.width / 2 - 18;
    if (Math.abs(this.lateral) < limit) return createVector(0, 0);
    const target = Track.pointAt(track, this.s + 60, Math.sign(this.lateral) * (limit - 20));
    return this.seek(createVector(target.x, target.y));
  }

  // Morceau de la voie autour de la voiture (un peu derrière, bien devant) : follow() n'a pas à
  // parcourir tout le circuit à chaque image.
  laneWindow(lane, behind = 8, ahead = 40) {
    const n = lane.points.length;
    const start = (this.index ?? 0) - behind;
    const points = [];
    for (let k = 0; k <= behind + ahead; k++) points.push(lane.points[((start + k) % n + n) % n]);
    return { points, radius: lane.radius, closed: false };
  }

  applyBehaviors(race) {
    const track = race.track;
    if (!this.profile) this.prepare(track);
    this.perceive(race);
    this.decide(race);
    this.lane += (this.laneTarget - this.lane) * 0.05;
    const laneIndex = Math.max(-2, Math.min(2, Math.round(this.lane)));
    const speed = this.vel.mag();
    // Réglages de follow et avoid proportionnels à la vitesse (on regarde plus loin quand on va vite).
    this.followPrediction = 12 + speed * 5;
    this.followLookAhead = 20 + speed * 6;
    this.avoidLookAhead = 40 + speed * 14;
    const others = race.cars.filter(c => c !== this && Math.hypot(c.pos.x - this.pos.x, c.pos.y - this.pos.y) < 80);
    const steering = this.weightedSteering({ path: this.laneWindow(race.lanes[laneIndex + 2]), others, obstacles: this.hazards, rng: this.rng });
    steering.add(this.stayOnTrack(track).mult(2));
    this.steering = steering;
    // Locomotion : direction de base vers le point visé sur la voie (follow), déviée par les autres
    // forces (séparation, évitement, retour sur la piste, imprécision), puis volant.
    const forward = this.forward();
    const other = steering.copy().sub(this.forces.follow);
    const aim = this.followInfo
      ? createVector(this.followInfo.target.x - this.pos.x, this.followInfo.target.y - this.pos.y).setMag(Math.max(1, speed))
      : createVector(forward.x, forward.y);
    const wanted = createVector(aim.x + other.x * 25, aim.y + other.y * 25);
    let diff = Math.atan2(wanted.y, wanted.x) - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.steer = Math.max(-1, Math.min(1, diff * this.steerGain));
    this.targetSpeed = this.computeTargetSpeed(race);
    this.throttle = Math.max(-1, Math.min(1, (this.targetSpeed - this.localVelocity().along) * this.speedGain));
    // Accélération progressive en sortie de virage : moins de gaz tant que le volant est tourné.
    // (À basse vitesse, pour repartir ou se dégager, on garde les gaz.)
    if (this.throttle > 0 && speed > 3) this.throttle *= Math.max(0.25, 1 - Math.abs(this.steer) * 0.8);
  }
}
