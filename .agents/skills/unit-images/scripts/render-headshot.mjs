#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, resolve, dirname, relative, sep } from "node:path";
import { createRequire } from "node:module";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const frontendRoot = resolve(repoRoot, "frontend/chronicle");
const requireFromFrontend = createRequire(resolve(frontendRoot, "package.json"));

function fail(message) {
  console.error(`render-headshot: ${message}`);
  process.exit(1);
}

function args(argv) {
  const result = { width: 1024, height: 1024, rotationY: 0, targetY: 0.68, viewHeight: 0.5, standTime: 0.35, exposure: 0.45 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument near ${key ?? "end of command"}`);
    if (key === "--model") result.model = resolve(value);
    else if (key === "--output") result.output = resolve(value);
    else if (key === "--width") result.width = Number(value);
    else if (key === "--height") result.height = Number(value);
    else if (key === "--rotation-y") result.rotationY = Number(value);
    else if (key === "--target-y") result.targetY = Number(value);
    else if (key === "--view-height") result.viewHeight = Number(value);
    else if (key === "--stand-time") result.standTime = Number(value);
    else if (key === "--exposure") result.exposure = Number(value);
    else fail(`unknown argument ${key}`);
  }
  if (!result.model || !result.output) fail("--model and --output are required");
  if (!existsSync(result.model)) fail(`model not found: ${result.model}`);
  for (const key of ["width", "height", "rotationY", "targetY", "viewHeight", "standTime", "exposure"]) {
    if (!Number.isFinite(result[key])) fail(`${key} must be a finite number`);
  }
  if (result.width < 64 || result.height < 64) fail("output dimensions must be at least 64 pixels");
  if (result.targetY < 0 || result.targetY > 1) fail("--target-y must be between 0 and 1");
  if (result.viewHeight <= 0) fail("--view-height must be positive");
  return result;
}

const options = args(process.argv.slice(2));
let playwrightPath;
try {
  playwrightPath = requireFromFrontend.resolve("playwright");
  if (!existsSync(resolve(frontendRoot, "node_modules/three/build/three.module.js"))) throw new Error("three is missing");
} catch {
  fail("frontend dependencies are missing; run pnpm -C frontend/chronicle install --frozen-lockfile");
}
const { chromium } = requireFromFrontend(playwrightPath);

const roots = {
  repo: repoRoot,
  node_modules: resolve(frontendRoot, "node_modules"),
};
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".glb", "model/gltf-binary"],
  [".png", "image/png"],
]);

function safePath(root, requestPath) {
  const path = resolve(root, `.${requestPath}`);
  return path === root || path.startsWith(`${root}${sep}`) ? path : undefined;
}

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  html,body { width:100%; height:100%; margin:0; overflow:hidden; background:radial-gradient(circle at 50% 44%, #3b2924 0%, #211817 38%, #0d0b0c 78%, #080708 100%); }
  canvas { display:block; width:100%; height:100%; }
</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const p = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(1);
renderer.setSize(Number(p.get("width")), Number(p.get("height")), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(p.get("exposure"));
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const background = document.createElement('canvas'); background.width = background.height = 1024;
const backgroundContext = background.getContext('2d');
const gradient = backgroundContext.createRadialGradient(512, 430, 20, 512, 512, 720);
gradient.addColorStop(0, '#402b25'); gradient.addColorStop(0.48, '#201617'); gradient.addColorStop(1, '#090708');
backgroundContext.fillStyle = gradient; backgroundContext.fillRect(0, 0, 1024, 1024);
scene.background = new THREE.CanvasTexture(background); scene.background.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffe5d2, 0x17131a, 1.1));
const key = new THREE.DirectionalLight(0xffd0aa, 2.0); key.position.set(3, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x8fa8ff, 1.0); fill.position.set(-4, 1, 3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xff5d44, 1.5); rim.position.set(2, 3, -4); scene.add(rim);

try {
  const gltf = await new GLTFLoader().loadAsync('/model.glb');
  const model = gltf.scene;
  model.rotation.y = THREE.MathUtils.degToRad(Number(p.get("rotationY")));
  scene.add(model);
  model.updateMatrixWorld(true);

  if (gltf.animations.length) {
    const clip = gltf.animations.find((item) => item.name.toLowerCase() === 'stand');
    if (!clip) throw new Error('model has animations but no Stand clip');
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip); action.play();
    mixer.setTime(Math.min(Number(p.get("standTime")), Math.max(0, clip.duration - 0.001)));
    model.updateMatrixWorld(true);
  }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetY = box.min.y + size.y * Number(p.get("targetY"));
  const viewHeight = Math.max(size.y * Number(p.get("viewHeight")), size.x * 0.78);
  const aspect = Number(p.get("width")) / Number(p.get("height"));
  const camera = new THREE.OrthographicCamera(-viewHeight * aspect / 2, viewHeight * aspect / 2, viewHeight / 2, -viewHeight / 2, 0.01, Math.max(100, size.length() * 20));
  camera.position.set(center.x, targetY, box.max.z + Math.max(size.length() * 4, 10));
  camera.lookAt(center.x, targetY, center.z);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  window.__portraitInfo = { size: size.toArray(), center: center.toArray(), animations: gltf.animations.map((clip) => clip.name) };
  window.__portraitReady = true;
} catch (error) {
  window.__portraitError = String(error?.stack || error);
}
</script>`;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(page);
    return;
  }
  let path;
  if (url.pathname === "/model.glb") path = options.model;
  else if (url.pathname.startsWith("/node_modules/")) path = safePath(roots.node_modules, url.pathname.slice("/node_modules".length));
  else path = safePath(roots.repo, url.pathname);
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime.get(extname(path)) ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(path).pipe(response);
});

await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
const address = server.address();
const executablePath = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]
  .map((name) => process.env.PATH.split(":").map((dir) => resolve(dir, name)).find(existsSync))
  .find(Boolean);
if (!executablePath) fail("Chromium was not found on PATH");

let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu-sandbox", "--use-gl=angle", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  const query = new URLSearchParams({
    width: String(options.width), height: String(options.height), rotationY: String(options.rotationY),
    targetY: String(options.targetY), viewHeight: String(options.viewHeight), standTime: String(options.standTime), exposure: String(options.exposure),
  });
  await tab.goto(`http://127.0.0.1:${address.port}/?${query}`, { waitUntil: "networkidle" });
  await tab.waitForFunction(() => window.__portraitReady || window.__portraitError, null, { timeout: 60_000 });
  const error = await tab.evaluate(() => window.__portraitError);
  if (error) fail(error);
  const info = await tab.evaluate(() => window.__portraitInfo);
  await mkdir(dirname(options.output), { recursive: true });
  await tab.screenshot({ path: options.output, type: "png" });
  console.log(JSON.stringify({ model: relative(repoRoot, options.model), output: relative(repoRoot, options.output), ...info }));
} finally {
  if (browser) await browser.close();
  await new Promise((accept) => server.close(accept));
}
