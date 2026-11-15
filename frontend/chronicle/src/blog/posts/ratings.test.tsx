import { describe, expect, it } from "vitest";
import { prerenderBlogPages } from "../prerender";

// The announcement post is crawlable and quoted, so it follows the same facts as
// the /ratings page and the parses-and-ratings explainer.
describe("ratings announcement post", () => {
  const html = prerenderBlogPages().find((page) => page.path === "/blog/ratings")!.html.replace(/&#x27;|&#39;|&apos;/g, "'");

  it("does not say Renown only goes up", () => {
    expect(html).not.toContain("Renown only goes up");
    expect(html).toContain("it can drop if a log is removed or awards change");
    expect(html).toContain("Renown can go down as well");
  });

  it("says only bosses on the Renown list earn Renown", () => {
    expect(html).toContain("Bosses on the Renown list have an award");
    expect(html).not.toContain("Every boss has a Renown award");
  });

  it("limits HPS to healing specs", () => {
    expect(html).toContain("Healing specs count whichever is higher");
    expect(html).toContain("every other spec always counts as DPS");
  });
});
