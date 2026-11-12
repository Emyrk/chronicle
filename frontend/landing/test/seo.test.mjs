import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FEATURED_SERVER } from "../src/data/servers.ts";
import { listedServers } from "../src/listedServers.ts";

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

function attr(html, selector) {
  const pattern = new RegExp(`<meta (?:name|property)="${selector}" content="([^"]*)"`);
  return html.match(pattern)?.[1];
}

test("home page publishes a large share card with consistent titles and descriptions", async () => {
  const index = await read("index.html");
  const canonical = index.match(/<link rel="canonical" href="([^"]+)"/)[1];
  const title = index.match(/<title>([^<]+)<\/title>/)[1];
  const description = attr(index, "description");

  assert.equal(attr(index, "og:url"), canonical);
  assert.equal(attr(index, "og:site_name"), "Chronicle");
  assert.match(title, /Raid Log Analysis/);
  assert.equal(attr(index, "og:title"), title);
  assert.equal(attr(index, "twitter:title"), title);
  assert.equal(attr(index, "og:description"), description);
  assert.equal(attr(index, "twitter:description"), description);
  assert.equal(attr(index, "twitter:card"), "summary_large_image");
  assert.equal(attr(index, "og:image"), "https://chronicleclassic.com/og-image.jpg");
  assert.equal(attr(index, "twitter:image"), attr(index, "og:image"));
  assert.equal(attr(index, "og:image:width"), "1200");
  assert.equal(attr(index, "og:image:height"), "630");
  assert.ok(attr(index, "og:image:alt"));
});

test("the share image is a 1200x630 JPEG", async () => {
  const image = await readFile(new URL("../public/og-image.jpg", import.meta.url));
  // Walk JPEG segments to the start-of-frame marker, which holds the size.
  let offset = 2;
  while (offset < image.length) {
    const marker = image[offset + 1];
    const length = image.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      assert.equal(image.readUInt16BE(offset + 5), 630);
      assert.equal(image.readUInt16BE(offset + 7), 1200);
      return;
    }
    offset += 2 + length;
  }
  assert.fail("no JPEG start-of-frame marker found");
});

test("every sitemap sub-page has unique titles, a canonical, and social tags", async () => {
  const script = await read("scripts/prerender-home.mjs");
  const paths = [...script.matchAll(/^\s+"(\/[^"]*)",$/gm)].map((match) => match[1]);
  assert.ok(paths.includes("/"));
  const subPages = paths.filter((path) => path !== "/");
  assert.ok(subPages.length >= 5);

  const titles = new Set();
  const descriptions = new Set();
  for (const path of subPages) {
    const html = await read(`${path.slice(1)}index.html`);
    const url = `https://chronicleclassic.com${path}`;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = attr(html, "description");
    assert.ok(title, `${path} title`);
    assert.ok(description, `${path} description`);
    titles.add(title);
    descriptions.add(description);
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}"`), `${path} canonical`);
    assert.equal(attr(html, "og:url"), url, `${path} og:url`);
    assert.equal(attr(html, "og:site_name"), "Chronicle", `${path} og:site_name`);
    for (const tag of ["og:title", "og:description", "og:image", "twitter:card", "twitter:title", "twitter:description"]) {
      assert.ok(attr(html, tag), `${path} ${tag}`);
    }
  }
  assert.equal(titles.size, subPages.length);
  assert.equal(descriptions.size, subPages.length);
});

test("structured data lists the featured server first, then the grid without duplicates", () => {
  const listed = listedServers([
    { name: "Old Man Warcraft", chronicleUrl: "https://logs.oldmanwarcraft.com/" },
    // The grid can include the featured server; it is listed once, first.
    { name: "WoW Forever (grid)", chronicleUrl: "https://forever.chronicleclassic.com/" },
    { name: "Old Man Warcraft again", chronicleUrl: "https://logs.oldmanwarcraft.com" },
    { name: "Everlook", chronicleUrl: "https://everlook.chronicleclassic.com" },
  ]);

  assert.deepEqual(listed, [
    { name: FEATURED_SERVER.name, url: FEATURED_SERVER.chronicleUrl },
    { name: "Old Man Warcraft", url: "https://logs.oldmanwarcraft.com" },
    { name: "Everlook", url: "https://everlook.chronicleclassic.com" },
  ]);
  assert.equal(listed.length, 3);
  assert.deepEqual(listedServers([]), [{ name: FEATURED_SERVER.name, url: FEATURED_SERVER.chronicleUrl }]);
});
