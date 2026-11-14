import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogInteractions } from "./BlogInteractions";

describe("blog interaction prerendering", () => {
  it("never needs session or query providers during static rendering", () => {
    for (const enabled of [false, true]) {
      const markup = renderToStaticMarkup(<BlogInteractions post={{ id: "test", title: "Test", description: "", publishedAt: "2026-01-01", rarity: "common", tag: "Docs", icon: "book", votingEnabled: enabled, feedbackEnabled: enabled }} />);
      expect(markup).toBe("");
    }
  });
});
