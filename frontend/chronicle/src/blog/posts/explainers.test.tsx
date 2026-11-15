import { describe, expect, it } from "vitest";
import { blogPostMatchesFlavor, findBlogPost } from "../blogRegistry";
import { prerenderBlogPages } from "../prerender";

const pages = new Map(prerenderBlogPages().map((page) => [page.path, page]));

function page(path: string) {
  const found = pages.get(path);
  if (!found) throw new Error(`missing prerendered page ${path}`);
  return found;
}

describe("explainer posts", () => {
  it.each([
    ["/blog/parses-and-ratings-explained", "A Chronicle parse is a 0 to 100 score for one boss kill"],
    ["/blog/speedrun-rules", "A raid clear counts as a Chronicle speedrun when one log shows every required boss"],
    ["/blog/turtle-wow-forks", "Turtle WoW itself closed in May 2026"],
  ])("prerenders %s with its answer-first lead and /stats links", (path, lead) => {
    const rendered = page(path);
    expect(rendered.html).toContain(lead);
    expect(rendered.html).toContain('href="/stats');
    expect(rendered.title).toMatch(/\? · Chronicle Journal$/);
  });

  it("states the scoring rules the code uses", () => {
    const html = page("/blog/parses-and-ratings-explained").html;
    expect(html).toContain("60 days");
    expect(html).toContain("at least 5 comparable kills");
    expect(html).toContain("30% Peak, 50% Form and 20% Floor");
  });

  it("shows the Turtle fork post only on servers with Turtle content", () => {
    const post = findBlogPost("turtle-wow-forks")!;
    expect(blogPostMatchesFlavor(post, ["vanilla", "turtle", "nightmare-of-ursol"])).toBe(true);
    expect(blogPostMatchesFlavor(post, ["vanilla", "nightmare-of-ursol", "octowow"])).toBe(true);
    expect(blogPostMatchesFlavor(post, ["vanilla", "wow-forever"])).toBe(false);
    expect(blogPostMatchesFlavor(post, ["wrath", "azerothcore"])).toBe(false);
  });

  it("shows the parse and speedrun explainers everywhere", () => {
    for (const id of ["parses-and-ratings-explained", "speedrun-rules"]) {
      expect(blogPostMatchesFlavor(findBlogPost(id)!, ["wrath", "azerothcore"])).toBe(true);
      expect(blogPostMatchesFlavor(findBlogPost(id)!, ["vanilla", "wow-forever"])).toBe(true);
    }
  });
});
