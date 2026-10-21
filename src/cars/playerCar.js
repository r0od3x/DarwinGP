// Voiture du joueur : mêmes pneus, même moteur, même locomotion que les IA (RaceCar). Seules les
// commandes viennent du clavier au lieu du steering. Le volant suit la touche progressivement
// (pas de braquage instantané), comme un vrai pilote.
class PlayerCar extends RaceCar {
  constructor(x, y, angle, team) {
    super(x, y, angle, team);
    this.isPlayer = true;
    this.mode = 'joueur';
    this.keys = { up: false, down: false, left: false, right: false };
    this.steerSpeed = 0.12;
    this.index = null;
    this.s = 0;
    this.lateral = 0;
  }

  // Une image : position sur la piste, puis commandes clavier.
  applyBehaviors(race) {
    const loc = Track.locate(race.track, this.pos, this.index);
    this.index = loc.index;
    this.s = loc.s;
    this.lateral = loc.lateral;
    if (race.phase !== 'race') {
      this.throttle = 0;
      this.steer = 0;
      return;
    }
    if (this.finished) {
      this.throttle = this.vel.mag() > 3 ? -0.3 : 0.2;
      this.steer *= 0.9;
      return;
    }
    const k = this.keys;
    this.throttle = k.up && !k.down ? 1 : k.down ? -1 : 0;
    const goal = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    this.steer += Math.max(-this.steerSpeed, Math.min(this.steerSpeed, goal - this.steer));
  }
}
