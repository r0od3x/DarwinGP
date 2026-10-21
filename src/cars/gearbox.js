// Boîte de vitesses affichée et entendue : rapport engagé et régime moteur déduits de la vitesse.
// Ce n'est pas une force : la poussée vient du modèle de puissance de RaceCar. Huit rapports ;
// chaque rapport couvre la vitesse jusqu'à TOPS[i] × la vitesse de pointe. Au passage d'un
// rapport, le régime retombe (TOPS[i-1] / TOPS[i] du régime maximal), comme sur une vraie boîte.
const Gearbox = (() => {
  const TOPS = [0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.87, 1.02];
  const IDLE = 4000;
  const MAX_RPM = 12500;

  // speed et topSpeed en px/image ; renvoie { gear (1 à 8, 0 = arrêt), rpm }.
  function state(speed, topSpeed = 9.5) {
    const v = Math.max(0, speed);
    if (v < 0.05) return { gear: 0, rpm: IDLE };
    let gear = TOPS.findIndex(top => v <= top * topSpeed);
    if (gear < 0) gear = TOPS.length - 1;
    const rpm = Math.min(MAX_RPM, Math.max(IDLE, MAX_RPM * v / (TOPS[gear] * topSpeed)));
    return { gear: gear + 1, rpm };
  }

  // Part du régime entre ralenti et maximum (0 à 1) : jauge du tableau de bord, son du moteur.
  function rpmRatio(rpm) {
    return Math.max(0, Math.min(1, (rpm - IDLE) / (MAX_RPM - IDLE)));
  }

  return { TOPS, IDLE, MAX_RPM, state, rpmRatio };
})();
