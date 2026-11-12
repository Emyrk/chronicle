export interface BlogHeadPage {
  html: string;
  title: string;
  description: string;
}

export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string): string {
  if (!pattern.test(html)) {
    throw new Error(`Blog prerender: index.html is missing ${label}`);
  }
  return html.replace(pattern, () => replacement);
}

function metaPattern(attribute: "name" | "property", key: string): RegExp {
  return new RegExp(`<meta ${attribute}="${key}" content=".*?"\\s*\\/?>`, "s");
}

/**
 * Bakes a blog page's title, description and markup into the Go-templated index.html.
 *
 * The canonical link and og:url stay as template tags: the server fills them with the
 * absolute URL for the requesting host, and adds the BlogPosting JSON-LD from the manifest.
 */
export function withBlogMetadata(template: string, page: BlogHeadPage): string {
  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);
  const flavorBootstrap = `<script>window.__CHRONICLE_BLOG_FLAVOR__ = {{ if .BlogFlavorJSON }}{{ .BlogFlavorJSON }}{{ else }}[]{{ end }};</script>`;

  let html = replaceOnce(template, /<div id="root"><\/div>/, `<div id="root">${page.html}</div>`, "the root element");
  html = replaceOnce(html, /<title>.*?<\/title>/s, `<title>${title}</title>`, "<title>");
  html = replaceOnce(html, metaPattern("name", "description"), `<meta name="description" content="${description}" />`, "meta description");
  html = replaceOnce(html, metaPattern("property", "og:title"), `<meta property="og:title" content="${title}" />`, "og:title");
  html = replaceOnce(html, metaPattern("property", "og:description"), `<meta property="og:description" content="${description}" />`, "og:description");
  html = replaceOnce(html, metaPattern("name", "twitter:title"), `<meta name="twitter:title" content="${title}" />`, "twitter:title");
  html = replaceOnce(html, metaPattern("name", "twitter:description"), `<meta name="twitter:description" content="${description}" />`, "twitter:description");
  return replaceOnce(html, /<\/head>/, `    ${flavorBootstrap}\n  </head>`, "</head>");
}
