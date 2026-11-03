// Drives the Mandokir capture story's "Render video" (drone camera, WebCodecs
// MP4 in the browser) and saves the result. The browser does the rendering and
// encoding; this script only starts it and writes the file. FROM_MS / TO_MS
// pick a slice of the video (ms into it); the whole fight otherwise.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const storyUrl = process.env.STORY_URL ?? "http://localhost:6108/iframe.html?id=instance-map-mapview3d--mandokir-capture&viewMode=story&capture=render";
const output = path.resolve(process.env.OUTPUT ?? ".capture/replay-video.mp4");
const fromMs = process.env.FROM_MS === undefined ? undefined : Number(process.env.FROM_MS);
const toMs = process.env.TO_MS === undefined ? undefined : Number(process.env.TO_MS);
const channel = process.env.CHANNEL; // e.g. "chrome" for a branded build with H.264

const browser = await chromium.launch({
  channel,
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("console", (message) => { if (message.type() === "error") console.error("[page]", message.text()); });
  await page.goto(storyUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector('[data-map-capture-ready="true"]', { timeout: 180_000 });
  console.log("codecs:", await page.evaluate(async () => {
    const out = {};
    for (const [name, codec] of [["avc", "avc1.640028"], ["vp9", "vp09.00.10.08"], ["av1", "av01.0.08M.08"]]) {
      try {
        out[name] = (await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 5e6 })).supported;
      } catch (error) { out[name] = String(error); }
    }
    return out;
  }));

  const result = await page.evaluate(async (options) => {
    const bridge = window.__chronicleMapCapture;
    if (!bridge?.exportVideo) throw new Error("export bridge missing");
    const { blob, status } = await bridge.exportVideo(options);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { status, base64: btoa(binary) };
  }, { fromMs, toMs });
  await writeFile(output, Buffer.from(result.base64, "base64"));
  console.log(result.status);
  console.log(`Wrote ${output}`);
} finally {
  await browser.close();
}
