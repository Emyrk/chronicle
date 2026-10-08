import { describe, expect, it } from "vitest";
import { blogPostMatchesFlavor, type BlogPostDefinition } from "./blogRegistry";

const basePost: BlogPostDefinition = {
  id: "test",
  title: "Test",
  description: "Test post",
  publishedAt: "2026-10-08",
  component: () => null,
};

describe("blogPostMatchesFlavor", () => {
  it("allows posts without flavor restrictions", () => {
    expect(blogPostMatchesFlavor(basePost, ["wrath"])).toBe(true);
  });

  it("requires every tag in at least one flavor set", () => {
    const post = { ...basePost, flavorSets: [["vanilla", "turtle"], ["wrath", "epoch"]] };

    expect(blogPostMatchesFlavor(post, ["vanilla", "turtle", "nightmare-of-ursol"])).toBe(true);
    expect(blogPostMatchesFlavor(post, ["wrath", "epoch"])).toBe(true);
    expect(blogPostMatchesFlavor(post, ["vanilla"])).toBe(false);
  });

  it("matches flavor tags case-insensitively", () => {
    const post = { ...basePost, flavorSets: [["Turtle"]] };
    expect(blogPostMatchesFlavor(post, ["turtle"])).toBe(true);
  });
});
