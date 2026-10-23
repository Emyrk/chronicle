import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import {
  BLOG_POSTS,
  blogPostMatchesFlavor,
  createBlogPosts,
  type BlogPostDefinition,
  type BlogPostMetadata,
} from "./blogRegistry";

const TestComponent: ComponentType<{ post: BlogPostDefinition }> = () => null;

const baseMetadata: BlogPostMetadata = {
  id: "test",
  title: "Test",
  description: "Test post",
  publishedAt: "2026-10-08",
  rarity: "common",
  tag: "Docs",
  icon: "inv_misc_book_09",
};

const basePost: BlogPostDefinition = {
  ...baseMetadata,
  component: TestComponent,
};

describe("blog registry", () => {
  it("hydrates every JSON metadata item with its runtime component", () => {
    expect(BLOG_POSTS).toHaveLength(19);
    expect(new Set(BLOG_POSTS.map((post) => post.id)).size).toBe(BLOG_POSTS.length);
    expect(BLOG_POSTS.every((post) => typeof post.component === "function")).toBe(true);
  });

  it("rejects duplicate metadata IDs", () => {
    expect(() => createBlogPosts(
      [baseMetadata, baseMetadata],
      { test: TestComponent },
    )).toThrow("Duplicate blog post ID: test");
  });

  it("rejects metadata without a component mapping", () => {
    expect(() => createBlogPosts([baseMetadata], {})).toThrow("Blog post test has no component mapping");
  });

  it("rejects orphan component mappings", () => {
    expect(() => createBlogPosts(
      [baseMetadata],
      { test: TestComponent, orphan: TestComponent },
    )).toThrow("Blog component mapping orphan has no metadata");
  });

  it("rejects empty required metadata", () => {
    expect(() => createBlogPosts(
      [{ ...baseMetadata, title: "" }],
      { test: TestComponent },
    )).toThrow("Blog post test has an empty or invalid title");
  });
});

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
