// Réseau de neurones « cerveau » d'une voiture : perceptron multicouche entièrement connecté,
// activation tanh partout (sorties entre -1 et 1). Pas de rétropropagation : les poids évoluent
// par l'algorithme génétique (copie, croisement, mutation). Aucune dépendance.
class NeuralNetwork {
  // sizes = [entrées, cachée 1, ..., cachée k, sorties]. rng permet de fixer le hasard.
  constructor(sizes, rng = Math.random) {
    if (!Array.isArray(sizes) || sizes.length < 2 || !sizes.every(n => Number.isInteger(n) && n > 0)) {
      throw new RangeError('sizes doit contenir au moins deux entiers positifs.');
    }
    this.sizes = sizes.slice();
    // weights[l][j * entrées + i] : poids de l'entrée i vers le neurone j de la couche l + 1.
    this.weights = [];
    this.biases = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      this.weights.push(Float64Array.from({ length: sizes[l] * sizes[l + 1] }, () => rng() * 2 - 1));
      this.biases.push(Float64Array.from({ length: sizes[l + 1] }, () => rng() * 2 - 1));
    }
  }

  get inputCount() {
    return this.sizes[0];
  }

  get outputCount() {
    return this.sizes[this.sizes.length - 1];
  }

  // Propagation avant : renvoie les sorties (tableau de nombres entre -1 et 1).
  predict(inputs) {
    const layers = this.layers(inputs);
    return layers[layers.length - 1];
  }

  // Valeurs de toutes les couches, des entrées aux sorties (pour l'affichage du réseau).
  layers(inputs) {
    if (inputs.length !== this.inputCount) {
      throw new RangeError(`Le réseau attend ${this.inputCount} entrées, reçu ${inputs.length}.`);
    }
    let values = Array.from(inputs);
    const all = [values];
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l];
      const b = this.biases[l];
      const n = values.length;
      const next = new Array(b.length);
      for (let j = 0; j < b.length; j++) {
        let sum = b[j];
        for (let i = 0; i < n; i++) sum += w[j * n + i] * values[i];
        next[j] = Math.tanh(sum);
      }
      values = next;
      all.push(values);
    }
    return all;
  }

  copy() {
    const clone = Object.create(NeuralNetwork.prototype);
    clone.sizes = this.sizes.slice();
    clone.weights = this.weights.map(w => Float64Array.from(w));
    clone.biases = this.biases.map(b => Float64Array.from(b));
    return clone;
  }

  sameShape(other) {
    return this.sizes.length === other.sizes.length && this.sizes.every((n, i) => n === other.sizes[i]);
  }

  // Croisement uniforme : chaque poids vient d'un des deux parents, au hasard.
  crossover(other, rng = Math.random) {
    if (!this.sameShape(other)) throw new RangeError('Croisement impossible : architectures différentes.');
    const child = this.copy();
    const mix = (mine, theirs) => mine.forEach((_, k) => { if (rng() < 0.5) mine[k] = theirs[k]; });
    child.weights.forEach((w, l) => mix(w, other.weights[l]));
    child.biases.forEach((b, l) => mix(b, other.biases[l]));
    return child;
  }

  // Mutation : chaque poids a une probabilité rate d'être décalé d'un bruit gaussien d'écart-type amount.
  // Modifie le réseau et le renvoie.
  mutate(rate, amount = 0.5, rng = Math.random) {
    const gaussian = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const shake = values => values.forEach((v, k) => { if (rng() < rate) values[k] = v + gaussian() * amount; });
    this.weights.forEach(shake);
    this.biases.forEach(shake);
    return this;
  }

  toJSON() {
    return { sizes: this.sizes, weights: this.weights.map(w => Array.from(w)), biases: this.biases.map(b => Array.from(b)) };
  }

  static fromJSON(data) {
    const net = new NeuralNetwork(data.sizes, () => 0.5);
    data.weights.forEach((w, l) => {
      if (w.length !== net.weights[l].length) throw new RangeError('Poids incompatibles avec l\'architecture.');
      net.weights[l].set(w);
    });
    data.biases.forEach((b, l) => {
      if (b.length !== net.biases[l].length) throw new RangeError('Biais incompatibles avec l\'architecture.');
      net.biases[l].set(b);
    });
    return net;
  }
}
