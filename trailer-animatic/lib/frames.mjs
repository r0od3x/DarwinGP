// Storyboard frames: each one is a real frame of the game, staged by trailer/stage.js
// (index.html?trailer=<plan>), or a title card (cards/card.html), captured at 1920 × 1080 by
// headless Chrome. A frame is re-rendered only when its plan changes (frames/.cache.json).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function chromePath(env = process.env) {
  return [env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(p => p && existsSync(p)) ?? null;
}

export function base64url(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// URL that shows the frame: the game with a staged plan, or a card.
export function frameUrl(cfg, frame, root) {
  if (frame.card) {
    const page = pathToFileURL(join(root, 'cards', 'card.html')).href;
    return `${page}?${new URLSearchParams(Object.entries(frame.card).map(([k, v]) => [k, String(v)]))}`;
  }
  const plan = { ...cfg.stageDefaults, ...frame.stage };
  const game = pathToFileURL(join(root, cfg.game)).href;
  return `${game}?trailer=${base64url(JSON.stringify(plan))}`;
}

function capture(chrome, url, out, profile) {
  return new Promise(resolve => {
    const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      '--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio',
      '--virtual-time-budget=8000', `--screenshot=${out}`, '--dump-dom', url];
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let dom = '';
    child.stdout.on('data', chunk => { dom += chunk; });
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('close', () => {
      clearTimeout(timer);
      const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1] ?? '';
      resolve({ ok: title === 'trailer:ready' && existsSync(out), title });
    });
  });
}

// Renders the frames whose plan changed (or all with force, or the shots in `only`).
export async function renderFrames(cfg, shots, { root, outDir, force = false, only = null, concurrency = 3, log = console.log }) {
  const chrome = chromePath();
  if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');
  mkdirSync(outDir, { recursive: true });
  const cacheFile = join(outDir, '.cache.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  // The staging code is part of the key: changing it re-renders the game frames.
  const stageVersion = ['../trailer/stage.js', 'cards/card.html']
    .map(f => statSync(join(root, f)).mtimeMs).join(':');
  const jobs = [];
  for (const shot of shots) {
    for (const frame of shot.frames) {
      const url = frameUrl(cfg, frame, root);
      const key = createHash('sha1').update(url + stageVersion).digest('hex');
      const out = join(outDir, frame.file);
      const wanted = only ? only.includes(shot.number) || only.includes(shot.slug) : (force || cache[frame.file] !== key || !existsSync(out));
      if (wanted) jobs.push({ shot, frame, url, key, out });
    }
  }
  const failures = [];
  let next = 0;
  async function worker() {
    const profile = mkdtempSync(join(tmpdir(), 'animatic-chrome-'));
    try {
      while (next < jobs.length) {
        const job = jobs[next++];
        const result = await capture(chrome, job.url, job.out, profile);
        if (result.ok) {
          cache[job.frame.file] = job.key;
          log(`  frame ${job.frame.file}`);
        } else {
          delete cache[job.frame.file];
          failures.push(`${job.frame.file}: ${result.title || 'no answer from the page'}`);
        }
      }
    } finally {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return { rendered: jobs.length - failures.length, failures };
}
