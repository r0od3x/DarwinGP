// Monoplace : la couche « locomotion » de Reynolds pour une voiture. Les commandes (accélérateur,
// frein, volant) deviennent des forces appliquées avec applyForce, puis l'update fourni de Vehicle
// intègre vitesse et position. Contrairement au véhicule de base, la caisse a son propre cap
// (angle) : la vitesse peut s'en écarter, c'est la glisse.
// Échelle : 1 px ≈ 0,15 m, 60 images/s ; 9,5 px/image ≈ 300 km/h ; adhérence ≈ 4 g.
class RaceCar extends Vehicle {
  static KMH = 36;

  constructor(x, y, angle = 0, team = null) {
    super(x, y);
    this.angle = angle;
    this.team = team ?? { name: 'Équipe', number: 0, colors: ['#e53935', '#ffffff'], driver: 'Pilote' };
    // Dimensions (px) : longueur, largeur, empattement.
    this.length = 34;
    this.width = 15;
    this.wheelbase = 24;
    this.r = 9;
    // Moteur : poussée maximale (px/image²) limitée par la puissance (poussée × vitesse) ; la
    // traînée aérodynamique fixe la vitesse de pointe (≈ topSpeed). Freinage maximal.
    this.engine = 0.03;
    this.power = 0.3;
    this.aero = 0.00026;
    this.topSpeed = 9.5;
    this.brakePower = 0.095;
    this.maxSpeed = this.topSpeed * 1.08;
    // Pneus : adhérence latérale maximale (px/image²) et raideur (part de la glisse corrigée par image).
    this.grip = 0.08;
    this.gripStiffness = 0.35;
    // Direction : angle de braquage maximal (rad). À haute vitesse, il est limité pour que le virage
    // demande au plus steerMargin × l'adhérence : trop vite dans un virage, la voiture élargit
    // (sous-virage) au lieu de partir en tête-à-queue.
    this.maxSteer = 0.55;
    this.steerMargin = 1.3;
    // Commandes de l'image (entre -1 et 1 ; throttle < 0 = frein).
    this.throttle = 0;
    this.steer = 0;
    // État : glisse latérale, surface, aspiration, tête-à-queue.
    this.slip = 0;
    this.sliding = false;
    this.surface = 'asphalt';
    this.drafting = false;
    this.spin = 0;
    this.spinRate = 0;
    this.overGrip = 0;
    // Mémoire pour les traces de pneus (positions des roues arrière à l'image précédente).
    this.lastRear = null;
  }

  forward() {
    return { x: Math.cos(this.angle), y: Math.sin(this.angle) };
  }

  right() {
    return { x: -Math.sin(this.angle), y: Math.cos(this.angle) };
  }

  // Vitesse dans le repère de la voiture : vers l'avant et sur le côté.
  localVelocity() {
    const f = this.forward();
    const r = this.right();
    return { along: this.vel.x * f.x + this.vel.y * f.y, side: this.vel.x * r.x + this.vel.y * r.y };
  }

  speedKmh() {
    return Math.round(this.vel.mag() * RaceCar.KMH);
  }

  // Adhérence et traînée selon la surface : asphalte, herbe, gravier.
  surfaceFactors() {
    if (this.surface === 'grass') return { grip: 0.55, drag: 0.006, engine: 0.75 };
    if (this.surface === 'gravel') return { grip: 0.45, drag: 0.014, engine: 0.6 };
    return { grip: 1, drag: 0, engine: 1 };
  }

