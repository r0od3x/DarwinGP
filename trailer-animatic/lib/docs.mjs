// Documents generated from the config: TRAILER_SCRIPT.md, shotlist.csv, storyboard.html.
// Never edit them by hand: they are rewritten on every build.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECTIONS, timecode } from './timeline.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = v => (/[",\n;]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

function sectionRanges(shots) {
  const out = [];
  for (const s of shots) {
    const last = out.at(-1);
    if (last && last.section === s.section) last.end = s.end;
    else out.push({ section: s.section, start: s.start, end: s.end, shots: [] });
    out.at(-1).shots.push(s);
  }
  return out;
}

export function scriptMarkdown(cfg, shots) {
  const fps = cfg.fps;
  const total = shots.at(-1).end;
  const lines = [
    `# ${cfg.title} — trailer script`,
    '',
    `> ${cfg.concept}`,
    '',
    '*Generated from `trailer.config.mjs` by `node trailer-animatic/build.mjs`: edit the config, not this file.*',
    '',
    `**Length** ${total.toFixed(1)} s · **Tempo** ${cfg.bpm} BPM (1 beat = ${(60 / cfg.bpm).toFixed(2)} s) · **${shots.length} shots** · on-screen text in French.`,
    '',
    '**Tone:** a cold, almost documentary opening about machines learning to drive, then a full-throttle race montage. The cars are not scripted: they evolved, and the trailer says it.',
    '',
    '## Structure',
    '',
    '| Section | Time | Shots | Music |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of sectionRanges(shots)) {
    const music = cfg.music.filter(m => m.from * 60 / cfg.bpm < r.end && m.to * 60 / cfg.bpm > r.start).map(m => m.note).join(' ');
    lines.push(`| ${SECTIONS[r.section]} | ${timecode(r.start, fps)} → ${timecode(r.end, fps)} | ${r.shots.map(s => s.number).join(', ')} | ${music} |`);
  }
  lines.push('', '## Shots', '');
  for (const r of sectionRanges(shots)) {
    lines.push(`### ${SECTIONS[r.section]} (${timecode(r.start, fps)} → ${timecode(r.end, fps)})`, '');
    for (const s of r.shots) {
      lines.push(`#### ${s.number} · ${s.title} — ${timecode(s.start, fps)} → ${timecode(s.end, fps)} (${s.duration.toFixed(1)} s, ${s.beats} beats)`, '');
      lines.push(`![${s.title}](frames/${s.frames[0].file})`, '');
      lines.push(`- **Action:** ${s.action}`);
      lines.push(`- **Camera:** ${s.camera} · **move:** ${s.move}${s.frames.length > 1 ? ' (two frames: start and end of the move)' : ''}`);
      lines.push(`- **Speed:** ${s.speed} · **transition in:** ${s.transition}${s.fadeOut ? ' · fades to black at the end' : ''}`);
      lines.push(`- **On-screen text:** ${s.text ? `« ${s.text} » (from +${(s.textAt ?? 0).toFixed(1)} s, ${s.textPos ?? 'lower'})` : '—'}`);
      lines.push(`- **Music:** ${s.music} **Sound:** ${s.sound}`);
      lines.push(`- **Setting:** ${s.track} · ${s.car} · ${s.weather} · ${s.time}`, '');
    }
  }
  lines.push('## Re-render', '',
    'Every gameplay shot is a real clip of the game (`clips/`), staged and filmed frame by frame; title cards are stills.',
    'Change the timing (`beats`), the text, the sounds, the staging of a frame or the direction of a clip (`TRAILER.clips`) in `trailer-animatic/trailer.config.mjs`, then:', '',
    '```sh', 'node trailer-animatic/build.mjs            # only what changed', 'node trailer-animatic/build.mjs --clips    # every gameplay clip again',
    'node trailer-animatic/build.mjs --frames   # every storyboard still again', 'node trailer-animatic/build.mjs --only 04,12  # just these shots, then the video', '```', '');
  return lines.join('\n');
}

