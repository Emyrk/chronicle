import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const fps = Number(process.env.FPS ?? 30);
const startMs = Number(process.env.START_MS ?? 14_028);
const endMs = Number(process.env.END_MS ?? 23_000);
const storyUrl = process.env.STORY_URL ?? "http://localhost:6006/iframe.html?id=instance-map-mapview3d--mandokir-capture&viewMode=story&capture=render";
const walkCapture = process.env.WALK_CAPTURE === "1";
const output = path.resolve(process.env.OUTPUT ?? "public/maps3d/mandokir-overview.mp4");
const frameDir = path.resolve(process.env.FRAME_DIR ?? ".capture/map-path");
const frameCount = Math.round(((endMs - startMs) / 1000) * fps) + 1;

await rm(frameDir, { recursive: true, force: true });
await mkdir(frameDir, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });

// Long WebGL captures can exhaust SwiftShader resources in one Chromium
// process. Orbit-camera frames are independent, so render them in fresh
// browser batches. Walking capture stays sequential because each frame builds
// on the previous simulated position.
const batchFrames = walkCapture ? frameCount : Number(process.env.BATCH_FRAMES ?? 45);
for (let batchStart = 0; batchStart < frameCount; batchStart += batchFrames) {
  const batchEnd = Math.min(frameCount, batchStart + batchFrames);
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(storyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-map-capture-ready="true"]', { timeout: 120_000 });

    if (!walkCapture) {
      const firstTimestampMs = Math.min(endMs, startMs + (batchStart * 1000) / fps);
      await page.evaluate((at) => {
        const capture = window.__chronicleMapCapture;
        if (!capture) throw new Error("Map capture bridge is unavailable");
        capture.setTime(at);
      }, firstTimestampMs);
      // Let the smoothed replay clock and authored camera settle after opening a
      // fresh browser batch so the first encoded frame is never the default view.
      await page.evaluate(() => new Promise((resolve) => {
        let remaining = 45;
        const next = () => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }));
    }

    for (let frame = batchStart; frame < batchEnd; frame += 1) {
      const timestampMs = Math.min(endMs, startMs + (frame * 1000) / fps);
      await page.evaluate(({ at, walkElapsedMs }) => {
        const capture = window.__chronicleMapCapture;
        if (!capture) throw new Error("Map capture bridge is unavailable");
        capture.setTime(at, walkElapsedMs);
      }, { at: timestampMs, walkElapsedMs: walkCapture ? (frame * 1000) / fps : undefined });
      // React commits the replay state asynchronously, then MapView3D schedules a
      // WebGL render. Waiting several browser frames keeps capture deterministic
      // without depending on SyncMode's rounded timestamp representation.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      await page.screenshot({ path: path.join(frameDir, `${String(frame).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95 });
      if (frame % fps === 0 || frame === frameCount - 1) console.log(`Captured ${frame + 1}/${frameCount}`);
    }
  } finally {
    await browser.close();
  }
}

const encode = spawnSync("ffmpeg", [
  "-y", "-v", "error",
  "-framerate", String(fps),
  "-i", path.join(frameDir, "%05d.jpg"),
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  output,
], { stdio: "inherit" });

if (encode.status !== 0) process.exit(encode.status ?? 1);
console.log(`Wrote ${output}`);
