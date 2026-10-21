// One command for the whole animatic. From the repository root (Node 18+, ffmpeg and Chrome):
//
//   node trailer-animatic/build.mjs              what changed: frames, gameplay clips, audio, videos, docs
//   node trailer-animatic/build.mjs --frames     re-render every storyboard frame
//   node trailer-animatic/build.mjs --clips      re-capture every gameplay clip
//   node trailer-animatic/build.mjs --only 04,12 re-render these shots' frames and clips
//   node trailer-animatic/build.mjs --no-video   frames and docs only
//
// Everything comes from trailer.config.mjs (timing, text, staging, sound).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderAudio } from './lib/audio.mjs';
import { renderClips } from './lib/clips.mjs';
import { writeDocs } from './lib/docs.mjs';
import { renderFrames } from './lib/frames.mjs';
import { check, timeline, timecode } from './lib/timeline.mjs';
import { renderVideo } from './lib/video.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

async function main(argv) {
  const value = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const config = join(ROOT, 'trailer.config.mjs');
  // Fresh import each run (no stale module cache).
  const { TRAILER: cfg } = await import(`${pathToFileURL(config).href}?t=${Date.now()}`);
  const shots = timeline(cfg);
  const { errors, warnings } = check(cfg, shots);
  for (const w of warnings) console.log(`⚠ ${w}`);
  if (errors.length) {
    for (const e of errors) console.log(`✗ ${e}`);
    return 1;
  }
  console.log(`${cfg.title}: ${shots.length} shots, ${timecode(shots.at(-1).end, cfg.fps)} at ${cfg.bpm} BPM`);
  const framesDir = join(ROOT, 'frames');
  const tmp = join(ROOT, '.build');
  mkdirSync(tmp, { recursive: true });

  if (!argv.includes('--no-frames')) {
    const only = value('--only')?.split(',').map(s => s.trim());
    const { rendered, failures } = await renderFrames(cfg, shots, { root: ROOT, outDir: framesDir, force: argv.includes('--frames'), only });
    console.log(`frames: ${rendered} rendered${failures.length ? `, ${failures.length} failed` : ''}`);
    for (const f of failures) console.log(`✗ ${f}`);
    if (failures.length) return 1;
  }
  const clipsDir = join(ROOT, 'clips');
  if (!argv.includes('--no-video') && !argv.includes('--no-clips')) {
    const only = value('--only')?.split(',').map(s => s.trim());
    const { rendered, failures } = await renderClips(cfg, shots, { root: ROOT, outDir: clipsDir, force: argv.includes('--clips'), only });
    console.log(`clips: ${rendered} captured${failures.length ? `, ${failures.length} failed` : ''}`);
    for (const f of failures) console.log(`✗ ${f}`);
    if (failures.length) return 1;
  }
  if (!argv.includes('--no-video')) {
    const audio = join(tmp, 'audio.wav');
    renderAudio(cfg, shots, audio);
    console.log('audio: temp music and sound cues');
    const files = renderVideo(cfg, shots, { framesDir, clipsDir, outDir: ROOT, tmp, audio });
    console.log(`video: ${files.labelled}\n       ${files.clean}`);
  }
  writeDocs(cfg, shots, { outDir: ROOT, framesDir });
  console.log('docs: TRAILER_SCRIPT.md, shotlist.csv, storyboard.html');
  return 0;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  console.error(error.message);
  process.exitCode = 1;
});
