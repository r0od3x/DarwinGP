// Son du moteur de la voiture suivie, synthétisé par la Web Audio API : deux oscillateurs en
// dents de scie (fréquence d'allumage d'un V6 = régime / 60 × 3, et son octave basse) passent
// par un filtre passe-bas qui s'ouvre avec l'accélérateur. Volume plus fort sous les gaz, plus
// faible au lever de pied. Rien n'est créé tant que le son n'est pas activé (geste de l'utilisateur).
const EngineSound = (() => {
  const VOLUME = 0.12;
  const CYLINDERS_FACTOR = 3;

  function defaultAudioContext() {
    return typeof window === 'undefined' ? undefined : window.AudioContext || window.webkitAudioContext;
  }

  // Fréquence d'allumage (Hz) pour un régime donné.
  function frequency(rpm) {
    return rpm / 60 * CYLINDERS_FACTOR;
  }

  // Réglages audio pour l'état de la voiture : fréquence, coupure du filtre (Hz) et volume.
  function voice(rpm, throttle) {
    const load = Math.max(0, Math.min(1, throttle));
    const r = Gearbox.rpmRatio(rpm);
    return { frequency: frequency(rpm), cutoff: 500 + load * 2600 + r * 900, gain: VOLUME * (0.35 + 0.65 * load) * (0.6 + 0.4 * r) };
  }

  function create(AudioContextClass = defaultAudioContext()) {
    let context = null;
    let nodes = null;
    let enabled = false;

    function build() {
      context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 4;
      filter.connect(master);
      const main = context.createOscillator();
      main.type = 'sawtooth';
      const sub = context.createOscillator();
      sub.type = 'sawtooth';
      const subGain = context.createGain();
      subGain.gain.value = 0.6;
      main.connect(filter);
      sub.connect(subGain);
      subGain.connect(filter);
      main.start();
      sub.start();
      nodes = { master, filter, main, sub };
    }

    // Active ou coupe le son ; le contexte audio est créé à la première activation.
    function setEnabled(on) {
      if (!AudioContextClass) return false;
      enabled = Boolean(on);
      if (enabled && !context) build();
      if (context && enabled && context.state === 'suspended') context.resume?.();
      if (nodes && !enabled) nodes.master.gain.setTargetAtTime(0, context.currentTime, 0.05);
      return enabled;
    }

    // À chaque image : régime et accélérateur de la voiture suivie.
    function update(rpm, throttle) {
      if (!enabled || !nodes) return null;
      const v = voice(rpm, throttle);
      const t = context.currentTime;
      nodes.main.frequency.setTargetAtTime(v.frequency, t, 0.03);
      nodes.sub.frequency.setTargetAtTime(v.frequency / 2, t, 0.03);
      nodes.filter.frequency.setTargetAtTime(v.cutoff, t, 0.05);
      nodes.master.gain.setTargetAtTime(v.gain, t, 0.05);
      return v;
    }

    return { setEnabled, update, get enabled() { return enabled; } };
  }

  return { VOLUME, frequency, voice, create };
})();
