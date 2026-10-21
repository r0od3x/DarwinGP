// Algorithme génétique sur les cerveaux : élitisme, sélection par tournoi, croisement uniforme,
// mutation gaussienne. Aucun calcul de pilotage ici.
const Evolution = (() => {
  // Écart-type du bruit ajouté à un poids muté.
  const MUTATION_AMOUNT = 0.5;
  // Candidats tirés au hasard pour chaque tournoi : le meilleur devient parent.
  const TOURNAMENT = 3;
  // Part de la population recopiée telle quelle (au moins une voiture) : on ne perd jamais le meilleur.
  const ELITE_SHARE = 0.05;

  // Entrées : un par rayon + la vitesse. Sorties : virage et vitesse.
  function architecture(settings) {
    return [settings.rays + 1, ...Array(settings.hiddenLayers).fill(settings.hiddenSize), 2];
  }

  function randomBrains(count, sizes, rng = Math.random) {
    return Array.from({ length: count }, () => new NeuralNetwork(sizes, rng));
  }

  function eliteCount(size) {
    return Math.max(1, Math.round(size * ELITE_SHARE));
  }

  // scored = [{ brain, fitness }]. Renvoie le cerveau du meilleur de TOURNAMENT candidats.
  function tournament(scored, rng = Math.random) {
    let best = null;
    for (let k = 0; k < TOURNAMENT; k++) {
      const pick = scored[Math.floor(rng() * scored.length) % scored.length];
      if (!best || pick.fitness > best.fitness) best = pick;
    }
    return best.brain;
  }

  // Nouvelle génération de size cerveaux : les élites recopiés, puis des enfants
  // croisement(parent A, parent B) mutés. Renvoie { brains, elites }.
  function nextGeneration(scored, size, mutationRate, rng = Math.random) {
    if (!scored.length) throw new RangeError('Aucun individu à faire évoluer.');
    const ranked = scored.slice().sort((a, b) => b.fitness - a.fitness);
    const elites = Math.min(eliteCount(size), ranked.length, size);
    const brains = ranked.slice(0, elites).map(s => s.brain.copy());
    while (brains.length < size) {
      const child = tournament(ranked, rng).crossover(tournament(ranked, rng), rng);
      brains.push(child.mutate(mutationRate, MUTATION_AMOUNT, rng));
    }
    return { brains, elites };
  }

  return { MUTATION_AMOUNT, TOURNAMENT, ELITE_SHARE, architecture, randomBrains, eliteCount, tournament,
    nextGeneration };
})();
