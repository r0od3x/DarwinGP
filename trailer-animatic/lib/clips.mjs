// Real gameplay clips, one per shot: the game stages the scene (trailer/stage.js, clip mode),
// then races on. Node drives headless Chrome over the DevTools protocol (a pipe, no package):
// for each output frame it asks the page to advance one frame (TrailerStage.frame), takes a
// screenshot (canvas + HTML HUD) and feeds it to ffmpeg. Frame-exact, however slow the machine.
// A clip is re-captured only when its plan or the staging code changes (clips/.cache.json).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { base64url, chromePath } from './frames.mjs';
import { MOVES } from './video.mjs';

// Minimal DevTools protocol client over --remote-debugging-pipe (messages end with \0).
class Cdp {
  constructor(child) {
    this.out = child.stdio[3];
    this.pending = new Map();
    this.id = 0;
    let buffer = Buffer.alloc(0);
    child.stdio[4].on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      let end;
      while ((end = buffer.indexOf(0)) >= 0) {
        const message = JSON.parse(buffer.subarray(0, end).toString('utf8'));
        buffer = buffer.subarray(end + 1);
        const waiting = this.pending.get(message.id);
        if (!waiting) continue;
        this.pending.delete(message.id);
        if (message.error) waiting.reject(new Error(`${message.error.message} ${message.error.data ?? ''}`));
        else waiting.resolve(message.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.out.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    return promise;
  }
}

async function openBrowser(chrome, profile, size) {
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`, '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const cdp = new Cdp(child);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const page = targetInfos.find(t => t.type === 'page') ?? await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
  return { child, cdp, sessionId, evaluate, close: () => child.kill() };
}

// Clip plan of a shot: its first storyboard frame's staging, the end camera of its second frame,
// its camera move, plus the shot's `clip` overrides (actions, time scale, other staging…).
export function clipSpec(cfg, shot) {
  const first = shot.frames[0].stage;
  const extra = shot.clip ?? {};
  const move = MOVES[extra.move ?? shot.move] ?? MOVES.static;
  return {
    ...cfg.stageDefaults, ...first, ...(extra.stage ?? {}),
    camera: extra.camera ?? first.camera,
    cameraTo: extra.cameraTo ?? shot.frames[1]?.stage?.camera,
    move: { ...move, ...(extra.moveExtra ?? {}) },
    timeScale: extra.timeScale ?? 1,
    actions: extra.actions ?? [],
    smoothing: extra.smoothing, lock: extra.lock,
    duration: shot.duration, fps: cfg.fps,
  };
}

export function clipUrl(cfg, shot, root) {
  const game = pathToFileURL(join(root, cfg.game)).href;
  return `${game}?trailer=${base64url(JSON.stringify(clipSpec(cfg, shot)))}&clip=1`;
}

async function captureClip(browser, url, out, fps) {
  await browser.cdp.send('Page.navigate', { url }, browser.sessionId);
  let title = '';
  for (let i = 0; i < 300 && !title.startsWith('trailer:'); i++) {
    await new Promise(ok => setTimeout(ok, 100));
    title = await browser.evaluate('document.title').catch(() => '');
  }
  if (title !== 'trailer:ready') throw new Error(title || 'the page did not answer');
  const frames = await browser.evaluate('TrailerStage.clip.frames');
  const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), '-frames:v', String(frames), out],
  { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '';
  ffmpeg.stderr.on('data', chunk => { errors += chunk; });
  const closed = new Promise(ok => ffmpeg.on('close', ok));
  for (let k = 0; k < frames; k++) {
    await browser.evaluate(`TrailerStage.frame(${k}).t`);
    const { data } = await browser.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true }, browser.sessionId);
    if (!ffmpeg.stdin.write(Buffer.from(data, 'base64'))) await new Promise(ok => ffmpeg.stdin.once('drain', ok));
  }
  ffmpeg.stdin.end();
  const code = await closed;
  if (code !== 0) throw new Error(`ffmpeg: ${errors}`);
  return frames;
}

// Captures the clips whose plan changed (or all with force, or the shots in `only`).
export async function renderClips(cfg, shots, { root, outDir, force = false, only = null, concurrency = 3, log = console.log }) {
  const chrome = chromePath();
  if (!chrome) throw new Error('Chrome not found: set CHROME_PATH');
  mkdirSync(outDir, { recursive: true });
  const cacheFile = join(outDir, '.cache.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const version = String(statSync(join(root, '../trailer/stage.js')).mtimeMs);
  const jobs = [];
  for (const shot of shots) {
    if (!shot.frames[0].stage) continue;
    const url = clipUrl(cfg, shot, root);
    const key = createHash('sha1').update(url + version).digest('hex');
    const file = `${shot.number}_${shot.slug}.mp4`;
    const out = join(outDir, file);
    const wanted = only ? only.includes(shot.number) || only.includes(shot.slug) : (force || cache[file] !== key || !existsSync(out));
    if (wanted) jobs.push({ shot, url, key, file, out });
  }
  const failures = [];
  let next = 0;
  async function worker() {
    const profile = mkdtempSync(join(tmpdir(), 'animatic-clip-'));
    const browser = await openBrowser(chrome, profile, { width: cfg.width, height: cfg.height });
    try {
      while (next < jobs.length) {
        const job = jobs[next++];
        const started = Date.now();
        try {
          const frames = await captureClip(browser, job.url, job.out, cfg.fps);
          cache[job.file] = job.key;
          log(`  clip ${job.file} (${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)} s)`);
        } catch (error) {
          delete cache[job.file];
          failures.push(`${job.file}: ${error.message}`);
        }
      }
    } finally {
      browser.close();
      await new Promise(ok => setTimeout(ok, 300));
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return { rendered: jobs.length - failures.length, failures };
}
