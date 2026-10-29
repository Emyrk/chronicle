#!/usr/bin/env node
/**
 * Records one landing hero clip (docs/landing-hero-clips.md): a boss pull replayed from the
 * Watch camera on /render/hero-clip, captured from the 3D canvas in headed Chrome (real GPU),
 * then looped, encoded and added to public/c/images/landing/clips/clips.json.
 *
 *   node scripts/record-hero-clip.mjs --name zg-hakkar --instance=-8uWqvAo4Qa4Oa5l \
 *     --encounter 81a00d73-167c-4b57-845f-71ab8e12b153 --from 20000 [--seconds 8] [--base http://localhost:5173]
 *
 * --from is where the replay starts, in ms into the pull; the clip begins about 3 s later. Needs ffmpeg (libx264, libvpx-vp9) and cwebp on PATH.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    instance: { type: "string" },
    encounter: { type: "string" },
    from: { type: "string", default: "0" },
    seconds: { type: "string", default: "8" },
    base: { type: "string", default: "http://localhost:5173" },
  },
});
if (!args.name || !args.instance || !args.encounter) {
  console.error("usage: record-hero-clip.mjs --name <file stem> --instance <slug> --encounter <id> --from <ms> [--seconds 8] [--base <vite url>]");
  process.exit(2);
}

/** Seconds of the take's end that crossfade into its start, so the clip loops without a jump. */
const FADE_S = 1;
/** Seconds recorded ahead of the clip, so both takes can be cut to start at one replay time. */
const LEAD_S = 1.5;
// Each variant is its own take at its own size, so the Watch camera frames the fight for that shape.
const VARIANTS = {
  landscape: { viewport: { width: 1280, height: 720 }, bitrate: "1000k", budget: 1_200_000 },
  portrait: { viewport: { width: 720, height: 960 }, bitrate: "480k", budget: 600_000 },
};
const POSTER_BUDGET = 100_000;
const TOP_ROWS = 5;

const clipsDir = join(dirname(fileURLToPath(import.meta.url)), "../public/c/images/landing/clips");
const work = mkdtempSync(join(tmpdir(), `hero-clip-${args.name}-`));
const loopSeconds = Number(args.seconds);
const takeSeconds = LEAD_S + loopSeconds + FADE_S;
const url = `${args.base}/render/hero-clip/${encodeURIComponent(args.instance)}?encounter=${args.encounter}&from=${args.from}`;

