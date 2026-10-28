import { readFile, rm, writeFile } from "node:fs/promises";
import { prerenderHome } from "../.prerender/prerender.js";

const canonicalBase = "https://chronicleclassic.com";
const sitemapPaths = [
  "/",
  "/support/",
  "/self-hosting/",
  "/ads/",
  "/privacy/",
  "/warcraft-logs/",
];

function safeJSON(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

const result = await prerenderHome();
const indexPath = new URL("../dist/index.html", import.meta.url);
let html = await readFile(indexPath, "utf8");

const rootMarker = '<div id="root"></div>';
if (!html.includes(rootMarker)) {
  throw new Error("Unable to find the landing root marker in dist/index.html");
}

html = html.replace(
  rootMarker,
  `<div id="root">${result.html}</div>\n    <script id="chronicle-prerender-state" type="application/json">${safeJSON(result.state)}</script>`,
);
html = html.replace(
  "</head>",
  `    <script type="application/ld+json">${safeJSON(result.structuredData)}</script>\n  </head>`,
);
await writeFile(indexPath, html);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths
  .map((path) => `  <url><loc>${canonicalBase}${path}</loc></url>`)
  .join("\n")}\n</urlset>\n`;
await writeFile(new URL("../dist/sitemap.xml", import.meta.url), sitemap);

// The SSR bundle is an intermediate build artifact, not part of the deployed site.
await rm(new URL("../.prerender", import.meta.url), { recursive: true, force: true });