export function shotListCsv(cfg, shots) {
  const header = ['shot', 'timecode_in', 'timecode_out', 'duration_s', 'camera', 'track', 'car', 'weather', 'time_of_day', 'action', 'text', 'notes'];
  const rows = shots.map(s => [
    `${s.number} ${s.title}`, timecode(s.start, cfg.fps), timecode(s.end, cfg.fps), s.duration.toFixed(2), `${s.camera} (${s.move})`,
    s.track, s.car, s.weather, s.time, s.action, s.text ?? '',
    [s.speed !== 'normal' ? s.speed : '', s.transition !== 'cut' ? `transition: ${s.transition}` : '', `music: ${s.music}`, `sound: ${s.sound}`].filter(Boolean).join(' · '),
  ]);
  return `﻿${[header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')}\n`;
}

function thumbnail(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'scale=960:-2', '-q:v', '5', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
    { maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? `data:image/jpeg;base64,${r.stdout.toString('base64')}` : '';
}

// Self-contained page (frames embedded as JPEG), one column on a phone, a grid on a desktop.
export function storyboardHtml(cfg, shots, framesDir) {
  const fps = cfg.fps;
  const cards = sectionRanges(shots).map(r => `
    <h2>${esc(SECTIONS[r.section])} <small>${timecode(r.start, fps)} → ${timecode(r.end, fps)}</small></h2>
    <div class="grid">${r.shots.map(s => `
      <article>
        <div class="frames">${s.frames.map((f, k) => `<figure><img loading="lazy" src="${thumbnail(join(framesDir, f.file))}" alt="${esc(s.title)}">${s.frames.length > 1 ? `<figcaption>${k ? 'end' : 'start'}</figcaption>` : ''}</figure>`).join('')}</div>
        <header><b>${s.number}</b> ${esc(s.title)} <span>${timecode(s.start, fps)} · ${s.duration.toFixed(1)} s</span></header>
        ${s.text ? `<p class="text">« ${esc(s.text)} »</p>` : ''}
        <p>${esc(s.action)}</p>
        <dl>
          <dt>Camera</dt><dd>${esc(s.camera)} · ${esc(s.move)}</dd>
          <dt>Speed</dt><dd>${esc(s.speed)} · ${esc(s.transition)}</dd>
          <dt>Audio</dt><dd>${esc(s.music)} ${esc(s.sound)}</dd>
          <dt>Setting</dt><dd>${esc(s.track)} · ${esc(s.car)}</dd>
        </dl>
      </article>`).join('')}
    </div>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cfg.title)} — storyboard</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 16px; background: #0b0e12; color: #e9edf2; font: 15px/1.45 "Segoe UI", system-ui, sans-serif; }
  h1 { margin: 4px 0 2px; font-size: 26px; } h1 span { color: #ffd600; }
  .concept { margin: 0 0 18px; color: #aeb7c2; font-style: italic; }
  h2 { margin: 28px 0 10px; font-size: 18px; border-bottom: 2px solid #ffd600; padding-bottom: 6px; }
  h2 small { color: #8a94a1; font-weight: 400; font-size: 13px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); }
  article { background: #151a21; border: 1px solid #232b35; border-radius: 10px; overflow: hidden; }
  .frames { display: flex; } figure { margin: 0; flex: 1; min-width: 0; position: relative; }
  article { min-width: 0; }
  img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }
  figcaption { position: absolute; left: 6px; bottom: 6px; font-size: 11px; background: rgba(0,0,0,.65); padding: 1px 6px; border-radius: 4px; }
  header { padding: 10px 12px 0; font-weight: 600; } header b { color: #ffd600; margin-right: 4px; } header span { float: right; color: #8a94a1; font-weight: 400; font-size: 13px; }
  p { margin: 6px 12px; } .text { color: #ffd600; font-weight: 700; font-size: 17px; }
  dl { margin: 8px 12px 12px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 13px; color: #c3cad3; }
  dt { color: #8a94a1; }
</style>
</head>
<body>
<h1>Darwin <span>GP</span> — storyboard</h1>
<p class="concept">${esc(cfg.concept)} · ${shots.at(-1).end.toFixed(0)} s · ${shots.length} shots · ${cfg.bpm} BPM</p>
${cards}
</body>
</html>
`;
}

export function writeDocs(cfg, shots, { outDir, framesDir }) {
  writeFileSync(join(outDir, 'TRAILER_SCRIPT.md'), scriptMarkdown(cfg, shots));
  writeFileSync(join(outDir, 'shotlist.csv'), shotListCsv(cfg, shots));
  writeFileSync(join(outDir, 'storyboard.html'), storyboardHtml(cfg, shots, framesDir));
}

export { readFileSync };
