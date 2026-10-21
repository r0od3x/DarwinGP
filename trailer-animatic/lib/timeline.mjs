// Timing of the animatic, computed from trailer.config.mjs (beats -> seconds -> frames).

export const SECTIONS = {
  hook: 'Accroche', montee: 'Montée', jeu: 'Jeu et fonctionnalités', montage: 'Montage', climax: 'Climax',
  titre: 'Titre', appel: 'Appel à l\'action',
};

export function beatSeconds(cfg) {
  return 60 / cfg.bpm;
}

// One entry per shot: number, start / end in beats, seconds and frames, frame file names.
export function timeline(cfg) {
  const beat = beatSeconds(cfg);
  let at = 0;
  return cfg.shots.map((shot, i) => {
    const startBeat = at;
    at += shot.beats;
    const number = String(i + 1).padStart(2, '0');
    const start = startBeat * beat;
    const end = at * beat;
    const f0 = Math.round(start * cfg.fps);
    const f1 = Math.round(end * cfg.fps);
    const many = shot.frames.length > 1;
    const frames = shot.frames.map((frame, k) => ({ ...frame, file: `${number}_${shot.slug}${many ? (k ? '_b' : '_a') : ''}.png` }));
    const clip = cfg.clips?.[shot.slug] ?? shot.clip;
    return { ...shot, clip, index: i, number, startBeat, endBeat: at, start, end, duration: end - start, f0, f1, frameCount: f1 - f0, frames };
  });
}

// mm:ss.ff (ff = frame at the given fps)
export function timecode(seconds, fps) {
  const total = Math.round(seconds * fps);
  const f = total % fps;
  const s = Math.floor(total / fps);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

export function words(text) {
  return String(text ?? '').trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

// Problems that would make the animatic misleading or broken. Returns { errors, warnings }.
export function check(cfg, shots) {
  const errors = [];
  const warnings = [];
  const slugs = new Set();
  for (const s of shots) {
    const where = `shot ${s.number} (${s.slug})`;
    if (slugs.has(s.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(s.slug);
    if (!(s.beats > 0)) errors.push(`${where}: beats must be > 0`);
    if (!s.frames?.length || s.frames.length > 2) errors.push(`${where}: one or two frames`);
    if (s.frames.length === 2 && !(s.split > 0 && s.split < 1)) errors.push(`${where}: two frames need a split between 0 and 1`);
    if (s.text && words(s.text) > 6) warnings.push(`${where}: on-screen text has ${words(s.text)} words (max 6)`);
    if (s.text && (s.textAt ?? 0) >= s.duration) errors.push(`${where}: textAt is after the end of the shot`);
    for (const fx of s.sfx ?? []) if (!(fx.at >= -1 && fx.at <= s.duration)) warnings.push(`${where}: sound cue at ${fx.at} s is outside the shot`);
  }
  const total = shots.at(-1)?.end ?? 0;
  if (Math.abs(total - 60) > 5) warnings.push(`total length ${total.toFixed(1)} s (target about 60 s)`);
  const lastBeat = shots.at(-1)?.endBeat ?? 0;
  const covered = (cfg.music ?? []).reduce((sum, m) => sum + (m.to - m.from), 0);
  if (covered !== lastBeat) warnings.push(`music covers ${covered} beats, shots last ${lastBeat}`);
  return { errors, warnings };
}