  // Locomotion : commandes -> forces (moteur ou frein, traînée, adhérence latérale) et rotation de
  // la caisse. Les forces passent par applyForce ; la position est mise à jour par update().
  drive() {
    const f = this.forward();
    const r = this.right();
    const { along, side } = this.localVelocity();
    const speed = this.vel.mag();
    const ground = this.surfaceFactors();
    const throttle = Math.max(-1, Math.min(1, this.throttle));
    const steer = Math.max(-1, Math.min(1, this.steer));

    if (this.spin > 0) {
      // Tête-à-queue : la caisse tourne sur elle-même, les pneus freinent fort.
      this.angle += this.spinRate;
      this.spinRate *= 0.97;
      this.spin--;
      this.applyForce(this.vel.copy().mult(-0.035));
      this.slip = Math.abs(side);
      this.sliding = speed > 0.4;
      return;
    }

    // Moteur (poussée limitée par la puissance) ou freins (contre le mouvement).
    if (throttle >= 0) {
      const push = Math.min(this.engine, this.power / Math.max(1, Math.abs(along))) * ground.engine * throttle;
      this.applyForce(createVector(f.x * push, f.y * push));
    } else if (speed > 0.01) {
      const brake = Math.min(speed, this.brakePower * -throttle * Math.max(0.6, ground.grip));
      this.applyForce(this.vel.copy().setMag(-brake));
    }
    // Traînée aérodynamique (réduite dans l'aspiration) et roulement / sol.
    const drag = (this.drafting ? 0.6 : 1) * this.aero * speed * speed + ground.drag * speed + 0.0008 * speed;
    if (speed > 0) this.applyForce(this.vel.copy().setMag(-drag));
    // Adhérence latérale : ramène la vitesse dans l'axe de la caisse, dans la limite des pneus.
    const grip = this.grip * ground.grip;
    const wanted = -side * this.gripStiffness;
    const lateral = Math.max(-grip, Math.min(grip, wanted));
    this.applyForce(createVector(r.x * lateral, r.y * lateral));
    this.slip = Math.abs(side);
    this.sliding = Math.abs(wanted) > grip * 1.05 && speed > 1.5;
    // Rotation de la caisse : modèle « bicyclette » ; braquage limité par la vitesse (v² tan δ / L ≤ marge × adhérence).
    const v2 = Math.max(0.25, along * along);
    const limit = Math.min(this.maxSteer, Math.atan(this.steerMargin * grip * this.wheelbase / v2));
    const steerAngle = steer * limit;
    // Sous-virage : la caisse ne tourne pas plus vite que ce que l'adhérence permet (un peu plus,
    // pour que la voiture puisse glisser légèrement).
    const yaw = along * Math.tan(steerAngle) / this.wheelbase;
    const maxYaw = grip * 1.15 / Math.max(0.5, speed);
    this.angle += Math.max(-maxYaw, Math.min(maxYaw, yaw));
    // Auto-alignement des pneus : la caisse est ramenée vers la direction de la vitesse, d'autant
    // plus que l'angle de glisse est grand (la voiture ne part pas en toupie toute seule).
    if (speed > 0.5) {
      let drift = Math.atan2(this.vel.y, this.vel.x) - this.angle;
      while (drift > Math.PI) drift -= Math.PI * 2;
      while (drift < -Math.PI) drift += Math.PI * 2;
      if (Math.abs(drift) < Math.PI / 2) this.angle += drift * 0.12 * ground.grip;
    }
    // Trop de glisse trop longtemps : tête-à-queue.
    this.overGrip = Math.abs(wanted) > grip * 2.6 && speed > 3 ? this.overGrip + 1 : Math.max(0, this.overGrip - 2);
    if (this.overGrip > 14) this.startSpin(Math.sign(side || 1) * 0.22);
  }

  startSpin(rate) {
    this.spin = 70;
    this.spinRate = rate;
    this.overGrip = 0;
  }

  // Positions des roues (avant gauche, avant droite, arrière gauche, arrière droite).
  wheels() {
    const f = this.forward();
    const r = this.right();
    const a = this.length * 0.32;
    const b = this.width * 0.55;
    return [[a, -b], [a, b], [-a, -b], [-a, b]].map(([u, v]) => ({
      x: this.pos.x + f.x * u + r.x * v, y: this.pos.y + f.y * u + r.y * v,
    }));
  }

  // Deux cercles (avant, arrière) pour les contacts entre voitures.
  circles() {
    const f = this.forward();
    const d = this.length * 0.26;
    return [{ x: this.pos.x + f.x * d, y: this.pos.y + f.y * d }, { x: this.pos.x - f.x * d, y: this.pos.y - f.y * d }];
  }

  update() {
    this.drive();
    super.update();
  }

  // Dessin : livrée de l'écurie, ombre, disques de frein, aspiration (carPainter.js).
  show(ctx = typeof drawingContext === 'undefined' ? null : drawingContext) {
    if (ctx) CarPainter.draw(ctx, this);
  }
}
