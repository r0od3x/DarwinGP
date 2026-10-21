// Animatic video: every shot is its storyboard frame (or two frames dissolving into each other)
// with a simple camera move on it (zoompan), cut on the beat. Then the on-screen text, white
// flash frames and the temp audio are added: animatic_clean.mp4. The same plus a corner label
// (shot, timecode, speed) and a running timecode: animatic.mp4.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { timecode } from './timeline.mjs';

const FONTS = {
  text: ['C:/Windows/Fonts/seguibl.ttf', 'C:/Windows/Fonts/ariblk.ttf', '/System/Library/Fonts/Supplemental/Arial Black.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  label: ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
};
const font = kind => FONTS[kind].find(f => existsSync(f)) ?? null;
// Path inside an ffmpeg filter (Windows drive colon escaped).
const fpath = p => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;

// Camera moves on a still. z: zoom (start → end), x / y: framing offset in share of the picture,
// punch: quick zoom kick at the start, shake: decaying shake.
export const MOVES = {
  static: { z: [1.02, 1.03] },
  push: { z: [1, 1.1] },
  'push-fast': { z: [1, 1.18] },
  pull: { z: [1.12, 1] },
  'drift-left': { z: [1.08, 1.1], x: [0.025, -0.025] },
  'drift-right': { z: [1.08, 1.1], x: [-0.025, 0.025] },
  'pan-left': { z: [1.12, 1.12], x: [0.045, -0.045] },
  'pan-right': { z: [1.12, 1.12], x: [-0.045, 0.045] },
  punch: { z: [1, 1.05], punch: 0.12 },
  shake: { z: [1.04, 1.06], shake: 1 },
  'punch-shake': { z: [1, 1.05], punch: 0.14, shake: 1 },
};

// zoompan filter for n frames of a 1920 × 1080 still (upscaled 1.5× first, smoother moves).
export function zoompan(move, n, fps, width = 1920, height = 1080) {
  const m = MOVES[move] ?? MOVES.static;
  const [z0, z1] = m.z;
  const [x0, x1] = m.x ?? [0, 0];
  const [y0, y1] = m.y ?? [0, 0];
  const u = `(on/${Math.max(1, n - 1)})`;
  const ease = `(${u}*${u}*(3-2*${u}))`;
  const punch = m.punch ? `*(1+${m.punch}*exp(-on/3))` : '';
  const z = `(${z0}+${z1 - z0}*${ease})${punch}`;
  const shake = m.shake ? `+${m.shake}*iw*0.006*sin(on*1.9)*exp(-on/7)` : '';
  const shakeY = m.shake ? `+${m.shake}*ih*0.006*cos(on*2.3)*exp(-on/7)` : '';
  const x = `max(0,min(iw-iw/zoom,(iw-iw/zoom)/2+(${x0}+${x1 - x0}*${ease})*iw${shake}))`;
  const y = `max(0,min(ih-ih/zoom,(ih-ih/zoom)/2+(${y0}+${y1 - y0}*${ease})*ih${shakeY}))`;
  return `scale=${width * 1.5}:${height * 1.5}:flags=lanczos,zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr || r.error}`);
}

const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p'];

// One shot -> one clip of exactly shot.frameCount frames: the gameplay clip when there is one
// (clips/), otherwise the storyboard frame(s) with a camera move (title cards).
export function renderSegment(shot, next, { framesDir, clipsDir, tmp, fps }) {
  const n = shot.frameCount;
  const out = join(tmp, `seg_${shot.number}.mp4`);
  const fades = [];
  if (shot.transition === 'fade-in') fades.push(`fade=t=in:st=0:d=0.5`);
  if (shot.transition === 'dip') fades.push(`fade=t=in:st=0:d=0.2`);
  if (next?.transition === 'dip') fades.push(`fade=t=out:st=${((n - 5) / fps).toFixed(3)}:d=${(5 / fps).toFixed(3)}`);
  if (shot.fadeOut) fades.push(`fade=t=out:st=${((n - fps) / fps).toFixed(3)}:d=1`);
  const tail = [...fades, 'format=yuv420p'].join(',');
  const clip = clipsDir && join(clipsDir, `${shot.number}_${shot.slug}.mp4`);
  if (clip && existsSync(clip)) {
    ffmpeg(['-i', clip, '-vf', `fps=${fps},${tail}`, '-frames:v', String(n), ...ENCODE, '-r', String(fps), out]);
    return out;
  }
  if (shot.frames.length === 1) {
    ffmpeg(['-loop', '1', '-framerate', String(fps), '-i', join(framesDir, shot.frames[0].file),
      '-vf', `${zoompan(shot.move, n, fps)},${tail}`, '-frames:v', String(n), ...ENCODE, '-r', String(fps), out]);
    return out;
  }
  // Two frames: the first for `split` of the shot, then a short dissolve into the second.
  const overlap = Math.min(6, Math.floor(n / 4));
  const first = Math.round(n * shot.split);
  const a = first + overlap;
  const b = n - first;
  ffmpeg(['-loop', '1', '-framerate', String(fps), '-i', join(framesDir, shot.frames[0].file),
    '-loop', '1', '-framerate', String(fps), '-i', join(framesDir, shot.frames[1].file),
    '-filter_complex', `[0:v]${zoompan(shot.move, a, fps)},trim=end_frame=${a},setpts=PTS-STARTPTS[a];`
      + `[1:v]${zoompan(shot.move, b + overlap, fps)},trim=end_frame=${b + overlap},setpts=PTS-STARTPTS[b];`
      + `[a][b]xfade=transition=fade:duration=${(overlap / fps).toFixed(4)}:offset=${((a - overlap) / fps).toFixed(4)},${tail}[v]`,
    '-map', '[v]', '-frames:v', String(n), ...ENCODE, '-r', String(fps), out]);
  return out;
}

