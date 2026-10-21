// Fumée de pneu : un petit nuage qui part de la roue, ralentit (freinage, vitesse désirée nulle),
// grossit et s'efface. C'est un Vehicle : il ne bouge qu'avec applyForce et l'update fourni.
class SmokePuff extends Vehicle {
  constructor(x, y, vx, vy, size = 10) {
    super(x, y);
    this.vel.set(vx, vy);
    this.maxSpeed = Math.max(1, Math.hypot(vx, vy));
    this.maxForce = 0.05;
    this.r = size;
    this.startSize = size;
    this.age = 0;
    this.life = 70;
  }

  applyBehaviors() {
    this.applyForce(this.vel.copy().mult(-1).limit(this.maxForce));
  }

  update() {
    super.update();
    this.age++;
    this.r = this.startSize * (1 + this.age / this.life * 2.2);
  }

  opacity() {
    return Math.max(0, 1 - this.age / this.life) * 0.45;
  }

  expired() {
    return this.age >= this.life;
  }

  show(ctx, sprite) {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = this.opacity();
    if (sprite) ctx.drawImage(sprite, this.pos.x - this.r, this.pos.y - this.r, this.r * 2, this.r * 2);
    else {
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
