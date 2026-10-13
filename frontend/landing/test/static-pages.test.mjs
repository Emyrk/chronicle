import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("wires the ads explanation page into routing and the production build", async () => {
  const [app, viteConfig, adsHtml] = await Promise.all([
    read("src/App.tsx"),
    read("vite.config.ts"),
    read("ads/index.html"),
  ]);

  assert.match(app, /pathname\.endsWith\("\/ads"\)/);
  assert.match(app, /page = <AdsPage \/>/);
  assert.match(viteConfig, /ads: "ads\/index\.html"/);
  assert.match(adsHtml, /<title>Why Chronicle Runs Ads<\/title>/);
  assert.match(adsHtml, /https:\/\/chronicleclassic\.com\/ads\//);
});

test("links the ads explanation from support and the landing footer", async () => {
  const [supportPage, footer] = await Promise.all([
    read("src/components/SupportPage.tsx"),
    read("src/components/Footer.tsx"),
  ]);

  assert.match(supportPage, /Chronicle runs limited advertising/);
  assert.match(supportPage, /href="\/ads\/"/);
  assert.match(footer, /Why Chronicle Runs Ads/);
});

test("unknown landing paths show a local not-found page instead of redirecting", async () => {
  const [notFoundPage, servers] = await Promise.all([
    read("public/404.html"),
    read("src/data/servers.ts"),
  ]);

  assert.match(notFoundPage, /Page not found/);
  assert.match(notFoundPage, /href="\/"/);
  assert.doesNotMatch(notFoundPage, /window\.location|http-equiv="refresh"|turtle\.chronicleclassic\.com/);
  assert.doesNotMatch(servers, /turtle\.chronicleclassic\.com/);
});
