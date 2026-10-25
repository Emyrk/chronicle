import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectDirectory, "dist");

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function routeOutputPath(slug) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Unsafe guide route slug: ${slug}`);
  }
  return path.join(distDirectory, "guides", `${slug}.html`);
}

function fallbackMarkup(guide) {
  const encounters = guide.encounters.length > 0
    ? `<p><strong>Encounters:</strong> ${guide.encounters.map(escapeHTML).join(", ")}</p>`
    : "";
  const gameVersion = guide.game_version ? ` ${escapeHTML(guide.game_version)}` : "";
  return `<main style="min-height:100vh;box-sizing:border-box;display:grid;place-items:center;padding:2rem;background:#020617;color:#e2e8f0;font-family:system-ui,sans-serif">
    <article style="width:min(42rem,100%);padding:2rem;border:1px solid #334155;border-radius:.75rem;background:#0f172a;box-shadow:0 24px 60px rgba(0,0,0,.4)">
      <p style="margin:0 0 .5rem;color:#fbbf24;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Interactive raid guide</p>
      <h1 style="margin:0;color:#fef3c7;font-family:Georgia,serif;font-size:2rem">${escapeHTML(guide.name)}</h1>
      <p style="margin:1rem 0;color:#cbd5e1;line-height:1.65">${escapeHTML(guide.description)}</p>
      <div style="color:#94a3b8;font-size:.875rem;line-height:1.6">
        <p><strong>Author:</strong> ${escapeHTML(guide.author)}</p>
        <p><strong>Game:</strong> ${escapeHTML(guide.game)}${gameVersion}</p>
        ${encounters}
      </div>
      <p style="margin:1.5rem 0 0;color:#94a3b8;font-size:.875rem">Enable JavaScript to load the interactive map, Lua guide runtime, and tactical demonstrations.</p>
    </article>
  </main>`;
}

function renderGuidePage(template, guide) {
  const title = `${guide.name} Raid Guide`;
  // Keep canonical/OG URL Go-template fields intact: the server resolves the
  // absolute URL against the request's tenant host at render time.
  const root = `<div id="root" data-prerender="guide">${fallbackMarkup(guide)}</div>`;
  const extraMetadata = [
    `<meta name="author" content="${escapeHTML(guide.author)}" />`,
    `<meta property="article:section" content="World of Warcraft raid guides" />`,
  ].join("\n    ");

  return template
    .replace('<div id="root"></div>', root)
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHTML(title)}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/?>/s, `<meta name="description" content="${escapeHTML(guide.description)}" />`)
    .replace(/<meta property="og:title" content=".*?"\s*\/?>/s, `<meta property="og:title" content="${escapeHTML(title)}" />`)
    .replace(/<meta property="og:description" content=".*?"\s*\/?>/s, `<meta property="og:description" content="${escapeHTML(guide.description)}" />`)
    .replace(/<meta name="twitter:title" content=".*?"\s*\/?>/s, `<meta name="twitter:title" content="${escapeHTML(title)}" />`)
    .replace(/<meta name="twitter:description" content=".*?"\s*\/?>/s, `<meta name="twitter:description" content="${escapeHTML(guide.description)}" />`)
    .replace("</head>", `    ${extraMetadata}\n  </head>`);
}

const template = await readFile(path.join(distDirectory, "index.html"), "utf8");
const catalog = JSON.parse(await readFile(path.join(distDirectory, "guides", "catalog.json"), "utf8"));

for (const guide of catalog.guides) {
  const html = renderGuidePage(template, guide);
  for (const slug of [guide.id, ...guide.aliases]) {
    const destination = routeOutputPath(slug);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html);
  }
}
