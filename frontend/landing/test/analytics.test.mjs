import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const landingEntries = [
  "index.html",
  "self-hosting/index.html",
  "support/index.html",
  "privacy/index.html",
];

test("loads analytics from every landing entry", async () => {
  for (const entry of landingEntries) {
    const html = await readFile(new URL(`../${entry}`, import.meta.url), "utf8");
    assert.match(html, /<script type="module" src="\/src\/analytics\.ts"><\/script>/);
  }
});

test("uses Chronicle GA4 and owned-site attribution parameters", async () => {
  const analytics = await readFile(new URL("../src/analytics.ts", import.meta.url), "utf8");
  assert.match(analytics, /G-G0Q1B9GRC0/);
  for (const parameter of ["chr_src", "chr_pos", "chr_cmp"]) {
    assert.match(analytics, new RegExp(`"${parameter}"`));
  }
});
