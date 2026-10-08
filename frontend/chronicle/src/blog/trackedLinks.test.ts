import { describe, expect, it } from "vitest";
import { blogPostLink } from "./trackedLinks";

describe("blogPostLink", () => {
  it("tags links to other Chronicle properties", () => {
    expect(blogPostLink("guild-pages", "https://capy.chronicleclassic.com/g/abc", "turtle")).toBe(
      "https://capy.chronicleclassic.com/g/abc?chr_src=turtle&chr_pos=blog_post_inline&chr_cmp=guild_pages",
    );
  });

  it("preserves existing query parameters and fragments", () => {
    expect(blogPostLink("consumables-panel", "https://octo.chronicleclassic.com/i/1?explain=ledger#top", "turtle")).toBe(
      "https://octo.chronicleclassic.com/i/1?explain=ledger&chr_src=turtle&chr_pos=blog_post_inline&chr_cmp=consumables_panel#top",
    );
  });

  it("leaves same-site, third-party, and asset links unchanged", () => {
    for (const href of ["/talents", "https://www.youtube.com/watch?v=x", "https://icons.chronicleclassic.com/turtle/a.webp"]) {
      expect(blogPostLink("parsing", href, "turtle")).toBe(href);
    }
  });
});
