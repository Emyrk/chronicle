// Spike: drives the Mandokir capture story's in-browser MP4 export (WebCodecs)
// and saves the result. The browser does the rendering and encoding; this
// script only clicks the button and writes the file.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const storyUrl = process.env.STORY_URL ?? "http://localhost:6107/iframe.html?id=instance-map-mapview3d--mandokir-capture&viewMode=story&capture=render";
const output = path.resolve(process.env.OUTPUT ?? ".capture/spike-export.mp4");
const startMs = Number(process.env.START_MS ?? 14_028);
const endMs = Number(process.env.END_MS ?? 23_000);
const fps = Number(process.env.FPS ?? 30);
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
  }, { startMs, endMs, fps });
  await writeFile(output, Buffer.from(result.base64, "base64"));
  console.log(result.status);
  console.log(`Wrote ${output}`);
} finally {
  await browser.close();
}
