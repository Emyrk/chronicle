import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectDirectory, "dist");
const serverBuildDirectory = path.join(projectDirectory, ".blog-prerender");

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function outputPath(routePath) {
  if (routePath === "/blog") {
    return path.join(distDirectory, "blog", "index.html");
  }
  return path.join(distDirectory, `${routePath.slice(1)}.html`);
}

function withMetadata(template, page) {
  const canonicalPath = escapeAttribute(page.path);
  const flavorBootstrap = `<script>window.__CHRONICLE_BLOG_FLAVOR__ = {{ if .BlogFlavorJSON }}{{ .BlogFlavorJSON }}{{ else }}[]{{ end }};</script>`;

  return template
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div>`)
    .replace(/<title>.*?<\/title>/s, `<title>${escapeAttribute(page.title)}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/?>/s, `<meta name="description" content="${escapeAttribute(page.description)}" />`)
    .replace(/<meta property="og:title" content=".*?"\s*\/?>/s, `<meta property="og:title" content="${escapeAttribute(page.title)}" />`)
    .replace(/<meta property="og:description" content=".*?"\s*\/?>/s, `<meta property="og:description" content="${escapeAttribute(page.description)}" />`)
    .replace(/<meta property="og:url" content=".*?"\s*\/?>/s, `<meta property="og:url" content="${canonicalPath}" />\n    <link rel="canonical" href="${canonicalPath}" />`)
    .replace("</head>", `    ${flavorBootstrap}\n  </head>`);
}

async function findServerEntry() {
  const entries = await readdir(serverBuildDirectory, { recursive: true });
  const entry = entries.find((name) => name.endsWith("prerender.js") || name.endsWith("prerender.mjs"));
  if (!entry) {
    throw new Error(`Could not find the blog prerender server bundle in ${serverBuildDirectory}`);
  }
  return path.join(serverBuildDirectory, entry);
}

const serverEntry = await findServerEntry();
const { blogManifest, prerenderBlogPages } = await import(pathToFileURL(serverEntry).href);
const template = await readFile(path.join(distDirectory, "index.html"), "utf8");

for (const page of prerenderBlogPages()) {
  const destination = outputPath(page.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, withMetadata(template, page));
}

await writeFile(
  path.join(distDirectory, "blog-manifest.json"),
  `${JSON.stringify(blogManifest(), null, 2)}\n`,
);
await rm(serverBuildDirectory, { recursive: true, force: true });
