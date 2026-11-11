// Browser protocol smoke test only. Production ads/video require manual testing.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const source = await readFile(new URL("../src/pages/Instance/isolationProbe.worker.js", import.meta.url), "utf8");
// Build first. Use the actual production aggregation entry, not a stand-in.
const assets = new URL("../dist/assets/", import.meta.url);
const workers = (await readdir(assets)).filter(name => /^aggregationPanelWorker-[\w-]+\.js$/.test(name));
assert.equal(workers.length, 1, "Run pnpm build first; expected one aggregation worker");
const workerPath = `/assets/${workers[0]}`;
const workerBytes = await readFile(new URL(workers[0], assets));
const requests = [];
const server = createServer((req, res) => {
  requests.push(req.url);
  if ([workerPath, "/without-coep.js", "/http-probe.js"].includes(req.url)) {
    res.setHeader("Content-Type", "text/javascript");
    if (req.url !== "/without-coep.js") res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.end(req.url === "/http-probe.js"
      ? "self.onmessage = () => self.postMessage({ isolated: self.crossOriginIsolated });"
      : workerBytes);
    return;
  }
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
  for (const isolated of [false, true]) {
    await page.goto(`${base}/${isolated ? "isolated" : "normal"}`);
    const response = await page.evaluate(async ({ workerPath }) => {
      async function run(path, request) {
        const worker = new Worker(path, { type: "module" });
        let timeout;
        try {
          return await new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("HTTP worker timeout")), 10000);
            worker.onmessage = event => resolve(event.data);
            worker.onerror = event => reject(new Error(event.message || "Worker blocked"));
            worker.postMessage(request);
          });
        } finally {
          clearTimeout(timeout);
          worker.terminate();
        }
      }
      const policy = await run("/http-probe.js", {});
      const aggregation = await run(workerPath, {
        requestId: 7,
        panelId: "damage_done",
        context: { players: {}, units: {}, selectedEncounterIds: [], entitySelection: { playerIds: [], enemyIds: [] } },
        streams: [],
      });
      // Reproduce the original regression with the same built bytes but no COEP.
      let missingHeaderBlocked = false;
      try { await run("/without-coep.js", { requestId: 8, panelId: "empty", context: {}, streams: [] }); }
      catch (error) {
        if (error.message === "HTTP worker timeout") throw error;
        missingHeaderBlocked = true;
      }
      return { isolated: crossOriginIsolated, policy, aggregation, missingHeaderBlocked };
    }, { workerPath });
    assert.equal(response.isolated, isolated);
    assert.deepEqual(response.policy, { isolated });
    assert.equal(response.aggregation.requestId, 7);
    assert.equal(response.aggregation.error, undefined);
    assert.equal(response.aggregation.totalEvents, 0);
    assert.equal(typeof response.aggregation.result, "object");
    assert.equal(response.missingHeaderBlocked, isolated);
  }
  assert.ok(requests.includes(workerPath));
  assert.deepEqual([...new Set(requests)].filter(path => !["/normal", "/isolated", "/favicon.ico", workerPath, "/http-probe.js", "/without-coep.js"].includes(path)), []);
  console.log("PASS: blob SAB mutation; HTTP module-worker isolation; built aggregation worker succeeds on normal and isolated documents; missing COEP reproduces block");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