// 1. Record the takes: the canvas's own frames, through MediaRecorder at a high bitrate, in headed Chrome (the real GPU).
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
});
const takes = {};
let pull = null;
let instance = null;
for (const [variant, { viewport }] of Object.entries(VARIANTS)) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, acceptDownloads: true });
  page.on("pageerror", (error) => console.error("pageerror:", error.message));
  console.log(`recording ${variant}`, url);
  await page.goto(url, { timeout: 240_000 });
  await page.waitForFunction(() => window.__heroClip?.currentMs != null && window.__heroClip.pull != null, null, { timeout: 180_000 });
  // The 3D fades in over 700 ms and the camera settles on the fight.
  await page.waitForTimeout(2_000);
  const downloadPromise = page.waitForEvent("download", { timeout: (takeSeconds + 60) * 1000 });
  const take = await page.evaluate(async (ms) => {
    const canvas = document.querySelector("canvas");
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 25_000_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const startMs = window.__heroClip.currentMs;
    await new Promise((resolve) => setTimeout(resolve, ms));
    recorder.stop();
    await stopped;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    link.download = "take.webm";
    link.click();
    return { startMs, endMs: window.__heroClip.currentMs, pull: window.__heroClip.pull };
  }, takeSeconds * 1000);
  const path = join(work, `${variant}-take.webm`);
  await (await downloadPromise).saveAs(path);
  // The run's names, through the page (the API answers browser requests only).
  instance ??= await page.evaluate(async (slug) => (await fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(slug)}`)).json(), args.instance);
  pull ??= take.pull;
  takes[variant] = { path, startMs: take.startMs };
  console.log(`${variant} take: replay ${take.startMs}..${take.endMs} ms`);
  await page.close();
}
await browser.close();

// 2. Loop: both takes cut to start at one replay time (the clip's start minus the fade), the last FADE_S of the
//    clip crossfading into the frames before its start, so its end runs into its first frame.
const clipStartMs = Math.max(...Object.values(takes).map((take) => take.startMs)) + FADE_S * 1000;
const ffmpeg = (...ffArgs) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...ffArgs], { stdio: "inherit" });
for (const [variant, take] of Object.entries(takes)) {
  const { width, height } = VARIANTS[variant].viewport;
  const cutS = (clipStartMs - FADE_S * 1000 - take.startMs) / 1000;
  take.loopPath = join(work, `${variant}-loop.mkv`);
  ffmpeg(
    "-i", take.path,
    "-filter_complex",
    `[0:v]fps=30,setpts=PTS-STARTPTS,trim=start=${cutS},setpts=PTS-STARTPTS,scale=${width}:${height},format=yuv420p,split[a][b];` +
    `[a]trim=start=${FADE_S}:end=${FADE_S + loopSeconds},setpts=PTS-STARTPTS[tail];[b]trim=end=${FADE_S},setpts=PTS-STARTPTS[head];` +
    `[tail][head]xfade=transition=fade:duration=${FADE_S}:offset=${loopSeconds - FADE_S}[out]`,
    "-map", "[out]", "-c:v", "libx264", "-crf", "12", "-preset", "medium", take.loopPath,
  );
}

// 3. Encode each loop as H.264 (faststart) and VP9, muted, plus its first frame as the WebP poster.
const outputs = {};
for (const [variant, { bitrate, budget }] of Object.entries(VARIANTS)) {
  const stem = variant === "landscape" ? args.name : `${args.name}-portrait`;
  const { loopPath } = takes[variant];
  const pass = join(work, `${variant}-pass`);
  const mp4 = join(work, `${stem}.mp4`);
  const webm = join(work, `${stem}.webm`);
  const poster = join(work, `${stem}.webp`);
  const x264 = ["-an", "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-b:v", bitrate, "-passlogfile", pass];
  ffmpeg("-i", loopPath, ...x264, "-pass", "1", "-f", "mp4", "/dev/null");
  ffmpeg("-i", loopPath, ...x264, "-pass", "2", "-movflags", "+faststart", mp4);
  const vp9 = ["-an", "-c:v", "libvpx-vp9", "-b:v", bitrate, "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-passlogfile", `${pass}-vp9`];
  ffmpeg("-i", loopPath, ...vp9, "-pass", "1", "-f", "webm", "/dev/null");
  ffmpeg("-i", loopPath, ...vp9, "-pass", "2", webm);
  // The first frame, what the clip opens on.
  const png = join(work, `${stem}.png`);
  ffmpeg("-i", loopPath, "-frames:v", "1", png);
  // The portrait poster is the phone hero's LCP image: smaller and lighter, so it shares the first-paint bandwidth
  // with the app's entry chunk and stylesheet (/start LCP ≤ 2.5 s on simulated mobile).
  const posterOptions = variant === "portrait" ? ["-q", "50", "-m", "6", "-resize", "540", "720"] : ["-q", "70"];
  execFileSync("cwebp", ["-quiet", ...posterOptions, png, "-o", poster]);
  for (const [file, limit] of [[mp4, budget], [webm, budget], [poster, POSTER_BUDGET]]) {
    const size = statSync(file).size;
    console.log(`${file.split("/").pop()}: ${(size / 1024).toFixed(0)} KB${size > limit ? `  OVER BUDGET (${limit / 1000} KB)` : ""}`);
  }
  // Content-hashed names: the files can be cached forever.
  const hashed = {};
  for (const [key, file, ext] of [["mp4", mp4, "mp4"], ["webm", webm, "webm"], ["poster", poster, "webp"]]) {
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
    hashed[key] = `${stem}.${hash}.${ext}`;
  }
  outputs[variant] = { files: { mp4, webm, poster }, hashed };
}

// 4. The meter: the pull's real numbers; the death shown is the first one inside the clip, timed from the clip's start.
const total = pull.players.reduce((sum, player) => sum + player.damage, 0);
const seconds = pull.durationMs / 1000;
const death = pull.deaths
  .map((candidate) => ({ ...candidate, atMs: Math.round(candidate.offsetMs - clipStartMs) }))
  .find((candidate) => candidate.atMs >= 0 && candidate.atMs < (loopSeconds - FADE_S) * 1000);
const encounter = instance.encounters.find((candidate) => candidate.id === args.encounter);
const entry = {
  slug: args.instance,
  instance_name: instance.name,
  boss: encounter.name,
  mp4: outputs.landscape.hashed.mp4,
  webm: outputs.landscape.hashed.webm,
  poster: outputs.landscape.hashed.poster,
  portrait: { mp4: outputs.portrait.hashed.mp4, webm: outputs.portrait.hashed.webm, poster: outputs.portrait.hashed.poster },
  meter: {
    total: Math.round(total),
    dps: Math.round(total / seconds),
    rows: pull.players.slice(0, TOP_ROWS).map((player) => ({
      name: player.name,
      class: player.className,
      dps: Math.round(player.damage / seconds),
      share: Math.round((player.damage / total) * 1000) / 1000,
    })),
    death: death
      ? { victim: death.victim, class: death.className, at_ms: death.atMs, ability: death.ability, amount: death.amount, source: death.source }
      : null,
  },
};

// 5. Ship: replace this clip's files and manifest entry.
mkdirSync(clipsDir, { recursive: true });
const manifestPath = join(clipsDir, "clips.json");
let manifest = [];
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  // first clip
}
const previous = manifest.find((clip) => clip.slug === entry.slug && clip.boss === entry.boss);
if (previous) {
  for (const file of [previous.mp4, previous.webm, previous.poster, previous.portrait.mp4, previous.portrait.webm, previous.portrait.poster]) {
    rmSync(join(clipsDir, file), { force: true });
  }
}
for (const { files, hashed } of Object.values(outputs)) {
  for (const key of ["mp4", "webm", "poster"]) copyFileSync(files[key], join(clipsDir, hashed[key]));
}
manifest = [...manifest.filter((clip) => clip !== previous), entry];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(entry, null, 2));

