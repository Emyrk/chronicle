import { describe, expect, it } from "vitest";
import template from "../../index.html?raw";
import { withBlogMetadata } from "./blogHead";

function render() {
  return withBlogMetadata(template, {
    html: "<article>Replay</article>",
    title: `Replay "fights" · Chronicle Journal`,
    description: "Watch <every> pull & wipe again.",
  });
}

describe("withBlogMetadata", () => {
  it("leaves the single templated canonical and og:url for the server to fill", () => {
    const html = render();

    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="{{ .CanonicalURL }}" />');
    expect(html.match(/<meta property="og:url"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:url" content="{{ .CanonicalURL }}" />');
  });

  it("writes the post title and summary to the title, Open Graph and Twitter tags", () => {
    const html = render();
    const title = "Replay &quot;fights&quot; · Chronicle Journal";
    const description = "Watch &lt;every&gt; pull &amp; wipe again.";

    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<meta name="description" content="${description}" />`);
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
    expect(html).toContain(`<meta property="og:description" content="${description}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${title}" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${description}" />`);
    expect(html).toContain('<div id="root"><article>Replay</article></div>');
    expect(html).toContain("window.__CHRONICLE_BLOG_FLAVOR__");
  });

  it("fails the build when the template loses a tag it rewrites", () => {
    const broken = template.replace(/<meta name="twitter:title"[^>]*>/, "");
    expect(() => withBlogMetadata(broken, { html: "", title: "t", description: "d" })).toThrow(/twitter:title/);
  });
});
