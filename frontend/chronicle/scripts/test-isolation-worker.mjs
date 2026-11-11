// Browser protocol smoke test only. Production ads/video require manual testing.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const source = await readFile(new URL("../src/pages/Instance/isolationProbe.worker.js", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/isolated") {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  }
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><title>Isolation worker smoke test</title>");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/isolated`);
  const result = await page.evaluate(async (source) => {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.store(view, 0, 41);
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url, { type: "module" });
    let timeout;
    try {
      const data = await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Worker timeout")), 5000);
        worker.onmessage = event => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage(buffer);
      });
      return { isolated: crossOriginIsolated, data, value: Atomics.load(view, 0) };
    } finally {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }, source);
  assert.deepEqual(result, { isolated: true, data: { type: "result", isolated: true }, value: 42 });
  await page.goto(`${base}/normal`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), false);
  console.log("PASS: dedicated blob module worker shares memory; normal document is not isolated");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
