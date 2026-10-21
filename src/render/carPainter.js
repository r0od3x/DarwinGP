// Dessin des monoplaces vues de dessus (aucun effet sur la simulation). Chaque livrée est
// dessinée une fois sur un petit canvas (×3 pour la netteté), tournée vers la droite, puis posée
// à la position et au cap de la voiture, avec son ombre, ses disques qui rougissent au freinage
// et un filet d'air quand elle est dans l'aspiration.
const CarPainter = (() => {
  const SCALE = 3;
  const cache = new Map();

  function shade(hex, f) {
    const v = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f));
    return `rgb(${v.join(', ')})`;
  }

  function sprite(car) {
    const key = car.team.colors.join() + car.team.number;
    if (cache.has(key)) return cache.get(key);
    const L = car.length;
    const W = car.width + 8;
    const c = document.createElement('canvas');
    c.width = Math.ceil(L * SCALE + 8);
    c.height = Math.ceil(W * SCALE + 8);
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.scale(SCALE, SCALE);
    const [main, accent] = car.team.colors;
    const tyre = (x, y, w, h) => {
      g.fillStyle = '#141414';
      g.beginPath();
      g.roundRect(x, y, w, h, 1.5);
      g.fill();
      g.fillStyle = 'rgba(255, 255, 255, 0.12)';
      g.fillRect(x + 1, y + 0.6, w - 2, 0.8);
    };
    // Bras de suspension.
    g.strokeStyle = '#2b2b2b';
    g.lineWidth = 0.7;
    for (const [x1, y1, x2, y2] of [[9, 2, 10, 8], [9, -2, 10, -8], [-8, 3, -10, 8], [-8, -3, -10, -8]]) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    // Roues : arrière plus larges.
    tyre(-14, 6.2, 8, 4.4);
    tyre(-14, -10.6, 8, 4.4);
    tyre(7, 6.6, 6.5, 3.6);
    tyre(7, -10.2, 6.5, 3.6);
    // Aileron arrière.
    g.fillStyle = shade(main, 0.6);
    g.fillRect(-17.5, -7.5, 3.5, 15);
    g.fillStyle = accent;
    g.fillRect(-17.5, -7.5, 1.2, 15);
    // Corps : coque effilée et pontons.
    const body = g.createLinearGradient(0, -6, 0, 6);
    body.addColorStop(0, shade(main, 1.15 > 1 ? 1 : 1));
    body.addColorStop(0.5, main);
    body.addColorStop(1, shade(main, 0.65));
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-14, -3.6);
    g.quadraticCurveTo(-9, -6.2, -3, -6);
    g.quadraticCurveTo(3, -5.6, 6, -3);
    g.lineTo(16.5, -1.2);
    g.quadraticCurveTo(17.5, 0, 16.5, 1.2);
    g.lineTo(6, 3);
    g.quadraticCurveTo(3, 5.6, -3, 6);
    g.quadraticCurveTo(-9, 6.2, -14, 3.6);
    g.closePath();
    g.fill();
    // Bande de livrée et reflet.
    g.fillStyle = accent;
    g.beginPath();
    g.moveTo(-13, -0.9);
    g.lineTo(15.5, -0.5);
    g.lineTo(15.5, 0.5);
    g.lineTo(-13, 0.9);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath();
    g.ellipse(-2, -3.2, 8, 1.1, 0, 0, Math.PI * 2);
    g.fill();
    // Aileron avant.
    g.fillStyle = shade(main, 0.7);
    g.fillRect(15, -8.5, 2.8, 17);
    g.fillStyle = accent;
    g.fillRect(17, -8.5, 0.9, 17);
    // Cockpit et casque.
    g.fillStyle = '#101418';
    g.beginPath();
    g.ellipse(0.5, 0, 3.6, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    const helmet = g.createRadialGradient(0.2, -0.5, 0.2, 0.5, 0, 1.9);
    helmet.addColorStop(0, '#ffffff');
    helmet.addColorStop(1, accent);
    g.fillStyle = helmet;
    g.beginPath();
    g.arc(0.5, 0, 1.8, 0, Math.PI * 2);
    g.fill();
    // Halo.
    g.strokeStyle = '#1c1c1c';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(0.5, 0, 3, -1.1, 1.1);
    g.stroke();
    // Numéro sur le capot moteur.
    g.save();
    g.translate(-8, 0);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.font = 'bold 4px sans-serif';
    g.textAlign = 'center';
    g.fillText(String(car.team.number), 0, 1.4);
    g.restore();
    cache.set(key, c);
    return c;
  }

  function draw(ctx, car) {
    const img = sprite(car);
    const w = img.width / SCALE;
    const h = img.height / SCALE;
    ctx.save();
    ctx.translate(car.pos.x, car.pos.y);
    ctx.rotate(car.angle);
    // Ombre portée.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(2, 3, car.length * 0.52, car.width * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Filet d'air de l'aspiration.
    if (car.drafting) {
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)';
      ctx.lineWidth = 1.2;
      for (const y of [-5, 0, 5]) {
        ctx.beginPath();
        ctx.moveTo(-18, y);
        ctx.lineTo(-40 - Math.random() * 12, y * 1.4);
        ctx.stroke();
      }
    }
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    // Disques de frein qui rougissent au freinage appuyé.
    if (car.throttle < -0.5 && car.vel.mag() > 2) {
      ctx.fillStyle = `rgba(255, ${80 + Math.random() * 60 | 0}, 0, 0.85)`;
      for (const [x, y] of [[10.2, 8.4], [10.2, -8.4], [-10, 8.4], [-10, -8.4]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return { SCALE, sprite, draw };
})();
