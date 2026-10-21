class Vehicle {
  constructor(x, y) {
    // position du véhicule
    this.pos = createVector(x, y);
    // vitesse du véhicule
    this.vel = createVector(0, 0);
    // accélération du véhicule
    this.acc = createVector(0, 0);
    // vitesse maximale du véhicule
    this.maxSpeed = 10;
    // force maximale appliquée au véhicule
    this.maxForce = 0.25;
    // rayon du véhicule
    this.r = 16;

    // Réglages de wander : cercle de rayon wanderRadius placé à wanderDistance devant le
    // véhicule ; l'angle du point visé varie d'au plus wanderJitter radian par image.
    this.wanderDistance = 60;
    this.wanderRadius = 30;
    this.wanderJitter = 0.3;
    this.wanderTheta = 0;
    // Réglages de follow : on prédit la position dans followPrediction px, et on vise
    // followLookAhead px plus loin sur le chemin.
    this.followPrediction = 25;
    this.followLookAhead = 25;
    // Réglage de separate : les voisins à moins de separationRadius px repoussent le véhicule.
    this.separationRadius = 50;
    // Réglages de avoid : trois points de détection sur la ligne de la vitesse (la tête, à
    // avoidLookAhead / 2 et à avoidLookAhead px devant) ; marge ajoutée aux rayons (px).
    this.avoidLookAhead = 90;
    this.avoidMargin = 8;
    // Poids de chaque comportement dans la somme pondérée (modifiables, par exemple par des sliders).
    this.weights = { follow: 1, separate: 1.5, wander: 0.5, avoid: 3 };
    // Dernières forces calculées, déjà pondérées (pour l'affichage de débogage).
    this.forces = null;
  }

  /*
   seek est une méthode qui permet de faire se rapprocher le véhicule de la cible passée en paramètre
   */
    seek(target) {
    // on calcule la direction vers la cible
    // C'est l'ETAPE 1 (action : se diriger vers une cible)
    let force = p5.Vector.sub(target, this.pos);

    // Dessous c'est l'ETAPE 2 : le pilotage (comment on se dirige vers la cible)
    // on limite ce vecteur à la longueur maxSpeed
    force.setMag(this.maxSpeed);
    // on calcule la force à appliquer pour atteindre la cible
    force.sub(this.vel);
    // on limite cette force à la longueur maxForce
    force.limit(this.maxForce);
    // on applique la force au véhicule
    return force;
  }

  // inverse de seek !
  flee(target, distanceDeDetection = Infinity) {
    return this.seek(target.pos, distanceDeDetection).mult(-1);
  }

  /* Poursuite d'un point devant la target !
     cette methode renvoie la force à appliquer au véhicule
  */
  pursue(target) {

    // On dessine le vecteur vitesse de la target
    this.drawVector(target.pos, target.vel.copy().mult(10));

    // TODO
    // 1 - calcul de la position future de la cible
    // on fait une copie de la vitesse de la target
    // (pour ne pas modifier la vitesse de la target)
    let targetAhead = target.vel.copy();

    // et on le multiplie par 10 (10 frames)
    // 2 - prediction dans 10 frames = 10 fois la longueur du vecteur
    // (on multiplie le vecteur vitesse par 10)
    // TODO
    targetAhead.mult(20);

    // 3 - on positionne  la target au bout de ce vecteur
    // (on ajoute ce vecteur à la position de la target)
    // TODO
    targetAhead.add(target.pos);

    // 4 -dessin du point devant la target
    fill("green");
    circle(targetAhead.x, targetAhead.y, 16); 

    // 6 - appel à seek avec ce point comme cible 
    let force = this.seek(targetAhead);

    // n'oubliez pas, on renvoie la force à appliquer au véhicule !
    return force;
  }

  /* inverse de pursue
     cette methode renvoie la force à appliquer au véhicule
  */
  evade(target) {
    // TODO : on inverse la logique de pursue
    let force = this.pursue(target).mult(-1);
    return force;
  }

  /**  Fonction de poursuite parfaite (avec le point devant la
  target qui se rapproche quand le poursuiveur se rapproche)
  */
  pursuePerfect(vehicle) {
    // Use the Law of Sines (https://en.wikipedia.org/wiki/Law_of_sines)
    // to predict the right collision point
    const speed_ratio = vehicle.vel.mag() / this.maxSpeed;
    const target_angle = vehicle.vel.angleBetween(p5.Vector.sub(this.pos, vehicle.pos));
    const my_angle = asin(sin(target_angle) * speed_ratio);
    const dist = this.pos.dist(vehicle.pos);
    const prediction = dist * sin(my_angle) / sin(PI - my_angle - target_angle);
    const target = vehicle.vel.copy().setMag(prediction).add(vehicle.pos);
    
    drawArrow(vehicle.pos, p5.Vector.mult(vehicle.vel, 20), 'red');
    drawArrow(this.pos, p5.Vector.sub(target, this.pos), 'green');
    
    fill(0, 255, 0);
    circle(target.x, target.y, 8);
    return this.seek(target);
  }


  /* wander : errance de Reynolds. Le point visé glisse un peu sur un cercle placé devant le
     véhicule à chaque image : trajectoire aléatoire mais continue. rng permet de fixer le hasard.
     Renvoie la force (seek du point visé). */
  wander(rng = Math.random) {
    this.wanderTheta += (rng() * 2 - 1) * this.wanderJitter;
    const ahead = this.vel.copy().setMag(this.wanderDistance);
    const angle = this.vel.heading() + this.wanderTheta;
    // point visé, gardé pour l'affichage de débogage
    this.wanderTarget = createVector(
      this.pos.x + ahead.x + Math.cos(angle) * this.wanderRadius,
      this.pos.y + ahead.y + Math.sin(angle) * this.wanderRadius);
    return this.seek(this.wanderTarget);
  }

  /* follow : suivi de chemin de Reynolds. path = { points: [{x, y}, ...], radius, closed }.
     1 - on prédit la position future du véhicule
     2 - on cherche le point du chemin le plus proche de cette position (point normal)
     3 - on vise un point un peu plus loin sur le chemin
     4 - si la position prédite sort du chemin (distance > radius), seek de ce point ;
         sinon aucune force : le véhicule garde son cap.
     Renvoie la force ; les points calculés sont gardés dans this.followInfo. */
  follow(path) {
    const pts = path.points;
    const n = pts.length;
    if (n < 2) return createVector(0, 0);
    const speed = this.vel.mag();
    const predict = speed > 0
      ? createVector(this.pos.x + this.vel.x / speed * this.followPrediction,
        this.pos.y + this.vel.y / speed * this.followPrediction)
      : createVector(this.pos.x, this.pos.y);
    let best = null;
    const segments = path.closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      // projection de la position prédite sur le segment, bornée à ses extrémités
      const t = Math.max(0, Math.min(1, ((predict.x - a.x) * dx + (predict.y - a.y) * dy) / (length * length)));
      const normal = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(predict.x - normal.x, predict.y - normal.y);
      if (!best || d < best.d) best = { d, normal, dir: { x: dx / length, y: dy / length } };
    }
    if (!best) return createVector(0, 0);
    const target = createVector(best.normal.x + best.dir.x * this.followLookAhead,
      best.normal.y + best.dir.y * this.followLookAhead);
    const onPath = best.d <= path.radius;
    this.followInfo = { predict, normal: createVector(best.normal.x, best.normal.y), target, onPath };
    return onPath ? createVector(0, 0) : this.seek(target);
  }

  /* separate : séparation de Reynolds. Chaque voisin (objet avec une position pos) à moins de
     radius px pousse le véhicule à l'opposé, d'autant plus fort qu'il est proche (1 / distance).
     Vitesse désirée : somme de ces poussées ramenée à maxSpeed ; force = désirée - vitesse. */
  separate(others, radius = this.separationRadius) {
    const sum = createVector(0, 0);
    let count = 0;
    for (const other of others) {
      if (other === this) continue;
      const dx = this.pos.x - other.pos.x;
      const dy = this.pos.y - other.pos.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= radius) continue;
      sum.add(createVector(dx / d / d, dy / d / d));
      count++;
    }
    if (count === 0) return createVector(0, 0);
    sum.setMag(this.maxSpeed);
    return p5.Vector.sub(sum, this.vel).limit(this.maxForce);
  }

  /* avoid : évitement d'obstacles de Reynolds avec trois points de détection placés sur la
     ligne de la vitesse : la tête (pos), un point un peu devant (avoidLookAhead / 2) et un point
     plus loin (avoidLookAhead). obstacles = objets avec pos et r.
     1 - un obstacle menace si l'un des trois points est à moins de son rayon + le rayon du
         véhicule + avoidMargin de son centre (on retient le point le plus proche de lui)
     2 - parmi les obstacles menaçants, on évite le plus proche du véhicule (le plus urgent)
     3 - vitesse désirée : du centre de l'obstacle vers ce point (on s'écarte sur le côté), à maxSpeed
     Renvoie la force (désirée - vitesse, limitée à maxForce) ; les points et l'obstacle menaçant
     sont gardés dans this.avoidInfo. */
  avoid(obstacles) {
    const speed = this.vel.mag();
    const ux = speed > 0 ? this.vel.x / speed : 1;
    const uy = speed > 0 ? this.vel.y / speed : 0;
    const points = [0, 0.5, 1].map(k => createVector(
      this.pos.x + ux * this.avoidLookAhead * k, this.pos.y + uy * this.avoidLookAhead * k));
    let best = null;
    for (const obstacle of obstacles) {
      let point = null;
      let closest = Infinity;
      for (const p of points) {
        const d = Math.hypot(p.x - obstacle.pos.x, p.y - obstacle.pos.y);
        if (d < closest) { closest = d; point = p; }
      }
      if (closest >= obstacle.r + this.r + this.avoidMargin) continue;
      const urgency = Math.hypot(obstacle.pos.x - this.pos.x, obstacle.pos.y - this.pos.y) - obstacle.r;
      if (!best || urgency < best.urgency) best = { obstacle, point, urgency };
    }
    this.avoidInfo = { points, obstacle: best?.obstacle ?? null, point: best?.point ?? null };
    if (!best) return createVector(0, 0);
    let x = best.point.x - best.obstacle.pos.x;
    let y = best.point.y - best.obstacle.pos.y;
    // Point pile sur le centre : on s'écarte perpendiculairement à la vitesse.
    if (x === 0 && y === 0) {
      x = -uy;
      y = ux;
    }
    const desired = createVector(x, y).setMag(this.maxSpeed);
    return p5.Vector.sub(desired, this.vel).limit(this.maxForce);
  }

  /* Somme pondérée de follow, separate, wander et avoid avec les poids de this.weights.
     world = { path, others, obstacles, rng } (chaque élément est facultatif).
     Les trois forces pondérées sont gardées dans this.forces pour voir l'effet des poids. */
  weightedSteering(world = {}) {
    const forces = {
      follow: world.path ? this.follow(world.path).mult(this.weights.follow) : createVector(0, 0),
      separate: this.separate(world.others ?? []).mult(this.weights.separate),
      wander: this.wander(world.rng).mult(this.weights.wander),
      avoid: world.obstacles ? this.avoid(world.obstacles).mult(this.weights.avoid ?? 0) : createVector(0, 0),
    };
    this.forces = forces;
    return createVector(0, 0).add(forces.follow).add(forces.separate).add(forces.wander).add(forces.avoid);
  }

  // applyForce est une méthode qui permet d'appliquer une force au véhicule
  // en fait on additionne le vecteurr force au vecteur accélération
  applyForce(force) {
    this.acc.add(force);
  }

  update() {
    // on ajoute l'accélération à la vitesse. L'accélération est un incrément de vitesse
    // (accélératiion = dérivée de la vitesse)
    this.vel.add(this.acc);
    // on contraint la vitesse à la valeur maxSpeed
    this.vel.limit(this.maxSpeed);
    // on ajoute la vitesse à la position. La vitesse est un incrément de position, 
    // (la vitesse est la dérivée de la position)
    this.pos.add(this.vel);

    // on remet l'accélération à zéro
    this.acc.set(0, 0);
  }

  // On dessine le véhicule
  show() {
    // formes fil de fer en blanc
    stroke(255);
    // épaisseur du trait = 2
    strokeWeight(2);

    // formes pleines en blanc
    fill(255);

    // sauvegarde du contexte graphique (couleur pleine, fil de fer, épaisseur du trait, 
    // position et rotation du repère de référence)
    push();
    // on déplace le repère de référence.
    translate(this.pos.x, this.pos.y);
    // et on le tourne. heading() renvoie l'angle du vecteur vitesse (c'est l'angle du véhicule)
    rotate(this.vel.heading());

    // Dessin d'un véhicule sous la forme d'un triangle. Comme s'il était droit, avec le 0, 0 en haut à gauche
    triangle(-this.r, -this.r / 2, -this.r, this.r / 2, this.r, 0);
    // Que fait cette ligne ?
    //this.edges();

    // draw velocity vector
    pop();
    this.drawVector(this.pos, this.vel.copy().mult(10));
  }

  drawVector(pos, v) {
    push();
    // Dessin du vecteur depuis pos comme origne
    strokeWeight(3);
    stroke("red");
    line(pos.x, pos.y, pos.x + v.x, pos.y + v.y);
    // dessine une petite fleche au bout du vecteur vitesse
    let arrowSize = 5;
    translate(pos.x + v.x , pos.y + v.y);
    rotate(v.heading());
    translate(-arrowSize / 2, 0);
    triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
    pop();
  }

  // que fait cette méthode ?
  edges() {
    if (this.pos.x > width + this.r) {
      this.pos.x = -this.r;
    } else if (this.pos.x < -this.r) {
      this.pos.x = width + this.r;
    }
    if (this.pos.y > height + this.r) {
      this.pos.y = -this.r;
    } else if (this.pos.y < -this.r) {
      this.pos.y = height + this.r;
    }
  }
}

// draw an arrow for a vector at a given base position
function drawArrow(base, vec, myColor) {
  push();
  stroke(myColor);
  strokeWeight(3);
  fill(myColor);
  translate(base.x, base.y);
  line(0, 0, vec.x, vec.y);
  rotate(vec.heading());
  let arrowSize = 7;
  translate(vec.mag() - arrowSize, 0);
  triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
  pop();
}