// Text layout (1920 × 1080): font size and top of the text box per position.
const TEXT = {
  lower: { size: 84, y: 820 },
  upper: { size: 84, y: 110 },
  center: { size: 124, y: 470 },
};

function overlayFilters(shots, { tmp, fps, labels }) {
  const textFont = font('text');
  const labelFont = font('label');
  const ff = f => (f ? `fontfile=${fpath(f)}:` : '');
  const parts = [];
  for (const s of shots) {
    if (s.transition === 'flash') {
      parts.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.85:t=fill:enable='between(t,${s.start.toFixed(3)},${(s.start + 2 / fps - 1e-3).toFixed(3)})'`);
    }
    if (s.text) {
      const file = join(tmp, `text_${s.number}.txt`);
      writeFileSync(file, s.text);
      const style = TEXT[s.textPos ?? 'lower'];
      const t0 = s.start + (s.textAt ?? 0);
      const t1 = s.end;
      const fade = `min(1,max(0,(t-${t0.toFixed(3)})/0.12))*min(1,max(0,(${t1.toFixed(3)}-t)/0.1))`;
      const on = `enable='between(t,${t0.toFixed(3)},${t1.toFixed(3)})'`;
      parts.push(`drawtext=${ff(textFont)}textfile=${fpath(file)}:expansion=none:fontsize=${style.size}:fontcolor=white:x=(w-tw)/2:y=${style.y}`
        + `:shadowx=0:shadowy=5:shadowcolor=black@0.55:borderw=2:bordercolor=black@0.35:alpha='${fade}':${on}`);
      // Yellow underline, as on the title card.
      parts.push(`drawbox=x=(iw-150)/2:y=${style.y + Math.round(style.size * 1.12)}:w=150:h=8:color=0xffd600@0.95:t=fill:${on}`);
    }
  }
  const clean = parts.join(',') || 'null';
  if (!labels) return { clean };
  const marks = shots.map(s => {
    const file = join(tmp, `label_${s.number}.txt`);
    const speed = s.speed && s.speed !== 'normal' ? `  ·  ${s.speed}` : '';
    writeFileSync(file, `${s.number}  ${s.title}\n${timecode(s.start, fps)} → ${timecode(s.end, fps)}  ·  ${s.duration.toFixed(1)} s${speed}`);
    return `drawtext=${ff(labelFont)}textfile=${fpath(file)}:expansion=none:fontsize=24:line_spacing=6:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12`
      + `:x=24:y=24:enable='between(t,${s.start.toFixed(3)},${(s.end - 1e-3).toFixed(3)})'`;
  });
  marks.push(`drawtext=${ff(labelFont)}timecode='00\\:00\\:00\\:00':rate=${fps}:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10:x=w-tw-24:y=h-th-24`);
  return { clean, labelled: marks.join(',') };
}

// Whole animatic: clips, joined, text and audio. Returns the output paths.
export function renderVideo(cfg, shots, { framesDir, clipsDir, outDir, tmp, audio, log = console.log }) {
  mkdirSync(tmp, { recursive: true });
  const fps = cfg.fps;
  const segments = shots.map((shot, i) => {
    log(`  clip ${shot.number} ${shot.slug} (${shot.frameCount} frames)`);
    return renderSegment(shot, shots[i + 1], { framesDir, clipsDir, tmp, fps });
  });
  const list = join(tmp, 'segments.txt');
  writeFileSync(list, segments.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const picture = join(tmp, 'picture.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', picture]);
  const total = shots.at(-1).end;
  const { clean, labelled } = overlayFilters(shots, { tmp, fps, labels: true });
  const files = { labelled: join(outDir, 'animatic.mp4'), clean: join(outDir, 'animatic_clean.mp4') };
  const final = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart'];
  const graph = join(tmp, 'overlay.txt');
  writeFileSync(graph, `[0:v]${clean},split=2[clean][base];[base]${labelled}[labelled]`);
  ffmpeg(['-i', picture, '-i', audio, '-/filter_complex', graph,
    '-map', '[clean]', '-map', '1:a', ...final, files.clean,
    '-map', '[labelled]', '-map', '1:a', ...final, files.labelled]);
  return files;
}
