import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("prerenders the server directory and hydrates the generated markup", async () => {
  const [packageJSON, main, prerender, script] = await Promise.all([
    read("package.json"),
    read("src/main.tsx"),
    read("src/prerender.tsx"),
    read("scripts/prerender-home.mjs"),
  ]);

  assert.match(packageJSON, /vite build --ssr src\/prerender\.tsx/);
  assert.match(main, /hydrateRoot\(root, app\)/);
  assert.match(main, /chronicle-prerender-state/);
  assert.match(prerender, /discoverServers\(SERVERS, DISCOVERY_URLS\)/);
  assert.match(prerender, /"@type": "ItemList"/);
  assert.match(script, /<div id="root">\$\{result\.html\}<\/div>/);
  assert.match(script, /dist\/sitemap\.xml/);
});

test("publishes canonical, robots, and sitemap discovery metadata", async () => {
  const [index, robots] = await Promise.all([
    read("index.html"),
    read("public/robots.txt"),
  ]);

  assert.match(index, /<link rel="canonical" href="https:\/\/chronicleclassic\.com\/"/);
  assert.match(index, /<meta name="robots" content="index, follow"/);
  assert.match(robots, /Sitemap: https:\/\/chronicleclassic\.com\/sitemap\.xml/);
});
